import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import * as parser from "@babel/parser";
import type { Finding, RiskCategory, VerifiedFlow, DataType, RiskTag, AIProvider } from "./types.js";

const SKIP_DIRS = ["node_modules", ".git", "dist", "build", ".next", "coverage"];
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// ─── Internal types ────────────────────────────────────────────────────────────

interface SourceRef {
  expr: string;      // e.g. "req.body.email" or "e.target.value" or "field_evidence:email"
  field: string;     // e.g. "email" — last property name (empty = unspecified)
  varName: string;   // variable it was assigned to, or ""
  dataType: DataType;
  line: number;
  kind: "server" | "client-dom" | "field-evidence";
}

interface SinkRef {
  name: string;      // e.g. "fs.writeFile" or "supabase.insert"
  category: RiskCategory;
  argStr: string;    // all arguments stringified for matching
  line: number;
  evidence: string;
  isAI?: boolean;            // sink is an AI/LLM provider call or endpoint
  aiProvider?: AIProvider;   // best-effort provider attribution
}

interface FileAnalysis {
  findings: InternalFinding[];
  verifiedFlows: VerifiedFlow[];
}

interface InternalFinding {
  type: string;
  category: RiskCategory;
  line: number;
  evidence: string;
  riskScore: number;
}

type ASTNode = Record<string, unknown> & {
  type?: string;
  loc?: { start: { line: number } };
};

// ─── Data classification ───────────────────────────────────────────────────────

const IDENTIFIABLE_FIELDS = /^(email|emailAddress|name|firstName|lastName|fullName|userId|user_id|username|phoneNumber|phone|address|ip|ipAddress|ssn|passport|dob|birthDate|nationalId|taxId|studentId|student_id|uniqueId|unique_id|teacherId|teacher_id)$/i;
const BEHAVIOURAL_FIELDS = /^(click|pageview|session|duration|score|confidence|preferences|behaviour|behavior|event|impression)$/i;
const TECHNICAL_FIELDS = /^(token|apiKey|secret|config|metadata|headers|hash|signature)$/i;

// Also used for field-evidence matching (needs to be an array)
const IDENTIFIABLE_FIELD_LIST = [
  "email", "emailAddress", "name", "firstName", "lastName", "fullName",
  "userId", "user_id", "username", "phoneNumber", "phone", "address",
  "ip", "ipAddress", "ssn", "passport", "dob", "birthDate", "nationalId",
  "taxId", "studentId", "student_id", "uniqueId", "unique_id",
  "teacherId", "teacher_id",
];

function classifyField(field: string): DataType {
  if (!field) return "UNKNOWN";
  if (IDENTIFIABLE_FIELDS.test(field)) return "IDENTIFIABLE";
  if (BEHAVIOURAL_FIELDS.test(field)) return "BEHAVIOURAL";
  if (TECHNICAL_FIELDS.test(field)) return "TECHNICAL";
  return "UNKNOWN";
}

// ─── Sensitivity overlay (special-category & children's data) ──────────────────
//
// These map onto DPIA screening triggers: special-category data (GDPR Art. 9)
// and processing of children's / vulnerable people's data both push a finding
// toward "DPIA required". Detection is heuristic on field/key names — a match is
// a strong prompt to review, not proof. Word-boundary matched against argStr.
const SPECIAL_CATEGORY_HINTS =
  /\b(health|medical|diagnosis|condition|disability|disabilities|sen\b|ehcp|allerg\w*|medication|nhs|patient|ethnic\w*|race|racial|religion|religious|faith|biometric|fingerprint|faceid|genetic|sexual\w*|orientation|gender|pregnan\w*|mentalhealth|wellbeing|safeguarding|criminal|offence|conviction)\b/i;
const CHILDREN_HINTS =
  /\b(child|children|pupil|pupils|student|students|minor|minors|under18|under_18|dob|dateofbirth|date_of_birth|birthdate|age|yeargroup|year_group|schoolyear|guardian|parent|parentemail|parent_email|nextofkin)\b/i;

function sensitivityTags(text: string): RiskTag[] {
  const tags: RiskTag[] = [];
  if (SPECIAL_CATEGORY_HINTS.test(text)) tags.push("SPECIAL_CATEGORY_DATA");
  if (CHILDREN_HINTS.test(text)) tags.push("CHILDREN_DATA");
  return tags;
}

// ─── Source / sink detection ───────────────────────────────────────────────────

// Server-side sources: req.body.X, req.params.X, req.query.X
const REQUEST_SOURCE_PATTERNS = /^(req|request)\.(body|params|query|files|file)/;

// Client-side sources: e.target.value, event.target.files, onChange handlers
const CLIENT_SOURCE_PATTERNS = /\w+\.target\.(value|files|checked)$/;

function isRequestSource(chain: string): boolean {
  return REQUEST_SOURCE_PATTERNS.test(chain);
}

function isClientDOMSource(chain: string): boolean {
  return CLIENT_SOURCE_PATTERNS.test(chain);
}

function extractField(memberChain: string): string {
  const parts = memberChain.split(".");
  if (parts.length <= 2) return "";
  return parts[parts.length - 1] ?? "";
}

function tagsForFlow(category: RiskCategory, dataType: DataType, isAI = false): RiskTag[] {
  const tags: RiskTag[] = [];
  if (category === "persistence") {
    tags.push("USER_DATA_STORAGE");
    if (dataType === "IDENTIFIABLE") tags.push("POTENTIAL_IDENTIFIABLE_DATA");
  }
  if (category === "external-transfer") tags.push("USER_DATA_TRANSFER");
  if (category === "logging") tags.push("IDENTIFIABLE_DATA_LOGGING");
  if (isAI) tags.push("AI_PROCESSING");
  return tags;
}

// ─── AI / LLM provider sink detection ──────────────────────────────────────────
//
// Sending user data to an LLM is the single most common GDPR-relevant flow in
// the apps this tool is aimed at. It is also frequently MISSED by naive sink
// matching: `openai.chat.completions.create(...)` would otherwise be caught by
// the generic `.create` persistence rule and mislabelled as a database write.
// AI detection therefore runs BEFORE the generic sink rules.

// SDK call shapes, e.g. openai.chat.completions.create, anthropic.messages.create,
// model.generateContent, openai.responses.create, *.createChatCompletion (legacy).
const AI_METHOD_PATTERNS =
  /\.(chat\.completions\.create|completions\.create|responses\.create|embeddings\.create|images\.(generate|create)|audio\.(transcriptions|translations|speech)\.create|messages\.create|generateContent(Stream)?|sendMessage(Stream)?|createChatCompletion|createCompletion)$/;

// Generic chain/LLM invocation where the receiver clearly names an AI client.
const AI_INVOKE_PATTERN = /\.(invoke|call|run|stream|predict|generate)$/;
const AI_CLIENT_HINT =
  /(openai|anthropic|claude|cohere|replicate|gemini|generativeai|genai|generativemodel|mistral|groq|together|huggingface|hf|elevenlabs|openrouter|\bllm\b|langchain|chatmodel|chatopenai)/i;

// AI provider HTTP endpoints, matched inside fetch()/axios() arguments.
const AI_ENDPOINT_PATTERN =
  /(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.cohere\.(ai|com)|api\.elevenlabs\.io|api\.replicate\.com|openrouter\.ai|api\.mistral\.ai|api\.groq\.com|api\.together\.(xyz|ai)|api-inference\.huggingface\.co)/i;

function aiProviderFor(text: string): AIProvider {
  if (/openai|chatgpt|gpt-|chatopenai/i.test(text)) return "OpenAI";
  if (/anthropic|claude/i.test(text)) return "Anthropic";
  if (/gemini|generativelanguage|generativeai|generativemodel|googleapis/i.test(text)) return "Google Gemini";
  if (/cohere/i.test(text)) return "Cohere";
  if (/replicate/i.test(text)) return "Replicate";
  if (/mistral/i.test(text)) return "Mistral";
  if (/groq/i.test(text)) return "Groq";
  if (/huggingface|hf\b|api-inference/i.test(text)) return "Hugging Face";
  if (/elevenlabs/i.test(text)) return "ElevenLabs";
  if (/openrouter/i.test(text)) return "OpenRouter";
  return "AI provider";
}

/**
 * Returns provider attribution if `callStr`/`argStr` represent a call to an
 * AI/LLM provider (SDK method, hinted invocation, or HTTP endpoint), else null.
 */
function detectAISink(callStr: string, argStr: string): AIProvider | null {
  if (AI_METHOD_PATTERNS.test(callStr)) return aiProviderFor(callStr);
  if (AI_INVOKE_PATTERN.test(callStr) && AI_CLIENT_HINT.test(callStr)) return aiProviderFor(callStr);
  if (/^fetch$|^axios(\.\w+)?$/.test(callStr) && AI_ENDPOINT_PATTERN.test(argStr)) {
    return aiProviderFor(argStr);
  }
  return null;
}

// ─── AST utilities ─────────────────────────────────────────────────────────────

function calleeName(callee: ASTNode | undefined): string {
  if (!callee) return "";
  if (callee.type === "Identifier") return (callee.name as string) ?? "";
  if (callee.type === "MemberExpression") {
    const obj = calleeName(callee.object as ASTNode);
    const prop = callee.computed ? "" : ((callee.property as ASTNode)?.name as string) ?? "";
    return prop ? `${obj}.${prop}` : obj;
  }
  return "";
}

function memberChain(node: ASTNode | undefined): string {
  if (!node) return "";
  if (node.type === "Identifier") return (node.name as string) ?? "";
  if (node.type === "MemberExpression") {
    const obj = memberChain(node.object as ASTNode);
    const prop = node.computed ? "" : ((node.property as ASTNode)?.name as string) ?? "";
    return prop ? `${obj}.${prop}` : obj;
  }
  return "";
}

function nodeToStr(node: ASTNode | undefined): string {
  if (!node) return "";
  if (node.type === "Identifier") return (node.name as string) ?? "";
  if (node.type === "MemberExpression") return memberChain(node);
  if (node.type === "StringLiteral" || node.type === "Literal") return String(node.value ?? "");
  if (node.type === "TemplateLiteral") {
    const exprs = (node.expressions as ASTNode[] | undefined) ?? [];
    return exprs.map(nodeToStr).join(" ");
  }
  if (node.type === "ObjectExpression") {
    const props = (node.properties as ASTNode[] | undefined) ?? [];
    return props.map((p) => {
      const val = p.value as ASTNode | undefined;
      const key = (p.key as ASTNode | undefined);
      const keyStr = key ? ((key.name as string) ?? (key.value as string) ?? "") : "";
      return `${keyStr} ${nodeToStr(val)}`;
    }).join(" ");
  }
  if (node.type === "CallExpression") {
    const args = (node.arguments as ASTNode[] | undefined) ?? [];
    return args.map(nodeToStr).join(" ");
  }
  return "";
}

/**
 * Walk a node tree (including through CallExpressions) to check whether any
 * Identifier or property name matches `name`.  Used to detect whether a
 * chained call like `supabase.from("x").insert(…)` involves a known client
 * like "supabase" or "firebase".
 */
function chainContains(node: ASTNode | undefined, name: string): boolean {
  if (!node) return false;
  if (node.type === "Identifier") return ((node.name as string) ?? "") === name;
  if (node.type === "MemberExpression") {
    const propName = ((node.property as ASTNode)?.name as string) ?? "";
    return propName === name || chainContains(node.object as ASTNode, name);
  }
  if (node.type === "CallExpression") {
    return chainContains(node.callee as ASTNode, name);
  }
  return false;
}

// ─── Supabase / Firebase chained-call sink detection ──────────────────────────

const SUPABASE_CLIENTS = ["supabase", "supabaseAdmin", "supabaseClient", "client"];
const FIREBASE_CLIENTS = ["firebase", "firestore", "db", "database"];
const ALL_DB_CLIENTS = [...SUPABASE_CLIENTS, ...FIREBASE_CLIENTS];

function detectClientSink(
  callNode: ASTNode,
  argStr: string,
  line: number,
  lineText: string,
): SinkRef | null {
  const callee = callNode.callee as ASTNode | undefined;
  if (!callee || callee.type !== "MemberExpression") return null;

  const methodName = ((callee.property as ASTNode)?.name as string) ?? "";
  const obj = callee.object as ASTNode | undefined;

  // Supabase / Firebase DB writes: .insert(), .upsert(), .update()
  if (["insert", "upsert", "update"].includes(methodName)) {
    const isDbClient = ALL_DB_CLIENTS.some((c) => chainContains(obj, c));
    if (isDbClient) {
      return { name: `supabase.${methodName}`, category: "persistence", argStr, line, evidence: lineText };
    }
  }

  // Supabase storage upload: supabase.storage.from("bucket").upload(path, file)
  if (methodName === "upload") {
    const hasStorage = chainContains(obj, "storage") || chainContains(obj, "supabase");
    const hasFrom = chainContains(obj, "from");
    if (hasStorage && hasFrom) {
      return { name: "supabase.storage.upload", category: "persistence", argStr, line, evidence: lineText };
    }
  }

  // Supabase Edge Functions: supabase.functions.invoke("fn", {body: {...}})
  if (methodName === "invoke") {
    const hasFunctions = chainContains(obj, "functions") || chainContains(obj, "supabase");
    if (hasFunctions) {
      return { name: "supabase.functions.invoke", category: "external-transfer", argStr, line, evidence: lineText };
    }
  }

  // Firebase / Firestore writes: .add(), .set()
  if (["add", "set"].includes(methodName)) {
    const isFirebase = FIREBASE_CLIENTS.some((c) => chainContains(obj, c));
    if (isFirebase) {
      return { name: `firebase.${methodName}`, category: "persistence", argStr, line, evidence: lineText };
    }
  }

  return null;
}

// ─── Scope-level source/sink collection ───────────────────────────────────────

interface ScopeAccumulator {
  sources: SourceRef[];
  sinks: SinkRef[];
  varSources: Map<string, SourceRef>; // variable name → source it came from
}

function isFunctionLike(type: string): boolean {
  return (
    type === "FunctionDeclaration" ||
    type === "FunctionExpression" ||
    type === "ArrowFunctionExpression"
  );
}

/**
 * Shallow-walk a function body: collect sources and sinks but do NOT descend
 * into nested function bodies (they have their own scope).
 */
function shallowWalkScope(node: ASTNode, acc: ScopeAccumulator, lines: string[], isNested = false): void {
  if (!node || typeof node !== "object") return;

  const nodeType = (node.type as string) ?? "";
  if (isNested && isFunctionLike(nodeType)) return;

  const line = node.loc?.start?.line ?? 0;
  const lineText = line > 0 ? (lines[line - 1] ?? "").trim().slice(0, 120) : "";

  // ── Source: req.body.X, req.params.X, req.query.X (server-side) ──
  if (nodeType === "MemberExpression") {
    const chain = memberChain(node);
    if (isRequestSource(chain)) {
      const field = extractField(chain);
      acc.sources.push({
        expr: chain, field, varName: "", dataType: classifyField(field), line, kind: "server",
      });
    }
    // ── Source: e.target.value, event.target.files (client-side DOM) ──
    if (isClientDOMSource(chain)) {
      const isFile = chain.endsWith(".files");
      acc.sources.push({
        expr: chain, field: "", varName: "", dataType: isFile ? "UNKNOWN" : "UNKNOWN", line, kind: "client-dom",
      });
    }
  }

  // ── Variable assignment from server/client source ──
  if (nodeType === "VariableDeclarator") {
    const id = node.id as ASTNode | undefined;
    const init = node.init as ASTNode | undefined;
    if (id?.type === "Identifier" && init) {
      const chain = memberChain(init);
      if (isRequestSource(chain) || isClientDOMSource(chain)) {
        const varName = (id.name as string) ?? "";
        const field = extractField(chain);
        const src: SourceRef = {
          expr: chain, field, varName, dataType: classifyField(field), line,
          kind: isRequestSource(chain) ? "server" : "client-dom",
        };
        acc.sources.push(src);
        if (varName) acc.varSources.set(varName, src);
      }
    }
  }

  // ── Destructuring from server/client source ──
  if (nodeType === "VariableDeclarator") {
    const id = node.id as ASTNode | undefined;
    const init = node.init as ASTNode | undefined;
    if (id?.type === "ObjectPattern" && init) {
      const chain = memberChain(init);
      if (isRequestSource(chain) || isClientDOMSource(chain)) {
        const props = (id.properties as ASTNode[] | undefined) ?? [];
        for (const prop of props) {
          const key = prop.key as ASTNode | undefined;
          const varId = prop.value as ASTNode | undefined;
          const fieldName = (key?.name as string) ?? (key?.value as string) ?? "";
          const varName = varId?.type === "Identifier" ? ((varId.name as string) ?? "") : "";
          const src: SourceRef = {
            expr: `${chain}.${fieldName}`, field: fieldName, varName,
            dataType: classifyField(fieldName), line,
            kind: isRequestSource(chain) ? "server" : "client-dom",
          };
          acc.sources.push(src);
          if (varName) acc.varSources.set(varName, src);
        }
      }
    }
  }

  // ── Sink detection ──
  if (nodeType === "CallExpression") {
    const callee = node.callee as ASTNode | undefined;
    const callStr = calleeName(callee);
    const args = (node.arguments as ASTNode[] | undefined) ?? [];
    const argStr = args.map((a) => nodeToStr(a as ASTNode)).join(" ");

    // --- AI/LLM provider sinks (checked first: `.create` etc. would otherwise
    //     be miscaught by the generic persistence rule below) ---
    const aiProvider = detectAISink(callStr, argStr);
    if (aiProvider) {
      acc.sinks.push({ name: callStr || "ai-call", category: "external-transfer", argStr, line, evidence: lineText, isAI: true, aiProvider });
    }
    // --- Server-side sinks ---
    else if (/fs\.(writeFile|appendFile|writeFileSync|appendFileSync)\b/.test(callStr)) {
      acc.sinks.push({ name: callStr, category: "persistence", argStr, line, evidence: lineText });
    } else if (/\b(\.insert|\.insertMany|\.create|\.upsert|\.save|\.set)\b/.test(callStr) && !/Object\.create/.test(callStr)) {
      acc.sinks.push({ name: callStr, category: "persistence", argStr, line, evidence: lineText });
    } else if (/^fetch$/.test(callStr)) {
      acc.sinks.push({ name: "fetch", category: "external-transfer", argStr, line, evidence: lineText });
    } else if (/^axios(\.(get|post|put|patch|delete))?$/.test(callStr)) {
      acc.sinks.push({ name: callStr, category: "external-transfer", argStr, line, evidence: lineText });
    } else if (/\blocalStorage\.setItem\b|\bsessionStorage\.setItem\b/.test(callStr)) {
      acc.sinks.push({ name: callStr, category: "persistence", argStr, line, evidence: lineText });
    } else if (/console\.(log|warn|error|info)\b/.test(callStr)) {
      acc.sinks.push({ name: callStr, category: "logging", argStr, line, evidence: lineText });
    } else if (/logger\.(info|warn|error|debug)\b/.test(callStr)) {
      acc.sinks.push({ name: callStr, category: "logging", argStr, line, evidence: lineText });
    } else {
      // --- Client-side sinks (Supabase/Firebase chained calls) ---
      const clientSink = detectClientSink(node, argStr, line, lineText);
      if (clientSink) acc.sinks.push(clientSink);
    }
  }

  // ── Recurse into children ──
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "loc" || key === "start" || key === "end") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in item) {
          shallowWalkScope(item as ASTNode, acc, lines, true);
        }
      }
    } else if (child && typeof child === "object" && "type" in (child as object)) {
      shallowWalkScope(child as ASTNode, acc, lines, true);
    }
  }
}

// ─── Flow matching ─────────────────────────────────────────────────────────────

/**
 * For a Supabase/Firebase DB write, check if any identifiable field name
 * appears as an object key in the arguments.  Returns the first matching
 * field name, or null.
 *
 * This handles: supabase.from("t").insert({ name, email, student_id })
 * where no DOM source was traced but the field names prove personal data
 * is being stored.
 */
function findIdentifiableFieldInArgs(argStr: string): string | null {
  for (const field of IDENTIFIABLE_FIELD_LIST) {
    // Match as object key: "field " or "field:" or standalone word
    if (new RegExp(`\\b${field}\\b`, "i").test(argStr)) {
      return field;
    }
  }
  return null;
}

function matchFlows(acc: ScopeAccumulator, file: string): VerifiedFlow[] {
  const flows: VerifiedFlow[] = [];
  const seen = new Set<string>();

  // ── Pass A: direct source → sink matching ──────────────────────────────────
  if (acc.sources.length > 0 && acc.sinks.length > 0) {
    for (const source of acc.sources) {
      for (const sink of acc.sinks) {
        const matchTokens: string[] = [];
        if (source.field) matchTokens.push(source.field);
        if (source.varName) matchTokens.push(source.varName);
        if (source.expr) matchTokens.push(source.expr);

        const directConnection = matchTokens.some(
          (token) => token.length > 1 && sink.argStr.includes(token),
        );

        // req.body pass-through (no specific field)
        const bodyPassthrough =
          source.expr.endsWith(".body") &&
          (sink.argStr.includes("req.body") ||
            sink.argStr.includes("request.body") ||
            sink.argStr.includes("body"));

        // client-dom source in same scope as DB/transfer sink — lower confidence
        const clientDomToSink =
          source.kind === "client-dom" &&
          (sink.category === "persistence" || sink.category === "external-transfer");

        if (!directConnection && !bodyPassthrough && !clientDomToSink) continue;

        const confidence = directConnection ? 0.85
          : bodyPassthrough ? 0.6
          : 0.55; // client-dom in same scope without direct token match

        const dedupeKey = `${source.expr}→${sink.name}:${file}:${sink.line}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const tags = tagsForFlow(sink.category, source.dataType, sink.isAI);
        flows.push({
          source: source.expr,
          sink: sink.name,
          file,
          line: sink.line,
          evidence: sink.evidence,
          dataType: source.dataType,
          confidence,
          tags,
          isAI: sink.isAI,
          aiProvider: sink.aiProvider,
          // An AI sink whose payload we can't see still warrants a human check:
          // we can't tell from code alone whether the prompt carries personal data.
          needsReview: sink.isAI ? true : undefined,
        });
      }
    }
  }

  // ── Pass B: field-name evidence in Supabase/Firebase DB writes ─────────────
  // Even without a traced source, an identifiable field name as an object key
  // in a DB write is factual evidence that personal data is stored.
  const DB_WRITE_SINKS = ["supabase.insert", "supabase.upsert", "firebase.add", "firebase.set"];
  for (const sink of acc.sinks) {
    if (!DB_WRITE_SINKS.includes(sink.name)) continue;

    const matchedField = findIdentifiableFieldInArgs(sink.argStr);
    if (!matchedField) continue;

    const dedupeKey = `field_evidence:${matchedField}→${sink.name}:${file}:${sink.line}`;
    if (seen.has(dedupeKey)) continue;

    // Skip if we already have a higher-confidence direct-source flow for this sink+line
    const alreadyCovered = flows.some(
      (f) => f.sink === sink.name && f.file === file && f.line === sink.line,
    );
    if (alreadyCovered) continue;

    seen.add(dedupeKey);

    flows.push({
      source: `field_evidence:${matchedField}`,
      sink: sink.name,
      file,
      line: sink.line,
      evidence: sink.evidence,
      dataType: "IDENTIFIABLE",
      confidence: 0.70,
      tags: ["USER_DATA_STORAGE", "POTENTIAL_IDENTIFIABLE_DATA"],
    });
  }

  // ── Pass C: file/media upload to Supabase storage ──────────────────────────
  for (const sink of acc.sinks) {
    if (sink.name !== "supabase.storage.upload") continue;
    const dedupeKey = `file_upload→${sink.name}:${file}:${sink.line}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    flows.push({
      source: "file_upload",
      sink: sink.name,
      file,
      line: sink.line,
      evidence: sink.evidence,
      dataType: "UNKNOWN",
      confidence: 0.65,
      tags: ["USER_DATA_STORAGE"],
    });
  }

  // ── Pass D: AI/LLM provider calls in scopes that handle user input ──────────
  // Prompts are usually assembled into intermediate variables, so a direct
  // source→sink token match often fails. If an AI call sits in the same scope
  // as a user-input source (or an identifiable field appears in its arguments),
  // surface it as an AI flow that NEEDS REVIEW — we can confirm the call exists
  // and that user data is nearby, but not what the prompt actually contains.
  for (const sink of acc.sinks) {
    if (!sink.isAI) continue;

    const alreadyCovered = flows.some(
      (f) => f.file === file && f.line === sink.line && f.tags.includes("AI_PROCESSING"),
    );
    if (alreadyCovered) continue;

    const idField = findIdentifiableFieldInArgs(sink.argStr);
    const scopeSource = acc.sources[0];
    if (!idField && !scopeSource) continue; // bare AI call with no nearby user data → capability only

    const dedupeKey = `ai→${sink.name}:${file}:${sink.line}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    flows.push({
      source: idField ? `field_evidence:${idField}` : (scopeSource?.expr ?? "user input"),
      sink: sink.name,
      file,
      line: sink.line,
      evidence: sink.evidence,
      dataType: idField ? "IDENTIFIABLE" : (scopeSource?.dataType ?? "UNKNOWN"),
      confidence: 0.5,
      tags: tagsForFlow("external-transfer", idField ? "IDENTIFIABLE" : "UNKNOWN", true),
      isAI: true,
      aiProvider: sink.aiProvider,
      needsReview: true,
    });
  }

  // ── Sensitivity overlay ─────────────────────────────────────────────────────
  // Tag flows whose payload looks like special-category (Art. 9) or children's /
  // vulnerable-people's data — both are DPIA escalators. Heuristic on field/key
  // names found in the source expression, the evidence line, and call arguments.
  for (const flow of flows) {
    const sink = acc.sinks.find((s) => s.line === flow.line && s.name === flow.sink);
    const haystack = `${flow.source} ${flow.evidence} ${sink?.argStr ?? ""}`;
    for (const t of sensitivityTags(haystack)) {
      if (!flow.tags.includes(t)) flow.tags.push(t);
    }
  }

  return flows;
}

// ─── Top-level function walker ─────────────────────────────────────────────────

function* yieldFunctionNodes(node: ASTNode): Generator<ASTNode> {
  if (!node || typeof node !== "object") return;
  const nodeType = (node.type as string) ?? "";

  if (isFunctionLike(nodeType)) {
    yield node;
  }

  for (const key of Object.keys(node)) {
    if (key === "type" || key === "loc" || key === "start" || key === "end") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in item) {
          yield* yieldFunctionNodes(item as ASTNode);
        }
      }
    } else if (child && typeof child === "object" && "type" in (child as object)) {
      yield* yieldFunctionNodes(child as ASTNode);
    }
  }
}

// ─── File-level analysis ───────────────────────────────────────────────────────

function analyzeSource(source: string, relFile: string): FileAnalysis {
  const findings: InternalFinding[] = [];
  const verifiedFlows: VerifiedFlow[] = [];
  const lines = source.split("\n");

  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: "module",
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
      plugins: ["typescript", "jsx", "decorators-legacy", "classProperties"],
    });
  } catch {
    return { findings, verifiedFlows };
  }

  // ── Pass 1: scope-aware flow detection ──
  for (const fnNode of yieldFunctionNodes(ast as unknown as ASTNode)) {
    const acc: ScopeAccumulator = {
      sources: [],
      sinks: [],
      varSources: new Map(),
    };
    shallowWalkScope(fnNode, acc, lines, false);
    const flows = matchFlows(acc, relFile);
    verifiedFlows.push(...flows);

    for (const flow of flows) {
      const category: RiskCategory =
        flow.isAI || flow.sink.includes("fetch") || flow.sink.includes("axios") || flow.sink.includes("invoke")
          ? "external-transfer"
          : flow.sink.includes("log") || flow.sink.includes("logger")
          ? "logging"
          : "persistence";
      findings.push({
        type: `verified-flow:${flow.sink}`,
        category,
        line: flow.line,
        evidence: flow.evidence,
        riskScore: flow.confidence >= 0.8 ? 25 : 15,
      });
    }
  }

  // ── Pass 2: sensitive-data-in-logs ──
  walkForSensitiveLogs(ast as unknown as ASTNode, lines, findings);

  return { findings, verifiedFlows };
}

function walkForSensitiveLogs(node: ASTNode, lines: string[], findings: InternalFinding[]): void {
  if (!node || typeof node !== "object") return;

  if (node.type === "CallExpression") {
    const callee = node.callee as ASTNode | undefined;
    const callStr = calleeName(callee);
    if (/console\.(log|warn|error|info)|logger\.(info|warn|error|debug)/.test(callStr)) {
      const args = (node.arguments as ASTNode[] | undefined) ?? [];
      const argStr = args.map((a) => nodeToStr(a as ASTNode)).join(" ");
      if (/req\.body|req\.params|req\.query|email|userId|user_id|password|token|session/.test(argStr)) {
        const line = node.loc?.start?.line ?? 0;
        const lineText = line > 0 ? (lines[line - 1] ?? "").trim().slice(0, 120) : "";
        findings.push({
          type: "sensitive-data-logged",
          category: "logging",
          line,
          evidence: lineText,
          riskScore: 10,
        });
      }
    }
  }

  for (const key of Object.keys(node)) {
    if (key === "type" || key === "loc" || key === "start" || key === "end") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in item) {
          walkForSensitiveLogs(item as ASTNode, lines, findings);
        }
      }
    } else if (child && typeof child === "object" && "type" in (child as object)) {
      walkForSensitiveLogs(child as ASTNode, lines, findings);
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface ASTAnalysisResult {
  findings: Finding[];
  verifiedFlows: VerifiedFlow[];
}

export async function runASTAnalyzer(repoPath: string): Promise<ASTAnalysisResult> {
  const allFindings: Finding[] = [];
  const allVerifiedFlows: VerifiedFlow[] = [];

  const files = await glob("**/*", {
    cwd: repoPath,
    nodir: true,
    ignore: SKIP_DIRS.map((d) => `**/${d}/**`),
    absolute: false,
  });

  const codeFiles = files.filter((f) => CODE_EXTS.has(path.extname(f).toLowerCase()));

  for (const relFile of codeFiles) {
    const absFile = path.join(repoPath, relFile);
    let source: string;
    try {
      source = await fs.readFile(absFile, "utf-8");
    } catch {
      continue;
    }

    const { findings, verifiedFlows } = analyzeSource(source, relFile);
    for (const f of findings) {
      allFindings.push({ ...f, file: relFile });
    }
    allVerifiedFlows.push(...verifiedFlows);
  }

  return { findings: allFindings, verifiedFlows: allVerifiedFlows };
}
