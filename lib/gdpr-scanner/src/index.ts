export * from "./types.js";
export * from "./repo-ingestion.js";
export * from "./static-scanner.js";
export * from "./dependency-analyzer.js";
export * from "./ast-analyzer.js";
export * from "./gdpr-rule-engine.js";

import { cloneRepo, extractRepoName } from "./repo-ingestion.js";
import { runStaticScanner } from "./static-scanner.js";
import { analyzeDependencies } from "./dependency-analyzer.js";
import { runASTAnalyzer } from "./ast-analyzer.js";
import { buildRepoIndex } from "./gdpr-rule-engine.js";
import type { RepoIndex, ScanProgress } from "./types.js";
import path from "path";

function deduplicateFindings(findings: ReturnType<typeof Array.prototype.filter>) {
  const seen = new Set<string>();
  return findings.filter((f: { file: string; line?: number; type: string }) => {
    const key = `${f.file}:${f.line ?? 0}:${f.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runFullScan(
  githubUrl: string,
  reposBaseDir: string,
  onProgress?: (p: ScanProgress) => void,
): Promise<RepoIndex> {
  const reposDir = path.resolve(reposBaseDir);

  onProgress?.({ stage: "cloning", message: "Downloading repository…" });
  const repoPath = await cloneRepo(githubUrl, reposDir);

  onProgress?.({ stage: "static", message: "Running static file scanner…" });
  const staticFindings = await runStaticScanner(repoPath);

  onProgress?.({ stage: "deps", message: "Analyzing dependencies…" });
  const [deps, astFindings] = await Promise.all([
    analyzeDependencies(repoPath),
    (async () => {
      onProgress?.({ stage: "ast", message: "Running AST analysis…" });
      return runASTAnalyzer(repoPath);
    })(),
  ]);

  onProgress?.({ stage: "scoring", message: "Computing GDPR risk score…" });
  const allFindings = deduplicateFindings([...staticFindings, ...astFindings]);
  const repoName = extractRepoName(githubUrl);
  const index = buildRepoIndex(repoName, allFindings, deps);

  onProgress?.({ stage: "done", message: "Scan complete." });
  return index;
}
