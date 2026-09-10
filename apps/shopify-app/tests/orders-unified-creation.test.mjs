import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { buildCreateRoutePlanPayload } from "../app/features/delivery/route-plans.server.js";
import { buildCreateRouteGroupPayload } from "../app/features/orders/route-group-create.js";
import { textOrUndefined } from "../app/features/orders/orders-page.shared.js";
import { translate } from "../app/i18n/i18n.js";

const page = readFileSync(new URL("../app/features/orders/orders-page.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../app/features/orders/orders-page.server.js", import.meta.url), "utf8");
const actionStart = server.indexOf("async function handleOrdersAction(");
const actionEnd = server.indexOf("\nasync function resolvePlannedOrdersForAction(", actionStart);
assert.ok(actionStart >= 0 && actionEnd > actionStart);

test("Create route is the only creation button and submits group-backed creation", () => {
  const declaration = page.match(/const handleCreateRoute = ([^;]+);/);
  assert.ok(declaration);
  const intents = [];
  vm.runInNewContext(`(${declaration[1]})`, { submitNewRoute: (intent) => intents.push(intent) })();
  assert.deepEqual(intents, ["createRouteGroup"]);
  assert.equal((page.match(/onClick=\{handleCreateRoute\}/g) ?? []).length, 1);
  assert.doesNotMatch(page, /handleCreateRouteGroup|orders\.routeActions\.createGroupRoute/);
  assert.equal(translate("en", "orders.routeActions.createRoute"), "Create route");
  assert.equal(translate("ko", "orders.routeActions.createRoute"), "경로 생성");
});

const plannedOrders = [
  { id: "gid://shopify/Order/1", orderId: "order-1", deliveryDate: "2026-09-10" },
  { id: "gid://shopify/Order/2", orderId: "order-2", deliveryDate: "2026-09-10" },
];

async function runCreation(intent, preflightErrors) {
  const requests = [];
  let preflights = 0;
  const action = vm.runInNewContext(`(${server.slice(actionStart, actionEnd)})`, {
    authenticate: { admin: async () => ({ admin: {}, session: { shop: "test-shop" } }) },
    buildCreateRoutePlanPayload,
    buildCreateRouteGroupPayload,
    createDeliveryRouteGroup: async (_request, payload, options) => {
      requests.push({ payload, options });
      return { routeGroup: { id: "created-route" }, errors: [] };
    },
    createDeliveryRoutePlanBatch: () => assert.fail("Orders must not create a standalone route"),
    buildCreateRoutePlanBatchPayload: () => assert.fail("Orders must not build a standalone route"),
    getSafePerformanceNow: () => 0,
    logDevPerformanceMetric() {},
    resolvePlannedOrdersForAction: async () => {
      preflights += 1;
      return preflightErrors ? { errors: preflightErrors } : {
        canonicalOrderCount: 2, syncedOrderCount: 0, plannedOrders,
        departureLocationData: {
          departureLocation: { address: "Depot", coordinates: [-79.4, 43.7], hasCoordinates: true },
        },
      };
    },
    roundPerfDuration: (value) => value,
    textOrUndefined,
  });
  const formData = new FormData();
  if (intent) formData.set("_intent", intent);
  formData.set("plannedOrderIds", JSON.stringify(plannedOrders.map((order) => order.id)));
  formData.set("routeName", "Thursday route");
  formData.set("routeScope", JSON.stringify({ deliveryDate: "2026-09-10" }));
  formData.set("shopifySessionToken", "test-token");
  const result = await action(new Request("https://app.test/app/orders", { method: "POST", body: formData }));
  return { result, requests, preflights };
}

test("explicit and default route creation use the same group endpoint and exact selected orders", async () => {
  for (const intent of ["createRouteGroup", undefined]) {
    const { result, requests } = await runCreation(intent);
    assert.equal(result.routeGroup?.id, "created-route");
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), {
      payload: {
        dateRangeStart: "2026-09-10", dateRangeEnd: "2026-09-10", planDate: "2026-09-10",
        depot: { address: "Depot", latitude: 43.7, longitude: -79.4 },
        name: "Thursday route", orderIds: ["order-1", "order-2"],
      },
      options: { sessionToken: "test-token" },
    });
  }
});

test("the retired ordinary action cannot create or synchronize orders", async () => {
  const { result, requests, preflights } = await runCreation("createRoutePlan");
  assert.equal(result.errors.length, 1);
  assert.equal(requests.length, 0);
  assert.equal(preflights, 0);
});

test("cancelled-order preflight blocks unified creation without dropping selected orders", async () => {
  const errors = [{ code: "CANCELLED_ORDER_NOT_PLANNABLE", message: "Cancelled order" }];
  const { result, requests } = await runCreation("createRouteGroup", errors);
  assert.equal(result.errors, errors);
  assert.equal(requests.length, 0);
});
