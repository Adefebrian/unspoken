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
const homeHtml = indexTemplate.replaceAll("%SITE_URL%", env.SITE_URL);
// Archive route gets its own canonical / og:url / title (no duplicate content).
const allHtml = homeHtml
  .replaceAll(`href="${env.SITE_URL}/"`, `href="${env.SITE_URL}/all"`)
  .replaceAll(`content="${env.SITE_URL}/"`, `content="${env.SITE_URL}/all"`)
  .replace(
    "<title>unspoken · say what you never could, anonymously</title>",
    "<title>everything unspoken · every anonymous letter left unsaid</title>",
  );

// --- Security headers ---------------------------------------------------
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
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
for (const f of [
  "/favicon.svg",
  "/og.png",
  "/og.svg",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
]) {
  app.get(f, serveStatic({ path: `./public${f}` }));
}

// SEO + GEO endpoints (built with the real site URL).
app.get("/robots.txt", (c) => c.text(robotsTxt(env.SITE_URL)));
app.get("/sitemap.xml", (c) => {
  c.header("Content-Type", "application/xml");
  return c.body(sitemapXml(env.SITE_URL));
});
app.get("/llms.txt", (c) => c.text(llmsTxt(env.SITE_URL)));

// --- SPA fallback: HTML must stay fresh (it points at hashed assets) ----
app.get("*", (c) => {
  c.header("Cache-Control", "no-cache");
  return c.html(c.req.path.startsWith("/all") ? allHtml : homeHtml);
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
