import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as filters from "../app/features/orders/order-filters.js";
import { mapCanonicalOrdersToOrderRows } from "../app/features/orders/canonical-orders.js";

const expiredPickup = {
  serviceType: "PICKUP",
  deliveryDate: "2026-09-04",
  pickupCompleteAfter: "2026-09-05T04:00:00.000Z",
  deliveryStopStatus: "FAILED",
  routeMemberships: [{ status: "READY" }],
  fulfillmentStatus: "UNFULFILLED",
};

test("canonical mapping retains the pickup deadline without replacing driver or Shopify status", () => {
  const [row] = mapCanonicalOrdersToOrderRows([expiredPickup]);
  assert.equal(row.pickupCompleteAfter, expiredPickup.pickupCompleteAfter);
  assert.equal(row.deliveryStopStatus, "FAILED");
  assert.equal(row.status, "UNFULFILLED");
});

test("expired pickup is complete in Orders despite a failed or still-ready route", () => {
  assert.equal(filters.isOrderDeliveryComplete(expiredPickup), true);
  assert.equal(filters.getOrderDeliveryStateFilterValue(expiredPickup, "2026-09-07"), "delivered");
  assert.equal(filters.getOrderDeliveryExceptionState(expiredPickup, "2026-09-07"), "none");
  assert.equal(filters.isOrderInPlanningScope(expiredPickup, "2026-09-07"), false);
  assert.equal(expiredPickup.deliveryStopStatus, "FAILED");
});

test("pickup completion is inclusive at the absolute deadline and safe for missing, invalid or cancelled input", () => {
  const now = new Date("2026-09-04T21:00:00.000Z");
  const pickup = { ...expiredPickup, pickupCompleteAfter: now.toISOString() };
  assert.equal(filters.isOrderPickupComplete(pickup, new Date(now.getTime() - 1)), false);
  assert.equal(filters.isOrderPickupComplete(pickup, now), true);
  assert.equal(filters.isOrderPickupComplete({ ...pickup, cancelledAt: "2026-09-03T12:00:00Z" }, now), false);
  for (const pickupCompleteAfter of [undefined, null, "", "not-a-date"]) {
    assert.equal(filters.isOrderPickupComplete({ ...pickup, pickupCompleteAfter }, now), false);
  }
  for (const serviceType of ["DELIVERY", "EVENING_DELIVERY", undefined]) {
    assert.equal(filters.isOrderPickupComplete({ ...pickup, serviceType }, now), false);
  }
});

test("client state filters include expired pickup in completed but not past-due or unplanned", () => {
  const base = { scope: "history", tab: "all", referenceDate: "2026-09-07" };
  assert.equal(filters.filterOrders([expiredPickup], { ...base, deliveryState: "delivered" }).length, 1);
  for (const deliveryState of ["past_due", "unplanned", "assigned_undelivered"]) {
    assert.equal(filters.filterOrders([expiredPickup], { ...base, deliveryState }).length, 0);
  }
  assert.equal(filters.getOrderShopifyFulfillmentState(expiredPickup), "unfulfilled");
});

test("Orders renders Complete before route failure and does not replace delivery completion labels", () => {
  const source = readFileSync(new URL("../app/features/orders/orders-page.jsx", import.meta.url), "utf8");
  const declaration = source.match(/function formatOrderDeliveryState\(order, referenceDate\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(declaration);
  const format = vm.runInNewContext(`(${declaration})`, {
    isOrderPickupComplete: filters.isOrderPickupComplete,
    getOrderDeliveryStateFilterValue: filters.getOrderDeliveryStateFilterValue,
    normalizePaymentStatus: value => String(value ?? "").trim().toUpperCase(),
  });
  assert.equal(format(expiredPickup, "2026-09-07"), "Complete");
  assert.equal(format({ serviceType: "DELIVERY", deliveryStopStatus: "DELIVERED" }, "2026-09-07"), "Delivered");
  assert.equal(format({ serviceType: "DELIVERY", deliveryDate: "2026-09-04", deliveryStopStatus: "PENDING" }, "2026-09-07"), "Past due");
});
