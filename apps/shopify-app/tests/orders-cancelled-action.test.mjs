import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { mapCanonicalOrdersToOrderRows, mergeShopifyOrderRowsWithCanonicalRows } from "../app/features/orders/canonical-orders.js";
import { isOrderCancelled } from "../app/features/orders/order-filters.js";

const source = readFileSync(new URL("../app/features/orders/orders-page.server.js", import.meta.url), "utf8");
const start = source.indexOf("async function resolvePlannedOrdersForAction(");
const end = source.indexOf("\nexport const loader", start);
assert.ok(start >= 0 && end > start);

async function resolveOrders(orders, plannedOrderIds) {
  const resolve = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
    Map, Set, Promise,
    fetchShopifyAppPreferences: async () => ({ appPreferences: { deliveryCycle: {} }, errors: [] }),
    shouldUseCanonicalFirstOrders: () => true,
    shouldFetchShopifyOrders: () => false,
    fetchDeliveryOrders: async () => ({ orders, errors: [] }),
    getDeliveryOnlyDepartureLocationData: () => ({ departureLocation: null, errors: [] }),
    getOrderSyncSnapshots: () => [],
    getSafePerformanceNow: () => 0,
    roundPerfDuration: (value) => value,
    textOrUndefined: (value) => typeof value === "string" && value.trim() ? value.trim() : undefined,
    isOrderCancelled,
    mapCanonicalOrdersToOrderRows,
    mergeShopifyOrderRowsWithCanonicalRows,
  });
  return resolve({
    admin: {}, request: new Request("https://app.test/app/orders"),
    shopifySessionToken: "test-token", shopifyShopCacheKey: "test-shop",
    plannedOrderIds, reason: "createRoutePlan", timings: {},
  });
}

const ready = { orderId: "delivery-ready", shopifyOrderGid: "gid://shopify/Order/1", name: "#ready", readiness: "READY_TO_PLAN" };
const cancelled = {
  orderId: "delivery-cancelled", shopifyOrderGid: "gid://shopify/Order/2", name: "#cancelled",
  cancelledAt: "2026-09-03T16:36:30Z", financialStatus: "VOIDED", fulfillmentStatus: "UNFULFILLED",
  readiness: "NEEDS_REVIEW", reviewReasons: ["cancelled_order"],
};

test("canonical cancellation rejects the whole requested batch instead of silently creating fewer stops", async () => {
  const result = await resolveOrders([ready, cancelled], [ready.shopifyOrderGid, cancelled.shopifyOrderGid]);
  assert.equal(result.errors?.[0]?.code, "CANCELLED_ORDER_NOT_PLANNABLE");
  assert.equal(result.plannedOrders, undefined);
});

test("an unselected cancelled row stays visible without blocking an otherwise valid batch", async () => {
  const result = await resolveOrders([ready, cancelled], [ready.shopifyOrderGid]);
  assert.equal(result.errors, undefined);
  assert.deepEqual(Array.from(result.plannedOrders, (order) => order.orderId), [ready.orderId]);
});

test("sparse canonical cancellation facts also block an old selection", async () => {
  const sparse = { ...cancelled, cancelledAt: undefined, financialStatus: undefined };
  const result = await resolveOrders([sparse], [sparse.shopifyOrderGid]);
  assert.equal(result.errors?.[0]?.code, "CANCELLED_ORDER_NOT_PLANNABLE");
});
