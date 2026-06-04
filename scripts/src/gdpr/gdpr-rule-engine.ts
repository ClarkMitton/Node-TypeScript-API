import type { Finding, DependencyFinding, RiskLevel, RepoIndex } from "./types.js";

interface ScoreBreakdown {
  externalTransfer: number;
  persistence: number;
  identity: number;
  logging: number;
  dependencies: number;
}

const RISK_WEIGHTS = {
  externalApiCall: 20,
  persistentStorage: 15,
  identityHandling: 15,
  loggingUserData: 10,
  analyticsTools: 10,
  authSystem: 10,
};

const MITIGATIONS = {
  noExternalCalls: -10,
  noIdentitySystem: -10,
  noPersistence: -10,
};

const DEP_CATEGORY_WEIGHTS: Record<string, number> = {
  "AI/LLM provider": 10,
  Analytics: 10,
  "Backend/data": 8,
  "Logging": 5,
  "Logging/Monitoring": 8,
  Auth: 10,
  "Auth/JWT": 5,
  "Auth/Crypto": 2,
};

export function computeGDPRScore(
  findings: Finding[],
  deps: DependencyFinding[]
): { score: number; level: RiskLevel; breakdown: ScoreBreakdown } {
  const breakdown: ScoreBreakdown = {
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

  if (hasExternal) breakdown.externalTransfer += RISK_WEIGHTS.externalApiCall;
  if (hasPersistence) breakdown.persistence += RISK_WEIGHTS.persistentStorage;
  if (hasIdentity) breakdown.identity += RISK_WEIGHTS.identityHandling;
  if (hasLogging) breakdown.logging += RISK_WEIGHTS.loggingUserData;

  // Extra weight for sensitive logging
  const sensitiveLogCount = findings.filter((f) => f.type === "sensitive-data-logged").length;
  breakdown.logging += Math.min(sensitiveLogCount * 3, 15);

  // Dependency scoring
  for (const dep of deps) {
    const weight = DEP_CATEGORY_WEIGHTS[dep.category] ?? 5;
    breakdown.dependencies += weight;
  }

  // Apply mitigations
  let raw =
    breakdown.externalTransfer +
    breakdown.persistence +
    breakdown.identity +
    breakdown.logging +
    breakdown.dependencies;

  if (!hasExternal) raw += MITIGATIONS.noExternalCalls;
  if (!hasIdentity) raw += MITIGATIONS.noIdentitySystem;
  if (!hasPersistence) raw += MITIGATIONS.noPersistence;

  const score = Math.max(0, Math.min(100, raw));
  const level = scoreToLevel(score);

  return { score, level, breakdown };
}

function scoreToLevel(score: number): RiskLevel {
  if (score <= 30) return "LOW";
  if (score <= 60) return "MEDIUM";
  return "HIGH";
}

export function buildRepoIndex(
  repoName: string,
  findings: Finding[],
  deps: DependencyFinding[]
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
      breakdown: {
        externalTransfer: breakdown.externalTransfer,
        persistence: breakdown.persistence,
        identity: breakdown.identity,
        logging: breakdown.logging,
        dependencies: breakdown.dependencies,
      },
    },
  };
}
