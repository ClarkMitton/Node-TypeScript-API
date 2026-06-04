import type { Finding, DependencyFinding, RiskLevel, RepoIndex } from "./types.js";

const DEP_CATEGORY_WEIGHTS: Record<string, number> = {
  "AI/LLM provider": 10,
  "Analytics": 10,
  "Backend/data": 8,
  "Logging": 5,
  "Logging/Monitoring": 8,
  "Auth": 10,
  "Auth/JWT": 5,
  "Auth/Crypto": 2,
};

function scoreToLevel(score: number): RiskLevel {
  if (score <= 30) return "LOW";
  if (score <= 60) return "MEDIUM";
  return "HIGH";
}

export function computeGDPRScore(findings: Finding[], deps: DependencyFinding[]): {
  score: number;
  level: RiskLevel;
  breakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {
    externalTransfer: 0,
    persistence: 0,
    identity: 0,
    logging: 0,
    dependencies: 0,
  };

  const hasExternal = findings.some((f) => f.category === "external-transfer");
  const hasPersistence = findings.some((f) => f.category === "persistence");
  const hasIdentity = findings.some((f) => f.category === "identity");
  const hasLogging = findings.some((f) => f.category === "logging");

  if (hasExternal) breakdown["externalTransfer"]! += 20;
  if (hasPersistence) breakdown["persistence"]! += 15;
  if (hasIdentity) breakdown["identity"]! += 15;
  if (hasLogging) breakdown["logging"]! += 10;

  const sensitiveLogCount = findings.filter((f) => f.type === "sensitive-data-logged").length;
  breakdown["logging"]! += Math.min(sensitiveLogCount * 3, 15);

  for (const dep of deps) {
    const weight = DEP_CATEGORY_WEIGHTS[dep.category] ?? 5;
    breakdown["dependencies"]! += weight;
  }

  let raw = Object.values(breakdown).reduce((a, b) => a + b, 0);

  if (!hasExternal) raw -= 10;
  if (!hasIdentity) raw -= 10;
  if (!hasPersistence) raw -= 10;

  const score = Math.max(0, Math.min(100, raw));
  return { score, level: scoreToLevel(score), breakdown };
}

export function buildRepoIndex(
  repoName: string,
  findings: Finding[],
  deps: DependencyFinding[],
): RepoIndex {
  const { score, level, breakdown } = computeGDPRScore(findings, deps);
  return {
    repo: repoName,
    scannedAt: new Date().toISOString(),
    findings,
    dependencies: deps,
    summary: {
      gdprScore: score,
      riskLevel: level,
      totalFindings: findings.length,
      breakdown,
    },
  };
}
