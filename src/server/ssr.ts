import { sql, type Row } from "./db.ts";

// Server-renders the visible letters into the HTML shell so crawlers and, more
// importantly, non-JS AI answer engines (GPTBot, ClaudeBot, PerplexityBot) see
// real content instead of an empty SPA shell. The React app still takes over
// #root for human visitors; this only enriches the response bytes.
//
// Rendered HTML is cached in-process keyed by (route, page). The cache is
// cleared whenever the visible feed changes (new letter / hide / delete) via
// bumpFeedVersion(), so a warm Postgres query happens at most once per change
// per page, not once per request.

const HOME_LIMIT = 10;
const PAGE_SIZE = 20;
const CACHE_MAX = 200;

const cache = new Map<string, string>();

/** Invalidate the rendered-HTML cache after the feed's contents change. */
export function bumpFeedVersion(): void {
  cache.clear();
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function renderArticles(rows: Row[]): string {
  if (!rows.length) {
    return `<p>No letters yet. Be the first to say the unspoken.</p>`;
  }
  return rows
    .map((r) => {
      const body = esc(String(r.body));
      const iso = new Date(r.created_at as string).toISOString();
      const relate = Number(r.relate_count ?? 0);
      const hug = Number(r.hug_count ?? 0);
      return `<article><blockquote>${body}</blockquote><footer><time datetime="${iso}">${iso.slice(0, 10)}</time> · relate ${relate} · hug ${hug}</footer></article>`;
    })
    .join("\n");
}

// Embed an ItemList of the letters for generative engines. JSON is script-safe
// encoded (`<` escaped) so a letter body can never break out of the tag.
function itemListJsonLd(rows: Row[], pageUrl: string): string {
  if (!rows.length) return "";
  const doc = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Latest anonymous letters on unspoken",
    itemListElement: rows.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SocialMediaPosting",
        headline: String(r.body).slice(0, 90),
        articleBody: String(r.body).slice(0, 500),
        datePublished: new Date(r.created_at as string).toISOString(),
        url: pageUrl,
        isAccessibleForFree: true,
        interactionStatistic: [
          { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: Number(r.relate_count ?? 0) },
        ],
      },
    })),
  };
  const json = JSON.stringify(doc).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

async function fetchRows(route: "home" | "all", page: number): Promise<Row[]> {
  if (route === "home") {
    return (await sql`
      SELECT id, body, relate_count, hug_count, created_at
      FROM unspoken WHERE is_hidden = false
      ORDER BY created_at DESC LIMIT ${HOME_LIMIT}
    `) as Row[];
  }
  const offset = (page - 1) * PAGE_SIZE;
  return (await sql`
    SELECT id, body, relate_count, hug_count, created_at
    FROM unspoken WHERE is_hidden = false
    ORDER BY created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `) as Row[];
}

/**
 * Return the full HTML for a route with the live letters injected. `base` is the
 * precomputed head/shell variant (home or /all) whose SSR markers are still
 * present. On a DB error the shell is still returned (markers emptied) so users
 * always get a page and the client app can retry the API.
 */
export async function renderPage(
  route: "home" | "all",
  page: number,
  base: string,
  siteUrl: string,
): Promise<string> {
  const key = `${route}:${page}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit); // LRU touch
    return hit;
  }

  let articles = "";
  let jsonld = "";
  try {
    const rows = await fetchRows(route, page);
    const pageUrl = route === "home" ? `${siteUrl}/` : `${siteUrl}/all`;
    articles = renderArticles(rows);
    jsonld = itemListJsonLd(rows, pageUrl);
  } catch (e) {
    console.error(JSON.stringify({ log: "ssr_render_failed", route, page, message: String(e) }));
    // Fall through with empty injections: serve the shell, never 500 the page.
    return base.replace("<!--SSR_LETTERS-->", "").replace("<!--SSR_ITEMLIST-->", "");
  }

  const html = base.replace("<!--SSR_LETTERS-->", articles).replace("<!--SSR_ITEMLIST-->", jsonld);

  cache.set(key, html);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return html;
}
