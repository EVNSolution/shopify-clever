import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAllRoutes } from "../app/features/delivery/all-routes-summary.js";

test("All routes summary excludes the pool from route totals but counts its stops", () => {
  const summary = summarizeAllRoutes([
    { stopsCount: 2, totalItems: 4, deliveredCount: 1, attemptedCount: 0, optimized: { metrics: { durationSeconds: 60, distanceMeters: 100 } } },
    { stopsCount: 0, totalItems: 0 },
    { isUnassigned: true, stopsCount: 1, totalItems: 2 },
  ]);
  assert.deepEqual(summary, { routes: 2, stops: 3, items: 6, allocatedStops: 2, allocatedItems: 4, delivered: 1, attempted: 0, durationSeconds: 60, distanceMeters: 100 });
});

test("Unknown metrics on a populated route do not produce a misleading partial total", () => {
  const summary = summarizeAllRoutes([
    { stopsCount: 2, totalItems: 3, optimized: { metrics: { durationSeconds: 60, distanceMeters: 100 } } },
    { stopsCount: 1, totalItems: 1 },
  ]);
  assert.equal(summary.durationSeconds, null);
  assert.equal(summary.distanceMeters, null);
  assert.equal(summary.allocatedStops, 3);
});
