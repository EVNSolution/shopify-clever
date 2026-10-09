/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildChildCompletionByStopId,
  buildChildRouteOrderRows,
  buildRouteEndpointPresentation,
  buildRouteOrderRows,
  formatChildEtaLabel,
} from "../app/features/delivery/child-route-detail-presentation.js";
import {
  mergeRouteTrackingProgress,
  mergeRouteTrackingSnapshot,
  normalizeRouteTrackingSnapshot,
  selectRouteTrackingWindow,
} from "../app/features/delivery/route-tracking.js";

const routeDetailSource = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");

const completion = (overrides = {}) => ({
  deliveryStopId: "stop-1",
  driverId: "driver-1",
  eventId: "completion-1",
  eventType: "STOP_DELIVERED",
  occurredAt: "2026-10-09T13:35:00.000Z",
  receivedAt: "2026-10-09T13:35:02.000Z",
  routePlanId: "route-1",
  schemaVersion: "route_tracking_completion.v1",
  stopSequence: 1,
  ...overrides,
});

test("the snapshot keeps valid stop completions in time order and drops the rest", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    routePlanId: "route-1",
    stopCompletions: [
      completion({ eventId: "later", occurredAt: "2026-10-09T14:00:00.000Z", stopSequence: 2 }),
      completion({ eventId: "earlier" }),
      completion({ eventId: "arrival-type", eventType: "STOP_ARRIVED" }),
      completion({ eventId: "no-driver", driverId: null }),
      completion({ eventId: "no-time", occurredAt: null }),
      completion({ eventId: "no-stop", deliveryStopId: "" }),
      completion({ eventId: "no-route", routePlanId: null }),
      null,
    ],
  });

  assert.deepEqual(snapshot.stopCompletions.map((entry) => entry.eventId), ["earlier", "later"]);
  assert.deepEqual(snapshot.stopCompletions[0], completion({ eventId: "earlier" }));
  assert.deepEqual(normalizeRouteTrackingSnapshot({ routePlanId: "route-1" }).stopCompletions, []);
  assert.equal(normalizeRouteTrackingSnapshot({ stopCompletions: [completion({ stopSequence: 0 })] }).stopCompletions[0].stopSequence, null);
});

test("a reconnect snapshot keeps a completion that arrived live and adds the server's", () => {
  const live = normalizeRouteTrackingSnapshot({ routePlanId: "route-1", stopCompletions: [completion({ eventId: "live" })] });
  const merged = mergeRouteTrackingSnapshot(live, {
    routePlanId: "route-1",
    stopCompletions: [completion({ eventId: "from-server", deliveryStopId: "stop-2", occurredAt: "2026-10-09T13:50:00.000Z", stopSequence: 2 })],
  });

  assert.deepEqual(merged.stopCompletions.map((entry) => entry.eventId), ["live", "from-server"]);
});

test("a live delivered or failed event adds a completion once and never from an incomplete event", () => {
  const base = normalizeRouteTrackingSnapshot({ routePlanId: "route-1" });
  const event = (overrides = {}) => ({
    deliveryStopId: "stop-1",
    driverId: "driver-1",
    eventId: "progress-1",
    eventType: "STOP_DELIVERED",
    occurredAt: "2026-10-09T13:35:00.000Z",
    receivedAt: "2026-10-09T13:35:02.000Z",
    routePlanId: "route-1",
    schemaVersion: "route_tracking.v1",
    ...overrides,
  });

  const delivered = mergeRouteTrackingProgress(base, event());
  assert.deepEqual(delivered.stopCompletions, [{
    deliveryStopId: "stop-1",
    driverId: "driver-1",
    eventId: "progress-1",
    eventType: "STOP_DELIVERED",
    occurredAt: "2026-10-09T13:35:00.000Z",
    receivedAt: "2026-10-09T13:35:02.000Z",
    routePlanId: "route-1",
    schemaVersion: "route_tracking_completion.v1",
    stopSequence: null,
  }]);
  assert.equal(mergeRouteTrackingProgress(delivered, event()).stopCompletions.length, 1, "the same event is not added twice");

  const failed = mergeRouteTrackingProgress(delivered, event({ eventId: "progress-2", eventType: "STOP_FAILED", occurredAt: "2026-10-09T13:40:00.000Z" }));
  assert.deepEqual(failed.stopCompletions.map((entry) => entry.eventType), ["STOP_DELIVERED", "STOP_FAILED"]);

  for (const incomplete of [{ driverId: null }, { deliveryStopId: null }, { eventId: null }]) {
    assert.deepEqual(mergeRouteTrackingProgress(base, event(incomplete)).stopCompletions, [], JSON.stringify(incomplete));
  }
  for (const eventType of ["STOP_ARRIVED", "ROUTE_STARTED"]) {
    assert.deepEqual(mergeRouteTrackingProgress(base, event({ eventType })).stopCompletions, [], eventType);
  }
});

test("the service-day window keeps only the completions of the selected days", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    routePlanId: "route-1",
    stopCompletions: [
      completion({ eventId: "day-one", occurredAt: "2026-10-09T13:35:00.000Z" }),
      completion({ eventId: "day-two", occurredAt: "2026-10-10T13:35:00.000Z" }),
    ],
  });

  const selected = selectRouteTrackingWindow(snapshot, { date: "2026-10-09", timeZone: "America/Toronto" });

  assert.deepEqual(selected.stopCompletions.map((entry) => entry.eventId), ["day-one"]);
});

test("the latest completion of a stop wins and invalid entries are ignored", () => {
  assert.deepEqual(buildChildCompletionByStopId([
    completion({ occurredAt: "2026-10-09T13:35:00.000Z" }),
    completion({ eventId: "later", eventType: "STOP_FAILED", occurredAt: "2026-10-09T13:50:00.000Z" }),
    completion({ deliveryStopId: "stop-2", occurredAt: "invalid" }),
    completion({ deliveryStopId: "stop-3", eventType: "STOP_ARRIVED" }),
    null,
  ]), {
    "stop-1": { at: "2026-10-09T13:50:00.000Z", eventType: "STOP_FAILED" },
  });
  assert.deepEqual(buildChildCompletionByStopId(undefined), {});
});

const rowStops = [
  { deliveryStopId: "s1", deliveryStopStatus: "DELIVERED", estimatedArrivalAt: "2026-10-09T13:34:00.000Z", sequence: 1 },
  { deliveryStopId: "s2", deliveryStopStatus: "DELIVERED", estimatedArrivalAt: "2026-10-09T13:35:00.000Z", sequence: 2 },
  { deliveryStopId: "s3", deliveryStopStatus: "FAILED", estimatedArrivalAt: "2026-10-09T14:22:00.000Z", sequence: 3 },
  { deliveryStopId: "s4", deliveryStopStatus: "DELIVERED", estimatedArrivalAt: "2026-10-09T14:25:00.000Z", sequence: 4 },
  { deliveryStopId: "s5", deliveryStopStatus: "PENDING", estimatedArrivalAt: "2026-10-09T14:54:00.000Z", sequence: 5 },
  { deliveryStopId: "s6", deliveryStopStatus: "DELIVERED", estimatedArrivalAt: "2026-10-09T15:30:00.000Z", sequence: 6 },
];
const rowOptions = {
  actualArrivalByStopId: { s2: "2026-10-09T13:36:00.000Z" },
  arrivalEvidenceLoaded: true,
  completionByStopId: {
    s1: { at: "2026-10-09T13:41:00.000Z", eventType: "STOP_DELIVERED" },
    s2: { at: "2026-10-09T13:45:00.000Z", eventType: "STOP_DELIVERED" },
    s3: { at: "2026-10-09T14:30:00.000Z", eventType: "STOP_FAILED" },
    s4: { at: "2026-10-09T14:31:00.000Z", eventType: "STOP_FAILED" },
    s5: { at: "2026-10-09T14:32:00.000Z", eventType: "STOP_DELIVERED" },
  },
  ianaTimezone: "America/Toronto",
};

test("a finished stop shows its arrival, else its completion time, named for what it is", () => {
  const rows = buildChildRouteOrderRows(rowStops, rowOptions);
  const [s1, s2, s3, s4, s5, s6] = rows;

  assert.equal(s1.actualArrival, formatChildEtaLabel("2026-10-09T13:41:00.000Z", "America/Toronto"));
  assert.deepEqual([s1.hasActualArrival, s1.actualKind, s1.actualLabel, s1.arrivalMissing], [true, "completion", "Delivered", false]);

  assert.equal(s2.actualArrival, formatChildEtaLabel("2026-10-09T13:36:00.000Z", "America/Toronto"));
  assert.deepEqual([s2.hasActualArrival, s2.actualKind, s2.actualLabel, s2.arrivalMissing], [true, "arrival", "Actual arrival", false], "an arrival wins over a completion");

  assert.equal(s3.actualArrival, formatChildEtaLabel("2026-10-09T14:30:00.000Z", "America/Toronto"));
  assert.deepEqual([s3.hasActualArrival, s3.actualKind, s3.actualLabel, s3.arrivalMissing], [true, "completion", "Failed", false]);

  // The completion no longer describes the stop (Delivered now, event says Failed): nothing to show.
  assert.deepEqual([s4.hasActualArrival, s4.actualKind, s4.arrivalMissing], [false, null, true]);
  // A stale completion of a stop that is not finished again is not shown and not flagged.
  assert.deepEqual([s5.hasActualArrival, s5.actualKind, s5.arrivalMissing], [false, null, false]);
  assert.deepEqual([s6.hasActualArrival, s6.actualKind, s6.arrivalMissing], [false, null, true]);
});

test("rows behave as before when the server sends no completions", () => {
  const { completionByStopId, ...withoutCompletions } = rowOptions;
  void completionByStopId;
  const rows = buildChildRouteOrderRows(rowStops, withoutCompletions);

  assert.deepEqual(rows.map((row) => row.hasActualArrival), [false, true, false, false, false, false]);
  assert.deepEqual(rows.map((row) => row.arrivalMissing), [true, false, true, true, false, true]);
  assert.deepEqual(rows.map((row) => row.actualKind), [null, "arrival", null, null, null, null]);
});

test("completions are used only for the route the tracking snapshot belongs to", () => {
  const routeRows = [{ id: "route-1", routePlanId: "plan-1", stops: rowStops }];
  const options = { ...rowOptions, actualArrivalRoutePlanId: "plan-1" };

  assert.equal(buildRouteOrderRows(routeRows, options)[0].actualKind, "completion");
  assert.equal(buildRouteOrderRows(routeRows, { ...options, actualArrivalRoutePlanId: "plan-2" })[0].actualKind, null);
});

const depot = [-79.4748, 43.7637];
const path = (points) => ({
  recordedPath: {
    firstOccurredAt: points[0][0],
    geometry: { type: "LineString", coordinates: points.map(([, longitude, latitude]) => [longitude, latitude]) },
    lastOccurredAt: points.at(-1)[0],
    lastReceivedAt: points.at(-1)[0],
    samples: points.map(([time], index) => ({ eventId: `event-${index}`, occurredAt: time, receivedAt: time })),
    schemaVersion: "route_tracking_geometry.v1",
    sourcePointCount: points.length,
  },
});
const trackingSnapshot = path([
  ["2026-10-08T13:00:00.000Z", -79.4748, 43.7637],
  ["2026-10-08T14:00:00.000Z", -79.4, 43.7],
  ["2026-10-08T16:30:00.000Z", -79.42, 43.72],
  ["2026-10-08T16:50:00.000Z", -79.4749, 43.7638],
]);
const endInput = (overrides = {}) => ({
  actualArrivalByStopId: {},
  completionByStopId: {
    s1: { at: "2026-10-08T14:05:00.000Z", eventType: "STOP_DELIVERED" },
    s2: { at: "2026-10-08T16:20:00.000Z", eventType: "STOP_DELIVERED" },
  },
  departureLocation: { address: "4475 Chesswood Dr", savedCoordinates: depot },
  executionEvidence: { returnToDepot: { status: "UNAVAILABLE", thresholdMeters: 150 }, routeEndMode: "RETURN_TO_DEPOT" },
  ianaTimezone: "America/Toronto",
  routeMetrics: { durationSeconds: 5_400 },
  routePlan: { routeEndMode: "RETURN_TO_DEPOT", scheduledStartAt: "2026-10-08T13:00:00.000Z" },
  stops: [
    { deliveryStopId: "s1", deliveryStopStatus: "DELIVERED", latitude: 43.7, longitude: -79.4, sequence: 1 },
    { deliveryStopId: "s2", deliveryStopStatus: "DELIVERED", latitude: 43.72, longitude: -79.42, sequence: 2 },
  ],
  trackingSnapshot,
  ...overrides,
});

test("the End row finds the GPS return after the last completion when no stop has an arrival", () => {
  const end = buildRouteEndpointPresentation(endInput()).end;

  assert.equal(end.actualAt, "2026-10-08T16:50:00.000Z");
  assert.equal(end.actualLabel, "Return observed (GPS)");
  assert.equal(end.observedFromGps, true);

  const withoutCompletions = buildRouteEndpointPresentation(endInput({ completionByStopId: {} })).end;
  assert.equal(withoutCompletions.actualAt, null);
  assert.equal(withoutCompletions.observedFromGps, false);

  const failedStops = [
    { deliveryStopId: "s1", deliveryStopStatus: "DELIVERED", latitude: 43.7, longitude: -79.4, sequence: 1 },
    { deliveryStopId: "s2", deliveryStopStatus: "FAILED", latitude: 43.72, longitude: -79.42, sequence: 2 },
  ];
  const lastStopFailed = buildRouteEndpointPresentation(endInput({
    completionByStopId: {
      s1: { at: "2026-10-08T14:05:00.000Z", eventType: "STOP_DELIVERED" },
      s2: { at: "2026-10-08T16:20:00.000Z", eventType: "STOP_FAILED" },
    },
    stops: failedStops,
  })).end;
  assert.equal(lastStopFailed.actualAt, "2026-10-08T16:50:00.000Z", "a failed last stop with a failed event anchors the return");

  const onlyMismatched = buildRouteEndpointPresentation(endInput({
    completionByStopId: { s1: { at: "2026-10-08T14:05:00.000Z", eventType: "STOP_FAILED" } },
    stops: [failedStops[0]],
  })).end;
  assert.equal(onlyMismatched.observedFromGps, false, "a completion that does not match the stop status is not evidence");
});

test("a route that ends at its last stop shows that stop's completion and says so", () => {
  const input = (overrides = {}) => endInput({
    executionEvidence: { routeEndMode: "END_AT_LAST_STOP" },
    routePlan: { routeEndMode: "END_AT_LAST_STOP", scheduledStartAt: "2026-10-08T13:00:00.000Z" },
    ...overrides,
  });

  const completed = buildRouteEndpointPresentation(input()).end;
  assert.deepEqual([completed.actualAt, completed.actualLabel], ["2026-10-08T16:20:00.000Z", "Last stop completed"]);

  const arrived = buildRouteEndpointPresentation(input({ actualArrivalByStopId: { s2: "2026-10-08T16:14:00.000Z" } })).end;
  assert.deepEqual([arrived.actualAt, arrived.actualLabel], ["2026-10-08T16:14:00.000Z", "Actual arrival"]);

  const none = buildRouteEndpointPresentation(input({ completionByStopId: {} })).end;
  assert.deepEqual([none.actualAt, none.actualLabel], [null, "Unconfirmed"]);
});

test("Route Detail passes the server's completions to the rows and the End row and words the empty case honestly", () => {
  assert.match(routeDetailSource, /buildChildCompletionByStopId\(displayedRouteTrackingSnapshot\?\.stopCompletions\)/);
  assert.match(routeDetailSource, /buildRouteOrderRows\(orderTableRouteRows, \{[\s\S]*completionByStopId: actualCompletionByStopId/);
  assert.match(routeDetailSource, /buildRouteEndpointPresentation\(\{[\s\S]*completionByStopId: actualCompletionByStopId/);

  const etaCell = routeDetailSource.slice(
    routeDetailSource.indexOf("function renderChildRouteEta("),
    routeDetailSource.indexOf("// Amount follows the ETA treatment"),
  );
  assert.match(etaCell, /No arrival or completion time was recorded/);
  assert.doesNotMatch(etaCell, /No arrival event was recorded/);
  assert.match(etaCell, /row\?\.actualLabel \?\? "Actual arrival"/);
});
