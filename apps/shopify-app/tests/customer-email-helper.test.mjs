/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchCustomerEmailSettings,
  previewRouteCustomerEmail,
  saveCustomerEmailSettings,
  sendRouteCustomerEmail,
} from "../app/features/delivery/customer-email.server.js";

process.env.CLEVER_DELIVERY_API_URL = "https://delivery.test";
process.env.CLEVER_APP_ID = "clever-route-dev";
process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "0";

function request() {
  return new Request("https://admin.shopify.test/app/settings?id_token=query-token");
}

function fakeFetch(payload) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ init, url });
    return { json: async () => payload, ok: true, status: 200 };
  };
  fetch.calls = calls;
  return fetch;
}

test("customer email settings stay in the delivery API", async () => {
  const fetch = fakeFetch({ data: { customerEmailSettings: { senderName: "CLEVER" } }, error: null });
  const result = await fetchCustomerEmailSettings(request(), { fetch, sessionToken: "token" });
  assert.equal(result.customerEmailSettings.senderName, "CLEVER");
  assert.equal(fetch.calls[0].url, "https://delivery.test/admin/customer-email/settings");
  assert.equal(fetch.calls[0].init.method, "GET");

  const input = { senderName: "K-Food", templates: {} };
  await saveCustomerEmailSettings(request(), input, { fetch, sessionToken: "token" });
  assert.equal(fetch.calls[1].init.method, "PATCH");
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), input);
});

test("route email requires separate preview and send endpoints", async () => {
  const fetch = fakeFetch({ data: { preview: { recipientCount: 2 } }, error: null });
  await previewRouteCustomerEmail(request(), "route/1", { signal: "DELIVERED" }, { fetch, sessionToken: "token" });
  assert.equal(fetch.calls[0].url, "https://delivery.test/admin/route-plans/route%2F1/customer-email/preview");
  assert.equal(fetch.calls[0].init.method, "POST");

  await sendRouteCustomerEmail(request(), "route/1", {
    commandId: "command-1",
    confirmed: true,
    signal: "DELIVERED",
  }, { fetch, sessionToken: "token" });
  assert.equal(fetch.calls[1].url, "https://delivery.test/admin/route-plans/route%2F1/customer-email/send");
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), {
    commandId: "command-1",
    confirmed: true,
    signal: "DELIVERED",
  });
});
