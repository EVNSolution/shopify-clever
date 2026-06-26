import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const rootRouteSource = readFileSync(
  join(process.cwd(), "app/routes/_index/route.jsx"),
  "utf8",
);

test("root entry does not render a manual store login form", () => {
  assert.doesNotMatch(rootRouteSource, /<Form\b/);
  assert.doesNotMatch(rootRouteSource, /action="\/auth\/login"/);
  assert.doesNotMatch(rootRouteSource, /Log in|Shop domain/i);
});

test("root entry sends merchants into the embedded app shell", () => {
  assert.match(rootRouteSource, /redirect\(`\/app\/orders\$\{url\.search\}`\)/);
  assert.doesNotMatch(rootRouteSource, /redirect\(`\/app\$\{url\.search\}`\)/);
  assert.match(rootRouteSource, /logAppEntryRedirect\(request, "\/", "\/app\/orders"\)/);
});

test("entry redirects preserve query strings and log only context presence", () => {
  assert.match(rootRouteSource, /new URL\(request\.url\)/);
  assert.match(appIndexRouteSource, /new URL\(request\.url\)/);
  assert.match(rootRouteSource, /\$\{url\.search\}/);
  assert.match(appIndexRouteSource, /\$\{url\.search\}/);
  assert.match(rootRouteSource, /hasShop: url\.searchParams\.has\("shop"\)/);
  assert.match(rootRouteSource, /hasHost: url\.searchParams\.has\("host"\)/);
  assert.match(appIndexRouteSource, /hasShop: url\.searchParams\.has\("shop"\)/);
  assert.match(appIndexRouteSource, /hasHost: url\.searchParams\.has\("host"\)/);
  assert.doesNotMatch(rootRouteSource, /searchParams\.get\("host"\)/);
  assert.doesNotMatch(appIndexRouteSource, /searchParams\.get\("host"\)/);
  assert.doesNotMatch(rootRouteSource, /token|sessionToken|accessToken/i);
  assert.doesNotMatch(appIndexRouteSource, /token|sessionToken|accessToken/i);
});

const authLoginRouteSource = readFileSync(
  join(process.cwd(), "app/routes/auth.login/route.jsx"),
  "utf8",
);
const authCatchAllRouteSource = readFileSync(
  join(process.cwd(), "app/routes/auth.$.jsx"),
  "utf8",
);

test("auth fallback does not ask merchants to manually log in", () => {
  assert.doesNotMatch(authLoginRouteSource, /<Form\b/);
  assert.doesNotMatch(authLoginRouteSource, /type="submit"/);
  assert.doesNotMatch(authLoginRouteSource, /Log in|Shop domain/i);
});

test("auth catch-all redirects session-token reloads instead of rendering an empty leaf", () => {
  assert.match(authCatchAllRouteSource, /export default function AuthRedirect\(\)/);
  assert.match(authCatchAllRouteSource, /return null/);
  assert.match(authCatchAllRouteSource, /getSafeShopifyReloadRedirect\(request\)/);
  assert.match(authCatchAllRouteSource, /url\.searchParams\.get\("shopify-reload"\)/);
  assert.match(authCatchAllRouteSource, /target\.origin !== url\.origin/);
  assert.match(authCatchAllRouteSource, /return redirect\(getSafeShopifyReloadRedirect\(request\)\)/);
});

const appShellRouteSource = readFileSync(
  join(process.cwd(), "app/routes/app.jsx"),
  "utf8",
);
const appIndexRouteSource = readFileSync(
  join(process.cwd(), "app/routes/app._index.jsx"),
  "utf8",
);

test("auth fallback explains missing shop context without a 400 error page", () => {
  assert.doesNotMatch(authLoginRouteSource, /redirect\("\/app\/orders"\)/);
  assert.doesNotMatch(authLoginRouteSource, /throw new Response/);
  assert.doesNotMatch(authLoginRouteSource, /status:\s*400/);
  assert.match(authLoginRouteSource, /PageShell/);
  assert.match(authLoginRouteSource, /PageSection/);
  assert.match(authLoginRouteSource, /PageNote/);
  assert.match(authLoginRouteSource, /StatusPill/);
  assert.doesNotMatch(authLoginRouteSource, /<s-page|<s-section|<s-paragraph/);
  assert.match(authLoginRouteSource, /missingShopContext/);
  assert.match(authLoginRouteSource, /shopifyOfficialUrl/);
  assert.match(authLoginRouteSource, /shopifyAdminUrl/);
  assert.match(authLoginRouteSource, /https:\/\/www\.shopify\.com\//);
  assert.match(authLoginRouteSource, /https:\/\/admin\.shopify\.com\//);
  assert.doesNotMatch(authLoginRouteSource, /admin\.shopify\.com\/store/);
  assert.doesNotMatch(authLoginRouteSource, /clever-store-test-ij1v0anx/);
  assert.match(authLoginRouteSource, /Go to Shopify official site/);
});

test("app shell can render nav before Shopify document auth context exists", () => {
  assert.match(appShellRouteSource, /hasShopifyAdminContext/);
  assert.doesNotMatch(
    appShellRouteSource,
    /await authenticate\.admin\(request\);\n\s*\/\//,
  );
});

test("app index redirect does not require auth before the sidebar shell renders", () => {
  assert.doesNotMatch(appIndexRouteSource, /authenticate\.admin/);
  assert.match(
    appIndexRouteSource,
    /redirect\(`\/app\/orders\$\{url\.search\}`\)/,
  );
  assert.match(appIndexRouteSource, /logAppEntryRedirect\(request, "\/app", "\/app\/orders"\)/);
});

const rootDocumentSource = readFileSync(
  join(process.cwd(), "app/root.jsx"),
  "utf8",
);
const shopifyAppConfigSource = readFileSync(
  join(process.cwd(), "shopify.app.toml"),
  "utf8",
);
const complianceWebhookRoutePath = join(
  process.cwd(),
  "app/routes/webhooks.compliance.jsx",
);

test("root document server-renders the Shopify App Bridge CDN bootstrap", () => {
  assert.match(rootDocumentSource, /useLoaderData/);
  assert.match(rootDocumentSource, /export const loader = \(\) =>/);
  assert.match(rootDocumentSource, /shopifyApiKey: process\.env\.SHOPIFY_API_KEY \|\| ""/);
  assert.match(rootDocumentSource, /<meta name="shopify-api-key" content=\{shopifyApiKey\} \/>/);
  assert.match(rootDocumentSource, /<script src="https:\/\/cdn\.shopify\.com\/shopifycloud\/app-bridge\.js"><\/script>/);
  assert.ok(
    rootDocumentSource.indexOf('https://cdn.shopify.com/shopifycloud/app-bridge.js') <
      rootDocumentSource.indexOf('<Scripts />'),
    "App Bridge CDN script must be rendered before React Router app scripts",
  );
});

test("Shopify app config subscribes the mandatory compliance webhooks", () => {
  assert.match(shopifyAppConfigSource, /compliance_topics = \["customers\/data_request", "customers\/redact", "shop\/redact"\]/);
  assert.match(shopifyAppConfigSource, /uri = "\/webhooks\/compliance"/);
});

test("compliance webhook route verifies Shopify webhooks before acknowledging privacy topics", () => {
  assert.equal(existsSync(complianceWebhookRoutePath), true);
  const complianceWebhookRouteSource = readFileSync(complianceWebhookRoutePath, "utf8");

  assert.match(complianceWebhookRouteSource, /request\.clone\(\)/);
  assert.match(complianceWebhookRouteSource, /authenticate\.webhook\(requestForAuth\)/);
  assert.match(complianceWebhookRouteSource, /customers\/data_request/);
  assert.match(complianceWebhookRouteSource, /customers\/redact/);
  assert.match(complianceWebhookRouteSource, /shop\/redact/);
  assert.match(complianceWebhookRouteSource, /forwardComplianceWebhookToDeliveryApi\(request, rawBody\)/);
  assert.match(complianceWebhookRouteSource, /\/shopify\/webhooks/);
  assert.match(complianceWebhookRouteSource, /x-shopify-hmac-sha256/);
});

const catchAllRouteSource = readFileSync(
  join(process.cwd(), "app/routes/$.jsx"),
  "utf8",
);

test("unknown app URLs recover into the embedded orders page instead of rendering 404", () => {
  assert.match(catchAllRouteSource, /export const loader = \(\{ request \}\) => redirect\(getFallbackAppPath\(request\)\)/);
  assert.match(catchAllRouteSource, /return `\/app\/orders\$\{url\.search\}`/);
  assert.match(catchAllRouteSource, /url\.searchParams\.get\("shopify-reload"\)/);
  assert.match(catchAllRouteSource, /target\.origin === url\.origin/);
  assert.match(catchAllRouteSource, /앱 화면을 다시 여는 중입니다/);
});
