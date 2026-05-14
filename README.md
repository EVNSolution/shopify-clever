# shopify-clever

Monorepo for the Clever Shopify embedded admin app and delivery API.

## Apps

- `apps/shopify-app` — React Router Shopify embedded app.
- `apps/delivery-api` — Fastify delivery API.

The apps stay as separate runtime roots. The root package only orchestrates app-level installs, builds, tests, and deployment checks so each Prisma app keeps an independent generated client.

## Public endpoints

- App URL: `https://clever-admin.3-39-216-177.sslip.io`
- Redirect URL: `https://clever-admin.3-39-216-177.sslip.io/auth/callback`
- Delivery API: `https://clever-delivery.3-39-216-177.sslip.io`

The public app URL hostname must not contain `shopify` or `example`.

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
```

## GitHub Actions strategy for the private repo

The repository is intended to stay private under the `EVNSolution` GitHub Free
organization. Private GitHub-hosted workflow runs consume the org Actions quota,
so the workflow is intentionally split:

- PR and `main` pushes run lightweight CI: install, build, typecheck, tests,
  public URL hostname guard, and Compose config validation.
- Production deploy is manual only: run the `CI/CD` workflow on `main` with
  `deploy_production=true`.
- The workflow does not use a GitHub deployment environment because private
  repository environments/protection rules are not available on the current Free
  org plan.
- Production image builds happen on the EC2 host during deploy instead of on a
  GitHub-hosted runner to reduce private Actions minute usage.

## Production deployment

Production runs on the existing delivery EC2 instance at `/srv/shopify-clever` behind Caddy:

- `clever-admin.3-39-216-177.sslip.io` → `shopify-app:3000`
- `clever-delivery.3-39-216-177.sslip.io` → `delivery-api:3000`

Runtime env files are intentionally not committed:

- `infra/env/shopify-app.env`
- `infra/env/delivery-api.env`

Required GitHub repository variables for deployment:

- `EC2_HOST`
- `EC2_USER`
- `DEPLOY_PATH`

Required GitHub repository secret:

- `EC2_SSH_KEY`

Manual CD validates both apps, syncs source to EC2, rebuilds/restarts Compose on
the host, and smoke-tests the public endpoints.

## Deployment evidence

See `docs/deployment/aws-single-eip-deployment-2026-05-14.md`.
