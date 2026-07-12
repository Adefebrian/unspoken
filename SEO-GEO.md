# SEO and GEO operations

Most SEO/GEO for unspoken is already in the code and deploys automatically. This
file is for the few levers that live outside the repo, in the Cloudflare
dashboard, plus the checks to run after a deploy. A person or a Claude on the VPS
can follow it top to bottom.

## What the code already does (no action needed)

- **Server-renders the live letters into the HTML.** `/` (10 newest) and `/all`
  (paginated) now return the real letter text inside `<article><blockquote>`,
  so non-JS crawlers (GPTBot, ClaudeBot, PerplexityBot) see actual content, not
  an empty app shell. Verified: a `GPTBot` user-agent GET returns the letters.
- **ItemList JSON-LD** of those letters (SocialMediaPosting), script-safe encoded.
- **Per-route metadata**: `/all` has its own title, description, og/twitter tags,
  and canonical, so it never competes with the home page.
- **Honest sitemap**: `lastmod` is the date of the newest letter, and conditional
  requests get `304` to save crawl budget.
- **Edge-cache headers**: HTML is sent with
  `Cache-Control: public, s-maxage=60, stale-while-revalidate=86400, stale-if-error=86400`,
  and an in-process cache means at most one Postgres query per feed change per page.
- **robots.txt** welcomes ~15 AI crawlers; **llms.txt** summarizes the site.

The three items below are the only things a full server plus Cloudflare can do
that the code cannot do for itself.

## 1. Confirm Cloudflare is not blocking AI crawlers (critical, do first)

Cloudflare can silently block the exact bots we want to reach. If GEO matters,
this must be off.

1. Cloudflare dashboard, select the `unspoken.zone` zone.
2. **Security → Bots** (older UIs: **Scrape Shield**). Ensure **"Block AI bots" /
   "AI Scrapers and Crawlers"** is **OFF**. If it is on, GPTBot, ClaudeBot, and
   PerplexityBot get challenged or blocked and your `robots.txt` welcome is moot.
3. **Security → WAF → Managed rules** and **Bot Fight Mode**: make sure no rule is
   challenging or returning 403 to those user-agents. Bot Fight Mode is fine for
   generic bots but verify it is not catching the AI crawlers (check WAF events
   filtered by user-agent after go-live).

## 2. Make Cloudflare edge-cache the HTML (activates the s-maxage header)

Cloudflare does not cache HTML by default, so the `s-maxage` the origin sends is
ignored until you add a cache rule. Without this the site still works, it just
does not get edge acceleration on the HTML.

1. **Caching → Cache Rules → Create rule**. Name it `cache-html`.
2. Match (use the expression editor):
   `(http.request.uri.path eq "/") or (http.request.uri.path eq "/all")`
   This deliberately excludes `/api/*`, `/rootunspoken`, and assets.
3. Settings:
   - **Cache eligibility**: Eligible for cache.
   - **Edge TTL**: **Use cache-control header if present** (respects the origin's
     `s-maxage=60` and stale-while-revalidate).
   - **Browser TTL**: Respect origin.
4. Save. Do **not** use a blanket "Cache Everything" page rule, it would cache the
   admin page and API. The admin page also sends `no-store` as a backstop.

Verify: two quick GETs to `https://unspoken.zone/` should show
`cf-cache-status: MISS` then `HIT`.

## 3. Crawler analytics (see which AI engines actually fetch you)

Cheapest and best source is Cloudflare itself, no code needed:

- **Analytics → Traffic** and **Security → Events**: filter by user-agent to see
  GPTBot / ClaudeBot / PerplexityBot / Googlebot hit counts and status codes.
- If a crawler shows lots of `403`/`503`, revisit step 1.

Optional, from the VPS, to see requests hitting the origin:
```bash
cd ~/unspoken
docker compose logs app | grep -Ei 'gptbot|claudebot|perplexity|googlebot|bingbot'
```
(Cloudflare passes the real client in `CF-Connecting-IP`; the app trusts the
proxy hop for its rate-limit hashing.)

## 4. Submit to search + answer engines (one-time)

- **Google Search Console**: add the property, verify (DNS TXT via Cloudflare is
  easiest), submit `https://unspoken.zone/sitemap.xml`.
- **Bing Webmaster Tools**: same, submit the sitemap (also feeds ChatGPT search).
- Nothing to submit for Claude/Perplexity/Gemini; they discover via crawl. Step 1
  is what actually gets you into their index.

## 5. Post-deploy verification checklist

Run these from anywhere after the site is live:

```bash
# A non-JS crawler sees real letters (not just the shell):
curl -s -A "GPTBot/1.0" https://unspoken.zone/ | grep -c "<article><blockquote>"   # > 0

# ItemList structured data is present:
curl -s https://unspoken.zone/ | grep -c '"@type":"ItemList"'                       # 1

# /all has its own description:
curl -s https://unspoken.zone/all | grep -c "Browse every anonymous letter"         # 1

# Sitemap has a real, recent lastmod and supports conditional GET:
curl -sI https://unspoken.zone/sitemap.xml | grep -i etag
etag=$(curl -sI https://unspoken.zone/sitemap.xml | awk -F': ' '/etag/{print $2}' | tr -d '\r')
curl -s -o /dev/null -w "%{http_code}\n" -H "If-None-Match: $etag" https://unspoken.zone/sitemap.xml   # 304

# HTML is edge-cacheable (after step 2):
curl -sI https://unspoken.zone/ | grep -i cf-cache-status
```

## Not worth doing (deliberately skipped)

- Per-letter URLs and a segmented sitemap: fights the ephemeral, anonymous design.
- Headless-Chrome prerendering: redundant now that the feed renders server-side.
- Heavy investment in llms.txt beyond the summary already served: measured AI
  crawler engagement with it is negligible; it is cheap insurance, not a lever.
- HTTP/3, Early Hints, Brotli tuning: Cloudflare already provides these; near-zero
  ROI for a two-route site.
