export type RiskCategory =
  | "external-transfer"
  | "persistence"
  | "identity"
  | "logging"
  | "dependency"
  | "static";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT_EVIDENCE" | "NEEDS_REVIEW";

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
  | "STATIC_CODE_ONLY"
  | "AI_PROCESSING"
  | "AUTOMATED_DECISION_MAKING"
  | "SPECIAL_CATEGORY_DATA"
  | "CHILDREN_DATA";

// Known AI/LLM providers a flow can be attributed to (best-effort)
export type AIProvider =
  | "OpenAI"
  | "Anthropic"
  | "Google Gemini"
  | "Cohere"
  | "Replicate"
  | "Mistral"
  | "Groq"
  | "Hugging Face"
  | "ElevenLabs"
  | "OpenRouter"
  | "AI provider";

// ─── Third-party service detection ─────────────────────────────────────────────
//
// Independent of verified data flows: any sign that the app integrates an
// external service (provider domain, API-key env var, SDK dependency, or a
// traced flow). This is what lets us surface e.g. an ElevenLabs call made from a
// Supabase edge function even when no user-input source can be traced to it.
export type ServiceCategory =
  | "AI/LLM"
  | "Cloud data/storage"
  | "Analytics"
  | "Email/Comms"
  | "Payments"
  | "Monitoring/Logging"
  | "Other third-party";

export type ServiceDetectionMethod = "endpoint" | "env-var" | "dependency" | "flow";

export interface ServiceEvidence {
  file: string;
  line: number;
  snippet: string;
}

export interface ThirdPartyService {
  // Display name, e.g. "ElevenLabs" or "Supabase".
  name: string;
  category: ServiceCategory;
  isAI: boolean;
  // How we found it (one service may be detected several ways).
  detectedVia: ServiceDetectionMethod[];
  evidence: ServiceEvidence[];
  // Best-effort hosting region read from the repo (e.g. "us-east-1"); usually
  // absent because region is a provider-side setting, not in the code.
  regionHint?: string;
  // Whether the hosting region / data residency could be determined from code.
  residencyKnown: boolean;
}

// A question we put to the staff member because the answer changes the rating
// and cannot be determined reliably from code alone.
export interface ClarifyingQuestion {
  id: string;
  question: string;
  // If the user answers "yes", the flow/finding escalates to this level.
  escalatesTo?: RiskLevel;
  // GDPR / DPIA screening trigger this maps back to, for traceability.
  dpiaTrigger?: string;
}

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
  // AI-specific: set when the sink is an AI/LLM provider call or endpoint.
  isAI?: boolean;
  aiProvider?: AIProvider;
  // True when code alone cannot settle the risk — the report should ask the
  // staff member the clarifying questions rather than assert a final rating.
  needsReview?: boolean;
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
  // When true, riskLevel is provisional and clarifyingQuestions must be shown.
  needsReview?: boolean;
  clarifyingQuestions?: ClarifyingQuestion[];
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

// Maps detected signals and self-assessment questions onto the organisation's
// DPIA screening section, so the report can say whether a DPIA is likely needed.
export interface DPIAScreening {
  // Whether a DPIA is recommended based on auto-detected triggers alone.
  dpiaRecommended: boolean;
  // Triggers the scan could confirm from code (e.g. "AI / new technology used").
  detectedTriggers: string[];
  // Questions only the staff member can answer; "yes" to any means do a DPIA.
  questions: ClarifyingQuestion[];
}

// A single line in the "Security & Cyber Essentials" mapping. These map the
// security-relevant signals the code scan CAN see onto the org's IT System
// Requirements Assessment / Cyber Essentials themes — and are explicit about the
// controls a code scan cannot see (firewalls, patching, MFA, malware).
export interface SecurityNote {
  // Heading, e.g. "User access control" or "Secure configuration".
  area: string;
  // attention = a signal to act on; info = neutral context; cannot-check = the
  // scan cannot see this, confirm it separately.
  status: "attention" | "info" | "cannot-check";
  detail: string;
  // Which standard / form section this maps to (Cyber Essentials control, NCSC
  // cloud principle, DfE standard, GDPR article).
  mapsTo: string;
}

export interface AuditSummary {
  repo: string;
  overallRisk: RiskLevel;
  confidence: number;
  verifiedFlowCount: number;
  externalTransferCount: number;
  storageCount: number;
  loggingCount: number;
  aiFlowCount: number;
  potentialPatternCount: number;
  conclusion: string;
  nonFindings: string[];
  dpoSummary: DPOSummary;
  dpiaScreening: DPIAScreening;
  // External services the app integrates (detected independently of flows).
  thirdPartyServices: ThirdPartyService[];
  // Plain-English data-residency / international-transfer prompts, one per
  // external service whose hosting region couldn't be confirmed from code.
  residencyNotes: string[];
  // Camera / microphone / media-capture capability (photos/audio of people →
  // possible biometric special-category and children's data).
  mediaCapture?: { detected: boolean; evidence: ServiceEvidence[] };
  // Security / Cyber Essentials mapping: security-relevant signals the scan can
  // see, mapped to the IT System Requirements Assessment, plus the controls a
  // code scan cannot see.
  security?: SecurityNote[];
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
