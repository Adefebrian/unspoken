# Deploy: Oracle Cloud (Always Free ARM) + Cloudflare Tunnel

Free, always-on, low latency for Indonesia, no inbound ports open. Cloudflare
handles TLS + DDoS + edge caching; a tunnel connects the VM outbound to
Cloudflare so nothing is exposed to the internet.

## 0. Prerequisites
- Buy the domain (unspoken.zone) and add it to Cloudflare (free plan).
- Keep the Neon database (already provisioned). Have its `DATABASE_URL`.

## 1. Create the VM (Oracle Cloud, Always Free)
- Region: **Jakarta** or **Singapore** (closest to your users).
- Shape: **Ampere A1 (arm64), Always Free** — up to 4 OCPU / 24 GB. 2 OCPU / 6-8 GB is plenty.
- Image: Ubuntu 22.04/24.04.
- If you see "out of capacity", retry, or upgrade to Pay-As-You-Go (still free within the Always Free allowance, better provisioning priority).
- Only open **SSH (22)** in the security list. No 80/443 needed (the tunnel is outbound).

## 2. Install Docker on the VM
Easiest: at VM creation, under **Advanced options > Management > Initialization
script**, upload `cloud-init.yaml` (installs Docker + git on first boot). Keep
the IMDSv2 "Require authorization header" toggle ON. No secrets go in cloud-init.

Or do it manually after SSH:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

## 3. Get the code + secrets
```bash
git clone <your-repo> unspoken && cd unspoken
cp .env.example .env && nano .env
```
Set in `.env`:
```
DATABASE_URL=postgres://...            # from Neon
IP_SALT=<openssl rand -hex 32>
PUBLIC_SITE_URL=https://unspoken.zone
ADMIN_USER=<your admin username>
ADMIN_PASS=<long random password>
RETENTION_DAYS=30
NODE_ENV=production
PORT=3000
CF_TUNNEL_TOKEN=<from step 4>
```

## 4. Create the Cloudflare Tunnel
- Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel** (cloudflared).
- Name it (e.g. `unspoken`), copy the **tunnel token** into `.env` as `CF_TUNNEL_TOKEN`.
- Add a **Public Hostname**: `unspoken.zone` → Service **HTTP** `http://app:3000`
  (also add `www` if you want, pointing to the same service).

## 5. Launch
```bash
docker compose up -d --build
docker compose run --rm app bun run migrate   # one-time schema setup
docker compose logs -f app                     # confirm it's listening
```

## 6. Cloudflare settings (once)
- SSL/TLS mode: **Full**.
- Caching: static paths (`/assets/*`, `/fonts/*`, `/og.png`, `/favicon.svg`) are
  already sent with long cache headers, so Cloudflare edge-caches them automatically.
- Keep the orange cloud (proxied) on for DDoS + caching.

## 7. Verify
- `https://unspoken.zone` loads, wall + realtime works.
- `https://unspoken.zone/health` returns `{"ok":true}`.
- `https://unspoken.zone/rootunspoken` shows the admin login.

## Updating
```bash
git pull && docker compose up -d --build
docker compose run --rm app bun run migrate    # if new migrations
```

## Scaling later (only if one box saturates)
A single instance holds thousands of concurrent SSE connections. To go beyond,
add Upstash Redis for SSE fan-out + shared rate limits and run multiple app
replicas behind the tunnel. Not needed for launch.
