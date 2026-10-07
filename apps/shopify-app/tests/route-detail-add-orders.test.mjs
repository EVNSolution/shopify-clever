/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { buildRouteAddOrderCandidates } from "../app/features/delivery/route-add-order-candidates.js";

function order(orderId, overrides = {}) {
  return {
    deliveryDate: null,
    hasCoordinates: true,
    name: `#${orderId}`,
    orderId,
    routePlanId: "foreign-plan",
    ...overrides,
  };
}

function loadAction({ orders, routeGroup }) {
  const source = readFileSync("app/features/delivery/route-detail.server.js", "utf8");
  const start = source.indexOf("export const routeDetailAction = ");
  const end = source.indexOf("\nexport async function refreshRouteOrders", start);
  const updateCalls = [];
  const text = (value) => typeof value === "string" && value.trim() ? value.trim() : undefined;
  const action = vm.runInNewContext(`(${source.slice(start + "export const routeDetailAction = ".length, end).trim().replace(/;$/, "")})`, {
    authenticate: { admin: async () => ({ admin: {}, session: { shop: "fixture.myshopify.com" } }) },
    buildRouteAddOrderCandidates,
    cleanRoutePathParam: text,
    clearDeliveryApiResponseCache() {},
    fetchDeliveryOrders: async () => ({ errors: [], orders }),
    fetchDeliveryRouteGroupDetail: async () => ({ errors: [], routeGroup }),
    fetchDeliveryRoutePlanDetail: async () => ({ errors: [], routePlan: { id: "target-plan" } }),
    getRouteGroupChildRoutePlanId: (child) => child?.routePlanId ?? child?.routePlan?.id,
    getVisibleRouteGroupChildren: (group) => group?.children ?? [],
    logRouteDetailPerformance() {},
    readJsonTextArray: (value) => JSON.parse(value ?? "[]"),
    textOrUndefined: text,
    updateDeliveryRouteGroupOrders: async (_request, groupId, payload, options) => {
      updateCalls.push({
        groupId,
        options: { ...options },
        payload: { ...payload, addOrderIds: [...payload.addOrderIds] },
      });
      return { errors: [], routeGroup };
    },
  });
  return { action, updateCalls };
}

function actionRequest(intent, orderIds = []) {
  const form = new FormData();
  form.set("_intent", intent);
  form.set("orderIds", JSON.stringify(orderIds));
  form.set("shopifySessionToken", "fixture-token");
  form.set("targetRoutePlanId", "target-plan");
  return new Request("https://fixture.invalid", { body: form, method: "POST" });
}

test("addRouteOrders forwards a foreign planned Date Pending order with the current group revision", async () => {
  const routeGroup = {
    children: [{ orderIds: ["base"], routePlanId: "target-plan" }],
    id: "group-1",
    updatedAt: "2026-10-03T12:00:00.000Z",
  };
  const { action, updateCalls } = loadAction({ orders: [order("2324")], routeGroup });

  const result = await action({
    params: { routeGroupId: routeGroup.id, routeId: "target-plan" },
    request: actionRequest("addRouteOrders", ["2324"]),
  });

  assert.equal(result.addedOrders, 1);
  assert.deepEqual(updateCalls, [{
    groupId: routeGroup.id,
    options: { sessionToken: "fixture-token" },
    payload: {
      addOrderIds: ["2324"],
      expectedUpdatedAt: routeGroup.updatedAt,
      targetRoutePlanId: "target-plan",
    },
  }]);
});

test("addRouteOrders blocks an order assigned to a current sibling without calling the API", async () => {
  const routeGroup = {
    children: [
      { orderIds: ["base"], routePlanId: "target-plan" },
      { orderIds: ["2324"], routePlanId: "sibling-plan" },
    ],
    id: "group-1",
  };
  const { action, updateCalls } = loadAction({ orders: [order("2324")], routeGroup });

  const result = await action({
    params: { routeGroupId: routeGroup.id, routeId: "target-plan" },
    request: actionRequest("addRouteOrders", ["2324"]),
  });

  assert.match(result.errors[0].message, /추가할 수 없는 주문/);
  assert.equal(updateCalls.length, 0);
});

test("loadAddOrderCandidates applies the same route-group membership policy as addRouteOrders", async () => {
  const routeGroup = {
    children: [{ orderIds: ["same-group"], routePlanId: "sibling-plan" }],
    id: "group-1",
  };
  const { action } = loadAction({
    orders: [order("foreign"), order("same-group", { routePlanId: "sibling-plan" })],
    routeGroup,
  });

  const result = await action({
    params: { routeGroupId: routeGroup.id, routeId: "target-plan" },
    request: actionRequest("loadAddOrderCandidates"),
  });

  assert.deepEqual(
    result.addOrderCandidates.map(({ addable, addBlockedReason, orderId }) => [orderId, addable, addBlockedReason]),
    [
      ["foreign", true, null],
      ["same-group", false, "Already assigned within this route group"],
    ],
  );
});
