/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCustomStopAddress,
  buildCustomStopPayload,
  createCustomStopDraft,
} from "../app/features/delivery/custom-stop-form.js";
import { createDeliveryRouteGroupCustomStop } from "../app/features/delivery/route-groups.server.js";
import {
  buildRouteDetailMarkerFeatureCollection,
  normalizeLngLat,
} from "../app/features/delivery/route-detail-map.js";
import { normalizeRouteStopLocationDiagnostic } from "../app/features/delivery/route-stop-location-diagnostic.js";

process.env.CLEVER_DELIVERY_API_URL = "https://delivery.test/";
process.env.CLEVER_APP_ID = "clever-route-dev";
process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "0";

function makeRequest() {
  return new Request("https://admin.shopify.test/app/routes?id_token=query-token");
}

function makeServerResponse(stop) {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ init, url });
    return {
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          routeGroup: { assignments: [stop], children: [], id: "group/1" },
        },
        error: null,
      }),
    };
  };
  fakeFetch.calls = calls;
  return fakeFetch;
}

test("custom stop address preserves server geocode coordinates through the web API and map pin", async () => {
  // Representative fixture: these coordinates stand in for a successful server geocoder result.
  // This test does not call a geocoding provider or prove a result for a live address.
  const draft = createCustomStopDraft({
    address1: "123 Queen St W",
    address2: "Loading dock 2",
    city: "Toronto",
    countryCode: "CA",
    postalCode: "M5H 2N2",
    province: "ON",
    recipientName: "Receiving desk",
  });
  const requestPayload = buildCustomStopPayload(draft, {
    expectedUpdatedAt: "2026-09-09T00:00:00.000Z",
    targetRoutePlanId: "route/1",
  });
  const serverStop = {
    ...requestPayload,
    deliveryStopId: "custom-stop/1",
    geocodeStatus: "RESOLVED",
    isCustomStop: true,
    latitude: 43.65011,
    longitude: -79.38391,
    sourcePlatform: "CUSTOM",
  };
  const fakeFetch = makeServerResponse(serverStop);

  const result = await createDeliveryRouteGroupCustomStop(
    makeRequest(),
    "group/1",
    requestPayload,
    { fetch: fakeFetch, sessionToken: "session-token" },
  );

  const submittedPayload = JSON.parse(fakeFetch.calls[0].init.body);
  assert.equal(fakeFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1/stops/custom");
  assert.equal(fakeFetch.calls[0].init.method, "POST");
  assert.equal("latitude" in submittedPayload, false, "the web must leave geocoding to the server");
  assert.equal("longitude" in submittedPayload, false, "the web must leave geocoding to the server");
  assert.equal(buildCustomStopAddress(submittedPayload), buildCustomStopAddress(serverStop));
  const returnedStop = result.routeGroup.assignments[0];
  assert.deepEqual(returnedStop, serverStop);

  const diagnostic = normalizeRouteStopLocationDiagnostic(returnedStop);
  const webCoordinates = normalizeLngLat(returnedStop.latitude, returnedStop.longitude);
  assert.deepEqual(diagnostic, { issues: [], routeable: true, severity: "NONE" });
  assert.deepEqual(webCoordinates, [-79.38391, 43.65011]);
  assert.notDeepEqual(webCoordinates, [43.65011, -79.38391], "latitude and longitude must not be swapped");

  const markerCollection = buildRouteDetailMarkerFeatureCollection(
    null,
    [{
      ...returnedStop,
      coordinates: webCoordinates,
      hasCoordinates: diagnostic.routeable,
      id: returnedStop.deliveryStopId,
      stop: 1,
    }],
    [],
    "#006fbb",
    new Map(),
  );
  assert.equal(markerCollection.features.length, 1);
  assert.deepEqual(markerCollection.features[0].geometry.coordinates, [-79.38391, 43.65011]);


});

test("zero server coordinates cannot produce a web pin", () => {
  const contaminatedStop = {
    address1: "123 Queen St W",
    city: "Toronto",
    countryCode: "CA",
    deliveryStopId: "custom-stop/zero",
    geocodeStatus: "RESOLVED",
    latitude: 0,
    longitude: 0,
    postalCode: "M5H 2N2",
    province: "ON",
  };
  const diagnostic = normalizeRouteStopLocationDiagnostic(contaminatedStop);
  const webCoordinates = normalizeLngLat(contaminatedStop.latitude, contaminatedStop.longitude);

  assert.equal(webCoordinates, null);
  assert.equal(diagnostic.routeable, false);
  assert.ok(diagnostic.issues.includes("COORDINATES_ZERO"));

  const markerCollection = buildRouteDetailMarkerFeatureCollection(
    null,
    [{
      ...contaminatedStop,
      coordinates: webCoordinates,
      hasCoordinates: diagnostic.routeable,
      id: contaminatedStop.deliveryStopId,
      stop: 1,
    }],
    [],
    "#006fbb",
    new Map(),
  );
  assert.deepEqual(markerCollection.features, []);

  assert.equal(buildCustomStopAddress(contaminatedStop), "123 Queen St W, Toronto, ON, M5H 2N2, CA");
});
