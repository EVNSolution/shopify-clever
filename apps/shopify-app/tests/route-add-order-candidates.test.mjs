/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import { translate } from "../app/i18n/i18n.js";

import {
  buildRouteAddOrderCandidates,
  filterAndSortRouteAddOrderCandidates,
  filterRouteAddOrderCandidatesByDate,
  updateRouteAddOrderSelection,
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

test("route add-order search accepts number variants, whitespace, and partial prefixed names", () => {
  const candidates = buildRouteAddOrderCandidates([
    candidate({ name: "KFOOD-1496-CA", orderId: "opaque-a" }),
    candidate({ name: "#1495", orderId: "opaque-b" }),
    candidate({ name: "Special-order", orderId: "opaque-c" }),
  ]);

  assert.deepEqual(filterAndSortRouteAddOrderCandidates(candidates, { query: " 1496 " }).map((order) => order.orderId), ["opaque-a"]);
  assert.deepEqual(filterAndSortRouteAddOrderCandidates(candidates, { query: "#1495" }).map((order) => order.orderId), ["opaque-b"]);
  assert.deepEqual(filterAndSortRouteAddOrderCandidates(candidates, { query: "food-14" }).map((order) => order.orderId), ["opaque-a"]);
  assert.deepEqual(filterAndSortRouteAddOrderCandidates(candidates, { query: "opaque-a" }), []);
  assert.deepEqual(filterAndSortRouteAddOrderCandidates(candidates, { query: "missing" }), []);
});

test("route add-order candidates use stable natural descending display-name order", () => {
  const candidates = buildRouteAddOrderCandidates([
    candidate({ name: "#9", orderId: "order-9" }),
    candidate({ name: "#100", orderId: "order-100" }),
    candidate({ name: "#99", orderId: "order-99" }),
    candidate({ name: "KFOOD-100", orderId: "prefixed-first" }),
    candidate({ name: "KFOOD-100", orderId: "prefixed-second" }),
  ]);

  assert.deepEqual(
    filterAndSortRouteAddOrderCandidates(candidates).map((order) => order.orderId),
    ["prefixed-first", "prefixed-second", "order-100", "order-99", "order-9"],
  );
});

test("route add-order query intersects date filters and empty query restores all eligible orders", () => {
  const candidates = buildRouteAddOrderCandidates([
    candidate({ name: "#1496", orderId: "matching-date", deliveryDate: "2026-08-06" }),
    candidate({ name: "#14960", orderId: "other-date", deliveryDate: "2026-08-13" }),
    candidate({ name: "#1497", orderId: "other-number", deliveryDate: "2026-08-06" }),
  ]);

  assert.deepEqual(
    filterAndSortRouteAddOrderCandidates(candidates, {
      field: "deliveryDate",
      mode: "single",
      query: "1496",
      startDate: "2026-08-06",
    }).map((order) => order.orderId),
    ["matching-date"],
  );
  assert.deepEqual(filterAndSortRouteAddOrderCandidates(candidates, { query: "   " }).map((order) => order.orderId), [
    "other-date",
    "other-number",
    "matching-date",
  ]);
});

test("visible-only Select all retains selections outside the current filters", () => {
  const visible = [{ orderId: "visible-1" }, { orderId: "visible-2" }];

  assert.deepEqual(updateRouteAddOrderSelection(["hidden-1"], visible, true), ["hidden-1", "visible-1", "visible-2"]);
  assert.deepEqual(
    updateRouteAddOrderSelection(["hidden-1", "visible-1", "visible-2"], visible, false),
    ["hidden-1"],
  );
});

test("route add-order search labels and empty states are localized", () => {
  assert.equal(translate("en", "routes.addOrder.search.label"), "Order number");
  assert.equal(translate("ko", "routes.addOrder.search.label"), "주문번호");
  assert.match(translate("en", "routes.addOrder.search.placeholder"), /#1496/);
  assert.match(translate("ko", "routes.addOrder.search.placeholder"), /1496/);
  assert.match(translate("en", "routes.addOrder.search.empty"), /No eligible orders/);
  assert.match(translate("ko", "routes.addOrder.search.empty"), /추가 가능한 주문/);
});
