/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRouteScopeFromOrders,
  clearDeliveryApiResponseCache,
  buildCreateRoutePlanPayload,
  createDeliveryRoutePlan,
  deleteDeliveryRoutePlan,
  DELIVERY_API_ENDPOINT_NOT_FOUND_ERROR_CODE,
  DELIVERY_API_ERROR_CODE,
  fetchDeliveryRoutePlanDetail,
  fetchDeliveryRoutePlans,
  getDeliveryApiBaseUrl,
  getShopifySessionBearer,
  updateDeliveryRoutePlanStops,
  updateDeliveryRoutePlanDepartureTime,
  assignDeliveryRoutePlanDriver,
} from "./route-plans.server.js";

test("extracts the raw Shopify session token from Authorization or id_token", () => {
  assert.equal(
    getShopifySessionBearer(
      new Request("https://app.example/app/orders?id_token=url-token", {
        headers: { authorization: "Bearer header-token" },
      }),
    ),
    "Bearer header-token",
  );

  assert.equal(
    getShopifySessionBearer(
      new Request("https://app.example/app/orders?id_token=url-token"),
    ),
    "Bearer url-token",
  );

  assert.equal(
    getShopifySessionBearer(new Request("https://app.example/app/orders")),
    null,
  );
});

test("builds a delivery-server route-plan payload from selected Shopify orders", () => {
  const payload = buildCreateRoutePlanPayload({
    departureLocation: {
      address: "123 Tomato Rd, Toronto, ON",
      coordinates: [-79.3871, 43.6426],
      hasCoordinates: true,
    },
    now: new Date("2026-05-08T11:30:00.000Z"),
    plannedOrders: [
      {
        id: "gid://shopify/Order/1001",
        name: "#1001",
        customer: "Kim Minji",
        email: "kim@example.com",
        phone: "+14165550001",
        status: "UNFULFILLED",
        paymentStatus: "PENDING",
        processedAt: "2026-05-07T12:00:00.000Z",
        totalPriceAmount: "95.00",
        currencyCode: "CAD",
        shippingAddress: {
          address1: "300 City Centre Dr",
          address2: "#08",
          city: "Mississauga",
          province: "ON",
          postalCode: "L5B 3C1",
          countryCode: "CA",
        },
        coordinates: [-79.644, 43.589],
        hasCoordinates: true,
        deliveryArea: "Mississauga",
        deliveryDay: "Thursday",
        deliveryDate: "2026-05-07",
        deliverySession: "DAY",
        serviceType: "DELIVERY",
        timeWindowStart: null,
        timeWindowEnd: null,
        routeScopeKey: "2026-05-07|DELIVERY||",
        planningGroupKey: "2026-05-07|DELIVERY|||Mississauga",
        attributeList: [{ key: "Delivery Area", value: "Mississauga" }],
      },
    ],
  });

  assert.deepEqual(payload, {
    name: "CLEVER route draft",
    planDate: "2026-05-07",
    routeScope: {
      deliveryDate: "2026-05-07",
      serviceType: "DELIVERY",
      deliverySession: "DAY",
      timeWindowStart: null,
      timeWindowEnd: null,
      routeScopeKey: "2026-05-07|DELIVERY||",
    },
    depot: {
      address: "123 Tomato Rd, Toronto, ON",
      latitude: 43.6426,
      longitude: -79.3871,
    },
    orders: [
      {
        shopifyOrderGid: "gid://shopify/Order/1001",
        name: "#1001",
        email: "kim@example.com",
        phone: "+14165550001",
        financialStatus: "PENDING",
        fulfillmentStatus: "UNFULFILLED",
        processedAt: "2026-05-07T12:00:00.000Z",
        totalPriceAmount: "95.00",
        currencyCode: "CAD",
        recipientName: "Kim Minji",
        shippingAddress: {
          address1: "300 City Centre Dr",
          address2: "#08",
          city: "Mississauga",
          province: "ON",
          postalCode: "L5B 3C1",
          countryCode: "CA",
        },
        latitude: 43.589,
        longitude: -79.644,
        deliveryArea: "Mississauga",
        deliveryDay: "Thursday",
        deliveryDate: "2026-05-07",
        deliverySession: "DAY",
        serviceType: "DELIVERY",
        timeWindowStart: null,
        timeWindowEnd: null,
        routeScopeKey: "2026-05-07|DELIVERY||",
        planningGroupKey: "2026-05-07|DELIVERY|||Mississauga",
        attributes: [{ key: "Delivery Area", value: "Mississauga" }],
        rawPayload: {
          deliveryArea: "Mississauga",
          deliveryDay: "Thursday",
          deliveryDate: "2026-05-07",
          deliverySession: "DAY",
          serviceType: "DELIVERY",
          timeWindowStart: null,
          timeWindowEnd: null,
          routeScopeKey: "2026-05-07|DELIVERY||",
          planningGroupKey: "2026-05-07|DELIVERY|||Mississauga",
        },
      },
    ],
  });
});


test("builds route-plan payload from the canonical order scope when client scope is stale", () => {
  const staleClientScope = {
    deliveryDate: "2026-05-08",
    serviceType: "DELIVERY",
    deliverySession: "DAY",
    timeWindowStart: null,
    timeWindowEnd: null,
    routeScopeKey: "2026-05-08|DELIVERY||",
  };
  const payload = buildCreateRoutePlanPayload({
    departureLocation: { hasCoordinates: false },
    now: new Date("2026-05-08T11:30:00.000Z"),
    routeScope: staleClientScope,
    plannedOrders: [
      {
        id: "gid://shopify/Order/1002",
        name: "#1002",
        customer: "Lee Hana",
        shippingAddress: {},
        coordinates: [-79.644, 43.589],
        hasCoordinates: true,
        deliveryDate: "2026-05-08",
        deliverySession: "EVENING",
        serviceType: "EVENING_DELIVERY",
        timeWindowStart: "17:00",
        timeWindowEnd: "21:00",
        routeScopeKey: "2026-05-08|EVENING_DELIVERY|17:00|21:00",
      },
    ],
  });

  assert.equal(payload.planDate, "2026-05-08");
  assert.deepEqual(payload.routeScope, {
    deliveryDate: "2026-05-08",
    serviceType: "EVENING_DELIVERY",
    deliverySession: "EVENING",
    timeWindowStart: "17:00",
    timeWindowEnd: "21:00",
    routeScopeKey: "2026-05-08|EVENING_DELIVERY|17:00|21:00",
  });
  assert.equal(
    payload.orders[0].rawPayload.routeScopeKey,
    "2026-05-08|EVENING_DELIVERY|17:00|21:00",
  );
});

test("builds a Friday evening route scope from planned orders", () => {
  assert.deepEqual(
    buildRouteScopeFromOrders([
      {
        deliveryDate: "2026-05-08",
        deliverySession: "EVENING",
        serviceType: "EVENING_DELIVERY",
        timeWindowStart: "17:00",
        timeWindowEnd: "21:00",
        routeScopeKey: "2026-05-08|EVENING_DELIVERY|17:00|21:00",
      },
    ]),
    {
      deliveryDate: "2026-05-08",
      serviceType: "EVENING_DELIVERY",
      deliverySession: "EVENING",
      timeWindowStart: "17:00",
      timeWindowEnd: "21:00",
      routeScopeKey: "2026-05-08|EVENING_DELIVERY|17:00|21:00",
    },
  );
});

test("does not build a route scope when planned orders mix sessions", () => {
  assert.equal(
    buildRouteScopeFromOrders([
      {
        deliveryDate: "2026-05-08",
        deliverySession: "DAY",
        serviceType: "DELIVERY",
        routeScopeKey: "2026-05-08|DELIVERY||",
      },
      {
        deliveryDate: "2026-05-08",
        deliverySession: "EVENING",
        serviceType: "EVENING_DELIVERY",
        timeWindowStart: "17:00",
        timeWindowEnd: "21:00",
        routeScopeKey: "2026-05-08|EVENING_DELIVERY|17:00|21:00",
      },
    ]),
    null,
  );
});

test("uses a provided route name in the delivery-server route-plan payload", () => {
  const payload = buildCreateRoutePlanPayload({
    departureLocation: null,
    now: new Date("2026-05-08T11:30:00.000Z"),
    plannedOrders: [],
    routeName: "Thu 06/25 orders",
    routeScope: { deliveryDate: "2026-06-25" },
  });

  assert.equal(payload.name, "Thu 06/25 orders");
});

test("creates route plans through the delivery Admin API with the Shopify session token", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousAppId = process.env.CLEVER_APP_ID;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  process.env.CLEVER_APP_ID = "clever-route-dev";
  const calls = [];

  const result = await createDeliveryRoutePlan(
    new Request("https://app.example/app/orders?id_token=session-token"),
    { name: "Route", planDate: "2026-05-08", depot: {}, orders: [] },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return new Response(
          JSON.stringify({
            data: {
              routePlan: {
                id: "route-1",
                name: "Route",
                status: "DRAFT",
                planDate: "2026-05-08",
                stopsCount: 0,
                missingCoordinates: 0,
                deliveryAreas: [],
                deliveryDays: [],
                depot: { latitude: null, longitude: null },
                createdAt: "2026-05-08T11:30:00.000Z",
                updatedAt: "2026-05-08T11:30:00.000Z",
              },
            },
            error: null,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      },
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
  if (previousAppId === undefined) {
    delete process.env.CLEVER_APP_ID;
  } else {
    process.env.CLEVER_APP_ID = previousAppId;
  }

  assert.equal(calls[0].url, "https://delivery.example/admin/route-plans");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.authorization, "Bearer session-token");
  assert.equal(calls[0].options.headers["x-clever-app-id"], "clever-route-dev");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.equal(JSON.parse(calls[0].options.body).name, "Route");
  assert.equal(result.routePlan.id, "route-1");
  assert.deepEqual(result.errors, []);
});

test("creates route plans with an explicit Shopify session token from the client", async () => {
  const calls = [];

  const result = await createDeliveryRoutePlan(
    new Request("https://app.example/app/orders"),
    { name: "Route", planDate: "2026-05-08", depot: {}, orders: [] },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: {
            routePlan: {
              id: "route-2",
              name: "Route",
              status: "DRAFT",
            },
          },
          error: null,
        });
      },
      sessionToken: "client-session-token",
    },
  );

  assert.equal(calls[0].options.headers.authorization, "Bearer client-session-token");
  assert.equal(calls[0].options.headers["x-clever-app-id"], "clever");
  assert.equal(result.routePlan.id, "route-2");
  assert.deepEqual(result.errors, []);
});

test("returns a route-plan API error instead of throwing when delivery API is unreachable", async () => {
  const result = await createDeliveryRoutePlan(
    new Request("https://app.example/app/orders"),
    { name: "Route", planDate: "2026-05-08", depot: {}, orders: [] },
    {
      fetch: async () => {
        throw new Error("connect ECONNREFUSED");
      },
      sessionToken: "client-session-token",
    },
  );

  assert.equal(result.routePlan, null);
  assert.equal(result.errors[0].code, "DELIVERY_API_ERROR");
  assert.equal(result.errors[0].path, "/admin/route-plans");
  assert.equal(result.errors[0].status, 0);
  assert.match(result.errors[0].message, /Delivery route plan API 호출에 실패했습니다/);
  assert.match(result.errors[0].message, /connect ECONNREFUSED/);
});

test("lists and reads persisted route plans through the delivery Admin API", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  const urls = [];
  const fetch = async (url, options) => {
    urls.push({ url, authorization: options.headers.authorization });
    if (url.endsWith("/route-1")) {
      return Response.json({
        data: {
          routePlan: { id: "route-1", name: "Route", status: "DRAFT" },
          routeGeometry: {
            type: "LineString",
            coordinates: [
              [-79.3832, 43.6532],
              [-79.2571, 43.7764],
            ],
          },
          routeStopPoints: [
            {
              deliveryStopId: "stop-1",
              shopifyOrderGid: "gid://shopify/Order/1001",
              sequence: 1,
              inputCoordinates: [-79.644, 43.589],
              snappedCoordinates: [-79.643565, 43.589371],
              snapDistanceMeters: 54.16,
              name: "Duke of York Boulevard",
            },
          ],
          stops: [
            {
              deliveryStopId: "stop-1",
              sequence: 1,
              shopifyOrderGid: "gid://shopify/Order/1001",
              orderName: "#1001",
              recipientName: "Kim Minji",
              address: { address1: "300 City Centre Dr", city: "Mississauga" },
              paymentStatus: "PENDING",
              status: "PENDING",
              attributes: [],
              coordinates: { latitude: 43.589, longitude: -79.644 },
            },
          ],
        },
        error: null,
      });
    }

    return Response.json({
      data: { routePlans: [{ id: "route-1", name: "Route", status: "DRAFT" }] },
      error: null,
    });
  };

  const request = new Request("https://app.example/app/routes", {
    headers: { authorization: "Bearer session-token" },
  });

  const listResult = await fetchDeliveryRoutePlans(request, { fetch });
  const detailResult = await fetchDeliveryRoutePlanDetail(request, "route-1", { fetch });

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.deepEqual(urls, [
    {
      url: "https://delivery.example/admin/route-plans",
      authorization: "Bearer session-token",
    },
    {
      url: "https://delivery.example/admin/route-plans/route-1",
      authorization: "Bearer session-token",
    },
  ]);
  assert.equal(listResult.routePlans[0].id, "route-1");
  assert.equal(detailResult.routePlan.id, "route-1");
  assert.equal(detailResult.stops[0].shopifyOrderGid, "gid://shopify/Order/1001");
  assert.equal(detailResult.routeGeometry.type, "LineString");
  assert.deepEqual(detailResult.routeStopPoints, [
    {
      deliveryStopId: "stop-1",
      shopifyOrderGid: "gid://shopify/Order/1001",
      sequence: 1,
      inputCoordinates: [-79.644, 43.589],
      snappedCoordinates: [-79.643565, 43.589371],
      snapDistanceMeters: 54.16,
      name: "Duke of York Boulevard",
    },
  ]);
});

test("deletes persisted route plans through the delivery Admin API", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  const calls = [];
  const result = await deleteDeliveryRoutePlan(
    new Request("https://app.example/app/routes?id_token=session-token"),
    "route 1",
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: { routePlanId: "route 1" },
          error: null,
        });
      },
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.equal(calls[0].url, "https://delivery.example/admin/route-plans/route%201");
  assert.equal(calls[0].options.method, "DELETE");
  assert.equal(calls[0].options.headers.authorization, "Bearer session-token");
  assert.equal(result.routePlanId, "route 1");
  assert.deepEqual(result.errors, []);
});

test("updates route plan stops through the delivery Admin API", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  const calls = [];
  const result = await updateDeliveryRoutePlanStops(
    new Request("https://app.example/app/routes/route-1"),
    "route 1",
    {
      stops: [
        {
          deliveryStopId: "stop-1",
          shopifyOrderGid: "gid://shopify/Order/1001",
          sequence: 1,
        },
        {
          deliveryStopId: null,
          shopifyOrderGid: "gid://shopify/Order/1002",
          sequence: 2,
        },
      ],
    },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: {
            routePlan: { id: "route 1", stopsCount: 2 },
            routeStopPoints: [
              {
                deliveryStopId: "stop-1",
                shopifyOrderGid: "gid://shopify/Order/1001",
                sequence: 1,
                inputCoordinates: [-79.644, 43.589],
                snappedCoordinates: [-79.643565, 43.589371],
                snapDistanceMeters: 54.16,
                name: "Duke of York Boulevard",
              },
            ],
            stops: [{ shopifyOrderGid: "gid://shopify/Order/1001", sequence: 1 }],
          },
          error: null,
        });
      },
      sessionToken: "client-session-token",
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.equal(calls[0].url, "https://delivery.example/admin/route-plans/route%201/stops");
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.headers.authorization, "Bearer client-session-token");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    stops: [
      {
        deliveryStopId: "stop-1",
        shopifyOrderGid: "gid://shopify/Order/1001",
        sequence: 1,
      },
      {
        deliveryStopId: null,
        shopifyOrderGid: "gid://shopify/Order/1002",
        sequence: 2,
      },
    ],
  });
  assert.equal(result.routePlan.id, "route 1");
  assert.equal(result.stops[0].sequence, 1);
  assert.equal(result.routeStopPoints[0].snapDistanceMeters, 54.16);
  assert.deepEqual(result.errors, []);
});

test("updates a child route departure time through the delivery Admin API", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  const calls = [];
  const result = await updateDeliveryRoutePlanDepartureTime(
    new Request("https://app.example/app/routes/route-1"),
    "route 1",
    { departureTime: "08:30" },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: { routePlan: { departureTime: "08:30", id: "route 1" } },
          error: null,
        });
      },
      sessionToken: "client-session-token",
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.equal(calls[0].url, "https://delivery.example/admin/route-plans/route%201/departure-time");
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.headers.authorization, "Bearer client-session-token");
  assert.deepEqual(JSON.parse(calls[0].options.body), { departureTime: "08:30" });
  assert.equal(result.routePlan.departureTime, "08:30");
  assert.deepEqual(result.errors, []);
});


test("assigns route plan drivers through the delivery Admin API", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  const calls = [];
  const result = await assignDeliveryRoutePlanDriver(
    new Request("https://app.example/app/routes/route-1"),
    "route 1",
    { driverId: "driver-pending-id" },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: {
            routePlan: {
              id: "route 1",
              driverId: "driver-pending-id",
              driver: {
                id: "driver-pending-id",
                displayName: "Pending Driver",
                phone: "+14165550123",
                status: "PENDING",
                authStatus: "INVITE_PENDING",
                authSubject: null,
                lastSeenAt: null,
              },
            },
            routeGeometry: null,
            routeStopPoints: [],
            stops: [],
          },
          error: null,
        });
      },
      sessionToken: "client-session-token",
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.equal(calls[0].url, "https://delivery.example/admin/route-plans/route%201/driver");
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.headers.authorization, "Bearer client-session-token");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), { driverId: "driver-pending-id" });
  assert.equal(result.routePlan.driverId, "driver-pending-id");
  assert.equal(result.routePlan.driver.authStatus, "INVITE_PENDING");
  assert.deepEqual(result.errors, []);
});

test("returns an actionable error when the delivery API driver endpoint is missing", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";

  try {
    const result = await assignDeliveryRoutePlanDriver(
      new Request("https://app.example/app/routes/route-1"),
      "route 1",
      { driverId: "driver-pending-id" },
      {
        fetch: async () =>
          Response.json(
            {
              data: null,
              error: { code: "NOT_FOUND", message: "Not Found" },
            },
            { status: 404 },
          ),
        sessionToken: "client-session-token",
      },
    );

    assert.equal(result.routePlan, null);
    assert.equal(result.errors[0].code, "DELIVERY_API_DRIVER_ENDPOINT_NOT_FOUND");
    assert.equal(result.errors[0].status, 404);
    assert.match(result.errors[0].message, /배송원 저장 API를 찾지 못했습니다/);
    assert.match(
      result.errors[0].message,
      /https:\/\/delivery\.example\/admin\/route-plans\/route%201\/driver/,
    );
    assert.match(result.errors[0].message, /CLEVER_DELIVERY_API_URL/);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
  }
});

test("classifies generic delivery API 404 responses as endpoint-not-found", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";

  try {
    const result = await fetchDeliveryRoutePlans(
      new Request("https://app.example/app/routes?id_token=session-token"),
      {
        fetch: async () =>
          Response.json({ message: "Route GET:/admin/route-plans not found", error: "Not Found" }, { status: 404 }),
      },
    );

    assert.equal(result.routePlans.length, 0);
    assert.equal(result.errors[0].code, DELIVERY_API_ENDPOINT_NOT_FOUND_ERROR_CODE);
    assert.equal(result.errors[0].message, "Delivery API endpoint를 찾지 못했습니다.");
    assert.equal(result.errors[0].status, 404);
    assert.equal(result.errors[0].path, "/admin/route-plans");
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
  }
});

test("preserves route plan not found errors from the delivery API driver endpoint", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";

  try {
    const result = await assignDeliveryRoutePlanDriver(
      new Request("https://app.example/app/routes/route-1"),
      "route 1",
      { driverId: "driver-pending-id" },
      {
        fetch: async () =>
          Response.json(
            {
              data: null,
              error: { code: "NOT_FOUND", message: "Route plan not found" },
            },
            { status: 404 },
          ),
        sessionToken: "client-session-token",
      },
    );

    assert.equal(result.routePlan, null);
    assert.equal(result.errors[0].code, "NOT_FOUND");
    assert.equal(result.errors[0].message, "Route plan not found");
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
  }
});

test("returns an actionable error when a delivery API call has no session token", async () => {
  let called = false;
  const result = await fetchDeliveryRoutePlans(
    new Request("https://app.example/app/routes"),
    {
      fetch: async () => {
        called = true;
        return Response.json({});
      },
    },
  );

  assert.equal(called, false);
  assert.deepEqual(result.routePlans, []);
  assert.equal(result.errors[0].code, "DELIVERY_SESSION_TOKEN_MISSING");
});

test("requires an explicit delivery API URL instead of falling back to production", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  delete process.env.CLEVER_DELIVERY_API_URL;

  let called = false;

  try {
    assert.throws(() => getDeliveryApiBaseUrl(), /CLEVER_DELIVERY_API_URL/);

    const result = await fetchDeliveryRoutePlans(
      new Request("https://app.example/app/routes", {
        headers: { authorization: "Bearer session-token" },
      }),
      {
        fetch: async () => {
          called = true;
          return Response.json({});
        },
      },
    );

    assert.equal(called, false);
    assert.deepEqual(result.routePlans, []);
    assert.equal(result.errors[0].code, DELIVERY_API_ERROR_CODE);
    assert.match(result.errors[0].message, /CLEVER_DELIVERY_API_URL/);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
  }
});

test("invalidates cached delivery route GET responses after successful mutations", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  const previousTtl = process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "5000";
  clearDeliveryApiResponseCache();

  let listCalls = 0;
  const fetch = async (url, options) => {
    if (options.method === "GET" && url.endsWith("/admin/route-plans")) {
      listCalls += 1;
      return Response.json({
        data: {
          routePlans: [{ id: `route-${listCalls}`, name: `Route ${listCalls}` }],
        },
        error: null,
      });
    }

    if (options.method === "DELETE" && url.endsWith("/admin/route-plans/route-1")) {
      return Response.json({
        data: { routePlanId: "route-1", deleted: true },
        error: null,
      });
    }

    throw new Error(`Unexpected request ${options.method} ${url}`);
  };
  const request = new Request("https://app.example/app/routes", {
    headers: { authorization: "Bearer session-token" },
  });

  try {
    const first = await fetchDeliveryRoutePlans(request, { fetch });
    const second = await fetchDeliveryRoutePlans(request, { fetch });

    assert.equal(listCalls, 1);
    assert.equal(first.routePlans[0].id, "route-1");
    assert.equal(second.routePlans[0].id, "route-1");

    await deleteDeliveryRoutePlan(request, "route-1", { fetch });
    const third = await fetchDeliveryRoutePlans(request, { fetch });

    assert.equal(listCalls, 2);
    assert.equal(third.routePlans[0].id, "route-2");
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_URL;
    } else {
      process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
    }
    if (previousTtl === undefined) {
      delete process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = previousTtl;
    }
    clearDeliveryApiResponseCache();
  }
});
