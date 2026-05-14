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
- `docs/shopify-app-store-approval-report.md` — approval process, self-review result, manual dashboard checklist, and validation evidence.

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

- [ ] **Step 1: Run full repository validation**

```bash
npm --prefix apps/shopify-app run lint && npm run test:shopify-app && npm run build && npm run check:public-urls && npm run typecheck && npm test
```

- [ ] **Step 2: Commit using Lore protocol**

Use a commit message describing why the app-store approval gates were added.

- [ ] **Step 3: Push to `main` and wait for GitHub CI**

```bash
git push origin main
gh run list --branch main --limit 1 --json databaseId,headSha,status,conclusion,url
```

- [ ] **Step 4: Deploy web app bundle to EC2**

Use the established AWS EC2 Instance Connect + rsync + Docker Compose deployment lane.

- [ ] **Step 5: Release Shopify app version**

```bash
cd apps/shopify-app
npm run deploy -- --allow-updates --version <version> --message <message> --source-control-url <commit-url> --no-color
```

- [ ] **Step 6: Production smoke checks**

Verify admin auth fallback, delivery health/ready, deployed root HTML containing App Bridge CDN/meta, and deployed TOML release version in Shopify CLI output.

---

## Completion gate

Do not submit to Shopify App Store review until all Task 5 steps pass and the Partner Dashboard manual checklist in `docs/shopify-app-store-approval-report.md` is completed by an authorized account holder.
