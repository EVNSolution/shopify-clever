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
  updateCustomStopDraftField,
  validateCustomStopDraft,
} from "../app/features/delivery/custom-stop-form.js";
import { numberOrUndefined } from "../app/features/delivery/route-helpers.js";

const root = process.cwd();
const routeDetailSource = readFileSync(join(root, "app/routes/app.routes.$routeId.jsx"), "utf8");
const routeDetailServerSource = readFileSync(join(root, "app/features/delivery/route-detail.server.js"), "utf8");
const customStopDraftReaderSource = routeDetailServerSource.match(/function readCustomStopDraft[\s\S]*?\n}/)?.[0] ?? "";
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

test("blank numeric form values never become zero", () => {
  assert.equal(numberOrUndefined(""), undefined);
  assert.equal(numberOrUndefined("   "), undefined);
  assert.equal(numberOrUndefined("0"), 0);
});

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

test("custom stop draft contains only Shopify contact and shipping-address fields", () => {
  const draft = createCustomStopDraft({
    address1: "123 Queen St W",
    city: "Toronto",
    countryCode: "CA",
    email: "dispatch@example.test",
    phone: "416-555-0100",
    postalCode: "M5H 2N2",
    recipientName: "Receiving desk",
    stopName: "ignored internal name",
  });

  assert.deepEqual(validateCustomStopDraft(draft), {});
  assert.equal(buildCustomStopAddress(draft), "123 Queen St W, Toronto, M5H 2N2, CA");
  assert.deepEqual(Object.keys(draft).sort(), [
    "address1",
    "address2",
    "city",
    "countryCode",
    "email",
    "phone",
    "postalCode",
    "province",
    "recipientName",
  ]);
  assert.deepEqual(buildCustomStopPayload(draft), {
    address1: "123 Queen St W",
    address2: "",
    city: "Toronto",
    countryCode: "CA",
    email: "dispatch@example.test",
    phone: "416-555-0100",
    postalCode: "M5H 2N2",
    province: "",
    recipientName: "Receiving desk",
  });
  assert.match(validateCustomStopDraft({ ...draft, address1: "" }).address1, /address/i);
  assert.match(validateCustomStopDraft({ ...draft, countryCode: "1" }).countryCode, /two-letter/i);
});

test("custom stop field edits preserve the remaining order-like inputs", () => {
  const draft = createCustomStopDraft({
    address1: "123 Queen St W",
    phone: "416-555-0100",
    postalCode: "M5H 2N2",
  });

  assert.deepEqual(updateCustomStopDraftField(draft, "address1", "125 Queen St W"), {
    ...draft,
    address1: "125 Queen St W",
  });
  assert.deepEqual(updateCustomStopDraftField(draft, "phone", "416-555-0101"), {
    ...draft,
    phone: "416-555-0101",
  });
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
  assert.doesNotMatch(routeDetailServerSource, /searchCustomStopAddress|searchAddresses|geocodeAddress/);
  assert.doesNotMatch(routeDetailSource, /customStopAddressFetcher|searchCustomStopAddress|selectCustomStopAddress/);
  assert.match(routeDetailSource, /updateCustomStopDraftField\(draft, field, value\)/);
  assert.doesNotMatch(routeDetailSource, /handleCustomStopPinChange/);
  assert.doesNotMatch(customStopDialogSource, /LocationPreviewMap|navigation pin|Latitude|Longitude|onCoordinateChange/);
  assert.doesNotMatch(customStopDialogSource, /Search address|Select this address|OpenStreetMap contributors/);
  assert.doesNotMatch(customStopDialogSource, /Stop name|Stop time|Priority|Time window|Driver instructions/);
  assert.doesNotMatch(customStopDraftReaderSource, /formData\.get\("(latitude|longitude|stopName|serviceMinutes|priority|timeWindowStart|timeWindowEnd|instructions)"\)/);
  assert.match(routeDetailServerSource, /createDeliveryRouteGroupCustomStop/);
  assert.match(routeDetailServerSource, /updateDeliveryRouteGroupCustomStop/);
  assert.doesNotMatch(routeDetailServerSource, /orderUpdate|customerUpdate/);
});
