import Anthropic from "@anthropic-ai/sdk";
import type { RepoIndex, ClarifyingQuestion } from "@workspace/gdpr-scanner";
import { logger } from "./logger.js";

const MODEL = process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-6";

/**
 * Build a compact digest of the scan findings to give the model context without
 * dumping the whole index.
 */
function findingsDigest(index: RepoIndex): string {
  const a = index.auditSummary;
  const flows = index.verifiedFlows
    .slice(0, 20)
    .map((f) => `- ${f.source} → ${f.sink}${f.isAI ? " (AI)" : ""}${f.tags?.length ? ` [${f.tags.join(", ")}]` : ""}`)
    .join("\n");
  const services = (a.thirdPartyServices ?? [])
    .map((s) => `- ${s.name} (${s.category}${s.isAI ? ", AI" : ""})`)
    .join("\n");
  const triggers = (a.dpiaScreening?.detectedTriggers ?? []).map((t) => `- ${t}`).join("\n");
  const media = a.mediaCapture?.detected ? "Yes — camera/microphone capture detected" : "No";

  return [
    `Repository: ${index.repo}`,
    `Overall rating: ${index.summary.riskLevel} (score ${index.summary.gdprScore}/100)`,
    `Confirmed data flows:\n${flows || "- none"}`,
    `Third-party services:\n${services || "- none"}`,
    `Camera/microphone capture: ${media}`,
    `Auto-detected DPIA triggers:\n${triggers || "- none"}`,
  ].join("\n\n");
}

interface RawQuestion {
  question?: unknown;
  escalatesTo?: unknown;
  dpiaTrigger?: unknown;
}

/**
 * Ask Anthropic to produce a short set of yes/no screening questions tailored to
 * BOTH the app description and the scan findings. Returns [] on any failure so
 * the caller falls back to the built-in rule-based questions.
 */
export async function generateScreeningQuestions(
  description: string,
  index: RepoIndex,
): Promise<ClarifyingQuestion[]> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || !description.trim()) return [];

  const system =
    "You are a UK GDPR data-protection officer assisting a non-technical college staff member. " +
    "You are given a plain-English description of an app and the results of an automated code scan. " +
    "Produce a SHORT set (3 to 6) of specific yes/no screening questions whose answers would resolve " +
    "the biggest remaining GDPR uncertainties for THIS app. Each question must be concrete and reference " +
    "the app's actual context (not generic boilerplate), be answerable yes/no by a non-technical person, " +
    "and map to a DPIA screening concern. " +
    'Return ONLY a JSON array, no prose, where each item is {"question": string, "escalatesTo": "HIGH"|"MEDIUM", "dpiaTrigger": string}. ' +
    '"escalatesTo" is "HIGH" when a "yes" answer would indicate higher-risk processing.';

  const user =
    `App description (from the team):\n${description.trim().slice(0, 4000)}\n\n` +
    `Automated scan findings:\n${findingsDigest(index)}`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    // Extract the JSON array even if the model wrapped it in prose/code fences.
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    const parsed = JSON.parse(text.slice(start, end + 1)) as RawQuestion[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((q) => typeof q.question === "string" && (q.question as string).trim())
      .slice(0, 6)
      .map((q, i) => ({
        id: `ai-${i + 1}`,
        question: (q.question as string).trim(),
        escalatesTo: q.escalatesTo === "MEDIUM" ? "MEDIUM" : "HIGH",
        dpiaTrigger:
          typeof q.dpiaTrigger === "string" && q.dpiaTrigger.trim()
            ? (q.dpiaTrigger as string).trim()
            : "Tailored screening question",
      }));
  } catch (err) {
    logger.warn({ err }, "AI screening-question generation failed; using rule-based questions");
    return [];
  }
}
