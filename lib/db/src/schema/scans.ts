import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scans = pgTable("scans", {
  id: serial("id").primaryKey(),
  githubUrl: text("github_url").notNull(),
  repoName: text("repo_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | running | done | failed
  gdprScore: integer("gdpr_score"),
  riskLevel: text("risk_level"),
  totalFindings: integer("total_findings"),
  breakdown: jsonb("breakdown"),
  findings: jsonb("findings"),
  dependencies: jsonb("dependencies"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertScanSchema = createInsertSchema(scans).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type Scan = typeof scans.$inferSelect;
export type InsertScan = z.infer<typeof insertScanSchema>;
