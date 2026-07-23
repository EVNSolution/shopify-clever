import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeRouteTrackingSseChunk,
  doesTrackingEventRefreshEta,
  getRouteExecutionStatusFromTrackingEvent,
  getRouteTrackingLineFeatures,
  getRouteTrackingPathPoints,
  getRouteTrackingPathSummary,
  getRouteTrackingFreshness,
  getRouteTrackingFitCoordinates,
  getRouteTrackingPresentation,
  getRouteTrackingStreamInactivityMs,
  isRouteTrackingPayloadForRoute,
  mergeRouteTrackingProgress,
  mergeRouteTrackingPosition,
  mergeRouteTrackingSnapshot,
  normalizeRouteExecutionStatus,
  normalizeRouteTrackingSnapshot,
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

test("road-matched tracking removes loop-shaped uncertain geometry and impossible live tail jumps", () => {
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

  assert.deepEqual(features.map((feature) => feature.properties.trackingType), ["trackingTrail"]);
  assert.deepEqual(getRouteTrackingFitCoordinates(snapshot), [[127, 37.5], [127.0002, 37.5002]]);
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
  assert.deepEqual(features[0].geometry.coordinates, [[
    [127, 37.5],
    [127.001, 37.501],
    [127.002, 37.502],
  ]]);
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

test("only server ETA lifecycle events refresh route detail ETAs", () => {
  assert.equal(doesTrackingEventRefreshEta({ eventType: "ROUTE_STARTED" }), true);
  assert.equal(doesTrackingEventRefreshEta({ eventType: "STOP_ARRIVED" }), true);
  assert.equal(doesTrackingEventRefreshEta({ eventType: "STOP_DELIVERED" }), false);
  assert.equal(doesTrackingEventRefreshEta({ eventType: "LOCATION_UPDATED" }), false);
  assert.equal(doesTrackingEventRefreshEta(null), false);
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
    headers: { authorization: "Bearer shopify-token" },
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
  assert.equal(upstreamRequest.options.cache, "no-store");
  assert.equal(upstreamRequest.options.signal, request.signal);
  assert.equal(response.headers.get("cache-control"), "no-store, no-transform");
  assert.match(await response.text(), /tracking_snapshot/);
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
