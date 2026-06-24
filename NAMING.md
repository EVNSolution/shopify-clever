# Naming Guide

This document is the source of truth for CLEVER Shopify app naming. Shopify uses several different "names" for the same app, so keep these categories separate.

## Current identities

| Category | Production | Dev / Custom-store | What it means |
| --- | --- | --- | --- |
| Brand / merchant-facing name | `CLEVER` | `CleverRoute Dev` | The name merchants should recognize in Shopify surfaces. |
| Shopify app config `name` | `CLEVER` | `CleverRoute Dev` | The name in `shopify.app.toml` / `shopify.app.dev.toml` released by Shopify CLI. |
| Shopify app `handle` | `clever-route` | `clever-route-dev` | Unique Shopify Admin URL slug. Handles are globally constrained and can be rejected if already taken. |
| Shopify Admin app path | `/apps/clever-route/...` | `/apps/clever-route-dev/...` | The path visible inside `admin.shopify.com` when opening the embedded app. |
| Hosted app URL | `https://clever-admin.cleversystem.ai` | `https://clever-route-app.cleversystem.ai` | The web app host Shopify loads in the embedded app iframe. |
| Delivery API URL | `https://clever-delivery.3-39-216-177.sslip.io` | `https://clever-route.cleversystem.ai` | The delivery backend paired with each app runtime. |
| Shopify config file | `apps/shopify-app/shopify.app.toml` | `apps/shopify-app/shopify.app.dev.toml` | Local CLI configuration file. |
| Runtime distribution | `app_store` | `single_merchant` | Runtime value for `SHOPIFY_APP_DISTRIBUTION`. |

## Plain-English rule

- `CLEVER` is the product/merchant-facing name.
- `clever-route` is the production Shopify URL handle.
- `clever-admin...` is our hosted production app URL.
- `CleverRoute Dev` / `clever-route-dev` are only for the dev/custom-store app.

In other words, this is intentional:

```text
Production display name: CLEVER
Production handle:       clever-route
Production app URL:      https://clever-admin.cleversystem.ai
```

## Why production uses `clever-route` as the handle

On 2026-05-18, Shopify rejected the production handle `clever` during release:

```text
app_handle: App handle must be unique
```

Because `clever` was unavailable, production uses the fallback handle `clever-route` while keeping the merchant-facing display name `CLEVER`.

The dev/custom app was moved to `clever-route-dev` first so that `clever-route` is reserved for production.

## What not to confuse

### App Store public listing name

The Shopify App Store listing/public marketing name may be managed in Partner Dashboard / App Store listing workflows. Do not assume it is changed only by editing `shopify.app.toml`.

Target public name:

```text
CLEVER
```

### Shopify CLI info output

Shopify CLI may print the linked app container name from the Dashboard, for example `CleverRoute`, even when the released app config `name` is `CLEVER`. Treat the released config/version result as the app configuration evidence.

### Hosted app URL vs Admin app path

These are different:

```text
Shopify Admin path: /apps/clever-route/...
Hosted app URL:    https://clever-admin.cleversystem.ai
```

The Admin path is controlled by the Shopify handle. The hosted app URL is controlled by our infrastructure and `application_url`.

## Release guardrails

- Routine development should use the dev config:

```bash
npm --prefix apps/shopify-app run dev
```

This runs:

```bash
shopify app dev -c dev
```

- Production Shopify app config release should be explicit:

```bash
cd apps/shopify-app
npm run deploy:prod -- --allow-updates --message "<release message>"
```

- Dev/custom Shopify app config release should also be explicit:

```bash
cd apps/shopify-app
npm run deploy:dev -- --allow-updates --message "<release message>"
```

- Do not run `shopify app dev --reset`, `shopify app config link`, `shopify app config use`, or Dashboard mutations unless the release target is clear.

## Last known Shopify config releases

- Dev/custom handle split release: `clever-route-dev-3`
- Production fallback handle release: `clever-route-7`
- Production display-name release to `CLEVER`: `clever-route-8`
