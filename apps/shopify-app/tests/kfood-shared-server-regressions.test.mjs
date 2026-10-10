/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatRouteStatus, isTerminalRouteExecutionStatus, mergeRouteExecutionStatus } from "../app/features/delivery/route-helpers.js";
import { buildRouteRows } from "../app/features/delivery/route-list-rows.js";
import { translate } from "../app/i18n/i18n.js";
import { withEmbeddedShopifyContext } from "../app/features/delivery/route-paths.js";
import {
  confirmRouteListRefresh,
  getRouteListRefreshKey,
  readRouteListRefresh,
  rememberRouteListRefresh,
  routeListRefreshWasAttempted,
  ROUTE_LIST_REFRESH_PARAM,
} from "../app/features/delivery/route-list-refresh.js";
import {
  getRouteExecutionStatusFromTrackingEvent,
  getRouteExecutionStatusFromTrackingSnapshot,
  getRouteTrackingCompletionTime,
  getRouteTrackingLineFeatures,
  getRouteTrackingPathPoints,
  getRouteTrackingPresentation,
  getRouteTrackingServiceDate,
  mergeRouteTrackingSnapshot,
  mergeRouteTrackingProgress,
  normalizeRouteExecutionStatus,
  normalizeRouteTrackingSnapshot,
  selectRouteTrackingWindow,
  shouldRevalidateTrackingEta,
} from "../app/features/delivery/route-tracking.js";

test("K-food preserves and labels the server INCOMPLETE status", () => {
  for (const status of ["INCOMPLETE", "incomplete", " incomplete "]) {
    assert.equal(normalizeRouteExecutionStatus(status), "INCOMPLETE");
    assert.equal(formatRouteStatus(status), "Incomplete");
  }
  assert.equal(translate("en", "routes.status.incomplete"), "Incomplete");
  assert.equal(translate("ko", "routes.status.incomplete"), "미완료");
});

test("K-food incomplete tracking retains real driver evidence and displays incomplete without completing it", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    ...inferredSnapshot(),
    progress: { currentStage: "AT_STOP", completedStopIds: ["delivered-stop"], failedStopIds: ["failed-stop"] },
  });
  const before = structuredClone(snapshot);
  assert.deepEqual(getRouteTrackingPresentation("INCOMPLETE", snapshot), {
    connectionLabel: "closed",
    driverStage: "INCOMPLETE",
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
  assert.match(source, /mergeRouteExecutionStatus\(current.status, loaderRouteExecutionStatus\)/);
  assert.match(source, /activeTrackingRoutePlanIdRef.current !== trackingRoutePlanId[\s\S]*?!isRouteTrackingPayloadForRoute\(snapshot, trackingRoutePlanId\)\) return;/);
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
    // Rejected coverage is accepted as authoritative; the path is then drawn as one plain connector.
    const features = getRouteTrackingLineFeatures(merged);
    assert.deepEqual(features.map((feature) => [feature.properties.trackingType, feature.properties.trackingSource]), [
      ["trackingConnector", "raw"],
    ]);
    assert.deepEqual(features[0].geometry.coordinates, merged.recordedPath.geometry.coordinates);
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

for (const terminal of ["COMPLETED", "INCOMPLETE", "CANCELLED"]) {
  test(`terminal ${terminal} resists delayed and duplicate lifecycle events`, () => {
    for (const eventType of ["ROUTE_PAUSED", "ROUTE_STARTED", "ROUTE_COMPLETED"]) {
      assert.equal(getRouteExecutionStatusFromTrackingEvent(terminal, { eventType }), terminal);
    }
    const snapshot = { routePlanId: "fixture", operationalState: { routePlanId: "fixture", routeStatus: terminal } };
    assert.equal(getRouteExecutionStatusFromTrackingSnapshot("IN_PROGRESS", snapshot, "fixture"), terminal);
    assert.equal(getRouteExecutionStatusFromTrackingSnapshot(terminal, {
      ...snapshot, operationalState: { routePlanId: "fixture", routeStatus: "READY" },
    }, "fixture"), terminal);
  });
}


test("partial delivery never invents completion for incomplete or ready routes", () => {
  const stops = Array.from({ length: 11 }, (_, index) => ({
    id: `synthetic-stop-${index}`, status: index < 10 ? "DELIVERED" : "ARRIVED",
  }));
  const plans = [
    { id: "synthetic-incomplete", status: "INCOMPLETE", stopsCount: 11, stops, deliveredCount: 10 },
    { id: "synthetic-ready", status: "READY", stopsCount: 3 },
    { id: "synthetic-unknown", stopsCount: 3 },
  ];
  const group = { id: "synthetic-group", status: "READY", displayStatus: "IN_PROGRESS", children: [
    { routePlanId: plans[0].id, routePlan: plans[0], displayStatus: "INCOMPLETE" },
    { routePlanId: plans[1].id, routePlan: plans[1], displayStatus: "READY" },
  ] };
  const before = structuredClone({ plans, group });
  const rows = buildRouteRows(plans, [group]);
  assert.equal(formatRouteStatus(rows.find(row => row.id === plans[0].id).status), "Incomplete");
  assert.equal(formatRouteStatus(rows.find(row => row.id === plans[1].id).status), "Ready");
  assert.equal(formatRouteStatus(rows.find(row => row.id === plans[2].id).status), "Unknown");
  assert.equal(formatRouteStatus(buildRouteRows([plans[0]])[0].status), "Incomplete");
  assert.deepEqual({ plans, group }, before);
  const snapshot = normalizeRouteTrackingSnapshot({
    routePlanId: plans[0].id,
    executionEvidence: { start: { eventId: "synthetic-start", occurredAt: "2026-10-03T13:05:00.000Z" } },
    progress: { currentStage: "AT_STOP", completedStopIds: stops.slice(0, 10).map(stop => stop.id) },
  });
  assert.equal(snapshot.progress.completedStopIds.length, 10);
  assert.equal(getRouteTrackingCompletionTime(snapshot), null);
  assert.equal(getRouteTrackingPresentation(plans[0].status, snapshot).driverStage, "INCOMPLETE");
});

test("admin completion remains authoritative while raw return navigation is in progress", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    routePlanId: "synthetic-return",
    operationalState: { routePlanId: "synthetic-return", routeStatus: "COMPLETED", rawStatus: "IN_PROGRESS" },
    executionEvidence: { routeEndMode: "RETURN_TO_DEPOT", returnToDepot: { status: "UNAVAILABLE" } },
  });
  assert.equal(getRouteExecutionStatusFromTrackingSnapshot("IN_PROGRESS", snapshot, snapshot.routePlanId), "COMPLETED");
  assert.equal(getRouteTrackingPresentation("COMPLETED", snapshot).driverStage, "COMPLETED");
  assert.equal(getRouteExecutionStatusFromTrackingEvent("COMPLETED", { eventType: "ROUTE_STARTED" }), "COMPLETED");
});

test("old or duplicate progress does not change status or request ETA again", () => {
  const latestEvent = { eventId: "synthetic-latest", eventType: "ROUTE_STARTED", occurredAt: "2026-10-03T13:05:00.000Z" };
  const snapshot = normalizeRouteTrackingSnapshot({ routePlanId: "synthetic-race", progress: { latestEvent } });
  const oldEvent = { eventId: "synthetic-old", eventType: "ROUTE_PAUSED", occurredAt: "2026-10-03T13:00:00.000Z" };
  assert.equal(getRouteExecutionStatusFromTrackingEvent("IN_PROGRESS", oldEvent, snapshot), "IN_PROGRESS");
  assert.equal(shouldRevalidateTrackingEta({ ...oldEvent, eventType: "ROUTE_STARTED" }, false, snapshot), false);
  assert.equal(shouldRevalidateTrackingEta(latestEvent, false, snapshot), false);
  assert.equal(shouldRevalidateTrackingEta({ eventType: "ROUTE_STARTED" }, false, null, "INCOMPLETE"), false);
  const completeAtSameTime = { ...latestEvent, eventId: "synthetic-complete", eventType: "ROUTE_COMPLETED" };
  assert.equal(getRouteExecutionStatusFromTrackingEvent("IN_PROGRESS", completeAtSameTime, snapshot), "COMPLETED");
});

test("stale operational snapshots cannot erase terminal status", () => {
  const current = normalizeRouteTrackingSnapshot({
    routePlanId: "synthetic-race",
    operationalState: { routePlanId: "synthetic-race", routeStatus: "INCOMPLETE" },
  });
  const late = { routePlanId: current.routePlanId, operationalState: { routePlanId: current.routePlanId, routeStatus: "READY" } };
  assert.equal(mergeRouteTrackingSnapshot(current, late).operationalState.routeStatus, "INCOMPLETE");
});

test("Routes filters keep incomplete separate from ready and completed rows", () => {
  const source = readFileSync(new URL("../app/routes/app.routes.jsx", import.meta.url), "utf8");
  const start = source.indexOf("function normalizeRouteStatus(");
  const end = source.indexOf("function getStatusBadgeStyle(", start);
  assert.ok(start >= 0 && end > start);
  const filterRows = Function("formatRouteStatus", `${source.slice(start, end)}; return filterRouteRows;`)(formatRouteStatus);
  const rows = ["READY", "DRAFT", "IN_PROGRESS", "INCOMPLETE", "COMPLETED", "CANCELLED", "AWAITING_DRIVER", null]
    .map((status, index) => ({ id: `synthetic-${index}`, isClickable: true, status }));
  assert.deepEqual(filterRows(rows, { status: "INCOMPLETE" }).map(row => row.status), ["INCOMPLETE"]);
  assert.deepEqual(filterRows(rows, { status: "Ready" }).map(row => row.status), ["READY", "DRAFT"]);
  assert.deepEqual(filterRows(rows, { status: "Completed" }).map(row => row.status), ["COMPLETED"]);
  assert.deepEqual(filterRows(rows, { status: "UNKNOWN" }).map(row => row.status), ["AWAITING_DRIVER", null]);
});

test("missing child display status does not inherit its group aggregate", () => {
  const source = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  const expression = source.match(/const loaderRouteExecutionStatus = ([^;]+);/)?.[1];
  assert.ok(expression);
  const displayStatus = Function("normalizeRouteExecutionStatus", "effectiveRoutePlan", "routeGroup", `return ${expression};`);
  for (const status of ["READY", "IN_PROGRESS", "COMPLETED"]) {
    const group = { displayStatus: status };
    assert.equal(displayStatus(normalizeRouteExecutionStatus, { id: "synthetic-child", status: null }, group), "UNKNOWN");
    assert.equal(displayStatus(normalizeRouteExecutionStatus, { id: "synthetic-child", status: "INCOMPLETE" }, group), "INCOMPLETE");
    assert.equal(displayStatus(normalizeRouteExecutionStatus, null, group), status);
  }
});


test("the list component requests one mismatch refresh and retains an explicit retry after failure", () => {
  const source = readFileSync(new URL("../app/routes/app.routes.jsx", import.meta.url), "utf8");
  const start = source.indexOf("    if (!isRoutesIndex) {");
  const end = source.indexOf("  }, [isRoutesIndex, navigate, revalidator.state, routesRefresh, searchParams]);", start);
  assert.ok(start >= 0 && end > start);
  const applyEffect = Function("isRoutesIndex", "refreshAttemptRef", "routesRefresh", "setHasPendingListRefresh", "revalidator", "confirmRouteListRefresh", "readRouteListRefresh", "routeListRefreshWasAttempted", "searchParams", "navigate", "withEmbeddedShopifyContext", "ROUTE_LIST_REFRESH_PARAM", source.slice(start, end));
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const key = getRouteListRefreshKey("synthetic-app", "synthetic.myshopify.com");
  const attemptRef = { current: null };
  let reads = 0;
  let pendingVisible = false;
  let searchParams = new URLSearchParams("shop=synthetic.myshopify.com&embedded=1");
  const navigations = [];
  const navigate = (href, options) => {
    navigations.push({ href, options });
    searchParams = new URL(href, "https://synthetic-app.test").searchParams;
  };
  const revalidator = { state: "idle", revalidate: () => { reads += 1; } };
  let routesRefresh = { key, requested: [], confirmed: [] };
  const confirm = (name, confirmed) => confirmRouteListRefresh(name, confirmed, storage);
  const read = name => readRouteListRefresh(name, storage);
  const run = (isRoutesIndex = true) => applyEffect(isRoutesIndex, attemptRef, routesRefresh, value => { pendingVisible = value; }, revalidator, confirm, read, routeListRefreshWasAttempted, searchParams, navigate, withEmbeddedShopifyContext, ROUTE_LIST_REFRESH_PARAM);
  run();
  assert.equal(navigations.length, 0, "unchanged navigation does not request a refresh");
  rememberRouteListRefresh(key, "synthetic-route", "INCOMPLETE", storage);
  run(false);
  assert.equal(navigations.length, 0, "nested details leave the marker pending");
  run();
  assert.equal(navigations.length, 1);
  assert.deepEqual(navigations[0].options, { replace: true });
  assert.deepEqual(JSON.parse(searchParams.get(ROUTE_LIST_REFRESH_PARAM)), { key, pending: read(key) });
  assert.equal(pendingVisible, true);
  run();
  assert.equal(navigations.length, 1, "rerenders cannot start duplicate query requests");
  routesRefresh = { key, requested: read(key), confirmed: [] };
  run();
  run();
  assert.equal(navigations.length, 1, "an unsuccessful attempt cannot create an automatic retry loop");
  assert.equal(pendingVisible, true, "failure keeps the Retry control visible");
  assert.equal(searchParams.has(ROUTE_LIST_REFRESH_PARAM), true, "the failed query is retained for revalidation and reload");
  const retryHandler = source.match(/onClick=\{(\(\) => revalidator\.revalidate\(\))\} type="button"/);
  assert.ok(retryHandler, "the rendered Retry control uses the real revalidator");
  const retry = Function("revalidator", `return ${retryHandler[1]};`)(revalidator);
  retry();
  assert.equal(reads, 1, "the user can explicitly retry the failed query refresh");
  assert.match(source, /<button disabled=\{revalidator\.state !== "idle"\} onClick=\{\(\) => revalidator\.revalidate\(\)\}/);
  routesRefresh.confirmed = routesRefresh.requested;
  run();
  assert.equal(pendingVisible, false);
  assert.deepEqual(read(key), []);
  assert.equal(navigations.length, 2, "success removes only the refresh metadata with replace navigation");
  assert.equal(searchParams.has(ROUTE_LIST_REFRESH_PARAM), false);
  assert.equal(searchParams.get("shop"), "synthetic.myshopify.com");
  assert.equal(searchParams.get("embedded"), "1");
  run();
  assert.equal(navigations.length, 2, "successful confirmation ends the refresh flow");
});

test("batched terminal driver events update the production status ref before ETA decisions", () => {
  const source = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  const start = source.indexOf("const setRouteExecutionStatus = useCallback((update) => {");
  const end = source.indexOf("  const canEditRouteStopDetails", start);
  assert.ok(start >= 0 && end > start);
  const routeId = "synthetic-batched-route";
  const routeExecutionStatusRef = { current: "IN_PROGRESS" };
  const queued = [];
  const updateStatus = Function("useCallback", "activeTrackingRoutePlanIdRef", "routeExecutionScopeId", "routeExecutionStatusRef", "setRouteExecutionState", "mergeRouteExecutionStatus", `${source.slice(start, end)}; return setRouteExecutionStatus;`)(
    callback => callback, { current: routeId }, routeId, routeExecutionStatusRef, update => queued.push(update), mergeRouteExecutionStatus,
  );
  let snapshot = normalizeRouteTrackingSnapshot({ routePlanId: routeId, operationalState: { routePlanId: routeId, routeStatus: "IN_PROGRESS" } });
  const revalidations = [];
  for (const [index, eventType] of ["ROUTE_COMPLETED", "STOP_ARRIVED", "ROUTE_STARTED"].entries()) {
    const event = { routePlanId: routeId, eventType, eventId: `synthetic-event-${index}`, occurredAt: `2026-10-03T20:0${index}:00.000Z` };
    updateStatus(status => getRouteExecutionStatusFromTrackingEvent(status, event, snapshot));
    revalidations.push(shouldRevalidateTrackingEta(event, false, snapshot, routeExecutionStatusRef.current));
    snapshot = mergeRouteTrackingProgress(snapshot, event);
  }
  assert.deepEqual(revalidations, [false, false, false]);
  assert.equal(routeExecutionStatusRef.current, "COMPLETED");
  assert.equal(queued.reduce((state, update) => update(state), { routeId, status: "IN_PROGRESS" }).status, "COMPLETED");
});

test("detail mismatch markers survive unmount and another route until the list confirms current state", () => {
  const source = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  const start = source.indexOf("    if (!trackingRoutePlanId || !isTerminalRouteExecutionStatus(routeExecutionStatus)) return;");
  const end = source.indexOf("  }, [cachedRouteRows, routeExecutionStatus, routesListData, trackingRoutePlanId]);", start);
  assert.ok(start >= 0 && end > start);
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const key = getRouteListRefreshKey("synthetic-app", "synthetic.myshopify.com");
  const remember = (name, id, status) => rememberRouteListRefresh(name, id, status, storage);
  const observe = Function("trackingRoutePlanId", "isTerminalRouteExecutionStatus", "routeExecutionStatus", "cachedRouteRows", "routesListData", "normalizeRouteExecutionStatus", "rememberRouteListRefresh", source.slice(start, end));
  const data = { routesRefresh: { key }, routePlans: [{ id: "synthetic-a", status: "READY" }, { id: "synthetic-b", status: "READY" }] };
  const apply = (routeId, status) => observe(routeId, isTerminalRouteExecutionStatus, status, buildRouteRows(data.routePlans), data, normalizeRouteExecutionStatus, remember);
  apply("synthetic-a", "READY");
  assert.equal(values.size, 0);
  apply("synthetic-a", "INCOMPLETE");
  const marker = readRouteListRefresh(key, storage);
  assert.equal(marker[0].routeId, "synthetic-a");
  assert.equal(marker[0].status, "INCOMPLETE");
  assert.equal(typeof marker[0].version, "string");
  apply("synthetic-b", "READY");
  assert.deepEqual(readRouteListRefresh(key, storage), marker);
  data.routePlans[0].status = "INCOMPLETE";
  apply("synthetic-b", "READY");
  assert.deepEqual(readRouteListRefresh(key, storage), marker, "the detail effect cannot consume the pending marker");
  confirmRouteListRefresh(key, marker, storage);
  assert.deepEqual(readRouteListRefresh(key, storage), []);
  assert.doesNotMatch(source, /routesListNeedsRefreshRef|handleRoutesHistoryReturn/);
});
