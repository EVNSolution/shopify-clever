import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeRouteTrackingSseChunk,
  doesTrackingEventRefreshEta,
  formatRouteTrackingCompletionLabel,
  getRouteExecutionStatusFromTrackingEvent,
  getRouteTrackingLineFeatures,
  getRouteTrackingPathPoints,
  getRouteTrackingPathSummary,
  getRouteTrackingFreshness,
  getRouteTrackingCompletionTime,
  getRouteTrackingFitCoordinates,
  getRouteTrackingPresentation,
  getRouteTrackingStreamInactivityMs,
  isRouteTrackingPayloadForRoute,
  mergeRouteTrackingProgress,
  mergeRouteTrackingPosition,
  mergeRouteTrackingSnapshot,
  normalizeRouteExecutionStatus,
  normalizeRouteTrackingSnapshot,
  selectRouteTrackingWindow,
  shouldShowRouteTrackingFreshness,
  shouldRevalidateTrackingEta,
} from "../app/features/delivery/route-tracking.js";
import {
  proxyDeliveryRouteTrackingSnapshot,
  proxyDeliveryRouteTrackingStream,
} from "../app/features/delivery/route-tracking.server.js";

const policy = {
  liveThresholdMs: 60_000,
  delayedThresholdMs: 180_000,
  streamRetryMs: 3_000,
};

test("tracking SSE parser preserves partial frames and parses named JSON events", () => {
  const first = consumeRouteTrackingSseChunk("", "event: tracking_snapshot\ndata: {\"status\":\"LIVE\"}");
  assert.equal(first.events.length, 0);

  const second = consumeRouteTrackingSseChunk(first.remainder, "\n\nevent: tracking_position\nid: evt-1\ndata: {\"latitude\":37.5,\"longitude\":127}\n\n");
  assert.deepEqual(second.events.map(({ event, eventId }) => ({ event, eventId })), [
    { event: "tracking_snapshot", eventId: null },
    { event: "tracking_position", eventId: "evt-1" },
  ]);
  assert.equal(second.events[1].data.latitude, 37.5);
  assert.equal(second.remainder, "");
});

test("tracking positions are deduplicated and an older event cannot replace latestPosition", () => {
  const snapshot = normalizeRouteTrackingSnapshot({ policy, recentPositions: [] });
  const newest = {
    eventId: "new",
    latitude: 37.5,
    longitude: 127,
    occurredAt: "2026-07-20T04:00:00.000Z",
    receivedAt: "2026-07-20T04:00:01.000Z",
  };
  const older = {
    eventId: "old",
    latitude: 37.4,
    longitude: 126.9,
    occurredAt: "2026-07-20T03:59:00.000Z",
    receivedAt: "2026-07-20T04:00:02.000Z",
  };
  const merged = mergeRouteTrackingPosition(mergeRouteTrackingPosition(snapshot, newest), older);
  const duplicate = mergeRouteTrackingPosition(merged, newest);

  assert.equal(merged.latestPosition.eventId, "new");
  assert.deepEqual(getRouteTrackingPathPoints(merged).map((point) => point.eventId), ["old", "new"]);
  assert.equal(duplicate.recentPositions.length, 2);
});

test("tracking snapshot chooses the newest position across latest and recent payloads", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    routePlanId: "route-1",
    latestPosition: {
      eventId: "stale-latest",
      latitude: 37.5,
      longitude: 127,
      occurredAt: "2026-07-20T04:00:00.000Z",
    },
    recentPositions: [{
      eventId: "newest-recent",
      latitude: 37.6,
      longitude: 127.1,
      occurredAt: "2026-07-20T04:05:00.000Z",
    }],
  });

  assert.equal(snapshot.latestPosition.eventId, "newest-recent");
});

test("tracking snapshots preserve authoritative route execution evidence without inventing duration semantics", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    routePlanId: "route-1",
    executionEvidence: {
      schemaVersion: "route_execution_evidence.v1",
      timeSemantics: "EVENT_TIMESTAMPS_ONLY",
      routeEndMode: "RETURN_TO_DEPOT",
      start: { eventId: "start-1", occurredAt: "2026-09-11T12:00:00.000Z", receivedAt: "2026-09-11T12:00:01.000Z" },
      completion: { eventId: "complete-1", occurredAt: "2026-09-11T16:00:00.000Z", receivedAt: "2026-09-11T16:00:01.000Z", latitude: 43.7, longitude: -79.4 },
      returnToDepot: {
        status: "UNCONFIRMED",
        source: "ROUTE_COMPLETED",
        observedAt: "2026-09-11T16:00:00.000Z",
        evidenceEventId: "complete-1",
        distanceToDepotMeters: 420,
        thresholdMeters: 150,
      },
    },
  });

  assert.equal(snapshot.executionEvidence.schemaVersion, "route_execution_evidence.v1");
  assert.equal(snapshot.executionEvidence.timeSemantics, "EVENT_TIMESTAMPS_ONLY");
  assert.equal(snapshot.executionEvidence.start.occurredAt, "2026-09-11T12:00:00.000Z");
  assert.equal(snapshot.executionEvidence.completion.occurredAt, "2026-09-11T16:00:00.000Z");
  assert.deepEqual(snapshot.executionEvidence.returnToDepot, {
    distanceToDepotMeters: 420,
    evidenceEventId: "complete-1",
    observedAt: "2026-09-11T16:00:00.000Z",
    source: "ROUTE_COMPLETED",
    status: "UNCONFIRMED",
    thresholdMeters: 150,
  });
  assert.equal(Object.hasOwn(snapshot.executionEvidence, "actualDrivingTime"), false);
  assert.equal(Object.hasOwn(snapshot.executionEvidence, "workingTime"), false);

  const reconnectSnapshot = mergeRouteTrackingSnapshot(snapshot, {
    routePlanId: "route-1",
    recentPositions: [],
    status: "NO_DATA",
  });
  assert.equal(reconnectSnapshot.executionEvidence.returnToDepot.status, "UNCONFIRMED");
});

test("tracking merges reject position and progress payloads from another route", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    routePlanId: "route-b",
    latestPosition: {
      eventId: "route-b-position",
      latitude: 37.5,
      longitude: 127,
      occurredAt: "2026-07-20T04:00:00.000Z",
      routePlanId: "route-b",
    },
    progress: {
      completedStopIds: ["route-b-stop"],
      latestEvent: {
        eventId: "route-b-progress",
        eventType: "STOP_DELIVERED",
        occurredAt: "2026-07-20T04:00:00.000Z",
        routePlanId: "route-b",
      },
    },
  });
  const mismatchedPosition = {
    eventId: "route-a-position",
    latitude: 38,
    longitude: 128,
    occurredAt: "2026-07-20T04:01:00.000Z",
    routePlanId: "route-a",
  };
  const mismatchedProgress = {
    deliveryStopId: "route-a-stop",
    eventId: "route-a-progress",
    eventType: "STOP_DELIVERED",
    occurredAt: "2026-07-20T04:01:00.000Z",
    routePlanId: "route-a",
  };

  assert.equal(isRouteTrackingPayloadForRoute(mismatchedPosition, "route-b"), false);
  assert.equal(isRouteTrackingPayloadForRoute({ eventId: "legacy" }, "route-b"), true);
  assert.deepEqual(mergeRouteTrackingPosition(snapshot, mismatchedPosition), snapshot);
  assert.deepEqual(mergeRouteTrackingProgress(snapshot, mismatchedProgress), snapshot);
});

test("recorded route geometry preserves more than 1000 compressed GPS points without truncation", () => {
  const coordinates = Array.from({ length: 1_205 }, (_, index) => [126.9 + index * 0.0001, 37.5 + (index % 2) * 0.001]);
  const samples = coordinates.map((_, index) => ({
    driverId: "driver-1",
    eventId: `event-${index}`,
    occurredAt: new Date(Date.parse("2026-07-21T00:00:00.000Z") + index * 30_000).toISOString(),
    receivedAt: new Date(Date.parse("2026-07-21T00:00:01.000Z") + index * 30_000).toISOString(),
  }));
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: {
      firstOccurredAt: samples[0].occurredAt,
      geometry: { coordinates, type: "LineString" },
      geometryPointCount: coordinates.length,
      lastOccurredAt: samples.at(-1).occurredAt,
      lastReceivedAt: samples.at(-1).receivedAt,
      samples,
      schemaVersion: "route_tracking_geometry.v1",
      sourcePointCount: 1_500,
    },
    recentPositions: [],
  });

  assert.equal(getRouteTrackingPathPoints(snapshot).length, 1_205);
  assert.deepEqual(getRouteTrackingPathSummary(snapshot), {
    firstOccurredAt: samples[0].occurredAt,
    gapCount: 0,
    geometryPointCount: 1_205,
    lastOccurredAt: samples.at(-1).occurredAt,
    sourcePointCount: 1_500,
  });
});

test("regular six-second GPS samples do not become a false collection gap after compression", () => {
  let snapshot = normalizeRouteTrackingSnapshot({ policy, recentPositions: [] });
  const startedAt = Date.parse("2026-09-17T13:00:00.000Z");
  for (let index = 0; index < 101; index += 1) {
    snapshot = mergeRouteTrackingPosition(snapshot, {
      accuracyMeters: 4 + (index % 3),
      eventId: `regular-${index}`,
      latitude: 43.70,
      longitude: -79.40 + index * 0.00001,
      occurredAt: new Date(startedAt + index * 6_000).toISOString(),
      receivedAt: new Date(startedAt + index * 6_000 + 500).toISOString(),
    });
  }

  assert.equal(getRouteTrackingPathSummary(snapshot).gapCount, 0);
  assert.equal(snapshot.recordedPath.sourcePointCount, 101);
  assert.equal(snapshot.recordedPath.samples.at(-1).accuracyMeters, 5);
});

test("a confirmed acquisition gap survives the next compressible live sample", () => {
  let snapshot = normalizeRouteTrackingSnapshot({ policy, recentPositions: [] });
  const positions = [
    ["before-a", -79.4000, "2026-09-17T13:00:00.000Z"],
    ["before-b", -79.3998, "2026-09-17T13:01:00.000Z"],
    ["after-gap-a", -79.3988, "2026-09-17T13:10:00.000Z"],
    ["after-gap-b", -79.3986, "2026-09-17T13:10:06.000Z"],
  ];
  for (const [eventId, longitude, occurredAt] of positions) {
    snapshot = mergeRouteTrackingPosition(snapshot, {
      accuracyMeters: 5,
      eventId,
      latitude: 43.7,
      longitude,
      occurredAt,
      receivedAt: occurredAt,
    });
  }

  assert.equal(getRouteTrackingPathSummary(snapshot).gapCount, 1);
  assert.deepEqual(
    getRouteTrackingLineFeatures(snapshot).map((feature) => feature.geometry.coordinates),
    [
      [[-79.4, 43.7], [-79.3998, 43.7]],
      [[-79.3988, 43.7], [-79.3986, 43.7]],
    ],
  );
});

test("low-speed right-angle GPS movement keeps its turns during live compression", () => {
  let snapshot = normalizeRouteTrackingSnapshot({
    policy: { ...policy, geometrySimplificationToleranceMeters: 5 },
    recentPositions: [],
  });
  const startedAt = Date.parse("2026-09-17T13:00:00.000Z");
  const coordinates = [];
  let longitude = -79.40;
  let latitude = 43.70;
  for (let index = 0; index < 121; index += 1) {
    if (index > 0) {
      const phase = Math.floor((index - 1) / 10) % 4;
      if (phase === 0) longitude += 0.000032;
      if (phase === 1) latitude += 0.0000225;
      if (phase === 2) longitude -= 0.000032;
      if (phase === 3) latitude -= 0.0000225;
    }
    coordinates.push([longitude, latitude]);
    snapshot = mergeRouteTrackingPosition(snapshot, {
      accuracyMeters: 5,
      eventId: `turn-${index}`,
      latitude,
      longitude,
      occurredAt: new Date(startedAt + index * 6_000).toISOString(),
      receivedAt: new Date(startedAt + index * 6_000 + 500).toISOString(),
    });
  }

  const retained = getRouteTrackingPathPoints(snapshot).map((point) => point.coordinates);
  assert.ok(retained.length >= 10, `expected turns to remain, got ${retained.length} points`);
  for (const cornerIndex of [10, 20, 30, 40]) {
    assert.ok(
      retained.some(([x, y]) => Math.abs(x - coordinates[cornerIndex][0]) < 0.000001 && Math.abs(y - coordinates[cornerIndex][1]) < 0.000001),
      `missing corner ${cornerIndex}`,
    );
  }
});

test("tracking window defaults to the route service date and excludes later stale positions", () => {
  const samples = [
    ["south-start", "2026-09-17T13:00:00.000Z"],
    ["south-return", "2026-09-17T17:45:00.000Z"],
    ["later-position", "2026-09-18T13:00:00.000Z"],
  ].map(([eventId, occurredAt], sourceIndex) => ({
    accuracyMeters: 5,
    driverId: "driver-1",
    eventId,
    gapBefore: false,
    occurredAt,
    receivedAt: occurredAt,
    sourceIndex,
  }));
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    latestPosition: {
      eventId: "latest-later-position",
      latitude: 43.8,
      longitude: -79.3,
      occurredAt: samples[2].occurredAt,
      receivedAt: samples[2].receivedAt,
    },
    recordedPath: {
      geometry: {
        coordinates: [[-79.4, 43.7], [-79.41, 43.71], [-79.3, 43.8]],
        type: "LineString",
      },
      samples,
      sourcePointCount: 3,
    },
  });

  const serviceDay = selectRouteTrackingWindow(snapshot, {
    date: "2026-09-17",
    timeZone: "America/Toronto",
  });
  assert.deepEqual(getRouteTrackingPathPoints(serviceDay).map((point) => point.eventId), ["south-start", "south-return"]);
  assert.equal(serviceDay.latestPosition.eventId, "south-return");
  assert.equal(selectRouteTrackingWindow(snapshot, { allRecords: true }), snapshot);
});

test("service-day filtering falls back to raw GPS only for a matched range that crosses midnight", () => {
  const samples = [
    ["before-midnight", "2026-09-18T03:58:00.000Z"],
    ["at-midnight", "2026-09-18T03:59:00.000Z"],
    ["after-midnight", "2026-09-18T04:01:00.000Z"],
  ].map(([eventId, occurredAt], sourceIndex) => ({
    accuracyMeters: 5,
    eventId,
    gapBefore: false,
    occurredAt,
    receivedAt: occurredAt,
    sourceIndex,
  }));
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: {
      geometry: { coordinates: [[-79.4, 43.7], [-79.401, 43.701], [-79.402, 43.702]], type: "LineString" },
      samples,
      sourcePointCount: 3,
    },
    roadMatchedPath: {
      qualityVersion: "gps_quality.v2",
      matchedGeometry: {
        coordinates: [[[-79.4, 43.7], [-79.402, 43.702]]],
        type: "MultiLineString",
      },
      matchedRanges: [{
        startEventId: "before-midnight",
        endEventId: "after-midnight",
        startOccurredAt: samples[0].occurredAt,
        endOccurredAt: samples[2].occurredAt,
        startSourceIndex: 0,
        endSourceIndex: 2,
      }],
    },
  });

  const serviceDay = selectRouteTrackingWindow(snapshot, {
    date: "2026-09-17",
    timeZone: "America/Toronto",
  });
  assert.equal(serviceDay.roadMatchedPath.matchedGeometry, null);
  assert.equal(serviceDay.roadMatchedPath.unmatchedRanges[0].reason, "WINDOW_BOUNDARY");
  assert.deepEqual(getRouteTrackingLineFeatures(serviceDay).map((feature) => feature.properties.trackingType), ["trackingConnector"]);
  assert.deepEqual(getRouteTrackingPathPoints(serviceDay).map((point) => point.eventId), ["before-midnight", "at-midnight"]);
});

test("service-day filtering preserves confident lines when another matched range crosses midnight", () => {
  const occurredTimes = [
    "2026-09-17T13:00:00.000Z",
    "2026-09-17T13:01:00.000Z",
    "2026-09-17T13:02:00.000Z",
    "2026-09-18T03:58:00.000Z",
    "2026-09-18T03:59:00.000Z",
    "2026-09-18T04:01:00.000Z",
  ];
  const coordinates = occurredTimes.map((_, index) => [-79.4 + index * 0.001, 43.7 + index * 0.001]);
  const samples = occurredTimes.map((occurredAt, sourceIndex) => ({
    accuracyMeters: 5,
    eventId: `mixed-day-${sourceIndex}`,
    gapBefore: false,
    occurredAt,
    receivedAt: occurredAt,
    sourceIndex,
  }));
  const range = (startSourceIndex, endSourceIndex) => ({
    startEventId: samples[startSourceIndex].eventId,
    endEventId: samples[endSourceIndex].eventId,
    startOccurredAt: samples[startSourceIndex].occurredAt,
    endOccurredAt: samples[endSourceIndex].occurredAt,
    startSourceIndex,
    endSourceIndex,
  });
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: { geometry: { coordinates, type: "LineString" }, samples, sourcePointCount: 6 },
    roadMatchedPath: {
      qualityVersion: "gps_quality.v2",
      matchedGeometry: {
        coordinates: [coordinates.slice(0, 3), coordinates.slice(3, 6)],
        type: "MultiLineString",
      },
      matchedRanges: [range(0, 2), range(3, 5)],
    },
  });

  const serviceDay = selectRouteTrackingWindow(snapshot, {
    date: "2026-09-17",
    timeZone: "America/Toronto",
  });
  const features = getRouteTrackingLineFeatures(serviceDay);
  assert.deepEqual(features.map((feature) => feature.properties.trackingType), [
    "trackingTrail",
    "trackingConnector",
  ]);
  assert.deepEqual(features[0].geometry.coordinates, coordinates.slice(0, 3));
  assert.deepEqual(features[1].geometry.coordinates, coordinates.slice(3, 5));
});

test("quality coverage renders matched, uncertain, and unmatched spans once each", () => {
  const samples = Array.from({ length: 7 }, (_, sourceIndex) => ({
    accuracyMeters: 5,
    eventId: `quality-${sourceIndex}`,
    gapBefore: false,
    occurredAt: new Date(Date.parse("2026-09-17T13:00:00.000Z") + sourceIndex * 60_000).toISOString(),
    receivedAt: new Date(Date.parse("2026-09-17T13:00:01.000Z") + sourceIndex * 60_000).toISOString(),
    sourceIndex,
  }));
  const coordinates = samples.map((_, index) => [-79.4 + index * 0.001, 43.7 + index * 0.001]);
  const range = (startSourceIndex, endSourceIndex, reason) => ({
    startEventId: samples[startSourceIndex].eventId,
    endEventId: samples[endSourceIndex].eventId,
    startOccurredAt: samples[startSourceIndex].occurredAt,
    endOccurredAt: samples[endSourceIndex].occurredAt,
    startSourceIndex,
    endSourceIndex,
    ...(reason ? { reason } : {}),
  });
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: { geometry: { coordinates, type: "LineString" }, samples, sourcePointCount: 7 },
    roadMatchedPath: {
      qualityVersion: "gps_quality.v2",
      matchedGeometry: { coordinates: [coordinates.slice(0, 3)], type: "MultiLineString" },
      matchedRanges: [range(0, 2)],
      uncertainGeometry: { coordinates: [coordinates.slice(3, 5)], type: "MultiLineString" },
      uncertainRanges: [range(3, 4, "LOW_CONFIDENCE")],
      unmatchedRanges: [range(5, 6, "NO_MATCH")],
    },
  });

  const features = getRouteTrackingLineFeatures(snapshot);
  assert.deepEqual(features.map((feature) => feature.properties.trackingType), [
    "trackingTrail",
    "trackingConnector",
    "trackingConnector",
  ]);
  assert.deepEqual(features[2].geometry.coordinates, coordinates.slice(5, 7));
});

test("gps quality v3 preserves inferred coverage and renders it once as GPS tracking", () => {
  const coordinates = Array.from({ length: 5 }, (_, index) => [-79.4 + index * 0.001, 43.7 + index * 0.001]);
  const samples = coordinates.map((_, sourceIndex) => ({
    accuracyMeters: sourceIndex < 2 ? 5 : 250,
    eventId: `inferred-${sourceIndex}`,
    gapBefore: false,
    occurredAt: new Date(Date.parse("2026-09-17T13:00:00.000Z") + sourceIndex * 60_000).toISOString(),
    receivedAt: new Date(Date.parse("2026-09-17T13:00:01.000Z") + sourceIndex * 60_000).toISOString(),
    sourceIndex,
  }));
  const range = (startSourceIndex, endSourceIndex, reason = null) => ({
    startEventId: samples[startSourceIndex].eventId,
    endEventId: samples[endSourceIndex].eventId,
    startOccurredAt: samples[startSourceIndex].occurredAt,
    endOccurredAt: samples[endSourceIndex].occurredAt,
    startSourceIndex,
    endSourceIndex,
    reason,
  });
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: { geometry: { coordinates, type: "LineString" }, samples, sourcePointCount: coordinates.length },
    roadMatchedPath: {
      qualityVersion: "gps_quality.v3",
      matchedGeometry: { coordinates: [coordinates.slice(0, 2)], type: "MultiLineString" },
      matchedRanges: [range(0, 1)],
      inferredGeometry: { coordinates: [coordinates.slice(2, 5)], type: "MultiLineString" },
      inferredRanges: [range(2, 4, "ROAD_GAP_INFERENCE")],
      unmatchedRanges: [range(2, 4, "LOW_ACCURACY")],
    },
  });

  assert.equal(snapshot.roadMatchedPath.qualityVersion, "gps_quality.v3");
  assert.deepEqual(snapshot.roadMatchedPath.inferredRanges, [range(2, 4, "ROAD_GAP_INFERENCE")]);
  const features = getRouteTrackingLineFeatures(snapshot);
  assert.deepEqual(features.map((feature) => feature.properties.trackingType), ["trackingTrail", "trackingConnector"]);
  assert.equal(features[1].properties.trackingSource, "inferred");
  assert.deepEqual(features[1].geometry.coordinates, coordinates.slice(2, 5));
});

test("gps quality v4 renders accepted matches and bounded inference while rejecting uncertain raw fallback", () => {
  const coordinates = Array.from({ length: 6 }, (_, index) => [-79.4 + index * 0.001, 43.7 + index * 0.001]);
  const samples = coordinates.map((_, sourceIndex) => ({
    accuracyMeters: 5,
    driverId: "driver-1",
    eventId: `quality-v4-${sourceIndex}`,
    gapBefore: false,
    occurredAt: new Date(Date.parse("2026-09-17T13:00:00.000Z") + sourceIndex * 60_000).toISOString(),
    receivedAt: new Date(Date.parse("2026-09-17T13:00:01.000Z") + sourceIndex * 60_000).toISOString(),
    sourceIndex,
  }));
  const range = (startSourceIndex, endSourceIndex, interpolationLevel, reason = null) => ({
    startEventId: samples[startSourceIndex].eventId,
    endEventId: samples[endSourceIndex].eventId,
    startOccurredAt: samples[startSourceIndex].occurredAt,
    endOccurredAt: samples[endSourceIndex].occurredAt,
    startSourceIndex,
    endSourceIndex,
    interpolationLevel,
    reason,
  });
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    latestPosition: {
      ...samples.at(-1),
      latitude: coordinates.at(-1)[1],
      longitude: coordinates.at(-1)[0],
    },
    recordedPath: { geometry: { coordinates, type: "LineString" }, samples, sourcePointCount: coordinates.length },
    roadMatchedPath: {
      qualityVersion: "gps_quality.v4",
      matchedGeometry: { coordinates: [coordinates.slice(0, 3)], type: "MultiLineString" },
      matchedRanges: [range(0, 2, 0)],
      inferredGeometry: { coordinates: [coordinates.slice(2, 5)], type: "MultiLineString" },
      inferredRanges: [range(2, 4, 1, "ROAD_GAP_INFERENCE")],
      uncertainGeometry: { coordinates: [coordinates.slice(4, 6)], type: "MultiLineString" },
      uncertainRanges: [range(4, 5, 2, "LOW_CONFIDENCE")],
      unmatchedRanges: [range(4, 5, 2, "LOW_ACCURACY")],
    },
  });

  assert.equal(snapshot.roadMatchedPath.matchedRanges[0].interpolationLevel, 0);
  assert.equal(snapshot.roadMatchedPath.inferredRanges[0].interpolationLevel, 1);
  assert.equal(snapshot.roadMatchedPath.uncertainRanges[0].interpolationLevel, 2);
  const features = getRouteTrackingLineFeatures(snapshot);
  assert.deepEqual(features.map((feature) => feature.geometry.coordinates), [
    coordinates.slice(0, 3),
    coordinates.slice(2, 5),
  ]);
  assert.deepEqual(features.map((feature) => feature.properties.trackingSource ?? null), [null, "inferred"]);
  assert.equal(snapshot.latestPosition.eventId, samples.at(-1).eventId);
});

test("gps quality v4 rejected ranges stay disconnected while the current position remains available", () => {
  const coordinates = [[-79.4, 43.7], [-79.399, 43.701], [-79.398, 43.702]];
  const samples = coordinates.map((_, sourceIndex) => ({
    accuracyMeters: 5,
    driverId: "driver-1",
    eventId: `rejected-v4-${sourceIndex}`,
    gapBefore: false,
    occurredAt: new Date(Date.parse("2026-09-17T13:00:00.000Z") + sourceIndex * 60_000).toISOString(),
    receivedAt: new Date(Date.parse("2026-09-17T13:00:01.000Z") + sourceIndex * 60_000).toISOString(),
    sourceIndex,
  }));
  const rejectedRange = {
    startEventId: samples[0].eventId,
    endEventId: samples[2].eventId,
    startOccurredAt: samples[0].occurredAt,
    endOccurredAt: samples[2].occurredAt,
    startSourceIndex: 0,
    endSourceIndex: 2,
    interpolationLevel: 2,
    reason: "LOW_CONFIDENCE",
  };
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    latestPosition: {
      ...samples[2],
      latitude: coordinates[2][1],
      longitude: coordinates[2][0],
    },
    recordedPath: { geometry: { coordinates, type: "LineString" }, samples, sourcePointCount: coordinates.length },
    roadMatchedPath: {
      qualityVersion: "gps_quality.v4",
      uncertainGeometry: { coordinates: [coordinates], type: "MultiLineString" },
      uncertainRanges: [rejectedRange],
      unmatchedRanges: [
        { ...rejectedRange, interpolationLevel: null, reason: "NO_MATCH" },
        { ...rejectedRange, interpolationLevel: "1", reason: "NO_MATCH" },
      ],
    },
  });

  assert.deepEqual(getRouteTrackingLineFeatures(snapshot), []);
  assert.deepEqual(snapshot.roadMatchedPath.unmatchedRanges.map((range) => (
    Object.hasOwn(range, "interpolationLevel")
  )), [false, false]);
  assert.equal(snapshot.latestPosition.eventId, samples[2].eventId);
});

test("gps quality v4 date clipping never reconnects a rejected window boundary with raw GPS", () => {
  const coordinates = [[-79.4, 43.7], [-79.399, 43.701], [-79.398, 43.702]];
  const occurredTimes = [
    "2026-09-18T03:58:00.000Z",
    "2026-09-18T03:59:00.000Z",
    "2026-09-18T04:01:00.000Z",
  ];
  const samples = coordinates.map((_, sourceIndex) => ({
    accuracyMeters: 5,
    driverId: "driver-1",
    eventId: `window-v4-${sourceIndex}`,
    gapBefore: false,
    occurredAt: occurredTimes[sourceIndex],
    receivedAt: occurredTimes[sourceIndex],
    sourceIndex,
  }));
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: { geometry: { coordinates, type: "LineString" }, samples, sourcePointCount: coordinates.length },
    roadMatchedPath: {
      qualityVersion: "gps_quality.v4",
      matchedGeometry: { coordinates: [[coordinates[0], coordinates[2]]], type: "MultiLineString" },
      matchedRanges: [{
        startEventId: samples[0].eventId,
        endEventId: samples[2].eventId,
        startOccurredAt: samples[0].occurredAt,
        endOccurredAt: samples[2].occurredAt,
        startSourceIndex: 0,
        endSourceIndex: 2,
        interpolationLevel: 0,
      }],
    },
  });

  const serviceDay = selectRouteTrackingWindow(snapshot, {
    date: "2026-09-17",
    timeZone: "America/Toronto",
  });
  assert.equal(serviceDay.roadMatchedPath.matchedGeometry, null);
  assert.equal(serviceDay.roadMatchedPath.unmatchedRanges[0].reason, "WINDOW_BOUNDARY");
  assert.equal(serviceDay.roadMatchedPath.unmatchedRanges[0].interpolationLevel, 0);
  assert.deepEqual(getRouteTrackingLineFeatures(serviceDay), []);
});

test("gps quality v2 cached paths remain valid without inference fields", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    roadMatchedPath: {
      qualityVersion: "gps_quality.v2",
      matchedGeometry: { coordinates: [[[-79.4, 43.7], [-79.399, 43.701]]], type: "MultiLineString" },
      matchedRanges: [{
        startEventId: "cached-0",
        endEventId: "cached-1",
        startOccurredAt: "2026-09-17T13:00:00.000Z",
        endOccurredAt: "2026-09-17T13:01:00.000Z",
        startSourceIndex: 0,
        endSourceIndex: 1,
      }],
    },
  });

  assert.equal(snapshot.roadMatchedPath.inferredGeometry, null);
  assert.deepEqual(snapshot.roadMatchedPath.inferredRanges, []);
  assert.deepEqual(getRouteTrackingLineFeatures(snapshot).map((feature) => feature.properties.trackingType), ["trackingTrail"]);
});

test("service-day filtering keeps reliable anchor paths while omitting cross-midnight inference", () => {
  const occurredTimes = [
    "2026-09-17T13:00:00.000Z",
    "2026-09-17T13:01:00.000Z",
    "2026-09-17T14:00:00.000Z",
    "2026-09-17T14:01:00.000Z",
    "2026-09-18T03:58:00.000Z",
    "2026-09-18T03:59:00.000Z",
    "2026-09-18T03:59:30.000Z",
    "2026-09-18T04:00:30.000Z",
    "2026-09-18T04:01:00.000Z",
    "2026-09-18T04:02:00.000Z",
  ];
  const coordinates = occurredTimes.map((_, index) => [-79.4 + index * 0.001, 43.7 + index * 0.001]);
  const samples = occurredTimes.map((occurredAt, sourceIndex) => ({
    accuracyMeters: [2, 3, 6, 7].includes(sourceIndex) ? 250 : 5,
    eventId: `inferred-day-${sourceIndex}`,
    gapBefore: false,
    occurredAt,
    receivedAt: occurredAt,
    sourceIndex,
  }));
  const range = (startSourceIndex, endSourceIndex, reason = null) => ({
    startEventId: samples[startSourceIndex].eventId,
    endEventId: samples[endSourceIndex].eventId,
    startOccurredAt: samples[startSourceIndex].occurredAt,
    endOccurredAt: samples[endSourceIndex].occurredAt,
    startSourceIndex,
    endSourceIndex,
    reason,
  });
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: { geometry: { coordinates, type: "LineString" }, samples, sourcePointCount: coordinates.length },
    roadMatchedPath: {
      qualityVersion: "gps_quality.v3",
      matchedGeometry: {
        coordinates: [coordinates.slice(0, 2), coordinates.slice(4, 6), coordinates.slice(8, 10)],
        type: "MultiLineString",
      },
      matchedRanges: [range(0, 1), range(4, 5), range(8, 9)],
      inferredGeometry: {
        coordinates: [coordinates.slice(2, 4), [coordinates[5], coordinates[8]]],
        type: "MultiLineString",
      },
      inferredRanges: [range(2, 3, "ROAD_GAP_INFERENCE"), range(5, 8, "ROAD_GAP_INFERENCE")],
      unmatchedRanges: [range(2, 3, "LOW_ACCURACY"), range(6, 7, "LOW_ACCURACY")],
    },
  });

  const serviceDay = selectRouteTrackingWindow(snapshot, {
    date: "2026-09-17",
    timeZone: "America/Toronto",
  });
  assert.equal(serviceDay.roadMatchedPath.inferredGeometry.coordinates.length, 1);
  assert.deepEqual(serviceDay.roadMatchedPath.inferredRanges, [range(2, 3, "ROAD_GAP_INFERENCE")]);
  const features = getRouteTrackingLineFeatures(serviceDay);
  assert.deepEqual(features.map((feature) => feature.properties.trackingType), [
    "trackingTrail",
    "trackingTrail",
    "trackingConnector",
  ]);
  assert.deepEqual(features[0].geometry.coordinates, coordinates.slice(0, 2));
  assert.deepEqual(features[1].geometry.coordinates, coordinates.slice(4, 6));
  assert.deepEqual(features[2].geometry.coordinates, coordinates.slice(2, 4));
  assert.equal(features.some((feature) => feature.geometry.coordinates.includes(coordinates[6])), false);
  assert.equal(features.some((feature) => feature.geometry.coordinates.includes(coordinates[8])), false);
});

test("low-accuracy unmatched GPS cannot draw a route line or expand map fit", () => {
  const reliableCoordinates = [[-79.4, 43.7], [-79.399, 43.701]];
  const inaccurateCoordinates = Array.from({ length: 8 }, (_, index) => [
    -79.30 + (index % 2 === 0 ? 0.07 : -0.07),
    43.80 + (index % 2 === 0 ? -0.07 : 0.07),
  ]);
  const coordinates = [...reliableCoordinates, ...inaccurateCoordinates];
  const samples = coordinates.map((_, sourceIndex) => ({
    accuracyMeters: sourceIndex < 2 ? 5 : 250,
    eventId: `accuracy-${sourceIndex}`,
    gapBefore: false,
    occurredAt: new Date(Date.parse("2026-09-17T13:00:00.000Z") + sourceIndex * 60_000).toISOString(),
    receivedAt: new Date(Date.parse("2026-09-17T13:00:01.000Z") + sourceIndex * 60_000).toISOString(),
    sourceIndex,
  }));
  const range = (startSourceIndex, endSourceIndex, reason) => ({
    startEventId: samples[startSourceIndex].eventId,
    endEventId: samples[endSourceIndex].eventId,
    startOccurredAt: samples[startSourceIndex].occurredAt,
    endOccurredAt: samples[endSourceIndex].occurredAt,
    startSourceIndex,
    endSourceIndex,
    reason,
  });
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: { geometry: { coordinates, type: "LineString" }, samples, sourcePointCount: coordinates.length },
    roadMatchedPath: {
      qualityVersion: "gps_quality.v2",
      matchedGeometry: { coordinates: [reliableCoordinates], type: "MultiLineString" },
      matchedRanges: [range(0, 1, null)],
      unmatchedRanges: [range(2, 9, "LOW_ACCURACY")],
    },
  });

  const features = getRouteTrackingLineFeatures(snapshot);
  assert.deepEqual(features.map((feature) => feature.properties.trackingType), ["trackingTrail"]);
  assert.deepEqual(getRouteTrackingFitCoordinates(snapshot), reliableCoordinates);
});

test("low-accuracy raw fallback cannot draw a route line when road matching is unavailable", () => {
  const coordinates = Array.from({ length: 8 }, (_, index) => [
    -79.30 + (index % 2 === 0 ? 0.07 : -0.07),
    43.80 + (index % 2 === 0 ? -0.07 : 0.07),
  ]);
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: {
      geometry: { coordinates, type: "LineString" },
      samples: coordinates.map((_, sourceIndex) => ({
        accuracyMeters: 250,
        eventId: `raw-low-${sourceIndex}`,
        gapBefore: false,
        occurredAt: new Date(Date.parse("2026-09-17T13:00:00.000Z") + sourceIndex * 60_000).toISOString(),
        receivedAt: new Date(Date.parse("2026-09-17T13:00:01.000Z") + sourceIndex * 60_000).toISOString(),
        sourceIndex,
      })),
      sourcePointCount: coordinates.length,
    },
  });

  assert.deepEqual(getRouteTrackingLineFeatures(snapshot), []);
  assert.deepEqual(getRouteTrackingFitCoordinates(snapshot), []);
});

test("low-accuracy live tail cannot extend a matched route", () => {
  const coordinates = [[-79.4, 43.7], [-79.30, 43.80], [-79.37, 43.87]];
  const samples = coordinates.map((_, sourceIndex) => ({
    accuracyMeters: sourceIndex === 0 ? 5 : 250,
    eventId: `tail-low-${sourceIndex}`,
    gapBefore: false,
    occurredAt: new Date(Date.parse("2026-09-17T13:00:00.000Z") + sourceIndex * 60_000).toISOString(),
    receivedAt: new Date(Date.parse("2026-09-17T13:00:01.000Z") + sourceIndex * 60_000).toISOString(),
    sourceIndex,
  }));
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: { geometry: { coordinates, type: "LineString" }, samples, sourcePointCount: coordinates.length },
    roadMatchedPath: {
      qualityVersion: "gps_quality.v2",
      inputPointCount: 1,
      lastInputOccurredAt: samples[0].occurredAt,
      lastMatchedPosition: { latitude: 43.7, longitude: -79.4, occurredAt: samples[0].occurredAt },
      matchedGeometry: { coordinates: [[[-79.4, 43.7], [-79.3999, 43.7001]]], type: "MultiLineString" },
      matchedRanges: [{
        startEventId: samples[0].eventId,
        endEventId: samples[0].eventId,
        startOccurredAt: samples[0].occurredAt,
        endOccurredAt: samples[0].occurredAt,
        startSourceIndex: 0,
        endSourceIndex: 0,
      }],
    },
  });

  const features = getRouteTrackingLineFeatures(snapshot);
  assert.deepEqual(features.map((feature) => feature.properties.trackingType), ["trackingTrail"]);
  assert.deepEqual(getRouteTrackingFitCoordinates(snapshot), [[-79.4, 43.7], [-79.3999, 43.7001]]);
});

test("road-matched tracking renders only open GPS line segments", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: {
      firstOccurredAt: "2026-07-21T00:00:00.000Z",
      geometry: {
        coordinates: [[127, 37.5], [127.001, 37.501], [127.002, 37.502], [127.003, 37.503]],
        type: "LineString",
      },
      geometryPointCount: 4,
      lastOccurredAt: "2026-07-21T00:03:00.000Z",
      lastReceivedAt: "2026-07-21T00:03:01.000Z",
      samples: [0, 1, 2, 3].map((index) => ({
        driverId: "driver-1",
        eventId: `position-${index}`,
        occurredAt: `2026-07-21T00:0${index}:00.000Z`,
        receivedAt: `2026-07-21T00:0${index}:01.000Z`,
      })),
      schemaVersion: "route_tracking_geometry.v1",
      sourcePointCount: 4,
    },
    roadMatchedPath: {
      coverage: "korea",
      inputPointCount: 3,
      lastInputOccurredAt: "2026-07-21T00:03:00.000Z",
      lastMatchedPosition: {
        latitude: 37.502,
        longitude: 127.002,
        occurredAt: "2026-07-21T00:02:00.000Z",
      },
      matchedGeometry: {
        coordinates: [[[127, 37.5], [127.0005, 37.5005], [127.002, 37.502]]],
        type: "MultiLineString",
      },
      matchedPointCount: 3,
      schemaVersion: "route_tracking_road_match.v1",
      uncertainGeometry: {
        coordinates: [[[127.002, 37.502], [127.0022, 37.5022]]],
        type: "MultiLineString",
      },
    },
  });

  const features = getRouteTrackingLineFeatures(snapshot);
  assert.deepEqual(features.map((feature) => feature.properties.trackingType), [
    "trackingTrail",
    "trackingConnector",
    "trackingConnector",
  ]);
  assert.equal(features.some((feature) => feature.geometry.type === "Point"), false);
  assert.deepEqual(features.at(-1).geometry.coordinates, [
    [127.002, 37.502],
    [127.003, 37.503],
  ]);
  assert.notDeepEqual(
    features.at(-1).geometry.coordinates.at(-1),
    features.at(-1).geometry.coordinates[0],
  );
});

test("road-matched tracking preserves uncertain geometry while rejecting an impossible live tail jump", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: {
      geometry: {
        coordinates: [[127, 37.5], [127.0002, 37.5002], [128, 38]],
        type: "LineString",
      },
      samples: [
        { driverId: "driver-1", eventId: "raw-1", occurredAt: "2026-07-21T00:00:00.000Z", receivedAt: "2026-07-21T00:00:01.000Z" },
        { driverId: "driver-1", eventId: "raw-2", occurredAt: "2026-07-21T00:01:00.000Z", receivedAt: "2026-07-21T00:01:01.000Z" },
        { driverId: "driver-1", eventId: "raw-jump", occurredAt: "2026-07-21T00:02:00.000Z", receivedAt: "2026-07-21T00:02:01.000Z" },
      ],
      sourcePointCount: 3,
    },
    roadMatchedPath: {
      coverage: "korea",
      inputPointCount: 2,
      lastInputOccurredAt: "2026-07-21T00:01:00.000Z",
      lastMatchedPosition: { latitude: 37.5002, longitude: 127.0002, occurredAt: "2026-07-21T00:01:00.000Z" },
      matchedGeometry: {
        coordinates: [[[127, 37.5], [127.0002, 37.5002]]],
        type: "MultiLineString",
      },
      matchedPointCount: 2,
      schemaVersion: "route_tracking_road_match.v1",
      uncertainGeometry: {
        coordinates: [[
          [127, 37.5],
          [127.004, 37.5],
          [127.004, 37.504],
          [127, 37.504],
          [127.00001, 37.50001],
        ]],
        type: "MultiLineString",
      },
    },
  });

  const features = getRouteTrackingLineFeatures(snapshot);

  assert.deepEqual(features.map((feature) => feature.properties.trackingType), [
    "trackingTrail",
    "trackingConnector",
  ]);
  assert.deepEqual(features[1].geometry.coordinates, snapshot.roadMatchedPath.uncertainGeometry.coordinates[0]);
  assert.equal(
    getRouteTrackingFitCoordinates(snapshot).some((coordinate) => (
      coordinate[0] === 128 && coordinate[1] === 38
    )),
    false,
  );
});

test("road-match metadata without usable geometry falls back to the recorded GPS path", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: {
      geometry: {
        coordinates: [[127, 37.5], [127.001, 37.501], [127.002, 37.502]],
        type: "LineString",
      },
      samples: [0, 1, 2].map((index) => ({
        driverId: "driver-1",
        eventId: `raw-${index}`,
        occurredAt: `2026-07-21T00:0${index}:00.000Z`,
        receivedAt: `2026-07-21T00:0${index}:01.000Z`,
      })),
      sourcePointCount: 3,
    },
    roadMatchedPath: {
      coverage: "korea",
      inputPointCount: 3,
      lastInputOccurredAt: "2026-07-21T00:02:00.000Z",
      lastMatchedPosition: {
        latitude: 37.502,
        longitude: 127.002,
        occurredAt: "2026-07-21T00:02:00.000Z",
      },
      matchedGeometry: null,
      matchedPointCount: 0,
      schemaVersion: "route_tracking_road_match.v1",
      uncertainGeometry: null,
    },
  });

  const features = getRouteTrackingLineFeatures(snapshot);

  assert.deepEqual(features.map((feature) => feature.properties.trackingType), ["trackingConnector"]);
  assert.deepEqual(features[0].geometry.coordinates, [
    [127, 37.5],
    [127.001, 37.501],
    [127.002, 37.502],
  ]);
});

test("recorded GPS does not connect road-match fragments across collection gaps", () => {
  const coordinates = [
    [127, 37.5],
    [127.001, 37.501],
    [127.01, 37.51],
    [127.011, 37.511],
  ];
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    recordedPath: {
      geometry: { coordinates, type: "LineString" },
      samples: [
        ["raw-1", "2026-07-21T00:00:00.000Z"],
        ["raw-2", "2026-07-21T00:01:00.000Z"],
        ["raw-3", "2026-07-21T00:10:00.000Z"],
        ["raw-4", "2026-07-21T00:11:00.000Z"],
      ].map(([eventId, occurredAt]) => ({
        driverId: "driver-1",
        eventId,
        occurredAt,
        receivedAt: occurredAt,
      })),
      sourcePointCount: 604,
    },
    roadMatchedPath: {
      coverage: "canada",
      inputPointCount: 4,
      lastInputOccurredAt: "2026-07-21T00:11:00.000Z",
      lastMatchedPosition: {
        latitude: 37.511,
        longitude: 127.011,
        occurredAt: "2026-07-21T00:11:00.000Z",
      },
      matchedGeometry: {
        coordinates: [
          coordinates.slice(0, 2),
          coordinates.slice(2),
        ],
        type: "MultiLineString",
      },
      matchedPointCount: 4,
      schemaVersion: "route_tracking_road_match.v1",
      uncertainGeometry: null,
    },
  });

  const features = getRouteTrackingLineFeatures(snapshot);
  assert.deepEqual(features.map((feature) => feature.properties.trackingType), [
    "trackingTrail",
    "trackingTrail",
  ]);
  assert.equal(getRouteTrackingPathSummary(snapshot).gapCount, 1);
});

test("raw GPS remains visible only as a filtered dashed path while road matching is unavailable", () => {
  const samples = [0, 1, 2, 3].map((index) => ({
    driverId: "driver-1",
    eventId: `raw-${index}`,
    occurredAt: `2026-07-21T00:0${index}:00.000Z`,
    receivedAt: `2026-07-21T00:0${index}:01.000Z`,
  }));
  const features = getRouteTrackingLineFeatures({
    policy,
    recordedPath: {
      geometry: {
        coordinates: [[127, 37.5], [127.00001, 37.50001], [127.001, 37.501], [127.002, 37.502]],
        type: "LineString",
      },
      samples,
      sourcePointCount: 4,
    },
  });

  assert.deepEqual(features.map((feature) => feature.properties.trackingType), ["trackingConnector"]);
  assert.equal(features.some((feature) => feature.geometry.type === "Point"), false);
  assert.deepEqual(features[0].geometry.coordinates, [
    [127, 37.5],
    [127.001, 37.501],
    [127.002, 37.502],
  ]);
});

test("live GPS extends the server recorded path without dropping past positions", () => {
  const recordedPositions = [
    {
      driverId: "driver-1",
      eventId: "past-1",
      occurredAt: "2026-07-21T00:00:00.000Z",
      receivedAt: "2026-07-21T00:00:01.000Z",
    },
    {
      driverId: "driver-1",
      eventId: "past-2",
      occurredAt: "2026-07-21T00:01:00.000Z",
      receivedAt: "2026-07-21T00:01:01.000Z",
    },
  ];
  const snapshot = normalizeRouteTrackingSnapshot({
    latestPosition: {
      ...recordedPositions[1],
      latitude: 37.501,
      longitude: 126.901,
    },
    policy,
    recordedPath: {
      firstOccurredAt: recordedPositions[0].occurredAt,
      geometry: {
        coordinates: [[126.9, 37.5], [126.901, 37.501]],
        type: "LineString",
      },
      geometryPointCount: 2,
      lastOccurredAt: recordedPositions[1].occurredAt,
      lastReceivedAt: recordedPositions[1].receivedAt,
      samples: recordedPositions,
      schemaVersion: "route_tracking_geometry.v1",
      sourcePointCount: 2,
    },
    recentPositions: recordedPositions.map((position, index) => ({
      ...position,
      latitude: 37.5 + index * 0.001,
      longitude: 126.9 + index * 0.001,
    })),
  });
  const livePosition = {
    driverId: "driver-1",
    eventId: "live-1",
    latitude: 37.501,
    longitude: 126.903,
    occurredAt: "2026-07-21T00:02:00.000Z",
    receivedAt: "2026-07-21T00:02:01.000Z",
  };

  const merged = mergeRouteTrackingPosition(snapshot, livePosition);

  assert.deepEqual(
    getRouteTrackingPathPoints(merged).map((point) => point.eventId),
    ["past-1", "past-2", "live-1"],
  );
  assert.equal(merged.latestPosition.eventId, "live-1");
  assert.equal(merged.recordedPath.sourcePointCount, 3);
  assert.equal(merged.recordedPath.lastOccurredAt, livePosition.occurredAt);
});

test("live GPS extends recent server history when recorded geometry is not available yet", () => {
  const recentPositions = [
    {
      driverId: "driver-1",
      eventId: "past-1",
      latitude: 37.5,
      longitude: 126.9,
      occurredAt: "2026-07-21T00:00:00.000Z",
      receivedAt: "2026-07-21T00:00:01.000Z",
    },
    {
      driverId: "driver-1",
      eventId: "past-2",
      latitude: 37.501,
      longitude: 126.901,
      occurredAt: "2026-07-21T00:01:00.000Z",
      receivedAt: "2026-07-21T00:01:01.000Z",
    },
  ];
  const snapshot = normalizeRouteTrackingSnapshot({
    latestPosition: recentPositions[1],
    policy,
    recentPositions,
  });

  const merged = mergeRouteTrackingPosition(snapshot, {
    driverId: "driver-1",
    eventId: "live-1",
    latitude: 37.501,
    longitude: 126.903,
    occurredAt: "2026-07-21T00:02:00.000Z",
    receivedAt: "2026-07-21T00:02:01.000Z",
  });

  assert.deepEqual(
    getRouteTrackingPathPoints(merged).map((point) => point.eventId),
    ["past-1", "past-2", "live-1"],
  );
});

test("a refreshed server snapshot keeps live GPS that arrived after the snapshot", () => {
  const serverSnapshot = normalizeRouteTrackingSnapshot({
    latestPosition: {
      driverId: "driver-1",
      eventId: "past-1",
      latitude: 37.5,
      longitude: 126.9,
      occurredAt: "2026-07-21T00:00:00.000Z",
      receivedAt: "2026-07-21T00:00:01.000Z",
    },
    policy,
    recordedPath: {
      firstOccurredAt: "2026-07-21T00:00:00.000Z",
      geometry: { coordinates: [[126.9, 37.5]], type: "LineString" },
      geometryPointCount: 1,
      lastOccurredAt: "2026-07-21T00:00:00.000Z",
      lastReceivedAt: "2026-07-21T00:00:01.000Z",
      samples: [{
        driverId: "driver-1",
        eventId: "past-1",
        occurredAt: "2026-07-21T00:00:00.000Z",
        receivedAt: "2026-07-21T00:00:01.000Z",
      }],
      schemaVersion: "route_tracking_geometry.v1",
      sourcePointCount: 1,
    },
    recentPositions: [],
  });
  const withLivePosition = mergeRouteTrackingPosition(serverSnapshot, {
    driverId: "driver-1",
    eventId: "live-1",
    latitude: 37.501,
    longitude: 126.901,
    occurredAt: "2026-07-21T00:01:00.000Z",
    receivedAt: "2026-07-21T00:01:01.000Z",
  });

  const merged = mergeRouteTrackingSnapshot(withLivePosition, serverSnapshot);
  const latestOnly = normalizeRouteTrackingSnapshot({
    latestPosition: withLivePosition.latestPosition,
    policy,
    recentPositions: [],
  });
  const mergedLatestOnly = mergeRouteTrackingSnapshot(latestOnly, serverSnapshot);

  assert.deepEqual(
    getRouteTrackingPathPoints(merged).map((point) => point.eventId),
    ["past-1", "live-1"],
  );
  assert.equal(merged.latestPosition.eventId, "live-1");
  assert.equal(mergedLatestOnly.latestPosition.eventId, "live-1");
});

test("a lower fidelity stream snapshot cannot replace a richer server past path", () => {
  const richSnapshot = normalizeRouteTrackingSnapshot({
    latestPosition: {
      driverId: "driver-1",
      eventId: "past-2",
      latitude: 37.501,
      longitude: 126.901,
      occurredAt: "2026-07-21T00:01:00.000Z",
      receivedAt: "2026-07-21T00:01:01.000Z",
    },
    policy,
    recordedPath: {
      firstOccurredAt: "2026-07-21T00:00:00.000Z",
      geometry: { coordinates: [[126.9, 37.5], [126.901, 37.501]], type: "LineString" },
      geometryPointCount: 2,
      lastOccurredAt: "2026-07-21T00:01:00.000Z",
      lastReceivedAt: "2026-07-21T00:01:01.000Z",
      samples: [
        {
          driverId: "driver-1",
          eventId: "past-1",
          occurredAt: "2026-07-21T00:00:00.000Z",
          receivedAt: "2026-07-21T00:00:01.000Z",
        },
        {
          driverId: "driver-1",
          eventId: "past-2",
          occurredAt: "2026-07-21T00:01:00.000Z",
          receivedAt: "2026-07-21T00:01:01.000Z",
        },
      ],
      sourcePointCount: 2,
    },
    recentPositions: [],
  });
  const livePosition = {
    driverId: "driver-1",
    eventId: "live-1",
    latitude: 37.501,
    longitude: 126.903,
    occurredAt: "2026-07-21T00:02:00.000Z",
    receivedAt: "2026-07-21T00:02:01.000Z",
  };

  const merged = mergeRouteTrackingSnapshot(richSnapshot, {
    latestPosition: livePosition,
    policy,
    recentPositions: [livePosition],
  });

  assert.deepEqual(
    getRouteTrackingPathPoints(merged).map((point) => point.eventId),
    ["past-1", "past-2", "live-1"],
  );

  const mergedEqualSizeWindow = mergeRouteTrackingSnapshot(richSnapshot, {
    latestPosition: livePosition,
    policy,
    recentPositions: [
      {
        ...richSnapshot.latestPosition,
        eventId: "past-2",
      },
      livePosition,
    ],
  });
  assert.deepEqual(
    getRouteTrackingPathPoints(mergedEqualSizeWindow).map((point) => point.eventId),
    ["past-1", "past-2", "live-1"],
  );
});

test("freshness uses server-provided thresholds", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    latestPosition: {
      eventId: "evt",
      latitude: 37.5,
      longitude: 127,
      receivedAt: "2026-07-20T04:00:00.000Z",
    },
  });

  assert.equal(getRouteTrackingFreshness(snapshot, Date.parse("2026-07-20T04:00:30.000Z")).key, "LIVE");
  assert.equal(getRouteTrackingFreshness(snapshot, Date.parse("2026-07-20T04:02:00.000Z")).key, "DELAYED");
  assert.equal(getRouteTrackingFreshness(snapshot, Date.parse("2026-07-20T04:04:00.000Z")).key, "OFFLINE");
});

test("stream inactivity recovery waits for three missed server heartbeats", () => {
  assert.equal(getRouteTrackingStreamInactivityMs({ policy: { heartbeatMs: 15_000 } }), 45_000);
  assert.equal(getRouteTrackingStreamInactivityMs({ policy: { heartbeatMs: 20_000 } }), 60_000);
  assert.equal(getRouteTrackingStreamInactivityMs(null), 45_000);
});

test("route execution status controls live, inactive, and historical tracking presentation", () => {
  const noHistory = normalizeRouteTrackingSnapshot({ policy, recentPositions: [] });
  const history = normalizeRouteTrackingSnapshot({
    policy,
    latestPosition: {
      eventId: "position-1",
      latitude: 37.5,
      longitude: 127,
      occurredAt: "2026-07-20T04:00:00.000Z",
    },
  });

  assert.equal(normalizeRouteExecutionStatus("published"), "READY");
  assert.deepEqual(getRouteTrackingPresentation("READY", noHistory), {
    connectionLabel: "inactive",
    driverStage: "READY",
    mode: "inactive",
    trackingLabel: "Not started",
  });
  assert.deepEqual(getRouteTrackingPresentation("READY", history), {
    connectionLabel: "closed",
    driverStage: "READY",
    mode: "history",
    trackingLabel: "Tracking stopped",
  });
  assert.deepEqual(getRouteTrackingPresentation("COMPLETED", history), {
    connectionLabel: "closed",
    driverStage: "COMPLETED",
    mode: "history",
    trackingLabel: "Completed",
  });
  assert.equal(
    getRouteTrackingPresentation("IN_PROGRESS", history, Date.parse("2026-07-20T04:00:30.000Z")).trackingLabel,
    "Live",
  );
});

test("route lifecycle progress events update the displayed execution status", () => {
  assert.equal(getRouteExecutionStatusFromTrackingEvent("READY", { eventType: "ROUTE_STARTED" }), "IN_PROGRESS");
  assert.equal(getRouteExecutionStatusFromTrackingEvent("IN_PROGRESS", { eventType: "ROUTE_PAUSED" }), "READY");
  assert.equal(getRouteExecutionStatusFromTrackingEvent("IN_PROGRESS", { eventType: "ROUTE_COMPLETED" }), "COMPLETED");
  assert.equal(getRouteExecutionStatusFromTrackingEvent("IN_PROGRESS", { eventType: "STOP_DELIVERED" }), "IN_PROGRESS");
});

test("completed tracking freezes freshness at the completion event", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    progress: {
      latestEvent: {
        eventType: "ROUTE_COMPLETED",
        occurredAt: "2026-08-06T04:00:00.000Z",
      },
    },
  });

  assert.equal(
    getRouteTrackingCompletionTime(snapshot),
    Date.parse("2026-08-06T04:00:00.000Z"),
  );
  assert.equal(shouldShowRouteTrackingFreshness({
    completionTime: getRouteTrackingCompletionTime(snapshot),
    deliveryDate: "2026-08-01",
    executionStatus: "COMPLETED",
    ianaTimezone: "America/Toronto",
    now: Date.parse("2026-08-06T12:00:00.000Z"),
  }), true);
});

test("completed tracking displays the store-local terminal date and never a relative age", () => {
  const completedAt = Date.parse("2026-08-06T04:00:00.000Z");

  assert.equal(formatRouteTrackingCompletionLabel(completedAt, "America/Toronto"), "2026.08.06 00:00 종료");
  assert.equal(formatRouteTrackingCompletionLabel(completedAt, "Asia/Seoul"), "2026.08.06 13:00 종료");
  assert.equal(formatRouteTrackingCompletionLabel(null, "America/Toronto"), "종료 시각 확인 불가");
});

test("completed tracking without a completion timestamp hides after its delivery date", () => {
  const common = {
    completionTime: null,
    deliveryDate: "2026-08-05",
    executionStatus: "COMPLETED",
    ianaTimezone: "America/Toronto",
    now: Date.parse("2026-08-06T12:00:00.000Z"),
  };

  assert.equal(shouldShowRouteTrackingFreshness(common), false);
  assert.equal(shouldShowRouteTrackingFreshness({ ...common, executionStatus: "IN_PROGRESS" }), true);
  assert.equal(shouldShowRouteTrackingFreshness({ ...common, deliveryDate: "2026-08-06" }), true);
});

test("only server ETA lifecycle events refresh route detail ETAs", () => {
  assert.equal(doesTrackingEventRefreshEta({ eventType: "ROUTE_STARTED" }), true);
  assert.equal(doesTrackingEventRefreshEta({ eventType: "STOP_ARRIVED" }), true);
  assert.equal(doesTrackingEventRefreshEta({ eventType: "STOP_DELIVERED" }), false);
  assert.equal(doesTrackingEventRefreshEta({ eventType: "LOCATION_UPDATED" }), false);
  assert.equal(doesTrackingEventRefreshEta(null), false);
  assert.equal(shouldRevalidateTrackingEta({ eventType: "STOP_ARRIVED" }, false), true);
  assert.equal(shouldRevalidateTrackingEta({ eventType: "STOP_ARRIVED" }, true), false);
});

test("tracking progress keeps the current driver stage and completed stop ids", () => {
  const snapshot = normalizeRouteTrackingSnapshot({
    policy,
    progress: {
      completedStopIds: ["stop-1"],
      currentStage: "DRIVING",
      currentStopId: null,
      failedStopIds: [],
      latestEvent: null,
    },
    recentPositions: [
      {
        driverId: "other-driver",
        eventId: "wrong-driver-position",
        latitude: 37.6,
        longitude: 127.1,
        occurredAt: "2026-07-20T04:00:59.000Z",
        receivedAt: "2026-07-20T04:00:59.500Z",
      },
      {
        driverId: "driver-1",
        eventId: "position-1",
        latitude: 37.5,
        longitude: 127,
        occurredAt: "2026-07-20T04:00:58.000Z",
        receivedAt: "2026-07-20T04:00:59.000Z",
      },
    ],
  });
  const arrived = mergeRouteTrackingProgress(snapshot, {
    deliveryStopId: "stop-2",
    driverId: "driver-1",
    eventId: "progress-1",
    eventType: "STOP_ARRIVED",
    occurredAt: "2026-07-20T04:01:00.000Z",
    receivedAt: "2026-07-20T04:01:01.000Z",
    routePlanId: "route-1",
    schemaVersion: "route_tracking.v1",
  });
  const delivered = mergeRouteTrackingProgress(arrived, {
    deliveryStopId: "stop-2",
    driverId: "driver-1",
    eventId: "progress-2",
    eventType: "STOP_DELIVERED",
    occurredAt: "2026-07-20T04:03:00.000Z",
    receivedAt: "2026-07-20T04:03:01.000Z",
    routePlanId: "route-1",
    schemaVersion: "route_tracking.v1",
  });

  assert.equal(arrived.progress.currentStage, "AT_STOP");
  assert.equal(arrived.progress.currentStopId, "stop-2");
  assert.deepEqual(arrived.stopArrivals, [{
    deliveryStopId: "stop-2",
    driverId: "driver-1",
    eventId: "progress-1",
    latitude: 37.5,
    longitude: 127,
    occurredAt: "2026-07-20T04:01:00.000Z",
    positionAgeMs: 2_000,
    positionSource: "nearest_location",
    receivedAt: "2026-07-20T04:01:01.000Z",
    routePlanId: "route-1",
    schemaVersion: "route_tracking_arrival.v1",
    stopSequence: null,
  }]);
  assert.equal(delivered.progress.currentStage, "DRIVING");
  assert.equal(delivered.progress.currentStopId, null);
  assert.deepEqual(delivered.progress.completedStopIds, ["stop-1", "stop-2"]);
});

test("reconnect snapshots without latest events cannot regress newer live progress", () => {
  const liveSnapshot = normalizeRouteTrackingSnapshot({
    policy,
    progress: {
      completedStopIds: ["stop-live-earlier", "stop-durable-failed"],
      currentStage: "DRIVING",
      currentStopId: null,
      failedStopIds: ["stop-live-failed", "stop-durable-completed"],
      latestEvent: {
        deliveryStopId: "stop-live-delivered",
        driverId: "driver-1",
        eventId: "progress-live-delivered",
        eventType: "STOP_DELIVERED",
        occurredAt: "2026-07-20T04:05:00.000Z",
        receivedAt: "2026-07-20T04:05:01.000Z",
        routePlanId: "route-1",
      },
    },
    recentPositions: [],
    routePlanId: "route-1",
  });
  const reconnectSnapshot = {
    policy,
    progress: {
      completedStopIds: ["stop-durable-completed"],
      currentStage: "READY",
      currentStopId: null,
      failedStopIds: ["stop-durable-failed"],
      latestEvent: null,
    },
    recentPositions: [],
    routePlanId: "route-1",
    status: "NO_DATA",
  };

  const merged = mergeRouteTrackingSnapshot(liveSnapshot, reconnectSnapshot);

  assert.equal(merged.progress.currentStage, "DRIVING");
  assert.equal(merged.progress.latestEvent.eventId, "progress-live-delivered");
  assert.deepEqual(new Set(merged.progress.completedStopIds), new Set([
    "stop-durable-completed",
    "stop-live-delivered",
    "stop-live-earlier",
  ]));
  assert.deepEqual(new Set(merged.progress.failedStopIds), new Set([
    "stop-durable-failed",
    "stop-live-failed",
  ]));
});

test("tracking proxy forwards authentication and streams the upstream body without buffering", async () => {
  const abortController = new AbortController();
  const request = new Request("https://app.test/app/route-tracking/route-1", {
    headers: {
      authorization: "Bearer shopify-token",
      "x-clever-client-request-id": "tracking-stream-123",
    },
    signal: abortController.signal,
  });
  let upstreamRequest = null;
  const response = await proxyDeliveryRouteTrackingStream(request, "route-1", {
    appId: "clever-route-dev",
    baseUrl: "https://delivery.test",
    fetch: async (url, options) => {
      upstreamRequest = { url, options };
      return new Response("event: tracking_snapshot\ndata: {}\n\n", {
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      });
    },
  });

  assert.equal(upstreamRequest.url, "https://delivery.test/admin/route-plans/route-1/tracking/stream");
  assert.equal(upstreamRequest.options.headers.authorization, "Bearer shopify-token");
  assert.equal(upstreamRequest.options.headers["x-clever-app-id"], "clever-route-dev");
  assert.equal(upstreamRequest.options.headers["x-clever-client-request-id"], "tracking-stream-123");
  assert.equal(upstreamRequest.options.cache, "no-store");
  assert.equal(upstreamRequest.options.signal, request.signal);
  assert.equal(response.headers.get("cache-control"), "no-store, no-transform");
  assert.match(await response.text(), /tracking_snapshot/);
});

test("tracking proxy encodes route plan IDs before forwarding delivery API URLs", async () => {
  const request = new Request("https://app.test/app/route-tracking/route%201", {
    headers: { authorization: "Bearer shopify-token" },
  });
  const forwardedUrls = [];
  const fetch = async (url) => {
    forwardedUrls.push(url);
    return new Response("event: tracking_snapshot\ndata: {}\n\n", {
      headers: { "content-type": "text/event-stream; charset=utf-8" },
    });
  };

  await proxyDeliveryRouteTrackingStream(request, "route 1/branch", {
    appId: "clever-route-dev",
    baseUrl: "https://delivery.test",
    fetch,
  });
  await proxyDeliveryRouteTrackingSnapshot(request, "route 1/branch", {
    appId: "clever-route-dev",
    baseUrl: "https://delivery.test",
    fetch: async (url) => {
      forwardedUrls.push(url);
      return Response.json({ data: { recentPositions: [] }, error: null });
    },
  });

  assert.deepEqual(forwardedUrls, [
    "https://delivery.test/admin/route-plans/route%201%2Fbranch/tracking/stream",
    "https://delivery.test/admin/route-plans/route%201%2Fbranch/tracking",
  ]);
});

test("tracking proxy sends a safe generated client request ID when input is unsafe", async () => {
  const request = new Request("https://app.test/app/route-tracking/route-1?mode=snapshot", {
    headers: {
      authorization: "Bearer shopify-token",
      "x-clever-client-request-id": "unsafe/request id",
    },
  });
  let upstreamRequest = null;

  await proxyDeliveryRouteTrackingSnapshot(request, "route-1", {
    appId: "clever-route-dev",
    baseUrl: "https://delivery.test",
    correlationId: "also unsafe/request id",
    fetch: async (url, options) => {
      upstreamRequest = { url, options };
      return Response.json({ data: { recentPositions: [] }, error: null });
    },
  });

  const clientRequestId = upstreamRequest.options.headers["x-clever-client-request-id"];
  assert.match(clientRequestId, /^[A-Za-z0-9._:-]{1,120}$/u);
  assert.notEqual(clientRequestId, "unsafe/request id");
  assert.notEqual(clientRequestId, "also unsafe/request id");
});

test("tracking snapshot proxy reads historical positions without opening an SSE stream", async () => {
  const request = new Request("https://app.test/app/route-tracking/route-1?mode=snapshot", {
    headers: { authorization: "Bearer shopify-token" },
  });
  let upstreamRequest = null;
  const response = await proxyDeliveryRouteTrackingSnapshot(request, "route-1", {
    appId: "clever-route-dev",
    baseUrl: "https://delivery.test",
    fetch: async (url, options) => {
      upstreamRequest = { url, options };
      return Response.json({ data: { recentPositions: [] }, error: null });
    },
  });

  assert.equal(upstreamRequest.url, "https://delivery.test/admin/route-plans/route-1/tracking");
  assert.equal(upstreamRequest.options.headers.accept, "application/json");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { data: { recentPositions: [] }, error: null });
});
