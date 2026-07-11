# Multi-stage. Works on arm64 (Oracle Ampere) and amd64.
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Builds hashed client assets + generates public/index.html from the template.
RUN NODE_ENV=production bun run build.ts

FROM oven/bun:1.3-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/migrate.ts ./migrate.ts
COPY --from=build /app/index.html ./index.html
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
# DATABASE_URL, IP_SALT, PUBLIC_SITE_URL, ADMIN_USER, ADMIN_PASS provided at runtime.
CMD ["bun", "run", "src/server/index.ts"]
