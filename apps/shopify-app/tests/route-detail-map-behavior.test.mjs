import assert from "node:assert/strict";
import test from "node:test";

import {
  getRouteDetailPopupPanOffset,
  getRouteDetailTrackingArrivalItems,
  getRouteTrackingArrivalListMaxHeight,
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

test("arrival popup sizing stays inside the visible tracking map viewport", () => {
  assert.equal(getRouteTrackingArrivalListMaxHeight(520), 260);
  assert.equal(getRouteTrackingArrivalListMaxHeight(240), 138);
  assert.equal(getRouteTrackingArrivalListMaxHeight(180), 78);
});

test("arrival popup pan correction uses only the overflow outside the visible frame", () => {
  const frameRect = { bottom: 520, left: 0, right: 800, top: 0 };

  assert.deepEqual(
    getRouteDetailPopupPanOffset(frameRect, { bottom: 480, left: 200, right: 434, top: 180 }),
    [0, 0],
  );
  assert.deepEqual(
    getRouteDetailPopupPanOffset(frameRect, { bottom: 558, left: 200, right: 434, top: 258 }),
    [0, 50],
  );
  assert.deepEqual(
    getRouteDetailPopupPanOffset(frameRect, { bottom: 260, left: -24, right: 210, top: -18 }),
    [-36, -30],
  );
});

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

test("arrival markers keep one marker for repeated Arrived events at the same stop", () => {
  const fake = createFakeMap();
  const routeStops = [{
    address: "서울특별시 영등포구 노들로",
    coordinates: [126.929, 37.515],
    deliveryStopId: "stop-8",
    hasCoordinates: true,
    stop: 8,
  }];

  syncRouteDetailLiveTracking(fake.map, {
    stopArrivals: [
      {
        deliveryStopId: "stop-8",
        eventId: "arrival-first",
        latitude: 37.515,
        longitude: 126.929,
        occurredAt: "2026-07-22T01:00:00.000Z",
        positionSource: "event",
      },
      {
        deliveryStopId: "stop-8",
        eventId: "arrival-repeated",
        latitude: 37.51501,
        longitude: 126.92901,
        occurredAt: "2026-07-22T01:01:00.000Z",
        positionSource: "event",
      },
    ],
  }, routeStops);

  const arrivalFeatures = fake.sources.get("route-detail-tracking-arrivals").data.features;
  assert.equal(arrivalFeatures.length, 1);
  assert.deepEqual(arrivalFeatures[0].geometry.coordinates, [126.929, 37.515]);
  assert.equal(arrivalFeatures[0].properties.displayLabel, "8");
  assert.equal(arrivalFeatures[0].properties.arrivalStopCount, 1);
  assert.equal(arrivalFeatures[0].properties.arrivalEventCount, 2);
  assert.deepEqual(getRouteDetailTrackingArrivalItems(arrivalFeatures[0]), [{
    occurredAt: "2026-07-22T01:00:00.000Z",
    stopNumber: 8,
  }]);
});

test("arrival markers collapse colocated stops into one natural cluster with popup details", () => {
  const fake = createFakeMap();
  const routeStops = [
    {
      address: "서울특별시 영등포구 노들로",
      coordinates: [126.929, 37.515],
      deliveryStopId: "stop-3",
      hasCoordinates: true,
      stop: 3,
    },
    {
      address: "서울특별시 영등포구 노들로",
      coordinates: [126.929, 37.515],
      deliveryStopId: "stop-8",
      hasCoordinates: true,
      stop: 8,
    },
  ];

  syncRouteDetailLiveTracking(fake.map, {
    stopArrivals: [
      {
        deliveryStopId: "stop-8",
        eventId: "arrival-8",
        latitude: 37.51502,
        longitude: 126.92902,
        occurredAt: "2026-07-22T01:08:00.000Z",
        positionSource: "event",
      },
      {
        deliveryStopId: "stop-3",
        eventId: "arrival-3",
        latitude: 37.515,
        longitude: 126.929,
        occurredAt: "2026-07-22T01:03:00.000Z",
        positionSource: "event",
      },
    ],
  }, routeStops);

  const arrivalFeatures = fake.sources.get("route-detail-tracking-arrivals").data.features;
  assert.equal(arrivalFeatures.length, 1);
  assert.deepEqual(arrivalFeatures[0].geometry.coordinates, [126.929, 37.515]);
  assert.equal(arrivalFeatures[0].properties.displayLabel, "2");
  assert.equal(arrivalFeatures[0].properties.arrivalStopCount, 2);
  assert.equal(arrivalFeatures[0].properties.arrivalStopNumbers, "3, 8");
  assert.deepEqual(getRouteDetailTrackingArrivalItems(arrivalFeatures[0]), [
    { occurredAt: "2026-07-22T01:03:00.000Z", stopNumber: 3 },
    { occurredAt: "2026-07-22T01:08:00.000Z", stopNumber: 8 },
  ]);

  const labelLayout = fake.layers.get("route-detail-tracking-arrival-labels").layout;
  assert.deepEqual(labelLayout["text-field"], ["get", "displayLabel"]);
  assert.equal(labelLayout["icon-image"], undefined);
  assert.equal(labelLayout["icon-offset"], undefined);
  assert.equal(labelLayout["text-offset"], undefined);
});

test("arrival markers keep distinct GPS locations separate", () => {
  const fake = createFakeMap();

  syncRouteDetailLiveTracking(fake.map, {
    stopArrivals: [
      {
        deliveryStopId: "stop-3",
        eventId: "arrival-3",
        latitude: 37.515,
        longitude: 126.929,
        occurredAt: "2026-07-22T01:03:00.000Z",
        positionSource: "event",
        stopSequence: 3,
      },
      {
        deliveryStopId: "stop-8",
        eventId: "arrival-8",
        latitude: 37.516,
        longitude: 126.93,
        occurredAt: "2026-07-22T01:08:00.000Z",
        positionSource: "event",
        stopSequence: 8,
      },
    ],
  }, []);

  const arrivalFeatures = fake.sources.get("route-detail-tracking-arrivals").data.features;
  assert.equal(arrivalFeatures.length, 2);
  assert.deepEqual(arrivalFeatures.map((feature) => feature.properties.displayLabel), ["3", "8"]);
  assert.deepEqual(arrivalFeatures.map((feature) => feature.properties.arrivalStopCount), [1, 1]);
});

test("arrival marker groups do not chain locations beyond the collision distance", () => {
  const fake = createFakeMap();

  syncRouteDetailLiveTracking(fake.map, {
    stopArrivals: [
      {
        deliveryStopId: "stop-1",
        eventId: "arrival-1",
        latitude: 37.515,
        longitude: 126.929,
        occurredAt: "2026-07-22T01:01:00.000Z",
        positionSource: "event",
        stopSequence: 1,
      },
      {
        deliveryStopId: "stop-2",
        eventId: "arrival-2",
        latitude: 37.51509,
        longitude: 126.929,
        occurredAt: "2026-07-22T01:02:00.000Z",
        positionSource: "event",
        stopSequence: 2,
      },
      {
        deliveryStopId: "stop-3",
        eventId: "arrival-3",
        latitude: 37.51518,
        longitude: 126.929,
        occurredAt: "2026-07-22T01:03:00.000Z",
        positionSource: "event",
        stopSequence: 3,
      },
    ],
  }, []);

  const arrivalFeatures = fake.sources.get("route-detail-tracking-arrivals").data.features;
  assert.equal(arrivalFeatures.length, 2);
  assert.deepEqual(arrivalFeatures.map((feature) => feature.properties.displayLabel), ["2", "3"]);
  assert.deepEqual(arrivalFeatures.map((feature) => feature.properties.arrivalStopNumbers), ["1, 2", "3"]);
});

test("arrival popup details reject malformed feature properties", () => {
  assert.deepEqual(getRouteDetailTrackingArrivalItems({ properties: { arrivalDetailsJson: "{" } }), []);
  assert.deepEqual(getRouteDetailTrackingArrivalItems({
    properties: {
      arrivalDetailsJson: JSON.stringify([
        { occurredAt: "2026-07-22T01:00:00.000Z", stopNumber: 1 },
        { occurredAt: null, stopNumber: 0 },
      ]),
    },
  }), [{ occurredAt: "2026-07-22T01:00:00.000Z", stopNumber: 1 }]);
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
