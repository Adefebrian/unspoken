import { test, expect } from "bun:test";
import { robotsTxt, sitemapXml, llmsTxt } from "./seo.ts";

const S = "https://unspoken.zone";

test("robots welcomes AI crawlers and points to the sitemap", () => {
  const r = robotsTxt(S);
  for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
    expect(r).toContain(bot);
  }
  expect(r).toContain(`Sitemap: ${S}/sitemap.xml`);
});

test("sitemap has both routes with lastmod", () => {
  const x = sitemapXml(S);
  expect(x).toContain(`<loc>${S}/</loc>`);
  expect(x).toContain(`<loc>${S}/all</loc>`);
  expect(x).toContain("<lastmod>");
});

test("llms.txt describes the app on the real domain", () => {
  const l = llmsTxt(S);
  expect(l.startsWith("# unspoken")).toBe(true);
  expect(l.toLowerCase()).toContain("anonymous");
  expect(l).toContain(`${S}/`);
});
