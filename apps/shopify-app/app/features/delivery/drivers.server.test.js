/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";

import {
  createPendingDeliveryDriver,
  deleteDeliveryDriver,
  fetchDeliveryDrivers,
} from "./drivers.server.js";

test("creates a pending delivery driver with a plain app download link", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  const calls = [];

  const result = await createPendingDeliveryDriver(
    new Request("https://app.example/app/drivers-vehicles"),
    {
      inviteLink: "https://clever.delivery/driver/download",
      phone: "+821012345678",
    },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: {
            driver: {
              id: "driver-pending-1",
              displayName: "+821012345678",
              phone: "+821012345678",
              status: "PENDING",
              authStatus: "INVITE_PENDING",
            },
          },
          error: null,
        }, { status: 201 });
      },
      sessionToken: "client-session-token",
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.equal(calls[0].url, "https://delivery.example/admin/drivers");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.authorization, "Bearer client-session-token");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    source: "clever-app-driver-invite",
    displayName: null,
    inviteLink: "https://clever.delivery/driver/download",
    phone: "+821012345678",
  });
  assert.deepEqual(result, {
    driver: {
      id: "driver-pending-1",
      displayName: "+821012345678",
      phone: "+821012345678",
      status: "PENDING",
      authStatus: "INVITE_PENDING",
    },
    errors: [],
  });
});

test("lists persisted delivery drivers through the delivery Admin API", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  const calls = [];

  const result = await fetchDeliveryDrivers(
    new Request("https://app.example/app/drivers-vehicles", {
      headers: { authorization: "Bearer header-session-token" },
    }),
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: { drivers: [{ id: "driver-1", phone: "+14165550108" }] },
          error: null,
        });
      },
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.equal(calls[0].url, "https://delivery.example/admin/drivers");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.authorization, "Bearer header-session-token");
  assert.equal(calls[0].options.body, undefined);
  assert.deepEqual(result, {
    drivers: [{ id: "driver-1", phone: "+14165550108" }],
    errors: [],
  });
});

test("deletes a delivery driver through the delivery Admin API", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  const calls = [];

  const result = await deleteDeliveryDriver(
    new Request("https://app.example/app/drivers-vehicles"),
    "driver id/with spaces",
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: { driverId: "driver id/with spaces" },
          error: null,
        });
      },
      sessionToken: "client-session-token",
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.equal(calls[0].url, "https://delivery.example/admin/drivers/driver%20id%2Fwith%20spaces");
  assert.equal(calls[0].options.method, "DELETE");
  assert.equal(calls[0].options.headers.authorization, "Bearer client-session-token");
  assert.equal(calls[0].options.body, undefined);
  assert.deepEqual(result, {
    driverId: "driver id/with spaces",
    errors: [],
  });
});

test("rejects blank driver ids before calling the delivery Admin API", async () => {
  const calls = [];

  const result = await deleteDeliveryDriver(
    new Request("https://app.example/app/drivers-vehicles"),
    "   ",
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({ data: { driverId: "unexpected" }, error: null });
      },
      sessionToken: "client-session-token",
    },
  );

  assert.deepEqual(calls, []);
  assert.deepEqual(result, {
    driverId: null,
    errors: [{ message: "삭제할 배송원 ID가 필요합니다." }],
  });
});

test("returns a driver-specific error when the delivery drivers API returns a non-json failure", async () => {
  const result = await createPendingDeliveryDriver(
    new Request("https://app.example/app/drivers-vehicles"),
    {
      inviteLink: "https://clever.delivery/driver/download",
      phone: "+821089216198",
    },
    {
      fetch: async () => new Response("bad gateway", { status: 502 }),
      sessionToken: "client-session-token",
    },
  );

  assert.equal(result.driver, null);
  assert.deepEqual(result.errors, [
    {
      code: "DELIVERY_API_ERROR",
      message: "Delivery drivers API 호출에 실패했습니다.",
      status: 502,
    },
  ]);
});
