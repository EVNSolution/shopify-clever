/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import { formatRouteStatus } from "../app/features/delivery/route-helpers.js";

test("route status labels collapse legacy lifecycle values into the three canonical states", () => {
  for (const status of [null, "DRAFT", "UNAVAILABLE", "UNSTARTED", "READY", "CHANGED", "OPTIMIZED"]) {
    assert.equal(formatRouteStatus(status), "Draft");
  }

  for (const status of ["PUBLISHED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"]) {
    assert.equal(formatRouteStatus(status), "Published");
  }

  assert.equal(formatRouteStatus("CANCELLED"), "Cancelled");
});

test("route status labels humanize an unexpected value instead of exposing raw enum text", () => {
  assert.equal(formatRouteStatus("AWAITING_DRIVER"), "Awaiting Driver");
});
