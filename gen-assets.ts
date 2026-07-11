// One-off: rasterize the brand SVGs into the PNGs that social platforms and
// app installs require (SVG OG images do not render on X/Facebook, and
// apple-touch / maskable icons must be PNG). Run: bun run gen-assets.ts
import { Resvg } from "@resvg/resvg-js";

async function render(svgPath: string, outPath: string, width: number) {
  const svg = await Bun.file(svgPath).text();
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    // Prefer the embedded brand font; fall back to system sans so text always
    // renders. Every line uses the same family, so they match.
    font: {
      fontFiles: ["./public/fonts/inter.woff2"],
      loadSystemFonts: true,
      defaultFontFamily: "Inter",
    },
    background: "#f3efe6",
  });
  await Bun.write(outPath, r.render().asPng());
  console.log(`  ${outPath} (${width}w)`);
}

await render("./public/og.svg", "./public/og.png", 1200);
await render("./public/icon.svg", "./public/icon-512.png", 512);
await render("./public/icon.svg", "./public/icon-192.png", 192);
await render("./public/icon.svg", "./public/icon-180.png", 180);
console.log("[gen-assets] done");
