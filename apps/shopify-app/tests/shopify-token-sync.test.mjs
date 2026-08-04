import assert from "node:assert/strict";
import test from "node:test";

import { syncShopifyOfflineTokenToDeliveryApi } from "../app/features/delivery/shopify-token-sync.server.js";

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
