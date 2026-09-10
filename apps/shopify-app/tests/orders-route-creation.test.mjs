import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import vm from "node:vm";
import {
  buildCreateRoutePlanBatchPayload,
  createDeliveryRoutePlanBatch,
} from "../app/features/delivery/route-plans.server.js";

const root = process.cwd();
const pageSource = readFileSync(join(root, "app/features/orders/orders-page.jsx"), "utf8");
const serverSource = readFileSync(join(root, "app/features/orders/orders-page.server.js"), "utf8");

function extractArrow(name, nextDeclaration) {
  const start = pageSource.indexOf(`  const ${name} = `);
  const end = pageSource.indexOf(`\n  const ${nextDeclaration} = `, start);
  assert.notEqual(start, -1, `${name} declaration must exist`);
  assert.notEqual(end, -1, `${nextDeclaration} declaration must follow ${name}`);
  return pageSource.slice(start + `  const ${name} = `.length, end).replace(/;\s*$/, "");
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("route creation intent is guarded before the asynchronous Shopify token resolves", async () => {
  const token = deferred();
  const submitted = [];
  const pendingStates = [];
  let tokenRequests = 0;
  const routeCreatePendingRef = { current: false };
  const submittedRouteRequestRef = { current: false };
  const submittedRouteIntentRef = { current: null };
  const handler = vm.runInNewContext(`(${extractArrow("submitNewRoute", "handleCreateRoute")})`, {
    DEFAULT_ROUTE_PLAN_TITLE: "CLEVER route draft",
    FormData,
    buildRouteScopeFromOrders: () => ({ deliveryDate: "2026-09-11" }),
    isOrderCancelled: () => false,
    orderFilters: { scope: "unfulfilled" },
    plannedOrderIds: ["gid://shopify/Order/1"],
    plannedOrders: [{ id: "gid://shopify/Order/1", orderId: "delivery-order-1" }],
    routeCreatePendingRef,
    routePlanFetcher: {
      state: "idle",
      submit(formData, options) {
        submitted.push({
          intent: formData.get("_intent"),
          options,
          plannedOrderIds: JSON.parse(formData.get("plannedOrderIds")),
          sessionToken: formData.get("shopifySessionToken"),
        });
      },
    },
    routePlanTitle: "Friday route",
    setCreateRouteClientError() {},
    setRouteCreatePending(value) {
      pendingStates.push(value);
    },
    shopify: {
      idToken() {
        tokenRequests += 1;
        return token.promise;
      },
    },
    submittedRouteIntentRef,
    submittedRouteRequestRef,
  });

  const firstSubmit = handler("createRouteGroup");
  const duplicateSubmit = handler("createRouteGroup");

  assert.equal(tokenRequests, 1);
  assert.equal(routeCreatePendingRef.current, true);
  assert.deepEqual(pendingStates, [true]);
  assert.equal(submitted.length, 0);

  token.resolve("session-token");
  await Promise.all([firstSubmit, duplicateSubmit]);

  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].intent, "createRouteGroup");
  assert.equal(submitted[0].options.method, "post");
  assert.deepEqual(submitted[0].plannedOrderIds, ["gid://shopify/Order/1"]);
  assert.equal(submitted[0].sessionToken, "session-token");
  assert.equal(submittedRouteIntentRef.current, "createRouteGroup");
  assert.equal(submittedRouteRequestRef.current, true);
});

test("Add to map excludes cancelled orders from table and map-popup paths", () => {
  const readyOrder = { id: "ready", name: "#ready" };
  const cancelledOrder = { id: "cancelled", name: "#cancelled", cancelledAt: "2026-09-03T00:00:00Z" };
  const plannedOrderRows = [];
  const clientErrors = [];

  const addSelected = vm.runInNewContext(`(${extractArrow("handleAddToPlan", "selectOrderDataOrder")})`, {
    buildRoutePlanTitleFromOrders: (orders) => orders.map((order) => order.name).join(", "),
    checkedOrderIds: [readyOrder.id, cancelledOrder.id],
    displayOrderById: new Map([[readyOrder.id, readyOrder], [cancelledOrder.id, cancelledOrder]]),
    isOrderCancelled: (order) => Boolean(order.cancelledAt),
    language: "en",
    plannedOrderIdSet: new Set(),
    plannedOrderIds: [],
    plannedOrderRowById: new Map(),
    selectedOrderRows: [readyOrder, cancelledOrder],
    setCreateRouteClientError: (message) => clientErrors.push(message),
    setPlanFitRequest: (updater) => updater(0),
    setPlannedOrderIds: (orderIds) => plannedOrderRows.push(orderIds),
    setPlannedOrderRows() {},
    setRoutePlanTitle() {},
    setSelectedOrderRows() {},
    translate: (_language, _key, params) => `${params.count} cancelled excluded`,
  });

  addSelected();
  assert.deepEqual(plannedOrderRows.map((orderIds) => Array.from(orderIds)), [[readyOrder.id]]);
  assert.deepEqual(clientErrors, ["1 cancelled excluded"]);

  const popupErrors = [];
  const addFromPopup = vm.runInNewContext(`(${extractArrow("handleAddOrderToPlan", "handleAddToPlan")})`, {
    buildRoutePlanTitleFromOrders: () => "",
    displayOrderById: new Map([[cancelledOrder.id, cancelledOrder]]),
    isOrderCancelled: (order) => Boolean(order.cancelledAt),
    language: "en",
    plannedOrderIdSet: new Set(),
    plannedOrderIds: [],
    plannedOrderRowById: new Map(),
    setCreateRouteClientError: (message) => popupErrors.push(message),
    setPlanFitRequest() {},
    setPlannedOrderIds() {
      assert.fail("cancelled popup order must not be added");
    },
    setPlannedOrderRows() {},
    setRoutePlanTitle() {},
    setSelectedOrderId() {},
    setSelectedOrderRows() {},
    translate: (_language, _key, params) => `${params.count} cancelled excluded`,
    updatePagedOrderSelection: (orders) => orders,
    useCallback: (callback) => callback,
  });

  addFromPopup(cancelledOrder.id);
  assert.deepEqual(popupErrors, ["1 cancelled excluded"]);
});

test("route creation rejects cancelled orders before client submission and at the BFF boundary", async () => {
  const clientErrors = [];
  let tokenRequests = 0;
  const submit = vm.runInNewContext(`(${extractArrow("submitNewRoute", "handleCreateRoute")})`, {
    DEFAULT_ROUTE_PLAN_TITLE: "CLEVER route draft",
    FormData,
    buildRouteScopeFromOrders: () => ({ deliveryDate: "2026-09-10" }),
    isOrderCancelled: (order) => Boolean(order.cancelledAt),
    language: "en",
    orderFilters: { scope: "planning" },
    plannedOrderIds: ["gid://shopify/Order/1908"],
    plannedOrders: [{ id: "gid://shopify/Order/1908", cancelledAt: "2026-09-03T00:00:00Z" }],
    routeCreatePendingRef: { current: false },
    routePlanFetcher: { state: "idle", submit() { assert.fail("cancelled order must not be submitted"); } },
    routePlanTitle: "Thursday route",
    setCreateRouteClientError: (message) => clientErrors.push(message),
    setRouteCreatePending() {},
    shopify: { idToken() { tokenRequests += 1; } },
    submittedRouteIntentRef: { current: null },
    submittedRouteRequestRef: { current: false },
    translate: (_language, _key, params) => `${params.count} cancelled excluded`,
  });

  await submit("createRouteGroup");
  assert.equal(tokenRequests, 0);
  assert.deepEqual(clientErrors, ["1 cancelled excluded"]);
  assert.match(serverSource, /if \(plannedOrders\.some\(isOrderCancelled\)\)/);
  assert.match(serverSource, /code: "CANCELLED_ORDER_NOT_PLANNABLE"/);
});

test("frozen selection keeps known cancelled exclusions across create and replace", async () => {
  const tableOrders = [
    { id: "cancelled", orderId: "delivery-cancelled", cancelledAt: "2026-09-03T00:00:00Z" },
    { id: "ready", orderId: "delivery-ready" },
  ];
  const pendingSelectionExclusionsRef = { current: null };
  const createSubmissions = [];
  const createSnapshot = vm.runInNewContext(`(${extractArrow("handleSelectAllFilteredOrders", "replaceSelectionExclusions")})`, {
    FormData,
    getOrdersResourceSessionToken: async () => "session-token",
    getSafePerformanceNow: () => 0,
    isOrderCancelled: (order) => Boolean(order.cancelledAt),
    latestSelectionRequestKeyRef: { current: null },
    ordersSelectionFetcher: {
      state: "idle",
      submit(formData) {
        createSubmissions.push(JSON.parse(formData.get("excludeOrderIds")));
      },
    },
    pendingSelectionExclusionsRef,
    resourceFilterSearchParams: new URLSearchParams("deliveryDate=2026-09-10"),
    resourceMetricStartedAtRef: { current: new Map() },
    resourceSequenceRef: { current: 0 },
    selectionSnapshotsEnabled: true,
    snapshotSelectionActive: false,
    tableOrders,
  });

  await createSnapshot();
  assert.deepEqual(createSubmissions.map((ids) => Array.from(ids)), [["delivery-cancelled"]]);
  assert.deepEqual(
    Array.from(pendingSelectionExclusionsRef.current.excludeOrderIds),
    ["delivery-cancelled"],
  );
  assert.match(pageSource, /pendingExclusions\?\.requestKey === ordersSelectionFetcher\.data\._requestKey\s*\? pendingExclusions\.excludeOrderIds\s*: \[\]/);

  const replaceSubmissions = [];
  const replaceSnapshotExclusions = vm.runInNewContext(`(${extractArrow("replaceSelectionExclusions", "handleClearOrderSelection")})`, {
    Array,
    FormData,
    Set,
    getOrdersResourceSessionToken: async () => "session-token",
    getSafePerformanceNow: () => 0,
    isOrderCancelled: (order) => Boolean(order.cancelledAt),
    latestSelectionRequestKeyRef: { current: null },
    ordersSelectionFetcher: {
      state: "idle",
      submit(formData) {
        replaceSubmissions.push(JSON.parse(formData.get("excludeOrderIds")));
      },
    },
    pendingSelectionExclusionsRef,
    resourceMetricStartedAtRef: { current: new Map() },
    resourceSequenceRef: { current: 1 },
    selectionSnapshot: { selectionToken: "opaque" },
    tableOrders,
  });

  await replaceSnapshotExclusions(["delivery-ready"]);
  await replaceSnapshotExclusions([]);
  assert.deepEqual(replaceSubmissions.map((ids) => Array.from(ids)), [
    ["delivery-ready", "delivery-cancelled"],
    ["delivery-cancelled"],
  ]);
});

test("route creation uses a single group-backed action", () => {
  assert.match(pageSource, /const handleCreateRoute = \(\) => submitNewRoute\("createRouteGroup"\)/);
  assert.doesNotMatch(pageSource, /handleCreateRouteGroup|createRoutePlan/);
  assert.doesNotMatch(pageSource, /initialRoute/);
  assert.doesNotMatch(serverSource, /initialRoute/);
  assert.doesNotMatch(serverSource, /\bcreateDeliveryRoutePlan\(/);
  assert.doesNotMatch(serverSource, /createDeliveryRoutePlanBatch/);
  assert.match(serverSource, /const routePlanPayload = buildCreateRoutePlanPayload\(routePlanPayloadInput\)/);
});

test("group creation keeps the existing scoped group endpoint path", () => {
  assert.match(
    serverSource,
    /await createDeliveryRouteGroup\(\s*request,\s*buildCreateRouteGroupPayload\(\{[\s\S]*plannedOrders,[\s\S]*routeScope,[\s\S]*\}\),\s*\{ sessionToken: shopifySessionToken \},\s*\)/,
  );
});

test("batch payload contains exact selected canonical order IDs and no legacy fields", () => {
  const payload = buildCreateRoutePlanBatchPayload({
    departureLocation: {
      address: "123 Main St",
      coordinates: [-79.4, 43.7],
      hasCoordinates: true,
    },
    plannedOrders: [
      { id: "gid://shopify/Order/1", orderId: "11111111-1111-4111-8111-111111111111", deliveryDate: "2026-09-11" },
      { id: "gid://shopify/Order/2", orderId: "22222222-2222-4222-8222-222222222222", deliveryDate: "2026-09-11" },
    ],
    routeName: "Friday route",
    routeScope: { deliveryDate: "2026-09-11" },
  });

  assert.deepEqual(payload, {
    depot: { address: "123 Main St", latitude: 43.7, longitude: -79.4 },
    name: "Friday route",
    orderIds: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ],
    planDate: "2026-09-11",
  });
  assert.equal("orders" in payload, false);
  assert.equal("initialRoute" in payload, false);
});

test("batch wrapper forwards bearer and app scope and returns the actual route", async () => {
  const previousUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousAppId = process.env.CLEVER_APP_ID;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  process.env.CLEVER_APP_ID = "clever-route-test";
  const requests = [];

  try {
    const result = await createDeliveryRoutePlanBatch(
      new Request("https://app.example/app/orders"),
      {
        depot: { address: null, latitude: null, longitude: null },
        name: "Friday route",
        orderIds: ["11111111-1111-4111-8111-111111111111"],
        planDate: "2026-09-11",
      },
      {
        sessionToken: "shopify-session-token",
        fetch: async (url, options) => {
          requests.push({
            authorization: options.headers.authorization,
            appId: options.headers["x-clever-app-id"],
            body: JSON.parse(options.body),
            method: options.method,
            url,
          });
          return Response.json({
            data: { routePlan: { id: "route-plan-1", stopsCount: 1 } },
            error: null,
          }, { status: 201 });
        },
      },
    );

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://delivery.example/admin/route-plans");
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].authorization, "Bearer shopify-session-token");
    assert.equal(requests[0].appId, "clever-route-test");
    assert.deepEqual(requests[0].body, {
      depot: { address: null, latitude: null, longitude: null },
      name: "Friday route",
      orderIds: ["11111111-1111-4111-8111-111111111111"],
      planDate: "2026-09-11",
    });
    assert.deepEqual(result, { routePlan: { id: "route-plan-1", stopsCount: 1 }, errors: [] });
  } finally {
    if (previousUrl === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previousUrl;
    if (previousAppId === undefined) delete process.env.CLEVER_APP_ID;
    else process.env.CLEVER_APP_ID = previousAppId;
  }
});

test("batch wrapper preserves validation and unavailable errors without retry", async () => {
  const previousUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  let requests = 0;

  try {
    for (const [status, code] of [[400, "ROUTE_PLAN_BATCH_INVALID"], [501, "NOT_IMPLEMENTED"]]) {
      const result = await createDeliveryRoutePlanBatch(
        new Request("https://app.example/app/orders"),
        { depot: { address: null, latitude: null, longitude: null }, name: "Route", orderIds: [], planDate: "2026-09-11" },
        {
          sessionToken: "shopify-session-token",
          fetch: async () => {
            requests += 1;
            return Response.json({ data: null, error: { code, message: code } }, { status });
          },
        },
      );
      assert.equal(result.routePlan, null);
      assert.equal(result.errors[0].code, code);
      assert.equal(result.errors[0].status, status);
    }
    assert.equal(requests, 2);
    assert.match(pageSource, /errorCode === "ROUTE_PLAN_BATCH_INVALID"[\s\S]*orders\.routeActions\.invalidRouteSelection/);
    assert.match(pageSource, /errorCode === "NOT_IMPLEMENTED"[\s\S]*orders\.routeActions\.routeCreationUnavailable/);
  } finally {
    if (previousUrl === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previousUrl;
  }
});

test("created route navigation uses the returned entity for the submitted intent", () => {
  const declaration = pageSource.match(/export function getCreatedRouteDestination\([\s\S]*?\n\}/)?.[0];
  assert.ok(declaration);
  const getDestination = vm.runInNewContext(`(${declaration.replace("export ", "")})`, {
    routeGroupPath: (id) => `/app/routes/${id}`,
  });

  assert.equal(
    getDestination("createRouteGroup", { id: "actual-group" }),
    "/app/routes/actual-group",
  );
  assert.equal(getDestination("createRouteGroup", null), null);
  assert.equal(getDestination("addOrdersToRouteGroup", { id: "existing-group" }), null);
});
