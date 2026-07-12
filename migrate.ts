// Idempotent migration runner. Applies any migrations/*.sql not yet recorded in
// the _migrations table. Run: bun run migrate
//
// In Docker this runs as a one-shot `migrate` service the app waits on (see
// docker-compose.yml), so the schema is always current before the app serves.
import { readdirSync } from "node:fs";
import { sql } from "./src/server/db.ts";

const files = readdirSync("./migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort();

// One transaction for the whole run: atomic (all-or-nothing) and, via the
// transaction-scoped advisory lock, safe if two runners start at once.
let applied = 0;
await sql.begin(async (tx) => {
  await tx`SELECT pg_advisory_xact_lock(918273645)`;
  await tx.unsafe(
    "CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );

  const rows = (await tx`SELECT name FROM _migrations`) as { name: string }[];
  const done = new Set(rows.map((r) => r.name));

  for (const f of files) {
    if (done.has(f)) continue;
    const text = await Bun.file(`./migrations/${f}`).text();
    for (const stmt of text.split(";").map((s) => s.trim()).filter(Boolean)) {
      await tx.unsafe(stmt);
    }
    await tx`INSERT INTO _migrations (name) VALUES (${f})`;
    console.log(`[migrate] applied ${f}`);
    applied++;
  }
});

console.log(applied ? `[migrate] ${applied} applied` : "[migrate] up to date");
await sql.end({ timeout: 5 });
process.exit(0);
