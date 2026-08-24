/* eslint-env node */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { mapRouteOperationalState, mapSettingsOperationalHealth } from "../app/features/delivery/operational-state.js";

const kitchenerState = {
  activeAlerts: [{ id: "alert-1", severity: "WARNING", type: "SYNC_BLOCKED" }],
  deviceProgress: { completedStopCount: 11, currentStopSequence: 11, locallyFinished: true, totalStopCount: 11 },
  physicalPosition: { freshness: "FRESH", nearestStopSequence: 11, reliableForProximity: true, withinProximityThreshold: true },
  routeStatus: "IN_PROGRESS",
  serverProgress: { resolvedStopCount: 1, totalStopCount: 11 },
  syncHealth: { state: "BLOCKED" },
};

test("Kitchener evidence stays separated into independently sourced pills", () => {
  const result = mapRouteOperationalState({ operationalState: kitchenerState });
  assert.deepEqual(result.pills.map((item) => item.label), [
    "Route in progress",
    "GPS fresh",
    "GPS Stop 11 nearby",
    "Device 11/11",
    "Server 1/11",
    "Sync blocked",
    "Gap 10 stops",
    "Alert warning",
  ]);
  assert.ok(result.pills.every((item) => item.ariaLabel && !/[·•]/u.test(item.label)));
});

test("stale low-confidence GPS never implies a nearby stop", () => {
  const result = mapRouteOperationalState({
    operationalState: {
      physicalPosition: { freshness: "STALE", nearestStopSequence: 11, reliableForProximity: false, withinProximityThreshold: true },
      routeStatus: "IN_PROGRESS",
    },
  });
  assert.equal(result.gpsFreshness.label, "GPS stale");
  assert.equal(result.gpsPosition.label, "GPS position uncertain");
  assert.doesNotMatch(result.gpsPosition.label, /nearby/i);
});

test("missing heartbeat fields stay explicit and never infer device state from GPS", () => {
  const result = mapRouteOperationalState({ operationalState: { physicalPosition: kitchenerState.physicalPosition } });
  assert.equal(result.device.label, "Device unknown");
  assert.equal(result.sync.label, "Sync unknown");
  assert.equal(result.gap.label, "Gap unknown");
});

test("null progress counts remain unknown rather than becoming zero", () => {
  const result = mapRouteOperationalState({
    operationalState: {
      deviceProgress: { completedStopCount: null, totalStopCount: null },
      serverProgress: { resolvedStopCount: null, totalStopCount: null },
    },
  });
  assert.equal(result.device.label, "Device unknown");
  assert.equal(result.server.label, "Server unknown");
  assert.equal(result.gap.label, "Gap unknown");
});

test("completed routes with unresolved server results remain visibly critical", () => {
  const result = mapRouteOperationalState({
    operationalState: {
      activeAlerts: [],
      routeStatus: "COMPLETED",
      serverProgress: { resolvedStopCount: 1, totalStopCount: 11 },
    },
  });
  assert.equal(result.lifecycle.label, "Route completed");
  assert.equal(result.server.label, "Server 1/11");
  assert.equal(result.alert.label, "Alert unresolved results");
  assert.equal(result.alert.tone, "critical");
});

test("list and detail consume the same pure mapper and shared InfoPill component", () => {
  const routesSource = fs.readFileSync(new URL("../app/routes/app.routes.jsx", import.meta.url), "utf8");
  const detailSource = fs.readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  const groupSource = fs.readFileSync(new URL("../app/ui/operational-pill-group.jsx", import.meta.url), "utf8");
  assert.match(routesSource, /mapRouteOperationalState/);
  assert.match(detailSource, /mapRouteOperationalState/);
  assert.match(groupSource, /<InfoPill ariaLabel=/);
  assert.doesNotMatch(groupSource, /tabIndex|onKeyDown|onClick/);
});

test("settings health includes every operational dependency and marks absent evidence unknown", () => {
  const result = mapSettingsOperationalHealth({ shopifyToken: { status: "healthy" } });
  assert.deepEqual(result.map((item) => item.key), [
    "webhookIngest", "webhookConsumer", "emailSender", "emailOutbox", "syncDetector",
    "trackingStream", "alertStream", "externalLogSink", "shopifyToken",
  ]);
  assert.equal(result.find((item) => item.key === "shopifyToken")?.label, "Shopify token healthy");
  assert.ok(result.filter((item) => item.key !== "shopifyToken").every((item) => item.label.endsWith(" unknown")));
});

test("operational UI source does not concatenate middle-dot or bullet summaries", () => {
  const sources = [
    "../app/features/delivery/operational-state.js",
    "../app/ui/operational-pill-group.jsx",
    "../app/routes/app.routes.jsx",
    "../app/routes/app.routes.$routeId.jsx",
    "../app/routes/app.settings.jsx",
  ].map((relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
  assert.ok(sources.every((source) => !/Operational[^\n]*(?:·|•)/u.test(source)));
});
