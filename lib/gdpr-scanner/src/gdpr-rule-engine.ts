import type {
  Finding,
  DependencyFinding,
  RiskLevel,
  RiskTag,
  RepoIndex,
  VerifiedFlow,
  AuditCard,
  AuditSummary,
  DataType,
  DPOSummary,
  DPOFinding,
} from "./types.js";

const DEP_CATEGORY_WEIGHTS: Record<string, number> = {
  "AI/LLM provider": 5,
  Analytics: 8,
  "Backend/data": 3,
  Logging: 2,
  "Logging/Monitoring": 5,
  Auth: 5,
  "Auth/JWT": 2,
  "Auth/Crypto": 1,
};

function scoreToLevel(score: number): RiskLevel {
  if (score === 0) return "INSUFFICIENT_EVIDENCE";
  if (score <= 30) return "LOW";
  if (score <= 60) return "MEDIUM";
  return "HIGH";
}

// ─── Audit card generation ─────────────────────────────────────────────────────

function flowTitle(flow: VerifiedFlow): string {
  const dataLabel = flow.dataType === "IDENTIFIABLE" ? "user identity data"
    : flow.dataType === "BEHAVIOURAL" ? "behavioural data"
    : flow.dataType === "TECHNICAL" ? "technical data"
    : "untyped data";

  if (flow.sink.includes("writeFile") || flow.sink.includes("appendFile")) {
    return `${capitalise(dataLabel)} written to filesystem`;
  }
  if (flow.sink.includes("insert") || flow.sink.includes("create") || flow.sink.includes("upsert") || flow.sink.includes("save")) {
    return `${capitalise(dataLabel)} stored in database`;
  }
  if (flow.sink === "fetch" || flow.sink.includes("axios")) {
    return `${capitalise(dataLabel)} transferred to external endpoint`;
  }
  if (flow.sink.includes("localStorage") || flow.sink.includes("sessionStorage")) {
    return `${capitalise(dataLabel)} written to client-side storage`;
  }
  if (flow.sink.includes("console") || flow.sink.includes("logger")) {
    return `${capitalise(dataLabel)} present in log output`;
  }
  return `${capitalise(dataLabel)} flows to ${flow.sink}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function whyItMatters(flow: VerifiedFlow): string {
  const { sink, tags } = flow;
  if (tags.includes("USER_DATA_TRANSFER")) {
    return `Personal data sourced from ${flow.source} is sent to an external endpoint (${sink}). Article 44–49 GDPR govern international transfers; Article 13/14 require disclosure of recipients.`;
  }
  if (sink.includes("writeFile") || sink.includes("appendFile")) {
    return `Personal data from ${flow.source} is written to a file. Without retention controls and access restrictions this may violate Article 5(1)(e) (storage limitation) and Article 32 (security).`;
  }
  if (sink.includes("insert") || sink.includes("create") || sink.includes("upsert") || sink.includes("save")) {
    return `Personal data from ${flow.source} is persisted to a data store. A lawful basis (Article 6) and a retention policy are required under GDPR.`;
  }
  if (sink.includes("localStorage") || sink.includes("sessionStorage")) {
    return `Personal data from ${flow.source} is stored client-side. This data persists beyond the session and may be accessible to third-party scripts.`;
  }
  if (tags.includes("IDENTIFIABLE_DATA_LOGGING")) {
    return `Personal data from ${flow.source} appears in log output (${sink}). Logs are often retained long-term and may be sent to third-party monitoring tools.`;
  }
  return `Personal data sourced from ${flow.source} flows to ${sink}, which may constitute GDPR-relevant processing requiring a lawful basis.`;
}

function whyFlagged(flow: VerifiedFlow): string[] {
  const reasons: string[] = [
    `User input source detected: \`${flow.source}\``,
    `Data sink detected: \`${flow.sink}\``,
  ];
  if (flow.confidence >= 0.8) {
    reasons.push("Direct data flow confirmed — source identifier found in sink arguments");
  } else {
    reasons.push("Likely data flow — source and sink co-located in same function scope");
  }
  if (flow.dataType === "IDENTIFIABLE") {
    reasons.push("Field classified as IDENTIFIABLE (email / userId / name / phone / address)");
  }
  return reasons;
}

function whatIsNOTTrue(): string[] {
  return [
    "Framework presence (Express, React, Fastify) is not itself a GDPR risk factor",
    "Importing fs or a database library is not a risk — only confirmed usage with user data matters",
    "Environment variables are not personal data unless proven to carry user identifiers",
    "The existence of a sink (e.g. fs.writeFile) without a proven user-data source is not flagged",
  ];
}

function riskLevelForFlow(flow: VerifiedFlow): RiskLevel {
  if (flow.dataType === "IDENTIFIABLE" && flow.tags.includes("USER_DATA_TRANSFER")) return "HIGH";
  if (flow.dataType === "IDENTIFIABLE" && flow.tags.includes("USER_DATA_STORAGE")) return "HIGH";
  if (flow.dataType === "IDENTIFIABLE") return "MEDIUM";
  if (flow.confidence >= 0.8) return "MEDIUM";
  return "LOW";
}

function buildAuditCards(flows: VerifiedFlow[]): AuditCard[] {
  return flows.map((flow) => ({
    title: flowTitle(flow),
    riskLevel: riskLevelForFlow(flow),
    confidence: flow.confidence,
    flow: `${flow.source} → ${flow.sink}`,
    evidence: {
      file: flow.file,
      line: flow.line,
      code: flow.evidence,
    },
    whyItMatters: whyItMatters(flow),
    whyThisWasFlagged: whyFlagged(flow),
    whatIsNOTTrue: whatIsNOTTrue(),
    tags: flow.tags,
  }));
}

// ─── DPO plain-English summary ─────────────────────────────────────────────────

function sourceLabel(source: string): string {
  if (source.includes(".body")) return "a form submission or request body";
  if (source.includes(".params")) return "a URL parameter";
  if (source.includes(".query")) return "a URL query string";
  return "user input";
}

function sinkLabel(sink: string): string {
  if (sink.includes("writeFile") || sink.includes("appendFile")) return "file storage on disk";
  if (sink.includes("insert") || sink.includes("create") || sink.includes("upsert") || sink.includes("save")) return "a database";
  if (sink === "fetch" || sink.includes("axios")) return "an external service";
  if (sink.includes("localStorage") || sink.includes("sessionStorage")) return "browser storage";
  if (sink.includes("console") || sink.includes("logger")) return "log output";
  return "a data destination";
}

function dataLabel(dataType: string): string {
  if (dataType === "IDENTIFIABLE") return "a personal identifier (such as an email address or name)";
  if (dataType === "BEHAVIOURAL") return "behavioural data";
  if (dataType === "TECHNICAL") return "a technical value";
  return "data";
}

function buildDPOSummary(
  flows: VerifiedFlow[],
  potentialFindings: Finding[],
  deps: DependencyFinding[],
  overallRisk: RiskLevel,
): DPOSummary {
  const hasFlows = flows.length > 0;
  const hasCapability = potentialFindings.length > 0;

  // Overview
  let overview: string;
  if (!hasFlows && !hasCapability) {
    overview =
      "This repository was scanned and no processing of personal data was detected. No user inputs, data storage, or data transfers were found in the code.";
  } else if (!hasFlows && hasCapability) {
    overview =
      `This repository contains code that is capable of storing or transferring data, but no confirmed connection between user input and a data destination was found. ${potentialFindings.length} capability pattern(s) are noted below as informational only — they do not contribute to the risk score.`;
  } else {
    const storageCount = flows.filter((f) => f.tags.includes("USER_DATA_STORAGE")).length;
    const transferCount = flows.filter((f) => f.tags.includes("USER_DATA_TRANSFER")).length;
    const parts: string[] = [];
    if (storageCount > 0) parts.push(`user data is stored (${storageCount} confirmed instance${storageCount > 1 ? "s" : ""})`);
    if (transferCount > 0) parts.push(`user data is sent to an external service (${transferCount} confirmed instance${transferCount > 1 ? "s" : ""})`);
    overview =
      `Personal data processing was confirmed in this repository. Specifically: ${parts.join(" and ")}. Each finding below is supported by direct evidence in the code.`;
  }

  // What was found
  const whatWasFound: DPOFinding[] = [];

  if (!hasFlows && !hasCapability) {
    whatWasFound.push({
      description: "No user data inputs were detected in any part of this codebase.",
      badge: "NO_DATA_FOUND",
      colour: "GREEN",
    });
  }

  for (const flow of flows) {
    whatWasFound.push({
      description: `${capitalise(dataLabel(flow.dataType))} from ${sourceLabel(flow.source)} is sent to ${sinkLabel(flow.sink)}. (${flow.file}, line ${flow.line})`,
      badge: "VERIFIED_FLOW",
      colour: "RED",
    });
  }

  for (const pf of potentialFindings.slice(0, 6)) {
    const capDesc =
      pf.category === "persistence"
        ? "Data storage code is present"
        : pf.category === "external-transfer"
        ? "Code capable of sending data externally is present"
        : pf.category === "logging"
        ? "Logging code is present"
        : "Data processing code is present";
    whatWasFound.push({
      description: `${capDesc}, but no user input was traced into it. This is a capability only, not a confirmed data flow. (${pf.file ?? "unknown file"})`,
      badge: "CAPABILITY_ONLY",
      colour: "AMBER",
    });
  }

  // What was NOT found
  const whatWasNotFound: string[] = [];
  const identifiableCount = flows.filter((f) => f.dataType === "IDENTIFIABLE").length;
  const transferCount = flows.filter((f) => f.tags.includes("USER_DATA_TRANSFER")).length;
  const storageCount = flows.filter((f) => f.tags.includes("USER_DATA_STORAGE")).length;
  const hasAuth = deps.some((d) => d.category.startsWith("Auth"));
  const hasAnalytics = deps.some((d) => d.category === "Analytics");

  if (!hasFlows) whatWasNotFound.push("No user accounts or data input handling detected");
  if (identifiableCount === 0) whatWasNotFound.push("No personal data fields (email, name, phone number, address) detected in any confirmed data flow");
  if (transferCount === 0) whatWasNotFound.push("No data sent to external services detected");
  if (storageCount === 0) whatWasNotFound.push("No confirmed storage of user information in a database or file");
  if (!hasAuth) whatWasNotFound.push("No user login or authentication system detected");
  if (!hasAnalytics) whatWasNotFound.push("No tracking or analytics library detected");

  // Risk level and reason
  const dpoRisk: "LOW" | "MEDIUM" | "HIGH" =
    overallRisk === "HIGH" ? "HIGH"
    : overallRisk === "MEDIUM" ? "MEDIUM"
    : "LOW";

  let riskReason: string;
  if (!hasFlows) {
    riskReason =
      "No confirmed personal data processing was found. This repository does not appear to require GDPR compliance measures based on the code analysed.";
  } else if (dpoRisk === "HIGH") {
    riskReason =
      "Confirmed flows of personal data — such as names, email addresses, or identifiers — to storage or external services were detected. A lawful basis under Article 6 GDPR and up-to-date Records of Processing Activities (Article 30) are required.";
  } else {
    riskReason =
      "Limited personal data processing was detected. Review each confirmed flow above and ensure a lawful basis exists. Update your Records of Processing Activities if these flows are used in production.";
  }

  return { overview, whatWasFound, whatWasNotFound, riskLevel: dpoRisk, riskReason };
}

// ─── Audit summary generation ──────────────────────────────────────────────────

function buildAuditSummary(
  repo: string,
  flows: VerifiedFlow[],
  potentialFindings: Finding[],
  deps: DependencyFinding[],
  overallRisk: RiskLevel,
  confidence: number,
): AuditSummary {
  const storageCount = flows.filter((f) => f.tags.includes("USER_DATA_STORAGE")).length;
  const externalCount = flows.filter((f) => f.tags.includes("USER_DATA_TRANSFER")).length;
  const loggingCount = flows.filter((f) => f.tags.includes("IDENTIFIABLE_DATA_LOGGING")).length;

  const nonFindings: string[] = [];
  if (flows.length === 0) nonFindings.push("No verified personal data flows detected");
  if (storageCount === 0) nonFindings.push("No confirmed storage of personal data");
  if (externalCount === 0) nonFindings.push("No confirmed external transfer of user data");
  if (loggingCount === 0) nonFindings.push("No confirmed logging of personal data");
  const hasAuthDep = deps.some((d) => d.category.startsWith("Auth"));
  if (!hasAuthDep) nonFindings.push("No authentication library detected — identity management may be absent");

  let conclusion: string;
  if (flows.length === 0 && potentialFindings.length === 0) {
    conclusion =
      "No evidence of GDPR-relevant personal data processing was detected. The repository appears to contain no verified user data flows.";
  } else if (flows.length === 0) {
    conclusion =
      `${potentialFindings.length} capability pattern(s) detected (storage/transfer sinks present) but no verified personal data source → sink flow was established. Sinks without a proven user-data source are classified as neutral capabilities and do not contribute to the risk score.`;
  } else {
    const flowSummary = [
      storageCount > 0 ? `${storageCount} storage flow(s)` : "",
      externalCount > 0 ? `${externalCount} external transfer(s)` : "",
      loggingCount > 0 ? `${loggingCount} logging instance(s)` : "",
    ]
      .filter(Boolean)
      .join(", ");
    conclusion = `${flows.length} verified personal data flow(s) detected: ${flowSummary}. Each flow has a confirmed user input source linked to a data sink.`;
  }

  const dpoSummary = buildDPOSummary(flows, potentialFindings, deps, overallRisk);

  return {
    repo,
    overallRisk,
    confidence,
    verifiedFlowCount: flows.length,
    externalTransferCount: externalCount,
    storageCount,
    loggingCount,
    potentialPatternCount: potentialFindings.length,
    conclusion,
    nonFindings,
    dpoSummary,
  };
}

// ─── GDPR score computation ────────────────────────────────────────────────────

export function computeGDPRScore(
  verifiedFlows: VerifiedFlow[],
  potentialFindings: Finding[],
  deps: DependencyFinding[],
): { score: number; level: RiskLevel; breakdown: Record<string, number>; confidence: number } {
  const breakdown: Record<string, number> = {
    externalTransfer: 0,
    persistence: 0,
    identity: 0,
    logging: 0,
    dependencies: 0,
  };

  let totalConfidence = 0;
  let flowCount = 0;

  // PRIMARY scoring: verified flows ONLY
  // A sink without a proven user-data source contributes nothing.
  for (const flow of verifiedFlows) {
    totalConfidence += flow.confidence;
    flowCount++;

    const weight =
      flow.dataType === "IDENTIFIABLE" ? 1.5
      : flow.dataType === "BEHAVIOURAL" ? 1.0
      : 0.7;

    if (flow.tags.includes("USER_DATA_TRANSFER")) {
      breakdown["externalTransfer"]! += Math.min(25 * weight, 35);
    }
    if (flow.tags.includes("USER_DATA_STORAGE")) {
      breakdown["persistence"]! += Math.min(20 * weight, 30);
    }
    if (flow.tags.includes("IDENTIFIABLE_DATA_LOGGING")) {
      breakdown["logging"]! += Math.min(15 * weight, 20);
    }
    if (flow.dataType === "IDENTIFIABLE") {
      breakdown["identity"]! += 10;
    }
  }

  // CAPABILITY-ONLY patterns (sinks without proven sources) → score 0
  // They are informational only; they must not inflate the risk score.
  void potentialFindings; // acknowledged, not scored

  // Dependency scoring (informational, low weight — libraries alone are not violations)
  for (const dep of deps) {
    const weight = DEP_CATEGORY_WEIGHTS[dep.category] ?? 2;
    breakdown["dependencies"]! += weight;
  }
  breakdown["dependencies"] = Math.min(breakdown["dependencies"]!, 20);

  // Cap breakdown values
  breakdown["externalTransfer"] = Math.min(breakdown["externalTransfer"]!, 40);
  breakdown["persistence"] = Math.min(breakdown["persistence"]!, 40);
  breakdown["identity"] = Math.min(breakdown["identity"]!, 20);
  breakdown["logging"] = Math.min(breakdown["logging"]!, 20);

  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const avgConfidence = flowCount > 0 ? totalConfidence / flowCount : 0;

  return { score, level: scoreToLevel(score), breakdown, confidence: avgConfidence };
}

// ─── Overall summary tags ──────────────────────────────────────────────────────

function summaryTags(flows: VerifiedFlow[], potentialFindings: Finding[], deps: DependencyFinding[]): RiskTag[] {
  const tags: Set<RiskTag> = new Set();

  if (flows.length === 0 && potentialFindings.length === 0) {
    tags.add("NO_USER_DATA_FOUND");
    tags.add("STATIC_CODE_ONLY");
  }

  for (const flow of flows) {
    for (const t of flow.tags) tags.add(t);
  }

  const hasAnalytics = deps.some((d) => d.category === "Analytics");
  if (hasAnalytics) tags.add("ANALYTICS_USAGE");

  return [...tags];
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function buildRepoIndex(
  repoName: string,
  findings: Finding[],
  deps: DependencyFinding[],
  verifiedFlows: VerifiedFlow[],
): RepoIndex {
  const potentialFindings = findings.filter((f) => !f.isVerifiedFlow);
  const { score, level, breakdown, confidence } = computeGDPRScore(verifiedFlows, potentialFindings, deps);

  const auditCards = buildAuditCards(verifiedFlows);
  const auditSummary = buildAuditSummary(repoName, verifiedFlows, potentialFindings, deps, level, confidence);

  // Annotate findings that correspond to verified flows
  const annotatedFindings: Finding[] = findings.map((f) => {
    if (f.type.startsWith("verified-flow:")) {
      const matchingFlow = verifiedFlows.find(
        (v) => f.file === v.file && f.line === v.line,
      );
      return {
        ...f,
        isVerifiedFlow: true,
        confidence: matchingFlow?.confidence,
        tags: matchingFlow?.tags,
        flowDescription: matchingFlow ? `${matchingFlow.source} → ${matchingFlow.sink}` : undefined,
      };
    }
    return f;
  });

  const _tags = summaryTags(verifiedFlows, potentialFindings, deps);

  return {
    repo: repoName,
    scannedAt: new Date().toISOString(),
    findings: annotatedFindings,
    dependencies: deps,
    verifiedFlows,
    auditCards,
    auditSummary,
    summary: {
      gdprScore: score,
      riskLevel: level,
      totalFindings: findings.length,
      breakdown,
    },
  };
}
