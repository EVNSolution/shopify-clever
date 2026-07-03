/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRouteGroupChildDeleteDraft,
  buildRouteGroupChildrenDeleteDraft,
  createDeliveryRouteGroup,
  deleteDeliveryRouteGroup,
  deleteDeliveryRouteGroupChildRoute,
  DELIVERY_ROUTE_GROUP_ID_MISSING_ERROR_CODE,
  fetchDeliveryRouteGroups,
  generateDeliveryRouteGroupChildRoutes,
  previewDeliveryRouteGroupOptimization,
  saveDeliveryRouteGroupDraft,
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

function makeFetchSequence(responses) {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ init, url });
    const response = responses[Math.min(calls.length - 1, responses.length - 1)] ?? { payload: { data: {}, error: null }, status: 200 };
    return jsonResponse(response.payload, response.status ?? 200);
  };
  fakeFetch.calls = calls;
  return fakeFetch;
}

test("route group helper creates route groups through the Admin delivery API", async () => {
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

test("route group helper normalizes nested child route plan ids", async () => {
  const fakeFetch = makeFetch({
    data: {
      routeGroups: [
        {
          id: "group-1",
          children: [{ routePlan: { id: "route-1" } }],
        },
      ],
    },
    error: null,
  });

  const result = await fetchDeliveryRouteGroups(makeRequest(), {}, {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.equal(result.routeGroups[0].children[0].routePlanId, "route-1");
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
  const fakeFetch = makeFetch({ data: { routeGroup: { id: "group/1", status: "DRAFT" } }, error: null });
  const payload = { addOrderIds: ["order-2"], removeOrderIds: ["order-1"] };

  const result = await updateDeliveryRouteGroupOrders(makeRequest(), "group/1", payload, {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.deepEqual(result, { routeGroup: { id: "group/1", status: "DRAFT" }, errors: [] });
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1/orders");
  assert.equal(fakeFetch.calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(fakeFetch.calls[0].init.body), payload);
});

test("route group helper saves a batched draft allocation", async () => {
  const fakeFetch = makeFetch({ data: { routeGroup: { id: "group/1", status: "DRAFT" } }, error: null });
  const payload = { routes: [{ orderIds: ["order-1"], routeIdx: 1, routePlanId: "route/1" }, { orderIds: ["order-2"], routeIdx: 2, tempId: "temp/2" }] };

  const result = await saveDeliveryRouteGroupDraft(makeRequest(), "group/1", payload, {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.deepEqual(result, { routeGroup: { id: "group/1", status: "DRAFT" }, errors: [] });
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1/draft");
  assert.equal(fakeFetch.calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(fakeFetch.calls[0].init.body), payload);
});

test("route group child delete draft merges deleted child orders into the first route", () => {
  const group = {
    id: "group/1",
    children: [
      { routeIdx: 1, routePlanId: "route/1", orderIds: ["order-1"], routePlan: { id: "route/1", name: "Group — #1" } },
      { routeIdx: 2, routePlanId: "route/2", orderIds: ["order-2"], routePlan: { id: "route/2", name: "Group — #2" } },
      { routeIdx: 3, routePlanId: "route/3", orderIds: ["order-3"], routePlan: { id: "route/3", name: "Group — #3" } },
    ],
    name: "Group",
  };

  const afterRoute3Delete = buildRouteGroupChildDeleteDraft(group, "route/3").draft;
  assert.deepEqual(afterRoute3Delete.routes.map((route) => route.orderIds), [
    ["order-1", "order-3"],
    ["order-2"],
  ]);
  assert.deepEqual(afterRoute3Delete.routes.map((route) => route.routeIdx), [1, 2]);
  assert.deepEqual(afterRoute3Delete.routes.map((route) => route.routePlanId), ["route/1", "route/2"]);

  const afterRoute1Delete = buildRouteGroupChildDeleteDraft(group, "route/1").draft;
  assert.deepEqual(afterRoute1Delete.routes.map((route) => route.orderIds), [
    ["order-2", "order-1"],
    ["order-3"],
  ]);
  assert.deepEqual(afterRoute1Delete.routes.map((route) => route.routeIdx), [2, 3]);
  assert.deepEqual(afterRoute1Delete.routes.map((route) => route.routePlanId), ["route/2", "route/3"]);

  const afterRoute2Delete = buildRouteGroupChildDeleteDraft({
    ...group,
    children: [
      { routeIdx: 1, routePlanId: "route/1", orderIds: ["order-1", "order-3"], routePlan: { id: "route/1", name: "Group — #1" } },
      { routeIdx: 2, routePlanId: "route/2", orderIds: ["order-2"], routePlan: { id: "route/2", name: "Group — #2" } },
    ],
  }, "route/2");

  assert.equal(afterRoute2Delete.draft, null);
  assert.deepEqual(afterRoute2Delete.errors, []);

  const afterRoute2And3Delete = buildRouteGroupChildrenDeleteDraft(group, ["route/2", "route/3"]);
  assert.equal(afterRoute2And3Delete.draft, null);
  assert.deepEqual(afterRoute2And3Delete.errors, []);
});

test("route group helper deletes a child route plan before saving the merged draft", async () => {
  const fakeFetch = makeFetchSequence([
    {
      payload: {
        data: {
          routeGroup: {
            id: "group/1",
            name: "Group",
            children: [
              { routeIdx: 1, routePlanId: "route/1", orderIds: ["order-1"], routePlan: { id: "route/1", name: "Group — #1" } },
              { routeIdx: 2, routePlanId: "route/2", orderIds: ["order-2"], routePlan: { id: "route/2", name: "Group — #2" } },
              { routeIdx: 3, routePlanId: "route/3", orderIds: ["order-3"], routePlan: { id: "route/3", name: "Group — #3" } },
            ],
          },
        },
        error: null,
      },
    },
    { payload: { data: { routePlanId: "route/3", deleted: true }, error: null } },
    { payload: { data: { routeGroup: { id: "group/1", status: "DRAFT" } }, error: null } },
  ]);

  const result = await deleteDeliveryRouteGroupChildRoute(makeRequest(), "group/1", "route/3", {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.deepEqual(result, {
    routeGroup: { id: "group/1", status: "DRAFT" },
    routeGroupId: "group/1",
    routePlanId: "route/3",
    routePlanIds: ["route/3"],
    errors: [],
  });
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1");
  assert.equal(fakeFetch.calls[0].init.method, "GET");
  assert.equal(fakeFetch.calls[1].url, "https://delivery.test/admin/route-plans/route%2F3");
  assert.equal(fakeFetch.calls[1].init.method, "DELETE");
  assert.equal(fakeFetch.calls[2].url, "https://delivery.test/admin/route-groups/group%2F1/draft");
  assert.equal(fakeFetch.calls[2].init.method, "PATCH");
  assert.deepEqual(JSON.parse(fakeFetch.calls[2].init.body).routes.map((route) => route.orderIds), [["order-1", "order-3"], ["order-2"]]);
});

test("route group helper skips draft save when child delete collapses the split", async () => {
  const fakeFetch = makeFetchSequence([
    {
      payload: {
        data: {
          routeGroup: {
            id: "group/1",
            name: "Group",
            children: [
              { routeIdx: 1, routePlanId: "route/1", orderIds: ["order-1"], routePlan: { id: "route/1", name: "Group — #1" } },
              { routeIdx: 2, routePlanId: "route/2", orderIds: ["order-2"], routePlan: { id: "route/2", name: "Group — #2" } },
            ],
          },
        },
        error: null,
      },
    },
    { payload: { data: { routePlanId: "route/2", deleted: true }, error: null } },
  ]);

  const result = await deleteDeliveryRouteGroupChildRoute(makeRequest(), "group/1", "route/2", {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.equal(result.routeGroupId, "group/1");
  assert.equal(result.routePlanId, "route/2");
  assert.deepEqual(result.routePlanIds, ["route/2"]);
  assert.deepEqual(result.errors, []);
  assert.equal(fakeFetch.calls.length, 2);
  assert.equal(fakeFetch.calls[1].url, "https://delivery.test/admin/route-plans/route%2F2");
  assert.equal(fakeFetch.calls[1].init.method, "DELETE");
});

test("route group helper previews optimization without saving the draft", async () => {
  const preview = { routes: [{ orderIds: ["order-1"], routeIdx: 1, routeKey: "routeIdx:1" }] };
  const fakeFetch = makeFetch({ data: { preview }, error: null });
  const payload = { mode: "OPTIMIZE_ORDER", routes: [{ orderIds: ["order-1"], routeIdx: 1, routeKey: "routeIdx:1" }] };

  const result = await previewDeliveryRouteGroupOptimization(makeRequest(), "group/1", payload, {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.deepEqual(result, { preview, errors: [] });
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1/optimize-preview");
  assert.equal(fakeFetch.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(fakeFetch.calls[0].init.body), payload);
});

test("route group helper normalizes generated child routes", async () => {
  const fakeFetch = makeFetch({
    data: {
      routeGroup: {
        id: "group/1",
        children: [{ routePlan: { id: "route/1" } }],
      },
    },
    error: null,
  });

  const result = await generateDeliveryRouteGroupChildRoutes(makeRequest(), "group/1", {}, {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.equal(result.routeGroup.children[0].routePlanId, "route/1");
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1/generate-child-routes");
  assert.equal(fakeFetch.calls[0].init.method, "POST");
});

test("route group helper deletes route groups through the Admin delivery API", async () => {
  const fakeFetch = makeFetch({ data: { routeGroupId: "group/1" }, error: null });

  const result = await deleteDeliveryRouteGroup(makeRequest(), "group/1", {
    fetch: fakeFetch,
    sessionToken: "session-token",
  });

  assert.equal(result.routeGroupId, "group/1");
  assert.deepEqual(result.errors, []);
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1");
  assert.equal(fakeFetch.calls[0].init.method, "DELETE");
  assert.equal(fakeFetch.calls[0].init.body, undefined);
});

test("route group helper returns a local error when the route group id is missing", async () => {
  const result = await updateDeliveryRouteGroupOrders(makeRequest(), "", {}, { fetch: makeFetch() });

  assert.equal(result.routeGroup, null);
  assert.equal(result.errors[0].code, DELIVERY_ROUTE_GROUP_ID_MISSING_ERROR_CODE);
});
