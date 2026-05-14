# Shopify Clever Monorepo + Single-EIP Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new `shopify-clever` monorepo that keeps the Shopify embedded app and delivery API as separate apps, then deploy both behind the existing delivery EIP `3.39.216.177` using subdomain routing.

**Architecture:** Do not merge the React Router Shopify runtime and Fastify delivery API into one Node process. Put them side-by-side in one monorepo and one Docker Compose deployment, with Caddy as the single HTTPS front door. Caddy routes `clever-admin.3-39-216-177.sslip.io` to the Shopify app container and keeps `clever-delivery.3-39-216-177.sslip.io` routed to the delivery API container.

**Tech Stack:** React Router 7 Shopify app, Fastify 5 delivery API, Prisma, PostgreSQL 17 for delivery API, temporary SQLite file volume for Shopify sessions, Docker Compose, Caddy, EC2, sslip.io.

---

## Target answers to the architecture questions

- One EIP cannot be directly attached to two EC2 instances at the same time.
- Same EIP + multiple services works by attaching the EIP to one front door: one EC2 reverse proxy, or a load balancer with static IP support.
- For this project, use one EC2 first: `clever-delivery-server-mvp` / EIP `3.39.216.177`.
- Keep two code apps in parallel inside `shopify-clever` instead of code-level merging.
- Use independent app-level installs rather than npm workspaces so each Prisma app generates its own `@prisma/client` without cross-app schema collisions.
- Later, if needed, Caddy can proxy to a second private EC2, but that is not the first target because it adds network/security complexity without fixing the product problem.

## Target monorepo layout

```text
/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/
  apps/
    shopify-app/          # from 04_tomatono/clever
    delivery-api/         # from 03_CLEVER_Agent/clever-delivery-server
  packages/
    delivery-contracts/   # added later; shared request/response schemas only
  infra/
    caddy/Caddyfile
    compose/docker-compose.prod.yml
    env/shopify-app.env.example
    env/delivery-api.env.example
  docs/
    deployment/aws-single-eip.md
```

## Target public URLs

```text
Shopify App URL:
https://clever-admin.3-39-216-177.sslip.io

Shopify Redirect URL:
https://clever-admin.3-39-216-177.sslip.io/auth/callback

Delivery API URL:
https://clever-delivery.3-39-216-177.sslip.io
```

Inside Docker Compose, the Shopify app should call the delivery API by service name:

```text
CLEVER_DELIVERY_API_URL=http://delivery-api:3000
```

The browser/driver/mobile public API stays:

```text
https://clever-delivery.3-39-216-177.sslip.io
```

---

### Task 0: Inventory the current local directory structures before creating `shopify-clever`

**Files:**
- Read: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_tomatono/clever/`
- Read: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-delivery-server/`
- Read: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-driver-app/`
- Create: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/docs/migration/local-source-inventory.md`

- [ ] **Step 1: Capture the Shopify app source tree**

Run:

```bash
cd /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_tomatono/clever
find . -maxdepth 3 \
  -not -path './node_modules*' \
  -not -path './build*' \
  -not -path './.git*' \
  -not -path './.react-router*' \
  -not -path './.shopify*' \
  -not -path './.omx*' \
  | sort > /tmp/shopify-app-tree.txt
```

Expected:

```text
/tmp/shopify-app-tree.txt contains app/, prisma/, public/, scripts/, tests/, Dockerfile, package.json, shopify.app.toml, shopify.web.toml.
```

- [ ] **Step 2: Capture the delivery API source tree**

Run:

```bash
cd /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-delivery-server
find . -maxdepth 3 \
  -not -path './node_modules*' \
  -not -path './dist*' \
  -not -path './.git*' \
  -not -path './.omx*' \
  | sort > /tmp/delivery-api-tree.txt
```

Expected:

```text
/tmp/delivery-api-tree.txt contains src/, prisma/, tests/, docs/, Dockerfile, docker-compose.yml, docker-compose.prod.yml, package.json.
```

- [ ] **Step 3: Capture the driver app source tree for future monorepo placement**

Run:

```bash
cd /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-driver-app
find . -maxdepth 3 \
  -not -path './node_modules*' \
  -not -path './.git*' \
  -not -path './.expo*' \
  -not -path './.omx*' \
  | sort > /tmp/driver-app-tree.txt
```

Expected:

```text
/tmp/driver-app-tree.txt contains app.json, package.json, src/, assets/ or app-specific Expo source folders.
```

- [ ] **Step 4: Create the migration inventory document**

Run:

```bash
mkdir -p /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/docs/migration
cat > /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/docs/migration/local-source-inventory.md <<'MARKDOWN'
# Local Source Inventory

## Source repositories

| Source | Future monorepo path | Role |
| --- | --- | --- |
| `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_tomatono/clever` | `apps/shopify-app` | Shopify embedded admin app |
| `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-delivery-server` | `apps/delivery-api` | Delivery backend API |
| `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-driver-app` | `apps/driver-app` later | Expo driver app; inventory now, migration can be a follow-up |

## Shopify app tree

```text
MARKDOWN
cat /tmp/shopify-app-tree.txt >> /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/docs/migration/local-source-inventory.md
cat >> /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/docs/migration/local-source-inventory.md <<'MARKDOWN'
```

## Delivery API tree

```text
MARKDOWN
cat /tmp/delivery-api-tree.txt >> /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/docs/migration/local-source-inventory.md
cat >> /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/docs/migration/local-source-inventory.md <<'MARKDOWN'
```

## Driver app tree

```text
MARKDOWN
cat /tmp/driver-app-tree.txt >> /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/docs/migration/local-source-inventory.md
cat >> /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/docs/migration/local-source-inventory.md <<'MARKDOWN'
```

## Migration rule

- Copy source structure first.
- Do not flatten app directories during the first move.
- Do not merge Shopify app and delivery API runtimes in the first migration.
- Preserve original app-level `package.json`, `Dockerfile`, tests, Prisma folders, and config files.
- Exclude generated/runtime folders: `node_modules`, `build`, `dist`, `.git`, `.shopify`, `.react-router`, `.expo`, `.omx`.
MARKDOWN
```

Expected:

```text
shopify-clever/docs/migration/local-source-inventory.md exists and records the local source structure before any copy/move.
```

- [ ] **Step 5: Review the inventory before copying code**

Run:

```bash
sed -n '1,220p' /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/docs/migration/local-source-inventory.md
```

Expected:

```text
The inventory clearly shows which local directory maps to apps/shopify-app, apps/delivery-api, and future apps/driver-app.
```

### Task 1: Create the monorepo skeleton without changing production

**Files:**
- Create: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/package.json`
- Create: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/apps/`
- Create: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/infra/`
- Create: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/docs/`

- [ ] **Step 1: Create directories**

```bash
cd /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos
mkdir -p shopify-clever/apps shopify-clever/packages shopify-clever/infra/{caddy,compose,env} shopify-clever/docs/deployment
```

- [ ] **Step 2: Create root package file**

```json
{
  "name": "shopify-clever",
  "private": true,
  "type": "module",
  "scripts": {
    "setup": "npm --prefix apps/shopify-app ci && npm --prefix apps/delivery-api ci",
    "build": "npm --prefix apps/shopify-app run build && npm --prefix apps/delivery-api run prisma:generate && npm --prefix apps/delivery-api run build",
    "typecheck": "npm --prefix apps/shopify-app run typecheck && npm --prefix apps/delivery-api run typecheck",
    "test:shopify-app": "cd apps/shopify-app && node --test tests/*.test.mjs",
    "test:delivery-api": "npm --prefix apps/delivery-api run test",
    "test": "npm run test:shopify-app && npm run test:delivery-api",
    "deploy:compose": "docker compose -f infra/compose/docker-compose.prod.yml up -d --build"
  }
}
```

- [ ] **Step 3: Verify skeleton**

Run:

```bash
cd /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever
npm pkg get name
```

Expected:

```text
"shopify-clever"
```

---

### Task 2: Move both apps into the monorepo without merging their runtimes

**Files:**
- Copy from: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_tomatono/clever/`
- Copy to: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/apps/shopify-app/`
- Copy from: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-delivery-server/`
- Copy to: `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/apps/delivery-api/`

- [ ] **Step 1: Copy Shopify app**

```bash
rsync -a \
  --exclude .git \
  --exclude node_modules \
  --exclude build \
  --exclude .react-router \
  --exclude .shopify \
  --exclude .omx \
  /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_tomatono/clever/ \
  /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/apps/shopify-app/
```

- [ ] **Step 2: Copy delivery API**

```bash
rsync -a \
  --exclude .git \
  --exclude node_modules \
  --exclude dist \
  --exclude .omx \
  /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-delivery-server/ \
  /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/apps/delivery-api/
```

- [ ] **Step 3: Verify each app still builds independently**

Run:

```bash
cd /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/apps/shopify-app
npm ci
npm run build

cd /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/apps/delivery-api
npm ci
npm run build
```

Expected:

```text
Shopify app: react-router build exits 0
Delivery API: tsc build exits 0
```

---

### Task 3: Add single-EIP Caddy routing

**Files:**
- Create: `infra/caddy/Caddyfile`

- [ ] **Step 1: Write Caddyfile**

```caddy
clever-admin.3-39-216-177.sslip.io {
  encode zstd gzip
  reverse_proxy shopify-app:3000
}

clever-delivery.3-39-216-177.sslip.io {
  encode zstd gzip
  reverse_proxy delivery-api:3000
}
```

- [ ] **Step 2: Verify hostnames resolve to the existing EIP**

Run:

```bash
dig +short clever-admin.3-39-216-177.sslip.io
dig +short clever-delivery.3-39-216-177.sslip.io
```

Expected:

```text
3.39.216.177
3.39.216.177
```

---

### Task 4: Add production Docker Compose for both apps

**Files:**
- Create: `infra/compose/docker-compose.prod.yml`
- Create: `infra/env/shopify-app.env.example`
- Create: `infra/env/delivery-api.env.example`

- [ ] **Step 1: Create production compose file**

```yaml
services:
  caddy:
    image: caddy:2-alpine
    depends_on:
      - shopify-app
      - delivery-api
    ports:
      - "80:80"
      - "443:443"
    restart: unless-stopped
    volumes:
      - ../caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

  shopify-app:
    build:
      context: ../../apps/shopify-app
      dockerfile: Dockerfile
    image: shopify-clever-shopify-app:local
    env_file:
      - ../env/shopify-app.env
    environment:
      NODE_ENV: production
      PORT: 3000
      SHOPIFY_APP_URL: https://clever-admin.3-39-216-177.sslip.io
      CLEVER_DELIVERY_API_URL: http://delivery-api:3000
    restart: unless-stopped
    volumes:
      - shopify-session-data:/app/prisma

  delivery-api:
    build:
      context: ../../apps/delivery-api
      dockerfile: Dockerfile
    image: shopify-clever-delivery-api:local
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - ../env/delivery-api.env
    environment:
      NODE_ENV: production
      PORT: 3000
      SHOPIFY_APP_URL: https://clever-admin.3-39-216-177.sslip.io
    restart: unless-stopped

  postgres:
    image: postgres:17-bookworm
    env_file:
      - ../env/delivery-api.env
    environment:
      POSTGRES_DB: clever_delivery
      POSTGRES_USER: clever
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U clever -d clever_delivery"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    volumes:
      - /mnt/clever-delivery-postgres/data:/var/lib/postgresql/data
      - /mnt/clever-delivery-postgres/backups:/backups

volumes:
  caddy-data:
  caddy-config:
  shopify-session-data:
```

- [ ] **Step 2: Create Shopify env example**

```dotenv
SHOPIFY_API_KEY=replace-with-shopify-api-key
SHOPIFY_API_SECRET=replace-with-shopify-api-secret
SCOPES=read_orders,read_locations
SHOPIFY_APP_URL=https://clever-admin.3-39-216-177.sslip.io
CLEVER_DELIVERY_API_URL=http://delivery-api:3000
GEOCODING_USER_AGENT=clever-admin/1.0 ops@evnsolution.com
```

- [ ] **Step 3: Create delivery API env example**

```dotenv
POSTGRES_PASSWORD=replace-with-strong-password
DATABASE_URL=postgresql://clever:replace-with-strong-password@postgres:5432/clever_delivery
SHOPIFY_API_VERSION=2026-04
SHOPIFY_API_KEY=replace-with-shopify-api-key
SHOPIFY_API_SECRET=replace-with-shopify-api-secret
SHOPIFY_APP_URL=https://clever-admin.3-39-216-177.sslip.io
SHOPIFY_WEBHOOK_SECRET=replace-with-shopify-webhook-secret
SHOPIFY_TOKEN_ENCRYPTION_KEY=base64:replace-with-32-byte-base64-key
JWT_SECRET=replace-with-strong-driver-api-secret
DRIVER_PROOF_MEDIA_STORAGE_BACKEND=local
```

- [ ] **Step 4: Do not commit real env files**

Run:

```bash
printf 'infra/env/*.env\n!infra/env/*.env.example\n' >> .gitignore
git status --short
```

Expected: only `.env.example` files are tracked candidates.

---

### Task 5: Update Shopify app configuration for the new stable subdomain

**Files:**
- Modify: `apps/shopify-app/shopify.app.toml`

- [ ] **Step 1: Update Shopify URL fields**

Set:

```toml
application_url = "https://clever-admin.3-39-216-177.sslip.io"

[auth]
redirect_urls = [ "https://clever-admin.3-39-216-177.sslip.io/auth/callback" ]
```

- [ ] **Step 2: Keep only required scopes**

Set:

```toml
[access_scopes]
scopes = "read_orders,read_locations"
```

- [ ] **Step 3: Validate Shopify config**

Run:

```bash
cd /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/apps/shopify-app
npm run shopify -- app config validate
```

Expected:

```text
App configuration is valid.
```

---

### Task 6: Dry-run deployment on the delivery EC2 without breaking current services

**Files:**
- Create: `docs/deployment/aws-single-eip.md`

- [ ] **Step 1: SSH into current delivery host**

```bash
ssh -i ~/.ssh/<existing-delivery-key>.pem ubuntu@3.39.216.177
```

Expected: shell prompt on `clever-delivery-server-mvp`.

- [ ] **Step 2: Record current containers before changes**

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
```

Expected: existing delivery API/Postgres/Caddy containers are visible.

- [ ] **Step 3: Back up delivery Postgres before replacing compose**

```bash
mkdir -p /mnt/clever-delivery-postgres/backups
BACKUP=/mnt/clever-delivery-postgres/backups/pre-shopify-clever-$(date +%Y%m%d%H%M%S).sql
PG_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'postgres' | head -1)
docker exec "$PG_CONTAINER" pg_dump -U clever clever_delivery > "$BACKUP"
ls -lh "$BACKUP"
```

Expected: a non-empty `.sql` backup file.

- [ ] **Step 4: Upload monorepo to host path**

```bash
sudo mkdir -p /srv/shopify-clever
sudo chown -R ubuntu:ubuntu /srv/shopify-clever
```

Then from local machine:

```bash
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/ \
  ubuntu@3.39.216.177:/srv/shopify-clever/
```

Expected: `/srv/shopify-clever/apps/shopify-app` and `/srv/shopify-clever/apps/delivery-api` exist on the host.

---

### Task 7: Cut over Caddy/Compose to host both apps

**Files:**
- Runtime: `/srv/shopify-clever/infra/compose/docker-compose.prod.yml`
- Runtime: `/srv/shopify-clever/infra/env/shopify-app.env`
- Runtime: `/srv/shopify-clever/infra/env/delivery-api.env`

- [ ] **Step 1: Create real env files on EC2**

```bash
cd /srv/shopify-clever
cp infra/env/shopify-app.env.example infra/env/shopify-app.env
cp infra/env/delivery-api.env.example infra/env/delivery-api.env
chmod 600 infra/env/*.env
```

Then fill real values copied from existing deployed `.env` files. Do not echo secrets into logs.

- [ ] **Step 2: Start both apps**

```bash
cd /srv/shopify-clever
POSTGRES_PASSWORD='<existing-or-new-password>' docker compose -f infra/compose/docker-compose.prod.yml up -d --build
```

Expected:

```text
Container shopify-clever-caddy-1       Running
Container shopify-clever-shopify-app-1 Running
Container shopify-clever-delivery-api-1 Running
Container shopify-clever-postgres-1    Running
```

- [ ] **Step 3: Verify public routes**

Run from local machine:

```bash
curl -I https://clever-admin.3-39-216-177.sslip.io/
curl -fsS https://clever-delivery.3-39-216-177.sslip.io/health
curl -I 'https://clever-admin.3-39-216-177.sslip.io/auth/login?shop=clever-store-test-ij1v0anx.myshopify.com'
```

Expected:

```text
Shopify root returns 302 /app or app HTML without redirect loop.
Delivery health returns 200.
Auth login with shop returns 302 to Shopify OAuth install/admin URL.
```

---

### Task 8: Release Shopify version and update dependent configs

**Files:**
- Modify: Shopify app version in Shopify Dashboard via CLI deploy
- Possibly modify: driver app public server base URL only if the delivery host changes; it should not change in this plan.

- [ ] **Step 1: Deploy Shopify config**

```bash
cd /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/shopify-clever/apps/shopify-app
npm run shopify -- app deploy --allow-updates --message "Move Shopify app to shopify-clever single-EIP deployment"
```

Expected: Shopify creates/releases a version with:

```text
App URL: https://clever-admin.3-39-216-177.sslip.io
Redirect URL: https://clever-admin.3-39-216-177.sslip.io/auth/callback
Scopes: read_orders,read_locations
```

- [ ] **Step 2: Verify embedded app from Shopify Admin**

Open the app from Shopify Admin, not by directly opening `/app/orders`.

Expected:

```text
Orders page loads inside Shopify Admin.
Orders can sync/read from delivery API.
Routes page can read route plans.
Drivers page can read drivers.
```

---

### Task 9: Decommission the temporary Shopify EC2 after validation

**Files:**
- AWS resource: `i-09f1cf84b50cd7bf8` / `clever-shopify-app`

- [ ] **Step 1: Wait for validation window**

Validation window: keep the old Shopify EC2 running until the new Shopify App URL has been tested from Shopify Admin and at least one delivery API operation succeeds.

- [ ] **Step 2: Stop temporary EC2 first, do not terminate immediately**

```bash
aws ec2 stop-instances --instance-ids i-09f1cf84b50cd7bf8
aws ec2 wait instance-stopped --instance-ids i-09f1cf84b50cd7bf8
```

Expected: Shopify app still works through `https://clever-admin.3-39-216-177.sslip.io`.

- [ ] **Step 3: Terminate only after one full successful business-day smoke test**

```bash
aws ec2 terminate-instances --instance-ids i-09f1cf84b50cd7bf8
```

Expected: no production traffic depends on `43.201.116.245`.

---

## Acceptance criteria

- `shopify-clever` monorepo exists and contains both apps as separate app roots.
- The Shopify app and delivery API build independently.
- Existing delivery API remains reachable at `https://clever-delivery.3-39-216-177.sslip.io`.
- Shopify embedded app is reachable at `https://clever-admin.3-39-216-177.sslip.io`.
- Shopify OAuth redirect URL is `https://clever-admin.3-39-216-177.sslip.io/auth/callback`.
- Shopify app calls delivery API internally via `http://delivery-api:3000` inside Docker Compose.
- Public delivery API users keep using `https://clever-delivery.3-39-216-177.sslip.io`.
- Temporary EC2 `i-09f1cf84b50cd7bf8` can be stopped without breaking Shopify Admin app access.

## Main risks and mitigations

- **Risk:** Replacing existing delivery Caddy breaks delivery API.  
  **Mitigation:** Back up current Caddyfile and `docker ps`; test `/health` before releasing Shopify version.

- **Risk:** Shopify app session DB remains SQLite.  
  **Mitigation:** Accept for single-EC2 MVP; schedule follow-up to move Shopify sessions into Postgres with a separate Prisma schema/table namespace.

- **Risk:** Secrets leak during migration.  
  **Mitigation:** Copy env files directly on EC2; never commit `infra/env/*.env`; only commit `.env.example`.

- **Risk:** Driver/mobile app depends on current delivery URL.  
  **Mitigation:** Keep `https://clever-delivery.3-39-216-177.sslip.io` unchanged.

## Verification commands

```bash
# DNS
 dig +short clever-admin.3-39-216-177.sslip.io
 dig +short clever-delivery.3-39-216-177.sslip.io

# Public HTTP
 curl -I https://clever-admin.3-39-216-177.sslip.io/
 curl -fsS https://clever-delivery.3-39-216-177.sslip.io/health
 curl -I 'https://clever-admin.3-39-216-177.sslip.io/auth/login?shop=clever-store-test-ij1v0anx.myshopify.com'

# Runtime
 ssh ubuntu@3.39.216.177 'cd /srv/shopify-clever && docker compose -f infra/compose/docker-compose.prod.yml ps'
```
