/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatRouteStatus } from "../app/features/delivery/route-helpers.js";
import { buildRouteRows } from "../app/features/delivery/route-list-rows.js";
import { translate } from "../app/i18n/i18n.js";
import {
  getRouteExecutionStatusFromTrackingEvent,
  getRouteExecutionStatusFromTrackingSnapshot,
  getRouteTrackingCompletionTime,
  getRouteTrackingLineFeatures,
  getRouteTrackingPathPoints,
  getRouteTrackingPresentation,
  getRouteTrackingServiceDate,
  mergeRouteTrackingSnapshot,
  normalizeRouteExecutionStatus,
  normalizeRouteTrackingSnapshot,
  selectRouteTrackingWindow,
} from "../app/features/delivery/route-tracking.js";

test("K-food preserves and labels the server INCOMPLETE status", () => {
  for (const status of ["INCOMPLETE", "incomplete", " incomplete "]) {
    assert.equal(normalizeRouteExecutionStatus(status), "INCOMPLETE");
    assert.equal(formatRouteStatus(status), "Incomplete");
  }
  assert.equal(translate("en", "routes.status.incomplete"), "Incomplete");
  assert.equal(translate("ko", "routes.status.incomplete"), "미완료");
});

test("K-food incomplete tracking retains history and the last real driver stage without completing it", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    ...inferredSnapshot(),
    progress: { currentStage: "AT_STOP", completedStopIds: ["delivered-stop"], failedStopIds: ["failed-stop"] },
  });
  const before = structuredClone(snapshot);
  assert.deepEqual(getRouteTrackingPresentation("INCOMPLETE", snapshot), {
    connectionLabel: "closed",
    driverStage: "AT_STOP",
    mode: "history",
    trackingLabel: "Incomplete",
  });
  assert.equal(getRouteTrackingPresentation("INCOMPLETE", null).mode, "history");
  assert.equal(getRouteTrackingCompletionTime(snapshot), null);
  assert.deepEqual(snapshot, before);
  assert.equal(getRouteTrackingLineFeatures(snapshot)[0].properties.trackingSource, "inferred");
});

test("K-food buffered lifecycle events cannot reopen or complete a server-finalized incomplete route", () => {
  for (const eventType of ["ROUTE_STARTED", "ROUTE_PAUSED", "ROUTE_COMPLETED", "STOP_DELIVERED"]) {
    assert.equal(getRouteExecutionStatusFromTrackingEvent("INCOMPLETE", { eventType }), "INCOMPLETE");
  }
});

test("K-food open tracking accepts only same-route authoritative incomplete snapshots and keeps them terminal", () => {
  const current = inferredSnapshot();
  const snapshot = normalizeRouteTrackingSnapshot({
    ...current,
    operationalState: { routePlanId: current.routePlanId, routeStatus: "INCOMPLETE" },
  });
  assert.equal(getRouteExecutionStatusFromTrackingSnapshot("IN_PROGRESS", snapshot, current.routePlanId), "INCOMPLETE");
  assert.equal(getRouteExecutionStatusFromTrackingSnapshot("IN_PROGRESS", snapshot, "another-route"), "IN_PROGRESS");
  assert.equal(getRouteExecutionStatusFromTrackingSnapshot("IN_PROGRESS", {
    ...snapshot, operationalState: { routePlanId: "another-route", routeStatus: "INCOMPLETE" },
  }, current.routePlanId), "IN_PROGRESS");
  assert.equal(getRouteExecutionStatusFromTrackingSnapshot("INCOMPLETE", {
    ...snapshot, operationalState: { routePlanId: current.routePlanId, routeStatus: "IN_PROGRESS" },
  }, current.routePlanId), "INCOMPLETE");
  assert.equal(getRouteExecutionStatusFromTrackingSnapshot("IN_PROGRESS", current, current.routePlanId), "IN_PROGRESS");
  const merged = mergeRouteTrackingSnapshot(current, snapshot);
  assert.deepEqual(merged.roadMatchedPath, current.roadMatchedPath);
  assert.equal(getRouteTrackingCompletionTime(merged), null);
  const source = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  assert.match(source, /getRouteExecutionStatusFromTrackingSnapshot\(currentStatus, snapshot, trackingRoutePlanId\)/);
  assert.match(source, /getRouteExecutionStatusFromTrackingSnapshot\(currentStatus, snapshot, trackingStreamRoutePlanId\)/);
  assert.match(source, /setRouteExecutionStatus\(loaderRouteExecutionStatus\);\s*\}, \[effectiveRoutePlan\?\.id, loaderRouteExecutionStatus\]\)/);
  assert.match(source, /if \(isDisposed \|\| controller\.signal\.aborted \|\| !isRouteTrackingPayloadForRoute\(snapshot, trackingRoutePlanId\)\) return;/);
});

test("K-food incomplete routes cannot dispatch or subscribe as ready routes", () => {
  const source = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  const dispatch = source.match(/const canDispatchRoute = (Boolean\([\s\S]*?\n {2}\));/);
  assert.ok(dispatch);
  const canDispatch = Function("effectiveRoutePlan", "routeDriverId", "routeExecutionStatus", `return ${dispatch[1]};`);
  assert.equal(canDispatch({ id: "fixture" }, "driver-fixture", normalizeRouteExecutionStatus("INCOMPLETE")), false);
  assert.equal(canDispatch({ id: "fixture" }, "driver-fixture", "READY"), true);
  const stream = source.match(/const trackingStreamRoutePlanId = ([\s\S]*?);/);
  assert.ok(stream);
  const streamId = Function("routeExecutionStatus", "trackingRoutePlanId", `return ${stream[1]};`);
  assert.equal(streamId(normalizeRouteExecutionStatus("INCOMPLETE"), "fixture"), null);
  assert.equal(streamId("IN_PROGRESS", "fixture"), "fixture");
});

test("K-food historical tracking uses absolute positions even with all recorded dates selected", () => {
  const source = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  assert.match(source, /showAllRouteTrackingRecords && routeTrackingPresentation\.mode === "live"\s*\? `Current position/);
});

// Synthetic contract fixtures: no production route, driver, or customer data.
function snapshotAt(times) {
  const coordinates = times.map((_, index) => [-79.4 + index * 0.001, 43.7]);
  return normalizeRouteTrackingSnapshot({
    routePlanId: "kfood-fixture-route",
    executionEvidence: { start: { eventId: "started", occurredAt: times[0] } },
    recordedPath: {
      geometry: { type: "LineString", coordinates },
      samples: times.map((occurredAt, sourceIndex) => ({
        eventId: `position-${sourceIndex}`,
        occurredAt,
        receivedAt: new Date(Date.parse(occurredAt) + 120_000).toISOString(),
        sourceIndex,
      })),
      sourcePointCount: times.length,
    },
  });
}

for (const { label, serviceDate, times } of [
  {
    label: "spring-forward",
    serviceDate: "2026-03-07",
    times: ["2026-03-08T04:59:00.000Z", "2026-03-09T03:59:59.999Z", "2026-03-09T04:00:00.000Z"],
  },
  {
    label: "fall-back",
    serviceDate: "2026-10-31",
    times: ["2026-11-01T03:59:00.000Z", "2026-11-02T04:59:59.999Z", "2026-11-02T05:00:00.000Z"],
  },
  {
    label: "year-end",
    serviceDate: "2026-12-31",
    times: ["2027-01-01T04:59:00.000Z", "2027-01-02T04:59:59.999Z", "2027-01-02T05:00:00.000Z"],
  },
]) {
  test(`K-food actual-start window uses Toronto calendar days at ${label}`, () => {
    const snapshot = snapshotAt(times);
    const before = structuredClone(snapshot);
    const date = getRouteTrackingServiceDate(snapshot, "2026-01-01", "America/Toronto");
    assert.equal(date, serviceDate);

    const selected = selectRouteTrackingWindow(snapshot, {
      date,
      includeNextDay: true,
      timeZone: "America/Toronto",
    });
    assert.deepEqual(getRouteTrackingPathPoints(selected).map((point) => point.eventId), ["position-0", "position-1"]);
    assert.equal(selected.latestPosition.eventId, "position-1");
    assert.equal(selected.latestPosition.occurredAt, times[1]);
    assert.deepEqual(snapshot, before);
    assert.equal(selectRouteTrackingWindow(snapshot, { allRecords: true }), snapshot);
  });
}

function inferredSnapshot() {
  const snapshot = snapshotAt(["2026-09-18T03:59:00.000Z", "2026-09-18T04:01:00.000Z"]);
  return normalizeRouteTrackingSnapshot({
    ...snapshot,
    roadMatchedPath: {
      schemaVersion: "route_tracking_road_match.v1",
      qualityVersion: "gps_quality.v4",
      inputPointCount: 2,
      lastInputOccurredAt: "2026-09-18T04:01:00.000Z",
      watermark: "synthetic-watermark-1",
      inferredGeometry: { type: "MultiLineString", coordinates: [snapshot.recordedPath.geometry.coordinates] },
      inferredRanges: [{
        startEventId: "position-0",
        endEventId: "position-1",
        startOccurredAt: "2026-09-18T03:59:00.000Z",
        endOccurredAt: "2026-09-18T04:01:00.000Z",
        startSourceIndex: 0,
        endSourceIndex: 1,
        interpolationLevel: 1,
        reason: "ROAD_GAP_INFERENCE",
      }],
    },
  });
}

test("K-food reconnect preserves recovered inference and actual start through window selection", () => {
  const current = inferredSnapshot();
  const before = structuredClone(current);
  const incoming = {
    routePlanId: current.routePlanId,
    roadMatchedPath: { ...current.roadMatchedPath, inferredGeometry: null, inferredRanges: [] },
  };
  const merged = mergeRouteTrackingSnapshot(current, incoming);
  const selected = selectRouteTrackingWindow(merged, {
    date: getRouteTrackingServiceDate(merged, "2026-09-16", "America/Toronto"),
    includeNextDay: true,
    timeZone: "America/Toronto",
  });
  const features = getRouteTrackingLineFeatures(selected);
  assert.equal(features.length, 1);
  assert.equal(features[0].properties.trackingSource, "inferred");
  assert.deepEqual(features[0].geometry.coordinates, current.roadMatchedPath.inferredGeometry.coordinates[0]);
  assert.deepEqual(current, before);
});

for (const [label, changes] of [
  ["newer input", { lastInputOccurredAt: "2026-09-18T04:02:00.000Z", inputPointCount: 3 }],
  ["new watermark", { watermark: "synthetic-watermark-2" }],
  ["different input count", { inputPointCount: 3 }],
]) {
  test(`K-food accepts authoritative rejected v4 coverage with ${label}`, () => {
    const current = inferredSnapshot();
    const roadMatchedPath = {
      ...current.roadMatchedPath,
      ...changes,
      inferredGeometry: null,
      inferredRanges: [],
      matchedGeometry: null,
      matchedPointCount: 0,
      uncertainGeometry: null,
      unmatchedRanges: [{
        ...current.roadMatchedPath.inferredRanges[0],
        interpolationLevel: 2,
        reason: "LOW_CONFIDENCE",
      }],
    };
    const merged = mergeRouteTrackingSnapshot(current, { ...current, roadMatchedPath });
    assert.equal(merged.roadMatchedPath.inferredGeometry, null);
    assert.equal(merged.roadMatchedPath.unmatchedRanges[0].interpolationLevel, 2);
    assert.deepEqual(getRouteTrackingLineFeatures(merged), []);
    assert.equal(getRouteTrackingPathPoints(merged).length, 2);
  });
}

test("K-food snapshot navigation never carries preserved geometry into another route", () => {
  const merged = mergeRouteTrackingSnapshot(inferredSnapshot(), {
    routePlanId: "another-synthetic-route",
    recentPositions: [],
    roadMatchedPath: null,
  });
  assert.equal(merged.routePlanId, "another-synthetic-route");
  assert.equal(merged.executionEvidence, null);
  assert.equal(merged.recordedPath, null);
  assert.deepEqual(getRouteTrackingLineFeatures(merged), []);
});

test("K-food Delivered totals count each grouped route once and honor explicit zero", () => {
  const routes = [
    {
      id: "completed-child",
      status: "COMPLETED",
      stopsCount: 3,
      stops: [
        { deliveryStopStatus: "DELIVERED", status: "ASSIGNED" },
        { deliveryStopStatus: "FAILED", status: "ASSIGNED" },
        { deliveryStopStatus: "READY", status: "DELIVERED" },
      ],
    },
    { id: "zero-child", status: "COMPLETED", stopsCount: 2, deliveredCount: 0 },
    { id: "ordinary", stopsCount: 4, deliveredCount: 2 },
  ];
  const groups = [{
    id: "synthetic-group",
    totalOrders: 999,
    deliveredCount: 999,
    children: routes.slice(0, 2).map((routePlan) => ({ routePlanId: routePlan.id, routePlan })),
  }];
  const rows = buildRouteRows(routes, groups);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((row) => row.id)).size, 3);
  assert.equal(rows.find((row) => row.id === "completed-child").delivered, 1);
  assert.equal(rows.find((row) => row.id === "zero-child").delivered, 0);
  assert.equal(rows.reduce((sum, row) => sum + row.delivered, 0), 3);
  assert.equal(rows.reduce((sum, row) => sum + row.orders, 0), 9);
});
