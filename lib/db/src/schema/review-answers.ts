import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { scans } from "./scans.js";

// Answers to the clarifying / DPIA-screening questions a scan raises.
// One row per (scan, flowKey, questionId). flowKey is "<file>:<line>" for a
// per-flow audit-card question, or "summary" for a scan-level DPIA question.
export const reviewAnswers = pgTable(
  "review_answers",
  {
    id: serial("id").primaryKey(),
    scanId: integer("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    flowKey: text("flow_key").notNull(),
    questionId: text("question_id").notNull(),
    answer: text("answer").notNull(), // "yes" | "no" | "unsure"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqByQuestion: unique("review_answers_scan_flow_question_uq").on(t.scanId, t.flowKey, t.questionId),
  }),
);

export type ReviewAnswer = typeof reviewAnswers.$inferSelect;
