# shopify-clever

Shopify embedded app for CLEVER. The delivery backend now lives in the separate `clever-route-server` repository; this repo keeps only the Shopify app and its app-server/BFF loader/action code.

## App

- `apps/shopify-app` — React Router Shopify embedded app.

The Shopify app calls the operating delivery API through `CLEVER_DELIVERY_API_URL`.
On EC2 compose, Shopify app containers join the external route-server Docker network and call `http://clever-route-api:3000`.

## Public and dev endpoints

Production/App Store runtime:

- App URL: `https://clever-route-app.cleversystem.ai`
- Redirect URL: `https://clever-route-app.cleversystem.ai/auth/callback`
- Delivery API: `https://clever-route-api.cleversystem.ai`
- App scope: `CLEVER_APP_ID=clever`
- Legacy host alias: `https://clever-admin.cleversystem.ai` during staged host migration

Dev preview/runtime:

- App URL: `https://clever-route-app-dev.cleversystem.ai`
- Redirect URL: `https://clever-route-app-dev.cleversystem.ai/auth/callback`
- Delivery API: `https://clever-route-api.cleversystem.ai`
- App scope: `CLEVER_APP_ID=clever-route-dev`

KFood custom/runtime:

- App URL: `https://clever-kfood-app.cleversystem.ai`
- Redirect URL: `https://clever-kfood-app.cleversystem.ai/auth/callback`
- Delivery API: `https://clever-route-api.cleversystem.ai`
- App scope: `CLEVER_APP_ID=clever-route-kfood`

Public URL hostnames must not contain `shopify` or `example`.

## Local commands

```bash
npm run setup
npm run build
npm run typecheck
npm test
npm run check:public-urls
```

Compose validation:

```bash
docker compose -f infra/compose/docker-compose.shopify-main.yml config --quiet
docker compose -f infra/compose/docker-compose.shopify-dev.yml config --quiet
docker compose -f infra/compose/docker-compose.shopify-kfood.yml config --quiet
```

## Runtime identities

See [`NAMING.md`](NAMING.md) for the canonical distinction between brand/display name, Shopify handle, Admin path, and hosted app URLs.

The repo contains three Shopify app config files:

- `apps/shopify-app/shopify.app.toml` — production/public app config (`CLEVER`, handle `clever-route`).
- `apps/shopify-app/shopify.app.dev.toml` — dev/custom-store app config (`CleverRoute Dev`, handle `clever-route-dev`).
- `apps/shopify-app/shopify.app.kfood.toml` — KFood custom-store app config (`CLEVER K-Food`, handle `clever-route-kfood`).

Use explicit Shopify CLI config selection:

- `npm --prefix apps/shopify-app run dev` → `shopify app dev -c dev`
- `npm --prefix apps/shopify-app run dev:local -- --store clever-test-syhae28n.myshopify.com` → same dev config plus required local delivery env. See [`docs/runbooks/shopify-app-dev.md`](docs/runbooks/shopify-app-dev.md).
- `npm --prefix apps/shopify-app run deploy:prod` → production config
- `npm --prefix apps/shopify-app run deploy:dev` → dev/custom config
- `npm --prefix apps/shopify-app run deploy:kfood` → KFood custom config

Do not run Shopify Dashboard mutations, `shopify app deploy`, `shopify app config link/use`, or `shopify app dev --reset` against a live app without an explicit release decision.

The runtime distribution is selected with `SHOPIFY_APP_DISTRIBUTION`:

- `app_store` for the public runtime.
- `single_merchant` for the dev/custom and KFood custom runtimes.

## GitHub Actions strategy

The repository is intended to stay private under the `EVNSolution` GitHub Free organization. Private GitHub-hosted workflow runs consume the org Actions quota, so the workflow is intentionally split:

- PR and `main` pushes run lightweight CI: install, build, typecheck, tests, public URL hostname guard, Shopify submission readiness, and compose config validation.
- Deploys are manual only: run the `Deploy Shopify app` workflow on a validated `main` commit.
- Select `production`, `clever-route`, or `kfood` with the required `target` input.
- The deploy workflow verifies that the exact `main` commit passed CI and does not repeat install, build, typecheck, or tests.
- Production image builds happen on the EC2 host during deploy instead of on a GitHub-hosted runner.

## EC2 deployment

Shopify app containers run on the existing route server EC2 and attach to the route-server Docker network:

- `docker-compose.shopify-main.yml` → `shopify-clever-main-clever-route-app-1`
- `docker-compose.shopify-dev.yml` → `shopify-clever-dev-clever-route-app-dev-1`
- `docker-compose.shopify-kfood.yml` → `shopify-clever-kfood-clever-kfood-app-1`

Runtime env files are intentionally not committed:

- `infra/env/shopify-app.env`
- `infra/env/shopify-app-clever-route.env`
- `infra/env/shopify-app-kfood.env`

Required GitHub repository variables for deployment:

- `EC2_HOST`
- `EC2_USER`
- `DEPLOY_PATH`

Optional variables for temporary GitHub-hosted runner SSH ingress:

- `EC2_SSH_SECURITY_GROUP_ID`
- `AWS_REGION` — defaults to `ap-northeast-2` if omitted

Required GitHub repository secret:

- `EC2_SSH_KEY`

Optional secrets for temporary GitHub-hosted runner SSH ingress:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
