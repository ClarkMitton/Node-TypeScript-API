import type { scans } from "@workspace/db/schema";
import type { AuditCard, AuditSummary } from "@workspace/gdpr-scanner";

export interface ScanDigestExtras {
  mitigations: { flowKey: string; type: string; description: string }[];
  answers: { flowKey: string; questionId: string; answer: string }[];
  recStatuses: { recommendationKey: string; status: string }[];
}

// Builds a compact, plain-text digest of everything we know about a scan so a
// model can advise on outstanding work, not just the raw findings. Every section
// is length-capped so a large repo can't blow the token budget.
export function buildScanDigest(scan: typeof scans.$inferSelect, extras: ScanDigestExtras): string {
  const lines: string[] = [];
  lines.push(`Repository: ${scan.repoName}`);
  if (scan.description) lines.push(`What the team says this app does: ${scan.description.slice(0, 1500)}`);
  lines.push(`Automated rating: ${scan.riskLevel ?? "unknown"} (score ${scan.gdprScore ?? "?"}/100), ${scan.totalFindings ?? 0} findings.`);

  const flows = ((scan.verifiedFlows as Array<{ source?: string; sink?: string; file?: string; line?: number; dataType?: string; tags?: string[] }> | null) ?? []).slice(0, 25);
  lines.push(
    "\nConfirmed personal-data flows (user input traced to a destination):\n" +
      (flows.length
        ? flows.map((f) => `- ${f.source} → ${f.sink} (${f.dataType ?? "UNKNOWN"}) at ${f.file}:${f.line}${f.tags?.length ? ` [${f.tags.join(", ")}]` : ""}`).join("\n")
        : "- none verified"),
  );

  const cards = ((scan.auditCards as AuditCard[] | null) ?? []).slice(0, 15);
  if (cards.length) {
    lines.push(
      "\nAudit cards:\n" +
        cards
          .map((c) => `- [${c.riskLevel}] ${c.title} — flow: ${c.flow} (evidence ${c.evidence.file}:${c.evidence.line})`)
          .join("\n"),
    );
  }

  const summary = scan.auditSummary as AuditSummary | null;
  if (summary?.dpoSummary) {
    const done = new Set(extras.recStatuses.filter((r) => r.status === "already_in_place").map((r) => r.recommendationKey));
    lines.push(
      "\nRecommended actions (from the report):\n" +
        summary.dpoSummary.actionItems
          .slice(0, 15)
          .map((a) => `- [${a.priority}] ${a.action}`)
          .join("\n") +
        (done.size > 0 ? `\n(${done.size} of these have been marked "already in place" by the user.)` : ""),
    );
  }
  if (summary?.dpiaScreening) {
    lines.push(
      `\nDPIA screening: a DPIA is ${summary.dpiaScreening.dpiaRecommended ? "" : "not automatically "}recommended.` +
        (summary.dpiaScreening.detectedTriggers.length
          ? ` Triggers: ${summary.dpiaScreening.detectedTriggers.slice(0, 8).join("; ")}`
          : ""),
    );
    const questions = summary.dpiaScreening.questions.slice(0, 12);
    if (questions.length) {
      const answerFor = (qid: string) => extras.answers.find((a) => a.flowKey === "summary" && a.questionId === qid)?.answer;
      lines.push(
        "Screening questions (and the user's answers where given):\n" +
          questions.map((q) => `- ${q.question} — answer: ${answerFor(q.id) ?? "unanswered"}`).join("\n"),
      );
    }
  }
  const services = (summary?.thirdPartyServices ?? []).slice(0, 15);
  if (services.length) {
    lines.push(
      "\nThird-party services the code connects to:\n" +
        services.map((s) => `- ${s.name} (${s.category}${s.isAI ? ", AI" : ""}) — data residency ${s.residencyKnown && s.regionHint ? `hint: ${s.regionHint}` : "unknown"}`).join("\n"),
    );
  }

  if (extras.mitigations.length) {
    lines.push(
      "\nControls/mitigations the user has logged:\n" +
        extras.mitigations.slice(0, 20).map((m) => `- [${m.type}] on ${m.flowKey}: ${m.description.slice(0, 200)}`).join("\n"),
    );
  } else {
    lines.push("\nNo mitigations/controls have been logged yet.");
  }

  if (extras.answers.length) {
    lines.push(
      "\nReview-question answers from the user:\n" +
        extras.answers.slice(0, 30).map((a) => `- ${a.flowKey} / ${a.questionId}: ${a.answer}`).join("\n"),
    );
  }

  const potential = ((scan.findings as Array<{ isVerifiedFlow?: boolean; type?: string; file?: string }> | null) ?? [])
    .filter((f) => !f.isVerifiedFlow)
    .slice(0, 15);
  if (potential.length) {
    lines.push(
      "\nPotential signals (NOT confirmed flows — capability only, score 0):\n" +
        potential.map((f) => `- ${f.type} in ${f.file}`).join("\n"),
    );
  }

  return lines.join("\n").slice(0, 24000);
}
