function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\n[unspoken] Missing required env var: ${name}`);
    console.error(`Copy .env.example to .env and fill it in.\n`);
    process.exit(1);
  }
  return value;
}

const NODE_ENV = process.env.NODE_ENV ?? "development";

const PORT = Number(process.env.PORT ?? 3000);

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  IP_SALT: process.env.IP_SALT ?? "unspoken-dev-salt-change-me",
  PORT,
  NODE_ENV,
  isProd: NODE_ENV === "production",
  // Absolute site URL for canonical / OG / sitemap / llms.txt.
  SITE_URL: (process.env.PUBLIC_SITE_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, ""),
  // Admin dashboard (/rootunspoken). Disabled unless both are set.
  ADMIN_USER: process.env.ADMIN_USER ?? "",
  ADMIN_PASS: process.env.ADMIN_PASS ?? "",
  // Letters auto-expire after this many days (not shown in the UI).
  RETENTION_DAYS: Number(process.env.RETENTION_DAYS ?? 30),
};

if (env.isProd && env.ADMIN_PASS && env.ADMIN_PASS.length < 12) {
  console.warn("[unspoken] WARNING: ADMIN_PASS is short. Use a long random password.");
}

// Anonymity depends on IP_SALT being a real secret (ip_hash is otherwise
// brute-forceable across the ~4B IPv4 space). Fail closed in production rather
// than silently hashing with a known/weak salt.
if (env.isProd) {
  const raw = process.env.IP_SALT;
  if (!raw || raw.includes("change-me") || raw.length < 16) {
    console.error(
      "[unspoken] IP_SALT must be set to a strong secret (>= 16 chars) in production. Refusing to start.",
    );
    process.exit(1);
  }
}
