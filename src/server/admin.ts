import type { Context, Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { createHash, timingSafeEqual } from "node:crypto";
import { sql, type Row } from "./db.ts";
import { broadcast } from "./sse.ts";
import { createLimiter } from "./limiter.ts";
import { env } from "./env.ts";

const COOKIE = "unspoken_admin";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8h
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function when(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function sha(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

// Constant-time compare over fixed-length hashes (no length/content leak).
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha(a), sha(b));
}

// CSRF: fail closed. Only accept when Origin or Referer confirms same-origin.
function sameOrigin(c: Context): boolean {
  const host = c.req.header("host");
  const origin = c.req.header("origin");
  const referer = c.req.header("referer");
  try {
    if (origin) return new URL(origin).host === host;
    if (referer) return new URL(referer).host === host;
  } catch {
    return false;
  }
  return false;
}

function clientKey(c: Context): string {
  return c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for") ?? "local";
}

const SHELL = (title: string, inner: string) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>${title}</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:#f3efe6;color:#22221e;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;padding:1.5rem;line-height:1.5}
  .wrap{max-width:760px;margin:0 auto}
  .brand{font-weight:800;letter-spacing:-.02em;font-size:1.3rem}
  .brand span{color:#6f8163}
  h1{font-size:1.35rem;margin:.25rem 0}
  .sub{color:#6f6b62;font-size:.9rem;margin:0 0 1.5rem}
  .card{background:#fdfcf8;border:1px solid #d8d0bd;border-radius:12px;padding:1rem 1.1rem;margin-bottom:1rem;box-shadow:0 10px 24px -20px rgba(0,0,0,.4)}
  .body{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 .75rem;font-size:1.02rem}
  .meta{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;font-size:.82rem;color:#6f6b62}
  .reports{color:#b4513f;font-weight:600}
  .hidden{background:#eee;border-radius:4px;padding:.1rem .4rem}
  .time{margin-left:auto}
  form{margin:0}
  .del{background:#b4513f;color:#fff;border:0;border-radius:999px;padding:.4rem .9rem;font-size:.82rem;cursor:pointer}
  .del:hover{background:#9a4232}
  .empty{color:#6f6b62}
  .login{max-width:360px;margin:12vh auto 0}
  .login .card{padding:1.5rem}
  label{display:block;font-size:.8rem;color:#6f6b62;margin:.75rem 0 .25rem}
  input{width:100%;padding:.6rem .75rem;border:1px solid #d8d0bd;border-radius:9px;background:#fff;font-size:1rem}
  input:focus{outline:2px solid #6f8163;outline-offset:1px}
  .btn{width:100%;margin-top:1.1rem;background:#22221e;color:#f3efe6;border:0;border-radius:999px;padding:.7rem;font-size:.95rem;font-weight:600;cursor:pointer}
  .err{color:#b4513f;font-size:.85rem;margin-top:.75rem}
  .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem}
  .logout{background:none;border:1px solid #d8d0bd;border-radius:999px;padding:.35rem .8rem;font-size:.8rem;color:#6f6b62;cursor:pointer}
  .sec{margin:2rem 0}
  .sec+.sec{border-top:1px solid #e2dac7;padding-top:1.5rem}
  .sec-title{font-size:1.05rem;margin:0 0 .15rem;display:flex;align-items:center;gap:.5rem}
  .sec-count{background:#e7e0cf;color:#6f6b62;border-radius:999px;padding:.05rem .55rem;font-size:.78rem;font-weight:600}
  .sec-note{color:#6f6b62;font-size:.85rem;margin:0 0 1rem}
</style>
</head><body>${inner}</body></html>`;

function loginPage(error?: string): string {
  return SHELL(
    "unspoken · sign in",
    `<div class="login">
  <p class="brand">unspoken<span>.</span></p>
  <div class="card">
    <h1>admin sign in</h1>
    <p class="sub">moderation.</p>
    <form method="post" action="/rootunspoken/login" autocomplete="off">
      <label for="u">username</label>
      <input id="u" name="username" type="text" autocomplete="username" autofocus required />
      <label for="p">password</label>
      <input id="p" name="password" type="password" autocomplete="current-password" required />
      ${error ? `<p class="err">${esc(error)}</p>` : ""}
      <button class="btn" type="submit">sign in</button>
    </form>
  </div>
</div>`,
  );
}

function renderCard(r: Row): string {
  const id = esc(String(r.id));
  const reports = Number(r.report_count);
  return `<article class="card">
  <p class="body">${esc(String(r.body))}</p>
  <div class="meta">
    ${reports > 0 ? `<span class="reports">⚑ ${reports} reports</span>` : ""}
    <span>relate ${Number(r.relate_count)} · hug ${Number(r.hug_count)}</span>
    ${r.is_hidden ? '<span class="hidden">hidden</span>' : ""}
    <span class="time">${when(String(r.created_at))}</span>
    <form method="post" action="/api/admin/unspoken/${id}/delete" data-del>
      <button type="submit" class="del">delete</button>
    </form>
  </div>
</article>`;
}

function section(title: string, note: string, rows: Row[], empty: string): string {
  return `<section class="sec">
  <h2 class="sec-title">${title} <span class="sec-count">${rows.length}</span></h2>
  <p class="sec-note">${note}</p>
  ${rows.length ? rows.map(renderCard).join("\n") : `<p class="empty">${empty}</p>`}
</section>`;
}

function dashboardPage(flagged: Row[], recent: Row[]): string {
  return SHELL(
    "unspoken · moderation",
    `<div class="wrap">
  <div class="top">
    <div>
      <p class="brand">unspoken<span>.</span></p>
      <h1>moderation</h1>
    </div>
    <form method="post" action="/rootunspoken/logout"><button class="logout" type="submit">sign out</button></form>
  </div>
  ${section("Flagged", "reported by readers. review and remove.", flagged, "No flagged letters. All quiet.")}
  ${section("Recent letters", "everything else, newest first (last 100). delete anything that is not okay.", recent, "No letters yet.")}
  <p class="sub">delete removes a letter permanently from the database.</p>
</div><script src="/rootunspoken.js"></script>`,
  );
}

export function registerAdmin(app: Hono): void {
  if (!env.ADMIN_USER || !env.ADMIN_PASS) {
    console.log("[unspoken] admin disabled (set ADMIN_USER + ADMIN_PASS to enable /rootunspoken)");
    return;
  }

  const secret = env.ADMIN_PASS; // signs the session cookie
  const loginLimiter = createLimiter(20, 60_000);

  const isAuthed = async (c: Context): Promise<boolean> => {
    try {
      return (await getSignedCookie(c, secret, COOKIE)) === "ok";
    } catch {
      return false;
    }
  };

  // CSP-compliant confirm helper (self-served, no secrets).
  app.get("/rootunspoken.js", (c) => {
    c.header("content-type", "application/javascript; charset=utf-8");
    return c.body(
      `document.querySelectorAll('form[data-del]').forEach(function(f){f.addEventListener('submit',function(e){if(!confirm('Delete this letter permanently?'))e.preventDefault();});});`,
    );
  });

  app.post("/rootunspoken/login", async (c) => {
    if (!loginLimiter.hit(clientKey(c))) {
      return c.html(loginPage("Too many attempts. Wait a minute."), 429);
    }
    if (!sameOrigin(c)) return c.text("bad origin", 403);
    const form = await c.req.parseBody();
    const ok =
      safeEqual(String(form.username ?? ""), env.ADMIN_USER) &&
      safeEqual(String(form.password ?? ""), env.ADMIN_PASS);
    if (!ok) return c.html(loginPage("Wrong username or password."), 401);
    await setSignedCookie(c, COOKIE, "ok", secret, {
      httpOnly: true,
      secure: env.isProd,
      sameSite: "Strict",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return c.redirect("/rootunspoken", 303);
  });

  app.post("/rootunspoken/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.redirect("/rootunspoken", 303);
  });

  app.get("/rootunspoken", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!(await isAuthed(c))) return c.html(loginPage());
    const flagged = (await sql`
      SELECT id, body, relate_count, hug_count, report_count, is_hidden, created_at
      FROM unspoken
      WHERE report_count > 0
      ORDER BY report_count DESC, created_at DESC
      LIMIT 200
    `) as Row[];
    const recent = (await sql`
      SELECT id, body, relate_count, hug_count, report_count, is_hidden, created_at
      FROM unspoken
      WHERE report_count = 0 AND is_hidden = false
      ORDER BY created_at DESC
      LIMIT 100
    `) as Row[];
    return c.html(dashboardPage(flagged, recent));
  });

  app.use("/api/admin/*", async (c, next) => {
    if (!(await isAuthed(c))) return c.json({ error: "unauthorized" }, 401);
    return next();
  });

  app.post("/api/admin/unspoken/:id/delete", async (c) => {
    if (!sameOrigin(c)) return c.text("bad origin", 403);
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.text("not found", 404);
    await sql`DELETE FROM unspoken WHERE id = ${id}`;
    broadcast("hide", { id });
    return c.redirect("/rootunspoken", 303);
  });

  console.log("[unspoken] admin enabled at /rootunspoken (login page + session cookie)");
}
