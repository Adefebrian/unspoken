// Dev orchestrator: generate index.html (fixed asset names) + Tailwind watch +
// Bun bundle watch + hot-reloading server. No Vite; Bun does the bundling.

// %SITE_URL% is filled by the server at startup, not here.
const template = await Bun.file("./index.html").text();
const html = template
  // Dev keeps the CSS external so Tailwind --watch can hot-reload it. Prod
  // inlines it (see build.ts).
  .replaceAll("%HEAD_CSS%", '<link rel="stylesheet" href="/assets/styles.css" />')
  .replaceAll("%JS%", "/assets/main.js");
await Bun.write("./public/index.html", html);

const define = `process.env.NODE_ENV=${JSON.stringify("development")}`;

const watchers: Bun.Subprocess[] = [
  Bun.spawn(
    [
      "bunx",
      "@tailwindcss/cli",
      "-i",
      "./src/client/index.css",
      "-o",
      "./public/assets/styles.css",
      "--watch",
    ],
    { stdout: "inherit", stderr: "inherit" },
  ),
  Bun.spawn(
    [
      "bun",
      "build",
      "./src/client/main.tsx",
      "--outdir",
      "./public/assets",
      "--target",
      "browser",
      "--define",
      define,
      "--watch",
    ],
    { stdout: "inherit", stderr: "inherit" },
  ),
];

await Bun.sleep(1200);

const server = Bun.spawn(["bun", "--hot", "run", "./src/server/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
});

function shutdown() {
  for (const w of watchers) w.kill();
  server.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.exited;
shutdown();
