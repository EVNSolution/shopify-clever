/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchCustomerEmailSettings,
  previewRouteCustomerEmail,
  saveCustomerEmailGlobal,
  saveCustomerEmailSettings,
  saveCustomerEmailTemplate,
  sendCustomerEmailTest,
  sendRouteCustomerEmail,
  uploadCustomerEmailLogo,
} from "../app/features/customer-notifications/customer-email.server.js";

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

test("customer email settings reject empty payloads before reaching the delivery API", async () => {
  const fetch = fakeFetch({ data: { customerEmailSettings: { senderName: "server-default" } }, error: null });

  const result = await saveCustomerEmailSettings(request(), {}, { fetch, sessionToken: "token" });

  assert.equal(fetch.calls.length, 0);
  assert.equal(result.customerEmailSettings, null);
  assert.equal(result.errors[0].code, "CUSTOMER_NOTIFICATION_SETTINGS_PAYLOAD_INVALID");
  assert.equal(result.errors[0].status, 400);
});

test("customer email global settings save uses the partial endpoint without templates", async () => {
  const fetch = fakeFetch({
    data: {
      customerEmailGlobal: { senderName: "CLEVER" },
      globalVersion: "global-2",
    },
    error: null,
  });

  const result = await saveCustomerEmailGlobal(request(), {
    branding: {
      address: "123 Seoul Rd",
      businessName: "CLEVER K-Food",
      contactEmail: "support@example.test",
      note: "Thanks",
      phone: "+82 2 0000 0000",
      websiteUrl: "https://store.example.test",
    },
    expectedVersion: "global-1",
    replyTo: "ops@example.test",
    senderEmail: "ops@example.test",
    senderName: "CLEVER",
  }, { fetch, sessionToken: "token" });

  assert.equal(fetch.calls[0].url, "https://delivery.test/admin/customer-email/settings/global");
  assert.equal(fetch.calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    branding: {
      address: "123 Seoul Rd",
      businessName: "CLEVER K-Food",
      contactEmail: "support@example.test",
      note: "Thanks",
      phone: "+82 2 0000 0000",
      websiteUrl: "https://store.example.test",
    },
    expectedVersion: "global-1",
    replyTo: "ops@example.test",
    senderEmail: "ops@example.test",
    senderName: "CLEVER",
  });
  assert.equal(result.globalVersion, "global-2");
  assert.deepEqual(result.customerEmailGlobal, { senderName: "CLEVER" });
  assert.doesNotMatch(fetch.calls[0].init.body, /templates/u);
  assert.doesNotMatch(fetch.calls[0].init.body, /nearbyStopsThreshold|footerText/u);
});

test("customer email template save uses the signal partial endpoint without global fields", async () => {
  const fetch = fakeFetch({
    data: {
      customerEmailTemplate: {
        body: "Hi {{customerName}}",
        enabled: false,
        subject: "Out",
        version: "template-2",
      },
    },
    error: null,
  });

  const result = await saveCustomerEmailTemplate(request(), "OUT_FOR_DELIVERY", {
    body: "Hi {{customerName}}",
    enabled: false,
    expectedVersion: "template-1",
    subject: "Out",
  }, { fetch, sessionToken: "token" });

  assert.equal(fetch.calls[0].url, "https://delivery.test/admin/customer-email/settings/templates/OUT_FOR_DELIVERY");
  assert.equal(fetch.calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    body: "Hi {{customerName}}",
    enabled: false,
    expectedVersion: "template-1",
    subject: "Out",
  });
  assert.equal(result.templateVersion, "template-2");
  assert.equal(result.customerEmailTemplate.enabled, false);
  assert.doesNotMatch(fetch.calls[0].init.body, /senderEmail|branding|templates/u);
});

test("customer email partial settings keep 409 conflicts as actionable errors", async () => {
  const fetch = async (url, init = {}) => {
    fetch.calls.push({ init, url });
    return Response.json({
      error: {
        code: "CUSTOMER_EMAIL_SETTINGS_VERSION_CONFLICT",
        message: "Settings were updated by another session.",
      },
    }, { status: 409 });
  };
  fetch.calls = [];

  const result = await saveCustomerEmailTemplate(request(), "DELIVERED", {
    body: "Done",
    enabled: true,
    expectedVersion: "template-1",
    subject: "Done",
  }, { fetch, sessionToken: "token" });

  assert.equal(fetch.calls[0].url, "https://delivery.test/admin/customer-email/settings/templates/DELIVERED");
  assert.equal(result.customerEmailTemplate, null);
  assert.equal(result.errors[0].status, 409);
  assert.equal(result.errors[0].code, "CUSTOMER_EMAIL_SETTINGS_VERSION_CONFLICT");
});

test("customer email test forwards its correlation id", async () => {
  const fetch = fakeFetch({ data: { test: { messageId: "message-1", provider: "brevo" } }, error: null });
  const result = await sendCustomerEmailTest(request(), {
    attemptId: "attempt-1",
    confirmed: true,
    recipientEmail: "customer@example.com",
    signal: "DELIVERY_SCHEDULED",
    subject: "Edited test subject",
    body: "Edited test body",
  }, { fetch, sessionToken: "token" });

  assert.equal(fetch.calls[0].init.headers["x-correlation-id"], "attempt-1");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    attemptId: "attempt-1",
    confirmed: true,
    recipientEmail: "customer@example.com",
    signal: "DELIVERY_SCHEDULED",
    subject: "Edited test subject",
    body: "Edited test body",
  });
  assert.equal(result.attemptId, "attempt-1");
  assert.equal(result.test.messageId, "message-1");
});

test("customer email logo upload forwards multipart form data without forcing json content type", async () => {
  const fetch = fakeFetch({ data: { logoAsset: { url: "https://cdn.test/logo.webp" } }, error: null });
  const formData = new FormData();
  formData.set("logo", new Blob(["logo"], { type: "image/webp" }), "logo.webp");

  const result = await uploadCustomerEmailLogo(request(), formData, { fetch, sessionToken: "token" });

  assert.equal(fetch.calls[0].url, "https://delivery.test/admin/customer-email/logo");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.body, formData);
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer token");
  assert.equal(fetch.calls[0].init.headers["content-type"], undefined);
  assert.equal(result.logoAsset.url, "https://cdn.test/logo.webp");
});

test("customer email logo upload requires a multipart form data payload", async () => {
  const fetch = fakeFetch({ data: { logoAsset: { url: "https://cdn.test/logo.webp" } }, error: null });

  const result = await uploadCustomerEmailLogo(request(), null, { fetch, sessionToken: "token" });

  assert.equal(fetch.calls.length, 0);
  assert.equal(result.logoAsset, null);
  assert.equal(result.errors[0].code, "CUSTOMER_EMAIL_LOGO_FORM_DATA_REQUIRED");
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
