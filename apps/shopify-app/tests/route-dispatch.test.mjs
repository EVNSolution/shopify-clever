/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";
import { publishDeliveryRoutePlan } from "../app/features/delivery/route-plans.server.js";
import { getRouteDispatchNotice } from "../app/features/delivery/route-dispatch.js";

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
