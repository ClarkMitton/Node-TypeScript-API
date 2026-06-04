import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import * as parser from "@babel/parser";
import type { Finding, RiskCategory } from "./types.js";

const SKIP_DIRS = ["node_modules", ".git", "dist", "build", ".next", "coverage"];
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

interface ASTFinding {
  type: string;
  category: RiskCategory;
  line: number;
  evidence: string;
  riskScore: number;
}

export async function runASTAnalyzer(repoPath: string): Promise<Finding[]> {
  const findings: Finding[] = [];

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

    const fileFindings = analyzeSource(source);
    for (const f of fileFindings) {
      findings.push({ ...f, file: relFile });
    }
  }

  return findings;
}

function analyzeSource(source: string): ASTFinding[] {
  const findings: ASTFinding[] = [];
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
    return findings;
  }

  // We'll do a manual walk instead of using traverse to avoid ESM issues
  walkNode(ast as unknown as ASTNode, lines, findings);

  return findings;
}

type ASTNode = Record<string, unknown> & { type?: string; loc?: { start: { line: number } } };

function walkNode(node: ASTNode, lines: string[], findings: ASTFinding[]): void {
  if (!node || typeof node !== "object") return;

  const line = node.loc?.start?.line ?? 0;
  const lineText = line > 0 ? (lines[line - 1] ?? "").trim().slice(0, 120) : "";

  // A. External data transfer — fetch / axios / websocket
  if (node.type === "CallExpression") {
    const callee = node.callee as ASTNode | undefined;
    const calleeStr = calleeName(callee);

    if (/^fetch$/.test(calleeStr)) {
      findings.push({
        type: "fetch-call",
        category: "external-transfer",
        line,
        evidence: lineText,
        riskScore: 20,
      });
    }

    if (/^axios(\.\w+)?$/.test(calleeStr) || /axios\.get|axios\.post|axios\.put|axios\.patch|axios\.delete/.test(calleeStr)) {
      findings.push({
        type: "axios-call",
        category: "external-transfer",
        line,
        evidence: lineText,
        riskScore: 20,
      });
    }

    if (/^new\s+WebSocket$|^WebSocket$/.test(calleeStr)) {
      findings.push({
        type: "websocket-connection",
        category: "external-transfer",
        line,
        evidence: lineText,
        riskScore: 18,
      });
    }

    // B. Data persistence — fs.writeFile / appendFile
    if (/fs\.writeFile|fs\.appendFile|writeFileSync|appendFileSync/.test(calleeStr)) {
      findings.push({
        type: "fs-write",
        category: "persistence",
        line,
        evidence: lineText,
        riskScore: 15,
      });
    }

    // localStorage.setItem
    if (/localStorage\.setItem|sessionStorage\.setItem/.test(calleeStr)) {
      findings.push({
        type: "localstorage-write",
        category: "persistence",
        line,
        evidence: lineText,
        riskScore: 15,
      });
    }

    // Database inserts (ORM patterns)
    if (/\.create\b|\.insert\b|\.insertMany\b|\.upsert\b/.test(calleeStr) ||
        /prisma\.\w+\.create|prisma\.\w+\.upsert/.test(calleeStr)) {
      findings.push({
        type: "db-insert",
        category: "persistence",
        line,
        evidence: lineText,
        riskScore: 15,
      });
    }

    // SQL query execution
    if (/\.query\b|\.execute\b|\.run\b/.test(calleeStr) && /INSERT|UPDATE|DELETE/.test(lineText.toUpperCase())) {
      findings.push({
        type: "sql-mutation",
        category: "persistence",
        line,
        evidence: lineText,
        riskScore: 15,
      });
    }

    // D. Logging of sensitive data — console.log of req.body or user objects
    if (/console\.(log|warn|error|info)/.test(calleeStr)) {
      const args = (node.arguments as ASTNode[] | undefined) ?? [];
      const argStr = args.map((a) => nodeToString(a)).join(" ");
      if (/req\.body|user\.|userId|email|password|token|session/.test(argStr)) {
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

  // B. new WebSocket(...)
  if (node.type === "NewExpression") {
    const callee = node.callee as ASTNode | undefined;
    if (calleeName(callee) === "WebSocket") {
      findings.push({
        type: "websocket-connection",
        category: "external-transfer",
        line,
        evidence: lineText,
        riskScore: 18,
      });
    }
  }

  // C. Identity signals — variable / property names
  if (node.type === "Identifier") {
    const name = (node.name as string) ?? "";
    if (/^(userId|sessionId|user_id|session_id|email|emailAddress|userName|firstName|lastName)$/.test(name)) {
      findings.push({
        type: "identity-field",
        category: "identity",
        line,
        evidence: lineText || name,
        riskScore: 15,
      });
    }
  }

  if (node.type === "MemberExpression") {
    const prop = (node.property as ASTNode | undefined);
    const propName = (prop?.name as string) ?? (prop?.value as string) ?? "";
    if (/^(userId|sessionId|email|emailAddress|userName|firstName|lastName|phoneNumber|ipAddress)$/.test(propName)) {
      findings.push({
        type: "identity-field-access",
        category: "identity",
        line,
        evidence: lineText || propName,
        riskScore: 12,
      });
    }
  }

  // Recurse into child nodes
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "loc" || key === "start" || key === "end") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in item) {
          walkNode(item as ASTNode, lines, findings);
        }
      }
    } else if (child && typeof child === "object" && "type" in (child as object)) {
      walkNode(child as ASTNode, lines, findings);
    }
  }
}

function calleeName(callee: ASTNode | undefined): string {
  if (!callee) return "";
  if (callee.type === "Identifier") return (callee.name as string) ?? "";
  if (callee.type === "MemberExpression") {
    const obj = calleeName(callee.object as ASTNode);
    const prop = callee.computed
      ? ""
      : ((callee.property as ASTNode)?.name as string) ?? "";
    return prop ? `${obj}.${prop}` : obj;
  }
  return "";
}

function nodeToString(node: ASTNode): string {
  if (!node) return "";
  if (node.type === "Identifier") return (node.name as string) ?? "";
  if (node.type === "MemberExpression") return calleeName(node);
  if (node.type === "StringLiteral" || node.type === "Literal") return String(node.value ?? "");
  return node.type ?? "";
}
