/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  bulkUpdateDeliveryOrders,
  createDeliveryOrdersSelectionSnapshot,
  fetchDeliveryOrders,
  fetchDeliveryOrderFacets,
  fetchDeliveryOrderMapPoints,
  fetchDeliveryOrdersPage,
  fetchDeliveryOrdersReconciliationStatus,
  replaceDeliveryOrdersSelectionExclusions,
  startDeliveryOrdersReconciliation,
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
    {
      deliveryCycle: {
        cutoffTime: "17:00",
        cutoffWeekday: "TUESDAY",
        timeZone: "America/Toronto",
      },
      reason: "manual_refresh",
      orders,
    },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: {
            orders: [{ id: "delivery-order-1", shopifyOrderGid: orders[0].id }],
            sync: { created: 1, updated: 0 },
            warnings: [{ code: "ORDER_SYNC_SNAPSHOT_SKIPPED", message: "invalid line item" }],
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
    deliveryCycle: {
      cutoffTime: "17:00",
      cutoffWeekday: "TUESDAY",
      timeZone: "America/Toronto",
    },
    source: "clever-app-orders",
    reason: "manual_refresh",
    orders,
  });
  assert.deepEqual(result, {
    orders: [{ id: "delivery-order-1", shopifyOrderGid: orders[0].id }],
    sync: { created: 1, updated: 0 },
    warnings: [{ code: "ORDER_SYNC_SNAPSHOT_SKIPPED", message: "invalid line item" }],
    errors: [],
  });
});

test("bulk-updates delivery orders through the delivery Admin API", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  const calls = [];

  const result = await bulkUpdateDeliveryOrders(
    new Request("https://app.example/app/orders"),
    { field: "payment", orderIds: ["order-id"], value: "PENDING" },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: {
            orders: [{ id: "order-id", financialStatus: "PENDING" }],
            updated: 1,
          },
          error: null,
        });
      },
      sessionToken: "client-session-token",
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.equal(calls[0].url, "https://delivery.example/admin/orders/bulk-update");
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.headers.authorization, "Bearer client-session-token");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    field: "payment",
    orderIds: ["order-id"],
    value: "PENDING",
  });
  assert.deepEqual(result, {
    errors: [],
    orders: [{ id: "order-id", financialStatus: "PENDING" }],
    updated: 1,
  });
});

test("resolves a frozen order selection by opaque token without sending member ids", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  let requestBody;

  try {
    const result = await bulkUpdateDeliveryOrders(
      new Request("https://app.example/app/orders"),
      { field: "state", selectionToken: "opaque-token", value: "PLANNED" },
      {
        fetch: async (_url, options) => {
          requestBody = JSON.parse(options.body);
          return Response.json({
            data: { selected: 5, resolved: 4, updated: 3, skipped: 1, noOp: 1 },
            error: null,
          });
        },
        sessionToken: "client-session-token",
      },
    );

    assert.deepEqual(requestBody, {
      field: "state",
      selectionToken: "opaque-token",
      value: "PLANNED",
    });
    assert.deepEqual(result, {
      errors: [],
      noOp: 1,
      orders: [],
      resolved: 4,
      selected: 5,
      skipped: 1,
      updated: 3,
    });
  } finally {
    if (previousBaseUrl === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
  }
});

test("fetches a bounded numeric order page and normalizes its envelope", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  const calls = [];

  try {
    const result = await fetchDeliveryOrdersPage(
      new Request("https://app.example/app/orders"),
      {
        page: 2,
        readWatermark: "2026-08-04T00:00:00.000Z",
        search: "kim",
      },
      {
        fetch: async (url, options) => {
          calls.push({ url, options });
          return Response.json({
            data: {
              rows: [{ id: "order-1" }],
              pageInfo: {
                currentPage: 2,
                endCursor: "end",
                hasNextPage: true,
                hasPreviousPage: false,
                pageSize: 50,
                readWatermark: "2026-08-04T00:00:00.000Z",
                sort: "id_desc",
                startCursor: "start",
                totalPages: 7,
              },
              result: {
                count: 321,
                countPrecision: "exact",
                filterHash: "hmac-sha256:abc",
                readWatermark: "2026-08-04T00:00:00.000Z",
              },
              freshness: { status: "healthy", orderCount: 123 },
            },
            error: null,
          });
        },
        sessionToken: "client-session-token",
      },
    );

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/admin/orders/page");
    assert.equal(url.searchParams.get("pageSize"), "50");
    assert.equal(url.searchParams.get("sort"), "id_desc");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("readWatermark"), "2026-08-04T00:00:00.000Z");
    assert.equal(url.searchParams.has("after"), false);
    assert.equal(url.searchParams.has("before"), false);
    assert.equal(url.searchParams.get("search"), "kim");
    assert.deepEqual(result.pageInfo, {
      currentPage: 2,
      endCursor: "end",
      hasNextPage: true,
      hasPreviousPage: false,
      pageSize: 50,
      readWatermark: "2026-08-04T00:00:00.000Z",
      sort: "id_desc",
      startCursor: "start",
      totalPages: 7,
    });
    assert.equal(result.result.count, 321);
    assert.equal(result.result.countPrecision, "exact");
    assert.equal(result.result.filterHash, "hmac-sha256:abc");
    assert.equal(result.freshness.canonicalOrderCount, 123);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
  }
});

test("uses independent facet, map, and selection snapshot contracts", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    if (path.endsWith("/facets")) {
      return Response.json({ data: { countPrecision: "exact", facets: { deliveryAreas: [] }, filterHash: "hash", totalCount: 2 }, error: null });
    }
    if (path.endsWith("/map-points")) {
      return Response.json({ data: { filterHash: "hash", generatedAt: "now", omittedCount: 0, points: [{ orderId: "1" }] }, error: null });
    }
    return Response.json({ data: { expiresAt: "later", filterHash: "hash", selectedCount: 2, selectionToken: "opaque", snapshotWatermark: "now" }, error: null });
  };

  try {
    const options = { fetch, sessionToken: "client-session-token" };
    assert.equal((await fetchDeliveryOrderFacets(new Request("https://app.example/app/orders"), { search: "kim" }, options)).totalCount, 2);
    assert.equal((await fetchDeliveryOrderMapPoints(new Request("https://app.example/app/orders"), { search: "kim", limit: 1000 }, options)).points.length, 1);
    assert.equal((await createDeliveryOrdersSelectionSnapshot(new Request("https://app.example/app/orders"), { filters: { search: "kim" }, excludeOrderIds: ["1"] }, options)).selectionToken, "opaque");
    await replaceDeliveryOrdersSelectionExclusions(new Request("https://app.example/app/orders"), { selectionToken: "opaque", excludeOrderIds: ["1"] }, options);

    assert.deepEqual(calls.map(({ url, options }) => [new URL(url).pathname, options.method]), [
      ["/admin/orders/facets", "GET"],
      ["/admin/orders/map-points", "GET"],
      ["/admin/orders/selection-snapshots", "POST"],
      ["/admin/orders/selection-snapshots", "PATCH"],
    ]);
    assert.deepEqual(JSON.parse(calls[2].options.body), {
      excludeOrderIds: ["1"],
      filters: { search: "kim" },
      sort: "id_desc",
    });
    assert.deepEqual(JSON.parse(calls[3].options.body), {
      excludeOrderIds: ["1"],
      selectionToken: "opaque",
    });
  } finally {
    if (previousBaseUrl === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
  }
});

test("starts background order reconciliation through the 202 job contract", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  const calls = [];

  try {
    const result = await startDeliveryOrdersReconciliation(
      new Request("https://app.example/app/orders"),
      { correlationId: "refresh-1", mode: "FULL", overlapWindowSeconds: 600, pageSize: 25 },
      {
        fetch: async (url, options) => {
          calls.push({ url, options });
          return Response.json(
            {
              data: {
                job: {
                  counts: {
                    failed: 1,
                    scanned: 10,
                    staleSkipped: 2,
                    updated: 8,
                  },
                  correlationId: "refresh-1",
                  id: "job-1",
                  pageCursor: "cursor-1",
                  status: "RUNNING",
                  lastError: {
                    authorization: "Bearer secret",
                    message: "failed for id_token=secret&email=customer@example.com",
                  },
                },
              },
              error: null,
            },
            { status: 202 },
          );
        },
        sessionToken: "client-session-token",
      },
    );

    assert.equal(calls[0].url, "https://delivery.example/admin/orders/reconciliations");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers.authorization, "Bearer client-session-token");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      correlationId: "refresh-1",
      mode: "FULL",
      overlapWindowSeconds: 600,
      pageSize: 25,
    });
    assert.deepEqual(result, {
      errors: [],
      job: {
        attemptCount: null,
        appliedCount: 8,
        correlationId: "refresh-1",
        counts: {
          created: null,
          failed: 1,
          finalCanonical: null,
          scanned: 10,
          staleSkipped: 2,
          unchanged: null,
          updated: 8,
        },
        createdAt: null,
        cursor: "cursor-1",
        deadLetteredAt: null,
        failedCount: 1,
        finishedAt: null,
        highWatermark: null,
        jobId: "job-1",
        lastError: {
          authorization: "[REDACTED]",
          message: "failed for [REDACTED]&email=[REDACTED]",
        },
        mode: null,
        nextRunAt: null,
        overlapWindowSeconds: null,
        pageCount: null,
        pageSize: null,
        progress: null,
        queueDepth: null,
        scannedCount: 10,
        skippedStaleCount: 2,
        startedAt: null,
        startedFrom: null,
        status: "running",
        updatedAt: null,
        warningsCount: null,
      },
    });
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
  }
});

test("normalizes order reconciliation status polling responses", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  const calls = [];

  try {
    const result = await fetchDeliveryOrdersReconciliationStatus(
      new Request("https://app.example/app/orders"),
      "job/1",
      {
        fetch: async (url, options) => {
          calls.push({ url, options });
          return Response.json({
            data: {
              job: {
                id: "job/1",
                status: "DEAD_LETTER",
                progress: { pages: 3 },
                counts: { failed: 1 },
                warningCount: 2,
              },
            },
            error: null,
          });
        },
        sessionToken: "client-session-token",
      },
    );

    assert.equal(calls[0].url, "https://delivery.example/admin/orders/reconciliations/job%2F1");
    assert.equal(calls[0].options.method, "GET");
    assert.equal(result.job.status, "dead_letter");
    assert.equal(result.job.pageCount, 3);
    assert.equal(result.job.failedCount, 1);
    assert.equal(result.job.warningsCount, 2);
    assert.deepEqual(result.errors, []);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
  }
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
