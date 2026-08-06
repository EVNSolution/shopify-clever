/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import { buildRouteAddOrderCandidates } from "../app/features/delivery/route-add-order-candidates.js";

function candidate(overrides = {}) {
  return {
    address: "100 Test St, Toronto, ON",
    customer: "Test Customer",
    deliveryDate: "2026-08-06",
    deliveryDay: "Thursday",
    hasCoordinates: true,
    id: "gid://shopify/Order/1001",
    itemCount: 2,
    name: "#1001",
    orderId: "order-1001",
    ...overrides,
  };
}

test("route add-order candidates stay locked to the current delivery date and exclude unavailable orders", () => {
  const candidates = buildRouteAddOrderCandidates([
    candidate(),
    candidate({ id: "gid://shopify/Order/1002", name: "#1002", orderId: "order-1002", deliveryDate: "2026-08-13" }),
    candidate({ id: "gid://shopify/Order/1003", name: "#1003", orderId: "order-1003", routePlanId: "route-2" }),
    candidate({ id: "gid://shopify/Order/1004", name: "#1004", orderId: "order-1004", hasCoordinates: false }),
    candidate({ id: "gid://shopify/Order/1005", name: "#1005", orderId: "order-1005", deliveryStopStatus: "DELIVERED" }),
  ], {
    routePlan: { deliveryDate: "2026-08-06" },
  });

  assert.deepEqual(candidates, [{
    address: "100 Test St, Toronto, ON",
    customer: "Test Customer",
    deliveryDate: "2026-08-06",
    deliveryDay: "THURSDAY",
    id: "gid://shopify/Order/1001",
    itemCount: 2,
    name: "#1001",
    orderId: "order-1001",
  }]);
});

test("route add-order candidates fall back to the route weekday when no exact date exists", () => {
  const candidates = buildRouteAddOrderCandidates([
    candidate({ deliveryDate: "2026-08-07", deliveryDay: "Friday" }),
    candidate({ deliveryDate: "2026-08-08", deliveryDay: "Saturday", id: "gid://shopify/Order/1002", orderId: "order-1002" }),
  ], {
    routePlan: { routeScope: { deliveryDay: "Friday" } },
  });

  assert.deepEqual(candidates.map((order) => order.orderId), ["order-1001"]);
});

test("route add-order candidates are empty when the route has no delivery date or weekday scope", () => {
  assert.deepEqual(buildRouteAddOrderCandidates([candidate()], {}), []);
});
