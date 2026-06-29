/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeliveryInventory,
  fetchDeliveryInventories,
  fetchDeliveryInventoryDetail,
} from "../app/features/delivery/inventories.server.js";

process.env.CLEVER_DELIVERY_API_URL = "https://delivery.test/";
process.env.CLEVER_APP_ID = "clever-route-dev";
process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "0";

function makeRequest() {
  return new Request("https://admin.shopify.test/app/orders?id_token=query-token");
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function makeFetch(payload = { data: {}, error: null }, status = 200) {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ init, url });
    return jsonResponse(payload, status);
  };
  fakeFetch.calls = calls;
  return fakeFetch;
}

test("inventory helper lists inventories through the Admin delivery API", async () => {
  const fakeFetch = makeFetch({ data: { inventories: [{ id: "inventory-1" }] }, error: null });

  const result = await fetchDeliveryInventories(
    makeRequest(),
    { routeGroupingId: "group/1", empty: "" },
    { fetch: fakeFetch, sessionToken: "session-token" },
  );

  assert.deepEqual(result, { inventories: [{ id: "inventory-1" }], errors: [] });
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/inventories?routeGroupingId=group%2F1");
  assert.equal(fakeFetch.calls[0].init.method, "GET");
  assert.equal(fakeFetch.calls[0].init.headers.authorization, "Bearer session-token");
  assert.equal(fakeFetch.calls[0].init.headers["x-clever-app-id"], "clever-route-dev");
});

test("inventory helper creates standalone inventories through the Admin delivery API", async () => {
  const fakeFetch = makeFetch({ data: { inventory: { id: "inventory-1" } }, error: null }, 201);

  const result = await createDeliveryInventory(
    makeRequest(),
    { name: "Prep batch", orderIds: ["order-1"] },
    { fetch: fakeFetch, sessionToken: "session-token" },
  );

  assert.deepEqual(result, { inventory: { id: "inventory-1" }, errors: [] });
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/inventories");
  assert.equal(fakeFetch.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(fakeFetch.calls[0].init.body), { name: "Prep batch", orderIds: ["order-1"] });
});

test("inventory helper fetches an encoded inventory detail", async () => {
  const fakeFetch = makeFetch({ data: { inventory: { id: "inventory/1" } }, error: null });

  const result = await fetchDeliveryInventoryDetail(makeRequest(), "inventory/1", {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.deepEqual(result, { inventory: { id: "inventory/1" }, errors: [] });
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/inventories/inventory%2F1");
  assert.equal(fakeFetch.calls[0].init.method, "GET");
});

test("inventory helper returns a local error when the inventory id is missing", async () => {
  const result = await fetchDeliveryInventoryDetail(makeRequest(), "", { fetch: makeFetch() });

  assert.equal(result.inventory, null);
  assert.equal(result.errors[0].code, "DELIVERY_INVENTORY_ID_MISSING");
});
