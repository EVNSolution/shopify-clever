import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.match(rootRouteSource, /redirect\(`\/app\$\{url\.search\}`\)/);
});

const authLoginRouteSource = readFileSync(
  join(process.cwd(), "app/routes/auth.login/route.jsx"),
  "utf8",
);

test("auth fallback does not ask merchants to manually log in", () => {
  assert.doesNotMatch(authLoginRouteSource, /<Form\b/);
  assert.doesNotMatch(authLoginRouteSource, /type="submit"/);
  assert.doesNotMatch(authLoginRouteSource, /Log in|Shop domain/i);
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
});
