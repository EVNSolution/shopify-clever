import assert from "node:assert/strict";
import test from "node:test";

import {
  getShopifyTokenSyncTimeoutMs,
  getShopifyTokenSyncHealth,
  recordShopifyAdminTokenRefreshFailure,
  syncShopifyOfflineTokenToDeliveryApi,
} from "../app/features/delivery/shopify-token-sync.server.js";

function restoreDeliveryApiBaseUrl(value) {
  if (value === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
  else process.env.CLEVER_DELIVERY_API_URL = value;
}

test("syncs Shopify session token to delivery token exchange once per shop TTL", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  try {
    const calls = [];
    const request = new Request("https://app.invalid/app", {
      headers: { authorization: "Bearer session-token" },
    });
    const session = { shop: "7hrud1-xq.myshopify.com" };

    const first = await syncShopifyOfflineTokenToDeliveryApi(request, session, {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({ data: { tokenStored: true }, error: null }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
      now: () => 1000,
    });
    const second = await syncShopifyOfflineTokenToDeliveryApi(request, session, {
      fetch: async () => {
        throw new Error("should not call within TTL");
      },
      now: () => 1000 + 60_000,
    });

    assert.deepEqual(first, { skipped: false, ok: true });
    assert.deepEqual(second, { skipped: true });
    assert.equal(calls[0].url, "https://delivery.invalid/shopify/auth/token-exchange");
    assert.equal(calls[0].options.headers.authorization, "Bearer session-token");
    assert.equal(calls[0].options.body, JSON.stringify({ shopDomain: "7hrud1-xq.myshopify.com" }));
  } finally {
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});

test("skips token sync when the app request has no Shopify session token", async () => {
  const result = await syncShopifyOfflineTokenToDeliveryApi(
    new Request("https://app.invalid/app"),
    { shop: "7hrud1-xq.myshopify.com" },
  );

  assert.deepEqual(result, { skipped: true });
});

test("syncs one offline token request per shop while concurrent calls are in flight", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  try {
    const request = new Request("https://app.invalid/app", {
      headers: { authorization: "Bearer concurrent-token" },
    });
    const session = { shop: "single-flight.myshopify.com" };
    let callCount = 0;
    let resolveFetch;
    const fetchResponse = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetch = async () => {
      callCount += 1;
      return fetchResponse;
    };

    const first = syncShopifyOfflineTokenToDeliveryApi(request, session, {
      fetch,
      now: () => 10_000,
    });
    const second = syncShopifyOfflineTokenToDeliveryApi(request, session, {
      fetch,
      now: () => 10_000,
    });

    assert.equal(callCount, 1);
    resolveFetch(new Response("{}", { status: 200 }));
    assert.deepEqual(await Promise.all([first, second]), [
      { skipped: false, ok: true },
      { skipped: false, ok: true },
    ]);
    assert.equal(callCount, 1);
  } finally {
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});

test("clears failed in-flight token sync so the next call can retry", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  try {
    const request = new Request("https://app.invalid/app", {
      headers: { authorization: "Bearer retry-token" },
    });
    const session = { shop: "retry-sync.myshopify.com" };
    let callCount = 0;
    const fetch = async () => {
      callCount += 1;
      if (callCount === 1) return new Response("{}", { status: 503 });
      return new Response("{}", { status: 200 });
    };

    assert.deepEqual(await syncShopifyOfflineTokenToDeliveryApi(request, session, {
      fetch,
      now: () => 20_000,
    }), { skipped: false, ok: false });
    assert.deepEqual(await syncShopifyOfflineTokenToDeliveryApi(request, session, {
      fetch,
      now: () => 20_001,
    }), { skipped: false, ok: true });
    assert.equal(callCount, 2);
  } finally {
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});

test("bounds token exchange timeout configuration to a safe default", () => {
  assert.equal(getShopifyTokenSyncTimeoutMs({}), 5_000);
  assert.equal(getShopifyTokenSyncTimeoutMs({ CLEVER_SHOPIFY_TOKEN_SYNC_TIMEOUT_MS: "250" }), 250);
  assert.equal(getShopifyTokenSyncTimeoutMs({ CLEVER_SHOPIFY_TOKEN_SYNC_TIMEOUT_MS: "0" }), 5_000);
  assert.equal(getShopifyTokenSyncTimeoutMs({ CLEVER_SHOPIFY_TOKEN_SYNC_TIMEOUT_MS: "30001" }), 5_000);
  assert.equal(getShopifyTokenSyncTimeoutMs({ CLEVER_SHOPIFY_TOKEN_SYNC_TIMEOUT_MS: "private" }), 5_000);
});

test("times out a never-settling token exchange and clears in-flight state for retry", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousTimeout = process.env.CLEVER_SHOPIFY_TOKEN_SYNC_TIMEOUT_MS;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  process.env.CLEVER_SHOPIFY_TOKEN_SYNC_TIMEOUT_MS = "20";
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));

  try {
    const request = new Request("https://app.invalid/app", {
      headers: { authorization: "Bearer timeout-secret-token" },
    });
    const shop = "timeout-retry.myshopify.com";
    let callCount = 0;
    let firstSignal;
    const fetch = async (_url, options) => {
      callCount += 1;
      if (callCount === 1) {
        firstSignal = options.signal;
        return new Promise(() => {});
      }
      return new Response("{}", { status: 200 });
    };

    assert.deepEqual(await syncShopifyOfflineTokenToDeliveryApi(request, { shop }, {
      fetch,
      now: () => Date.parse("2026-08-25T10:00:00.000Z"),
    }), { skipped: false, ok: false });
    assert.equal(firstSignal.aborted, true);
    assert.equal(getShopifyTokenSyncHealth(shop, {
      now: () => Date.parse("2026-08-25T10:00:00.100Z"),
    }).errorCode, "TOKEN_EXCHANGE_TIMEOUT");

    assert.deepEqual(await syncShopifyOfflineTokenToDeliveryApi(request, { shop }, {
      fetch,
      now: () => Date.parse("2026-08-25T10:00:01.000Z"),
    }), { skipped: false, ok: true });
    assert.equal(callCount, 2);
    assert.equal(getShopifyTokenSyncHealth(shop, {
      now: () => Date.parse("2026-08-25T10:00:01.100Z"),
    }).status, "healthy");
    assert.doesNotMatch(warnings.join("\n"), /timeout-secret-token|Bearer|timeout-retry\.myshopify\.com/i);
  } finally {
    console.warn = originalWarn;
    restoreDeliveryApiBaseUrl(previousBaseUrl);
    if (previousTimeout === undefined) delete process.env.CLEVER_SHOPIFY_TOKEN_SYNC_TIMEOUT_MS;
    else process.env.CLEVER_SHOPIFY_TOKEN_SYNC_TIMEOUT_MS = previousTimeout;
  }
});

test("token exchange outage and expired-session rejection become queryable sanitized health", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  try {
    const request = new Request("https://app.invalid/app", {
      headers: { authorization: "Bearer secret-session-token" },
    });
    const outageShop = "outage-health.myshopify.com";
    const expiredShop = "expired-health.myshopify.com";
    const recoveredShop = "recovered-health.myshopify.com";

    assert.deepEqual(await syncShopifyOfflineTokenToDeliveryApi(request, { shop: outageShop }, {
      fetch: async () => { throw new TypeError("customer payload must not leak"); },
      now: () => Date.parse("2026-08-24T10:00:00.000Z"),
    }), { skipped: false, ok: false });
    assert.deepEqual(getShopifyTokenSyncHealth(outageShop, {
      now: () => Date.parse("2026-08-24T10:00:01.000Z"),
    }), {
      errorCode: "TOKEN_EXCHANGE_UNAVAILABLE",
      lastAttemptAt: "2026-08-24T10:00:00.000Z",
      lastErrorCode: "TOKEN_EXCHANGE_UNAVAILABLE",
      lastFailureAt: "2026-08-24T10:00:00.000Z",
      lastSuccessAt: null,
      status: "degraded",
    });

    assert.deepEqual(await syncShopifyOfflineTokenToDeliveryApi(request, { shop: expiredShop }, {
      fetch: async () => new Response("expired offline token", { status: 401 }),
      now: () => Date.parse("2026-08-24T10:01:00.000Z"),
    }), { skipped: false, ok: false });
    assert.deepEqual(getShopifyTokenSyncHealth(expiredShop, {
      now: () => Date.parse("2026-08-24T10:01:01.000Z"),
    }), {
      errorCode: "TOKEN_EXCHANGE_HTTP_401",
      lastAttemptAt: "2026-08-24T10:01:00.000Z",
      lastErrorCode: "TOKEN_EXCHANGE_HTTP_401",
      lastFailureAt: "2026-08-24T10:01:00.000Z",
      lastSuccessAt: null,
      status: "degraded",
    });
    assert.equal(getShopifyTokenSyncHealth(outageShop, {
      now: () => Date.parse("2026-08-24T10:01:01.000Z"),
    }).errorCode, "TOKEN_EXCHANGE_UNAVAILABLE");

    await syncShopifyOfflineTokenToDeliveryApi(request, { shop: recoveredShop }, {
      fetch: async () => new Response("{}", { status: 200 }),
      now: () => Date.parse("2026-08-24T10:01:30.000Z"),
    });
    assert.deepEqual(getShopifyTokenSyncHealth(recoveredShop, {
      now: () => Date.parse("2026-08-24T10:01:31.000Z"),
    }), {
      errorCode: null,
      lastAttemptAt: "2026-08-24T10:01:30.000Z",
      lastErrorCode: null,
      lastFailureAt: null,
      lastSuccessAt: "2026-08-24T10:01:30.000Z",
      status: "healthy",
    });
  } finally {
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});

test("Shopify Admin token refresh failures are structured and queryable without error details", () => {
  const shop = "refresh-failure.myshopify.com";
  recordShopifyAdminTokenRefreshFailure({
    appId: "clever-route",
    now: () => Date.parse("2026-08-24T10:01:59.000Z"),
  });
  assert.equal(getShopifyTokenSyncHealth(shop, {
    now: () => Date.parse("2026-08-24T10:01:59.500Z"),
  }).status, "unknown");

  recordShopifyAdminTokenRefreshFailure({
    shopDomain: shop,
    now: () => Date.parse("2026-08-24T10:02:00.000Z"),
  });
  assert.deepEqual(getShopifyTokenSyncHealth(shop, {
    now: () => Date.parse("2026-08-24T10:02:01.000Z"),
  }), {
    errorCode: "ADMIN_TOKEN_REFRESH_FAILED",
    lastAttemptAt: "2026-08-24T10:02:00.000Z",
    lastErrorCode: "ADMIN_TOKEN_REFRESH_FAILED",
    lastFailureAt: "2026-08-24T10:02:00.000Z",
    lastSuccessAt: null,
    status: "degraded",
  });
});

test("keeps interleaved shop failures, recovery history, and concurrency isolated", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  const request = new Request("https://app.invalid/app", {
    headers: { authorization: "Bearer never-log-this-token" },
  });
  const shopA = "  SHOP-A.MYSHOPIFY.COM ";
  const shopB = "shop-b.myshopify.com";
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));

  try {
    let resolveShopA;
    const shopAResponse = new Promise((resolve) => { resolveShopA = resolve; });
    let shopACalls = 0;
    let shopBCalls = 0;

    const shopAFirst = syncShopifyOfflineTokenToDeliveryApi(request, { shop: shopA }, {
      fetch: async () => {
        shopACalls += 1;
        return shopAResponse;
      },
      now: () => Date.parse("2026-08-24T11:00:00.000Z"),
    });
    const shopAConcurrent = syncShopifyOfflineTokenToDeliveryApi(request, { shop: shopA.toLowerCase().trim() }, {
      fetch: async () => { throw new Error("normalized shop must share in-flight request"); },
      now: () => Date.parse("2026-08-24T11:00:00.000Z"),
    });
    const shopBSuccess = syncShopifyOfflineTokenToDeliveryApi(request, { shop: shopB }, {
      fetch: async () => {
        shopBCalls += 1;
        return new Response("{}", { status: 200 });
      },
      now: () => Date.parse("2026-08-24T11:00:01.000Z"),
    });

    resolveShopA(new Response("{}", { status: 503 }));
    assert.deepEqual(await Promise.all([shopAFirst, shopAConcurrent, shopBSuccess]), [
      { skipped: false, ok: false },
      { skipped: false, ok: false },
      { skipped: false, ok: true },
    ]);
    assert.equal(shopACalls, 1);
    assert.equal(shopBCalls, 1);
    const observeInterleaved = { now: () => Date.parse("2026-08-24T11:00:01.000Z") };
    assert.equal(getShopifyTokenSyncHealth(shopA, observeInterleaved).status, "degraded");
    assert.equal(getShopifyTokenSyncHealth(shopB, observeInterleaved).status, "healthy");
    assert.equal(getShopifyTokenSyncHealth("unknown.myshopify.com", observeInterleaved).status, "unknown");

    await syncShopifyOfflineTokenToDeliveryApi(request, { shop: shopA }, {
      fetch: async () => new Response("{}", { status: 200 }),
      now: () => Date.parse("2026-08-24T11:00:02.000Z"),
    });
    const observeRecovery = { now: () => Date.parse("2026-08-24T11:00:03.000Z") };
    assert.deepEqual(getShopifyTokenSyncHealth(shopA, observeRecovery), {
      errorCode: null,
      lastAttemptAt: "2026-08-24T11:00:02.000Z",
      lastErrorCode: "TOKEN_EXCHANGE_HTTP_503",
      lastFailureAt: "2026-08-24T11:00:00.000Z",
      lastSuccessAt: "2026-08-24T11:00:02.000Z",
      status: "healthy",
    });
    assert.equal(
      getShopifyTokenSyncHealth(shopB, observeRecovery).lastSuccessAt,
      "2026-08-24T11:00:01.000Z",
    );
    assert.doesNotMatch(warnings.join("\n"), /never-log-this-token|Bearer|SHOP-A|shop-a\.myshopify\.com/i);
  } finally {
    console.warn = originalWarn;
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});

test("authenticated health surfaces scope lookup to the authenticated shop", async () => {
  const { readFile } = await import("node:fs/promises");
  const healthRoute = await readFile(new URL("../app/routes/app.health.shopify-token.jsx", import.meta.url), "utf8");
  const settingsRoute = await readFile(new URL("../app/routes/app.settings.jsx", import.meta.url), "utf8");

  assert.match(healthRoute, /const\s+\{\s*session\s*\}\s*=\s*await authenticate\.admin\(request\)/);
  assert.match(healthRoute, /getShopifyTokenSyncHealth\(session\?\.shop\)/);
  assert.doesNotMatch(healthRoute, /searchParams|url\.search|request\.url/);
  assert.match(settingsRoute, /getShopifyTokenSyncHealth\(shopifyShopCacheKey\)/);
});

test("prunes expired health and caps retained shop identities", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  const request = new Request("https://app.invalid/app", {
    headers: { authorization: "Bearer retention-token" },
  });
  const startedAt = Date.parse("2026-08-24T12:00:00.000Z");

  try {
    for (let index = 0; index < 260; index += 1) {
      await syncShopifyOfflineTokenToDeliveryApi(
        request,
        { shop: `bounded-${index}.myshopify.com` },
        {
          fetch: async () => new Response("{}", { status: 200 }),
          now: () => startedAt + index,
        },
      );
    }

    const observedAt = { now: () => startedAt + 261 };
    assert.equal(getShopifyTokenSyncHealth("bounded-0.myshopify.com", observedAt).status, "unknown");
    assert.equal(getShopifyTokenSyncHealth("bounded-259.myshopify.com", observedAt).status, "healthy");
    assert.equal(getShopifyTokenSyncHealth("bounded-259.myshopify.com", {
      now: () => startedAt + (61 * 60 * 1000),
    }).status, "unknown");
  } finally {
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});
