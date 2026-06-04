export type RiskCategory =
  | "external-transfer"
  | "persistence"
  | "identity"
  | "logging"
  | "dependency"
  | "static";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface Finding {
  type: string;
  category: RiskCategory;
  file: string;
  line?: number;
  evidence: string;
  riskScore: number;
}

export interface DependencyFinding {
  name: string;
  category: string;
  gdprRelevance: number;
}

export interface RepoIndex {
  repo: string;
  scannedAt: string;
  findings: Finding[];
  dependencies: DependencyFinding[];
  summary: {
    gdprScore: number;
    riskLevel: RiskLevel;
    totalFindings: number;
    breakdown: Record<string, number>;
  };
}

export interface ScanProgress {
  stage: "cloning" | "static" | "deps" | "ast" | "scoring" | "done";
  message: string;
}
