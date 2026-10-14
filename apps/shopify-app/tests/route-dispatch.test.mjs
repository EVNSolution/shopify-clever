/* eslint-env node */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { publishDeliveryRoutePlan } from "../app/features/delivery/route-plans.server.js";
import {
  getAutomaticEmailSelection,
  getDispatchEmailRows,
  getRouteDispatchNotice,
  getSendNotificationControl,
} from "../app/features/delivery/route-dispatch.js";
import { dispatchRouteWithCustomerEmailSelection } from "../app/features/customer-notifications/customer-email.server.js";

const receipt = {
  routePlan: { id: "route-1", status: "READY" },
  dispatch: { routePlanId: "route-1", publishedAt: "2026-09-10T09:00:00.000Z", notificationStatus: "SENT" },
};

async function publish(t, { data = receipt, status = 200, error = null, failNetwork = false } = {}) {
  const previous = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.test";
  t.after(() => {
    if (previous === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previous;
  });
  const calls = [];
  const result = await publishDeliveryRoutePlan(new Request("https://app.test/app/routes/route-1"), "route-1", {
    sessionToken: "test-session-token",
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (failNetwork) throw new Error("connection lost");
      return new Response(JSON.stringify({ data, error }), { status, headers: { "content-type": "application/json" } });
    },
  });
  return { calls, result };
}

test("Dispatch uses the Shopify-authenticated API with the actual child ID and no start or email request", async (t) => {
  const { calls, result } = await publish(t);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://delivery.test/admin/route-plans/route-1/publish");
  assert.equal(calls[0].options.method, "POST");
  const headers = new Headers(calls[0].options.headers);
  assert.equal(headers.get("authorization"), "Bearer test-session-token");
  assert.ok(headers.get("x-clever-app-id"));
  assert.equal(calls[0].options.body, undefined);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.routePlan, receipt.routePlan);
  assert.deepEqual(result.dispatch, receipt.dispatch);
});

for (const data of [null, {}, { status: "PUBLISHED" },
  { ...receipt, routePlan: { id: "wrong-route" } },
  { ...receipt, dispatch: { ...receipt.dispatch, routePlanId: "wrong-route" } },
  { ...receipt, dispatch: { ...receipt.dispatch, publishedAt: null } },
  { ...receipt, dispatch: { ...receipt.dispatch, publishedAt: "invalid" } },
]) {
  test(`incomplete publication receipt cannot become success: ${JSON.stringify(data)}`, async (t) => {
    const { result } = await publish(t, { data });
    assert.equal(result.outcomeUnknown, true);
    assert.equal(result.dispatch, null);
    assert.equal(result.errors[0].code, "DELIVERY_ROUTE_DISPATCH_OUTCOME_UNKNOWN");
  });
}

for (const notificationStatus of ["FAILED", "SKIPPED"]) {
  test(`preserves a confirmed publication with ${notificationStatus} notification`, async (t) => {
    const dispatch = { ...receipt.dispatch, notificationStatus, notificationErrorCode: "NO_ACTIVE_TOKEN" };
    const { result } = await publish(t, { data: { ...receipt, dispatch } });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.dispatch, dispatch);
  });
}

for (const options of [{ failNetwork: true }, { status: 503, data: null }]) {
  test(`does not automatically repeat an uncertain Dispatch: ${JSON.stringify(options)}`, async (t) => {
    const { calls, result } = await publish(t, options);
    assert.equal(calls.length, 1);
    assert.equal(result.outcomeUnknown, true);
    assert.equal(result.dispatch, null);
  });
}

for (const status of [400, 404, 409]) {
  test(`preserves a ${status} server rejection`, async (t) => {
    const { result } = await publish(t, { status, data: null, error: { code: "ROUTE_REJECTED", message: "Cannot publish" } });
    assert.equal(result.errors[0].status, status);
    assert.equal(result.errors[0].code, "ROUTE_REJECTED");
    assert.equal(result.dispatch, null);
  });
}

test("expired Shopify authentication retains the session renewal response", async (t) => {
  await assert.rejects(() => publish(t, { status: 401, data: null }), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.headers.get("X-Shopify-Retry-Invalid-Session-Request"), "1");
    return true;
  });
});

test("only a confirmed publication and accepted push show the success notice", () => {
  assert.equal(getRouteDispatchNotice(receipt, "route-1").isError, false);
  for (const notificationStatus of ["FAILED", "SKIPPED", "PENDING", undefined]) {
    const notice = getRouteDispatchNotice({ ...receipt, dispatch: { ...receipt.dispatch, notificationStatus } }, "route-1");
    assert.equal(notice.isError, true);
    assert.match(notice.message, /Route dispatched, but/);
  }
  assert.equal(getRouteDispatchNotice(receipt, "another-route").isError, true);
  assert.equal(getRouteDispatchNotice({}, "route-1").isError, true);
});

// --- Dispatch popup with customer email selection ---

test("email rows skip custom stops and disable rows without a valid email", () => {
  const rows = getDispatchEmailRows([
    { deliveryStopId: "s1", stop: 1, recipientName: "Kim", order: "#1001", email: "kim@example.test" },
    { deliveryStopId: "s2", stop: 2, recipientName: "Lee", order: "#1002", email: "not-an-email" },
    { deliveryStopId: "s3", stop: 3, recipientName: "Depot", isCustomStop: true, email: "ops@example.test" },
    { deliveryStopId: "s4", stop: 4, recipientName: "Park", order: "#1004", email: null },
  ]);
  assert.deepEqual(rows.map((row) => [row.deliveryStopId, row.eligible]), [["s1", true], ["s2", false], ["s4", false]]);
});

test("the automatic selection holds every turned-on template except Delivery scheduled and every customer with a valid email", () => {
  const stops = [
    { deliveryStopId: "s1", email: "kim@example.test" },
    { deliveryStopId: "s2", email: "not-an-email" },
    { deliveryStopId: "s3", isCustomStop: true, email: "ops@example.test" },
    { deliveryStopId: "s5", email: "park@example.test" },
  ];
  assert.deepEqual(getAutomaticEmailSelection(stops, ["DELIVERY_SCHEDULED", "DELIVERED", "DRIVER_NEARBY"]), {
    mode: "ALL_ELIGIBLE",
    signals: ["DELIVERED", "DRIVER_NEARBY"],
    deliveryStopIds: ["s1", "s5"],
  });
  assert.deepEqual(getAutomaticEmailSelection(stops, []).signals, []);
});

test("Send Notification works only after Dispatch and not while another action runs", () => {
  const control = (overrides) => getSendNotificationControl({ busy: false, dispatched: true, hasRoute: true, ...overrides });
  assert.equal(control({}).enabled, true);
  assert.equal(control({ dispatched: false }).enabled, false);
  assert.match(control({ dispatched: false }).title, /Dispatch this route first/);
  assert.equal(control({ busy: true }).enabled, false);
  assert.equal(control({ hasRoute: false }).enabled, false);
  assert.equal(control({}).label, "Send Notification");
});

async function dispatchWithEmail(t, selection, responses = {}) {
  const previous = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.test";
  t.after(() => {
    if (previous === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previous;
  });
  const calls = [];
  const reply = (status, data, error = null) => new Response(JSON.stringify({ data, error }), { status, headers: { "content-type": "application/json" } });
  const result = await dispatchRouteWithCustomerEmailSelection(new Request("https://app.test/app/routes/route-1"), "route-1", selection, {
    commandId: "command-1",
    sessionToken: "test-session-token",
    fetch: async (url, options) => {
      const path = new URL(url).pathname;
      calls.push({ path, method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
      if (path.endsWith("/customer-email/selection")) return responses.selection ?? reply(200, { selection: { ...selection, updatedAt: "now", updatedBy: "office" } });
      if (path.endsWith("/publish")) return reply(200, receipt);
      if (path.endsWith("/customer-email/preview")) {
        return responses.preview ?? reply(200, {
          preview: {
            previewToken: "v1:token",
            recipients: [
              { deliveryStopId: "s1", email: "kim@example.test", history: { sendCount: 0 } },
              { deliveryStopId: "s2", email: "lee@example.test", history: { sendCount: 1, lastStatus: "SENT" } },
              { deliveryStopId: "s9", email: "other@example.test", history: { sendCount: 0 } },
            ],
          },
        });
      }
      if (path.endsWith("/customer-email/send")) return responses.send ?? reply(200, { dispatch: { counts: { sent: 1 } } });
      throw new Error(`unexpected ${path}`);
    },
  });
  return { calls, result };
}

test("Dispatch saves the selection, then dispatches, then sends Delivery scheduled only to selected stops", async (t) => {
  const selection = { signals: ["DELIVERY_SCHEDULED", "DELIVERED"], deliveryStopIds: ["s1", "s2"] };
  const { calls, result } = await dispatchWithEmail(t, selection);
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    "PUT /admin/route-plans/route-1/customer-email/selection",
    "POST /admin/route-plans/route-1/publish",
    "POST /admin/route-plans/route-1/customer-email/preview",
    "POST /admin/route-plans/route-1/customer-email/send",
  ]);
  assert.deepEqual(calls[0].body, selection);
  assert.deepEqual(calls[2].body, { deliveryStopIds: ["s1", "s2"], signal: "DELIVERY_SCHEDULED" });
  // s2 already got it; s9 was not selected.
  assert.deepEqual(calls[3].body, {
    commandId: "command-1",
    confirmed: true,
    deliveryStopIds: ["s1"],
    missingValuesConfirmed: true,
    previewToken: "v1:token",
    resendConfirmed: false,
    signal: "DELIVERY_SCHEDULED",
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.customerEmail.sendSkippedCount, 1);
});

test("the automatic selection saved at Dispatch sends no Delivery scheduled email", async (t) => {
  const selection = getAutomaticEmailSelection([{ deliveryStopId: "s1", email: "kim@example.test" }], ["DELIVERY_SCHEDULED", "DELIVERED"]);
  const { calls, result } = await dispatchWithEmail(t, selection);
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path.split("/").pop()}`), ["PUT selection", "POST publish"]);
  assert.deepEqual(calls[0].body, { signals: ["DELIVERED"], deliveryStopIds: ["s1"], mode: "ALL_ELIGIBLE" });
  assert.deepEqual(result.errors, []);
  assert.equal(result.customerEmail.send, null);
});

test("Dispatch does not send now when Delivery scheduled is not selected", async (t) => {
  const { calls } = await dispatchWithEmail(t, { signals: ["DELIVERED"], deliveryStopIds: ["s1"] });
  assert.deepEqual(calls.map((call) => call.path.split("/").pop()), ["selection", "publish"]);
});

test("a failed selection save stops before Dispatch", async (t) => {
  const failed = new Response(JSON.stringify({ data: null, error: { code: "BAD_REQUEST", message: "Invalid selection" } }), { status: 400, headers: { "content-type": "application/json" } });
  const selection = { signals: ["DELIVERY_SCHEDULED"], deliveryStopIds: ["s1"] };
  const { calls, result } = await dispatchWithEmail(t, selection, { selection: failed });
  assert.deepEqual(calls.map((call) => call.path.split("/").pop()), ["selection"]);
  assert.equal(result.dispatch, null);
  assert.equal(result.errors.length, 1);
});

test("a failed Delivery scheduled send keeps the Dispatch success visible", async (t) => {
  const failed = new Response(JSON.stringify({ data: null, error: { code: "PROVIDER_DOWN", message: "Provider unavailable" } }), { status: 502, headers: { "content-type": "application/json" } });
  const selection = { signals: ["DELIVERY_SCHEDULED"], deliveryStopIds: ["s1"] };
  const { result } = await dispatchWithEmail(t, selection, { send: failed });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.dispatch, receipt.dispatch);
  assert.equal(result.customerEmail.sendErrors.length, 1);
});

test("the Dispatch popup has no email step and Send Notification opens the dialog locked to Delivery scheduled", () => {
  const dialog = readFileSync(new URL("../app/features/delivery/route-dispatch-dialog.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(dialog, /Customer emails for this route|<legend|DispatchEmail/);
  const page = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  assert.match(page, /const openSendNotificationDialog = \(\) => \{/);
  assert.match(page, /createCustomerEmailDialogOpenState\("DELIVERY_SCHEDULED"\)/);
  assert.match(page, /disabled=\{customerEmailFetcher\.state !== "idle" \|\| sendNotificationFlow\.locked\}/);
  assert.ok(page.indexOf("onClick={openSendNotificationDialog}") < page.indexOf("onClick={handleDispatchRoute}"), "Send Notification is not next to Dispatch");
});
