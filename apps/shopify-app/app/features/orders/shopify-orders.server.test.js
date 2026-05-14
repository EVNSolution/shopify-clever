import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import {
  clearShopifyOrdersCache,
  fetchShopifyOrders,
  ORDER_SCOPE_ACCESS_ERROR_CODE,
  PROTECTED_ORDER_ACCESS_ERROR_CODE,
  SHOPIFY_ORDERS_QUERY,
  mapShopifyOrdersResponse,
} from "./shopify-orders.server.js";

test("orders query reads Shopify orders without requiring customer scope", () => {
  assert.match(SHOPIFY_ORDERS_QUERY, /orders\(first: 50, sortKey: CREATED_AT, reverse: true\)/);
  assert.match(SHOPIFY_ORDERS_QUERY, /shippingAddress\s*\{/);
  assert.match(SHOPIFY_ORDERS_QUERY, /legacyResourceId/);
  assert.doesNotMatch(SHOPIFY_ORDERS_QUERY, /\bemail\b/);
  assert.match(SHOPIFY_ORDERS_QUERY, /createdAt/);
  assert.match(SHOPIFY_ORDERS_QUERY, /updatedAt/);
  assert.match(SHOPIFY_ORDERS_QUERY, /cancelledAt/);
  assert.match(SHOPIFY_ORDERS_QUERY, /note/);
  assert.match(SHOPIFY_ORDERS_QUERY, /processedAt/);
  assert.match(SHOPIFY_ORDERS_QUERY, /currentTotalPriceSet\s*\{/);
  assert.match(SHOPIFY_ORDERS_QUERY, /customAttributes\s*\{/);
  assert.match(SHOPIFY_ORDERS_QUERY, /lineItems\(first: 20\)\s*\{/);
  assert.match(SHOPIFY_ORDERS_QUERY, /title/);
  assert.match(SHOPIFY_ORDERS_QUERY, /variantTitle/);
  assert.match(SHOPIFY_ORDERS_QUERY, /quantity/);
  assert.match(SHOPIFY_ORDERS_QUERY, /sku/);
  assert.match(SHOPIFY_ORDERS_QUERY, /latitude/);
  assert.match(SHOPIFY_ORDERS_QUERY, /province/);
  assert.match(SHOPIFY_ORDERS_QUERY, /provinceCode/);
  assert.match(SHOPIFY_ORDERS_QUERY, /longitude/);
  assert.equal(SHOPIFY_ORDERS_QUERY.includes("customer {"), false);
});

test("maps Shopify orders into map-ready rows", () => {
  const rows = mapShopifyOrdersResponse({
    data: {
      orders: {
        edges: [
          {
            node: {
              id: "gid://shopify/Order/1001",
              name: "#1001",
              legacyResourceId: "1001",
              createdAt: "2026-05-01T15:30:00.000Z",
              updatedAt: "2026-05-07T13:00:00.000Z",
              cancelledAt: null,
              note: "Leave at reception",
              displayFulfillmentStatus: "UNFULFILLED",
              displayFinancialStatus: "PENDING",
              phone: "+82 10-0000-0000",
              processedAt: "2026-05-07T12:00:00.000Z",
              currentTotalPriceSet: {
                shopMoney: {
                  amount: "95.00",
                  currencyCode: "CAD",
                },
              },
              customAttributes: [
                { key: "Delivery Area", value: "Markham" },
                { key: "Delivery Day", value: "Friday" },
              ],
              lineItems: {
                nodes: [
                  {
                    title: "토마토노 밀키트 세트 5/7-5/9",
                    name: "TOMATONO MEAL KIT SET",
                    variantTitle: "Premium",
                    quantity: 1,
                    sku: "MEALKIT",
                  },
                ],
              },
              shippingAddress: {
                name: "Kim Minji",
                address1: "Gangnam-daero 396",
                address2: "3F",
                city: "Seoul",
                province: "Seoul",
                provinceCode: "KR-11",
                zip: "06232",
                countryCodeV2: "KR",
                latitude: 37.4979,
                longitude: 127.0276,
              },
            },
          },
        ],
      },
    },
  });

  assert.deepEqual(rows, [
    {
      id: "gid://shopify/Order/1001",
      name: "#1001",
      customer: "Kim Minji",
      address: "Gangnam-daero 396, 3F, Seoul, KR-11, 06232, KR",
      status: "UNFULFILLED",
      paymentStatus: "PENDING",
      eta: "—",
      legacyResourceId: "1001",
      createdAt: "2026-05-01T15:30:00.000Z",
      updatedAt: "2026-05-07T13:00:00.000Z",
      cancelledAt: undefined,
      note: "Leave at reception",
      phone: "+82 10-0000-0000",
      processedAt: "2026-05-07T12:00:00.000Z",
      totalPriceAmount: "95.00",
      currencyCode: "CAD",
      shippingAddress: {
        address1: "Gangnam-daero 396",
        address2: "3F",
        city: "Seoul",
        province: "KR-11",
        postalCode: "06232",
        countryCode: "KR",
      },
      attributes: "Delivery Area: Markham, Delivery Day: Friday",
      attributeList: [
        { key: "Delivery Area", value: "Markham" },
        { key: "Delivery Day", value: "Friday" },
      ],
      deliveryArea: "Markham",
      deliveryDay: "Friday",
      deliveryDate: "2026-05-08",
      deliveryLabel: "Fri 05/08",
      deliverySession: "DAY",
      serviceType: "DELIVERY",
      routeScopeKey: "2026-05-08|DELIVERY||",
      planningGroupKey: "2026-05-08|DELIVERY|||Markham",
      timeWindowEnd: undefined,
      timeWindowStart: undefined,
      orderedDate: "2026-05-01",
      coordinates: [127.0276, 37.4979],
      hasCoordinates: true,
      shopifyOrderSnapshot: {
        id: "gid://shopify/Order/1001",
        name: "#1001",
        legacyResourceId: "1001",
        createdAt: "2026-05-01T15:30:00.000Z",
        updatedAt: "2026-05-07T13:00:00.000Z",
        cancelledAt: null,
        note: "Leave at reception",
        displayFulfillmentStatus: "UNFULFILLED",
        displayFinancialStatus: "PENDING",
        phone: "+82 10-0000-0000",
        processedAt: "2026-05-07T12:00:00.000Z",
        currentTotalPriceSet: {
          shopMoney: {
            amount: "95.00",
            currencyCode: "CAD",
          },
        },
        customAttributes: [
          { key: "Delivery Area", value: "Markham" },
          { key: "Delivery Day", value: "Friday" },
        ],
        lineItems: {
          nodes: [
            {
              title: "토마토노 밀키트 세트 5/7-5/9",
              name: "TOMATONO MEAL KIT SET",
              variantTitle: "Premium",
              quantity: 1,
              sku: "MEALKIT",
            },
          ],
        },
        shippingAddress: {
          name: "Kim Minji",
          address1: "Gangnam-daero 396",
          address2: "3F",
          city: "Seoul",
          province: "Seoul",
          provinceCode: "KR-11",
          zip: "06232",
          countryCodeV2: "KR",
          latitude: 37.4979,
          longitude: 127.0276,
        },
      },
      rawPayload: {
        id: "gid://shopify/Order/1001",
        name: "#1001",
        legacyResourceId: "1001",
        createdAt: "2026-05-01T15:30:00.000Z",
        updatedAt: "2026-05-07T13:00:00.000Z",
        cancelledAt: null,
        note: "Leave at reception",
        displayFulfillmentStatus: "UNFULFILLED",
        displayFinancialStatus: "PENDING",
        phone: "+82 10-0000-0000",
        processedAt: "2026-05-07T12:00:00.000Z",
        currentTotalPriceSet: {
          shopMoney: {
            amount: "95.00",
            currencyCode: "CAD",
          },
        },
        customAttributes: [
          { key: "Delivery Area", value: "Markham" },
          { key: "Delivery Day", value: "Friday" },
        ],
        lineItems: {
          nodes: [
            {
              title: "토마토노 밀키트 세트 5/7-5/9",
              name: "TOMATONO MEAL KIT SET",
              variantTitle: "Premium",
              quantity: 1,
              sku: "MEALKIT",
            },
          ],
        },
        shippingAddress: {
          name: "Kim Minji",
          address1: "Gangnam-daero 396",
          address2: "3F",
          city: "Seoul",
          province: "Seoul",
          provinceCode: "KR-11",
          zip: "06232",
          countryCodeV2: "KR",
          latitude: 37.4979,
          longitude: 127.0276,
        },
      },
    },
  ]);
});

test("uses Tomatono order custom attributes as a coordinate fallback", () => {
  const rows = mapShopifyOrdersResponse({
    data: {
      orders: {
        edges: [
          {
            node: {
              id: "gid://shopify/Order/1002",
              name: "#1002",
              displayFulfillmentStatus: "UNFULFILLED",
              displayFinancialStatus: "PENDING",
              customAttributes: [
                { key: "tomatono_lat", value: "37.5665" },
                { key: "tomatono_lng", value: "126.9780" },
              ],
              shippingAddress: {
                name: "Lee Hana",
                address1: "Sejong-daero 110",
                city: "Seoul",
                zip: "04524",
                countryCodeV2: "KR",
                latitude: null,
                longitude: null,
              },
            },
          },
        ],
      },
    },
  });

  assert.equal(rows[0].hasCoordinates, true);
  assert.deepEqual(rows[0].coordinates, [126.978, 37.5665]);
});

test("maps raw Shopify orders to dated delivery labels without treating route-time text as order time", () => {
  const [row] = mapShopifyOrdersResponse({
    data: {
      orders: {
        edges: [
          {
            node: {
              id: "gid://shopify/Order/1004",
              name: "#1004",
              createdAt: "2026-05-01T15:30:00.000Z",
              customAttributes: [
                { key: "Delivery Area", value: "Thornhill" },
                { key: "Delivery Day", value: "Friday 5pm to 9pm *Check delivery map" },
              ],
              lineItems: {
                nodes: [{ title: "Tomatono weekly menu" }],
              },
              shippingAddress: {
                name: "Lee Hana",
                address1: "5 Mabley Crescent",
                city: "Thornhill",
                province: "ON",
                countryCodeV2: "CA",
              },
            },
          },
        ],
      },
    },
  });

  assert.equal(row.deliveryDate, "2026-05-08");
  assert.equal(row.deliveryLabel, "Fri 05/08");
  assert.equal(row.deliverySession, "DAY");
  assert.equal(row.serviceType, "DELIVERY");
  assert.equal(row.routeScopeKey, "2026-05-08|DELIVERY||");
  assert.equal(row.timeWindowStart, undefined);
  assert.equal(row.timeWindowEnd, undefined);
});

test("returns an actionable empty state when Shopify orders scope is missing", async () => {
  const result = await fetchShopifyOrders({
    graphql: async () => {
      throw new Error("Access denied for orders field.");
    },
  });

  assert.deepEqual(result.orders, []);
  assert.equal(result.errors[0].code, ORDER_SCOPE_ACCESS_ERROR_CODE);
  assert.match(result.errors[0].message, /read_orders/);
});

test("returns an actionable empty state when Shopify blocks Order access", async () => {
  const result = await fetchShopifyOrders({
    graphql: async () => {
      throw new Error(
        "This app is not approved to access the Order object. See https://shopify.dev/docs/apps/launch/protected-customer-data for more details.",
      );
    },
  });

  assert.deepEqual(result.orders, []);
  assert.equal(result.errors[0].code, PROTECTED_ORDER_ACCESS_ERROR_CODE);
  assert.match(result.errors[0].message, /Protected customer data access/);
});

test("returns an actionable empty state when Shopify blocks a protected order field", async () => {
  const result = await fetchShopifyOrders({
    graphql: async () => {
      throw new Error(
        "This app is not approved to use the email field. See https://shopify.dev/docs/apps/launch/protected-customer-data for more details.",
      );
    },
  });

  assert.deepEqual(result.orders, []);
  assert.equal(result.errors[0].code, PROTECTED_ORDER_ACCESS_ERROR_CODE);
  assert.match(result.errors[0].message, /Protected customer data access/);
});

test("caches Shopify order reads by shop cache key without sharing mutable results", async () => {
  const previousTtl = process.env.CLEVER_SHOPIFY_ORDERS_CACHE_TTL_MS;
  process.env.CLEVER_SHOPIFY_ORDERS_CACHE_TTL_MS = "5000";
  clearShopifyOrdersCache();
  let calls = 0;
  const admin = {
    graphql: async () => {
      calls += 1;
      return {
        json: async () => ({
          data: {
            orders: {
              edges: [
                {
                  node: {
                    id: "gid://shopify/Order/1001",
                    name: `#${1000 + calls}`,
                    shippingAddress: {
                      name: `Recipient ${calls}`,
                      address1: "123 Tomato Rd",
                    },
                  },
                },
              ],
            },
          },
        }),
      };
    },
  };

  try {
    const first = await fetchShopifyOrders(admin, { cacheKey: "shop-a" });
    first.orders[0].name = "#mutated";
    const second = await fetchShopifyOrders(admin, { cacheKey: "shop-a" });

    assert.equal(calls, 1);
    assert.equal(second.orders[0].name, "#1001");
  } finally {
    if (previousTtl === undefined) {
      delete process.env.CLEVER_SHOPIFY_ORDERS_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_SHOPIFY_ORDERS_CACHE_TTL_MS = previousTtl;
    }
    clearShopifyOrdersCache();
  }
});

test("does not cache Shopify order read errors", async () => {
  const previousTtl = process.env.CLEVER_SHOPIFY_ORDERS_CACHE_TTL_MS;
  process.env.CLEVER_SHOPIFY_ORDERS_CACHE_TTL_MS = "5000";
  clearShopifyOrdersCache();
  let calls = 0;
  const admin = {
    graphql: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("Access denied for orders field.");
      }

      return {
        json: async () => ({
          data: {
            orders: {
              edges: [],
            },
          },
        }),
      };
    },
  };

  try {
    const first = await fetchShopifyOrders(admin, { cacheKey: "shop-a" });
    const second = await fetchShopifyOrders(admin, { cacheKey: "shop-a" });

    assert.equal(calls, 2);
    assert.equal(first.errors[0].code, ORDER_SCOPE_ACCESS_ERROR_CODE);
    assert.deepEqual(second.errors, []);
  } finally {
    if (previousTtl === undefined) {
      delete process.env.CLEVER_SHOPIFY_ORDERS_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_SHOPIFY_ORDERS_CACHE_TTL_MS = previousTtl;
    }
    clearShopifyOrdersCache();
  }
});

test("maps shipping province from province when provinceCode is absent", () => {
  const [row] = mapShopifyOrdersResponse({
    data: {
      orders: {
        edges: [
          {
            node: {
              id: "gid://shopify/Order/1003",
              name: "#1003",
              shippingAddress: {
                name: "Park Jisoo",
                address1: "123 Queen St",
                city: "Toronto",
                province: "Ontario",
                provinceCode: "",
                zip: "M5H 2N2",
                countryCodeV2: "CA",
              },
            },
          },
        ],
      },
    },
  });

  assert.equal(row.shippingAddress.province, "Ontario");
  assert.equal(row.address, "123 Queen St, Toronto, Ontario, M5H 2N2, CA");
});
