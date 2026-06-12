import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import type {
  ThirdPartyService,
  ServiceCategory,
  ServiceDetectionMethod,
  ServiceEvidence,
} from "./types.js";

/**
 * Third-party service detector.
 *
 * Unlike the AST flow analyzer (which only confirms a service when a user-input
 * source can be traced into the call), this pass flags any *sign* that the app
 * integrates an external service: a provider domain, a provider API-key env-var
 * name, or a provider SDK import — in any file, including Deno edge functions
 * under `supabase/functions/**`, `.env*`, and config.
 *
 * This is deliberately capability-aware: for GDPR, the mere fact that the code
 * is wired to send data to (say) ElevenLabs or OpenAI is worth surfacing for
 * human review, because it is a likely transfer to a third party / overseas.
 */

interface ProviderDef {
  name: string;
  category: ServiceCategory;
  isAI: boolean;
  // Matched against file contents (domains in URLs, or env-var key names).
  domains?: RegExp;
  envVars?: RegExp;
  // Matched against import specifiers / dependency names.
  packages?: RegExp;
}

const PROVIDERS: ProviderDef[] = [
  // ── AI / LLM / speech ──
  { name: "OpenAI", category: "AI/LLM", isAI: true, domains: /api\.openai\.com/i, envVars: /\bOPENAI_API_KEY\b/, packages: /^openai$|^@openai\//i },
  { name: "Anthropic", category: "AI/LLM", isAI: true, domains: /api\.anthropic\.com/i, envVars: /\bANTHROPIC_API_KEY\b/, packages: /^@anthropic-ai\//i },
  { name: "Google Gemini", category: "AI/LLM", isAI: true, domains: /generativelanguage\.googleapis\.com/i, envVars: /\b(GEMINI|GOOGLE_GENAI|GOOGLE_AI)_API_KEY\b/, packages: /^@google\/(generative-ai|genai)$/i },
  { name: "Cohere", category: "AI/LLM", isAI: true, domains: /api\.cohere\.(ai|com)/i, envVars: /\bCOHERE_API_KEY\b/, packages: /^cohere-ai$|^@cohere-ai\//i },
  { name: "Mistral", category: "AI/LLM", isAI: true, domains: /api\.mistral\.ai/i, envVars: /\bMISTRAL_API_KEY\b/, packages: /^@mistralai\//i },
  { name: "Groq", category: "AI/LLM", isAI: true, domains: /api\.groq\.com/i, envVars: /\bGROQ_API_KEY\b/, packages: /^groq-sdk$/i },
  { name: "Hugging Face", category: "AI/LLM", isAI: true, domains: /api-inference\.huggingface\.co|huggingface\.co/i, envVars: /\b(HUGGINGFACE|HF)_API_KEY\b|\bHF_TOKEN\b/, packages: /^@huggingface\//i },
  { name: "Replicate", category: "AI/LLM", isAI: true, domains: /api\.replicate\.com/i, envVars: /\bREPLICATE_API_TOKEN\b/, packages: /^replicate$/i },
  { name: "OpenRouter", category: "AI/LLM", isAI: true, domains: /openrouter\.ai/i, envVars: /\bOPENROUTER_API_KEY\b/ },
  { name: "ElevenLabs", category: "AI/LLM", isAI: true, domains: /api\.elevenlabs\.io|elevenlabs\.io/i, envVars: /\bELEVENLABS?_API_KEY\b|\bELEVEN_LABS_API_KEY\b/, packages: /^elevenlabs$|^@elevenlabs\//i },
  { name: "Deepgram", category: "AI/LLM", isAI: true, domains: /api\.deepgram\.com/i, envVars: /\bDEEPGRAM_API_KEY\b/, packages: /^@deepgram\//i },
  { name: "AssemblyAI", category: "AI/LLM", isAI: true, domains: /api\.assemblyai\.com/i, envVars: /\bASSEMBLYAI_API_KEY\b/, packages: /^assemblyai$/i },
  { name: "Perplexity", category: "AI/LLM", isAI: true, domains: /api\.perplexity\.ai/i, envVars: /\bPERPLEXITY_API_KEY\b/ },

  // ── Cloud data / storage / backend ──
  { name: "Supabase", category: "Cloud data/storage", isAI: false, domains: /supabase\.co|supabase\.in/i, envVars: /\bSUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY|KEY)\b|\bVITE_SUPABASE_/, packages: /^@supabase\//i },
  { name: "Firebase", category: "Cloud data/storage", isAI: false, domains: /firebaseio\.com|firebaseapp\.com|firestore\.googleapis\.com/i, envVars: /\bFIREBASE_/, packages: /^firebase$|^firebase-admin$/i },
  { name: "AWS", category: "Cloud data/storage", isAI: false, domains: /amazonaws\.com/i, envVars: /\bAWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)\b/, packages: /^@aws-sdk\/|^aws-sdk$/i },
  // Narrow to data/storage subdomains — bare googleapis.com also covers Google
  // Fonts/Maps, which are not data-storage services and would be false positives.
  { name: "Google Cloud", category: "Cloud data/storage", isAI: false, domains: /storage\.googleapis\.com|firestore\.googleapis\.com|\w+\.run\.app|run\.googleapis\.com/i, packages: /^@google-cloud\//i },
  { name: "Azure", category: "Cloud data/storage", isAI: false, domains: /\.azure\.com|blob\.core\.windows\.net/i, envVars: /\bAZURE_/, packages: /^@azure\//i },
  { name: "MongoDB Atlas", category: "Cloud data/storage", isAI: false, domains: /mongodb\.net/i, envVars: /\bMONGODB_URI\b|\bMONGO_URL\b/ },
  { name: "Neon", category: "Cloud data/storage", isAI: false, domains: /neon\.tech/i, packages: /^@neondatabase\//i },
  { name: "PlanetScale", category: "Cloud data/storage", isAI: false, domains: /psdb\.cloud|planetscale\.com/i, packages: /^@planetscale\//i },

  // ── Payments ──
  { name: "Stripe", category: "Payments", isAI: false, domains: /api\.stripe\.com/i, envVars: /\bSTRIPE_(SECRET_KEY|API_KEY|PUBLISHABLE_KEY)\b/, packages: /^stripe$|^@stripe\//i },
  { name: "PayPal", category: "Payments", isAI: false, domains: /api\.paypal\.com|api-m\.paypal\.com/i, envVars: /\bPAYPAL_/, packages: /^@paypal\//i },

  // ── Email / comms ──
  { name: "SendGrid", category: "Email/Comms", isAI: false, domains: /api\.sendgrid\.com/i, envVars: /\bSENDGRID_API_KEY\b/, packages: /^@sendgrid\//i },
  { name: "Mailgun", category: "Email/Comms", isAI: false, domains: /api\.mailgun\.net/i, envVars: /\bMAILGUN_/, packages: /^mailgun/i },
  { name: "Resend", category: "Email/Comms", isAI: false, domains: /api\.resend\.com/i, envVars: /\bRESEND_API_KEY\b/, packages: /^resend$/i },
  { name: "Postmark", category: "Email/Comms", isAI: false, domains: /api\.postmarkapp\.com/i, envVars: /\bPOSTMARK_/, packages: /^postmark$/i },
  { name: "Twilio", category: "Email/Comms", isAI: false, domains: /api\.twilio\.com/i, envVars: /\bTWILIO_(ACCOUNT_SID|AUTH_TOKEN)\b/, packages: /^twilio$/i },

  // ── Analytics ──
  { name: "Segment", category: "Analytics", isAI: false, domains: /api\.segment\.io/i, packages: /^@segment\//i },
  { name: "Mixpanel", category: "Analytics", isAI: false, domains: /api\.mixpanel\.com/i, envVars: /\bMIXPANEL_/, packages: /^mixpanel(-browser)?$/i },
  { name: "PostHog", category: "Analytics", isAI: false, domains: /posthog\.com/i, envVars: /\bPOSTHOG_/, packages: /^posthog-(js|node)$/i },
  { name: "Amplitude", category: "Analytics", isAI: false, domains: /amplitude\.com/i, packages: /^@amplitude\/|^amplitude-js$/i },
  { name: "Google Analytics", category: "Analytics", isAI: false, domains: /google-analytics\.com|googletagmanager\.com/i, packages: /^react-ga|^gtag$/i },

  // ── Monitoring / logging ──
  { name: "Sentry", category: "Monitoring/Logging", isAI: false, domains: /sentry\.io|ingest\.sentry\.io/i, envVars: /\bSENTRY_DSN\b/, packages: /^@sentry\//i },
  { name: "Datadog", category: "Monitoring/Logging", isAI: false, domains: /datadoghq\.com/i, envVars: /\bDD_API_KEY\b/, packages: /^dd-trace$|^datadog-/i },
];

// Region hints we *can* sometimes read from the repo (rare — usually not present).
const REGION_HINT = /\b((?:us|eu|ap|ca|sa|af|me)-(?:east|west|central|south|north|northeast|southeast)-\d|europe-\w+\d|us-\w+\d)\b/i;

// ─── Generic "any outbound integration" detection ──────────────────────────────
// Catches services NOT in the registry above, so the report never misses "data
// may be going somewhere we don't recognise."

// An env-var name that looks like a third-party credential or endpoint.
const GENERIC_CREDENTIAL =
  /\b([A-Z][A-Z0-9]{1,30})_(API_KEY|APIKEY|SECRET_KEY|SECRET|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET|CLIENT_ID|WEBHOOK_URL|WEBHOOK|DSN|ACCESS_KEY_ID|PRIVATE_KEY|BEARER_TOKEN|API_TOKEN|API_URL|API_ENDPOINT|BASE_URL)\b/g;

// Prefixes that are internal app secrets / framework noise, not a third party.
const INTERNAL_PREFIX =
  /^(NODE|VITE|NEXT|NUXT|REACT_APP|PUBLIC|APP|DATABASE|DB|POSTGRES|MYSQL|REDIS|JWT|SESSION|COOKIE|CSRF|ENCRYPTION|HASH|SALT|ADMIN|INTERNAL|SERVER|CLIENT|PORT|HOST|BASE|NEXTAUTH|AUTH|TEST|CI|GITHUB_TOKEN)$/;

// A line that is making an outbound network call.
const NETWORK_CALL = /\b(fetch|axios|http\.(get|post|request)|https\.(get|post|request)|XMLHttpRequest|\.get\(|\.post\(|got\(|ky\.|superagent|node-fetch)\b/;
const URL_IN_LINE = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;

// Hosts that are not data destinations (CDNs, fonts, schemas, registries, docs).
const EXCLUDED_HOSTS =
  /(^|\.)(w3\.org|schema\.org|json-schema\.org|github\.com|githubusercontent\.com|gitlab\.com|npmjs\.(org|com)|jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|jquery\.com|bootstrapcdn\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|gstatic\.com|tailwindcss\.com|localhost|example\.(com|org|net)|127\.0\.0\.1|0\.0\.0\.0|reactjs\.org|vitejs\.dev|nodejs\.org|mozilla\.org|wikipedia\.org|placeholder\.com|placehold\.co|via\.placeholder\.com|gravatar\.com|googleapis\.com|vercel\.app|netlify\.app)$/i;

const MAX_GENERIC_HOSTS = 12;

function isKnownProviderHost(host: string): boolean {
  return PROVIDERS.some((p) => p.domains?.test(host));
}

const SKIP_DIRS = ["node_modules", ".git", "dist", "build", ".next", "coverage", "__pycache__"];
const BINARY_EXTS = new Set([
  ".map", ".lock", ".sum", ".mod",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
  ".woff", ".woff2", ".ttf", ".eot",
  ".zip", ".gz", ".tar", ".pdf", ".docx", ".xlsx",
]);

const MAX_EVIDENCE_PER_SERVICE = 3;

export async function detectServices(repoPath: string): Promise<ThirdPartyService[]> {
  // `dot: true` so `.env*` and other dotfiles are scanned.
  const files = await glob("**/*", {
    cwd: repoPath,
    nodir: true,
    dot: true,
    ignore: SKIP_DIRS.map((d) => `**/${d}/**`),
    absolute: false,
  });

  const scanFiles = files.filter((f) => !BINARY_EXTS.has(path.extname(f).toLowerCase()));

  // provider name -> accumulating record
  const acc = new Map<string, ThirdPartyService>();

  function record(
    def: ProviderDef,
    via: ServiceDetectionMethod,
    ev: ServiceEvidence,
    regionHint?: string,
  ): void {
    let svc = acc.get(def.name);
    if (!svc) {
      svc = {
        name: def.name,
        category: def.category,
        isAI: def.isAI,
        detectedVia: [],
        evidence: [],
        residencyKnown: false,
      };
      acc.set(def.name, svc);
    }
    if (!svc.detectedVia.includes(via)) svc.detectedVia.push(via);
    if (svc.evidence.length < MAX_EVIDENCE_PER_SERVICE) svc.evidence.push(ev);
    if (regionHint && !svc.regionHint) {
      svc.regionHint = regionHint;
      svc.residencyKnown = true;
    }
  }

  // Generic (unrecognised) integrations: external domains called by the code, and
  // credential-shaped env vars that don't belong to a known provider.
  const genericHosts = new Map<string, ServiceEvidence>();
  const genericCreds = new Map<string, ServiceEvidence>();

  for (const relFile of scanFiles) {
    const absFile = path.join(repoPath, relFile);
    let content: string;
    try {
      content = await fs.readFile(absFile, "utf-8");
    } catch {
      continue;
    }
    // Files with a Unicode replacement char are almost certainly binary that
    // slipped past the extension filter — skip to avoid noise.
    if (content.includes("�")) continue;

    const isPackageJson = path.basename(relFile) === "package.json";
    let pkgDeps: string[] = [];
    if (isPackageJson) {
      try {
        const pkg = JSON.parse(content) as Record<string, Record<string, string>>;
        pkgDeps = [
          ...Object.keys(pkg.dependencies ?? {}),
          ...Object.keys(pkg.devDependencies ?? {}),
        ];
      } catch {
        /* ignore unparseable package.json */
      }
    }

    const lines = content.split("\n");
    // Lines a known provider claimed — excluded from the generic pass below.
    const claimedLines = new Set<number>();

    for (const def of PROVIDERS) {
      // Dependency match (root or nested package.json)
      if (isPackageJson && def.packages) {
        const hit = pkgDeps.find((d) => def.packages!.test(d));
        if (hit) {
          record(def, "dependency", { file: relFile, line: 1, snippet: `dependency: ${hit}` });
        }
      }

      // Per-line domain / env-var / import-specifier match
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.length > 2000) continue;
        const region = REGION_HINT.test(line) ? (line.match(REGION_HINT)?.[1] ?? undefined) : undefined;

        if (def.domains && def.domains.test(line)) {
          record(def, "endpoint", { file: relFile, line: i + 1, snippet: line.trim().slice(0, 160) }, region);
          claimedLines.add(i);
        }
        if (def.envVars && def.envVars.test(line)) {
          record(def, "env-var", { file: relFile, line: i + 1, snippet: line.trim().slice(0, 160) }, region);
          claimedLines.add(i);
        }
        // Deno / esm.sh / npm: import specifiers in code (not package.json)
        if (!isPackageJson && def.packages && /\b(import|require|from)\b/.test(line) && def.packages.test(line)) {
          record(def, "dependency", { file: relFile, line: i + 1, snippet: line.trim().slice(0, 160) });
        }
      }
    }

    // ── Generic pass: unrecognised hosts and credential env vars ──────────────
    if (!isPackageJson) {
      for (let i = 0; i < lines.length; i++) {
        if (claimedLines.has(i)) continue;
        const line = lines[i]!;
        if (line.length > 2000) continue;

        // External domains in outbound-call lines
        if (NETWORK_CALL.test(line)) {
          URL_IN_LINE.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = URL_IN_LINE.exec(line)) !== null) {
            const host = (m[1] ?? "").toLowerCase();
            if (!host || EXCLUDED_HOSTS.test(host) || isKnownProviderHost(host)) continue;
            if (!genericHosts.has(host) && genericHosts.size < MAX_GENERIC_HOSTS) {
              genericHosts.set(host, { file: relFile, line: i + 1, snippet: line.trim().slice(0, 160) });
            }
          }
        }

        // Credential-shaped env vars not owned by a known provider
        GENERIC_CREDENTIAL.lastIndex = 0;
        let cm: RegExpExecArray | null;
        while ((cm = GENERIC_CREDENTIAL.exec(line)) !== null) {
          const prefix = cm[1] ?? "";
          if (!prefix || INTERNAL_PREFIX.test(prefix)) continue;
          if (!genericCreds.has(prefix)) {
            genericCreds.set(prefix, { file: relFile, line: i + 1, snippet: line.trim().slice(0, 160) });
          }
        }
      }
    }
  }

  // Build a single "unrecognised credentials" entry, and one entry per unknown
  // external host, so the report can say where data may be going.
  if (genericCreds.size > 0) {
    const evidence = [...genericCreds.values()].slice(0, MAX_EVIDENCE_PER_SERVICE);
    const names = [...genericCreds.keys()].slice(0, 8).join(", ");
    acc.set("__generic_creds__", {
      name: `Unrecognised API credentials (${names})`,
      category: "Other third-party",
      isAI: false,
      detectedVia: ["env-var"],
      evidence,
      residencyKnown: false,
    });
  }
  for (const [host, ev] of genericHosts) {
    if (acc.has(`host:${host}`)) continue;
    acc.set(`host:${host}`, {
      name: host,
      category: "Other third-party",
      isAI: false,
      detectedVia: ["endpoint"],
      evidence: [ev],
      residencyKnown: false,
    });
  }

  return [...acc.values()];
}
