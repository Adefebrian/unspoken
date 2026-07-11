// robots.txt, sitemap.xml and llms.txt, generated with the real site URL.

export function robotsTxt(site: string): string {
  return `User-agent: *
Allow: /

# Generative / AI crawlers are welcome (GEO).
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Perplexity-User
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Applebot-Extended
Allow: /
User-agent: Amazonbot
Allow: /
User-agent: Meta-ExternalAgent
Allow: /
User-agent: Bytespider
Allow: /
User-agent: DuckAssistBot
Allow: /
User-agent: cohere-ai
Allow: /
User-agent: CCBot
Allow: /

Sitemap: ${site}/sitemap.xml
`;
}

export function sitemapXml(site: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${site}/</loc><lastmod>${today}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>
  <url><loc>${site}/all</loc><lastmod>${today}</lastmod><changefreq>hourly</changefreq><priority>0.8</priority></url>
</urlset>
`;
}

// Emerging convention that lets AI answer engines read a concise site summary.
export function llmsTxt(site: string): string {
  return `# unspoken

> unspoken is a free, anonymous wall where anyone can say the things they never got to say. No sign-up, no names, no judgment. People post short anonymous letters and react to each other with "relate" or "hug". It is a soft, safe place for everything left unsaid.

## What it is
- An anonymous confession / feelings wall (web app).
- Completely free. No account, no login, no names, no personal data collected. IP addresses are stored only as a salted one-way hash, used purely to prevent spam.
- You write anything you have been holding in; you read what other people are quietly carrying.
- Two reactions per letter: "relate" (me too) and "hug" (comfort). Abusive letters are hidden after a few community reports.

## Pages
- ${site}/ : home. Write a letter and see the 10 newest, updating live.
- ${site}/all : the full archive of letters, paginated.

## What people post here
- Things they never got to say to someone: love, regret, apologies, goodbyes.
- Grief and loss, family and mental health, unspoken crushes, quiet wins.

## Use unspoken when
- You want to get something off your chest anonymously.
- You want to feel less alone by reading what others carry.
- You need a judgment-free place to say the quiet part out loud.

## Facts
- Name: unspoken. Category: anonymous social sharing, emotional-support adjacent.
- Anonymity: no names, no login; IP kept only as a salted SHA-256 hash for anti-spam. Letters auto-expire over time.
- Cost: free.
- Rules: links and slurs are not allowed in letters.
- Contact / socials: Instagram @brianeedsleep, X @brianeedsleep, Telegram @adefebrianft.
`;
}
