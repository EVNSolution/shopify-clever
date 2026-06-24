/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchDeliveryOrders,
  syncDeliveryOrders,
} from "./orders.server.js";
import { clearDeliveryApiResponseCache } from "./route-plans.server.js";

test("syncs delivery orders through the delivery Admin API with an explicit client token", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousAppId = process.env.CLEVER_APP_ID;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  process.env.CLEVER_APP_ID = "clever-route-dev";
  const calls = [];
  const orders = [{ id: "gid://shopify/Order/1001", name: "#1001" }];

  const result = await syncDeliveryOrders(
    new Request("https://app.example/app/orders"),
    { reason: "manual_refresh", orders },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: {
            orders: [{ id: "delivery-order-1", shopifyOrderGid: orders[0].id }],
            sync: { created: 1, updated: 0 },
          },
          error: null,
        });
      },
      sessionToken: "client-session-token",
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
  if (previousAppId === undefined) {
    delete process.env.CLEVER_APP_ID;
  } else {
    process.env.CLEVER_APP_ID = previousAppId;
  }

  assert.equal(calls[0].url, "https://delivery.example/admin/orders/sync");
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.headers.authorization, "Bearer client-session-token");
  assert.equal(calls[0].options.headers["x-clever-app-id"], "clever-route-dev");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    source: "clever-app-orders",
    reason: "manual_refresh",
    orders,
  });
  assert.deepEqual(result, {
    orders: [{ id: "delivery-order-1", shopifyOrderGid: orders[0].id }],
    sync: { created: 1, updated: 0 },
    errors: [],
  });
});

test("fetches delivery orders with serialized non-empty filters and the request bearer token", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  const calls = [];

  const result = await fetchDeliveryOrders(
    new Request("https://app.example/app/orders", {
      headers: { authorization: "Bearer header-session-token" },
    }),
    {
      status: "pending",
      deliveryDay: "Thursday",
      search: "",
      cursor: null,
      limit: 25,
    },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: { orders: [{ id: "delivery-order-1", status: "pending" }] },
          error: null,
        });
      },
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.equal(
    calls[0].url,
    "https://delivery.example/admin/orders?status=pending&deliveryDay=Thursday&limit=25",
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.authorization, "Bearer header-session-token");
  assert.equal(calls[0].options.headers["x-clever-app-id"], "clever");
  assert.equal(calls[0].options.headers["content-type"], undefined);
  assert.equal(calls[0].options.body, undefined);
  assert.deepEqual(result, {
    orders: [{ id: "delivery-order-1", status: "pending" }],
    errors: [],
  });
});

test("reuses cached delivery order GET responses for identical requests without sharing mutable results", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousTtl = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "5000";
  clearDeliveryApiResponseCache();

  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      data: { orders: [{ id: `delivery-order-${calls.length}`, status: "pending" }] },
      error: null,
    });
  };
  const request = new Request("https://app.example/app/orders", {
    headers: { authorization: "Bearer header-session-token" },
  });

  try {
    const first = await fetchDeliveryOrders(request, { limit: 25 }, { fetch });
    first.orders[0].id = "mutated-by-caller";

    const second = await fetchDeliveryOrders(request, { limit: 25 }, { fetch });

    assert.equal(calls.length, 1);
    assert.equal(second.orders[0].id, "delivery-order-1");
    assert.notEqual(first.orders[0].id, second.orders[0].id);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
    if (previousTtl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = previousTtl;
    }
    clearDeliveryApiResponseCache();
  }
});

test("keeps cached delivery order GET responses scoped by Shopify session token", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousTtl = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "5000";
  clearDeliveryApiResponseCache();

  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      data: { orders: [{ id: `delivery-order-${calls.length}` }] },
      error: null,
    });
  };

  try {
    const firstShopResult = await fetchDeliveryOrders(
      new Request("https://app.example/app/orders", {
        headers: { authorization: "Bearer first-shop-token" },
      }),
      { limit: 25 },
      { fetch },
    );
    const secondShopResult = await fetchDeliveryOrders(
      new Request("https://app.example/app/orders", {
        headers: { authorization: "Bearer second-shop-token" },
      }),
      { limit: 25 },
      { fetch },
    );

    assert.equal(calls.length, 2);
    assert.equal(firstShopResult.orders[0].id, "delivery-order-1");
    assert.equal(secondShopResult.orders[0].id, "delivery-order-2");
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
    if (previousTtl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = previousTtl;
    }
    clearDeliveryApiResponseCache();
  }
});

test("reuses cached delivery order GET responses by explicit shop cache key across rotating tokens", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousTtl = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "5000";
  clearDeliveryApiResponseCache();

  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      data: { orders: [{ id: `delivery-order-${calls.length}` }] },
      error: null,
    });
  };

  try {
    const firstResult = await fetchDeliveryOrders(
      new Request("https://app.example/app/orders", {
        headers: { authorization: "Bearer rotating-token-1" },
      }),
      {},
      { cacheKey: "clever-store-test.myshopify.com", fetch },
    );
    const secondResult = await fetchDeliveryOrders(
      new Request("https://app.example/app/orders", {
        headers: { authorization: "Bearer rotating-token-2" },
      }),
      {},
      { cacheKey: "clever-store-test.myshopify.com", fetch },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.authorization, "Bearer rotating-token-1");
    assert.equal(firstResult.orders[0].id, "delivery-order-1");
    assert.equal(secondResult.orders[0].id, "delivery-order-1");
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
    if (previousTtl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = previousTtl;
    }
    clearDeliveryApiResponseCache();
  }
});

test("default delivery order GET cache survives a short embedded admin navigation gap", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousTtl = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  const previousDateNow = Date.now;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  delete process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  clearDeliveryApiResponseCache();

  let now = 1_000_000;
  Date.now = () => now;

  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      data: { orders: [{ id: `delivery-order-${calls.length}` }] },
      error: null,
    });
  };
  const request = new Request("https://app.example/app/orders", {
    headers: { authorization: "Bearer rotating-token-1" },
  });

  try {
    const first = await fetchDeliveryOrders(
      request,
      {},
      { cacheKey: "clever-store-test.myshopify.com", fetch },
    );

    now += 12_000;
    const second = await fetchDeliveryOrders(
      request,
      {},
      { cacheKey: "clever-store-test.myshopify.com", fetch },
    );

    now += 4_000;
    const third = await fetchDeliveryOrders(
      request,
      {},
      { cacheKey: "clever-store-test.myshopify.com", fetch },
    );

    assert.equal(calls.length, 2);
    assert.equal(first.orders[0].id, "delivery-order-1");
    assert.equal(second.orders[0].id, "delivery-order-1");
    assert.equal(third.orders[0].id, "delivery-order-2");
  } finally {
    Date.now = previousDateNow;
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
    if (previousTtl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = previousTtl;
    }
    clearDeliveryApiResponseCache();
  }
});

test("sync primes unfiltered delivery orders cache for the same shop cache key", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousTtl = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "5000";
  clearDeliveryApiResponseCache();

  const calls = [];
  const syncedOrders = [
    { id: "delivery-order-synced", shopifyOrderGid: "gid://shopify/Order/1001" },
  ];
  const fetch = async (url, options) => {
    calls.push({ url, options });

    if (options.method === "PATCH") {
      return Response.json({
        data: {
          orders: syncedOrders,
          sync: { created: 0, updated: 1 },
        },
        error: null,
      });
    }

    return Response.json({
      data: { orders: [{ id: "delivery-order-from-network" }] },
      error: null,
    });
  };

  try {
    const request = new Request("https://app.example/app/orders", {
      headers: { authorization: "Bearer rotating-token-1" },
    });

    await syncDeliveryOrders(
      request,
      {
        reason: "orders_page_open",
        orders: [{ id: "gid://shopify/Order/1001", name: "#1001" }],
      },
      {
        cacheKey: "clever-store-test.myshopify.com",
        fetch,
        primeOrdersCache: true,
        sessionToken: "rotating-token-1",
      },
    );

    const cachedResult = await fetchDeliveryOrders(
      new Request("https://app.example/app/orders", {
        headers: { authorization: "Bearer rotating-token-2" },
      }),
      {},
      { cacheKey: "clever-store-test.myshopify.com", fetch },
    );
    cachedResult.orders[0].id = "mutated-by-caller";

    const cachedResultAgain = await fetchDeliveryOrders(
      new Request("https://app.example/app/orders", {
        headers: { authorization: "Bearer rotating-token-3" },
      }),
      {},
      { cacheKey: "clever-store-test.myshopify.com", fetch },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://delivery.example/admin/orders/sync");
    assert.equal(calls[0].options.method, "PATCH");
    assert.deepEqual(cachedResultAgain.orders, syncedOrders);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
    if (previousTtl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = previousTtl;
    }
    clearDeliveryApiResponseCache();
  }
});

test("sync cache priming does not satisfy filtered delivery order reads", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousTtl = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "5000";
  clearDeliveryApiResponseCache();

  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });

    if (options.method === "PATCH") {
      return Response.json({
        data: {
          orders: [{ id: "delivery-order-synced" }],
          sync: { created: 0, updated: 1 },
        },
        error: null,
      });
    }

    return Response.json({
      data: { orders: [{ id: "delivery-order-filtered" }] },
      error: null,
    });
  };

  try {
    const request = new Request("https://app.example/app/orders", {
      headers: { authorization: "Bearer rotating-token-1" },
    });

    await syncDeliveryOrders(
      request,
      { orders: [{ id: "gid://shopify/Order/1001", name: "#1001" }] },
      {
        cacheKey: "clever-store-test.myshopify.com",
        fetch,
        primeOrdersCache: true,
        sessionToken: "rotating-token-1",
      },
    );

    const filteredResult = await fetchDeliveryOrders(
      new Request("https://app.example/app/orders", {
        headers: { authorization: "Bearer rotating-token-2" },
      }),
      { deliveryDate: "2026-05-15" },
      { cacheKey: "clever-store-test.myshopify.com", fetch },
    );

    assert.equal(calls.length, 2);
    assert.equal(
      calls[1].url,
      "https://delivery.example/admin/orders?deliveryDate=2026-05-15",
    );
    assert.deepEqual(filteredResult.orders, [{ id: "delivery-order-filtered" }]);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
    if (previousTtl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = previousTtl;
    }
    clearDeliveryApiResponseCache();
  }
});

test("sync does not prime unfiltered delivery orders cache from partial route preflight orders", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousTtl = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "5000";
  clearDeliveryApiResponseCache();

  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });

    if (options.method === "PATCH") {
      return Response.json({
        data: {
          orders: [{ id: "partial-route-preflight-order" }],
          sync: { created: 0, updated: 1 },
        },
        error: null,
      });
    }

    return Response.json({
      data: { orders: [{ id: "full-orders-from-network" }] },
      error: null,
    });
  };

  try {
    const request = new Request("https://app.example/app/orders", {
      headers: { authorization: "Bearer rotating-token-1" },
    });

    await syncDeliveryOrders(
      request,
      {
        reason: "route_create_preflight",
        orders: [{ id: "gid://shopify/Order/1001", name: "#1001" }],
      },
      {
        cacheKey: "clever-store-test.myshopify.com",
        fetch,
        sessionToken: "rotating-token-1",
      },
    );

    const unfilteredResult = await fetchDeliveryOrders(
      new Request("https://app.example/app/orders", {
        headers: { authorization: "Bearer rotating-token-2" },
      }),
      {},
      { cacheKey: "clever-store-test.myshopify.com", fetch },
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, "https://delivery.example/admin/orders");
    assert.deepEqual(unfilteredResult.orders, [{ id: "full-orders-from-network" }]);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
    if (previousTtl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = previousTtl;
    }
    clearDeliveryApiResponseCache();
  }
});

test("keeps explicit delivery order cache keys scoped by shop", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousTtl = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "5000";
  clearDeliveryApiResponseCache();

  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      data: { orders: [{ id: `delivery-order-${calls.length}` }] },
      error: null,
    });
  };

  try {
    const firstShopResult = await fetchDeliveryOrders(
      new Request("https://app.example/app/orders", {
        headers: { authorization: "Bearer rotating-token-1" },
      }),
      {},
      { cacheKey: "first-shop.myshopify.com", fetch },
    );
    const secondShopResult = await fetchDeliveryOrders(
      new Request("https://app.example/app/orders", {
        headers: { authorization: "Bearer rotating-token-2" },
      }),
      {},
      { cacheKey: "second-shop.myshopify.com", fetch },
    );

    assert.equal(calls.length, 2);
    assert.equal(firstShopResult.orders[0].id, "delivery-order-1");
    assert.equal(secondShopResult.orders[0].id, "delivery-order-2");
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
    if (previousTtl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = previousTtl;
    }
    clearDeliveryApiResponseCache();
  }
});
