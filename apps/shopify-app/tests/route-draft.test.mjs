/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import { readRouteDraftPayload, reverseRouteStopIds } from "../app/features/delivery/route-draft.js";

test("reverse route stops returns a reversed copy without changing the source", () => {
  const stopIds = ["order-1", "order-2", "order-3"];

  assert.deepEqual(reverseRouteStopIds(stopIds), ["order-3", "order-2", "order-1"]);
  assert.deepEqual(stopIds, ["order-1", "order-2", "order-3"]);
});

test("route draft adapter preserves the complete atomic save contract", () => {
  const draft = readRouteDraftPayload(JSON.stringify({
    deletedRoutePlanIds: ["route-delete"],
    expectedUpdatedAt: "2026-07-20T01:02:03.000Z",
    mode: "OPTIMIZE_ORDER",
    removedOrderIds: ["order-remove"],
    routes: [{
      branchId: null,
      color: "#0b84d8",
      driverId: null,
      expectedChildUpdatedAt: "2026-07-20T01:02:01.000Z",
      expectedRoutePlanUpdatedAt: "2026-07-20T01:02:02.000Z",
      label: "#1",
      optimized: { metrics: { durationSeconds: 60 } },
      orderIds: ["order-1"],
      routeIdx: 1,
      routeKey: "routePlan:route-1",
      routePlanId: "route-1",
      scheduledStartAt: "2026-07-20T03:00:00.000Z",
      scheduledStartTimeZone: "Asia/Seoul",
      sortOrder: 1,
      tempId: null,
    }],
  }));

  assert.deepEqual(draft, {
    deletedRoutePlanIds: ["route-delete"],
    expectedUpdatedAt: "2026-07-20T01:02:03.000Z",
    mode: "OPTIMIZE_ORDER",
    removedOrderIds: ["order-remove"],
    routes: [{
      branchId: null,
      color: "#0b84d8",
      driverId: null,
      expectedChildUpdatedAt: "2026-07-20T01:02:01.000Z",
      expectedRoutePlanUpdatedAt: "2026-07-20T01:02:02.000Z",
      label: "#1",
      optimized: { metrics: { durationSeconds: 60 } },
      orderIds: ["order-1"],
      routeIdx: 1,
      routeKey: "routePlan:route-1",
      routePlanId: "route-1",
      scheduledStartAt: "2026-07-20T03:00:00.000Z",
      scheduledStartTimeZone: "Asia/Seoul",
      sortOrder: 1,
      tempId: null,
    }],
  });
});

test("route draft adapter keeps explicit clear values and rejects malformed JSON", () => {
  assert.deepEqual(readRouteDraftPayload("not-json"), { routes: [] });
  assert.deepEqual(readRouteDraftPayload(JSON.stringify({ routes: [{
    driverId: null,
    orderIds: [],
    scheduledStartAt: null,
    scheduledStartTimeZone: null,
  }] })), {
    deletedRoutePlanIds: [],
    mode: undefined,
    removedOrderIds: [],
    routes: [{
      branchId: null,
      color: null,
      driverId: null,
      label: null,
      orderIds: [],
      routePlanId: null,
      scheduledStartAt: null,
      scheduledStartTimeZone: null,
      tempId: null,
    }],
  });
});

test("route draft adapter preserves manual-order save intent", () => {
  const draft = readRouteDraftPayload(JSON.stringify({
    mode: "MANUAL_ORDER",
    routes: [{
      orderIds: ["order-2", "order-1"],
      routePlanId: "route-1",
    }],
  }));

  assert.equal(draft.mode, "MANUAL_ORDER");
  assert.deepEqual(draft.routes[0]?.orderIds, ["order-2", "order-1"]);
});
