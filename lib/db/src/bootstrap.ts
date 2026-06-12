import { pool } from "./index";

// Idempotent schema bootstrap. Generated from the Drizzle schema (drizzle-kit
// generate) and made safe to run repeatedly: CREATE TABLE IF NOT EXISTS plus
// foreign keys added inside DO blocks that swallow "already exists" errors.
//
// This exists because the deployment target (Vercel + Supabase) only exposes the
// database connection string at runtime, not at build time, so we cannot run
// `drizzle-kit push` during the build. Instead the server ensures its schema on
// first request. For environments with a build-time DB connection, prefer
// `pnpm --filter @workspace/db run push`.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "type" text DEFAULT 'other' NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "extracted_text" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "scans" (
  "id" serial PRIMARY KEY NOT NULL,
  "github_url" text NOT NULL,
  "repo_name" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "gdpr_score" integer,
  "risk_level" text,
  "total_findings" integer,
  "breakdown" jsonb,
  "findings" jsonb,
  "dependencies" jsonb,
  "verified_flows" jsonb,
  "audit_cards" jsonb,
  "audit_summary" jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "flow_mitigations" (
  "id" serial PRIMARY KEY NOT NULL,
  "scan_id" integer NOT NULL,
  "flow_key" text NOT NULL,
  "type" text NOT NULL,
  "description" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "review_answers" (
  "id" serial PRIMARY KEY NOT NULL,
  "scan_id" integer NOT NULL,
  "flow_key" text NOT NULL,
  "question_id" text NOT NULL,
  "answer" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "review_answers_scan_flow_question_uq" UNIQUE("scan_id","flow_key","question_id")
);

DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "flow_mitigations" ADD CONSTRAINT "flow_mitigations_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "review_answers" ADD CONSTRAINT "review_answers_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
`;

let schemaPromise: Promise<void> | null = null;

/**
 * Ensure the database schema exists. Runs at most once per process instance;
 * subsequent calls return the same resolved promise.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = pool.query(SCHEMA_SQL).then(() => undefined).catch((err) => {
      // Reset so a later request can retry if the first attempt failed
      // (e.g. transient connection error during a cold start).
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}
