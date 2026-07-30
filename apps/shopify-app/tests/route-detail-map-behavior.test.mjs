import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRouteDetailMarkerFeatureCollection,
  buildRouteStopPointLookup,
  getRouteDetailPopupPanOffset,
  getRouteDetailTrackingArrivalItems,
  getRouteTrackingArrivalListMaxHeight,
  syncRouteDetailLiveTracking,
  syncRouteDetailMapMarkerLayers,
  syncRouteDetailMapViewEmphasis,
  syncRouteDetailRouteLine,
  syncRouteDetailTrackingVisibility,
} from "../app/features/delivery/route-detail-map.js";

const TRACKING_LAYER_IDS = [
  "route-detail-live-tracking-trail",
  "route-detail-live-tracking-connector",
  "route-detail-tracking-arrival-circles",
  "route-detail-tracking-arrival-labels",
  "route-detail-live-driver-position",
];
const DRIVER_POSITION_LAYER_ID = "route-detail-live-driver-position";

function createFakeMap(options = {}) {
  const sources = new Map();
  const layers = new Map();
  const images = new Set(options.images ?? []);
  const calls = { addImage: [], addLayer: [], addSource: [], setLayoutProperty: [], setPaintProperty: [] };
  const map = {
    addImage(id) {
      calls.addImage.push(id);
      images.add(id);
    },
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
    hasImage(id) {
      return images.has(id);
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
    setPaintProperty(id, property, value) {
      calls.setPaintProperty.push([id, property, value]);
      const layer = layers.get(id);
      if (layer) layer.paint = { ...layer.paint, [property]: value };
    },
  };
  return { calls, layers, map, sources };
}

test("route marker sync skips canvas rasterization for pre-registered marker images", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement() {
      throw new Error("canvas should not be created for existing map images");
    },
  };

  try {
    const fake = createFakeMap({
      images: [
        "route-detail-departure-pin",
        "route-detail-stop-pin-006fbb-1",
        "route-detail-stop-pin-006fbb-2",
      ],
    });
    const didSync = syncRouteDetailMapMarkerLayers(
      fake.map,
      { coordinates: [126.92, 37.51], hasCoordinates: true },
      [
        {
          coordinates: [126.921, 37.511],
          deliveryStopId: "stop-1",
          hasCoordinates: true,
          id: "order-1",
          routeColor: "#006fbb",
          stop: 1,
        },
        {
          coordinates: [126.922, 37.512],
          deliveryStopId: "stop-2",
          hasCoordinates: true,
          id: "order-2",
          routeColor: "#006fbb",
          stop: 2,
        },
      ],
      [],
      "#006fbb",
      new Map(),
    );

    assert.equal(didSync, true);
    assert.deepEqual(fake.calls.addImage, []);
    assert.ok(fake.sources.has("route-detail-markers"));
  } finally {
    globalThis.document = previousDocument;
  }
});

test("route marker sync indexes snapped stop points once instead of linearly searching per stop", () => {
  const fake = createFakeMap({
    images: [
      "route-detail-stop-pin-006fbb-1",
      "route-detail-stop-pin-006fbb-2",
      "route-detail-stop-pin-006fbb-3",
    ],
  });
  let findCallCount = 0;
  const routeStopPoints = [
    { deliveryStopId: "stop-1", inputCoordinates: [126.921, 37.511] },
    { deliveryStopId: "stop-2", inputCoordinates: [126.922, 37.512] },
    { deliveryStopId: "stop-3", inputCoordinates: [126.923, 37.513] },
  ];
  routeStopPoints.find = () => {
    findCallCount += 1;
    throw new Error("route stop point lookup should not use Array.find during sync");
  };

  const didSync = syncRouteDetailMapMarkerLayers(
    fake.map,
    null,
    [
      { deliveryStopId: "stop-1", hasCoordinates: false, id: "order-1", routeColor: "#006fbb", stop: 1 },
      { deliveryStopId: "stop-2", hasCoordinates: false, id: "order-2", routeColor: "#006fbb", stop: 2 },
      { deliveryStopId: "stop-3", hasCoordinates: false, id: "order-3", routeColor: "#006fbb", stop: 3 },
    ],
    routeStopPoints,
    "#006fbb",
    new Map(),
  );

  assert.equal(didSync, true);
  assert.equal(findCallCount, 0);
  assert.equal(fake.sources.get("route-detail-markers").data.features.length, 3);
});

test("route marker sync preserves an existing stop point lookup through the marker source", () => {
  const fake = createFakeMap({
    images: ["route-detail-stop-pin-006fbb-1"],
  });
  const routeStopPoint = {
    deliveryStopId: "stop-1",
    inputCoordinates: [126.921, 37.511],
  };
  const routeStopPointLookup = new Map([["stop-1", routeStopPoint]]);

  assert.equal(buildRouteStopPointLookup(routeStopPointLookup), routeStopPointLookup);

  const didSync = syncRouteDetailMapMarkerLayers(
    fake.map,
    null,
    [{
      deliveryStopId: "stop-1",
      hasCoordinates: false,
      id: "order-1",
      routeColor: "#006fbb",
      stop: 1,
    }],
    routeStopPointLookup,
    "#006fbb",
    new Map(),
  );

  assert.equal(didSync, true);
  assert.deepEqual(
    fake.sources.get("route-detail-markers").data.features[0].geometry.coordinates,
    routeStopPoint.inputCoordinates,
  );
});

test("Stops and Tracking show the same completion check badges", () => {
  const fake = createFakeMap();
  fake.map.addLayer({ id: "route-detail-stop-markers", type: "symbol", paint: {} });
  fake.map.addLayer({ id: "route-detail-departure-marker", type: "symbol", paint: {} });
  fake.map.addLayer({ id: "route-detail-snapped-stop-points", type: "circle", paint: {} });
  fake.map.addLayer({ id: "route-detail-stop-completion-badges", type: "circle", layout: {} });
  fake.map.addLayer({ id: "route-detail-stop-completion-checks", type: "symbol", layout: {} });

  assert.equal(syncRouteDetailMapViewEmphasis(fake.map, true), true);
  assert.equal(fake.layers.get("route-detail-stop-markers").paint["icon-opacity"], 1);
  assert.equal(fake.layers.get("route-detail-departure-marker").paint["icon-opacity"], 1);
  assert.equal(fake.layers.get("route-detail-snapped-stop-points").paint["circle-opacity"], 1);
  assert.equal(fake.layers.get("route-detail-stop-completion-badges").layout.visibility, "visible");
  assert.equal(fake.layers.get("route-detail-stop-completion-checks").layout.visibility, "visible");

  assert.equal(syncRouteDetailMapViewEmphasis(fake.map, false), true);
  assert.equal(fake.layers.get("route-detail-stop-completion-badges").layout.visibility, "visible");
  assert.equal(fake.layers.get("route-detail-stop-completion-checks").layout.visibility, "visible");
});

test("tracking completion preserves the route marker and exposes the common check badge", () => {
  const markerData = buildRouteDetailMarkerFeatureCollection(null, [{
    coordinates: [126.927, 37.512],
    deliveryStopId: "stop-3",
    hasCoordinates: true,
    id: "order-3",
    isTrackingCompleted: true,
    routeColor: "#006fbb",
    status: "DELIVERED",
    stop: 3,
  }], [], "#e11900", new Map());

  assert.equal(markerData.features.length, 1);
  assert.equal(markerData.features[0].properties.isCompleted, true);
  assert.equal(markerData.features[0].properties.pinImage, "route-detail-stop-pin-006fbb-3");
});

test("persisted order delivery status does not impersonate a route-specific driver completion", () => {
  const markerData = buildRouteDetailMarkerFeatureCollection(null, [{
    coordinates: [126.927, 37.512],
    deliveryStopId: "stop-4",
    hasCoordinates: true,
    id: "order-4",
    isTrackingCompleted: false,
    routeColor: "#006fbb",
    status: "DELIVERED",
    stop: 4,
  }], [], "#e11900", new Map());

  assert.equal(markerData.features.length, 1);
  assert.equal(markerData.features[0].properties.isCompleted, false);
  assert.equal(markerData.features[0].properties.pinImage, "route-detail-stop-pin-006fbb-4");
});

test("Shopify fulfillment does not mark a Ready delivery stop as completed", () => {
  const markerData = buildRouteDetailMarkerFeatureCollection(null, [{
    coordinates: [126.927, 37.512],
    deliveryStatus: "READY",
    deliveryStopId: "stop-5",
    fulfillmentStatus: "FULFILLED",
    hasCoordinates: true,
    id: "order-5",
    isTrackingCompleted: false,
    routeColor: "#006fbb",
    status: "READY",
    stop: 5,
  }], [], "#e11900", new Map());

  assert.equal(markerData.features.length, 1);
  assert.equal(markerData.features[0].properties.isCompleted, false);
  assert.equal(markerData.features[0].properties.pinImage, "route-detail-stop-pin-006fbb-5");
});

test("Tracking planned route remains a solid, visible reference under dashed GPS", () => {
  const fake = createFakeMap();
  const routeGeometry = {
    coordinates: [[126.92, 37.51], [126.93, 37.52]],
    type: "LineString",
  };

  assert.equal(syncRouteDetailRouteLine(fake.map, routeGeometry, "#006fbb", { isTrackingReference: true }), true);
  const routeLayer = fake.layers.get("route-detail-osrm-route-line");
  assert.equal(routeLayer.paint["line-opacity"], 0.42);
  assert.equal(routeLayer.paint["line-width"], 3.5);
  assert.equal(routeLayer.paint["line-dasharray"], undefined);
});

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

test("tracking layers reuse their sources while current driver position stays exclusive to Tracking", () => {
  const fake = createFakeMap();
  const snapshot = {
    latestPosition: {
      driverId: "driver-1",
      eventId: "location-1",
      latitude: 37.512,
      longitude: 126.927,
      occurredAt: "2026-07-30T14:50:41.719Z",
      receivedAt: "2026-07-30T14:50:42.000Z",
      routePlanId: "route-1",
    },
  };

  assert.equal(syncRouteDetailLiveTracking(fake.map, snapshot, []), true);
  assert.deepEqual(fake.calls.addSource, [
    "route-detail-live-tracking",
    "route-detail-tracking-arrivals",
  ]);
  assert.deepEqual(fake.calls.addLayer, TRACKING_LAYER_IDS);
  assert.deepEqual(
    fake.sources.get("route-detail-live-tracking").data.features.find(
      (feature) => feature.properties.trackingType === "currentPosition",
    ),
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [126.927, 37.512] },
      properties: {
        driverId: "driver-1",
        occurredAt: "2026-07-30T14:50:41.719Z",
        receivedAt: "2026-07-30T14:50:42.000Z",
        trackingType: "currentPosition",
      },
    },
  );
  assert.deepEqual(
    TRACKING_LAYER_IDS.map((id) => fake.layers.get(id)?.layout?.visibility),
    ["visible", "visible", "visible", "visible", "visible"],
  );
  assert.equal(fake.layers.get(DRIVER_POSITION_LAYER_ID)?.paint?.["circle-color"], "#d82c0d");
  assert.equal(fake.layers.get(DRIVER_POSITION_LAYER_ID)?.layout?.visibility, "visible");

  assert.equal(syncRouteDetailTrackingVisibility(fake.map, false), true);
  assert.deepEqual(
    TRACKING_LAYER_IDS.map((id) => fake.layers.get(id)?.layout?.visibility),
    ["none", "none", "none", "none", "none"],
  );
  assert.equal(fake.layers.get(DRIVER_POSITION_LAYER_ID)?.layout?.visibility, "none");

  assert.equal(syncRouteDetailLiveTracking(fake.map, snapshot, []), true);
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
