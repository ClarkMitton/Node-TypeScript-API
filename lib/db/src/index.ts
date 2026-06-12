import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Accept DATABASE_URL (self-hosted / Replit) or POSTGRES_URL (Vercel + Supabase
// integration provisions this name) so the same code runs in both environments.
const connectionString =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL (or POSTGRES_URL) must be set. Did you forget to provision a database?",
  );
}

// Managed Postgres providers (Supabase, Neon, RDS, …) terminate TLS with certs
// that aren't in Node's trust store, and recent `pg` treats `sslmode=require`
// (and its aliases) as full verification — which rejects them. The `sslmode`
// embedded in the connection string overrides any `ssl` option passed to Pool,
// so for non-local connections we force `sslmode=no-verify` (encrypted, but the
// cert chain isn't verified). Local Postgres typically has no TLS, so leave it.
const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(
  connectionString,
);

function withRelaxedSsl(url: string): string {
  if (isLocalDb) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("sslmode", "no-verify");
    return u.toString();
  } catch {
    // Not a parseable URL — fall back to a query-string tweak.
    const sep = url.includes("?") ? "&" : "?";
    return `${url.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "")}${sep}sslmode=no-verify`;
  }
}

export const pool = new Pool({
  connectionString: withRelaxedSsl(connectionString),
  ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export { ensureSchema } from "./bootstrap";
