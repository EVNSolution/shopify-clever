import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { checkDeliveryRouteGroupCustomStopAddress } from "../app/features/delivery/route-groups.server.js";

process.env.CLEVER_DELIVERY_API_URL = "https://delivery.test/";
process.env.CLEVER_APP_ID = "clever-route-dev";
process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "0";

import {
  applyAddressCheckToDraft,
  customStopAddressKeyAfterCheck,
  buildCustomStopAddressCheckPayload,
  createCustomStopDraft,
  customStopAddressKey,
  defaultStopTargetRoutePlanId,
  isCustomStopAddressCheckReady,
  readCustomStopAddressCheck,
  shouldShowStopTargetRoutePicker,
} from "../app/features/delivery/custom-stop-form.js";

test("an address check needs a street address and a two-letter country code", () => {
  assert.equal(isCustomStopAddressCheckReady(createCustomStopDraft({ address1: "100 Queen St W", countryCode: "ca" })), true);
  assert.equal(isCustomStopAddressCheckReady(createCustomStopDraft({ address1: "100 Queen St W" })), false);
  assert.equal(isCustomStopAddressCheckReady(createCustomStopDraft({ address1: "  ", countryCode: "CA" })), false);
  assert.equal(isCustomStopAddressCheckReady(createCustomStopDraft({ address1: "x", countryCode: "CAN" })), false);
});

test("the address key changes with address fields only, not with name, phone or email", () => {
  const base = createCustomStopDraft({ address1: "100 Queen St W", city: "Toronto", countryCode: "CA" });
  assert.equal(customStopAddressKey(base), customStopAddressKey({ ...base, recipientName: "A", phone: "1", email: "a@b.c" }));
  assert.equal(customStopAddressKey(base), customStopAddressKey({ ...base, countryCode: " ca " }));
  assert.notEqual(customStopAddressKey(base), customStopAddressKey({ ...base, city: "Ottawa" }));
});

test("the check payload carries only address fields with an upper-case country", () => {
  const payload = buildCustomStopAddressCheckPayload(createCustomStopDraft({
    address1: " 100 Queen St W ", countryCode: "ca", email: "x@y.z", recipientName: "TEST",
  }));
  assert.deepEqual(payload, {
    address1: "100 Queen St W", address2: "", city: "", countryCode: "CA", postalCode: "", province: "",
  });
});

test("filling the postal code from a check keeps that check current", () => {
  const draft = createCustomStopDraft({ address1: "100 Queen St W", countryCode: "CA" });
  const filled = applyAddressCheckToDraft(draft, { postalCode: "M5H 2N2" });
  assert.notEqual(customStopAddressKey(filled), customStopAddressKey(draft));
  assert.equal(customStopAddressKey(filled), customStopAddressKeyAfterCheck(draft, { postalCode: "M5H 2N2" }));
});

test("a check fills only an empty postal code", () => {
  const draft = createCustomStopDraft({ address1: "100 Queen St W", countryCode: "CA" });
  assert.equal(applyAddressCheckToDraft(draft, { postalCode: "M5H 2N2" }).postalCode, "M5H 2N2");
  const typed = { ...draft, postalCode: "M5H 0A0" };
  assert.equal(applyAddressCheckToDraft(typed, { postalCode: "M5H 2N2" }), typed);
  assert.equal(applyAddressCheckToDraft(draft, { postalCode: null }), draft);
});

test("a check result needs a valid coordinate pair", () => {
  assert.deepEqual(
    readCustomStopAddressCheck({ matchedAddress: " 100 Queen St W ", latitude: "43.65", longitude: -79.38, postalCode: "" }),
    { latitude: 43.65, longitude: -79.38, matchedAddress: "100 Queen St W", postalCode: null },
  );
  // The legacy addressLabel is only a query shape such as "freeform"; it must never be shown as the matched address.
  assert.equal(readCustomStopAddressCheck({ addressLabel: "freeform", latitude: 1, longitude: 2 }).matchedAddress, "");
  assert.equal(readCustomStopAddressCheck({ latitude: 91, longitude: 0 }), null);
  assert.equal(readCustomStopAddressCheck({ latitude: 10 }), null);
  assert.equal(readCustomStopAddressCheck(null), null);
});

test("the target route is preselected and the picker shows only when there is a real choice", () => {
  const one = [{ disabled: false, label: "TEST", value: "route-1" }];
  const several = [{ disabled: true, label: "Done", value: "route-0" }, ...one, { disabled: false, label: "B", value: "route-2" }];
  assert.equal(defaultStopTargetRoutePlanId(one), "route-1");
  assert.equal(shouldShowStopTargetRoutePicker(one), false);
  assert.equal(defaultStopTargetRoutePlanId(several), "route-1");
  assert.equal(shouldShowStopTargetRoutePicker(several), true);
  assert.equal(defaultStopTargetRoutePlanId([]), "");
  assert.equal(shouldShowStopTargetRoutePicker([]), false);
});

test("the address check posts only address fields to the read-only check endpoint and saves nothing", async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ init, url });
    return {
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { check: { addressLabel: "100 Queen St W", latitude: 43.65, longitude: -79.38, postalCode: null } }, error: null }),
      ok: true,
      status: 200,
      text: async () => "",
    };
  };

  const result = await checkDeliveryRouteGroupCustomStopAddress(
    new Request("https://admin.shopify.test/app/routes?id_token=query-token"),
    "group-1",
    buildCustomStopAddressCheckPayload(createCustomStopDraft({ address1: "100 Queen St W", countryCode: "CA", email: "x@y.z" })),
    { fetch: fakeFetch, sessionToken: "token" },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.toString(), "https://delivery.test/admin/route-groups/group-1/stops/custom/check");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    address1: "100 Queen St W", address2: "", city: "", countryCode: "CA", postalCode: "", province: "",
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.check.latitude, 43.65);

  const missing = await checkDeliveryRouteGroupCustomStopAddress(new Request("https://admin.shopify.test/"), "", {}, { fetch: fakeFetch });
  assert.equal(missing.check, null);
  assert.equal(missing.errors.length, 1);
  assert.equal(calls.length, 1);
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

const dialogSource = readFileSync(join(process.cwd(), "app/features/delivery/custom-stop-dialog.jsx"), "utf8");
const pageSource = readFileSync(join(process.cwd(), "app/routes/app.routes.$routeId.jsx"), "utf8");
const serverSource = readFileSync(join(process.cwd(), "app/features/delivery/route-detail.server.js"), "utf8");

test("the dialog shows the route picker only for a real choice and reuses the detailed settings map read-only", () => {
  assert.match(dialogSource, /const showTargetPicker = !isEdit && shouldShowStopTargetRoutePicker\(targetRouteOptions\)/u);
  assert.match(dialogSource, /import \{ LocationPreviewMap \} from "\.\.\/settings\/settings-departure-map"/u);
  assert.match(dialogSource, /<LocationPreviewMap[\s\S]*readOnly/u);
});

test("the dialog follows the design rules: aligned grid, Escape closes, labels are tied to inputs", () => {
  assert.match(dialogSource, /gridTemplateColumns: "repeat\(6, minmax\(0, 1fr\)\)"/u);
  assert.match(dialogSource, /event\.key === "Escape" && !busyRef\.current/u);
  assert.match(dialogSource, /<label htmlFor=\{inputId\}/u);
  assert.match(dialogSource, /border: "1px solid #e3e3e3"/u);
  assert.doesNotMatch(dialogSource, /role="note"/u);
});

test("the page checks the address through its own fetcher and preselects the target route", () => {
  assert.match(pageSource, /const addressCheckFetcher = useFetcher\(\)/u);
  assert.match(pageSource, /formData\.set\("_intent", "checkCustomStopAddress"\)/u);
  assert.match(pageSource, /defaultStopTargetRoutePlanId\(addStopTargetRouteOptions\)/u);
  assert.match(pageSource, /isRouteGroupDetail && shouldShowStopTargetRoutePicker\(addStopTargetRouteOptions\)/u);
  assert.match(serverSource, /intent === "checkCustomStopAddress"/u);
});

test("the check result shows the entered address and only shows a matched address when the server has one", () => {
  assert.match(dialogSource, /Address you entered/u);
  assert.match(dialogSource, /\{addressCheck\.data\.matchedAddress \? \(/u);
  assert.doesNotMatch(dialogSource, /Location found"\}/u);
});
