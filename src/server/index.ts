import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { compress } from "hono/compress";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { api } from "./routes.ts";
import { clientCount } from "./sse.ts";
import { getClientIp, hashIp } from "./guard.ts";
import { createLimiter } from "./limiter.ts";
import { llmsTxt, robotsTxt, sitemapXml } from "./seo.ts";
import { renderPage } from "./ssr.ts";
import { sql } from "./db.ts";
import { registerAdmin } from "./admin.ts";
import { startRetention } from "./retention.ts";
import { env } from "./env.ts";

const app = new Hono();

// L7 flood protection: 120 API requests / minute / IP (stream excluded).
const globalLimiter = createLimiter(120, 60_000);
const compressMw = compress();
const assetFiles = serveStatic({ root: "./public" });

// Read the built shell once and fill in the real site URL (canonical / OG /
// JSON-LD). Runtime injection means deploys need only PUBLIC_SITE_URL, no build arg.
let indexTemplate: string;
try {
  indexTemplate = await Bun.file("./public/index.html").text();
} catch {
  console.error("[unspoken] public/index.html missing. Run `bun run build` first.");
  process.exit(1);
}
// Head/shell variants, precomputed once. The SSR markers (<!--SSR_LETTERS-->,
// <!--SSR_ITEMLIST-->) are left intact here; renderPage fills them per request.
const homeBase = indexTemplate.replaceAll("%SITE_URL%", env.SITE_URL);

// Archive route gets its own canonical, og:url, title, and all descriptions so
// it never competes with the home page as duplicate content.
const HOME_DESC =
  "unspoken is a free, anonymous wall for the words you never got to say. No names, no judgment. Write what's on your heart and read what others carry.";
const ALL_DESC =
  "Browse every anonymous letter on unspoken. Real confessions about love, loss, regret, and the things people never got to say out loud.";
const allBase = homeBase
  .replaceAll(`href="${env.SITE_URL}/"`, `href="${env.SITE_URL}/all"`)
  .replaceAll(`content="${env.SITE_URL}/"`, `content="${env.SITE_URL}/all"`)
  .replace(
    "<title>unspoken · say what you never could, anonymously</title>",
    "<title>everything unspoken · every anonymous letter left unsaid</title>",
  )
  .replaceAll(`content="${HOME_DESC}"`, `content="${ALL_DESC}"`)
  .replaceAll(
    `content="A free, anonymous wall for the words you never got to say. No names, no judgment."`,
    `content="${ALL_DESC}"`,
  )
  .replaceAll(
    `content="A free, anonymous wall for the words you never got to say."`,
    `content="${ALL_DESC}"`,
  )
  .replaceAll(
    `content="unspoken · say what you never could"`,
    `content="everything unspoken · every anonymous letter"`,
  );

// --- Security headers ---------------------------------------------------
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      // Cloudflare Web Analytics beacon (cookieless RUM Cloudflare injects at
      // the edge): script from static.cloudflareinsights.com, beacon POST to
      // cloudflareinsights.com. Everything else stays 'self'.
      scriptSrc: ["'self'", "https://static.cloudflareinsights.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://cloudflareinsights.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    referrerPolicy: "strict-origin-when-cross-origin",
    crossOriginEmbedderPolicy: false,
  }),
);

// Lock down device APIs the app never uses + opt out of tracking cohorts.
app.use("*", (c, next) => {
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), interest-cohort=()",
  );
  return next();
});

// --- Compression (never on the SSE stream) ------------------------------
app.use("*", (c, next) => {
  if (c.req.path === "/api/stream") return next();
  return compressMw(c, next);
});

if (!env.isProd) app.use("*", logger());

// --- API flood protection + body size cap -------------------------------
app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/stream") return next();
  if (!globalLimiter.hit(hashIp(getClientIp(c)))) {
    return c.json({ error: "too many requests, slow down." }, 429);
  }
  return next();
});
app.use(
  "/api/*",
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: "that's too large." }, 413) }),
);

app.get("/health", (c) => c.json({ ok: true, live: clientCount() }));

// Admin dashboard (/rootunspoken) + admin API, only if credentials are set.
// Registered before the general /api mount so /api/admin/* matches first.
registerAdmin(app);

app.route("/api", api);

// Unknown API paths return JSON 404 (not the HTML shell).
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// --- Static assets (content-hashed => cache forever) --------------------
app.use("/assets/*", (c, next) => {
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return assetFiles(c, next);
});
app.use("/fonts/*", (c, next) => {
  c.header("Cache-Control", "public, max-age=31536000");
  return assetFiles(c, next);
});
// Brand assets (favicon, icons, OG, manifest) rarely change; give them a long
// cache so repeat visits and the manifest fetch stay off the critical path.
for (const f of [
  "/favicon.svg",
  "/og.png",
  "/og.svg",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
]) {
  const serve = serveStatic({ path: `./public${f}` });
  app.get(f, (c, next) => {
    c.header("Cache-Control", "public, max-age=604800");
    return serve(c, next);
  });
}

// SEO + GEO endpoints (built with the real site URL).
app.get("/robots.txt", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.text(robotsTxt(env.SITE_URL));
});
app.get("/sitemap.xml", async (c) => {
  // Honest lastmod = date of the newest visible letter, so crawlers recrawl on
  // real change. Answer conditional requests with 304 to save crawl budget.
  let lastmod = new Date().toISOString();
  try {
    const rows = await sql`SELECT max(created_at) AS m FROM unspoken WHERE is_hidden = false`;
    if (rows[0]?.m) lastmod = new Date(rows[0].m as string).toISOString();
  } catch {
    /* fall back to now() if the DB is briefly unavailable */
  }
  const etag = `W/"sm-${lastmod}"`;
  if (c.req.header("if-none-match") === etag) return c.body(null, 304);
  c.header("ETag", etag);
  c.header("Last-Modified", new Date(lastmod).toUTCString());
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Content-Type", "application/xml");
  return c.body(sitemapXml(env.SITE_URL, lastmod.slice(0, 10)));
});
app.get("/llms.txt", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.text(llmsTxt(env.SITE_URL));
});

// --- HTML: server-render the live feed into the shell, then let the client
//     app take over #root. Edge-cacheable with stale-while-revalidate so
//     Cloudflare serves rendered HTML from the nearest PoP; the in-process
//     cache keeps origin renders to one Postgres query per feed change. -------
app.get("*", async (c) => {
  const isAll = c.req.path.startsWith("/all");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const html = await renderPage(isAll ? "all" : "home", page, isAll ? allBase : homeBase, env.SITE_URL);
  c.header("Cache-Control", "public, s-maxage=60, stale-while-revalidate=86400, stale-if-error=86400");
  return c.html(html);
});

startRetention();

console.log(`[unspoken] listening on http://localhost:${env.PORT}  (${env.NODE_ENV})`);

// Structured error log; never leak a stack trace to the client.
app.onError((err, c) => {
  console.error(JSON.stringify({ log: "server_error", path: c.req.path, message: err.message, at: new Date().toISOString() }));
  return c.json({ error: "something went wrong" }, 500);
});

export default {
  port: env.PORT,
  fetch: app.fetch,
  // SSE streams must outlive Bun's default 10s idle timeout; 255s is the max.
  idleTimeout: 255,
};
