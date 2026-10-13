/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRouteDetailLiveTrackingData, syncRouteDetailLiveTracking, syncRouteDetailTrackingVisibility } from "../app/features/delivery/route-detail-map.js";
import { removeOriginalObservationPoints, syncOriginalObservationPoints } from "../app/features/delivery/route-original-observations-map.js";
import { ORIGINAL_OBSERVATION_SOURCE_ID } from "../app/features/delivery/route-original-observations.js";
import { observation } from "./fixtures/original-observations.mjs";

const TORONTO = "America/Toronto";
// 10:12:49 in Toronto (EDT, UTC-4).
const START = { eventId: "start-1", latitude: 43.71, longitude: -79.41, occurredAt: "2026-10-10T14:12:49.000Z", receivedAt: "2026-10-10T14:12:50.000Z" };

function sample(index, occurredAt) {
  return { eventId: `gps-${index}`, occurredAt, receivedAt: occurredAt };
}
function snapshot(start) {
  return {
    executionEvidence: start === undefined ? undefined : { start },
    recordedPath: {
      geometry: { type: "LineString", coordinates: [[-79.5, 43.6], [-79.45, 43.65], [-79.4, 43.7]] },
      samples: [sample(1, "2026-10-10T14:00:00.000Z"), sample(2, "2026-10-10T14:13:00.000Z"), sample(3, "2026-10-10T14:20:00.000Z")],
    },
  };
}
const startFeatures = data => data.features.filter(feature => feature.properties.trackingType === "routeStart");

function mapFixture() {
  const layers = new Map();
  const sources = new Map();
  const order = [];
  return {
    layers, sources, order,
    getStyle: () => ({ layers: [] }),
    getLayer: id => layers.get(id),
    getSource: id => sources.get(id),
    addSource(id, source) { sources.set(id, { ...source, setData(data) { this.data = data; } }); },
    addLayer(layer) { layers.set(layer.id, layer); order.push(layer.id); },
    removeLayer: id => layers.delete(id),
    removeSource: id => sources.delete(id),
    setLayoutProperty(id, key, value) { const layer = layers.get(id); layer.layout ??= {}; layer.layout[key] = value; },
    moveLayer(id, beforeId) { order.splice(order.indexOf(id), 1); order.splice(beforeId ? order.indexOf(beforeId) : order.length, 0, id); },
  };
}

test("dotted view: the Start press is one green point at the start coordinates with its local time", () => {
  const features = startFeatures(buildRouteDetailLiveTrackingData(snapshot(START), TORONTO));
  assert.equal(features.length, 1);
  assert.deepEqual(features[0].geometry.coordinates, [-79.41, 43.71]);
  assert.equal(features[0].properties.label, "Start 10:12");
});

test("dotted view: a Start without coordinates sits on the first recorded sample at or after the press", () => {
  const features = startFeatures(buildRouteDetailLiveTrackingData(snapshot({ ...START, latitude: null, longitude: null }), TORONTO));
  assert.deepEqual(features[0].geometry.coordinates, [-79.45, 43.65], "14:00 is before Start, 14:13 is the first one after");
  assert.equal(startFeatures(buildRouteDetailLiveTrackingData(snapshot({ ...START, latitude: null, longitude: null, occurredAt: "2026-10-10T15:00:00.000Z" }), TORONTO)).length, 0, "no sample after Start");
  assert.equal(startFeatures(buildRouteDetailLiveTrackingData(snapshot(undefined), TORONTO)).length, 0, "no Start event");
  assert.equal(startFeatures(buildRouteDetailLiveTrackingData(snapshot(null), TORONTO)).length, 0, "no Start event");
});

test("dotted view: the Start layers sit on top and follow the Tracking tab visibility", () => {
  const map = mapFixture();
  syncRouteDetailLiveTracking(map, snapshot(START), TORONTO);
  const circle = map.getLayer("route-detail-live-tracking-start");
  const label = map.getLayer("route-detail-live-tracking-start-label");
  assert.equal(circle.paint["circle-color"], "#1a7f37");
  assert.equal(circle.paint["circle-stroke-color"], "#ffffff");
  assert.equal(label.layout["text-field"][1], "label");
  assert.deepEqual(map.order.slice(-2), ["route-detail-live-tracking-start", "route-detail-live-tracking-start-label"]);
  syncRouteDetailTrackingVisibility(map, false);
  assert.equal(circle.layout.visibility, "none");
  assert.equal(label.layout.visibility, "none");
});

test("raw view: points before Start are grey, after Start red, and the Start point is drawn on top", () => {
  const map = mapFixture();
  const observations = [
    observation(1, { observedAt: "2026-10-10T14:00:00.000000Z", latitude: 43.6, longitude: -79.5 }),
    observation(2, { observedAt: "2026-10-10T14:12:00.000000Z", coordinateStatus: "MISSING", latitude: null, longitude: null }),
    observation(3, { observedAt: "2026-10-10T14:13:00.000000Z", latitude: 43.65, longitude: -79.45 }),
  ];
  syncOriginalObservationPoints(map, observations, { ...START, latitude: null, longitude: null }, TORONTO);
  const features = map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID).data.features;
  assert.deepEqual(features.filter(feature => feature.properties.eventId).map(feature => feature.properties.beforeStart), [true, false]);
  const [start] = startFeatures({ features });
  assert.deepEqual(start.geometry.coordinates, [-79.45, 43.65]);
  assert.equal(start.properties.label, "Start 10:12");
  const points = map.getLayer("route-detail-original-observation-points");
  assert.deepEqual(points.filter, ["has", "eventId"]);
  assert.deepEqual(points.paint["circle-color"], ["case", ["==", ["get", "beforeStart"], true], "#8c9196", "#d32f2f"]);
  assert.equal(map.getLayer("route-detail-original-observation-start").paint["circle-color"], "#1a7f37");
  assert.deepEqual(map.order.slice(-2), ["route-detail-original-observation-start", "route-detail-original-observation-start-label"]);
  removeOriginalObservationPoints(map);
  assert.equal(map.getLayer("route-detail-original-observation-start"), undefined);
  assert.equal(map.getLayer("route-detail-original-observation-start-label"), undefined);
});

test("raw view: without a Start event every point is before Start (grey) and no Start point is drawn", () => {
  for (const start of [null, undefined, { ...START, occurredAt: null }]) {
    const map = mapFixture();
    syncOriginalObservationPoints(map, [observation(1), observation(2)], start, TORONTO);
    const features = map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID).data.features;
    assert.equal(features.filter(feature => feature.properties.eventId).length, 2);
    assert.ok(features.filter(feature => feature.properties.eventId).every(feature => feature.properties.beforeStart === true));
  }
  const map = mapFixture();
  syncOriginalObservationPoints(map, [observation(1)], null, TORONTO);
  assert.equal(startFeatures(map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID).data).length, 0);
});

test("raw panel: gets the Start from the page and shows the one-line legend", () => {
  const component = readFileSync(new URL("../app/features/delivery/route-original-gps-points.jsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  assert.match(page, /<RouteOriginalGpsPoints[\s\S]*?start=\{routeExecutionEvidence\?\.start \?\? null\}/);
  assert.match(page, /syncRouteDetailLiveTracking\(routeMapRef\.current, displayedRouteTrackingSnapshot, ianaTimezone\)/);
  assert.match(component, /syncOriginalObservationPoints\(map, observationsRef\.current, startRef\.current, timeZone\)/);
  assert.match(component, /<p aria-label="Original GPS legend"/, "the legend is always shown");
  assert.match(component, /before Start[\s\S]*after Start[\s\S]*\{startedAt \? <>[\s\S]*Start pressed \{startedAt\}<\/> : 'Start not pressed yet'\}/);
});
