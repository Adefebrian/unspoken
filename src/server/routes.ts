import { Hono } from "hono";
import { sql, type Row } from "./db.ts";
import { broadcast, streamHandler } from "./sse.ts";
import {
  getClientIp,
  hasLink,
  hasProfanity,
  hashIp,
  isDuplicate,
  isRateLimited,
  recordPost,
  validateBody,
} from "./guard.ts";
import { createLimiter } from "./limiter.ts";
import type { UnspokenDTO } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 20;

// Per-IP throttles so reactions/reports can't be hammered even with a real IP.
const reactLimiter = createLimiter(40, 60_000);
const reportLimiter = createLimiter(15, 60_000);

function toDTO(r: Row): UnspokenDTO {
  return {
    id: String(r.id),
    body: String(r.body),
    relateCount: Number(r.relate_count ?? 0),
    hugCount: Number(r.hug_count ?? 0),
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export const api = new Hono();

// Realtime stream
api.get("/stream", streamHandler);

// Client telemetry sink (JS errors + Core Web Vitals). Structured logs; a log
// shipper / Sentry can consume these. Rate-limited by the global /api limiter.
api.post("/telemetry", async (c) => {
  try {
    const p = (await c.req.json()) as Record<string, unknown>;
    const kind = p.type === "vital" ? "vital" : "clienterror";
    console.log(JSON.stringify({ log: kind, ...p, at: new Date().toISOString() }));
  } catch {
    /* ignore malformed beacons */
  }
  return c.body(null, 204);
});

// 10 newest for the home wall
api.get("/unspoken/latest", async (c) => {
  const rows = (await sql`
    SELECT id, body, relate_count, hug_count, created_at
    FROM unspoken
    WHERE is_hidden = false
    ORDER BY created_at DESC
    LIMIT 10
  `) as Row[];
  return c.json(rows.map(toDTO));
});

// Paginated archive
api.get("/unspoken", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = (await sql`
    SELECT id, body, relate_count, hug_count, created_at
    FROM unspoken
    WHERE is_hidden = false
    ORDER BY created_at DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `) as Row[];

  const countRows = (await sql`
    SELECT count(*)::int AS total FROM unspoken WHERE is_hidden = false
  `) as Row[];
  const total = Number(countRows[0]?.total ?? 0);

  return c.json({
    items: rows.map(toDTO),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
});

// Create an unspoken
api.post("/unspoken", async (c) => {
  const ipHash = hashIp(getClientIp(c));

  if (isRateLimited(ipHash)) {
    return c.json({ error: "whoa, you've let a lot out. take a breath and come back in a few 🫶" }, 429);
  }

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request." }, 400);
  }

  const body = validateBody((payload as { body?: unknown })?.body);
  if (!body.ok) return c.json({ error: body.error }, 422);

  if (hasProfanity(body.value)) {
    return c.json({ error: "let's keep this a soft place. say it without the slurs?" }, 422);
  }

  if (hasLink(body.value)) {
    return c.json({ error: "links aren't allowed here. just say what's on your heart 🫶" }, 422);
  }

  if (isDuplicate(body.value)) {
    return c.json({ error: "that was just said a moment ago. give it a little space." }, 429);
  }

  const rows = (await sql`
    INSERT INTO unspoken (body) VALUES (${body.value})
    RETURNING id, body, relate_count, hug_count, created_at
  `) as Row[];

  // Only a successful post counts toward the per-visitor limit.
  recordPost(ipHash);

  const dto = toDTO(rows[0]!);
  broadcast("new", dto);
  return c.json(dto, 201);
});

// React (relate | hug): one per visitor per unspoken per type
api.post("/unspoken/:id/react", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Not found." }, 404);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    payload = {};
  }
  const type = (payload as { type?: unknown })?.type;
  if (type !== "relate" && type !== "hug") {
    return c.json({ error: "Invalid reaction." }, 422);
  }

  const ipHash = hashIp(getClientIp(c));
  if (!reactLimiter.hit(ipHash)) {
    return c.json({ error: "slow down a moment 🫶" }, 429);
  }

  // Atomic: insert the reaction (deduped by the unique index); only bump the
  // counter when a new row was actually inserted. The counter column can't be
  // parameterized, so the two reaction types run as separate typed queries.
  const rows = (await (type === "relate"
    ? sql`
        WITH ins AS (
          INSERT INTO reactions (unspoken_id, ip_hash, type)
          SELECT ${id}, ${ipHash}, ${type}
          WHERE EXISTS (SELECT 1 FROM unspoken WHERE id = ${id})
          ON CONFLICT (unspoken_id, ip_hash, type) DO NOTHING
          RETURNING 1
        )
        UPDATE unspoken
        SET relate_count = relate_count + (SELECT count(*) FROM ins)
        WHERE id = ${id}
        RETURNING relate_count, hug_count
      `
    : sql`
        WITH ins AS (
          INSERT INTO reactions (unspoken_id, ip_hash, type)
          SELECT ${id}, ${ipHash}, ${type}
          WHERE EXISTS (SELECT 1 FROM unspoken WHERE id = ${id})
          ON CONFLICT (unspoken_id, ip_hash, type) DO NOTHING
          RETURNING 1
        )
        UPDATE unspoken
        SET hug_count = hug_count + (SELECT count(*) FROM ins)
        WHERE id = ${id}
        RETURNING relate_count, hug_count
      `)) as Row[];

  if (!rows.length) return c.json({ error: "Not found." }, 404);
  const result = {
    id,
    relateCount: Number(rows[0]!.relate_count),
    hugCount: Number(rows[0]!.hug_count),
  };
  broadcast("reaction", result);
  return c.json(result);
});

// Report. Soft-hide at 3 unique reports
api.post("/unspoken/:id/report", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Not found." }, 404);

  const ipHash = hashIp(getClientIp(c));
  if (!reportLimiter.hit(ipHash)) {
    return c.json({ error: "too many reports, take a breath." }, 429);
  }

  const rows = (await sql`
    WITH ins AS (
      INSERT INTO reports (unspoken_id, ip_hash)
      SELECT ${id}, ${ipHash}
      WHERE EXISTS (SELECT 1 FROM unspoken WHERE id = ${id})
      ON CONFLICT (unspoken_id, ip_hash) DO NOTHING
      RETURNING 1
    )
    UPDATE unspoken
    SET report_count = report_count + (SELECT count(*) FROM ins),
        is_hidden = (report_count + (SELECT count(*) FROM ins)) >= 3
    WHERE id = ${id}
    RETURNING is_hidden
  `) as Row[];

  if (!rows.length) return c.json({ error: "Not found." }, 404);
  if (rows[0]!.is_hidden) broadcast("hide", { id });
  return c.json({ ok: true });
});
