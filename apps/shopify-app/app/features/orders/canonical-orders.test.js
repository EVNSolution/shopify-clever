import test from "node:test";
import assert from "node:assert/strict";
import {
  getOrderSyncSnapshots,
  isOrderReadyToPlan,
  mapCanonicalOrdersToOrderRows,
  mergeShopifyOrderRowsWithCanonicalRows,
} from "./canonical-orders.js";

test("maps server canonical orders to existing Orders row shape", () => {
  const rawPayload = {
    id: "gid://shopify/Order/1001",
    legacyResourceId: "1001",
    name: "#1001",
    updatedAt: "2026-05-07T13:00:00.000Z",
  };
  const rows = mapCanonicalOrdersToOrderRows([
    {
      orderId: "local-order-1",
      deliveryStopId: "stop-1",
      shopifyOrderGid: "gid://shopify/Order/1001",
      shopifyOrderLegacyId: "1001",
      name: "#1001",
      recipientName: "Kim Minji",
      email: "kim@example.com",
      phone: "+14165550000",
      financialStatus: "PAID",
      fulfillmentStatus: "UNFULFILLED",
      deliveryStopStatus: "ASSIGNED",
      processedAt: "2026-05-07T12:00:00.000Z",
      updatedAtShopify: "2026-05-07T13:00:00.000Z",
      totalPriceAmount: "95.00",
      currencyCode: "CAD",
      deliveryArea: "Mississauga",
      deliveryDayRaw: "Friday",
      orderCreatedAt: "2026-05-01T15:30:00.000Z",
      orderDateLocal: "2026-05-01",
      deliveryBatchStartDate: "2026-05-07",
      deliveryBatchEndDate: "2026-05-09",
      deliveryDate: "2026-05-08",
      deliveryDateSource: "LINE_ITEM_DATE_RANGE",
      deliverySession: "DAY",
      routeScopeKey: "2026-05-08|DELIVERY||",
      planningGroupKey: "2026-05-08|DELIVERY|||Mississauga",
      serviceType: "DELIVERY",
      timeWindowStart: null,
      timeWindowEnd: null,
      shippingAddress: {
        address1: "300 City Centre Dr",
        address2: "#08",
        city: "Mississauga",
        province: "ON",
        postalCode: "L5B 3C1",
        countryCode: "CA",
      },
      latitude: "43.589",
      longitude: "-79.644",
      hasCoordinates: true,
      readiness: "READY_TO_PLAN",
      reviewReasons: [],
      planningStatus: "UNPLANNED",
      shopifyOrderSnapshot: rawPayload,
      rawPayload,
    },
  ]);

  assert.deepEqual(rows, [
    {
      id: "gid://shopify/Order/1001",
      orderId: "local-order-1",
      deliveryStopId: "stop-1",
      legacyResourceId: "1001",
      name: "#1001",
      customer: "Kim Minji",
      address: "300 City Centre Dr, #08, Mississauga, ON, L5B 3C1, CA",
      status: "UNFULFILLED",
      deliveryStatus: undefined,
      deliveryStopStatus: "ASSIGNED",
      paymentStatus: "PAID",
      eta: "—",
      email: "kim@example.com",
      phone: "+14165550000",
      processedAt: "2026-05-07T12:00:00.000Z",
      updatedAt: "2026-05-07T13:00:00.000Z",
      cancelledAt: undefined,
      totalPriceAmount: "95.00",
      currencyCode: "CAD",
      lineItems: undefined,
      attributes: "Delivery Area: Mississauga, Delivery Day: Friday",
      attributeList: [
        { key: "Delivery Area", value: "Mississauga" },
        { key: "Delivery Day", value: "Friday" },
      ],
      deliveryArea: "Mississauga",
      deliveryDay: "Friday",
      orderCreatedAt: "2026-05-01T15:30:00.000Z",
      orderedDate: "2026-05-01",
      deliveryBatchStartDate: "2026-05-07",
      deliveryBatchEndDate: "2026-05-09",
      deliveryDate: "2026-05-08",
      deliveryDateSource: "LINE_ITEM_DATE_RANGE",
      deliverySession: "DAY",
      deliveryLabel: "Fri 05/08",
      routeScopeKey: "2026-05-08|DELIVERY||",
      planningGroupKey: "2026-05-08|DELIVERY|||Mississauga",
      timeWindowStart: undefined,
      timeWindowEnd: undefined,
      coordinates: [-79.644, 43.589],
      hasCoordinates: true,
      shippingAddress: {
        address1: "300 City Centre Dr",
        address2: "#08",
        city: "Mississauga",
        province: "ON",
        postalCode: "L5B 3C1",
        countryCode: "CA",
      },
      readiness: "READY_TO_PLAN",
      reviewReasons: [],
      planningStatus: "UNPLANNED",
      serviceType: "DELIVERY",
      shopifyOrderSnapshot: rawPayload,
      rawPayload,
    },
  ]);
});

test("canonical order adapter falls back safely and only trusts numeric coordinates", () => {
  const [row] = mapCanonicalOrdersToOrderRows([
    {
      shopifyOrderGid: "gid://shopify/Order/1002",
      recipientName: "   ",
      fulfillmentStatus: "PENDING",
      financialStatus: "PENDING",
      deliveryDayRaw: null,
      shippingAddress: {
        address1: "",
        city: "Toronto",
        province: "ON",
      },
      latitude: "not-a-number",
      longitude: -79.3832,
      hasCoordinates: true,
    },
  ]);

  assert.equal(row.customer, "Unknown recipient");
  assert.equal(row.address, "Toronto, ON");
  assert.deepEqual(row.coordinates, [undefined, undefined]);
  assert.equal(row.hasCoordinates, false);
});

test("canonical order adapter labels Friday evening route scope distinctly", () => {
  const [row] = mapCanonicalOrdersToOrderRows([
    {
      shopifyOrderGid: "gid://shopify/Order/1004",
      name: "#1004",
      recipientName: "Lee Hana",
      deliveryArea: "Thornhill",
      deliveryDayRaw: "Friday 5pm to 9pm *Check delivery map",
      deliveryDate: "2026-05-08",
      deliverySession: "EVENING",
      serviceType: "EVENING_DELIVERY",
      timeWindowStart: "17:00",
      timeWindowEnd: "21:00",
      routeScopeKey: "2026-05-08|EVENING_DELIVERY|17:00|21:00",
      planningGroupKey: "2026-05-08|EVENING_DELIVERY|17:00|21:00|Thornhill",
      latitude: 43.8,
      longitude: -79.4,
      hasCoordinates: true,
      readiness: "READY_TO_PLAN",
      shippingAddress: {
        address1: "5 Mabley Crescent",
        city: "Thornhill",
        province: "ON",
      },
    },
  ]);

  assert.equal(row.deliveryLabel, "Fri 05/08 · 5–9pm");
  assert.equal(row.deliverySession, "EVENING");
  assert.equal(row.serviceType, "EVENING_DELIVERY");
  assert.equal(row.routeScopeKey, "2026-05-08|EVENING_DELIVERY|17:00|21:00");
});

test("canonical order adapter avoids bare weekday delivery labels", () => {
  const [row] = mapCanonicalOrdersToOrderRows([
    {
      shopifyOrderGid: "gid://shopify/Order/1005",
      deliveryDayRaw: "Friday",
      recipientName: "No Date",
    },
  ]);

  assert.equal(row.deliveryDay, "Friday");
  assert.equal(row.deliveryLabel, undefined);
});

test("canonical order adapter preserves route assignment metadata", () => {
  const [row] = mapCanonicalOrdersToOrderRows([
    {
      shopifyOrderGid: "gid://shopify/Order/1007",
      name: "#1007",
      planningStatus: "PLANNED",
      routePlanId: "route-plan-1",
      routeStatus: "DRAFT",
      routePlanName: "CLEVER route draft",
      routeSequence: "3",
    },
  ]);

  assert.equal(row.planningStatus, "PLANNED");
  assert.equal(row.routePlanId, "route-plan-1");
  assert.equal(row.routeStatus, "DRAFT");
  assert.equal(row.routePlanName, "CLEVER route draft");
  assert.equal(row.routeSequence, 3);
});

test("isOrderReadyToPlan requires coordinates and only accepts READY_TO_PLAN when readiness exists", () => {
  assert.equal(
    isOrderReadyToPlan({ hasCoordinates: false, readiness: "READY_TO_PLAN" }),
    false,
  );
  assert.equal(isOrderReadyToPlan({ hasCoordinates: true }), true);
  assert.equal(isOrderReadyToPlan({ hasCoordinates: true, readiness: null }), true);
  assert.equal(
    isOrderReadyToPlan({ hasCoordinates: true, readiness: "READY_TO_PLAN" }),
    true,
  );
  assert.equal(
    isOrderReadyToPlan({ hasCoordinates: true, readiness: "NEEDS_REVIEW" }),
    false,
  );
});

test("merges server planning metadata into Shopify rows without losing sync snapshots", () => {
  const shopifySnapshot = {
    id: "gid://shopify/Order/1001",
    legacyResourceId: "1001",
    name: "#1001",
    updatedAt: "2026-05-07T13:00:00.000Z",
  };
  const shopifyRows = [
    {
      id: "gid://shopify/Order/1001",
      name: "#1001",
      customer: "Shopify recipient",
      planningStatus: "UNPLANNED",
      shopifyOrderSnapshot: shopifySnapshot,
    },
    {
      id: "gid://shopify/Order/1002",
      name: "#1002",
      planningStatus: "UNPLANNED",
      shopifyOrderSnapshot: {
        id: "gid://shopify/Order/1002",
        legacyResourceId: "1002",
        name: "#1002",
        updatedAt: "2026-05-07T14:00:00.000Z",
      },
    },
  ];
  const canonicalRows = [
    {
      id: "gid://shopify/Order/1001",
      name: "#1001",
      customer: "Server recipient",
      planningStatus: "PLANNED",
      routePlanId: "route-plan-1",
      routeStatus: "DRAFT",
      shopifyOrderSnapshot: {
        id: "gid://shopify/Order/1001",
      },
    },
  ];

  const mergedRows = mergeShopifyOrderRowsWithCanonicalRows(shopifyRows, canonicalRows);

  assert.equal(mergedRows[0].planningStatus, "PLANNED");
  assert.equal(mergedRows[0].routePlanId, "route-plan-1");
  assert.equal(mergedRows[0].routeStatus, "DRAFT");
  assert.equal(mergedRows[0].customer, "Server recipient");
  assert.equal(mergedRows[0].shopifyOrderSnapshot, shopifySnapshot);
  assert.deepEqual(getOrderSyncSnapshots(mergedRows), [
    shopifySnapshot,
    shopifyRows[1].shopifyOrderSnapshot,
  ]);
  assert.equal(mergedRows[1], shopifyRows[1]);
});

test("keeps canonical-only order rows for history and all-orders coverage", () => {
  const recentShopifyRow = {
    id: "gid://shopify/Order/1001",
    name: "#1001",
    customer: "Recent Shopify row",
    shopifyOrderSnapshot: {
      id: "gid://shopify/Order/1001",
      legacyResourceId: "1001",
      name: "#1001",
      updatedAt: "2026-05-07T13:00:00.000Z",
    },
  };
  const historicalCanonicalRow = {
    id: "gid://shopify/Order/0999",
    name: "#0999",
    customer: "Historical canonical row",
    deliveryDate: "2026-04-30",
    planningStatus: "DELIVERED",
    shopifyOrderSnapshot: {
      id: "gid://shopify/Order/0999",
      legacyResourceId: "999",
      name: "#0999",
      updatedAt: "2026-04-30T13:00:00.000Z",
    },
  };

  const mergedRows = mergeShopifyOrderRowsWithCanonicalRows(
    [recentShopifyRow],
    [historicalCanonicalRow],
  );

  assert.equal(mergedRows.length, 2);
  assert.equal(mergedRows[0], recentShopifyRow);
  assert.equal(mergedRows[1], historicalCanonicalRow);
  assert.deepEqual(
    getOrderSyncSnapshots(mergedRows),
    [recentShopifyRow.shopifyOrderSnapshot, historicalCanonicalRow.shopifyOrderSnapshot],
  );
});

test("preserves canonical-only rows without sync snapshots when background sync refreshes loaded rows", () => {
  const loadedShopifyRow = {
    id: "gid://shopify/Order/1001",
    name: "#1001",
    customer: "Loaded Shopify row",
    planningStatus: "UNPLANNED",
    shopifyOrderSnapshot: {
      id: "gid://shopify/Order/1001",
      legacyResourceId: "1001",
      name: "#1001",
      updatedAt: "2026-05-07T13:00:00.000Z",
    },
  };
  const canonicalOnlyHistoryRow = {
    id: "gid://shopify/Order/0901",
    name: "#0901",
    customer: "Canonical history row",
    deliveryDate: "2026-04-01",
    planningStatus: "DELIVERED",
  };
  const refreshedSyncedRow = {
    id: "gid://shopify/Order/1001",
    name: "#1001",
    customer: "Refreshed server row",
    readiness: "READY_TO_PLAN",
  };

  const mergedRows = mergeShopifyOrderRowsWithCanonicalRows(
    [loadedShopifyRow, canonicalOnlyHistoryRow],
    [refreshedSyncedRow],
  );

  assert.equal(mergedRows.length, 2);
  assert.equal(mergedRows[0].customer, "Refreshed server row");
  assert.equal(mergedRows[0].readiness, "READY_TO_PLAN");
  assert.equal(mergedRows[0].shopifyOrderSnapshot, loadedShopifyRow.shopifyOrderSnapshot);
  assert.equal(mergedRows[1], canonicalOnlyHistoryRow);
});

test("getOrderSyncSnapshots returns only server-acceptable Shopify snapshots", () => {
  const completeSnapshot = {
    id: "gid://shopify/Order/1001",
    legacyResourceId: "1001",
    name: "#1001",
    updatedAt: "2026-05-07T13:00:00.000Z",
  };
  const completeRawPayload = {
    id: "gid://shopify/Order/1002",
    legacyResourceId: "1002",
    name: "#1002",
    updatedAt: "2026-05-07T14:00:00.000Z",
    paymentGatewayNames: ["Email Money Transfer"],
    note: "",
    phone: "",
    customAttributes: [{ key: "Delivery Area", value: "" }],
    lineItems: {
      nodes: [{ title: "CLEVER", sku: "", variantTitle: "" }],
    },
    shippingAddress: {
      address1: "300 City Centre Dr",
      address2: "",
      phone: "",
    },
  };

  assert.deepEqual(
    getOrderSyncSnapshots([
      { shopifyOrderSnapshot: completeSnapshot, rawPayload: { id: "missing" } },
      { rawPayload: completeRawPayload },
      {
        shopifyOrderSnapshot: {
          id: "gid://shopify/Order/1003",
          name: "#1003",
          updatedAt: "2026-05-07T15:00:00.000Z",
        },
      },
      {
        shopifyOrderSnapshot: {
          id: "gid://shopify/Order/1004",
          legacyResourceId: "1004",
          updatedAt: "2026-05-07T16:00:00.000Z",
        },
      },
      { shopifyOrderSnapshot: null, rawPayload: null },
    ]),
    [
      completeSnapshot,
      {
        ...completeRawPayload,
        customAttributes: [],
        lineItems: {
          nodes: [{ title: "CLEVER", sku: null, variantTitle: null }],
        },
        note: null,
        phone: null,
        shippingAddress: {
          address1: "300 City Centre Dr",
          address2: null,
          phone: null,
        },
      },
    ],
  );
});

test("getOrderSyncSnapshots normalizes optional fields for the strict delivery parser", () => {
  assert.deepEqual(
    getOrderSyncSnapshots([
      {
        rawPayload: {
          id: "gid://shopify/Order/1006",
          legacyResourceId: "1006",
          name: "#1006",
          updatedAt: "2026-05-07T16:00:00.000Z",
          cancelledAt: "not-a-date",
          createdAt: "2026-05-07T13:00:00.000Z",
          currentTotalPriceSet: {
            shopMoney: {
              amount: 105.5,
              currencyCode: "CAD",
            },
          },
          paymentGatewayNames: ["Cash on Delivery (COD)", 7, null],
          customAttributes: [
            { key: "Delivery Area", value: "Scarborough" },
            { key: "tomatono_lat", value: "" },
            { key: "", value: "ignored" },
          ],
          lineItems: {
            nodes: [
              {
                title: "CLEVER",
                name: "",
                quantity: "2",
                sku: "",
                variantTitle: "Box",
              },
              {
                title: "Invalid quantity",
                quantity: "many",
              },
            ],
          },
          shippingAddress: {
            name: "Ryan Jung",
            address1: "200 Town Centre Ct",
            address2: "",
            city: "Scarborough",
            province: "ON",
            provinceCode: "ON",
            zip: "M1P 4Y7",
            countryCodeV2: "CA",
            latitude: "43.7764",
            longitude: "-79.2581",
          },
        },
      },
    ]),
    [
      {
        id: "gid://shopify/Order/1006",
        legacyResourceId: "1006",
        name: "#1006",
        updatedAt: "2026-05-07T16:00:00.000Z",
        cancelledAt: null,
        createdAt: "2026-05-07T13:00:00.000Z",
        currentTotalPriceSet: {
          shopMoney: {
            amount: "105.5",
            currencyCode: "CAD",
          },
        },
        paymentGatewayNames: ["Cash on Delivery (COD)"],
        customAttributes: [{ key: "Delivery Area", value: "Scarborough" }],
        lineItems: {
          nodes: [
            {
              title: "CLEVER",
              name: null,
              quantity: 2,
              sku: null,
              variantTitle: "Box",
            },
            {
              title: "Invalid quantity",
              quantity: null,
            },
          ],
        },
        shippingAddress: {
          name: "Ryan Jung",
          address1: "200 Town Centre Ct",
          address2: null,
          city: "Scarborough",
          province: "ON",
          provinceCode: "ON",
          zip: "M1P 4Y7",
          countryCodeV2: "CA",
          latitude: 43.7764,
          longitude: -79.2581,
        },
      },
    ],
  );
});
