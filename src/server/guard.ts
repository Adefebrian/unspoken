import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { env } from "./env.ts";

export const MIN_LEN = 1;
// No user-facing limit. People can pour out a whole story. This is only a
// silent abuse ceiling so a single request can't ship megabytes.
export const MAX_LEN = 20000;

// ---- IP handling ---------------------------------------------------------

/** Resolve the visitor IP, trusting the first x-forwarded-for hop when behind
 *  a reverse proxy (Coolify/nginx), falling back to the socket address. */
export function getClientIp(c: Context): string {
  // Prefer x-real-ip: our reverse proxy (Coolify/nginx/Traefik) overwrites it
  // with the real socket peer, so a client can't forge it.
  const real = c.req.header("x-real-ip");
  if (real) return real.trim();

  // Fall back to the RIGHTMOST x-forwarded-for hop, the one our own proxy
  // appended. The leftmost hops are client-supplied and trivially spoofed, so
  // keying rate-limit / dedupe off them would let an attacker bypass both.
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }

  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** One-way salted hash so a raw IP is never stored. Keeps writes anonymous
 *  while still allowing per-visitor rate limiting and reaction de-duplication. */
export function hashIp(ip: string): string {
  return new Bun.CryptoHasher("sha256").update(ip + env.IP_SALT).digest("hex");
}

// ---- Rate limiting (in-memory sliding window) ----------------------------

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_POSTS = 5;
const hits = new Map<string, number[]>();

function recent(ipHash: string, now: number): number[] {
  const times = (hits.get(ipHash) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.set(ipHash, times);
  return times;
}

/** Read-only check: is this visitor over the post limit? Only *successful*
 *  posts count toward the limit (see recordPost), so rejected/invalid attempts
 *  never burn a visitor's quota. */
export function isRateLimited(ipHash: string): boolean {
  return recent(ipHash, Date.now()).length >= MAX_POSTS;
}

/** Record a successful post against the visitor's window. */
export function recordPost(ipHash: string): void {
  const now = Date.now();
  recent(ipHash, now).push(now);
}

// Occasional cleanup so the map does not grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of hits) {
    const recent = times.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) hits.delete(key);
    else hits.set(key, recent);
  }
}, WINDOW_MS).unref?.();

// ---- Body validation -----------------------------------------------------

type Validated = { ok: true; value: string } | { ok: false; error: string };

export function validateBody(input: unknown): Validated {
  if (typeof input !== "string") {
    return { ok: false, error: "Write something first." };
  }
  const value = input.trim();
  if (value.length < MIN_LEN) return { ok: false, error: "say something first 🫶" };
  if (value.length > MAX_LEN) {
    return { ok: false, error: "that's a whole novel. maybe split it into two?" };
  }
  return { ok: true, value };
}

// ---- Profanity / slur filter --------------------------------------------

// Block-on-submit list. Word-boundary matched, case-insensitive. Deliberately
// focused on slurs and hard profanity (EN + ID) rather than mild words, so the
// wall stays a safe space without over-censoring genuine feelings.
const BANNED = [
  // English slurs / hard profanity
  "nigger", "nigga", "faggot", "fag", "retard", "retarded", "chink", "spic",
  "kike", "wetback", "tranny", "cunt", "whore", "slut", "rape", "rapist",
  // Indonesian slurs / hard profanity
  "anjing", "anjg", "asu", "bangsat", "bajingan", "kontol", "memek", "ngentot",
  "ngentod", "kntl", "pepek", "pantek", "jancok", "jancuk", "cok", "goblok",
  "tolol", "kampret", "pelacur", "lonte", "perek", "bacol", "coli",
];

const BANNED_RE = new RegExp(
  `(^|[^\\p{L}])(${BANNED.join("|")})([^\\p{L}]|$)`,
  "iu",
);

export function hasProfanity(text: string): boolean {
  return BANNED_RE.test(text);
}

// ---- Link / spam detection ----------------------------------------------

// Confessions are feelings, not links. Blocking URLs kills the most common
// spam vector (promo links) with almost no false positives.
const LINK_RE =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|xyz|ru|cn|info|link|top|shop|store|online|site|club|biz|vip|live|app|dev|me|tv)(?:\/\S*)?/i;

export function hasLink(text: string): boolean {
  return LINK_RE.test(text);
}

// ---- Duplicate-content suppression --------------------------------------

const DUP_WINDOW_MS = 10 * 60 * 1000;
const recentBodies = new Map<string, number>();

/** True if the same (normalized) text was posted within the window. Records
 *  the body when it is new, so callers should only invoke it once the post
 *  has otherwise passed validation. */
export function isDuplicate(text: string): boolean {
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  const key = new Bun.CryptoHasher("sha256").update(norm).digest("hex");
  const now = Date.now();
  const last = recentBodies.get(key);
  if (last && now - last < DUP_WINDOW_MS) return true;
  recentBodies.set(key, now);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, t] of recentBodies) {
    if (now - t >= DUP_WINDOW_MS) recentBodies.delete(key);
  }
}, DUP_WINDOW_MS).unref?.();
