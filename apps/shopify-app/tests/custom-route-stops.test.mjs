/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  createDeliveryRouteGroupCustomStop,
  deleteDeliveryRouteGroupCustomStop,
  updateDeliveryRouteGroupCustomStop,
} from "../app/features/delivery/route-groups.server.js";
import {
  buildCustomStopAddress,
  buildCustomStopPayload,
  createCustomStopDraft,
  validateCustomStopDraft,
} from "../app/features/delivery/custom-stop-form.js";

const root = process.cwd();
const routeDetailSource = readFileSync(join(root, "app/routes/app.routes.$routeId.jsx"), "utf8");
const routeDetailServerSource = readFileSync(join(root, "app/features/delivery/route-detail.server.js"), "utf8");
const customStopDialogSource = readFileSync(join(root, "app/features/delivery/custom-stop-dialog.jsx"), "utf8");
const groupDetailSource = readFileSync(join(root, "app/routes/app.routes.groups.$routeGroupId.jsx"), "utf8");

process.env.CLEVER_DELIVERY_API_URL = "https://delivery.test/";
process.env.CLEVER_APP_ID = "clever-route-dev";
process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "0";

function makeRequest() {
  return new Request("https://admin.shopify.test/app/routes?id_token=query-token");
}

function makeFetch(payload = { data: { routeGroup: { id: "group/1" } }, error: null }) {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ init, url });
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    };
  };
  fakeFetch.calls = calls;
  return fakeFetch;
}

test("custom stop helpers call only the tenant delivery API boundary", async () => {
  const createFetch = makeFetch();
  const createPayload = {
    expectedUpdatedAt: "2026-08-19T00:00:00.000Z",
    stopName: "Warehouse pickup",
    targetRoutePlanId: "route/1",
  };
  await createDeliveryRouteGroupCustomStop(makeRequest(), "group/1", createPayload, {
    fetch: createFetch,
    sessionToken: "session-token",
  });
  assert.equal(createFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1/stops/custom");
  assert.equal(createFetch.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(createFetch.calls[0].init.body), createPayload);

  const updateFetch = makeFetch();
  await updateDeliveryRouteGroupCustomStop(makeRequest(), "group/1", "stop/1", createPayload, {
    fetch: updateFetch,
    sessionToken: "session-token",
  });
  assert.equal(updateFetch.calls[0].url, "https://delivery.test/admin/route-groups/group%2F1/stops/stop%2F1/custom");
  assert.equal(updateFetch.calls[0].init.method, "PATCH");

  const deleteFetch = makeFetch();
  await deleteDeliveryRouteGroupCustomStop(makeRequest(), "group/1", "stop/1", {
    expectedUpdatedAt: "2026-08-19T00:00:00.000Z",
  }, {
    fetch: deleteFetch,
    sessionToken: "session-token",
  });
  assert.equal(
    deleteFetch.calls[0].url,
    "https://delivery.test/admin/route-groups/group%2F1/stops/stop%2F1/custom?expectedUpdatedAt=2026-08-19T00%3A00%3A00.000Z",
  );
  assert.equal(deleteFetch.calls[0].init.method, "DELETE");
  assert.equal(deleteFetch.calls[0].init.body, undefined);
});

test("custom stop draft validates names, locations, coordinates, and timing", () => {
  const draft = createCustomStopDraft({
    address1: "123 Queen St W",
    city: "Toronto",
    countryCode: "CA",
    email: "dispatch@example.test",
    serviceMinutes: "5",
    stopName: "Warehouse pickup",
  });

  assert.deepEqual(validateCustomStopDraft(draft), {});
  assert.equal(buildCustomStopAddress(draft), "123 Queen St W, Toronto, CA");
  assert.equal(draft.email, "dispatch@example.test");
  assert.equal(buildCustomStopPayload(draft).email, "dispatch@example.test");
  assert.match(validateCustomStopDraft({ ...draft, stopName: "" }).stopName, /name/i);
  assert.match(validateCustomStopDraft({ ...draft, address1: "" }).address1, /address/i);
  assert.match(validateCustomStopDraft({ ...draft, latitude: "91", longitude: "10" }).latitude, /latitude/i);
  assert.match(validateCustomStopDraft({ ...draft, latitude: "43.6", longitude: "" }).longitude, /longitude/i);
  assert.match(validateCustomStopDraft({
    ...draft,
    timeWindowEnd: "2026-08-19T09:00",
    timeWindowStart: "2026-08-19T10:00",
  }).timeWindowEnd, /after/i);
});

test("route detail branches the first add dialog and keeps custom stops DB-only", () => {
  assert.match(routeDetailSource, />Existing order<\/button>/);
  assert.match(routeDetailSource, />Add custom stop<\/button>/);
  assert.match(customStopDialogSource, /Saved only in CLEVER/);
  assert.match(customStopDialogSource, /<s-spinner[^>]*accessibilityLabel="Adding custom stop"/);
  assert.match(routeDetailSource, /isCustomStop[\s\S]*>Custom<\/span>/);
  assert.match(routeDetailSource, /row\?\.isCustomStop\) return null/);
  assert.match(routeDetailSource, /Unassigned in group/);
  assert.match(routeDetailSource, /accessibilityLabel="Loading available orders"/);
  assert.doesNotMatch(groupDetailSource, /fetchDeliveryOrders/);

  assert.match(routeDetailServerSource, /intent === "loadAddOrderCandidates"/);
  assert.match(routeDetailServerSource, /intent === "createCustomStop"/);
  assert.match(routeDetailServerSource, /intent === "updateCustomStop"/);
  assert.match(routeDetailServerSource, /createDeliveryRouteGroupCustomStop/);
  assert.match(routeDetailServerSource, /updateDeliveryRouteGroupCustomStop/);
  assert.doesNotMatch(routeDetailServerSource, /orderUpdate|customerUpdate/);
});
