# AWS single-EIP deployment evidence — 2026-05-14

## Public endpoints

- Shopify embedded app host: `https://clever-admin.3-39-216-177.sslip.io`
- Shopify OAuth redirect URL: `https://clever-admin.3-39-216-177.sslip.io/auth/callback`
- Delivery API host: `https://clever-delivery.3-39-216-177.sslip.io`

The public Shopify app host intentionally does not include `shopify` or `example` in the URL domain/subdomain.

## AWS target

- Account: `902837199612`
- Region: `ap-northeast-2`
- Instance: `i-0133358f86590294f` / `clever-delivery-server-mvp`
- Public EIP: `3.39.216.177`
- Host deployment root: `/srv/shopify-clever`
- Existing Postgres data root reused: `/mnt/clever-delivery-postgres/data`

## Runtime layout

`/srv/shopify-clever` contains:

- `apps/shopify-app` — React Router Shopify embedded app
- `apps/delivery-api` — Fastify delivery API
- `infra/caddy/Caddyfile` — host routing
- `infra/compose/docker-compose.prod.yml` — production compose file
- `infra/env/*.env` — runtime env files, mode `0600`, not committed
- `data/shopify/dev.sqlite` — Shopify session SQLite file bind-mounted into the Shopify app container

Current Docker Compose project was launched from `infra/compose`, so container names are:

- `compose-caddy-1`
- `compose-shopify-app-1`
- `compose-delivery-api-1`
- `compose-postgres-1`

## Backup

Before cutover, the existing delivery Postgres database was dumped to:

`/mnt/clever-delivery-postgres/backups/pre-shopify-clever-20260514042124.sql.gz`

## Verification evidence

Local monorepo verification:

- `npm run setup` — passed
- `npm run build` — passed
- `npm run typecheck` — passed
- `npm test` — passed: Shopify app 143/143, delivery API 208/208
- `npm run shopify -- app config validate` — passed

EC2 image/runtime verification:

- `docker compose -f infra/compose/docker-compose.prod.yml config --quiet` — passed
- `docker compose -f infra/compose/docker-compose.prod.yml build` — passed on EC2
- Delivery image smoke test: `/healthz` returned `200`
- Shopify image smoke test: `/auth/login` without `shop` returned `400`, avoiding the prior redirect loop

Post-cutover public verification:

```text
https://clever-delivery.3-39-216-177.sslip.io/healthz -> 200 {"service":"clever-delivery-server","status":"ok"}
https://clever-delivery.3-39-216-177.sslip.io/readyz -> 200
https://clever-admin.3-39-216-177.sslip.io/ -> 302 /app
https://clever-admin.3-39-216-177.sslip.io/auth/login -> 400
https://clever-admin.3-39-216-177.sslip.io/auth/login?shop=clever-store-test-ij1v0anx.myshopify.com -> 302 Shopify OAuth install URL
https://clever-admin.3-39-216-177.sslip.io/app/orders -> 410, no redirect loop
```

Shopify CLI version release:

- `clever-3`
- Dashboard version ID: `962866610177`
- Message: `Move embedded web app to clever-admin single-EIP deployment`

## Rollback notes

The previous app source remains at `/srv/clever-delivery-server` and can be restored with:

```bash
cd /srv/shopify-clever && docker compose -f infra/compose/docker-compose.prod.yml down
cd /srv/clever-delivery-server && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

If database rollback is required, use the backup SQL dump listed above.
