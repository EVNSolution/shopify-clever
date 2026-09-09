/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildStandaloneRouteSplitPayload,
  clearDeliveryApiResponseCache,
  copyDeliveryRoutePlan,
  DELIVERY_ROUTE_PLAN_ALREADY_GROUPED_ERROR_CODE,
  DELIVERY_ROUTE_PLAN_INVALID_ALLOCATION_ERROR_CODE,
  DELIVERY_ROUTE_PLAN_MUTATION_OUTCOME_UNKNOWN_ERROR_CODE,
  DELIVERY_ROUTE_PLAN_NOT_EDITABLE_ERROR_CODE,
  DELIVERY_ROUTE_PLAN_NOT_FOUND_ERROR_CODE,
  DELIVERY_ROUTE_PLAN_REVISION_CONFLICT_ERROR_CODE,
  fetchDeliveryRoutePlans,
  primeDeliveryApiGetResponseCache,
  splitDeliveryRoutePlan,
} from "../app/features/delivery/route-plans.server.js";

process.env.CLEVER_DELIVERY_API_URL = "https://delivery.test/";
process.env.CLEVER_APP_ID = "clever-route-dev";
process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "0";

function makeRequest() {
  return new Request("https://admin.shopify.test/app/routes/route-1?id_token=query-token");
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

test("ordinary Route copy posts the exact source revision and returns the new real route", async () => {
  const fakeFetch = makeFetch({
    data: { routePlan: { id: "copy/2", name: "Saturday Copy", status: "READY" } },
    error: null,
  }, 201);

  const result = await copyDeliveryRoutePlan(
    makeRequest(),
    "source/1",
    { expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z" },
    { fetch: fakeFetch, sessionToken: "session-token" },
  );

  assert.deepEqual(result, {
    routePlan: { id: "copy/2", name: "Saturday Copy", status: "READY" },
    errors: [],
  });
  assert.equal(fakeFetch.calls.length, 1);
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-plans/source%2F1/copies");
  assert.equal(fakeFetch.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(fakeFetch.calls[0].init.body), {
    expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z",
  });
});

test("ordinary mutations do not call the server without a route ID and exact revision", async () => {
  const fakeFetch = makeFetch();
  const missingId = await copyDeliveryRoutePlan(
    makeRequest(),
    "",
    { expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z" },
    { fetch: fakeFetch, sessionToken: "session-token" },
  );
  const missingRevision = await splitDeliveryRoutePlan(
    makeRequest(),
    "copy-1",
    { routes: [] },
    { fetch: fakeFetch, sessionToken: "session-token" },
  );

  assert.equal(fakeFetch.calls.length, 0);
  assert.equal(missingId.errors[0].code, "DELIVERY_ROUTE_PLAN_ID_MISSING");
  assert.equal(missingRevision.errors[0].code, "DELIVERY_ROUTE_PLAN_REVISION_MISSING");
  assert.equal(missingId.outcomeUnknown, undefined);
  assert.equal(missingRevision.outcomeUnknown, undefined);
});

test("ordinary split payload keeps supported draft row fields and strips group-only mutation fields", () => {
  const payload = buildStandaloneRouteSplitPayload({
    deletedRoutePlanIds: ["route-deleted"],
    expectedUpdatedAt: "group-revision",
    mode: "OPTIMIZE_ORDER",
    removedOrderIds: ["order-removed"],
    routes: [{
      branchId: null,
      color: "#123456",
      deleted: true,
      driverId: null,
      expectedChildUpdatedAt: "2026-09-09T11:59:00.000Z",
      expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z",
      label: "West",
      optimized: { orderIds: ["order-1"] },
      orderIds: ["order-1"],
      removed: true,
      routeIdx: 7,
      routeKey: "routePlan:copy-1",
      routePlanId: "copy-1",
      scheduledStartAt: "2026-09-10T13:00:00.000Z",
      scheduledStartTimeZone: "America/Toronto",
      sortOrder: 0,
      tempId: null,
      unsupported: "do-not-send",
    }, {
      label: null,
      orderIds: ["order-2"],
      routeKey: "temp:2",
      routePlanId: null,
      tempId: "temp:2",
    }],
  }, "2026-09-09T12:00:00.000Z");

  assert.deepEqual(payload, {
    expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z",
    mode: "MANUAL_ORDER",
    routes: [{
      branchId: null,
      color: "#123456",
      driverId: null,
      expectedChildUpdatedAt: "2026-09-09T11:59:00.000Z",
      expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z",
      label: "West",
      orderIds: ["order-1"],
      routeIdx: 7,
      routeKey: "routePlan:copy-1",
      routePlanId: "copy-1",
      scheduledStartAt: "2026-09-10T13:00:00.000Z",
      scheduledStartTimeZone: "America/Toronto",
      sortOrder: 0,
      tempId: null,
    }, {
      label: null,
      orderIds: ["order-2"],
      routeKey: "temp:2",
      routePlanId: null,
      tempId: "temp:2",
    }],
  });
  assert.equal("deletedRoutePlanIds" in payload, false);
  assert.equal("removedOrderIds" in payload, false);
  assert.equal("optimized" in payload.routes[0], false);
});

test("ordinary split posts one atomic MANUAL_ORDER request and returns the saved group", async () => {
  const routeGroup = {
    id: "group-1",
    children: [
      { routePlanId: "copy-1" },
      { routePlanId: "created-2" },
      { routePlanId: "created-3" },
    ],
  };
  const fakeFetch = makeFetch({ data: { routeGroup }, error: null }, 201);
  const draft = {
    deletedRoutePlanIds: ["must-not-send"],
    removedOrderIds: ["must-not-send"],
    routes: [
      { orderIds: ["order-1"], routePlanId: "copy-1" },
      { optimized: {}, orderIds: ["order-2"], routePlanId: null, tempId: "temp-2" },
      { orderIds: ["order-3"], routePlanId: null, tempId: "temp-3" },
    ],
  };

  const result = await splitDeliveryRoutePlan(makeRequest(), "copy-1", draft, {
    expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z",
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.deepEqual(result, { routeGroup, errors: [] });
  assert.equal(fakeFetch.calls.length, 1);
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-plans/copy-1/route-group");
  assert.equal(fakeFetch.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(fakeFetch.calls[0].init.body), {
    expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z",
    mode: "MANUAL_ORDER",
    routes: [
      { orderIds: ["order-1"], routePlanId: "copy-1" },
      { orderIds: ["order-2"], routePlanId: null, tempId: "temp-2" },
      { orderIds: ["order-3"], routePlanId: null, tempId: "temp-3" },
    ],
  });
});

test("ordinary mutations preserve HTTP status and expose stable conflict categories", async () => {
  const cases = [
    [409, { code: "ROUTE_GROUPING_STALE_WRITE", message: "Route revision changed" }, DELIVERY_ROUTE_PLAN_REVISION_CONFLICT_ERROR_CODE],
    [409, { code: "ROUTE_GROUPING_STALE_WRITE", message: "Route must still be standalone" }, DELIVERY_ROUTE_PLAN_ALREADY_GROUPED_ERROR_CODE],
    [400, { code: "ROUTE_GROUPING_INVALID", message: "Route status is IN_PROGRESS" }, DELIVERY_ROUTE_PLAN_NOT_EDITABLE_ERROR_CODE],
    [400, { code: "ROUTE_GROUPING_INVALID", message: "Order allocation is incomplete" }, DELIVERY_ROUTE_PLAN_INVALID_ALLOCATION_ERROR_CODE],
    [404, { code: "NOT_FOUND", message: "Route plan not found" }, DELIVERY_ROUTE_PLAN_NOT_FOUND_ERROR_CODE],
  ];

  for (const [status, error, expectedCode] of cases) {
    const result = await splitDeliveryRoutePlan(makeRequest(), "copy-1", { routes: [] }, {
      expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z",
      fetch: makeFetch({ data: null, error }, status),
      sessionToken: "session-token",
    });
    assert.equal(result.errors[0].code, expectedCode);
    assert.equal(result.errors[0].serverCode, error.code);
    assert.equal(result.errors[0].status, status);
    assert.equal(result.outcomeUnknown, undefined);
  }
});

test("network and malformed success outcomes are marked uncertain without retrying", async () => {
  let networkCalls = 0;
  const networkResult = await copyDeliveryRoutePlan(
    makeRequest(),
    "source-1",
    { expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z" },
    {
      fetch: async () => {
        networkCalls += 1;
        throw new Error("connection closed after write");
      },
      sessionToken: "session-token",
    },
  );
  assert.equal(networkCalls, 1);
  assert.equal(networkResult.outcomeUnknown, true);
  assert.equal(networkResult.errors[0].code, DELIVERY_ROUTE_PLAN_MUTATION_OUTCOME_UNKNOWN_ERROR_CODE);
  assert.equal(networkResult.errors[0].serverCode, "DELIVERY_API_ERROR");
  assert.equal(networkResult.errors[0].status, 0);

  const gatewayFetch = makeFetch({
    data: null,
    error: { code: "BAD_GATEWAY", message: "upstream response was lost" },
  }, 502);
  const gatewayResult = await splitDeliveryRoutePlan(makeRequest(), "copy-1", { routes: [] }, {
    expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z",
    fetch: gatewayFetch,
    sessionToken: "session-token",
  });
  assert.equal(gatewayFetch.calls.length, 1);
  assert.equal(gatewayResult.outcomeUnknown, true);
  assert.equal(gatewayResult.errors[0].code, DELIVERY_ROUTE_PLAN_MUTATION_OUTCOME_UNKNOWN_ERROR_CODE);
  assert.equal(gatewayResult.errors[0].serverCode, "BAD_GATEWAY");
  assert.equal(gatewayResult.errors[0].status, 502);

  const malformedFetch = makeFetch({ data: {}, error: null }, 201);
  const malformedResult = await splitDeliveryRoutePlan(makeRequest(), "copy-1", { routes: [] }, {
    expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z",
    fetch: malformedFetch,
    sessionToken: "session-token",
  });
  assert.equal(malformedFetch.calls.length, 1);
  assert.equal(malformedResult.outcomeUnknown, true);
  assert.equal(malformedResult.errors[0].code, DELIVERY_ROUTE_PLAN_MUTATION_OUTCOME_UNKNOWN_ERROR_CODE);
});

test("an uncertain attempted mutation clears cached Route lists before reconciliation", async () => {
  const previousCacheTtl = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "60000";
  clearDeliveryApiResponseCache();
  const request = makeRequest();
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ init, url });
    if (init.method === "POST") throw new Error("gateway closed after accepting request");
    return jsonResponse({ data: { routePlans: [{ id: "copy-created-after-timeout" }] }, error: null });
  };

  try {
    const primed = primeDeliveryApiGetResponseCache(
      request,
      "/admin/route-plans",
      { data: { routePlans: [{ id: "stale-source-only" }] }, errors: [] },
      { cacheTtlMs: 60_000, fetch: fakeFetch, sessionToken: "session-token" },
    );
    assert.equal(primed, true);

    const cached = await fetchDeliveryRoutePlans(request, {
      fetch: fakeFetch,
      sessionToken: "session-token",
    });
    assert.deepEqual(cached.routePlans, [{ id: "stale-source-only" }]);
    assert.equal(calls.length, 0);

    const mutation = await copyDeliveryRoutePlan(
      request,
      "source-1",
      { expectedRoutePlanUpdatedAt: "2026-09-09T12:00:00.000Z" },
      { fetch: fakeFetch, sessionToken: "session-token" },
    );
    assert.equal(mutation.outcomeUnknown, true);
    assert.equal(calls.length, 1);

    const refreshed = await fetchDeliveryRoutePlans(request, {
      fetch: fakeFetch,
      sessionToken: "session-token",
    });
    assert.deepEqual(refreshed.routePlans, [{ id: "copy-created-after-timeout" }]);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].init.method, "GET");
  } finally {
    clearDeliveryApiResponseCache();
    process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = previousCacheTtl;
  }
});

test("route detail action maps ordinary Copy and Save to the standalone clients", () => {
  const source = readFileSync(
    join(process.cwd(), "app/features/delivery/route-detail.server.js"),
    "utf8",
  );
  assert.match(source, /if \(intent === "copyRoutePlan"\)[\s\S]*copyDeliveryRoutePlan\([\s\S]*expectedRoutePlanUpdatedAt/);
  assert.match(source, /const expectedRoutePlanUpdatedAt = textOrUndefined\(formData\.get\("expectedRoutePlanUpdatedAt"\)\)/);
  assert.match(source, /const result = routeGroupId[\s\S]*saveDeliveryRouteGroupDraft[\s\S]*splitDeliveryRoutePlan\(/);
  assert.match(source, /splitDeliveryRoutePlan\([\s\S]*routeId,[\s\S]*draft,[\s\S]*expectedRoutePlanUpdatedAt/);
});
