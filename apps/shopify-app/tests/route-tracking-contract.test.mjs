import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeRouteTrackingSseChunk,
  doesTrackingEventRefreshEta,
  getRouteExecutionStatusFromTrackingEvent,
  getRouteTrackingFreshness,
  getRouteTrackingPresentation,
  mergeRouteTrackingProgress,
  mergeRouteTrackingPosition,
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
  assert.equal(duplicate.recentPositions.length, 2);
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
  assert.equal(delivered.progress.currentStage, "DRIVING");
  assert.equal(delivered.progress.currentStopId, null);
  assert.deepEqual(delivered.progress.completedStopIds, ["stop-1", "stop-2"]);
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
