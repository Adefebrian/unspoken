# Deploy & operate unspoken

Self-hosted, single-box, free forever. Everything (app, Postgres, Redis) runs in
Docker on one Oracle Cloud Always Free ARM VM. Cloudflare fronts it for TLS,
DDoS, and edge caching over an outbound tunnel, so the VM opens **no inbound
port except SSH**. Pushes to `main` deploy automatically.

This is a runbook: follow it top to bottom for the first deploy, then the app
updates itself on every push.

---

## Architecture

```
                        users
                          │  https://unspoken.zone
                    Cloudflare edge  (TLS, DDoS, cache)
                          │  outbound tunnel (no open ports)
   ┌──────────────────────┴───────────────────────────────┐
   │  Oracle A1 VM (Ubuntu, arm64)     docker compose      │
   │                                                        │
   │   cloudflared ──► app:3000 (Bun + Hono)                │
   │                     ├── postgres  (letters, on volume) │
   │                     └── redis      (SSE fan-out)        │
   └────────────────────────────────────────────────────────┘
```

- **app**: Bun + Hono, serves the API, the built React client, and the SSE
  realtime stream. Stateless, so it scales horizontally (`--scale app=N`).
- **postgres**: durable store for letters/reactions/reports. Named volume
  `pgdata`, no host port.
- **redis**: pub/sub bus that fans SSE events across app replicas, plus a
  memory cap and no persistence (losing it loses nothing durable). No host port.
- **migrate**: one-shot service that applies `migrations/*.sql` and exits; the
  app waits for it to finish before serving, so schema is always current.
- **cloudflared**: outbound tunnel to Cloudflare. Nothing listens on the VM.

Why not Neon/serverless: the app holds long-lived SSE connections and in-memory
state; a single always-on process (or a few) is the right fit and stays free.

---

## 0. Prerequisites (already done or one-time)

- VM created (Oracle A1, Ubuntu arm64) with a **public IP** and **only SSH (22)**
  open in the security list. Docker + compose are installed by `cloud-init.yaml`.
- Domain `unspoken.zone` added to Cloudflare (free plan), nameservers pointed.
- You can SSH in: `ssh ubuntu@<VM_PUBLIC_IP>`.

---

## 1. Let the VM read the private repo (deploy key)

The repo is private, so the VM needs read access. On the **VM**:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/unspoken_repo -N "" -C "unspoken-vm"
cat ~/.ssh/unspoken_repo.pub
```

Copy that public key into GitHub → repo **Settings → Deploy keys → Add deploy
key** (read-only, do **not** allow write). Then tell git to use it:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/unspoken_repo
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

Clone into the home directory (the deploy step expects `~/unspoken`):

```bash
cd ~ && git clone git@github.com:Adefebrian/unspoken.git
cd ~/unspoken
```

---

## 2. Create the secrets file

```bash
cp .env.example .env
```

Generate strong values and fill `.env`. Never commit it (it is gitignored).

```bash
echo "IP_SALT=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "REDIS_PASSWORD=$(openssl rand -hex 24)"
echo "ADMIN_PASS=$(openssl rand -hex 24)"
```

Edit `.env` so it is internally consistent:

- `DATABASE_URL` must reuse `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`
  and use host `postgres` (the compose service name), e.g.
  `postgres://unspoken:<POSTGRES_PASSWORD>@postgres:5432/unspoken`.
- `REDIS_URL` must reuse `REDIS_PASSWORD`, host `redis`:
  `redis://:<REDIS_PASSWORD>@redis:6379`.
- `PUBLIC_SITE_URL=https://unspoken.zone`
- `ADMIN_USER=root`, `ADMIN_PASS=<generated>` (the /rootunspoken dashboard).
- `CF_TUNNEL_TOKEN=` is filled in the next step.

---

## 3. Create the Cloudflare Tunnel

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel**,
   connector **cloudflared**. Name it `unspoken`.
2. Copy the **tunnel token** into `.env` as `CF_TUNNEL_TOKEN=...`.
3. Under the tunnel's **Public Hostname**, add:
   - Hostname `unspoken.zone`, Service **HTTP** → `app:3000`.
   - (Optional) `www.unspoken.zone` → same `app:3000`.
4. **SSL/TLS** for the zone: set encryption mode to **Full**. Keep the orange
   cloud (proxied) on so Cloudflare handles TLS, caching, and DDoS.

---

## 4. First launch

```bash
docker compose up -d --build
docker compose ps          # postgres+redis healthy, migrate exited 0, app+cloudflared up
docker compose logs -f app # should print: listening + "realtime bus: Redis pub/sub"
```

Migrations run automatically (the `migrate` service). No manual step.

---

## 5. Verify

```bash
curl -s https://unspoken.zone/health          # {"ok":true,...}
```

- `https://unspoken.zone` loads; posting a letter shows it instantly (SSE).
- `https://unspoken.zone/rootunspoken` shows the admin login.
- Open the site in two browsers: a letter posted in one appears live in the
  other (realtime through Redis).

---

## 6. Turn on automatic deploys (CI/CD)

On every push to `main`, GitHub Actions runs typecheck + tests + build, then SSHes
into the VM and runs `git pull && docker compose up -d --build`.

**a. Make a dedicated CI deploy key** (separate from your personal key and from
the repo read key). On your laptop:

```bash
ssh-keygen -t ed25519 -f ./ci_deploy -N "" -C "github-actions"
```

**b. Authorize it on the VM**: append `ci_deploy.pub` to the VM's
`~/.ssh/authorized_keys`:

```bash
ssh-copy-id -i ./ci_deploy.pub ubuntu@<VM_PUBLIC_IP>
# or: cat ci_deploy.pub | ssh ubuntu@<VM_PUBLIC_IP> 'cat >> ~/.ssh/authorized_keys'
```

**c. Add repo secrets**: GitHub → repo **Settings → Secrets and variables →
Actions → New repository secret**:

| Secret           | Value                                        |
| ---------------- | -------------------------------------------- |
| `DEPLOY_HOST`    | the VM public IP                             |
| `DEPLOY_USER`    | `ubuntu`                                     |
| `DEPLOY_SSH_KEY` | the full contents of the private `ci_deploy` |

Delete the local `ci_deploy` files afterward. Push to `main` and watch the
**Actions** tab: `check` then `deploy` should both go green.

---

## 7. Scaling (only if one instance saturates)

State lives in Postgres and Redis, so the app is stateless and scales out:

```bash
docker compose up -d --scale app=3
```

Cloudflared round-robins across replicas; Redis fan-out means any replica
delivers every realtime event. Keep `(replicas × PG_POOL_MAX)` below Postgres
`max_connections` (100 by default here → up to ~9 replicas at pool 10). One
instance already handles thousands of concurrent connections, so you likely
never need this.

---

## 8. Operations

**Update manually** (CI does this for you on push):
```bash
cd ~/unspoken && git pull && docker compose up -d --build
```

**Logs:**
```bash
docker compose logs -f app
docker compose logs --since=1h cloudflared
```

**Back up the database** (letters). Run from `~/unspoken`:
```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > ~/unspoken-backup-$(date +%F).sql.gz
```
Add it to `crontab -e` for a daily backup:
```
0 3 * * * cd ~/unspoken && docker compose exec -T postgres pg_dump -U unspoken unspoken | gzip > ~/backups/unspoken-$(date +\%F).sql.gz
```

**Restore:**
```bash
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

**(Optional) import old Neon data** on first launch, before going live:
```bash
pg_dump "<OLD_NEON_DATABASE_URL>" --no-owner --no-privileges \
  | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

---

## Security summary

- **No inbound ports** except SSH; the app reaches the world only via
  Cloudflare's outbound tunnel. Postgres and Redis are on the private compose
  network, unreachable from the host or internet.
- **Cloudflare** absorbs L3/L4 DDoS and TLS; the app adds L7 limits, a strict
  CSP, HSTS, and a locked Permissions-Policy.
- **Secrets** live only in `.env` on the VM (gitignored) and in GitHub Actions
  secrets. Redis is password-protected; Postgres uses a generated password.
- **Least privilege**: the app container runs as a non-root user; the CI key and
  the repo read key are separate and the read key is read-only.
- **Anonymity**: raw IPs are never stored, only salted SHA-256 hashes (`IP_SALT`).
- **SSH hardening** (from `cloud-init.yaml`): key-only auth, no root login,
  fail2ban, unattended security upgrades.

---

## Troubleshooting

- `app` unhealthy / restarting → `docker compose logs app`. Usually a bad
  `DATABASE_URL`/`REDIS_URL` in `.env` (host must be `postgres` / `redis`).
- `502` from Cloudflare → the tunnel Public Hostname must point at `app:3000`
  and `CF_TUNNEL_TOKEN` must match the tunnel.
- CI `deploy` fails at SSH → check the three `DEPLOY_*` secrets and that
  `ci_deploy.pub` is in the VM's `authorized_keys`.
- Realtime not updating across instances → confirm `REDIS_URL` is set and the
  app log says `realtime bus: Redis pub/sub`, not `in-process`.
