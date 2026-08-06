/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRouteAddOrderCandidates,
  filterRouteAddOrderCandidatesByDate,
} from "../app/features/delivery/route-add-order-candidates.js";

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
    orderedDate: "2026-08-01T12:00:00Z",
    orderId: "order-1001",
    ...overrides,
  };
}

test("route add-order candidates include every eligible unplanned order regardless of route date", () => {
  const candidates = buildRouteAddOrderCandidates([
    candidate(),
    candidate({ id: "gid://shopify/Order/1002", name: "#1002", orderedDate: "2026-08-02T12:00:00Z", orderId: "order-1002", deliveryDate: "2026-08-13" }),
    candidate({ id: "gid://shopify/Order/1003", name: "#1003", orderId: "order-1003", routePlanId: "route-2" }),
    candidate({ id: "gid://shopify/Order/1004", name: "#1004", orderId: "order-1004", hasCoordinates: false }),
    candidate({ id: "gid://shopify/Order/1005", name: "#1005", orderId: "order-1005", deliveryStopStatus: "DELIVERED" }),
    candidate({ id: "gid://shopify/Order/1006", name: "#1006", orderId: "order-1006", cancelledAt: "2026-08-01T00:00:00Z" }),
  ], {
    routePlan: { deliveryDate: "2026-08-06" },
  });

  assert.deepEqual(candidates.map((order) => order.orderId), ["order-1001", "order-1002"]);
  assert.equal(candidates[0].orderDate, "2026-08-01");
  assert.equal(candidates[1].deliveryDate, "2026-08-13");
});

test("route add-order candidates support all, specific, and inclusive range date filters", () => {
  const candidates = buildRouteAddOrderCandidates([
    candidate(),
    candidate({ id: "gid://shopify/Order/1002", name: "#1002", orderedDate: "2026-08-04", orderId: "order-1002", deliveryDate: "2026-08-13" }),
    candidate({ id: "gid://shopify/Order/1003", name: "#1003", orderedDate: "2026-08-09", orderId: "order-1003", deliveryDate: "2026-08-20" }),
  ]);

  assert.deepEqual(
    filterRouteAddOrderCandidatesByDate(candidates, { field: "deliveryDate", mode: "all" }).map((order) => order.orderId),
    ["order-1001", "order-1002", "order-1003"],
  );
  assert.deepEqual(
    filterRouteAddOrderCandidatesByDate(candidates, { field: "deliveryDate", mode: "single", startDate: "2026-08-13" }).map((order) => order.orderId),
    ["order-1002"],
  );
  assert.deepEqual(
    filterRouteAddOrderCandidatesByDate(candidates, { field: "deliveryDate", mode: "range", startDate: "2026-08-06", endDate: "2026-08-13" }).map((order) => order.orderId),
    ["order-1001", "order-1002"],
  );
  assert.deepEqual(
    filterRouteAddOrderCandidatesByDate(candidates, { field: "orderDate", mode: "range", startDate: "2026-08-02", endDate: "2026-08-09" }).map((order) => order.orderId),
    ["order-1002", "order-1003"],
  );
});

test("route add-order date filters stay unfiltered until their required date is selected", () => {
  const candidates = buildRouteAddOrderCandidates([candidate()]);

  assert.deepEqual(filterRouteAddOrderCandidatesByDate(candidates, { mode: "single" }), candidates);
  assert.deepEqual(filterRouteAddOrderCandidatesByDate(candidates, { mode: "range" }), candidates);
});
