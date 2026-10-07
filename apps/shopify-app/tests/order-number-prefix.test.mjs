import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import {
  createDeliveryOrdersSelectionSnapshot,
  fetchDeliveryOrderFacets,
  fetchDeliveryOrderMapPoints,
  fetchDeliveryOrders,
  fetchDeliveryOrdersPage,
} from "../app/features/delivery/orders.server.js";
import { filterOrders } from "../app/features/orders/order-filters.js";
import { normalizeOrderSearch } from "../app/features/orders/order-filters-v2.js";
import { normalizeOrderNumberPrefix } from "../app/features/orders/order-number-search.js";

const preservedFilters = {
  areas: ["Toronto", "Oakville"],
  filterVersion: "2",
  scheduledDateFrom: "2026-10-06",
  scheduledDateTo: "2026-10-12",
  serviceTypes: ["DELIVERY", "PICKUP"],
};

async function captureOrderRequests(filters, cacheKey) {
  const originalFilters = structuredClone(filters);
  const calls = [];
  const request = new Request("https://app.example/app/orders");
  const options = {
    cacheKey,
    fetch: async (url, requestOptions = {}) => {
      calls.push({ requestOptions, url: String(url) });
      return Response.json({
        data: {
          countPrecision: "exact",
          facets: {},
          orders: [],
          points: [],
          result: { count: 0, countPrecision: "exact" },
          rows: [],
          selectionToken: "fixture-selection",
          totalCount: 0,
        },
        error: null,
      });
    },
    sessionToken: "test-token",
  };

  await fetchDeliveryOrders(request, filters, options);
  await fetchDeliveryOrdersPage(request, filters, options);
  await fetchDeliveryOrderFacets(request, filters, options);
  await fetchDeliveryOrderMapPoints(request, filters, options);
  await createDeliveryOrdersSelectionSnapshot(
    request,
    { filters },
    options,
  );

  assert.equal(calls.length, 5);
  assert.deepEqual(filters, originalFilters);
  return calls;
}

function assertPreservedFilters(searchParams) {
  assert.deepEqual(searchParams.getAll("areas"), preservedFilters.areas);
  assert.equal(searchParams.get("filterVersion"), preservedFilters.filterVersion);
  assert.deepEqual(searchParams.getAll("serviceTypes"), preservedFilters.serviceTypes);
  assert.equal(searchParams.get("scheduledDateFrom"), preservedFilters.scheduledDateFrom);
  assert.equal(searchParams.get("scheduledDateTo"), preservedFilters.scheduledDateTo);
}

test("order-number prefixes trim whitespace, remove one leading hash, and preserve merchant text", () => {
  assert.equal(normalizeOrderNumberPrefix("  #233  "), "233");
  assert.equal(normalizeOrderNumberPrefix("  233  "), "233");
  assert.equal(normalizeOrderNumberPrefix(" #AB123 "), "AB123");
  assert.equal(normalizeOrderNumberPrefix("#"), "");
  assert.equal(normalizeOrderNumberPrefix("   "), "");
  assert.equal(normalizeOrderNumberPrefix(undefined), "");
});

test("Delivery order endpoints send only a normalized order-number prefix", async () => {
  const previous = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";

  try {
    for (const [index, search] of ["#233", "233", "  #233  "].entries()) {
      const calls = await captureOrderRequests(
        {
          ...preservedFilters,
          q: search,
          search,
        },
        `order-prefix-${index}`,
      );

      for (const { url } of calls.slice(0, 4)) {
        const params = new URL(url).searchParams;
        assert.equal(params.get("orderNumberPrefix"), "233");
        assert.equal(params.has("search"), false);
        assert.equal(params.has("q"), false);
        assertPreservedFilters(params);
      }

      const snapshot = JSON.parse(calls[4].requestOptions.body);
      assert.equal(snapshot.filters.orderNumberPrefix, "233");
      assert.equal("search" in snapshot.filters, false);
      assert.equal("q" in snapshot.filters, false);
      assert.deepEqual(snapshot.filters.areas, preservedFilters.areas);
      assert.equal(snapshot.filters.filterVersion, preservedFilters.filterVersion);
      assert.deepEqual(snapshot.filters.serviceTypes, preservedFilters.serviceTypes);
      assert.equal(snapshot.filters.scheduledDateFrom, preservedFilters.scheduledDateFrom);
      assert.equal(snapshot.filters.scheduledDateTo, preservedFilters.scheduledDateTo);
    }
  } finally {
    if (previous === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previous;
  }
});

test("legacy q-only filters become an order-number prefix on every endpoint", async () => {
  const previous = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";

  try {
    const calls = await captureOrderRequests(
      { ...preservedFilters, q: "  #778  " },
      "legacy-q-prefix",
    );
    for (const { url } of calls.slice(0, 4)) {
      const params = new URL(url).searchParams;
      assert.equal(params.get("orderNumberPrefix"), "778");
      assert.equal(params.has("search"), false);
      assert.equal(params.has("q"), false);
      assertPreservedFilters(params);
    }
    const snapshot = JSON.parse(calls[4].requestOptions.body);
    assert.equal(snapshot.filters.orderNumberPrefix, "778");
    assert.equal("search" in snapshot.filters, false);
    assert.equal("q" in snapshot.filters, false);
    assert.equal(snapshot.filters.filterVersion, "2");
  } finally {
    if (previous === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previous;
  }
});

test("explicit orderNumberPrefix takes precedence and removes its leading hash", async () => {
  const previous = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";

  try {
    const calls = await captureOrderRequests(
      {
        ...preservedFilters,
        orderNumberPrefix: "  #445  ",
        q: "111",
        search: "233",
      },
      "explicit-order-prefix",
    );
    for (const { url } of calls.slice(0, 4)) {
      const params = new URL(url).searchParams;
      assert.equal(params.get("orderNumberPrefix"), "445");
      assert.equal(params.has("search"), false);
      assert.equal(params.has("q"), false);
      assertPreservedFilters(params);
    }
    const snapshot = JSON.parse(calls[4].requestOptions.body);
    assert.equal(snapshot.filters.orderNumberPrefix, "445");
    assert.equal("search" in snapshot.filters, false);
    assert.equal("q" in snapshot.filters, false);
    assert.equal(snapshot.filters.filterVersion, "2");
  } finally {
    if (previous === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previous;
  }
});

test("blank order search sends no order-number filter", async () => {
  const previous = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";

  try {
    const calls = await captureOrderRequests(
      { ...preservedFilters, q: "   ", search: "   " },
      "blank-order-prefix",
    );
    for (const { url } of calls.slice(0, 4)) {
      const params = new URL(url).searchParams;
      assert.equal(params.has("orderNumberPrefix"), false);
      assert.equal(params.has("search"), false);
      assert.equal(params.has("q"), false);
      assertPreservedFilters(params);
    }
    const snapshot = JSON.parse(calls[4].requestOptions.body);
    assert.equal("orderNumberPrefix" in snapshot.filters, false);
    assert.equal("search" in snapshot.filters, false);
    assert.equal("q" in snapshot.filters, false);
  } finally {
    if (previous === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previous;
  }
});

test("unsupported repeated markers reach API validation without widening the query", async () => {
  const previous = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  try {
    for (const search of ["##", "##233", "# #233"]) {
      const normalized = normalizeOrderSearch(search);
      const calls = await captureOrderRequests({ search: normalized }, `repeated-marker-${search}`);
      for (const { url } of calls.slice(0, 4)) {
        assert.equal(new URL(url).searchParams.get("orderNumberPrefix"), search);
      }
      assert.equal(JSON.parse(calls[4].requestOptions.body).filters.orderNumberPrefix, search);
      assert.deepEqual(filterOrders([{ id: "order", name: "#2335" }], { scope: "history", search: normalized }), []);
    }
  } finally {
    if (previous === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previous;
  }
});

test("legacy order search matches only the displayed order-name prefix", () => {
  const orders = [
    { id: "prefix", name: "#2335" },
    { id: "contains", name: "#12335" },
    { id: "phone", name: "#1774", phone: "416-2335" },
    { address: "2335 Fixture Street", id: "address", name: "#1885" },
    { id: "internal-2335", name: "#1995", orderId: "2335" },
    { id: "merchant-prefix", name: "#AB1234" },
    { id: "merchant-contains", name: "#ZAB1234" },
    { id: "missing-name", orderId: "AB1234" },
  ];

  assert.deepEqual(
    filterOrders(orders, { scope: "history", search: "#233" }).map(({ id }) => id),
    ["prefix"],
  );
  assert.deepEqual(
    filterOrders(orders, { scope: "history", search: "233" }).map(({ id }) => id),
    ["prefix"],
  );
  assert.deepEqual(
    filterOrders(orders, { scope: "history", search: "AB123" }).map(({ id }) => id),
    ["merchant-prefix"],
  );
});
