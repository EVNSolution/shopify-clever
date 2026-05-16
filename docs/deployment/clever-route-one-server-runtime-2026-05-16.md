# clever-route custom runtime on the shared EC2 server

Date: 2026-05-16

This repo now manages two Shopify app runtimes from one monorepo and one EC2/EIP:

- Public/App Store runtime: `clever`
- Custom distribution runtime: `clever-route`

The store domain required by Shopify Custom distribution is intentionally not stored in this repo. It is entered later in the Shopify Dev Dashboard when generating the install link.

## Runtime separation

Both runtimes share source code but must not share runtime identity or data:

| Area | Public runtime | clever-route custom runtime |
| --- | --- | --- |
| Shopify config | `apps/shopify-app/shopify.app.toml` | `apps/shopify-app/shopify.app.clever-route.toml` |
| Distribution | `app_store` | `single_merchant` |
| Compose file | `infra/compose/docker-compose.prod.yml` | `infra/compose/docker-compose.clever-route.yml` |
| Admin host | `clever-admin.3-39-216-177.sslip.io` | `clever-test-admin.3-39-216-177.sslip.io` |
| Delivery host | `clever-delivery.3-39-216-177.sslip.io` | `clever-test-delivery.3-39-216-177.sslip.io` |
| Shopify session DB | `/srv/shopify-clever/data/shopify/dev.sqlite` | `/srv/shopify-clever-test/data/shopify/dev.sqlite` |
| Delivery DB | `clever_delivery` | `clever_delivery_test` |
| Delivery media | existing production path | `/srv/shopify-clever-test/data/delivery-proof-media` |

## Secrets

Real secrets are never committed. The GitHub Actions custom deploy job expects these repository secrets:

- `SHOPIFY_API_KEY_2`
- `SHOPIFY_API_SECRET_2`
- `POSTGRES_PASSWORD_2`
- `SHOPIFY_TOKEN_ENCRYPTION_KEY_2`
- `JWT_SECRET_2`

Existing deployment secrets/vars are still required:

- Secret: `EC2_SSH_KEY`
- Vars: `EC2_HOST`, `EC2_USER`, `DEPLOY_PATH`

The deploy job writes the custom runtime secrets to this untracked EC2 file:

```text
/srv/shopify-clever/infra/compose/.env.clever-route
```

## Manual deploy inputs

The `CI/CD` workflow has two independent manual inputs:

- `deploy_production=true` deploys the public runtime.
- `deploy_clever_route=true` deploys the custom runtime.

Both deploy paths run after the same validate job. The custom deploy recreates only the custom compose services and the shared Caddy edge.

## Local validation

```bash
npm run setup
npm run typecheck
npm test
npm run build
npm run check:public-urls

cp infra/env/shopify-app.env.example infra/env/shopify-app.env
cp infra/env/delivery-api.env.example infra/env/delivery-api.env
docker compose -f infra/compose/docker-compose.prod.yml config --quiet
rm -f infra/env/shopify-app.env infra/env/delivery-api.env

cp infra/env/shopify-app-clever-route.env.example infra/env/shopify-app-clever-route.env
cp infra/env/delivery-api-clever-route.env.example infra/env/delivery-api-clever-route.env
cat >/tmp/shopify-clever-route-compose.env <<'ENV'
SHOPIFY_API_KEY_2=dummy
SHOPIFY_API_SECRET_2=dummy
POSTGRES_PASSWORD_2=dummy
SHOPIFY_TOKEN_ENCRYPTION_KEY_2=dummy
JWT_SECRET_2=dummy
SHARED_CADDY_NETWORK=compose_default
ENV
docker compose --env-file /tmp/shopify-clever-route-compose.env \
  -f infra/compose/docker-compose.clever-route.yml config --quiet
rm -f infra/env/shopify-app-clever-route.env infra/env/delivery-api-clever-route.env /tmp/shopify-clever-route-compose.env
```

## Shopify Dashboard follow-up

After the operating store domain is known:

1. Open the `clever-route` app in the Shopify Dev Dashboard.
2. Select/confirm Custom distribution.
3. Enter the target store domain (`*.myshopify.com` or `admin.shopify.com/store/...`).
4. Save Protected customer data access for Protected customer data, Name, Address, and Phone.
5. Generate the install link.
6. Install on the operating store and verify `/app/orders`.

Do not request `read_all_orders` unless testing requires order history older than the standard `read_orders` window.
