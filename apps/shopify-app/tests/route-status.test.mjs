/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import { countRouteStopsByStatus, formatRouteStatus, getRouteStopStatus } from "../app/features/delivery/route-helpers.js";

test("route status labels collapse legacy lifecycle values into canonical admin states", () => {
  for (const status of [null, "DRAFT", "PUBLISHED", "OPTIMIZED", "ASSIGNED", "UNAVAILABLE", "UNSTARTED", "READY", "CHANGED"]) {
    assert.equal(formatRouteStatus(status), "Ready");
  }

  assert.equal(formatRouteStatus("IN_PROGRESS"), "In progress");
  assert.equal(formatRouteStatus("in progress"), "In progress");
  assert.equal(formatRouteStatus("COMPLETED"), "Completed");
  assert.equal(formatRouteStatus("CANCELLED"), "Cancelled");
});

test("route status labels keep unexpected backend values inside canonical presentation", () => {
  assert.equal(formatRouteStatus("AWAITING_DRIVER"), "Ready");
});

test("stop outcome reads delivery status before route assignment or Shopify fulfillment", () => {
  assert.equal(getRouteStopStatus({ status: "ASSIGNED", deliveryStopStatus: "DELIVERED", fulfillmentStatus: "UNFULFILLED" }), "DELIVERED");
  assert.equal(getRouteStopStatus({ status: "DELIVERED", deliveryStopStatus: "FAILED" }), "FAILED");
  assert.equal(getRouteStopStatus({ status: "READY", deliveryStatus: "COMPLETED" }), "COMPLETED");
  assert.equal(getRouteStopStatus({ status: "READY", fulfillmentStatus: "FULFILLED" }), "READY");
});

test("Delivered count follows stop outcomes without treating a completed route as fully delivered", () => {
  const stops = [
    { status: "ASSIGNED", deliveryStopStatus: "DELIVERED" },
    { status: "ASSIGNED", deliveryStopStatus: "FAILED" },
    { status: "ASSIGNED", deliveryStatus: "COMPLETED" },
    { status: "DELIVERED", deliveryStopStatus: "READY" },
  ];

  assert.equal(countRouteStopsByStatus(stops, ["COMPLETE", "COMPLETED", "DELIVERED", "FULFILLED"]), 2);
  assert.equal(countRouteStopsByStatus(stops, ["ATTEMPTED", "FAILED", "NEEDS_REVIEW"]), 1);
});
