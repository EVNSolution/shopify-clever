import assert from "node:assert/strict";
import test from "node:test";

import {
  syncRouteDetailLiveTracking,
  syncRouteDetailRouteLine,
  syncRouteDetailTrackingVisibility,
} from "../app/features/delivery/route-detail-map.js";

const TRACKING_LAYER_IDS = [
  "route-detail-live-tracking-trail",
  "route-detail-live-tracking-connector",
  "route-detail-tracking-arrival-circles",
  "route-detail-tracking-arrival-labels",
];

function createFakeMap() {
  const sources = new Map();
  const layers = new Map();
  const calls = { addLayer: [], addSource: [], setLayoutProperty: [] };
  const map = {
    addLayer(layer) {
      calls.addLayer.push(layer.id);
      layers.set(layer.id, structuredClone(layer));
    },
    addSource(id, source) {
      calls.addSource.push(id);
      sources.set(id, {
        data: structuredClone(source.data),
        setData(data) {
          this.data = structuredClone(data);
        },
      });
    },
    getLayer(id) {
      return layers.get(id);
    },
    getSource(id) {
      return sources.get(id);
    },
    getStyle() {
      return {};
    },
    setLayoutProperty(id, property, value) {
      calls.setLayoutProperty.push([id, property, value]);
      const layer = layers.get(id);
      if (layer) layer.layout = { ...layer.layout, [property]: value };
    },
    setPaintProperty() {},
  };
  return { calls, layers, map, sources };
}

test("tracking layers reuse their sources and toggle together between tabs", () => {
  const fake = createFakeMap();

  assert.equal(syncRouteDetailLiveTracking(fake.map, null, []), true);
  assert.deepEqual(fake.calls.addSource, [
    "route-detail-live-tracking",
    "route-detail-tracking-arrivals",
  ]);
  assert.deepEqual(fake.calls.addLayer, TRACKING_LAYER_IDS);
  assert.deepEqual(
    TRACKING_LAYER_IDS.map((id) => fake.layers.get(id)?.layout?.visibility),
    ["visible", "visible", "visible", "visible"],
  );

  assert.equal(syncRouteDetailTrackingVisibility(fake.map, false), true);
  assert.deepEqual(
    TRACKING_LAYER_IDS.map((id) => fake.layers.get(id)?.layout?.visibility),
    ["none", "none", "none", "none"],
  );

  assert.equal(syncRouteDetailLiveTracking(fake.map, null, []), true);
  assert.deepEqual(fake.calls.addSource, [
    "route-detail-live-tracking",
    "route-detail-tracking-arrivals",
  ]);
  assert.deepEqual(fake.calls.addLayer, TRACKING_LAYER_IDS);
});

test("planned route sync recreates a missing layer when its source still exists", () => {
  const fake = createFakeMap();
  fake.sources.set("route-detail-osrm-route", {
    setData(data) {
      this.data = structuredClone(data);
    },
  });

  const didSync = syncRouteDetailRouteLine(fake.map, {
    type: "LineString",
    coordinates: [[127, 37.5], [127.01, 37.51]],
  }, "#0b84d8", { isTrackingReference: true });

  assert.equal(didSync, true);
  assert.ok(fake.layers.has("route-detail-osrm-route-line"));
});
