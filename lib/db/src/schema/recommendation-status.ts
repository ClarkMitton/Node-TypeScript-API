import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { scans } from "./scans.js";

// Per-scan acknowledgement of a recommended action ("What you need to do").
// Lets a college mark a recommendation as something they already have in place
// (privacy notice, ROPA, DPIA, processor agreement, …) without removing it from
// the report. recommendationKey is a stable hash/slug of the action text so we
// don't need the scanner to mint IDs.
export const recommendationStatus = pgTable(
  "recommendation_status",
  {
    id: serial("id").primaryKey(),
    scanId: integer("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    recommendationKey: text("recommendation_key").notNull(),
    status: text("status").notNull(), // "already_in_place" | "todo"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqByKey: unique("recommendation_status_scan_key_uq").on(t.scanId, t.recommendationKey),
  }),
);

export type RecommendationStatus = typeof recommendationStatus.$inferSelect;
