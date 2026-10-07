import assert from "node:assert/strict";
import test from "node:test";

import {
  getShopifyTokenSyncHealth,
  recordShopifyAdminTokenRefreshFailure,
  recordShopifyTokenAuthorityFailure,
  recordShopifyTokenAuthoritySuccess,
} from "../app/features/delivery/shopify-token-sync.server.js";

test("broker failure becomes healthy after the same app and shop recover", () => {
  const appId = "clever-route-kfood";
  const shopDomain = "recover.myshopify.com";
  recordShopifyTokenAuthorityFailure({ appId, errorCode: "TOKEN_AUTHORITY_HTTP_502", now: () => Date.parse("2026-10-02T10:00:00.000Z"), shopDomain });
  recordShopifyTokenAuthoritySuccess({ appId, now: () => Date.parse("2026-10-02T10:00:01.000Z"), shopDomain });

  assert.deepEqual(getShopifyTokenSyncHealth(shopDomain, { appId, now: () => Date.parse("2026-10-02T10:00:02.000Z") }), {
    errorCode: null,
    lastAttemptAt: "2026-10-02T10:00:01.000Z",
    lastErrorCode: "TOKEN_AUTHORITY_HTTP_502",
    lastFailureAt: "2026-10-02T10:00:00.000Z",
    lastSuccessAt: "2026-10-02T10:00:01.000Z",
    status: "healthy",
  });
});

test("health remains isolated by app and normalized shop", () => {
  const now = () => Date.parse("2026-10-02T11:00:00.000Z");
  recordShopifyTokenAuthoritySuccess({ appId: "app-a", now, shopDomain: " SHOP.MYSHOPIFY.COM " });
  recordShopifyTokenAuthorityFailure({ appId: "app-b", now, shopDomain: "shop.myshopify.com" });

  assert.equal(getShopifyTokenSyncHealth("shop.myshopify.com", { appId: "app-a", now }).status, "healthy");
  assert.equal(getShopifyTokenSyncHealth("SHOP.MYSHOPIFY.COM", { appId: "app-b", now }).status, "degraded");
  assert.equal(getShopifyTokenSyncHealth("shop.myshopify.com", { appId: "app-c", now }).status, "unknown");
});

test("Shopify Admin refresh failures remain sanitized and queryable", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    recordShopifyAdminTokenRefreshFailure({
      appId: "clever-route",
      now: () => Date.parse("2026-10-02T12:00:00.000Z"),
      shopDomain: "secret-shop.myshopify.com",
    });
  } finally {
    console.warn = originalWarn;
  }

  const health = getShopifyTokenSyncHealth("secret-shop.myshopify.com", {
    appId: "clever-route",
    now: () => Date.parse("2026-10-02T12:00:01.000Z"),
  });
  assert.equal(health.errorCode, "ADMIN_TOKEN_REFRESH_FAILED");
  assert.equal(health.status, "degraded");
  assert.doesNotMatch(warnings.join("\n"), /secret-shop|myshopify/i);
});

test("authenticated token health stays scoped to its dedicated route and out of Settings UI", async () => {
  const { readFile } = await import("node:fs/promises");
  const healthRoute = await readFile(new URL("../app/routes/app.health.shopify-token.jsx", import.meta.url), "utf8");
  const settingsRoute = await readFile(new URL("../app/routes/app.settings.jsx", import.meta.url), "utf8");

  assert.match(healthRoute, /const\s+\{\s*session\s*\}\s*=\s*await authenticate\.admin\(request\)/);
  assert.match(healthRoute, /getShopifyTokenSyncHealth\(session\?\.shop\)/);
  assert.doesNotMatch(healthRoute, /searchParams|url\.search|request\.url/);
  assert.doesNotMatch(settingsRoute, /getShopifyTokenSyncHealth|operationalHealth|Operational health/);
});

test("health retention is time bounded and capped by identity", () => {
  const startedAt = Date.parse("2026-10-02T13:00:00.000Z");
  for (let index = 0; index < 260; index += 1) {
    recordShopifyTokenAuthoritySuccess({ appId: "bounded", now: () => startedAt + index, shopDomain: `bounded-${index}.myshopify.com` });
  }
  assert.equal(getShopifyTokenSyncHealth("bounded-0.myshopify.com", { appId: "bounded", now: () => startedAt + 261 }).status, "unknown");
  assert.equal(getShopifyTokenSyncHealth("bounded-259.myshopify.com", { appId: "bounded", now: () => startedAt + 261 }).status, "healthy");
  assert.equal(getShopifyTokenSyncHealth("bounded-259.myshopify.com", { appId: "bounded", now: () => startedAt + 3_600_260 }).status, "unknown");
});
