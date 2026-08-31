import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import {
  CUSTOMER_NOTIFICATION_PAYLOAD_TOO_LARGE_ERROR_CODE,
  CUSTOMER_NOTIFICATION_ROUTE_ID_MISSING_ERROR_CODE,
  CUSTOMER_NOTIFICATION_SETTINGS_PAYLOAD_INVALID_ERROR_CODE,
  activateCustomerNotifications,
  fetchCustomerNotificationSettings,
  previewRouteCustomerNotification,
  saveCustomerNotificationSettings,
  saveCustomerNotificationSettingsFromForm,
  sendRouteCustomerNotification,
} from "./customer-email.server.js";
import { clearDeliveryApiResponseCache } from "../delivery/route-plans.server.js";

function withDeliveryApiEnv(fn) {
  return async () => {
    const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
    const previousAppId = process.env.CLEVER_APP_ID;
    const previousTtl = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;

    process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
    process.env.CLEVER_APP_ID = "clever-route-dev";
    process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "5000";
    clearDeliveryApiResponseCache();

    try {
      await fn();
    } finally {
      restoreEnv("CLEVER_DELIVERY_API_URL", previousBaseUrl);
      restoreEnv("CLEVER_APP_ID", previousAppId);
      restoreEnv("CLEVER_DELIVERY_API_GET_CACHE_TTL_MS", previousTtl);
      clearDeliveryApiResponseCache();
    }
  };
}

test("customer notification settings wrapper forwards Shopify bearer and app scope", withDeliveryApiEnv(async () => {
  const calls = [];
  const request = new Request("https://app.example/app/settings", {
    headers: { authorization: "Bearer shopify-session" },
  });

  const result = await fetchCustomerNotificationSettings(request, {
    cacheKey: "k-food.myshopify.com",
    fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        data: {
          customerNotificationSettings: {
            settingsVersion: "v3-1",
            templates: [],
          },
        },
      });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://delivery.example/admin/customer-email/settings");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.authorization, "Bearer shopify-session");
  assert.equal(calls[0].options.headers["x-clever-app-id"], "clever-route-dev");
  assert.equal(result.customerNotificationSettings.settingsVersion, "v3-1");
  assert.deepEqual(result.errors, []);
}));

test("customer notification mutations normalize raw App Bridge tokens", withDeliveryApiEnv(async () => {
  const calls = [];
  const request = new Request("https://app.example/app/settings");

  const result = await saveCustomerNotificationSettings(
    request,
    {
      expectedSettingsVersion: "v3-1",
      global: { senderName: "CLEVER", senderEmail: "ops@example.test" },
    },
    {
      sessionToken: "app-bridge-token",
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: { customerNotificationSettings: { settingsVersion: "v3-2" } },
        });
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.headers.authorization, "Bearer app-bridge-token");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    expectedSettingsVersion: "v3-1",
    global: { senderName: "CLEVER", senderEmail: "ops@example.test" },
  });
  assert.equal(result.customerNotificationSettings.settingsVersion, "v3-2");
}));

test("customer notification settings form rejects missing or malformed payloads before forwarding", withDeliveryApiEnv(async () => {
  const invalidValues = [null, "", "not-json", "[]", "{}"];

  for (const invalidValue of invalidValues) {
    let called = false;
    const formData = new FormData();
    formData.set("shopifySessionToken", "app-bridge-token");
    if (invalidValue !== null) formData.set("customerNotificationSettings", invalidValue);

    const result = await saveCustomerNotificationSettingsFromForm(
      new Request("https://app.example/app/settings"),
      formData,
      {
        fetch: async () => {
          called = true;
          return Response.json({
            data: { customerNotificationSettings: { settingsVersion: "server-default" } },
          });
        },
      },
    );

    assert.equal(called, false);
    assert.equal(result.customerNotificationSettings, null);
    assert.equal(result.errors[0].code, CUSTOMER_NOTIFICATION_SETTINGS_PAYLOAD_INVALID_ERROR_CODE);
    assert.equal(result.errors[0].status, 400);
  }
}));

test("customer notification GET cache is invalidated after successful mutations", withDeliveryApiEnv(async () => {
  let settingsCalls = 0;
  const request = new Request("https://app.example/app/settings", {
    headers: { authorization: "Bearer shopify-session" },
  });
  const fetch = async (url, options) => {
    if (options.method === "GET" && url.endsWith("/admin/customer-email/settings")) {
      settingsCalls += 1;
      return Response.json({
        data: {
          customerNotificationSettings: { settingsVersion: `v3-${settingsCalls}` },
        },
      });
    }

    if (options.method === "POST" && url.endsWith("/admin/customer-email/activation")) {
      return Response.json({ data: { activation: { enabled: true } } });
    }

    throw new Error(`Unexpected request ${options.method} ${url}`);
  };

  const first = await fetchCustomerNotificationSettings(request, { cacheKey: "shop-a", fetch });
  const second = await fetchCustomerNotificationSettings(request, { cacheKey: "shop-a", fetch });

  assert.equal(settingsCalls, 1);
  assert.equal(first.customerNotificationSettings.settingsVersion, "v3-1");
  assert.equal(second.customerNotificationSettings.settingsVersion, "v3-1");

  await activateCustomerNotifications(request, { confirmed: true }, { fetch });
  const third = await fetchCustomerNotificationSettings(request, { cacheKey: "shop-a", fetch });

  assert.equal(settingsCalls, 2);
  assert.equal(third.customerNotificationSettings.settingsVersion, "v3-2");
}));

test("customer notification wrapper preserves actionable delivery API errors without leaking secrets", withDeliveryApiEnv(async () => {
  const statuses = [401, 404, 409, 422, 429, 500];
  const request = new Request("https://app.example/app/settings", {
    headers: { authorization: "Bearer shopify-session" },
  });

  for (const status of statuses) {
    const operation = fetchCustomerNotificationSettings(request, {
      fetch: async () => Response.json({
        error: {
          code: `E_${status}`,
          message: `status ${status}`,
          providerSecret: "brevo-secret",
          token: "shopify-token",
        },
      }, { status }),
    });

    if (status === 401) {
      await assert.rejects(operation, (error) => {
        assert.equal(error instanceof Response, true);
        assert.equal(error.status, 401);
        assert.equal(error.headers.get("X-Shopify-Retry-Invalid-Session-Request"), "1");
        return true;
      });
      continue;
    }

    const result = await operation;

    assert.equal(result.customerNotificationSettings, null);
    assert.equal(result.errors[0].code, status === 404 ? "E_404" : `E_${status}`);
    assert.equal(result.errors[0].status, status);
    assert.doesNotMatch(JSON.stringify(result.errors[0]), /brevo-secret|shopify-token/);
  }
}));

test("customer notification route wrappers encode route IDs and keep recipient DTOs server-owned", withDeliveryApiEnv(async () => {
  const calls = [];
  const request = new Request("https://app.example/app/routes/route%201", {
    headers: { authorization: "Bearer shopify-session" },
  });

  const result = await previewRouteCustomerNotification(
    request,
    "route 1",
    {
      signal: "OUT_FOR_DELIVERY",
      selectedStopIds: ["stop-1"],
    },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: {
            preview: { renderSnapshotId: "snapshot-1" },
            recipients: [{ id: "recipient-1", email: "customer@example.test" }],
          },
        });
      },
    },
  );

  assert.equal(calls[0].url, "https://delivery.example/admin/route-plans/route%201/customer-email/preview");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    signal: "OUT_FOR_DELIVERY",
    selectedStopIds: ["stop-1"],
  });
  assert.equal(result.preview.renderSnapshotId, "snapshot-1");
  assert.equal(result.recipients[0].email, "customer@example.test");
}));

test("customer notification wrapper rejects oversized recipient sets before forwarding", withDeliveryApiEnv(async () => {
  const oversizedPayloads = [
    { deliveryStopIds: ["stop-one", "stop-two"] },
    { recipientIds: ["one", "two"] },
  ];
  const request = new Request("https://app.example/app/routes/route-1", {
    headers: { authorization: "Bearer shopify-session" },
  });

  for (const payload of oversizedPayloads) {
    let called = false;

    const result = await sendRouteCustomerNotification(
      request,
      "route-1",
      payload,
      {
        recipientLimit: 1,
        fetch: async () => {
          called = true;
          return Response.json({});
        },
      },
    );

    assert.equal(called, false);
    assert.equal(result.dispatch, null);
    assert.equal(result.errors[0].code, CUSTOMER_NOTIFICATION_PAYLOAD_TOO_LARGE_ERROR_CODE);
  }
}));

test("customer notification route wrappers reject missing route IDs before forwarding", withDeliveryApiEnv(async () => {
  let called = false;
  const result = await previewRouteCustomerNotification(
    new Request("https://app.example/app/routes", {
      headers: { authorization: "Bearer shopify-session" },
    }),
    "",
    { signal: "OUT_FOR_DELIVERY" },
    {
      fetch: async () => {
        called = true;
        return Response.json({});
      },
    },
  );

  assert.equal(called, false);
  assert.equal(result.errors[0].code, CUSTOMER_NOTIFICATION_ROUTE_ID_MISSING_ERROR_CODE);
}));

function restoreEnv(name, previousValue) {
  if (previousValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previousValue;
  }
}
