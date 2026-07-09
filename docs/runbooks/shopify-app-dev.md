# Shopify app dev runbook

Use this when running the embedded Shopify app locally. `infra/env/*.env` is for Docker/EC2 deploy containers and is gitignored; `shopify app dev` does not load it for local CLI runs.

## Default local dev

From repo root:

```bash
npm --prefix apps/shopify-app run dev:local -- --store clever-test-syhae28n.myshopify.com
```

`dev:local` keeps the normal dev config (`shopify app dev -c dev`) and injects the local defaults agents kept missing:

```bash
CLEVER_DELIVERY_API_URL=${CLEVER_DELIVERY_API_URL:-https://clever-route-api.cleversystem.ai}
CLEVER_APP_ID=${CLEVER_APP_ID:-clever-route-dev}
SHOPIFY_APP_DISTRIBUTION=${SHOPIFY_APP_DISTRIBUTION:-single_merchant}
```

Override only when intentionally pointing at another backend:

```bash
CLEVER_DELIVERY_API_URL=http://localhost:3000 npm --prefix apps/shopify-app run dev:local -- --store clever-test-syhae28n.myshopify.com
```

## Do not use for local app dev

```bash
infra/env/shopify-app.env
```

That file is deployment/runtime container input. Copying it into local shell can point the app at Docker-only hosts like `http://clever-route-api:3000` and cause `fetch failed`.

## Quick stale-process check

```bash
ps -eo pid,ppid,command | grep -E 'shopify app dev|react-router dev|cloudflared' | grep -v grep
lsof -nP -iTCP -sTCP:LISTEN | grep -E 'node|cloudflared|:3000|:5173|:3457'
```

If the process belongs to another worktree, stop it and restart from the intended worktree with `dev:local`.
