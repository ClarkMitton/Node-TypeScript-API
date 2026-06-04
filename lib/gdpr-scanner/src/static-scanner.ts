import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import type { Finding, RiskCategory } from "./types.js";

/**
 * Static scanner — regex-based pass over non-JS/TS files.
 *
 * IMPORTANT: Only patterns that indicate genuine data-storage capability
 * are included. Framework presence (Express, React, etc.) is NOT flagged
 * here — that is a capability marker, not a GDPR risk. The AST flow
 * matcher handles verified data flows in code files.
 */

interface PatternRule {
  pattern: RegExp;
  keyword: string;
  category: RiskCategory;
  riskScore: number;
  type: string;
}

const PATTERNS: PatternRule[] = [
  // Client-side storage (genuine personal data risk — often unaudited)
  { pattern: /\blocalStorage\b/g, keyword: "localStorage", category: "persistence", riskScore: 12, type: "local-storage" },
  { pattern: /\bindexedDB\b/g, keyword: "indexedDB", category: "persistence", riskScore: 12, type: "indexed-db" },
  { pattern: /\bsessionStorage\b/g, keyword: "sessionStorage", category: "persistence", riskScore: 10, type: "session-storage" },
  // SQLite / embedded DB files (stored on device, retention risk)
  { pattern: /\.db\b|\.sqlite\b/gi, keyword: ".db/.sqlite", category: "persistence", riskScore: 10, type: "file-extension-db" },
  // Analytics scripts embedded in non-JS files (HTML, config)
  { pattern: /gtag\s*\(|ga\s*\(|fbq\s*\(/g, keyword: "analytics-pixel", category: "external-transfer", riskScore: 12, type: "analytics-pixel" },
  // WebSocket connections mentioned in config / docs
  { pattern: /wss?:\/\//g, keyword: "websocket-url", category: "external-transfer", riskScore: 8, type: "websocket-url" },
];

const SKIP_DIRS = ["node_modules", ".git", "dist", "build", ".next", "coverage", "__pycache__"];

// Only scan non-JS/TS files here; code files are handled by the AST analyzer
const SKIP_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".map", ".lock", ".sum", ".mod",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
  ".woff", ".woff2", ".ttf", ".eot",
  ".zip", ".gz", ".tar",
  ".pdf", ".docx", ".xlsx",
]);

export async function runStaticScanner(repoPath: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const files = await glob("**/*", {
    cwd: repoPath,
    nodir: true,
    ignore: SKIP_DIRS.map((d) => `**/${d}/**`),
    absolute: false,
  });

  const nonCodeFiles = files.filter((f) => !SKIP_EXTS.has(path.extname(f).toLowerCase()));

  for (const relFile of nonCodeFiles) {
    const absFile = path.join(repoPath, relFile);
    let content: string;
    try {
      content = await fs.readFile(absFile, "utf-8");
    } catch {
      continue;
    }

    for (const rule of PATTERNS) {
      rule.pattern.lastIndex = 0;
      if (!rule.pattern.test(content)) {
        rule.pattern.lastIndex = 0;
        continue;
      }
      rule.pattern.lastIndex = 0;

      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(lines[i]!)) {
          findings.push({
            type: rule.type,
            category: rule.category,
            file: relFile,
            line: i + 1,
            evidence: lines[i]!.trim().slice(0, 120),
            riskScore: rule.riskScore,
            confidence: 0.4, // static patterns are capability markers, not verified flows
            isVerifiedFlow: false,
          });
        }
        rule.pattern.lastIndex = 0;
      }
    }
  }

  return findings;
}
