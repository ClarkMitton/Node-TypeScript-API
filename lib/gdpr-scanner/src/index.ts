export * from "./types.js";
export * from "./repo-ingestion.js";
export * from "./static-scanner.js";
export * from "./dependency-analyzer.js";
export * from "./service-detector.js";
export * from "./media-detector.js";
export * from "./ast-analyzer.js";
export * from "./gdpr-rule-engine.js";
export * from "./review.js";

import { cloneRepo, extractRepoName } from "./repo-ingestion.js";
import { runStaticScanner } from "./static-scanner.js";
import { analyzeDependencies } from "./dependency-analyzer.js";
import { detectServices } from "./service-detector.js";
import { detectMediaCapture } from "./media-detector.js";
import { runASTAnalyzer } from "./ast-analyzer.js";
import { buildRepoIndex } from "./gdpr-rule-engine.js";
import type { RepoIndex, ScanProgress, VerifiedFlow, Finding } from "./types.js";
import path from "path";

function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.file}:${f.line ?? 0}:${f.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateFlows(flows: VerifiedFlow[]): VerifiedFlow[] {
  const seen = new Set<string>();
  return flows.filter((f) => {
    const key = `${f.source}→${f.sink}:${f.file}:${f.line}`;
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
  const [deps, services, mediaCapture, astResult] = await Promise.all([
    analyzeDependencies(repoPath),
    detectServices(repoPath),
    detectMediaCapture(repoPath),
    (async () => {
      onProgress?.({ stage: "ast", message: "Running AST flow analysis…" });
      return runASTAnalyzer(repoPath);
    })(),
  ]);

  onProgress?.({ stage: "scoring", message: "Computing GDPR risk score…" });

  const allFindings = deduplicateFindings([...staticFindings, ...astResult.findings]);
  const allVerifiedFlows = deduplicateFlows(astResult.verifiedFlows);
  const repoName = extractRepoName(githubUrl);
  const index = buildRepoIndex(repoName, allFindings, deps, allVerifiedFlows, services, mediaCapture);

  onProgress?.({ stage: "done", message: "Scan complete." });
  return index;
}
