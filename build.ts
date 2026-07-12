import { $ } from "bun";
import { readdirSync, rmSync } from "node:fs";
import { basename } from "node:path";

const isProd = (process.env.NODE_ENV ?? "production") !== "development";
const mode = isProd ? "production" : "development";

console.log(`[build] mode=${mode}`);

// Clean previous build output (hashed entry + lazy chunks) so it does not
// accumulate. Leaves non-build files like .gitkeep in place.
for (const f of readdirSync("./public/assets")) {
  if (/\.(js|css|map)$/.test(f)) rmSync(`./public/assets/${f}`);
}

// 1. Tailwind CSS. Inlined into the HTML head (it is ~8 KiB) so there is no
//    render-blocking stylesheet request in the critical path (better FCP/LCP).
const cssArgs = ["@tailwindcss/cli", "-i", "./src/client/index.css", "-o", "./public/assets/styles.css"];
if (isProd) cssArgs.push("--minify");
await $`bunx ${cssArgs}`;
const cssText = await Bun.file("./public/assets/styles.css").text();
rmSync("./public/assets/styles.css");
console.log(`[build] css inlined (${(cssText.length / 1024).toFixed(1)} KiB)`);

// 2. React app -> hashed main-<hash>.js
const result = await Bun.build({
  entrypoints: ["./src/client/main.tsx"],
  outdir: "./public/assets",
  naming: "[name]-[hash].[ext]",
  target: "browser",
  minify: isProd,
  // Emit dynamic import() targets (e.g. Lenis) as separate lazy chunks instead
  // of inlining them into the entry bundle.
  splitting: true,
  sourcemap: isProd ? "none" : "linked",
  define: { "process.env.NODE_ENV": JSON.stringify(mode) },
});
if (!result.success) {
  console.error("[build] js failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
const jsOut = result.outputs.find((o) => o.path.endsWith(".js"));
if (!jsOut) {
  console.error("[build] no js output");
  process.exit(1);
}
const jsName = basename(jsOut.path);
console.log(`[build] js -> ${jsName}`);

// modulepreload the entry plus the chunks it imports STATICALLY (e.g. the React
// vendor chunk), so they download in parallel instead of waterfalling after the
// entry parses. Chunks referenced only via dynamic import() (Lenis, web-vitals,
// the archive route) are left out on purpose so they stay lazy.
const entryText = await Bun.file(jsOut.path).text();
const chunkRe = /["']\.\/(chunk-[A-Za-z0-9_]+\.js)["']/g;
const dynamicRe = /import\(\s*["']\.\/(chunk-[A-Za-z0-9_]+\.js)["']/g;
const dynamic = new Set([...entryText.matchAll(dynamicRe)].map((m) => m[1]));
const staticChunks = [...new Set([...entryText.matchAll(chunkRe)].map((m) => m[1]))].filter(
  (c) => !dynamic.has(c),
);
const preloads = [jsName, ...staticChunks]
  .map((n) => `<link rel="modulepreload" href="/assets/${n}" />`)
  .join("\n    ");
console.log(`[build] preloading ${1 + staticChunks.length} module(s), ${dynamic.size} lazy`);

// 3. Generate public/index.html from the root template with hashed asset paths.
//    %SITE_URL% is left intact; the server fills it from PUBLIC_SITE_URL at
//    startup, so canonical/OG always match the real domain with no build arg.
let html = await Bun.file("./index.html").text();
html = html
  // Function replacer so any `$` in the CSS is not treated as a special token.
  .replace("%HEAD_CSS%", () => `<style>${cssText}</style>`)
  .replace("%JS_PRELOADS%", () => preloads)
  .replaceAll("%JS%", `/assets/${jsName}`);
await Bun.write("./public/index.html", html);
console.log("[build] index.html ✓");
