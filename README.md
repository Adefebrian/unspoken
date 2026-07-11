# unspoken

An anonymous wall for the things left unsaid. No names, no purpose fields, just
what's been sitting on your chest. Home shows the 10 newest in realtime; the
full archive is paginated. Two reactions per note: **same** (relate) and **hug**.

## Stack

- **Runtime:** Bun (single fullstack process, no Vite)
- **Server:** Hono, serves the API, the built client, and the SSE stream
- **Client:** React + TypeScript, bundled by `Bun.build`, Tailwind v4, Framer Motion, Lenis
- **DB:** Neon Postgres (`@neondatabase/serverless`)
- **Realtime:** Server-Sent Events (new note / reaction / hide are pushed to every open tab)

## Getting started

```bash
bun install
cp .env.example .env   # fill in DATABASE_URL and a random IP_SALT
```

### Develop (hot reload)

```bash
bun run dev            # http://localhost:3000
```

Runs Tailwind watch + Bun bundle watch + a hot-reloading Hono server.

### Production build + run locally

```bash
bun run serve          # builds, then serves on http://localhost:3000
```

Or split: `bun run build` then `bun run start`.

## Database

Schema (already provisioned on Neon):

- `unspoken`: id, body, relate_count, hug_count, report_count, is_hidden, created_at
- `reactions`: (unspoken_id, ip_hash, type) unique; de-dupes relate/hug per visitor
- `reports`: (unspoken_id, ip_hash) unique; note auto-hides at 3 unique reports

## Safety and anti-abuse

- **Post rate limit:** 5 successful posts / 10 min per visitor (rejected attempts do not count).
- **Global L7 limit:** 120 API requests / min per IP; reactions 40/min, reports 15/min.
- **SSE caps:** max 5 stream connections per IP, 2000 global (anti connection-exhaustion).
- **Body size cap:** 64 KB per request (413 otherwise).
- **No links:** URLs are blocked in posts (kills promo spam).
- **Duplicate suppression:** the same text cannot be reposted within 10 min.
- **Profanity/slur filter:** hard slurs (EN + ID) blocked on submit.
- **Anonymity:** IPs are only ever stored as a salted SHA-256 hash (`IP_SALT`), never raw. The trusted proxy hop is used so `X-Forwarded-For` cannot be spoofed.
- **Security headers:** CSP, HSTS, `X-Content-Type-Options`, `frame-ancestors 'none'`, Referrer-Policy.

> App-level protections cover L7 (application) abuse. For volumetric L3/L4 DDoS,
> put the domain behind a proxy such as Cloudflare.

## Performance

- No Vite: `Bun.build` bundles the app. JS is ~67 KB gzipped.
- Gzip/Brotli compression on all responses (except the SSE stream).
- Content-hashed assets (`main-<hash>.js`, `styles-<hash>.css`) served with
  `Cache-Control: immutable`; HTML is `no-cache` so new deploys propagate instantly.

## SEO and GEO

- Rich `<title>`/description, canonical, Open Graph + Twitter cards, `og.svg`.
- JSON-LD: `WebSite`, `WebApplication`, `FAQPage`.
- Crawlable static content in the HTML shell (replaced by the app on load) + `<noscript>`.
- `/sitemap.xml`, `/robots.txt` (welcomes GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot).
- `/llms.txt` summary for generative answer engines (GEO).
- All of the above use `PUBLIC_SITE_URL` for absolute links, so **set it in production**.

## Admin

`/rootunspoken` is a Basic-Auth dashboard (username/password from `ADMIN_USER` +
`ADMIN_PASS`) that lists only **flagged** letters (report_count > 0) and lets you
permanently delete them. It is `noindex`, disabled entirely if the creds are
unset, rate-limited, and delete is same-origin (CSRF) guarded. Deleting also
pushes an SSE hide so it vanishes from open walls instantly.

## Retention

Every letter is permanently removed after `RETENTION_DAYS` (default 30). A sweep
runs on boot and every 6 hours. This is intentional and not surfaced in the UI.

## Deploy (Coolify)

Uses the included `Dockerfile` (Bun + Hono is a persistent container, which SSE
needs). Set env vars `DATABASE_URL`, `IP_SALT` (strong secret, required in prod),
`PUBLIC_SITE_URL` (your real domain), `ADMIN_USER` + `ADMIN_PASS` (enable the
dashboard; use a long random password), `RETENTION_DAYS` (default 30),
`PORT=3000`, `NODE_ENV=production`.

## API

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/api/unspoken/latest` | 10 newest |
| GET | `/api/unspoken?page=N` | paginated (20/page) |
| POST | `/api/unspoken` | create `{ body }` |
| POST | `/api/unspoken/:id/react` | `{ type: "relate" \| "hug" }` |
| POST | `/api/unspoken/:id/report` | report (soft-hide at 3) |
| GET | `/api/stream` | SSE: `new`, `reaction`, `hide` |
| GET | `/health` | liveness + live client count |
