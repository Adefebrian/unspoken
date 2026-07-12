import { $ } from "bun";
import { readdirSync, rmSync } from "node:fs";
import { basename } from "node:path";

const isProd = (process.env.NODE_ENV ?? "production") !== "development";
const mode = isProd ? "production" : "development";

console.log(`[build] mode=${mode}`);

// Clean previous hashed assets so they do not accumulate.
for (const f of readdirSync("./public/assets")) {
  if (/^(main|styles).*\.(js|css|map)$/.test(f)) rmSync(`./public/assets/${f}`);
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

// 3. Generate public/index.html from the root template with hashed asset paths.
//    %SITE_URL% is left intact; the server fills it from PUBLIC_SITE_URL at
//    startup, so canonical/OG always match the real domain with no build arg.
let html = await Bun.file("./index.html").text();
html = html
  // Function replacer so any `$` in the CSS is not treated as a special token.
  .replace("%HEAD_CSS%", () => `<style>${cssText}</style>`)
  .replaceAll("%JS%", `/assets/${jsName}`);
await Bun.write("./public/index.html", html);
console.log("[build] index.html ✓");
