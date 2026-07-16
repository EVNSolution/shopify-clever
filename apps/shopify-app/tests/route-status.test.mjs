/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import { formatRouteStatus } from "../app/features/delivery/route-helpers.js";

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
