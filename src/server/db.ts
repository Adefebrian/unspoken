import { neon } from "@neondatabase/serverless";
import { env } from "./env.ts";

// Neon serverless HTTP client. Usable as a tagged template (`sql\`...\``)
// and via `sql.query(text, params)` for dynamic parameterized queries.
export const sql = neon(env.DATABASE_URL);

export type Row = Record<string, unknown>;
