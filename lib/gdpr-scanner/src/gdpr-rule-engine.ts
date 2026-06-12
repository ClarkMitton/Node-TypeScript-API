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
  ClarifyingQuestion,
  DPIAScreening,
  ThirdPartyService,
  ServiceEvidence,
  SecurityNote,
} from "./types.js";

type MediaCapture = { detected: boolean; evidence: ServiceEvidence[] };

const DEP_CATEGORY_WEIGHTS: Record<string, number> = {
  "AI/LLM provider": 10,
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

  if (flow.isAI) {
    const provider = flow.aiProvider ?? "AI provider";
    return flow.dataType === "IDENTIFIABLE"
      ? `User identity data sent to an AI service (${provider})`
      : `Data sent to an AI service (${provider})`;
  }

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
  if (flow.isAI) {
    const provider = flow.aiProvider ?? "an AI provider";
    return `Data from ${flow.source} is sent to ${provider}, a third-party AI service. Anything included in the prompt is processed (and may be retained) by that provider — usually outside the UK/EEA, which engages Articles 44–49 on international transfers. If personal data is sent you need a lawful basis (Article 6) and a Data Processing Agreement with the provider; if the AI output is used to make decisions about people (grading, eligibility, recommendations), Article 22 (automated decision-making) and a DPIA are likely engaged. What is actually in the prompt cannot be confirmed from code alone — see the review questions below.`;
  }
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

  if (flow.isAI) {
    reasons.push(`A call to an AI/LLM service (${flow.aiProvider ?? "AI provider"}) was found at this location`);
    reasons.push("A user-input source or an identifiable field name was present in the same function, so user data may be included in the request");
    reasons.push("Whether personal data is actually sent depends on what the prompt contains — answer the review questions to finalise the rating");
    if (flow.dataType === "IDENTIFIABLE") {
      reasons.push("An identifiable field was matched in the call arguments");
    }
    return reasons;
  }

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
  // Special-category data (Art. 9) in a confirmed flow is always high risk.
  if (flow.tags.includes("SPECIAL_CATEGORY_DATA")) return "HIGH";
  // AI flows are flagged for review: a confirmed identifiable payload is HIGH,
  // otherwise the rating is provisional until the staff member answers the
  // clarifying questions (what's in the prompt? children's data? decisions?).
  if (flow.isAI) {
    if (flow.dataType === "IDENTIFIABLE" || flow.tags.includes("CHILDREN_DATA")) return "HIGH";
    return "NEEDS_REVIEW";
  }
  // Children's / vulnerable-people's data: confirmed identifiable is high;
  // otherwise ask (the field names suggest it but age can't be confirmed in code).
  if (flow.tags.includes("CHILDREN_DATA")) {
    return flow.dataType === "IDENTIFIABLE" ? "HIGH" : "NEEDS_REVIEW";
  }
  // File / media uploads: the content can't be read from code, but it may be
  // photos or recordings of people (biometric / special-category, and often
  // children). Ask before concluding rather than rating it LOW.
  if (flow.source === "file_upload") return "NEEDS_REVIEW";
  if (flow.dataType === "IDENTIFIABLE" && flow.tags.includes("USER_DATA_TRANSFER")) return "HIGH";
  if (flow.dataType === "IDENTIFIABLE" && flow.tags.includes("USER_DATA_STORAGE")) return "HIGH";
  if (flow.dataType === "IDENTIFIABLE") return "MEDIUM";
  if (flow.confidence >= 0.8) return "MEDIUM";
  return "LOW";
}

/**
 * Questions whose answers change the rating and cannot be settled from code.
 * Returned for AI flows so the report can ask the staff member directly,
 * mapping each answer back to a DPIA screening trigger.
 */
function clarifyingQuestionsForFlow(flow: VerifiedFlow): ClarifyingQuestion[] {
  // File / media uploads: code can't read the file contents, so ask whether the
  // uploads contain images/audio of people (biometric) and whether children are
  // involved — either "yes" escalates to HIGH.
  if (flow.source === "file_upload") {
    return [
      {
        id: "upload-people-media",
        question:
          "Do the files uploaded here include photos, audio or video of people (faces or voices)?",
        escalatesTo: "HIGH",
        dpiaTrigger: "Possible biometric / special-category data (GDPR Art. 9)",
      },
      {
        id: "upload-children",
        question:
          "Could the uploads relate to children or students (under 18) or other vulnerable people?",
        escalatesTo: "HIGH",
        dpiaTrigger: "Processing children's / vulnerable people's data",
      },
    ];
  }

  if (!flow.isAI) return [];
  const provider = flow.aiProvider ?? "the AI provider";
  return [
    {
      id: "ai-personal-data",
      question: `Does any personal data (names, emails, student work, or anything that could identify a person) get included in what is sent to ${provider}?`,
      escalatesTo: "HIGH",
      dpiaTrigger: "Use of new technologies; disclosure of personal data to a new recipient",
    },
    {
      id: "ai-automated-decisions",
      question: "Is the AI's output used to make or significantly influence decisions about people (e.g. grading, assessment, eligibility, flagging students)?",
      escalatesTo: "HIGH",
      dpiaTrigger: "Systematic profiling or automated decision-making with significant effects (GDPR Art. 22)",
    },
    {
      id: "ai-childrens-data",
      question: "Could the data sent relate to children or other vulnerable people (e.g. under-18 students)?",
      escalatesTo: "HIGH",
      dpiaTrigger: "Processing children's data / data of vulnerable data subjects",
    },
    {
      id: "ai-special-category",
      question: "Could it include special-category data (health, ethnicity, religion, sexual orientation) or biometric/genetic data?",
      escalatesTo: "HIGH",
      dpiaTrigger: "Processing of special-category data",
    },
  ];
}

function buildAuditCards(flows: VerifiedFlow[]): AuditCard[] {
  return flows.map((flow) => {
    const questions = clarifyingQuestionsForFlow(flow);
    const riskLevel = riskLevelForFlow(flow);
    return {
      title: flowTitle(flow),
      riskLevel,
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
      // A card is "under review" if the analyzer marked it so, or its rating is
      // provisional (NEEDS_REVIEW) and it carries questions to settle it.
      needsReview: flow.needsReview || (riskLevel === "NEEDS_REVIEW" && questions.length > 0),
      clarifyingQuestions: questions.length > 0 ? questions : undefined,
    };
  });
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
  services: ThirdPartyService[],
  mediaCapture: MediaCapture,
  overallRisk: RiskLevel,
): DPOSummary {
  const hasFlows = flows.length > 0;
  const hasCapability = potentialFindings.length > 0;
  // Services already represented by a confirmed AI flow are shown via the flow
  // problem above; the rest are surfaced here as detected-but-unconfirmed.
  const flowProviderNames = new Set(
    flows.filter((f) => f.isAI).map((f) => (f.aiProvider ?? "AI provider").toLowerCase()),
  );
  const unconfirmedServices = services.filter((s) => !flowProviderNames.has(s.name.toLowerCase()));

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
  const aiFlows = flows.filter((f) => f.isAI);
  const hasAI = aiFlows.length > 0;
  const aiProviders = [...new Set(aiFlows.map((f) => f.aiProvider ?? "an AI provider"))];
  const hasSpecialCategory = flows.some((f) => f.tags.includes("SPECIAL_CATEGORY_DATA"));
  const hasChildren = flows.some((f) => f.tags.includes("CHILDREN_DATA"));

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
    if (flow.isAI) {
      const provider = flow.aiProvider ?? "an AI service";
      const plain = flow.dataType === "IDENTIFIABLE"
        ? `Personal data is being sent to ${provider} (an AI service). This is a transfer to a third party, usually outside the UK/EEA, and needs a lawful basis and a Data Processing Agreement. (${flow.file}, line ${flow.line})`
        : `Data is being sent to ${provider} (an AI service). Whether it includes personal data depends on what the prompt contains — this needs to be checked (see the review questions). (${flow.file}, line ${flow.line})`;
      problems.push({
        description: plain,
        badge: flow.dataType === "IDENTIFIABLE" ? "VERIFIED_FLOW" : "INCOMPLETE_FLOW",
        colour: flow.dataType === "IDENTIFIABLE" ? "RED" : "AMBER",
      });
      continue;
    }
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

  // Detected third-party services that aren't already covered by a confirmed
  // flow above — surfaced so the report never claims "no third parties" when the
  // code is clearly wired to one (e.g. an ElevenLabs call in an edge function).
  for (const svc of unconfirmedServices) {
    const how =
      svc.detectedVia.includes("endpoint") ? "a direct call to its API was found in the code"
      : svc.detectedVia.includes("env-var") ? "an API key for it is configured in the code/environment"
      : svc.detectedVia.includes("dependency") ? "its software library is installed"
      : "it is referenced in the code";
    const aiNote = svc.isAI
      ? " As an AI service this usually means data is sent outside the UK/EEA and may be processed by the provider — confirm what is sent."
      : " Confirm whether any personal data is sent to it, and where it is stored.";
    problems.push({
      description: `Your app connects to ${svc.name} (${svc.category}) — ${how}.${aiNote} (${svc.evidence[0]?.file ?? "see code"})`,
      badge: "CAPABILITY_ONLY",
      colour: "AMBER",
    });
  }

  // Camera / microphone capture — likely photos or recordings of people, which
  // can be biometric special-category data and (in education) children's data.
  if (mediaCapture.detected) {
    problems.push({
      description: `This app can capture photos, audio or video (camera/microphone access was found in the code). Recordings of people are likely to contain biometric or special-category data — and in an education setting, children's data. Treat any such uploads as high-risk until you confirm what they contain. (${mediaCapture.evidence[0]?.file ?? "see code"})`,
      badge: "CAPABILITY_ONLY",
      colour: "RED",
    });
  }

  // ── What's working well ─────────────────────────────────────────────────────
  const hasServices = services.length > 0;
  const workingWell: string[] = [];
  if (!hasFlows) workingWell.push("No confirmed collection or storage of personal data");
  if (identifiableCount === 0) workingWell.push("No names, email addresses, phone numbers or other identifiers confirmed as being stored");
  // Only claim "no third parties" when none were detected by any method.
  if (transferCount === 0 && !hasServices) workingWell.push("No data being sent to third-party services");
  if (storageCount === 0) workingWell.push("No confirmed database writes of personal information");
  // Only mention the absence of an auth library when there is genuinely no
  // personal-data flow — otherwise it contradicts the confirmed findings. And
  // keep it factual: a missing auth *library* doesn't prove there's no login,
  // because Supabase/Firebase/custom auth wouldn't show up here.
  const hasPersonalDataFlows = storageCount > 0 || transferCount > 0 || identifiableCount > 0;
  if (!hasAuth && !hasPersonalDataFlows && !hasServices) {
    workingWell.push("No dedicated authentication library was detected (note: Supabase/Firebase or custom login would not show up here)");
  }
  if (!hasAnalytics && !services.some((s) => s.category === "Analytics")) workingWell.push("No advertising or analytics tracking libraries found");

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

  if (hasAI) {
    const providerList = aiProviders.join(", ");
    actionItems.push({
      action: `Confirm exactly what is sent to ${providerList}. Open the flagged lines and check whether prompts include names, emails, student work, or anything that identifies a person. If they do, this is a transfer of personal data to a third party and the steps below apply.`,
      type: "REVIEW",
      priority: "HIGH",
    });
    actionItems.push({
      action: `Put a Data Processing Agreement in place with ${providerList}, and check where they process the data. Most AI providers are outside the UK/EEA, so you also need to document the safeguards for that international transfer (GDPR Articles 44–49). Many providers offer a "zero data retention" or "no training on your data" setting — turn it on if available.`,
      type: "POLICY",
      priority: "HIGH",
    });
    actionItems.push({
      action: "If the AI's output is used to make or influence decisions about people (grading, assessment, eligibility, flagging), you must carry out a DPIA and give people a way to get a human review of the decision (GDPR Article 22). Tell users they are interacting with an AI system.",
      type: "DPIA",
      priority: "MEDIUM",
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

  if (mediaCapture.detected) {
    actionItems.push({
      action: "This app captures photos, audio or video. If these show or record identifiable people, that is likely biometric / special-category data (GDPR Article 9) and, for under-18s, children's data (Article 8). You need an Article 9 condition, a DPIA, clear consent/notice, strict retention limits, and access controls. Confirm exactly what is captured and stored.",
      type: "DPIA",
      priority: "HIGH",
    });
  }

  if (flows.some((f) => f.source === "file_upload")) {
    actionItems.push({
      action: "File uploads need extra care. Before uploading, tell users what you do with their files, how long you keep them, and who can see them. If uploads might contain photos of people, this could require a DPIA.",
      type: "DPIA",
      priority: "MEDIUM",
    });
  }

  if (hasSpecialCategory) {
    actionItems.push({
      action: "Fields that look like special-category data (e.g. health, ethnicity, religion, biometrics) were detected. This data has extra protection under GDPR Article 9 — you need a specific Article 9 condition in addition to your normal lawful basis, and a DPIA is effectively mandatory. Confirm what is actually stored and seek DPO advice.",
      type: "DPIA",
      priority: "HIGH",
    });
  }

  if (hasChildren) {
    actionItems.push({
      action: "Fields suggesting children's or students' data were detected. If any data subjects are under 18, you must take extra care: clearer privacy information, a lawful basis appropriate to children, and (for consent-based processing of under-13s) parental consent. A DPIA is strongly recommended.",
      type: "DPIA",
      priority: "HIGH",
    });
  }

  // Non-AI third-party / cloud services (AI providers are covered above).
  const nonAiServices = services.filter((s) => !s.isAI);
  if (nonAiServices.length > 0) {
    const names = [...new Set(nonAiServices.map((s) => s.name))].join(", ");
    actionItems.push({
      action: `Your app integrates third-party / cloud services (${names}). For each one, confirm whether personal data is sent to it, put a Data Processing Agreement in place with the supplier, and check where it stores and processes data. A location outside the UK/EEA needs a documented international-transfer safeguard (GDPR Articles 44–49).`,
      type: "POLICY",
      priority: "MEDIUM",
    });
  }

  if (services.length > 0) {
    actionItems.push({
      action: "Confirm the hosting region / data residency for each external service listed above. This is usually not visible in the code — ask the supplier (or check their dashboard) whether personal data stays in the UK/EEA. This feeds the DPIA (international transfers) and the IT System Requirements Assessment.",
      type: "REVIEW",
      priority: "MEDIUM",
    });
  }

  if (!hasFlows && !hasCapability && services.length === 0) {
    actionItems.push({
      action: "No action required at this time. Re-run this scan when new features are added that handle user data.",
      type: "REVIEW",
      priority: "LOW",
    });
  }

  // ── Risk level and bottom-line reason ──────────────────────────────────────
  // NEEDS_REVIEW maps to amber/MEDIUM for the DPO view: there is something
  // material (an AI call) but the final rating depends on the answers given.
  const dpoRisk: "LOW" | "MEDIUM" | "HIGH" =
    overallRisk === "HIGH" ? "HIGH"
    : overallRisk === "MEDIUM" || overallRisk === "NEEDS_REVIEW" ? "MEDIUM"
    : "LOW";

  let riskReason: string;
  if (overallRisk === "NEEDS_REVIEW") {
    riskReason = `This app sends data to ${aiProviders.join(", ")} (an AI service). We can confirm the call exists but not what the prompt contains, so the final rating depends on your answers to the review questions. If any personal data — especially about students or children — is included, treat this as high risk and complete a DPIA.`;
  } else if (!hasFlows) {
    riskReason = "No confirmed personal data handling was found. This codebase does not appear to need GDPR compliance work based on what was scanned — but this should be re-checked whenever new features are added.";
  } else if (dpoRisk === "HIGH") {
    riskReason = `${flows.length} confirmed instance${flows.length > 1 ? "s" : ""} of personal data being stored or transferred${hasAI ? ", including to an AI service" : ""}. Action is needed before this app is used with real users — particularly a Privacy Notice, lawful basis documentation, and a DPIA.`;
  } else {
    riskReason = "Limited personal data handling was confirmed. Review the items above and make sure a lawful basis exists for each data flow before going live.";
  }

  return { overview, problems, workingWell, actionItems, riskLevel: dpoRisk, riskReason };
}

// ─── DPIA screening (maps to the org's DPIA screening questions) ───────────────

function buildDPIAScreening(
  flows: VerifiedFlow[],
  deps: DependencyFinding[],
  services: ThirdPartyService[] = [],
  mediaCapture: MediaCapture = { detected: false, evidence: [] },
): DPIAScreening {
  const hasAI =
    flows.some((f) => f.isAI) ||
    deps.some((d) => d.category === "AI/LLM provider") ||
    services.some((s) => s.isAI);
  const hasSpecialCategory = flows.some((f) => f.tags.includes("SPECIAL_CATEGORY_DATA"));
  const hasChildren = flows.some((f) => f.tags.includes("CHILDREN_DATA"));
  const hasMediaCapture = mediaCapture.detected;
  // A third-party integration of any kind is a potential transfer / disclosure
  // to a new recipient — a DPIA screening trigger in its own right.
  const hasTransfer = flows.some((f) => f.tags.includes("USER_DATA_TRANSFER")) || services.length > 0;

  const aiServiceNames = [...new Set(services.filter((s) => s.isAI).map((s) => s.name))];
  const nonAiServiceNames = [...new Set(services.filter((s) => !s.isAI).map((s) => s.name))];

  const detectedTriggers: string[] = [];
  if (hasAI) detectedTriggers.push(`Uses AI / new technology${aiServiceNames.length ? ` (${aiServiceNames.join(", ")})` : ""}`);
  if (hasSpecialCategory) detectedTriggers.push("May process special-category data (health, ethnicity, religion, biometrics)");
  if (hasChildren) detectedTriggers.push("May process children's or vulnerable people's data");
  if (hasMediaCapture) detectedTriggers.push("Captures photos / audio / video of people (possible biometric special-category data)");
  if (hasTransfer) {
    const provs = [...aiServiceNames, ...nonAiServiceNames];
    detectedTriggers.push(`Sends data to third-party service(s)${provs.length ? ` (${provs.join(", ")})` : ""} — possible international transfer`);
  }

  // Questions only a person can answer; each maps back to a DPIA screening trigger.
  const questions: ClarifyingQuestion[] = [
    {
      id: "dpia-automated-decisions",
      question: "Is personal data used to make automated decisions about people, or to profile them (scoring, ranking, flagging, eligibility)?",
      escalatesTo: "HIGH",
      dpiaTrigger: "Systematic profiling or automated decision-making with significant effects",
    },
    {
      id: "dpia-special-category",
      question: hasSpecialCategory
        ? "We detected fields that look like special-category data — please confirm whether health, ethnicity, religion, biometric or similar data is processed."
        : "Could the system process special-category data (health, ethnicity, religion, sexual orientation, biometric or genetic data)?",
      escalatesTo: "HIGH",
      dpiaTrigger: "Processing of special-category data on a large scale",
    },
    {
      id: "dpia-children",
      question: hasChildren
        ? "We detected fields suggesting children or students — please confirm whether any data subjects are under 18 or otherwise vulnerable."
        : "Does the processing involve children or other vulnerable people?",
      escalatesTo: "HIGH",
      dpiaTrigger: "Processing data of children or vulnerable data subjects",
    },
    {
      id: "dpia-scale",
      question: "Is personal data processed on a large scale, or combined/matched from several different sources?",
      escalatesTo: "HIGH",
      dpiaTrigger: "Large-scale processing; combining or matching data from multiple sources",
    },
    {
      id: "dpia-monitoring",
      question: "Does the system systematically monitor people, or track their location or behaviour?",
      escalatesTo: "HIGH",
      dpiaTrigger: "Systematic monitoring; tracking of location or behaviour",
    },
    ...(hasMediaCapture
      ? [
          {
            id: "dpia-media-capture",
            question:
              "We detected camera/microphone use. Do the photos, audio or video include identifiable people (faces or voices)?",
            escalatesTo: "HIGH" as RiskLevel,
            dpiaTrigger: "Biometric / special-category data captured from people",
          },
        ]
      : []),
  ];

  // A DPIA is recommended if code already evidences a screening trigger.
  // (Even with none auto-detected, a "yes" to any question above means do one.)
  const dpiaRecommended = hasAI || hasSpecialCategory || hasChildren || hasMediaCapture;

  return { dpiaRecommended, detectedTriggers, questions };
}

// ─── Third-party services & data residency ────────────────────────────────────

/**
 * Fold AI/external-transfer flows confirmed by the AST analyzer into the
 * detected-services list (so a traced ElevenLabs/OpenAI call is reflected even
 * if the file-scan detector didn't see a literal domain/env-var), de-duplicated
 * by provider name.
 */
function mergeFlowServices(
  services: ThirdPartyService[],
  flows: VerifiedFlow[],
): ThirdPartyService[] {
  const byName = new Map<string, ThirdPartyService>();
  for (const s of services) byName.set(s.name.toLowerCase(), { ...s, detectedVia: [...s.detectedVia], evidence: [...s.evidence] });

  for (const flow of flows) {
    if (!flow.isAI) continue;
    const name = flow.aiProvider ?? "AI provider";
    const key = name.toLowerCase();
    let svc = byName.get(key);
    if (!svc) {
      svc = { name, category: "AI/LLM", isAI: true, detectedVia: [], evidence: [], residencyKnown: false };
      byName.set(key, svc);
    }
    if (!svc.detectedVia.includes("flow")) svc.detectedVia.push("flow");
    if (svc.evidence.length < 3) {
      svc.evidence.push({ file: flow.file, line: flow.line, snippet: flow.evidence.slice(0, 160) });
    }
  }

  return [...byName.values()];
}

/**
 * Plain-English data-residency / international-transfer prompts — one per
 * detected external service. Region almost never lives in the repo, so the
 * honest default is "confirm with the supplier". Maps to DPIA Step 4 and the
 * IT System Requirements Assessment's data-residency requirement.
 */
function buildResidencyNotes(services: ThirdPartyService[]): string[] {
  return services.map((s) => {
    if (s.residencyKnown && s.regionHint) {
      return `${s.name}: a hosting region (“${s.regionHint}”) was found in the code — confirm it is in the UK/EEA, otherwise you must document an international-transfer safeguard (GDPR Articles 44–49).`;
    }
    return `${s.name}: the hosting region / data residency cannot be determined from the code. Confirm with the supplier where personal data is stored and processed (UK/EEA or elsewhere); a non-UK/EEA location requires an international-transfer safeguard (GDPR Articles 44–49).`;
  });
}

/**
 * Map the security-relevant signals the scan CAN see onto the IT System
 * Requirements Assessment / Cyber Essentials themes — and be explicit about the
 * controls a code scan cannot see. This does not certify Cyber Essentials; it
 * gives a head start on the cloud/security side of the assessment.
 */
function buildSecurityNotes(
  services: ThirdPartyService[],
  deps: DependencyFinding[],
): SecurityNote[] {
  const notes: SecurityNote[] = [];

  // Access control — backend/data platforms with row-level access (RLS).
  const dataPlatforms = services.filter((s) => s.category === "Cloud data/storage");
  const usesSupabaseOrFirebase =
    dataPlatforms.some((s) => /supabase|firebase/i.test(s.name)) ||
    deps.some((d) => /@supabase\/|firebase/i.test(d.name));
  if (usesSupabaseOrFirebase) {
    notes.push({
      area: "User access control",
      status: "attention",
      detail:
        "A managed database/back-end (e.g. Supabase/Firebase) was detected. Confirm Row Level Security (or equivalent rules) is enabled on every table holding personal data, that service-role keys are never exposed to the browser, and that staff accounts use least-privilege and MFA.",
      mapsTo: "Cyber Essentials: User access control · NCSC Cloud Security Principle 9 · GDPR Art. 32",
    });
  } else if (dataPlatforms.length > 0) {
    notes.push({
      area: "User access control",
      status: "attention",
      detail:
        "A cloud data store was detected. Confirm access is restricted to authorised users on a least-privilege basis, with MFA on admin accounts.",
      mapsTo: "Cyber Essentials: User access control · NCSC Cloud Security Principle 9",
    });
  }

  // Secure configuration — secrets / API keys configured via env or in code.
  const credentialServices = services.filter(
    (s) => s.detectedVia.includes("env-var") || /unrecognised api credentials/i.test(s.name),
  );
  if (credentialServices.length > 0) {
    notes.push({
      area: "Secure configuration",
      status: "attention",
      detail:
        "API keys / secrets are configured for one or more services. Confirm secrets are NOT committed to the repository (use environment variables/secret storage), are rotated periodically, and grant the minimum scope needed. Remove any default or shared credentials.",
      mapsTo: "Cyber Essentials: Secure configuration · NCSC Cloud Security Principle 10",
    });
  }

  // Supplier assurance — every external service is a supplier to vet.
  if (services.length > 0) {
    const names = [...new Set(services.map((s) => s.name))].slice(0, 8).join(", ");
    notes.push({
      area: "Supplier assurance",
      status: "attention",
      detail:
        `External suppliers were detected (${names}). For each, confirm they hold Cyber Essentials (or an equivalent such as ISO 27001/SOC 2), put a Data Processing Agreement in place, and record them in your supplier due-diligence.`,
      mapsTo: "PPN 014/25 supplier assurance · DfE Cloud solution standards",
    });
    notes.push({
      area: "Data residency",
      status: "attention",
      detail:
        "Confirm where each external service stores and processes personal data. A non-UK/EEA location needs a documented international-transfer safeguard.",
      mapsTo: "NCSC Cloud Security Principle 2 · GDPR Art. 44–49 · IT Assessment: data residency",
    });
  }

  // Controls a code scan cannot see — always state these so nothing is implied.
  notes.push({
    area: "Not visible to a code scan",
    status: "cannot-check",
    detail:
      "Firewalls, security update management (patching), malware protection, device/endpoint security and account MFA are organisation/infrastructure controls that cannot be seen in application code. Confirm these separately as part of your Cyber Essentials certification.",
    mapsTo: "Cyber Essentials: Firewalls · Security update management · Malware protection",
  });

  return notes;
}

// ─── Audit summary generation ──────────────────────────────────────────────────

function buildAuditSummary(
  repo: string,
  flows: VerifiedFlow[],
  potentialFindings: Finding[],
  deps: DependencyFinding[],
  services: ThirdPartyService[],
  mediaCapture: MediaCapture,
  overallRisk: RiskLevel,
  confidence: number,
): AuditSummary {
  const storageCount = flows.filter((f) => f.tags.includes("USER_DATA_STORAGE")).length;
  const externalCount = flows.filter((f) => f.tags.includes("USER_DATA_TRANSFER")).length;
  const loggingCount = flows.filter((f) => f.tags.includes("IDENTIFIABLE_DATA_LOGGING")).length;
  const aiFlowCount = flows.filter((f) => f.isAI).length;

  const nonFindings: string[] = [];
  if (flows.length === 0) nonFindings.push("No verified personal data flows detected");
  if (storageCount === 0) nonFindings.push("No confirmed storage of personal data");
  // Only assert "no external transfer" when NO third-party service was detected
  // at all — otherwise the detected services (below) are the honest answer.
  if (externalCount === 0 && services.length === 0) nonFindings.push("No confirmed external transfer of user data");
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

  const dpoSummary = buildDPOSummary(flows, potentialFindings, deps, services, mediaCapture, overallRisk);
  const dpiaScreening = buildDPIAScreening(flows, deps, services, mediaCapture);
  const residencyNotes = buildResidencyNotes(services);
  const security = buildSecurityNotes(services, deps);

  return {
    repo,
    overallRisk,
    confidence,
    verifiedFlowCount: flows.length,
    externalTransferCount: externalCount,
    storageCount,
    loggingCount,
    aiFlowCount,
    potentialPatternCount: potentialFindings.length,
    conclusion,
    nonFindings,
    dpoSummary,
    dpiaScreening,
    thirdPartyServices: services,
    residencyNotes,
    mediaCapture,
    security,
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
    ai: 0,
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

    if (flow.tags.includes("AI_PROCESSING")) {
      // Sending data to a third-party AI service is a transfer to a new recipient,
      // usually overseas. Scored as its own dimension so it can't be diluted away.
      // NEEDS_REVIEW flows score a provisional baseline; identifiable ones score full.
      breakdown["ai"]! += flow.dataType === "IDENTIFIABLE" ? 30 : 18;
    } else if (flow.tags.includes("USER_DATA_TRANSFER")) {
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
  breakdown["ai"] = Math.min(breakdown["ai"]!, 40);

  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const avgConfidence = flowCount > 0 ? totalConfidence / flowCount : 0;

  // AI escalation: a confirmed identifiable-data → AI flow is HIGH regardless of
  // the arithmetic; an AI flow awaiting review pulls a quiet score up to
  // NEEDS_REVIEW so it can't be presented as "all clear".
  const hasIdentifiableAI = verifiedFlows.some((f) => f.isAI && f.dataType === "IDENTIFIABLE");
  const hasReviewAI = verifiedFlows.some((f) => f.isAI && f.needsReview);
  let level = scoreToLevel(score);
  if (hasIdentifiableAI) {
    level = "HIGH";
  } else if (hasReviewAI && (level === "LOW" || level === "INSUFFICIENT_EVIDENCE")) {
    level = "NEEDS_REVIEW";
  }

  return { score, level, breakdown, confidence: avgConfidence };
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
  detectedServices: ThirdPartyService[] = [],
  mediaCapture: MediaCapture = { detected: false, evidence: [] },
): RepoIndex {
  const potentialFindings = findings.filter((f) => !f.isVerifiedFlow);
  const services = mergeFlowServices(detectedServices, verifiedFlows);
  const { score, breakdown, confidence, level: computedLevel } = computeGDPRScore(verifiedFlows, potentialFindings, deps);
  let level: RiskLevel = computedLevel;

  // A detected AI service (even capability-only, with no traced data flow) must
  // never be presented as "all clear" — escalate a quiet rating to NEEDS_REVIEW
  // so the report asks what is actually sent before concluding. The same applies
  // to confirmed file/media uploads (content can't be read from code).
  const hasAIService = services.some((s) => s.isAI);
  const hasUploadFlow = verifiedFlows.some((f) => f.source === "file_upload");
  if ((hasAIService || hasUploadFlow || mediaCapture.detected) && (level === "LOW" || level === "INSUFFICIENT_EVIDENCE")) {
    level = "NEEDS_REVIEW";
  }

  const auditCards = buildAuditCards(verifiedFlows);
  const auditSummary = buildAuditSummary(repoName, verifiedFlows, potentialFindings, deps, services, mediaCapture, level, confidence);

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
