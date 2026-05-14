# Shopify App Store Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement any remaining manual or code tasks task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the clever Shopify app for Shopify App Store approval using Shopify AI Toolkit, official Shopify review guidance, and local code/config verification.

**Architecture:** Keep approval-critical runtime behavior in the Shopify app shell: OAuth/session-token authentication through Shopify React Router helpers, server-rendered App Bridge CDN bootstrap, and mandatory privacy compliance webhooks. Keep non-code submission tasks as an explicit Partner Dashboard checklist because they cannot be completed safely from the repository alone.

**Tech Stack:** Shopify React Router app, Shopify CLI, Shopify AI Toolkit skills, App Bridge CDN, Shopify app TOML, Node test runner, AWS-hosted production bundle.

---

## Source-of-truth references checked

- Shopify AI Toolkit: https://shopify.dev/docs/apps/build/ai-toolkit
- App Store best practices: https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices
- App Store requirements: https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- Review process: https://shopify.dev/docs/apps/launch/app-store-review/review-process
- Submit app for review: https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review
- Pass app review: https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review
- Privacy law compliance webhooks: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
- Protected customer data: https://shopify.dev/docs/apps/launch/protected-customer-data
- App Bridge migration/CDN bootstrap: https://shopify.dev/docs/api/app-bridge/migration-guide

---

## File structure

- `.agents/skills/**` — Shopify AI Toolkit skills installed with `npx skills add Shopify/shopify-ai-toolkit`.
- `skills-lock.json` — pinned hashes for installed Shopify AI Toolkit skills.
- `apps/shopify-app/app/root.jsx` — server-rendered App Bridge CDN bootstrap and Shopify API-key meta tag.
- `apps/shopify-app/app/routes/webhooks.compliance.jsx` — mandatory privacy compliance webhook endpoint using Shopify webhook authentication.
- `apps/shopify-app/shopify.app.toml` — app config subscription for `customers/data_request`, `customers/redact`, and `shop/redact`.
- `apps/shopify-app/tests/store-connection.test.mjs` — regression tests for no manual store login, App Bridge bootstrap, and compliance webhook configuration.
- `apps/delivery-api/src/modules/shopify/webhook-event.repository.ts` — delivery-side compliance webhook payload minimization and redaction processing.
- `apps/delivery-api/tests/webhook-event.repository.test.ts` — regression tests for sanitized compliance payload storage and delivery-data redaction.
- `docs/shopify-app-store-approval-report.md` — approval process, self-review result, manual dashboard checklist, and validation evidence.
- `docs/shopify-partner-dashboard-submission-packet.md` — Partner Dashboard copy/paste packet for protected customer data, privacy policy draft inputs, listing copy, and reviewer instructions.

---

### Task 1: Install Shopify AI Toolkit skills

**Files:**
- Create: `.agents/skills/**`
- Create: `skills-lock.json`

- [x] **Step 1: Run the install command**

```bash
npx --yes skills add Shopify/shopify-ai-toolkit
```

Expected: installs 19 Shopify skills including `shopify-app-store-review` and `shopify-use-shopify-cli`.

- [x] **Step 2: Inspect installed review skill**

```bash
sed -n '1,260p' .agents/skills/shopify-app-store-review/SKILL.md
```

Expected: skill instructs fetching the live AI self-review requirements page and producing likely passing/failing/needs-review output.

### Task 2: Lock App Bridge automated-check readiness

**Files:**
- Modify: `apps/shopify-app/app/root.jsx`
- Modify: `apps/shopify-app/tests/store-connection.test.mjs`

- [x] **Step 1: Write failing regression test**

Test name: `root document server-renders the Shopify App Bridge CDN bootstrap`.

Expected RED before implementation: missing `useLoaderData`, `shopify-api-key` meta, and App Bridge CDN script.

- [x] **Step 2: Implement server-rendered bootstrap**

`root.jsx` now returns `SHOPIFY_API_KEY` from a root loader and renders:

```jsx
<meta name="shopify-api-key" content={shopifyApiKey} />
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
```

before React Router app scripts.

- [x] **Step 3: Verify targeted tests**

```bash
cd apps/shopify-app && node --test tests/store-connection.test.mjs tests/font.test.mjs tests/performance-instrumentation.test.mjs
```

Expected: all targeted tests pass.

### Task 3: Add mandatory privacy compliance webhooks

**Files:**
- Create: `apps/shopify-app/app/routes/webhooks.compliance.jsx`
- Modify: `apps/shopify-app/shopify.app.toml`
- Modify: `apps/shopify-app/tests/store-connection.test.mjs`

- [x] **Step 1: Write failing regression tests**

Test names:
- `Shopify app config subscribes the mandatory compliance webhooks`
- `compliance webhook route verifies Shopify webhooks before acknowledging privacy topics`

Expected RED before implementation: no `compliance_topics` in TOML and no route file.

- [x] **Step 2: Configure compliance topics**

`shopify.app.toml` now includes:

```toml
[[webhooks.subscriptions]]
uri = "/webhooks/compliance"
compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
```

- [x] **Step 3: Implement authenticated webhook route**

`webhooks.compliance.jsx` calls `authenticate.webhook(request)` before returning a 200 response for the three compliance topics. Invalid Shopify HMACs are handled by the Shopify helper before acknowledgement.

- [x] **Step 4: Validate Shopify app config**

```bash
cd apps/shopify-app && shopify app config validate --json
```

Expected: `{ "valid": true, "issues": [] }`.

### Task 4: Produce approval report and remaining manual checklist

**Files:**
- Create: `docs/shopify-app-store-approval-report.md`

- [x] **Step 1: Fetch live Shopify AI self-review requirements**

```bash
curl -fsSL https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements -o /tmp/shopify-ai-self-review-requirements.html
```

Expected: page contains current requirement list such as session tokens, App Bridge, GraphQL Admin API, OAuth install flow, TLS, and scope minimization.

- [x] **Step 2: Map local evidence to requirements**

Evidence includes `authenticate.admin`, `useAppBridge().idToken()`, App Bridge CDN script, GraphQL Admin API query modules, production HTTPS URL, minimal scopes, and compliance webhook config.

- [x] **Step 3: Document dashboard-only remaining work**

Manual checklist includes privacy policy URL, protected customer data access request, app listing fields, pricing/billing selection, contact emails, testing credentials, and screencast.

### Task 5: Full validation, commit, release, and production deploy

**Files:**
- All changed files from Tasks 1-4.

- [x] **Step 1: Run full repository validation**

```bash
npm --prefix apps/shopify-app run lint && npm run test:shopify-app && npm run build && npm run check:public-urls && npm run typecheck && npm test
```

- [x] **Step 2: Commit using Lore protocol**

Use a commit message describing why the app-store approval gates were added.

- [x] **Step 3: Push to `main` and wait for GitHub CI**

```bash
git push origin main
gh run list --branch main --limit 1 --json databaseId,headSha,status,conclusion,url
```

- [x] **Step 4: Deploy web app bundle to EC2**

Use the established AWS EC2 Instance Connect + rsync + Docker Compose deployment lane.

- [x] **Step 5: Release Shopify app version**

```bash
cd apps/shopify-app
npm run deploy -- --allow-updates --version <version> --message <message> --source-control-url <commit-url> --no-color
```

- [x] **Step 6: Production smoke checks**

Verify admin auth fallback, delivery health/ready, deployed root HTML containing App Bridge CDN/meta, and deployed TOML release version in Shopify CLI output.

Completed evidence:

- Commit: `0d05a46295e499ffeb22d057b6b7e2ca789262de`
- GitHub CI/CD: success at https://github.com/EVNSolution/shopify-clever/actions/runs/25852472566
- Shopify app version: `compliance-20260514-0d05a46`, active, version ID `gid://shopify/Version/963177807873`
- Production admin smoke: `https://clever-admin.3-39-216-177.sslip.io/auth/login` returned `200` and includes the App Bridge CDN script plus `shopify-api-key` meta tag.
- Production delivery smoke:
  - `https://clever-delivery.3-39-216-177.sslip.io/healthz` returned `{"service":"clever-delivery-server","status":"ok"}`
  - `https://clever-delivery.3-39-216-177.sslip.io/readyz` returned `{"checks":{"http":true},"service":"clever-delivery-server","status":"ready"}`
  - Invalid delivery webhook HMAC smoke returned `401` with `Invalid Shopify webhook HMAC`.

---

## Completion gate

Task 5 is complete for the repository, web-hosted production bundle, and Shopify app version release. Do not submit to Shopify App Store review until the Partner Dashboard manual checklist in `docs/shopify-app-store-approval-report.md` is completed by an authorized account holder.

### Task 6: Prepare Partner Dashboard submission packet

**Files:**
- Create: `docs/shopify-partner-dashboard-submission-packet.md`
- Modify: `docs/shopify-app-store-approval-report.md`

- [x] **Step 1: Convert manual dashboard tasks into paste-ready copy**

The packet now includes public distribution notes, protected customer data request text, privacy policy draft inputs, factual listing copy, pricing guidance, reviewer testing instructions, and automated-check runbook.

- [x] **Step 2: Minimize protected customer data fields**

The packet requests protected customer data plus `name`, `address`, and `phone` only. It explicitly excludes `email` for the current release because the active Shopify GraphQL order queries do not request email.

- [x] **Step 3: Keep irreversible dashboard submission outside the repository lane**

The packet identifies the fields that still require an authorized Partner Dashboard account holder: protected-data form submission, privacy policy URL publication, app icon/contact/pricing fields, screencast upload, automated checks, and final Submit for Review.

### Task 7: Add repository-owned compliance redaction handling

**Files:**
- Modify: `apps/shopify-app/app/routes/webhooks.compliance.jsx`
- Modify: `apps/shopify-app/tests/store-connection.test.mjs`
- Modify: `apps/delivery-api/src/modules/shopify/webhook-event.repository.ts`
- Create: `apps/delivery-api/tests/webhook-event.repository.test.ts`
- Modify: `docs/shopify-app-store-approval-report.md`
- Modify: `docs/shopify-partner-dashboard-submission-packet.md`

- [x] **Step 1: Forward verified compliance webhooks to delivery-api**

`webhooks.compliance.jsx` now clones the incoming request, authenticates it with `authenticate.webhook(requestForAuth)`, and forwards the original raw body plus Shopify HMAC headers to `/shopify/webhooks` on the delivery API. The delivery API independently validates the forwarded Shopify HMAC before recording or processing the event.

- [x] **Step 2: Minimize stored compliance payloads**

The delivery webhook repository stores sanitized `customers/data_request` and `customers/redact` payloads, retaining request/order/customer IDs but omitting customer email and phone from the stored webhook event payload.

- [x] **Step 3: Process repository-owned redaction**

`customers/redact` deletes matching locally stored Shopify orders by legacy order ID and stores a sanitized `PROCESSED` receipt. `shop/redact` deletes the shop row, cascading shop-scoped delivery data through existing Prisma relations.

- [x] **Step 4: Verify targeted privacy tests**

```bash
cd apps/delivery-api && npx vitest run tests/shopify-webhook.routes.test.ts tests/webhook-event.repository.test.ts
cd apps/delivery-api && npm run lint && npm run typecheck
cd apps/shopify-app && node --test tests/store-connection.test.mjs && npm run lint && npm run typecheck
```

- [x] **Step 5: Release compliance redaction bundle**

Latest production submission target after Task 7:

- Commit: `0d05a46295e499ffeb22d057b6b7e2ca789262de`
- GitHub CI/CD: success at https://github.com/EVNSolution/shopify-clever/actions/runs/25852472566
- Shopify app version: `compliance-20260514-0d05a46`, released to users, version ID `gid://shopify/Version/963177807873`
- EC2 production bundle rebuilt and restarted for both `delivery-api` and `shopify-app`.
- Production smoke: admin `/auth/login` `200`, App Bridge CDN/meta present, delivery `/healthz` `200`, `/readyz` `200`, invalid webhook HMAC `401`.
