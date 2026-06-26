# shopify-clever

Shopify embedded admin app for CLEVER. The delivery backend now lives in the separate `clever-route-server` repository; this repo keeps only the Shopify app and its app-server/BFF loader/action code.

## App

- `apps/shopify-app` — React Router Shopify embedded app.

The Shopify app calls the operating delivery API through `CLEVER_DELIVERY_API_URL`.
On EC2 compose, both Shopify app containers join the external route-server Docker network and call `http://delivery-api:3000`.

## Public and dev endpoints

Production/App Store runtime:

- App URL: `https://clever-admin.cleversystem.ai`
- Redirect URL: `https://clever-admin.cleversystem.ai/auth/callback`
- Delivery API: `https://clever-route.cleversystem.ai`
- App scope: `CLEVER_APP_ID=clever`

Dev preview/runtime:

- App URL: `https://clever-route-app.cleversystem.ai`
- Redirect URL: `https://clever-route-app.cleversystem.ai/auth/callback`
- Delivery API: `https://clever-route.cleversystem.ai`
- App scope: `CLEVER_APP_ID=clever-route-dev`

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
```

## Runtime identities

See [`NAMING.md`](NAMING.md) for the canonical distinction between brand/display name, Shopify handle, Admin path, and hosted app URLs.

The repo contains two Shopify app config files:

- `apps/shopify-app/shopify.app.toml` — production/public app config (`CLEVER`, handle `clever-route`).
- `apps/shopify-app/shopify.app.dev.toml` — dev/custom-store app config (`CleverRoute Dev`, handle `clever-route-dev`).

Use explicit Shopify CLI config selection:

- `npm --prefix apps/shopify-app run dev` → `shopify app dev -c dev`
- `npm --prefix apps/shopify-app run deploy:prod` → production config
- `npm --prefix apps/shopify-app run deploy:dev` → dev/custom config

Do not run Shopify Dashboard mutations, `shopify app deploy`, `shopify app config link/use`, or `shopify app dev --reset` against a live app without an explicit release decision.

The runtime distribution is selected with `SHOPIFY_APP_DISTRIBUTION`:

- `app_store` for the public runtime.
- `single_merchant` for the dev/custom runtime.

## GitHub Actions strategy

The repository is intended to stay private under the `EVNSolution` GitHub Free organization. Private GitHub-hosted workflow runs consume the org Actions quota, so the workflow is intentionally split:

- PR and `main` pushes run lightweight CI: install, build, typecheck, tests, public URL hostname guard, Shopify submission readiness, and compose config validation.
- Production deploy is manual only: run the `CI/CD` workflow on `main` with `deploy_production=true`.
- Dev app deploy is manual only: run the same workflow on `main` with `deploy_clever_route=true`.
- Production image builds happen on the EC2 host during deploy instead of on a GitHub-hosted runner.

## EC2 deployment

Shopify app containers run on the existing route server EC2 and attach to the route-server Docker network:

- `docker-compose.shopify-main.yml` → `shopify-clever-main-shopify-app-1`
- `docker-compose.shopify-dev.yml` → `shopify-clever-dev-shopify-app-clever-route-1`

Runtime env files are intentionally not committed:

- `infra/env/shopify-app.env`
- `infra/env/shopify-app-clever-route.env`

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
