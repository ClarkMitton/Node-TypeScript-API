import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import * as parser from "@babel/parser";
import type { Finding, RiskCategory, VerifiedFlow, DataType, RiskTag } from "./types.js";

const SKIP_DIRS = ["node_modules", ".git", "dist", "build", ".next", "coverage"];
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// ─── Internal types ────────────────────────────────────────────────────────────

interface SourceRef {
  expr: string;      // e.g. "req.body.email"
  field: string;     // e.g. "email" — last property name (empty = unspecified)
  varName: string;   // variable it was assigned to, or ""
  dataType: DataType;
  line: number;
}

interface SinkRef {
  name: string;      // e.g. "fs.writeFile"
  category: RiskCategory;
  argStr: string;    // all arguments stringified for matching
  line: number;
  evidence: string;
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

const IDENTIFIABLE_FIELDS = /^(email|emailAddress|name|firstName|lastName|fullName|userId|user_id|username|phoneNumber|phone|address|ip|ipAddress|ssn|passport|dob|birthDate|nationalId|taxId)$/i;
const BEHAVIOURAL_FIELDS = /^(click|pageview|session|duration|score|confidence|preferences|behaviour|behavior|event|impression)$/i;
const TECHNICAL_FIELDS = /^(token|apiKey|secret|config|metadata|headers|hash|signature)$/i;

function classifyField(field: string): DataType {
  if (!field) return "UNKNOWN";
  if (IDENTIFIABLE_FIELDS.test(field)) return "IDENTIFIABLE";
  if (BEHAVIOURAL_FIELDS.test(field)) return "BEHAVIOURAL";
  if (TECHNICAL_FIELDS.test(field)) return "TECHNICAL";
  return "UNKNOWN";
}

// ─── Source / sink detection ───────────────────────────────────────────────────

const REQUEST_SOURCE_PATTERNS = /^(req|request)\.(body|params|query|files|file)/;

function isRequestSource(memberChain: string): boolean {
  return REQUEST_SOURCE_PATTERNS.test(memberChain);
}

function extractField(memberChain: string): string {
  // e.g. "req.body.email" → "email"
  // e.g. "req.body" → "" (unspecified)
  const parts = memberChain.split(".");
  if (parts.length <= 2) return ""; // just "req.body"
  return parts[parts.length - 1] ?? "";
}

function tagsForFlow(category: RiskCategory, dataType: DataType): RiskTag[] {
  const tags: RiskTag[] = [];
  if (category === "persistence") {
    tags.push("USER_DATA_STORAGE");
    if (dataType === "IDENTIFIABLE") tags.push("POTENTIAL_IDENTIFIABLE_DATA");
  }
  if (category === "external-transfer") tags.push("USER_DATA_TRANSFER");
  if (category === "logging") tags.push("IDENTIFIABLE_DATA_LOGGING");
  return tags;
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

  // Stop descending into a nested function body — it gets its own scope pass
  if (isNested && isFunctionLike(nodeType)) return;

  const line = node.loc?.start?.line ?? 0;
  const lineText = line > 0 ? (lines[line - 1] ?? "").trim().slice(0, 120) : "";

  // ── Source detection: req.body.X, req.params.X, req.query.X ──
  if (nodeType === "MemberExpression") {
    const chain = memberChain(node);
    if (isRequestSource(chain)) {
      const field = extractField(chain);
      acc.sources.push({
        expr: chain,
        field,
        varName: "",
        dataType: classifyField(field),
        line,
      });
    }
  }

  // ── Variable assignment from source: const email = req.body.email ──
  if (nodeType === "VariableDeclarator") {
    const id = node.id as ASTNode | undefined;
    const init = node.init as ASTNode | undefined;
    if (id?.type === "Identifier" && init) {
      const chain = memberChain(init);
      if (isRequestSource(chain)) {
        const varName = (id.name as string) ?? "";
        const field = extractField(chain);
        const src: SourceRef = {
          expr: chain,
          field,
          varName,
          dataType: classifyField(field),
          line,
        };
        acc.sources.push(src);
        if (varName) acc.varSources.set(varName, src);
      }
    }
  }

  // ── Object destructuring from source: const { email } = req.body ──
  if (nodeType === "VariableDeclarator") {
    const id = node.id as ASTNode | undefined;
    const init = node.init as ASTNode | undefined;
    if (id?.type === "ObjectPattern" && init) {
      const chain = memberChain(init);
      if (isRequestSource(chain)) {
        const props = (id.properties as ASTNode[] | undefined) ?? [];
        for (const prop of props) {
          const key = prop.key as ASTNode | undefined;
          const varId = prop.value as ASTNode | undefined;
          const fieldName = (key?.name as string) ?? (key?.value as string) ?? "";
          const varName = varId?.type === "Identifier" ? ((varId.name as string) ?? "") : "";
          const src: SourceRef = {
            expr: `${chain}.${fieldName}`,
            field: fieldName,
            varName,
            dataType: classifyField(fieldName),
            line,
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

    if (/fs\.(writeFile|appendFile|writeFileSync|appendFileSync)\b/.test(callStr)) {
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

function matchFlows(acc: ScopeAccumulator, file: string): VerifiedFlow[] {
  const flows: VerifiedFlow[] = [];
  if (acc.sources.length === 0 || acc.sinks.length === 0) return flows;

  const seen = new Set<string>();

  for (const source of acc.sources) {
    for (const sink of acc.sinks) {
      // Build candidate match strings from source
      const matchTokens: string[] = [];
      if (source.field) matchTokens.push(source.field);
      if (source.varName) matchTokens.push(source.varName);
      if (source.expr) matchTokens.push(source.expr);

      // Check if any token appears in the sink arguments
      const directConnection = matchTokens.some(
        (token) => token.length > 1 && sink.argStr.includes(token),
      );

      // Also accept if source is "req.body" (unspecified) and sink's argStr
      // contains "req.body" or "body" — common pass-through pattern
      const bodyPassthrough =
        source.expr.endsWith(".body") &&
        (sink.argStr.includes("req.body") ||
          sink.argStr.includes("request.body") ||
          sink.argStr.includes("body"));

      if (!directConnection && !bodyPassthrough) continue;

      const confidence = directConnection ? 0.85 : 0.6;
      const dedupeKey = `${source.expr}→${sink.name}:${file}:${sink.line}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const tags = tagsForFlow(sink.category, source.dataType);

      flows.push({
        source: source.expr,
        sink: sink.name,
        file,
        line: sink.line,
        evidence: sink.evidence,
        dataType: source.dataType,
        confidence,
        tags,
      });
    }
  }

  return flows;
}

// ─── Top-level function walker ─────────────────────────────────────────────────

/**
 * Walk the AST and yield every function-like node (without descending into
 * nested function bodies — callers handle those separately).
 */
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

    // Convert verified flows to findings (for backwards-compat scoring)
    for (const flow of flows) {
      findings.push({
        type: `verified-flow:${flow.sink}`,
        category: flow.sink.includes("fetch") || flow.sink.includes("axios")
          ? "external-transfer"
          : flow.sink.includes("log") || flow.sink.includes("logger")
          ? "logging"
          : "persistence",
        line: flow.line,
        evidence: flow.evidence,
        riskScore: flow.confidence >= 0.8 ? 25 : 15,
      });
    }
  }

  // ── Pass 2: sensitive-data-in-logs (still useful without full flow chain) ──
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
      // Only flag if it contains identifiable field names or req.body references
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
