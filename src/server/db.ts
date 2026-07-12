import postgres from "postgres";
import { env } from "./env.ts";

// Self-hosted Postgres client (postgres.js). Same tagged-template surface the
// app used with Neon, so route/admin/retention queries are unchanged:
//   await sql`SELECT ...`   -> Row[]
//   await sql.unsafe(text)  -> raw statement (migrations only)
//
// One small pool per app process. With N app replicas the pools add up, so keep
// max modest and well under Postgres' max_connections (see docker-compose).
export const sql = postgres(env.DATABASE_URL, {
  max: env.PG_POOL_MAX,
  idle_timeout: 20, // seconds; release idle connections
  connect_timeout: 10,
  // Internal Docker network is plaintext. If DATABASE_URL points at a managed
  // Postgres, add `?sslmode=require` to the URL and postgres.js picks it up.
  ssl: env.DATABASE_URL.includes("sslmode=require") ? "require" : false,
  onnotice: () => {}, // silence NOTICE spam (e.g. IF NOT EXISTS)
});

export type Row = Record<string, unknown>;
