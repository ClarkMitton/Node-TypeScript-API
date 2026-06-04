export type RiskCategory =
  | "external-transfer"
  | "persistence"
  | "identity"
  | "logging"
  | "dependency"
  | "static";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT_EVIDENCE";

export type DataType = "IDENTIFIABLE" | "BEHAVIOURAL" | "TECHNICAL" | "UNKNOWN";

export type RiskTag =
  | "USER_DATA_STORAGE"
  | "USER_DATA_TRANSFER"
  | "IDENTIFIABLE_DATA_LOGGING"
  | "BEHAVIOURAL_TRACKING"
  | "ANALYTICS_USAGE"
  | "POTENTIAL_IDENTIFIABLE_DATA"
  | "NO_USER_DATA_FOUND"
  | "INTERNAL_ONLY_PROCESSING"
  | "STATIC_CODE_ONLY";

export interface Finding {
  type: string;
  category: RiskCategory;
  file: string;
  line?: number;
  evidence: string;
  riskScore: number;
  confidence?: number;
  tags?: RiskTag[];
  isVerifiedFlow?: boolean;
  flowDescription?: string;
}

export interface VerifiedFlow {
  source: string;
  sink: string;
  file: string;
  line: number;
  evidence: string;
  dataType: DataType;
  confidence: number;
  tags: RiskTag[];
}

export interface AuditCard {
  title: string;
  riskLevel: RiskLevel;
  confidence: number;
  flow: string;
  evidence: {
    file: string;
    line: number;
    code: string;
  };
  whyItMatters: string;
  whyThisWasFlagged: string[];
  whatIsNOTTrue: string[];
  tags: RiskTag[];
}

// ─── DPO plain-English summary ─────────────────────────────────────────────────

export type DPOBadge = "NO_DATA_FOUND" | "CAPABILITY_ONLY" | "VERIFIED_FLOW" | "INCOMPLETE_FLOW";
export type DPOColour = "GREEN" | "AMBER" | "RED";
export type DPOActionType = "DPIA" | "CODE_CHANGE" | "POLICY" | "REVIEW";

export interface DPOFinding {
  description: string;
  badge: DPOBadge;
  colour: DPOColour;
}

export interface DPOAction {
  action: string;
  type: DPOActionType;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export interface DPOSummary {
  overview: string;
  problems: DPOFinding[];
  workingWell: string[];
  actionItems: DPOAction[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskReason: string;
}

export interface AuditSummary {
  repo: string;
  overallRisk: RiskLevel;
  confidence: number;
  verifiedFlowCount: number;
  externalTransferCount: number;
  storageCount: number;
  loggingCount: number;
  potentialPatternCount: number;
  conclusion: string;
  nonFindings: string[];
  dpoSummary: DPOSummary;
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
  verifiedFlows: VerifiedFlow[];
  auditCards: AuditCard[];
  auditSummary: AuditSummary;
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
