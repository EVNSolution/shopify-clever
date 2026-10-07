/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import { countRouteStopsByStatus, formatRouteStatus, getRouteStatusBadgeColors, getRouteStopStatus, mergeRouteExecutionStatus, normalizeRouteExecutionStatus } from "../app/features/delivery/route-helpers.js";

test("route status labels collapse legacy lifecycle values into canonical admin states", () => {
  for (const status of ["DRAFT", "PUBLISHED", "OPTIMIZED", "ASSIGNED", "UNSTARTED", "READY", "CHANGED"]) {
    assert.equal(formatRouteStatus(status), "Ready");
  }

  assert.equal(formatRouteStatus("IN_PROGRESS"), "In progress");
  assert.equal(formatRouteStatus("in progress"), "In progress");
  assert.equal(formatRouteStatus("COMPLETED"), "Completed");
  assert.equal(formatRouteStatus("CANCELLED"), "Cancelled");
});

test("route status labels keep unexpected backend values inside canonical presentation", () => {
  for (const status of ["AWAITING_DRIVER", "UNAVAILABLE", null, undefined, "", " "]) {
    assert.equal(formatRouteStatus(status), "Unknown");
  }
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


test("normalization and labels share canonical, legacy, and unknown meanings", () => {
  for (const [input, normalized, label] of [
    ["READY", "READY", "Ready"], ["in progress", "IN_PROGRESS", "In progress"],
    ["COMPLETED", "COMPLETED", "Completed"], ["INCOMPLETE", "INCOMPLETE", "Incomplete"],
    ["CANCELLED", "CANCELLED", "Cancelled"], ["PUBLISHED", "READY", "Ready"],
    ["AWAITING_DRIVER", "UNKNOWN", "Unknown"], [null, "UNKNOWN", "Unknown"],
  ]) {
    assert.equal(normalizeRouteExecutionStatus(input), normalized);
    assert.equal(formatRouteStatus(normalized), label);
  }
});

test("same-route loader reconciliation preserves terminal displays", () => {
  for (const terminal of ["COMPLETED", "INCOMPLETE", "CANCELLED"]) {
    assert.equal(mergeRouteExecutionStatus(terminal, "READY"), terminal);
    assert.equal(mergeRouteExecutionStatus(terminal, null), terminal);
    assert.equal(mergeRouteExecutionStatus("IN_PROGRESS", terminal), terminal);
  }
  assert.equal(mergeRouteExecutionStatus("READY", "IN_PROGRESS"), "IN_PROGRESS");
  assert.notDeepEqual(getRouteStatusBadgeColors("INCOMPLETE"), getRouteStatusBadgeColors("READY"));
  assert.notDeepEqual(getRouteStatusBadgeColors("INCOMPLETE"), getRouteStatusBadgeColors("COMPLETED"));
});
