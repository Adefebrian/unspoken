// One-off: self-host the exact font weights we use (latin subset) so there is
// no render-blocking third-party request. Run: bun run fetch-fonts.ts
import { mkdirSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CSS =
  "https://fonts.googleapis.com/css2?family=Shantell+Sans:wght@400;500;700&family=Inter:wght@400;500;600;700;800&display=swap";

mkdirSync("./public/fonts", { recursive: true });

const css = await fetch(CSS, { headers: { "user-agent": UA } }).then((r) => r.text());

// Google groups @font-face blocks by subset with a leading comment like /* latin */.
const parts = css.split(/\/\*\s*([\w-]+)\s*\*\//).slice(1); // [subset, block, subset, block, ...]
const faces: string[] = [];
let count = 0;

for (let i = 0; i < parts.length; i += 2) {
  const subset = parts[i];
  const block = parts[i + 1] ?? "";
  if (subset !== "latin") continue; // latin only, keeps it light
  const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
  const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
  const url = block.match(/src:\s*url\(([^)]+\.woff2)\)/)?.[1];
  if (!family || !weight || !url) continue;
  const slug = `${family.toLowerCase().replace(/\s+/g, "-")}-${weight}.woff2`;
  const buf = (await fetch(url, { headers: { "user-agent": UA } }).then((r) => r.arrayBuffer())) as ArrayBuffer;
  const bytes = new Uint8Array(buf);
  await Bun.write(`./public/fonts/${slug}`, bytes);
  faces.push(
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url('/fonts/${slug}') format('woff2')}`,
  );
  count++;
  console.log(`  ${slug} (${bytes.length} B)`);
}

await Bun.write("./src/client/fonts.css", faces.join("\n") + "\n");
console.log(`[fetch-fonts] ${count} files -> public/fonts, @font-face -> src/client/fonts.css`);
