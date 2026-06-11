import type { AuditCard, AuditSummary, RiskLevel } from "./types.js";

// ─── Applying review answers to recompute the rating ───────────────────────────
//
// AI flows (and the DPIA screening) are emitted as NEEDS_REVIEW with clarifying
// questions because code alone can't settle them. This module takes the staff
// member's answers and turns a provisional rating into a final one.

export type AnswerValue = "yes" | "no" | "unsure";

export interface ReviewAnswerInput {
  flowKey: string;    // "<file>:<line>" for an audit-card question, or "summary"
  questionId: string;
  answer: AnswerValue;
}

export interface CardResolution {
  flowKey: string;
  originalRiskLevel: RiskLevel;
  resolvedRiskLevel: RiskLevel;
  resolved: boolean;       // every question on this card has been answered
  escalated: boolean;      // a "yes" pushed it up
}

export interface ReviewOutcome {
  finalRiskLevel: RiskLevel;
  finalRiskReason: string;
  cardResolutions: CardResolution[];
  dpiaRequired: boolean;
  openQuestionCount: number;   // questions still unanswered
  totalQuestionCount: number;
}

export const SUMMARY_FLOW_KEY = "summary";

export function cardFlowKey(card: Pick<AuditCard, "evidence">): string {
  return `${card.evidence.file}:${card.evidence.line}`;
}

const RANK: Record<RiskLevel, number> = {
  INSUFFICIENT_EVIDENCE: 0,
  LOW: 1,
  NEEDS_REVIEW: 2,
  MEDIUM: 3,
  HIGH: 4,
};

function maxLevel(levels: RiskLevel[]): RiskLevel {
  let best: RiskLevel = "INSUFFICIENT_EVIDENCE";
  for (const l of levels) {
    if (RANK[l] > RANK[best]) best = l;
  }
  return best;
}

/**
 * Recompute the overall rating from the answers given.
 *
 * Per audit card with clarifying questions:
 *  - any "yes" → escalates to that question's `escalatesTo` (default HIGH)
 *  - all answered and no "yes" → a NEEDS_REVIEW card resolves down to LOW
 *    (the AI call carries no personal data), other cards keep their level
 *  - otherwise the card stays NEEDS_REVIEW (still awaiting answers)
 *
 * Summary (DPIA) questions answered "yes" escalate the whole scan.
 */
export function applyReviewAnswers(
  auditCards: AuditCard[],
  dpiaScreening: AuditSummary["dpiaScreening"],
  answers: ReviewAnswerInput[],
): ReviewOutcome {
  const byKey = new Map<string, AnswerValue>();
  for (const a of answers) byKey.set(`${a.flowKey}::${a.questionId}`, a.answer);

  let totalQuestionCount = 0;
  let openQuestionCount = 0;
  // A "yes" to any HIGH-escalating question (card or summary) means the
  // processing is high-risk → a DPIA is warranted.
  let anyHighYes = false;
  const cardResolutions: CardResolution[] = [];
  const contributingLevels: RiskLevel[] = [];

  for (const card of auditCards) {
    const questions = card.clarifyingQuestions ?? [];
    if (questions.length === 0) {
      contributingLevels.push(card.riskLevel);
      continue;
    }

    const key = cardFlowKey(card);
    let answeredAll = true;
    let escalatedTo: RiskLevel | null = null;

    for (const q of questions) {
      totalQuestionCount++;
      const ans = byKey.get(`${key}::${q.id}`);
      if (!ans) {
        answeredAll = false;
        openQuestionCount++;
        continue;
      }
      if (ans === "yes") {
        const target = q.escalatesTo ?? "HIGH";
        if (!escalatedTo || RANK[target] > RANK[escalatedTo]) escalatedTo = target;
        if (target === "HIGH") anyHighYes = true;
      } else if (ans === "unsure") {
        // "unsure" is treated cautiously: it does not clear the review.
        answeredAll = false;
      }
    }

    let resolvedRiskLevel: RiskLevel;
    if (escalatedTo) {
      resolvedRiskLevel = escalatedTo;
    } else if (answeredAll) {
      // All "no": the call carries no personal data → a review-only card clears.
      resolvedRiskLevel = card.needsReview ? "LOW" : card.riskLevel;
    } else {
      resolvedRiskLevel = card.needsReview ? "NEEDS_REVIEW" : card.riskLevel;
    }

    cardResolutions.push({
      flowKey: key,
      originalRiskLevel: card.riskLevel,
      resolvedRiskLevel,
      resolved: answeredAll,
      escalated: Boolean(escalatedTo),
    });
    contributingLevels.push(resolvedRiskLevel);
  }

  // Summary (DPIA) questions.
  let summaryYes = false;
  for (const q of dpiaScreening.questions) {
    totalQuestionCount++;
    const ans = byKey.get(`${SUMMARY_FLOW_KEY}::${q.id}`);
    if (!ans) {
      openQuestionCount++;
    } else if (ans === "yes") {
      summaryYes = true;
      const target = q.escalatesTo ?? "HIGH";
      contributingLevels.push(target);
      if (target === "HIGH") anyHighYes = true;
    }
  }

  let finalRiskLevel = maxLevel(contributingLevels);
  // If there is something material still unanswered, don't present "all clear".
  if (openQuestionCount > 0 && RANK[finalRiskLevel] < RANK["NEEDS_REVIEW"]) {
    finalRiskLevel = "NEEDS_REVIEW";
  }

  const dpiaRequired = dpiaScreening.dpiaRecommended || summaryYes || anyHighYes;

  let finalRiskReason: string;
  if (finalRiskLevel === "HIGH") {
    finalRiskReason =
      "Based on the answers given, this involves higher-risk processing (e.g. personal data sent to an AI service, automated decisions, special-category or children's data). Complete a DPIA and document a lawful basis before going live.";
  } else if (finalRiskLevel === "NEEDS_REVIEW") {
    finalRiskReason = `${openQuestionCount} review question${openQuestionCount === 1 ? "" : "s"} still need answering before the rating can be finalised.`;
  } else if (finalRiskLevel === "LOW") {
    finalRiskReason =
      "Based on the answers given, no high-risk processing was confirmed. Keep this under review and re-scan when features change.";
  } else {
    finalRiskReason = "Not enough confirmed processing to rate. Re-scan when features are added.";
  }

  return {
    finalRiskLevel,
    finalRiskReason,
    cardResolutions,
    dpiaRequired,
    openQuestionCount,
    totalQuestionCount,
  };
}
