import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { scans } from "./scans.js";

export const flowMitigations = pgTable("flow_mitigations", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id")
    .notNull()
    .references(() => scans.id, { onDelete: "cascade" }),
  flowKey: text("flow_key").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FlowMitigation = typeof flowMitigations.$inferSelect;
