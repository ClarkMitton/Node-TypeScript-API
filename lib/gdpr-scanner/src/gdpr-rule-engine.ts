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
  DPOAction,
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
  const reasons: string[] = [];

  if (flow.source.startsWith("field_evidence:")) {
    const field = flow.source.replace("field_evidence:", "");
    reasons.push(`Identifiable field name \`${field}\` found as an object key in the database write call`);
    reasons.push("The field name is direct evidence that personal data is stored in this table");
  } else if (flow.source === "file_upload") {
    reasons.push("File or media content uploaded to cloud storage");
    reasons.push("Media files may contain biometric or personal data (faces, voices, names)");
  } else {
    reasons.push(`User input source detected: \`${flow.source}\``);
    reasons.push(`Data sink detected: \`${flow.sink}\``);
    if (flow.confidence >= 0.8) {
      reasons.push("Direct data flow confirmed — source identifier found in sink arguments");
    } else {
      reasons.push("Likely data flow — source and sink co-located in same function scope");
    }
  }

  if (flow.dataType === "IDENTIFIABLE") {
    reasons.push("Data classified as IDENTIFIABLE (email / name / userId / phone / address)");
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
  if (source.startsWith("field_evidence:")) {
    const field = source.replace("field_evidence:", "");
    return `a database field named "${field}" (personal data stored directly)`;
  }
  if (source === "file_upload") return "a file or media upload";
  if (source.includes(".target.files")) return "a file input";
  if (source.includes(".target.value")) return "a form input field";
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

  const identifiableCount = flows.filter((f) => f.dataType === "IDENTIFIABLE").length;
  const transferCount = flows.filter((f) => f.tags.includes("USER_DATA_TRANSFER")).length;
  const storageCount = flows.filter((f) => f.tags.includes("USER_DATA_STORAGE")).length;
  const hasAuth = deps.some((d) => d.category.startsWith("Auth"));
  const hasAnalytics = deps.some((d) => d.category === "Analytics");

  // ── Problems (what needs attention) ────────────────────────────────────────
  const problems: DPOFinding[] = [];

  if (!hasFlows && !hasCapability) {
    problems.push({
      description: "No personal data collection was found anywhere in this codebase.",
      badge: "NO_DATA_FOUND",
      colour: "GREEN",
    });
  }

  for (const flow of flows) {
    let plain: string;
    if (flow.source.startsWith("field_evidence:")) {
      const field = flow.source.replace("field_evidence:", "");
      plain = `Personal data is being saved to a database — specifically a field called "${field}" was found in a write operation. (${flow.file}, line ${flow.line})`;
    } else if (flow.source === "file_upload") {
      plain = `Files or media are being uploaded to cloud storage. Uploaded files may contain personal information such as faces, names, or voice recordings. (${flow.file}, line ${flow.line})`;
    } else {
      plain = `${capitalise(dataLabel(flow.dataType))} entered by the user is being ${flow.tags.includes("USER_DATA_STORAGE") ? "saved to a database" : "sent to an external service"}. (${flow.file}, line ${flow.line})`;
    }
    problems.push({ description: plain, badge: "VERIFIED_FLOW", colour: "RED" });
  }

  for (const pf of potentialFindings.slice(0, 4)) {
    const capDesc =
      pf.category === "persistence"
        ? "Database or file storage code is present in this app, but we couldn't confirm personal data is being written to it"
        : pf.category === "external-transfer"
        ? "Code that can send data to an external server exists, but no personal data was traced into it"
        : pf.category === "logging"
        ? "Logging is set up in this app — worth checking logs don't capture personal data"
        : "Data-handling code exists in this app";
    problems.push({
      description: `${capDesc}. (${pf.file ?? "unknown file"})`,
      badge: "CAPABILITY_ONLY",
      colour: "AMBER",
    });
  }

  // ── What's working well ─────────────────────────────────────────────────────
  const workingWell: string[] = [];
  if (!hasFlows) workingWell.push("No confirmed collection or storage of personal data");
  if (identifiableCount === 0) workingWell.push("No names, email addresses, phone numbers or other identifiers confirmed as being stored");
  if (transferCount === 0) workingWell.push("No data being sent to third-party services");
  if (storageCount === 0) workingWell.push("No confirmed database writes of personal information");
  if (!hasAuth) workingWell.push("No user login or account system — so no user identity is being tracked");
  if (!hasAnalytics) workingWell.push("No advertising or analytics tracking libraries found");

  // ── What you need to do ─────────────────────────────────────────────────────
  const actionItems: DPOAction[] = [];

  if (hasFlows) {
    actionItems.push({
      action: "Add a Privacy Notice (also called a Privacy Policy) to your app. It must explain what personal data you collect, why you collect it, how long you keep it, and who can access it. This is required by GDPR Article 13.",
      type: "CODE_CHANGE",
      priority: "HIGH",
    });
    actionItems.push({
      action: "Document these data flows in your Records of Processing Activities. Every organisation that handles personal data must keep a written record of what they process and why (GDPR Article 30).",
      type: "POLICY",
      priority: "HIGH",
    });
  }

  if (identifiableCount > 0) {
    actionItems.push({
      action: "Make sure you have a clear legal reason to collect and store this personal data. The most common reasons are: the user gave consent, it's necessary for a contract with the user, or you have a legitimate interest. You must be able to prove which one applies.",
      type: "POLICY",
      priority: "HIGH",
    });
    actionItems.push({
      action: "Carry out a Data Protection Impact Assessment (DPIA). Because you're storing identifiable personal data, GDPR requires you to assess the risks to the people whose data you hold, especially if this is sensitive information like health, children's data, or financial details.",
      type: "DPIA",
      priority: identifiableCount >= 3 ? "HIGH" : "MEDIUM",
    });
  }

  if (storageCount > 0) {
    actionItems.push({
      action: "Make sure stored personal data can be deleted when a user asks (the 'Right to Erasure' under GDPR Article 17). Add a way for users to request deletion of their account or data.",
      type: "CODE_CHANGE",
      priority: "MEDIUM",
    });
  }

  if (flows.some((f) => f.source === "file_upload")) {
    actionItems.push({
      action: "File uploads need extra care. Before uploading, tell users what you do with their files, how long you keep them, and who can see them. If uploads might contain photos of people, this could require a DPIA.",
      type: "DPIA",
      priority: "MEDIUM",
    });
  }

  if (!hasFlows && !hasCapability) {
    actionItems.push({
      action: "No action required at this time. Re-run this scan when new features are added that handle user data.",
      type: "REVIEW",
      priority: "LOW",
    });
  }

  // ── Risk level and bottom-line reason ──────────────────────────────────────
  const dpoRisk: "LOW" | "MEDIUM" | "HIGH" =
    overallRisk === "HIGH" ? "HIGH"
    : overallRisk === "MEDIUM" ? "MEDIUM"
    : "LOW";

  let riskReason: string;
  if (!hasFlows) {
    riskReason = "No confirmed personal data handling was found. This codebase does not appear to need GDPR compliance work based on what was scanned — but this should be re-checked whenever new features are added.";
  } else if (dpoRisk === "HIGH") {
    riskReason = `${flows.length} confirmed instance${flows.length > 1 ? "s" : ""} of personal data being stored or transferred. Action is needed before this app is used with real users — particularly a Privacy Notice, lawful basis documentation, and a DPIA.`;
  } else {
    riskReason = "Limited personal data handling was confirmed. Review the items above and make sure a lawful basis exists for each data flow before going live.";
  }

  return { overview, problems, workingWell, actionItems, riskLevel: dpoRisk, riskReason };
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
