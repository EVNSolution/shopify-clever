/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeliveryRouteGroupBranch,
  createDeliveryRouteGroup,
  deleteDeliveryRouteGroupBranch,
  DELIVERY_ROUTE_GROUP_ID_MISSING_ERROR_CODE,
  fetchDeliveryRouteGroups,
  updateDeliveryRouteGroupBranchOrders,
  updateDeliveryRouteGroupOrders,
} from "../app/features/delivery/route-groups.server.js";

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

test("route group helper creates parent groups through the Admin delivery API", async () => {
  const fakeFetch = makeFetch({ data: { routeGroup: { id: "group-1" } }, error: null });
  const payload = { dateRangeStart: "2026-06-25", dateRangeEnd: "2026-06-27", orderIds: ["order-1"] };

  const result = await createDeliveryRouteGroup(makeRequest(), payload, {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.deepEqual(result, { routeGroup: { id: "group-1" }, errors: [] });
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups");
  assert.equal(fakeFetch.calls[0].init.method, "POST");
  assert.equal(fakeFetch.calls[0].init.headers.authorization, "Bearer session-token");
  assert.equal(fakeFetch.calls[0].init.headers["x-clever-app-id"], "clever-route-dev");
  assert.equal(fakeFetch.calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fakeFetch.calls[0].init.body), payload);
});

test("route group helper lists groups with range query params only when present", async () => {
  const fakeFetch = makeFetch({ data: { routeGroups: [{ id: "group-1" }] }, error: null });

  const result = await fetchDeliveryRouteGroups(
    makeRequest(),
    { dateRangeStart: "2026-06-25", dateRangeEnd: "2026-06-27", deliveryDate: "" },
    { fetch: fakeFetch, sessionToken: "Bearer session-token" },
  );

  assert.deepEqual(result.routeGroups, [{ id: "group-1" }]);
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups?dateRangeStart=2026-06-25&dateRangeEnd=2026-06-27");
  assert.equal(fakeFetch.calls[0].init.method, "GET");
});


test("route group helper treats a missing backend endpoint as optional while it is rolling out", async () => {
  const fakeFetch = makeFetch({ data: null, error: { message: "Not Found" } }, 404);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  let result;
  try {
    result = await fetchDeliveryRouteGroups(makeRequest(), {}, {
      fetch: fakeFetch,
      sessionToken: "session-token",
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(result, { routeGroups: [], errors: [] });
  assert.deepEqual(warnings, []);
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups");
});

test("route group helper updates membership without child generation side effects", async () => {
  const fakeFetch = makeFetch({ data: { routeGroup: { id: "group/1", status: "CHANGED" } }, error: null });
  const payload = { addOrderIds: ["order-2"], removeOrderIds: ["order-1"] };

  const result = await updateDeliveryRouteGroupOrders(makeRequest(), "group/1", payload, {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.deepEqual(result, { routeGroup: { id: "group/1", status: "CHANGED" }, errors: [] });
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1/orders");
  assert.equal(fakeFetch.calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(fakeFetch.calls[0].init.body), payload);
});

test("route group helper creates branch locks without child generation side effects", async () => {
  const fakeFetch = makeFetch({ data: { routeGroup: { id: "group/1", branches: [{ id: "branch/1" }] } }, error: null });
  const payload = { label: "Driver A", orderIds: ["order-1"] };

  const result = await createDeliveryRouteGroupBranch(makeRequest(), "group/1", payload, {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.deepEqual(result, { routeGroup: { id: "group/1", branches: [{ id: "branch/1" }] }, errors: [] });
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1/branches");
  assert.equal(fakeFetch.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(fakeFetch.calls[0].init.body), payload);
});

test("route group helper updates and deletes branch locks", async () => {
  const updateFetch = makeFetch({ data: { routeGroup: { id: "group/1" } }, error: null });
  const deleteFetch = makeFetch({ data: { routeGroup: { id: "group/1" } }, error: null });

  await updateDeliveryRouteGroupBranchOrders(makeRequest(), "group/1", "branch/1", { removeOrderIds: ["order-1"] }, {
    fetch: updateFetch,
    sessionToken: "session-token",
  });
  await deleteDeliveryRouteGroupBranch(makeRequest(), "group/1", "branch/1", {
    fetch: deleteFetch,
    sessionToken: "session-token",
  });

  assert.equal(updateFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1/branches/branch%2F1/orders");
  assert.equal(updateFetch.calls[0].init.method, "PATCH");
  assert.equal(deleteFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1/branches/branch%2F1");
  assert.equal(deleteFetch.calls[0].init.method, "DELETE");
  assert.equal(deleteFetch.calls[0].init.body, undefined);
});

test("route group helper returns a local error when the route group id is missing", async () => {
  const result = await updateDeliveryRouteGroupOrders(makeRequest(), "", {}, { fetch: makeFetch() });

  assert.equal(result.routeGroup, null);
  assert.equal(result.errors[0].code, DELIVERY_ROUTE_GROUP_ID_MISSING_ERROR_CODE);
});
