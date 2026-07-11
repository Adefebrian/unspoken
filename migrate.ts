// Idempotent migration runner. Applies any migrations/*.sql not yet recorded in
// the _migrations table. Run: bun run migrate
import { readdirSync } from "node:fs";
import { sql } from "./src/server/db.ts";

// Run a raw statement through neon's tagged-template client (build a
// TemplateStringsArray with no interpolations). The .query() method is not
// available in this driver version.
function run(s: string): Promise<unknown> {
  const strings = Object.assign([s], { raw: [s] }) as unknown as TemplateStringsArray;
  return (sql as unknown as (t: TemplateStringsArray) => Promise<unknown>)(strings);
}

await run(
  "CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
);

const rows = (await sql`SELECT name FROM _migrations`) as { name: string }[];
const applied = new Set(rows.map((r) => r.name));

const files = readdirSync("./migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort();

let n = 0;
for (const f of files) {
  if (applied.has(f)) continue;
  const text = await Bun.file(`./migrations/${f}`).text();
  for (const stmt of text.split(";").map((s) => s.trim()).filter(Boolean)) {
    await run(stmt);
  }
  await sql`INSERT INTO _migrations (name) VALUES (${f})`;
  console.log(`[migrate] applied ${f}`);
  n++;
}
console.log(n ? `[migrate] ${n} applied` : "[migrate] up to date");
process.exit(0);
