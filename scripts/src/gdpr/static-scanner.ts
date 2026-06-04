import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import type { Finding, RiskCategory } from "./types.js";

interface PatternRule {
  pattern: RegExp;
  keyword: string;
  category: RiskCategory;
  riskScore: number;
  type: string;
}

const PATTERNS: PatternRule[] = [
  // Data storage indicators
  { pattern: /\.jsonl\b/gi, keyword: ".jsonl", category: "persistence", riskScore: 10, type: "file-extension-jsonl" },
  { pattern: /\.db\b|\.sqlite\b/gi, keyword: ".db/.sqlite", category: "persistence", riskScore: 12, type: "file-extension-db" },
  { pattern: /\blocalStorage\b/g, keyword: "localStorage", category: "persistence", riskScore: 15, type: "local-storage" },
  { pattern: /\bindexedDB\b/g, keyword: "indexedDB", category: "persistence", riskScore: 15, type: "indexed-db" },

  // Backend indicators
  { pattern: /\brequire\s*\(\s*['"]express['"]\s*\)/g, keyword: "express", category: "external-transfer", riskScore: 8, type: "backend-express" },
  { pattern: /\brequire\s*\(\s*['"]hono['"]\s*\)|from\s+['"]hono['"]/g, keyword: "hono", category: "external-transfer", riskScore: 8, type: "backend-hono" },
  { pattern: /\brequire\s*\(\s*['"]fastify['"]\s*\)|from\s+['"]fastify['"]/g, keyword: "fastify", category: "external-transfer", riskScore: 8, type: "backend-fastify" },

  // Logging indicators
  { pattern: /\bconsole\.log\b/g, keyword: "console.log", category: "logging", riskScore: 5, type: "console-log" },
  { pattern: /\blogger\.info\b|\blogger\.warn\b|\blogger\.error\b/g, keyword: "logger.*", category: "logging", riskScore: 7, type: "structured-logging" },

  // Config / secrets indicators
  { pattern: /\.env\b/g, keyword: ".env", category: "identity", riskScore: 8, type: "env-file" },
  { pattern: /API_KEY\s*=|API_KEY\s*:/g, keyword: "API_KEY", category: "identity", riskScore: 10, type: "api-key-config" },
  { pattern: /SECRET\s*=|SECRET\s*:/g, keyword: "SECRET", category: "identity", riskScore: 10, type: "secret-config" },
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "__pycache__"]);

export async function runStaticScanner(repoPath: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const files = await glob("**/*", {
    cwd: repoPath,
    nodir: true,
    ignore: [...SKIP_DIRS].map((d) => `**/${d}/**`),
    absolute: false,
  });

  for (const relFile of files) {
    const absFile = path.join(repoPath, relFile);
    let content: string;
    try {
      content = await fs.readFile(absFile, "utf-8");
    } catch {
      continue;
    }

    for (const rule of PATTERNS) {
      const matches = content.match(rule.pattern);
      if (matches) {
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (rule.pattern.test(lines[i]!)) {
            findings.push({
              type: rule.type,
              category: rule.category,
              file: relFile,
              line: i + 1,
              evidence: lines[i]!.trim().slice(0, 120),
              riskScore: rule.riskScore,
            });
          }
          rule.pattern.lastIndex = 0;
        }
      }
      rule.pattern.lastIndex = 0;
    }
  }

  return findings;
}
