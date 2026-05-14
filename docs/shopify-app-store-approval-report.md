# Shopify App Store Approval Readiness Report

_Last updated: 2026-05-14_

## Objective

Prepare the `clever` Shopify app for App Store approval by using Shopify AI Toolkit, Shopify CLI, and current Shopify approval documentation to identify the approval process, close repository-fixable gaps, and document dashboard-only remaining tasks.

## Tooling installed

- Installed Shopify AI Toolkit with:

```bash
npx --yes skills add Shopify/shopify-ai-toolkit
```

- Installed 19 skills under `.agents/skills`, including:
  - `shopify-app-store-review`
  - `shopify-use-shopify-cli`
  - `shopify-admin`
  - `shopify-polaris-app-home`
- Added `skills-lock.json` with hashes for installed skills.

## Official references checked

- Shopify AI Toolkit — https://shopify.dev/docs/apps/build/ai-toolkit
- Best practices for apps — https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices
- App Store requirements — https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- About the review process — https://shopify.dev/docs/apps/launch/app-store-review/review-process
- Submit app for review — https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review
- Pass app review — https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review
- Privacy law compliance webhooks — https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
- Protected customer data — https://shopify.dev/docs/apps/launch/protected-customer-data
- App Bridge migration/CDN bootstrap — https://shopify.dev/docs/api/app-bridge/migration-guide

## Approval process summary

1. Keep the public app in `Draft` until Shopify App Store review page issues are resolved.
2. Complete automated checks and required listing/configuration fields in Partner Dashboard.
3. Release a production Shopify app version from `shopify.app.toml` using Shopify CLI.
4. Verify production web app hosting separately because `shopify app deploy` releases app configuration/extensions, not the hosted web app.
5. Submit through the Shopify App Store review page only after the app is production-ready, tested, and free of web/UI errors.
6. During review, Shopify can move the app through Draft, Submitted, Reviewed, Published, or Paused states. If paused, fix the emailed issues and submit fixes.

## Repository changes completed

### App Bridge automated-check readiness

Evidence:

- `apps/shopify-app/app/root.jsx` now server-renders:
  - `<meta name="shopify-api-key" content={shopifyApiKey} />`
  - `<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>`
- The script is in `<head>` before React Router `<Scripts />`.
- `apps/shopify-app/tests/store-connection.test.mjs` locks this behavior.

Why this matters:

- Shopify App Bridge docs say the latest `app-bridge.js` script is CDN-hosted and configured by the API-key meta tag.
- Shopify App Store requirements require embedded apps to use the latest App Bridge and session-token authentication.

### Mandatory privacy compliance webhooks

Evidence:

- `apps/shopify-app/shopify.app.toml` now subscribes:
  - `customers/data_request`
  - `customers/redact`
  - `shop/redact`
- `apps/shopify-app/app/routes/webhooks.compliance.jsx` acknowledges those topics only after `authenticate.webhook(request)` verifies the Shopify webhook.
- The verified compliance webhook raw body and Shopify HMAC headers are forwarded to `delivery-api` at `/shopify/webhooks`, where the delivery server independently verifies the HMAC before recording or processing the event.
- `apps/delivery-api/src/modules/shopify/webhook-event.repository.ts` now minimizes stored compliance payloads and performs delivery-data redaction:
  - `customers/data_request` stores only sanitized request identifiers for manual fulfillment; customer email/phone from the webhook payload are not persisted.
  - `customers/redact` deletes matching locally stored Shopify orders by legacy order ID and stores a sanitized `PROCESSED` receipt.
  - `shop/redact` deletes the shop row in the delivery database, cascading shop-scoped orders, stops, routes, drivers, vehicles, webhook events, driver events, consent records, and proof-media metadata.
- `shopify app config validate --json` returned:

```json
{
  "valid": true,
  "issues": []
}
```

Why this matters:

- Shopify requires every App Store app to subscribe to mandatory compliance webhooks before publishing.
- Shopify requires compliance webhook endpoints to handle JSON POSTs and reject invalid HMACs.
- Shopify requires a 200-series acknowledgement and completion of compliance actions within the required window; the code now handles the repository-owned redaction portion automatically, while data-request export/contact still requires the operational process in the Partner Dashboard packet.

## Shopify AI self-review result

The live AI self-review requirements page was fetched from:

```bash
curl -fsSL https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements -o /tmp/shopify-ai-self-review-requirements.html
```

### Summary

✅ **Likely passing:** 27  
❌ **Likely failing:** 0  
⚠️ **Needs review:** 4  
⏭️ **Groups skipped:** 10

### Likely passing evidence highlights

- **Session-token authentication:** `authenticate.admin(request)` is used in protected loaders/actions, `AppProvider embedded apiKey={apiKey}` wraps the app shell, and client actions use `useAppBridge().idToken()` for delivery API calls.
- **No manual shop-domain login flow:** root redirects merchants into `/app`, and `/auth/login` does not render a manual shop-domain form.
- **OAuth install flow:** app uses Shopify React Router auth helpers and `AppDistribution.AppStore`.
- **Latest App Bridge CDN bootstrap:** root HTML now includes API-key meta and CDN script.
- **GraphQL Admin API:** order/location reads use GraphQL client modules; no REST Admin `.json` calls were found.
- **Minimal scopes:** `shopify.app.toml` requests only `read_orders,read_locations`; no high-risk scopes such as `read_all_orders`, payment mandate, checkout extension, advanced pixel, or chat scopes are present.
- **TLS:** production app URL is HTTPS: `https://clever-admin.3-39-216-177.sslip.io`.
- **Compliance webhooks:** mandatory privacy topics are configured and routed through authenticated Shopify webhook handling.

### ⚠️ Requirements that need review

⚠️ **1.1.4 Use only factual information**

**Why this needs attention:** App listing copy, screenshots, claims, and pricing text live in Partner Dashboard, not in this repository.

**What was detected:** No deceptive-code/product-copying patterns were found in the repo, but listing content must be checked manually before submission.

⚠️ **1.2 Billing / pricing requirements**

**Why this needs attention:** The repository does not implement Shopify Billing. This is acceptable only if the App Store listing is free or pricing is configured through Shopify App Pricing as intended.

**What was detected:** No off-platform billing code was found. If the app will charge merchants, billing/pricing must be configured through Shopify Billing API or Shopify App Pricing before submission.

⚠️ **Protected customer data access**

**Why this needs attention:** The app reads order/customer delivery data, including name/address/phone/email fields in order and delivery-stop flows. Public apps require Partner Dashboard access requests for protected customer data and protected customer fields.

**What was detected:** `read_orders` is required for route planning, and synced order data includes `email`, `phone`, shipping address fields, and recipient names. Request Level 2 protected customer data access for the minimum fields actually needed.

⚠️ **Privacy policy and data-rights operating process**

**Why this needs attention:** The repo now has mandatory webhook endpoints, but the App Store listing must link a privacy policy and the business must have an operating process to fulfill access/redaction requests within Shopify’s required window.

**What was detected:** Code can verify and acknowledge compliance webhooks. The final privacy policy URL and operational deletion/export process require business/legal confirmation.

### Skipped groups

The following groups were skipped because the repo does not contain the triggering extension/configuration signal, or because Shopify marks them opt-in:

- **5.1 Online store** — No `shopify.extension.toml` with `type = "theme"`.
- **5.2 Payment** — No payment extension and no `write_payment_gateway` scope.
- **5.3 Payment facilitator** — Opt-in only; not requested.
- **5.4 Purchase option** — No subscription/payment mandate scopes.
- **5.5 Product sourcing** — Opt-in only; not requested.
- **5.6 Checkout customization** — No checkout UI extension targets.
- **5.7 Sales channel** — No `channel_config` extension.
- **5.8 Post purchase** — No `checkout_post_purchase` extension.
- **5.9 Mobile app builders** — Opt-in only; not requested.
- **5.10 Donation** — Opt-in only; not requested.

## Partner Dashboard manual checklist

These items cannot be completed safely from the local repository and require an authorized Partner Dashboard account holder:

- Use `docs/shopify-partner-dashboard-submission-packet.md` as the copy/paste source for the fields below.
- [ ] Select/confirm public app distribution method.
- [ ] Request protected customer data access for the exact order/customer fields used by delivery planning:
  - [ ] protected customer data
  - [ ] name
  - [ ] address
  - [ ] phone
  - [ ] do not request email for the current release unless the app starts querying email; current Shopify order queries do not request it.
- [ ] Provide justification: local-delivery route planning, driver dispatch, address geocoding, recipient contact, and route-stop sequencing.
- [ ] Add privacy policy URL to App Store listing.
- [ ] Confirm privacy policy covers Shopify API data, merchant-entered driver phone data, delivery route data, retention period, data storage region, data rights contact, and support contact.
- [ ] Upload/confirm app icon and make app name consistent between Developer Dashboard and listing.
- [ ] Complete listing copy with factual feature claims only.
- [ ] Configure pricing as free, or implement/configure Shopify Billing/App Pricing before listing a paid plan.
- [ ] Add API contact details and review contact email; allowlist `app-submissions@shopify.com` and `noreply@shopify.com`.
- [ ] Provide testing instructions, test credentials if needed, and a short screencast of core flows:
  - Orders sync
  - Add to plan
  - Route creation
  - Route detail markers/stops
  - Driver assignment
  - Settings departure location
- [ ] Install/reinstall on a development store and verify OAuth redirects into the embedded UI.
- [ ] Interact with the app in Shopify Admin so automated embedded app checks can observe App Bridge/session-token behavior.

## Validation commands

Targeted validation run during implementation:

```bash
cd apps/shopify-app && node --test tests/store-connection.test.mjs tests/font.test.mjs tests/performance-instrumentation.test.mjs
cd apps/shopify-app && shopify app config validate --json
```

Final release validation run before production release:

```bash
npm --prefix apps/shopify-app run lint
npm run test:shopify-app
npm run build
npm run check:public-urls
npm run typecheck
npm test
```

Outcome:

- `shopify app config validate --json` returned `{ "valid": true, "issues": [] }`.
- Shopify app tests: `151` passed.
- Delivery API tests: `213` passed.
- `npm run build`, `npm run check:public-urls`, and `npm run typecheck` completed successfully.

## Production release evidence

- Git commit: `174cfccd49f75487c96b7866fb49c0842c6a0303`
- GitHub CI/CD: success — https://github.com/EVNSolution/shopify-clever/actions/runs/25851300153
- Web app deployment: EC2 production bundle rebuilt and restarted with Docker Compose.
- Shopify app version: `approval-20260514-174cfcc`
  - Status: `active`
  - Version ID: `gid://shopify/Version/963140550657`
  - Message: `Prepare Shopify App Store approval gates 174cfcc`
- Production smoke:
  - `https://clever-admin.3-39-216-177.sslip.io/auth/login` returned `200`.
  - The production admin HTML includes `https://cdn.shopify.com/shopifycloud/app-bridge.js`.
  - The production admin HTML includes `name="shopify-api-key"`.
  - `https://clever-delivery.3-39-216-177.sslip.io/healthz` returned `{"service":"clever-delivery-server","status":"ok"}`.
  - `https://clever-delivery.3-39-216-177.sslip.io/readyz` returned `{"checks":{"http":true},"service":"clever-delivery-server","status":"ready"}`.

## Release notes to include in next Shopify app version

- Added server-rendered App Bridge CDN bootstrap and API-key meta tag for embedded app automated checks.
- Added mandatory Shopify privacy compliance webhook subscription and authenticated route.
- Installed Shopify AI Toolkit skills and recorded self-review plan/report.

## Current submission status

Repository-fixable approval gaps identified in this pass have been closed and released to the active Shopify app version plus the production web bundle. Final Shopify App Store submission should still wait for the Partner Dashboard manual checklist above, especially protected customer data access and privacy policy/listing completion.
