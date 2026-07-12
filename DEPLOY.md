# Deploy & operate unspoken

Self-hosted, single-box, free forever. Everything (nginx, app, Postgres, Redis)
runs in Docker on one Oracle Cloud Always Free ARM VM. Cloudflare stays in front
(proxied) for DDoS and CDN; nginx on the VM terminates TLS with a Cloudflare
Origin Certificate and reverse-proxies to the app. Pushes to `main` deploy
automatically.

This is a runbook: follow it top to bottom for the first deploy, then the app
updates itself on every push.

---

## Architecture

```
                         users
                           │  https://unspoken.zone
                     Cloudflare edge   (DDoS, CDN, TLS to the browser)
                           │  https to origin IP :443  (Full strict)
   ┌───────────────────────┴────────────────────────────────┐
   │  Oracle A1 VM (Ubuntu, arm64)      docker compose        │
   │                                                          │
   │   nginx :80/:443  ──►  app:3000 (Bun + Hono)             │
   │   (Origin cert,          ├── postgres  (letters, volume) │
   │    reverse proxy)        └── redis      (SSE fan-out)     │
   └──────────────────────────────────────────────────────────┘
```

- **nginx**: terminates TLS with the Cloudflare Origin Certificate, restores the
  real client IP from `CF-Connecting-IP`, proxies to the app (with SSE-safe
  settings). The only service that publishes host ports (80, 443).
- **app**: Bun + Hono, serves the API, the built React client, and the SSE
  realtime stream. Stateless. No host port (nginx reaches it internally).
- **postgres**: durable store for letters/reactions/reports. Named volume
  `pgdata`, no host port.
- **redis**: pub/sub bus that fans SSE events across app replicas, memory-capped,
  no persistence (losing it loses nothing durable). No host port.
- **migrate**: one-shot service that applies `migrations/*.sql` and exits; the
  app waits for it before serving, so schema is always current.

Why Cloudflare stays in front: you keep free L3/L4 DDoS absorption and CDN, while
the Origin Certificate (15-year, no renewal) means TLS on the box never expires
on you. Lock the VM firewall to Cloudflare IPs so nobody can bypass the edge.

---

## 0. Prerequisites (already done or one-time)

- VM created (Oracle A1, Ubuntu arm64) with a **public IP**. Docker + compose
  installed by `cloud-init.yaml`. SSH (22) reachable.
- Domain `unspoken.zone` added to Cloudflare (free plan), nameservers pointed.
- You can SSH in: `ssh ubuntu@<VM_PUBLIC_IP>`.

---

## 1. Let the VM read the private repo (deploy key)

On the **VM**:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/unspoken_repo -N "" -C "unspoken-vm"
cat ~/.ssh/unspoken_repo.pub
```

Add that public key to GitHub → repo **Settings → Deploy keys → Add deploy key**
(read-only, do **not** allow write). Then:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/unspoken_repo
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
cd ~ && git clone git@github.com:Adefebrian/unspoken.git
cd ~/unspoken
```

---

## 2. Create the secrets file

```bash
cp .env.example .env
openssl rand -hex 32   # IP_SALT
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 24   # REDIS_PASSWORD
openssl rand -hex 24   # ADMIN_PASS
```

Edit `.env` so it is internally consistent (never commit it, it is gitignored):

- `DATABASE_URL` reuses `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`, host
  `postgres`: `postgres://unspoken:<POSTGRES_PASSWORD>@postgres:5432/unspoken`.
- `REDIS_URL` reuses `REDIS_PASSWORD`, host `redis`:
  `redis://:<REDIS_PASSWORD>@redis:6379`.
- `PUBLIC_SITE_URL=https://unspoken.zone`
- `ADMIN_USER=root`, `ADMIN_PASS=<generated>`.

There is no tunnel token in this model.

---

## 3. DNS + Cloudflare TLS mode

1. Cloudflare → **DNS → Records**: add an **A** record,
   name `unspoken.zone` (and one for `www`), value the **VM public IP**,
   **Proxied** (orange cloud ON).
2. Cloudflare → **SSL/TLS → Overview**: set the mode to **Full (strict)**.
   This makes Cloudflare validate the Origin Certificate nginx serves.

---

## 4. Install the Cloudflare Origin Certificate

1. Cloudflare → **SSL/TLS → Origin Server → Create Certificate**. Accept the
   defaults (RSA or ECDSA, hostnames `unspoken.zone`, `*.unspoken.zone`, 15-year).
2. Cloudflare shows two blocks. On the **VM**, save them exactly:

```bash
cd ~/unspoken
mkdir -p nginx/certs
nano nginx/certs/origin.pem   # paste the "Origin Certificate" block
nano nginx/certs/origin.key   # paste the "Private key" block
chmod 600 nginx/certs/origin.key
```

These files are gitignored and never leave the VM. nginx reads them read-only.

---

## 5. Open the firewall for 80 and 443

Two layers must both allow the ports.

**a. Oracle Cloud security list** (VCN → your subnet → default security list →
add ingress rules): allow **TCP 80** and **TCP 443**. For the strongest setup,
set the source to Cloudflare's IP ranges (https://www.cloudflare.com/ips/) so the
origin cannot be reached except through Cloudflare. `0.0.0.0/0` works too but is
weaker.

**b. Host firewall (Oracle Ubuntu ships iptables that blocks everything but 22).**
Insert ACCEPT rules just before the default REJECT and persist them:

```bash
sudo iptables -L INPUT --line-numbers          # find the REJECT line number (call it N)
sudo iptables -I INPUT N -p tcp --dport 80  -m state --state NEW -j ACCEPT
sudo iptables -I INPUT N -p tcp --dport 443 -m state --state NEW -j ACCEPT
sudo netfilter-persistent save
```

(Replace `N` with the REJECT line's number so the ACCEPTs sit above it.)

---

## 6. Launch

```bash
docker compose up -d --build
docker compose ps          # postgres+redis healthy, migrate exited 0, app+nginx up
docker compose logs -f app # should print: listening + "realtime bus: Redis pub/sub"
```

Migrations run automatically (the `migrate` service). No manual step.

---

## 7. Verify

```bash
# Inside the box (app has no host port):
docker compose exec app sh -c "wget -qO- http://127.0.0.1:3000/health"   # {"ok":true,...}
# TLS locally through nginx (origin cert is for the CF hostname, so pass -k or --resolve):
curl -skI https://127.0.0.1/ | head -1                                    # HTTP/2 200
# End to end once DNS has propagated:
curl -s https://unspoken.zone/health                                      # {"ok":true,...}
```

- `https://unspoken.zone` loads; posting a letter shows it instantly (SSE).
- `https://unspoken.zone/rootunspoken` shows the admin login.
- Post in one browser, watch it appear live in another (realtime via Redis).

Then run `SEO-GEO.md` (Cloudflare cache rule + confirm AI bots are not blocked).

---

## 8. Turn on automatic deploys (CI/CD)

On every push to `main`, GitHub Actions runs typecheck + tests + build, then SSHes
into the VM and runs `git pull && docker compose up -d --build`.

**a. Dedicated CI deploy key** (separate from the repo read key). On your laptop:
```bash
ssh-keygen -t ed25519 -f ./ci_deploy -N "" -C "github-actions"
```
**b. Authorize it on the VM**:
```bash
cat ci_deploy.pub | ssh ubuntu@<VM_PUBLIC_IP> 'cat >> ~/.ssh/authorized_keys'
```
**c. Add repo secrets** (GitHub → Settings → Secrets and variables → Actions):

| Secret           | Value                                        |
| ---------------- | -------------------------------------------- |
| `DEPLOY_HOST`    | the VM public IP                             |
| `DEPLOY_USER`    | `ubuntu`                                     |
| `DEPLOY_SSH_KEY` | full contents of the private `ci_deploy`     |

Delete the local `ci_deploy` files after. `.env` and `nginx/certs` stay on the VM
across deploys (both gitignored), so CI never touches them.

---

## 9. Scaling (only if one instance saturates)

State lives in Postgres and Redis, so the app is stateless. One instance already
handles thousands of concurrent connections, so you likely never need more. To
run replicas behind nginx you must let nginx re-resolve the `app` service: add
`resolver 127.0.0.11 valid=10s;` and use a variabled `proxy_pass` in
`nginx/conf.d/unspoken.conf`, then `docker compose up -d --scale app=3`. Keep
`(replicas × PG_POOL_MAX)` below Postgres `max_connections` (100 here).

---

## 10. Operations

**Update manually** (CI does this on push):
```bash
cd ~/unspoken && git pull && docker compose up -d --build
```

**Reload nginx after editing its config or rotating the cert** (no full restart):
```bash
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
```

**Logs:**
```bash
docker compose logs -f app
docker compose logs --since=1h nginx
```

**Back up the database** (from `~/unspoken`):
```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > ~/unspoken-backup-$(date +%F).sql.gz
```
Daily via `crontab -e`:
```
0 3 * * * cd ~/unspoken && docker compose exec -T postgres pg_dump -U unspoken unspoken | gzip > ~/backups/unspoken-$(date +\%F).sql.gz
```

**Restore:**
```bash
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

**(Optional) import old Neon data** before going live:
```bash
pg_dump "<OLD_NEON_DATABASE_URL>" --no-owner --no-privileges \
  | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

---

## Security summary

- **Only 80/443 exposed**, ideally locked to Cloudflare IP ranges so the origin
  cannot be hit directly. Postgres and Redis have no host port and live on the
  private compose network. SSH stays key-only.
- **Cloudflare** absorbs L3/L4 DDoS and fronts the CDN; nginx terminates TLS with
  a 15-year Origin Certificate (no renewal to forget); the app adds L7 rate
  limits, a strict CSP, HSTS, and a locked Permissions-Policy.
- **Real client IP** is restored from `CF-Connecting-IP` in nginx, so rate
  limiting and the salted IP hash key off the visitor, not the CDN.
- **Secrets** live only in `.env` and `nginx/certs` on the VM (both gitignored)
  and in GitHub Actions secrets. Redis and Postgres use generated passwords.
- **Least privilege**: the app container runs as a non-root user; the repo read
  key is read-only and separate from the CI deploy key.
- **Anonymity**: raw IPs are never stored, only salted SHA-256 hashes.

---

## Troubleshooting

- **nginx keeps restarting** → the Origin cert is missing or malformed. Confirm
  `nginx/certs/origin.pem` + `origin.key` exist, then
  `docker compose exec nginx nginx -t`.
- **Cloudflare error 526 (invalid cert)** → SSL mode must be **Full (strict)** and
  the Origin cert must cover `unspoken.zone`. 525 → nginx not serving 443 yet.
- **502/504 from Cloudflare** → the `app` container is down or unhealthy:
  `docker compose logs app` (usually a bad `DATABASE_URL`/`REDIS_URL`; host must
  be `postgres`/`redis`).
- **Site unreachable but containers up** → firewall. Check the Oracle security
  list has 80/443 and the host iptables ACCEPTs sit above the REJECT (step 5b).
- **All visitors share one IP / rate limits misfire** → nginx real IP block is
  not matching; refresh the Cloudflare ranges in `nginx/conf.d/unspoken.conf`.
- **CI deploy fails at SSH** → check the three `DEPLOY_*` secrets and that
  `ci_deploy.pub` is in the VM's `authorized_keys`.
- **Realtime not updating** → confirm `REDIS_URL` is set and the app log says
  `realtime bus: Redis pub/sub`.
