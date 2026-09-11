import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShopifyAdminReopenUrl,
  getTrustedBounceRecoveryTarget,
} from "../app/features/shopify/admin-bounce-recovery.js";

const appOrigin = "https://clever-kfood-app.cleversystem.ai";
const shop = "7hrud1-xq.myshopify.com";
const host = "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvN2hydWQxLXhx";
const childPath = "/app/routes/groups/group-1/routes/route-13";

function bounceUrl({
  idToken = "fresh-token",
  reloadPath = childPath,
  reloadOrigin = appOrigin,
  reloadSearch = `shop=${shop}&host=${host}&embedded=1`,
} = {}) {
  const reload = `${reloadOrigin}${reloadPath}?${reloadSearch}`;
  const url = new URL("/auth/session-token", appOrigin);
  url.searchParams.set("shop", shop);
  url.searchParams.set("host", host);
  url.searchParams.set("embedded", "1");
  if (idToken) url.searchParams.set("id_token", idToken);
  url.searchParams.set("shopify-reload", reload);
  return url;
}

test("trusted Shopify bounce recovers the exact route once with a fresh token", () => {
  const target = new URL(getTrustedBounceRecoveryTarget(bounceUrl()), appOrigin);

  assert.equal(target.pathname, childPath);
  assert.equal(target.searchParams.get("shop"), shop);
  assert.equal(target.searchParams.get("host"), host);
  assert.equal(target.searchParams.get("embedded"), "1");
  assert.equal(target.searchParams.get("id_token"), "fresh-token");
  assert.equal(target.searchParams.get("shopify-recovery"), "1");
  assert.equal(target.searchParams.has("shopify-reload"), false);
});

test("trusted Shopify bounce uses the configured public origin behind a reverse proxy", () => {
  const publicBounce = bounceUrl();
  const proxiedBounce = new URL(`${publicBounce.pathname}${publicBounce.search}`, "http://localhost:3000");

  assert.equal(getTrustedBounceRecoveryTarget(proxiedBounce), null);
  const target = new URL(getTrustedBounceRecoveryTarget(proxiedBounce, {
    appOrigin,
  }), appOrigin);
  assert.equal(target.pathname, childPath);
  assert.equal(target.searchParams.get("shopify-recovery"), "1");
});

test("bounce recovery rejects loops and untrusted destinations", () => {
  assert.equal(
    getTrustedBounceRecoveryTarget(bounceUrl({
      reloadSearch: `shop=${shop}&host=${host}&embedded=1&shopify-recovery=1`,
    })),
    null,
  );
  assert.equal(
    getTrustedBounceRecoveryTarget(bounceUrl({ reloadOrigin: "https://attacker.invalid" })),
    null,
  );
  assert.equal(
    getTrustedBounceRecoveryTarget(bounceUrl({ reloadPath: "/auth/session-token" })),
    null,
  );
  assert.equal(getTrustedBounceRecoveryTarget(bounceUrl({ idToken: "" })), null);
});

test("bounce recovery requires matching stable Shopify context", () => {
  assert.equal(
    getTrustedBounceRecoveryTarget(bounceUrl({
      reloadSearch: `shop=other.myshopify.com&host=${host}&embedded=1`,
    })),
    null,
  );
  assert.equal(
    getTrustedBounceRecoveryTarget(bounceUrl({
      reloadSearch: `shop=${shop}&host=other-host&embedded=1`,
    })),
    null,
  );
});

test("Shopify Admin reopen URL keeps route identity without credentials", () => {
  const current = new URL(`${childPath}?shop=${shop}&host=${host}&embedded=1&id_token=old`, appOrigin);
  const reopen = new URL(buildShopifyAdminReopenUrl(current, "api-key-123"));

  assert.equal(reopen.origin, "https://admin.shopify.com");
  assert.equal(reopen.pathname, `/store/7hrud1-xq/apps/api-key-123${childPath}`);
  assert.equal(reopen.searchParams.get("shop"), shop);
  assert.equal(reopen.searchParams.get("host"), host);
  assert.equal(reopen.searchParams.get("embedded"), "1");
  assert.equal(reopen.searchParams.has("id_token"), false);
});

test("Shopify Admin reopen URL falls back safely without trusted store context", () => {
  assert.equal(
    buildShopifyAdminReopenUrl(new URL(`${appOrigin}/app/routes`), "api-key-123"),
    "https://admin.shopify.com/",
  );
});

test("loop fallback reopens the intended child route through Shopify Admin", () => {
  const reopen = new URL(buildShopifyAdminReopenUrl(
    bounceUrl({
      reloadSearch: `shop=${shop}&host=${host}&embedded=1&shopify-recovery=1`,
    }),
    "api-key-123",
  ));

  assert.equal(reopen.pathname, `/store/7hrud1-xq/apps/api-key-123${childPath}`);
  assert.equal(reopen.searchParams.has("shopify-recovery"), false);
  assert.equal(reopen.searchParams.has("id_token"), false);
});

test("recovery page preserves the intended route behind a reverse proxy", () => {
  const publicBounce = bounceUrl();
  const proxiedBounce = new URL(`${publicBounce.pathname}${publicBounce.search}`, "https://app.invalid");
  const reopen = new URL(buildShopifyAdminReopenUrl(
    proxiedBounce,
    "api-key-123",
    { appOrigin },
  ));

  assert.equal(reopen.pathname, `/store/7hrud1-xq/apps/api-key-123${childPath}`);
});
