import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRouteOptions,
  readRouteOptionsForm,
  normalizeCashAmount,
  buildSettlementPayload,
  canEditRouteOptions,
} from "../app/features/delivery/route-office-options.js";
import {
  fetchRouteCashSettlements,
  confirmRouteCashSettlement,
  saveRouteOptions,
} from "../app/features/delivery/route-office-options.server.js";
process.env.CLEVER_DELIVERY_API_URL = "https://delivery.test";
process.env.CLEVER_APP_ID = "clever-route-kfood";
process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "0";
const request = () =>
  new Request("https://office.test/app/routes/r?id_token=token");
const makeFetch = (data) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ data, error: null }) };
  };
  return { fetch, calls };
};
test("missing options leave proof optional and tolls allowed", () => {
  assert.deepEqual(normalizeRouteOptions({}), {
    deliveryProof: { photoRequired: false, signatureRequired: false },
    tollPolicy: "ALLOW_TOLLS",
  });
  const form = new FormData();
  form.set("photoRequired", "true");
  form.set("tollPolicy", "AVOID_TOLLS");
  assert.deepEqual(readRouteOptionsForm(form), {
    deliveryProof: { photoRequired: true, signatureRequired: false },
    tollPolicy: "AVOID_TOLLS",
  });
  form.set("tollPolicy", "unsupported");
  assert.throws(() => readRouteOptionsForm(form));
});
test("policy editing is limited to unpublished unassigned drafts", () => {
  assert.equal(
    canEditRouteOptions({ status: "READY", updatedAt: "2026-10-09" }),
    true,
  );
  for (const route of [
    { status: "IN_PROGRESS" },
    { status: "READY", publishedAt: "2026-10-09" },
    { status: "READY", driverId: "driver" },
  ])
    assert.equal(canEditRouteOptions(route), false);
});
test("Cash preserves zero and exact decimals, rejecting blank, negative and excess precision", () => {
  for (const [input, expected] of [
    ["0", "0.00"],
    ["122", "122.00"],
    ["122.25", "122.25"],
    ["123", "123.00"],
  ])
    assert.equal(normalizeCashAmount(input), expected);
  for (const input of ["", "-1", "1.001", "1e2", "NaN"])
    assert.equal(normalizeCashAmount(input), null);
});
test("confirmation requires explicit receipt revision and correction reason", () => {
  const input = {
    commandId: "command",
    receiptId: "receipt",
    expectedRevision: 0,
    confirmedAmount: "0",
    currency: "CAD",
    reason: "",
  };
  assert.deepEqual(buildSettlementPayload(input), {
    ...input,
    confirmedAmount: "0.00",
    reason: null,
  });
  assert.throws(() =>
    buildSettlementPayload({ ...input, expectedRevision: undefined }),
  );
  assert.throws(() =>
    buildSettlementPayload({ ...input, expectedRevision: 1 }),
  );
  assert.equal(
    buildSettlementPayload({
      ...input,
      expectedRevision: 1,
      reason: "Office counted again",
    }).reason,
    "Office counted again",
  );
});
test("office wrappers preserve scope, command identity and revision without Shopify writes", async () => {
  const read = makeFetch({ routePlanId: "r/1", receipts: [] });
  assert.deepEqual(
    (await fetchRouteCashSettlements(request(), "r/1", { fetch: read.fetch }))
      .receipts,
    [],
  );
  assert.equal(
    read.calls[0].url,
    "https://delivery.test/admin/route-plans/r%2F1/cash-settlements",
  );
  const write = makeFetch({ settlement: { revision: 1 } });
  const payload = {
    commandId: "same",
    receiptId: "receipt",
    expectedRevision: 0,
    confirmedAmount: "122.00",
    currency: "CAD",
    reason: null,
  };
  await confirmRouteCashSettlement(request(), "r/1", payload, {
    fetch: write.fetch,
  });
  assert.equal(write.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(write.calls[0].init.body), payload);
  const options = makeFetch({ routePlan: { id: "r/1" } });
  await saveRouteOptions(
    request(),
    "r/1",
    { expectedUpdatedAt: "revision", ...normalizeRouteOptions({}) },
    { fetch: options.fetch },
  );
  assert.equal(options.calls[0].init.method, "PATCH");
  assert.equal(
    JSON.parse(options.calls[0].init.body).expectedUpdatedAt,
    "revision",
  );
});

test("Cash and options are restricted to the KFood app and exact authenticated store", async () => {
  const { isKfoodOfficeEnabled, requireKfoodOffice } =
    await import("../app/features/delivery/route-office-options.server.js");
  assert.equal(
    isKfoodOfficeEnabled("7hrud1-xq.myshopify.com", {
      CLEVER_APP_ID: "clever-route-kfood",
    }),
    true,
  );
  assert.equal(
    isKfoodOfficeEnabled("other.myshopify.com", {
      CLEVER_APP_ID: "clever-route-kfood",
    }),
    false,
  );
  assert.equal(
    isKfoodOfficeEnabled("7hrud1-xq.myshopify.com", {
      CLEVER_APP_ID: "clever",
    }),
    false,
  );
  assert.throws(
    () => requireKfoodOffice({ shop: "other.myshopify.com" }),
    (error) => error instanceof Response && error.status === 404,
  );
});

test("Cash confirmation invalidates the authenticated shop list and preserves another shop cache", async () => {
  const { fetchDeliveryRoutePlans, clearDeliveryApiResponseCache } =
    await import("../app/features/delivery/route-plans.server.js");
  const previous = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "15000";
  clearDeliveryApiResponseCache();
  let revision = 0;
  let reads = 0;
  const transport = async (_url, init) => {
    if (init.method === "POST") {
      revision = 1;
      return Response.json({ data: { settlement: { revision: 1 } } });
    }
    reads++;
    return Response.json({
      data: {
        routePlans: [
          { id: "r", cashSettlementSummary: [{ confirmedCount: revision }] },
        ],
      },
    });
  };
  try {
    const read = (shop) =>
      fetchDeliveryRoutePlans(request(), { fetch: transport, cacheKey: shop });
    await read("shop-a");
    await read("shop-b");
    assert.equal(reads, 2);
    await confirmRouteCashSettlement(
      request(),
      "r",
      { commandId: "one" },
      { fetch: transport, cacheKey: "shop-a" },
    );
    assert.equal(
      (await read("shop-a")).routePlans[0].cashSettlementSummary[0]
        .confirmedCount,
      1,
    );
    assert.equal(
      (await read("shop-b")).routePlans[0].cashSettlementSummary[0]
        .confirmedCount,
      0,
    );
    assert.equal(reads, 3);
  } finally {
    process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = previous;
    clearDeliveryApiResponseCache();
  }
});

test("receipt reads reject another route and malformed success payloads", async () => {
  for (const data of [
    { routePlanId: "other", receipts: [] },
    { routePlanId: "r/1", receipts: null },
  ]) {
    const fake = makeFetch(data);
    const result = await fetchRouteCashSettlements(request(), "r/1", {
      fetch: fake.fetch,
    });
    assert.equal(result.errors.length, 1);
    assert.deepEqual(result.receipts, []);
  }
});

test("route creation saves delivery options on the same initial-route request", async () => {
  const { buildCreateRouteGroupPayload } =
    await import("../app/features/orders/route-group-create.js");
  const options = {
    deliveryProof: { photoRequired: true, signatureRequired: true },
    tollPolicy: "AVOID_TOLLS",
  };
  const payload = buildCreateRouteGroupPayload({
    initialRouteRequestId: "retry-id",
    plannedOrders: [{ orderId: "o1" }],
    routeName: "Route",
    routeOptions: options,
  });
  assert.deepEqual(payload.initialRoute, { requestId: "retry-id", ...options });
  assert.deepEqual(payload.orderIds, ["o1"]);
});

test("proof rollout errors explain the driver release dependency", async () => {
  const { getOfficeErrorMessage } =
    await import("../app/features/delivery/route-office-options.js");
  assert.match(
    getOfficeErrorMessage({
      code: "DELIVERY_PROOF_ROLLOUT_DISABLED",
      message: "internal gate",
    }),
    /new driver app rollout/,
  );
  assert.match(
    getOfficeErrorMessage({ code: "DELIVERY_PROOF_DRIVER_UPDATE_REQUIRED" }),
    /Update the driver app/,
  );
  assert.equal(
    getOfficeErrorMessage({ code: "OTHER", message: "Conflict" }),
    "Conflict",
  );
});
