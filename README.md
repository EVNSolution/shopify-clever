# shopify-clever

Monorepo for the Clever Shopify embedded admin app and delivery API.

## Apps

- `apps/shopify-app` — React Router Shopify embedded app.
- `apps/delivery-api` — Fastify delivery API.

The apps stay as separate runtime roots. The root package only orchestrates app-level installs, builds, tests, and deployment checks so each Prisma app keeps an independent generated client.

## Public and custom endpoints

Public/App Store runtime:

- App URL: `https://clever-admin.3-39-216-177.sslip.io`
- Redirect URL: `https://clever-admin.3-39-216-177.sslip.io/auth/callback`
- Delivery API: `https://clever-delivery.3-39-216-177.sslip.io`

Custom `clever-route` runtime on the same EC2/EIP:

- App URL: `https://clever-test-admin.3-39-216-177.sslip.io`
- Redirect URL: `https://clever-test-admin.3-39-216-177.sslip.io/auth/callback`
- Delivery API: `https://clever-test-delivery.3-39-216-177.sslip.io`

Public URL hostnames must not contain `shopify` or `example`.

## Local commands

```bash
npm run setup
npm run build
npm run typecheck
npm test
npm run check:public-urls
npm run check:shopify-submission
```

Compose validation with placeholder env files:

```bash
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

## Runtime identities

The monorepo contains two Shopify app config files:

- `apps/shopify-app/shopify.app.toml` — public/App Store app.
- `apps/shopify-app/shopify.app.clever-route.toml` — custom distribution app for operating-store testing before public approval.

The runtime distribution is selected with `SHOPIFY_APP_DISTRIBUTION`:

- `app_store` for the public runtime.
- `single_merchant` for the `clever-route` custom runtime.

The Shopify Custom distribution store domain is not a repo setting. Enter it later in the Shopify Dev Dashboard when generating the install link.

## GitHub Actions strategy for the private repo

The repository is intended to stay private under the `EVNSolution` GitHub Free
organization. Private GitHub-hosted workflow runs consume the org Actions quota,
so the workflow is intentionally split:

- PR and `main` pushes run lightweight CI: install, build, typecheck, tests,
  public URL hostname guard, and Compose config validation.
- Production deploy is manual only: run the `CI/CD` workflow on `main` with
  `deploy_production=true`.
- Custom `clever-route` deploy is also manual only: run the same workflow on
  `main` with `deploy_clever_route=true`.
- The workflow does not use a GitHub deployment environment because private
  repository environments/protection rules are not available on the current Free
  org plan.
- Production image builds happen on the EC2 host during deploy instead of on a
  GitHub-hosted runner to reduce private Actions minute usage.

## Production deployment

Production and custom runtimes run on the existing delivery EC2 instance at `/srv/shopify-clever` behind Caddy:

- `clever-admin.3-39-216-177.sslip.io` → `shopify-app:3000`
- `clever-delivery.3-39-216-177.sslip.io` → `delivery-api:3000`
- `clever-test-admin.3-39-216-177.sslip.io` → `shopify-app-clever-route:3000`
- `clever-test-delivery.3-39-216-177.sslip.io` → `delivery-api-clever-route:3000`

Runtime env files are intentionally not committed:

- `infra/env/shopify-app.env`
- `infra/env/delivery-api.env`

Required GitHub repository variables for deployment:

- `EC2_HOST`
- `EC2_USER`
- `DEPLOY_PATH`

Required GitHub repository secret:

- `EC2_SSH_KEY`

Additional GitHub repository secrets for the `clever-route` custom runtime, when managing custom secrets through Actions instead of the existing EC2-only env file:

- `SHOPIFY_API_KEY_2`
- `SHOPIFY_API_SECRET_2`
- `POSTGRES_PASSWORD_2`
- `SHOPIFY_TOKEN_ENCRYPTION_KEY_2`
- `JWT_SECRET_2`

If these custom secrets are absent, the custom deploy preserves/reuses `/srv/shopify-clever/infra/compose/.env.clever-route` or migrates the legacy `/srv/shopify-clever-test/infra/compose/.env` file on EC2.

Manual CD validates both apps, syncs source to EC2, rebuilds/restarts the selected Compose runtime on
the host, and smoke-tests the selected public or custom endpoints.

More details: `docs/deployment/clever-route-one-server-runtime-2026-05-16.md`.

## Deployment evidence

See `docs/deployment/aws-single-eip-deployment-2026-05-14.md`.
