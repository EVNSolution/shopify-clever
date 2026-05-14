# Orders Server Sync Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect `clever-app` Orders to the completed `clever-delivery-server` Orders sync contract so Shopify order snapshots are sent to the server, server canonical rows are adopted when available, and route creation only uses ready canonical delivery stops.

**Architecture:** Shopify remains the raw embedded-admin source. `clever-app` reads Shopify Orders through Admin GraphQL, sends the untouched Shopify order node snapshot to `PATCH /admin/orders/sync`, then renders server canonical `Order + DeliveryStop` rows through a small adapter while falling back to Shopify rows during sync/API failure. The UI must stay table/map/route-plan focused: no KPI cards, no filter-chip blocks, no explanatory sync cards.

**Tech Stack:** React Router Shopify embedded app, Shopify Admin GraphQL, Shopify App Bridge `shopify.idToken()`, delivery server bearer token API, Node test runner, ESLint, React Router typegen, TypeScript build.

---

## Current verified server state

Verified locally on 2026-05-08 from:

```bash
cd /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-delivery-server
git status --short --branch
gh issue develop --list 30 --repo EVNSolution/clever-delivery-server
npm run check:workspace && npm run build
```

Evidence observed:

```text
## cc-99-orders-sync...origin/cc-99-orders-sync
cc-99-orders-sync https://github.com/EVNSolution/clever-delivery-server/tree/cc-99-orders-sync
Test Files 20 passed (20)
Tests 61 passed (61)
```

Latest server commit at verification time:

```text
5eced40 Enable server-owned Shopify order synchronization
```

Server contract is implemented in:

- `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-delivery-server/src/routes/admin-orders.routes.ts`
- `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-delivery-server/src/modules/shopify/order-sync.mapper.ts`
- `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-delivery-server/src/modules/shopify/order-sync.repository.ts`
- `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/03_CLEVER_Agent/clever-delivery-server/src/modules/shopify/order-sync.service.ts`

Important app-facing constraint: server rejects incomplete sync snapshots. `legacyResourceId`, `id`, `name`, and `updatedAt` are required. App must expand its Shopify Orders query before calling sync.

---

## Frozen API contract for clever-app

### `PATCH /admin/orders/sync`

Auth:

```http
Authorization: Bearer <Shopify App Bridge idToken>
Content-Type: application/json
```

Request body:

```json
{
  "source": "clever-app-orders",
  "reason": "orders_page_open",
  "orders": [
    {
      "id": "gid://shopify/Order/123",
      "legacyResourceId": "123",
      "name": "#1035",
      "email": "customer@example.com",
      "phone": "+14165550000",
      "processedAt": "2026-05-07T12:00:00.000Z",
      "updatedAt": "2026-05-07T13:00:00.000Z",
      "cancelledAt": null,
      "displayFinancialStatus": "PAID",
      "displayFulfillmentStatus": "UNFULFILLED",
      "note": "Leave at door",
      "currentTotalPriceSet": {
        "shopMoney": {
          "amount": "95.00",
          "currencyCode": "CAD"
        }
      },
      "customAttributes": [
        { "key": "Delivery Area", "value": "Mississauga" },
        { "key": "Delivery Day", "value": "Friday 5pm to 9pm *Check delivery map" }
      ],
      "shippingAddress": {
        "name": "Noah Yoon",
        "phone": "+14165550000",
        "address1": "300 City Centre Dr",
        "address2": "#08",
        "city": "Mississauga",
        "province": "ON",
        "provinceCode": "ON",
        "zip": "L5B 3C1",
        "countryCodeV2": "CA",
        "latitude": 43.589,
        "longitude": -79.644
      }
    }
  ]
}
```

Success response:

```json
{
  "data": {
    "orders": [
      {
        "orderId": "order-id",
        "deliveryStopId": "stop-id",
        "shopifyOrderGid": "gid://shopify/Order/123",
        "shopifyOrderLegacyId": "123",
        "name": "#1035",
        "recipientName": "Noah Yoon",
        "email": "customer@example.com",
        "phone": "+14165550000",
        "financialStatus": "PAID",
        "fulfillmentStatus": "UNFULFILLED",
        "cancelledAt": null,
        "processedAt": "2026-05-07T12:00:00.000Z",
        "updatedAtShopify": "2026-05-07T13:00:00.000Z",
        "totalPriceAmount": "95.00",
        "currencyCode": "CAD",
        "deliveryArea": "Mississauga",
        "deliveryDayRaw": "Friday 5pm to 9pm *Check delivery map",
        "deliveryWeekday": "FRIDAY",
        "serviceType": "EVENING_DELIVERY",
        "timeWindowStart": "17:00",
        "timeWindowEnd": "21:00",
        "pickup": false,
        "geocodeStatus": "RESOLVED",
        "hasCoordinates": true,
        "latitude": 43.589,
        "longitude": -79.644,
        "readiness": "READY_TO_PLAN",
        "reviewReasons": [],
        "planningStatus": "UNPLANNED",
        "shippingAddress": {
          "address1": "300 City Centre Dr",
          "address2": "#08",
          "city": "Mississauga",
          "province": "ON",
          "postalCode": "L5B 3C1",
          "countryCode": "CA"
        }
      }
    ],
    "sync": {
      "received": 1,
      "created": 1,
      "updated": 0,
      "unchanged": 0,
      "skipped": 0,
      "readyToPlan": 1,
      "needsReview": 0
    }
  },
  "error": null
}
```

### `GET /admin/orders`

Supported filters:

```text
readiness=READY_TO_PLAN|NEEDS_REVIEW|SKIPPED
planned=true|false
deliveryWeekday=THURSDAY|FRIDAY|SATURDAY
serviceType=DELIVERY|EVENING_DELIVERY|PICKUP
geocodeStatus=PENDING|RESOLVED|FAILED|NOT_REQUIRED
search=<text>
```

Initial app integration does **not** need to call `GET /admin/orders` on page load. Page-open flow should call `PATCH /admin/orders/sync` with the Shopify rows already loaded by the loader, then adopt returned canonical rows.

---

## Operational normalization rules to preserve

Observed from EasyRoutes CSV exports:

- `Delivery Day: Thursday` → `deliveryWeekday=THURSDAY`, `serviceType=DELIVERY`
- `Delivery Day: Friday` → `deliveryWeekday=FRIDAY`, `serviceType=DELIVERY`
- `Delivery Day: Saturday` → `deliveryWeekday=SATURDAY`, `serviceType=DELIVERY`
- `Delivery Day: Friday 5pm to 9pm *Check delivery map` → `deliveryWeekday=FRIDAY`, `serviceType=EVENING_DELIVERY`, `timeWindowStart=17:00`, `timeWindowEnd=21:00`
- `Pickup Day:` with blank value is ignored by the server.
- `Pickup Day: Thursday-pickup` makes `pickup=true`, `serviceType=PICKUP`, but if `Delivery Day` is absent the row still needs review for `missing_delivery_day`.

Server owns these results. App must send raw `customAttributes`; app must not re-derive canonical readiness.

---

## File structure to change in clever-app

Base app workspace:

```bash
cd /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_tomatono/clever
```

Modify:

- `app/features/orders/shopify-orders.server.js`
  - Expand GraphQL query and preserve full Shopify node snapshot.
- `app/features/orders/shopify-orders.server.test.js`
  - Lock required sync fields and raw snapshot mapping.
- `app/features/delivery/route-plans.server.js`
  - Export shared `deliveryApiRequest`.
- `app/features/delivery/route-plans.server.test.js`
  - Assert route-plan client still works after export.
- `app/routes/app.orders.jsx`
  - Add `_intent=syncOrders` action branch.
  - Add page-open background sync fetcher.
  - Adopt canonical rows when sync succeeds.
  - Guard route creation by readiness.
- `tests/orders-page.test.mjs`
  - Source-level contract tests for sync wiring and no-card UI policy.

Create:

- `app/features/delivery/orders.server.js`
  - `syncDeliveryOrders()` and `fetchDeliveryOrders()`.
- `app/features/delivery/orders.server.test.js`
  - Delivery Orders client contract tests.
- `app/features/orders/canonical-orders.js`
  - Canonical row adapter and readiness helpers.
- `app/features/orders/canonical-orders.test.js`
  - Adapter tests for server response rows.

Do not create:

- New Orders KPI/filter/review card components.
- New visible Orders sections for sync status.
- `/app/orders/:orderId`.

---

## Task 1: Expand Shopify order snapshots

**Files:**

- Modify: `app/features/orders/shopify-orders.server.js`
- Modify: `app/features/orders/shopify-orders.server.test.js`

- [ ] **Step 1: Add failing query-field assertions**

In `app/features/orders/shopify-orders.server.test.js`, extend `orders query reads Shopify orders without requiring customer scope`:

```js
assert.match(SHOPIFY_ORDERS_QUERY, /legacyResourceId/);
assert.match(SHOPIFY_ORDERS_QUERY, /updatedAt/);
assert.match(SHOPIFY_ORDERS_QUERY, /cancelledAt/);
assert.match(SHOPIFY_ORDERS_QUERY, /email/);
assert.match(SHOPIFY_ORDERS_QUERY, /note/);
assert.match(SHOPIFY_ORDERS_QUERY, /province\b/);
assert.match(SHOPIFY_ORDERS_QUERY, /provinceCode/);
```

- [ ] **Step 2: Add failing mapping fixture fields**

In `maps Shopify orders into map-ready rows`, add these fields to the input node:

```js
legacyResourceId: "1001",
email: "kim@example.com",
updatedAt: "2026-05-07T13:00:00.000Z",
cancelledAt: null,
note: "Leave at door",
```

Add `province: "Ontario"` under `shippingAddress`.

Update the expected row with:

```js
legacyResourceId: "1001",
updatedAt: "2026-05-07T13:00:00.000Z",
cancelledAt: undefined,
note: "Leave at door",
email: "kim@example.com",
rawPayload: rows[0].shopifyOrderSnapshot,
shopifyOrderSnapshot: {
  id: "gid://shopify/Order/1001",
  legacyResourceId: "1001",
  name: "#1001",
  email: "kim@example.com",
  phone: "+82 10-0000-0000",
  processedAt: "2026-05-07T12:00:00.000Z",
  updatedAt: "2026-05-07T13:00:00.000Z",
  cancelledAt: null,
  note: "Leave at door",
  displayFulfillmentStatus: "UNFULFILLED",
  displayFinancialStatus: "PENDING",
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
  shippingAddress: {
    name: "Kim Minji",
    address1: "Gangnam-daero 396",
    address2: "3F",
    city: "Seoul",
    province: "Ontario",
    provinceCode: "KR-11",
    zip: "06232",
    countryCodeV2: "KR",
    latitude: 37.4979,
    longitude: 127.0276,
  },
},
```

If strict `deepEqual` becomes awkward because `rawPayload` references the same object, replace the final assertion with property-level assertions:

```js
assert.equal(rows[0].legacyResourceId, "1001");
assert.equal(rows[0].updatedAt, "2026-05-07T13:00:00.000Z");
assert.equal(rows[0].email, "kim@example.com");
assert.equal(rows[0].note, "Leave at door");
assert.equal(rows[0].rawPayload, rows[0].shopifyOrderSnapshot);
assert.equal(rows[0].shopifyOrderSnapshot.legacyResourceId, "1001");
assert.equal(rows[0].shopifyOrderSnapshot.shippingAddress.province, "Ontario");
```

- [ ] **Step 3: Run focused failing test**

```bash
node --test app/features/orders/shopify-orders.server.test.js
```

Expected before implementation: FAIL because query and row mapping do not yet include all server-required fields.

- [ ] **Step 4: Extend `SHOPIFY_ORDERS_QUERY`**

In `app/features/orders/shopify-orders.server.js`, under `node`, add:

```graphql
legacyResourceId
email
updatedAt
cancelledAt
note
```

Under `shippingAddress`, add:

```graphql
province
```

Keep `provinceCode`.

- [ ] **Step 5: Preserve server sync snapshot in `mapOrderNode(order)`**

Add these properties to the returned row:

```js
legacyResourceId: textOrUndefined(order.legacyResourceId),
updatedAt: textOrUndefined(order.updatedAt),
cancelledAt: textOrUndefined(order.cancelledAt),
note: textOrUndefined(order.note),
shopifyOrderSnapshot: order,
rawPayload: order,
```

Keep the existing UI fields unchanged.

- [ ] **Step 6: Preserve both province values for server snapshot and UI**

Change `mapShippingAddress(address)` to prefer `provinceCode` for the current UI row but keep raw snapshot untouched:

```js
province:
  textOrUndefined(address?.provinceCode) ?? textOrUndefined(address?.province),
```

- [ ] **Step 7: Run focused test**

```bash
node --test app/features/orders/shopify-orders.server.test.js
```

Expected: PASS.

---

## Task 2: Add canonical Orders adapter

**Files:**

- Create: `app/features/orders/canonical-orders.js`
- Create: `app/features/orders/canonical-orders.test.js`

- [ ] **Step 1: Write failing adapter tests**

Create `app/features/orders/canonical-orders.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  getOrderSyncSnapshots,
  isOrderReadyToPlan,
  mapCanonicalOrdersToOrderRows,
} from "./canonical-orders.js";

test("maps canonical delivery-server orders into Orders table/map rows", () => {
  const rows = mapCanonicalOrdersToOrderRows([
    {
      orderId: "local-order-1",
      deliveryStopId: "stop-1",
      shopifyOrderGid: "gid://shopify/Order/123",
      shopifyOrderLegacyId: "123",
      name: "#1035",
      recipientName: "Noah Yoon",
      email: "customer@example.com",
      phone: "+14165550000",
      financialStatus: "PAID",
      fulfillmentStatus: "UNFULFILLED",
      cancelledAt: null,
      processedAt: "2026-05-07T12:00:00.000Z",
      updatedAtShopify: "2026-05-07T13:00:00.000Z",
      totalPriceAmount: "95.00",
      currencyCode: "CAD",
      deliveryArea: "Mississauga",
      deliveryDayRaw: "Friday 5pm to 9pm *Check delivery map",
      deliveryWeekday: "FRIDAY",
      serviceType: "EVENING_DELIVERY",
      timeWindowStart: "17:00",
      timeWindowEnd: "21:00",
      pickup: false,
      geocodeStatus: "RESOLVED",
      hasCoordinates: true,
      latitude: 43.589,
      longitude: -79.644,
      readiness: "READY_TO_PLAN",
      reviewReasons: [],
      planningStatus: "UNPLANNED",
      shippingAddress: {
        address1: "300 City Centre Dr",
        address2: "#08",
        city: "Mississauga",
        province: "ON",
        postalCode: "L5B 3C1",
        countryCode: "CA",
      },
    },
  ]);

  assert.deepEqual(rows, [
    {
      id: "gid://shopify/Order/123",
      orderId: "local-order-1",
      deliveryStopId: "stop-1",
      name: "#1035",
      customer: "Noah Yoon",
      address: "300 City Centre Dr, #08, Mississauga, ON, L5B 3C1, CA",
      status: "UNFULFILLED",
      paymentStatus: "PAID",
      eta: "—",
      email: "customer@example.com",
      phone: "+14165550000",
      processedAt: "2026-05-07T12:00:00.000Z",
      updatedAt: "2026-05-07T13:00:00.000Z",
      cancelledAt: undefined,
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
      attributes: "Delivery Area: Mississauga, Delivery Day: Friday 5pm to 9pm *Check delivery map",
      attributeList: [
        { key: "Delivery Area", value: "Mississauga" },
        { key: "Delivery Day", value: "Friday 5pm to 9pm *Check delivery map" },
      ],
      deliveryArea: "Mississauga",
      deliveryDay: "Friday 5pm to 9pm *Check delivery map",
      coordinates: [-79.644, 43.589],
      hasCoordinates: true,
      readiness: "READY_TO_PLAN",
      reviewReasons: [],
      planningStatus: "UNPLANNED",
      serviceType: "EVENING_DELIVERY",
      rawPayload: rows[0].rawPayload,
    },
  ]);
});

test("blocks route creation for canonical rows that are not ready", () => {
  assert.equal(isOrderReadyToPlan({ readiness: "READY_TO_PLAN", hasCoordinates: true }), true);
  assert.equal(isOrderReadyToPlan({ readiness: "READY_TO_PLAN", hasCoordinates: false }), false);
  assert.equal(isOrderReadyToPlan({ readiness: "NEEDS_REVIEW", hasCoordinates: true }), false);
  assert.equal(isOrderReadyToPlan({ readiness: "SKIPPED", hasCoordinates: true }), false);
  assert.equal(isOrderReadyToPlan({ hasCoordinates: true }), true);
});

test("extracts Shopify snapshots for sync and ignores placeholder raw payloads", () => {
  const snapshot = { id: "gid://shopify/Order/123", legacyResourceId: "123", updatedAt: "2026-05-07T13:00:00Z" };

  assert.deepEqual(
    getOrderSyncSnapshots([
      { id: "gid://shopify/Order/123", shopifyOrderSnapshot: snapshot },
      { id: "gid://shopify/Order/456", rawPayload: {} },
      { id: "gid://shopify/Order/789", rawPayload: { id: "gid://shopify/Order/789", legacyResourceId: "789", updatedAt: "2026-05-07T13:00:00Z" } },
    ]),
    [snapshot, { id: "gid://shopify/Order/789", legacyResourceId: "789", updatedAt: "2026-05-07T13:00:00Z" }],
  );
});
```

- [ ] **Step 2: Run failing adapter test**

```bash
node --test app/features/orders/canonical-orders.test.js
```

Expected before implementation: FAIL because the file does not exist.

- [ ] **Step 3: Implement adapter**

Create `app/features/orders/canonical-orders.js`:

```js
export function mapCanonicalOrdersToOrderRows(canonicalOrders) {
  if (!Array.isArray(canonicalOrders)) return [];

  return canonicalOrders.map(mapCanonicalOrderToOrderRow).filter(Boolean);
}

export function isOrderReadyToPlan(order) {
  if (!order?.hasCoordinates) return false;
  if (!order.readiness) return true;
  return order.readiness === "READY_TO_PLAN";
}

export function getOrderSyncSnapshots(orders) {
  if (!Array.isArray(orders)) return [];

  return orders
    .map((order) => order?.shopifyOrderSnapshot ?? order?.rawPayload)
    .filter(isCompleteShopifySnapshot);
}

function mapCanonicalOrderToOrderRow(order) {
  if (!order?.shopifyOrderGid) return null;

  const latitude = numberOrUndefined(order.latitude);
  const longitude = numberOrUndefined(order.longitude);
  const hasCoordinates = order.hasCoordinates === true && latitude != null && longitude != null;
  const deliveryArea = textOrUndefined(order.deliveryArea);
  const deliveryDay = textOrUndefined(order.deliveryDayRaw) ?? textOrUndefined(order.deliveryWeekday);

  return {
    id: order.shopifyOrderGid,
    orderId: textOrUndefined(order.orderId),
    deliveryStopId: textOrUndefined(order.deliveryStopId),
    name: textOrUndefined(order.name) ?? order.shopifyOrderGid,
    customer: textOrUndefined(order.recipientName) ?? "Unknown recipient",
    address: formatCanonicalShippingAddress(order.shippingAddress),
    status: textOrUndefined(order.fulfillmentStatus) ?? "UNKNOWN",
    paymentStatus: textOrUndefined(order.financialStatus) ?? "UNKNOWN",
    eta: "—",
    email: textOrUndefined(order.email),
    phone: textOrUndefined(order.phone) ?? "",
    processedAt: textOrUndefined(order.processedAt),
    updatedAt: textOrUndefined(order.updatedAtShopify),
    cancelledAt: textOrUndefined(order.cancelledAt),
    totalPriceAmount: textOrUndefined(order.totalPriceAmount),
    currencyCode: textOrUndefined(order.currencyCode),
    shippingAddress: mapCanonicalShippingAddress(order.shippingAddress),
    attributes: formatDeliveryAttributes(deliveryArea, deliveryDay),
    attributeList: formatCanonicalAttributeList(deliveryArea, deliveryDay),
    deliveryArea,
    deliveryDay,
    coordinates: [longitude, latitude],
    hasCoordinates,
    readiness: textOrUndefined(order.readiness),
    reviewReasons: Array.isArray(order.reviewReasons) ? order.reviewReasons : [],
    planningStatus: textOrUndefined(order.planningStatus),
    serviceType: textOrUndefined(order.serviceType),
    rawPayload: order,
  };
}

function isCompleteShopifySnapshot(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      value.id.trim() &&
      typeof value.legacyResourceId === "string" &&
      value.legacyResourceId.trim() &&
      typeof value.updatedAt === "string" &&
      value.updatedAt.trim(),
  );
}

function mapCanonicalShippingAddress(address = {}) {
  return {
    address1: textOrUndefined(address?.address1),
    address2: textOrUndefined(address?.address2),
    city: textOrUndefined(address?.city),
    province: textOrUndefined(address?.province),
    postalCode: textOrUndefined(address?.postalCode),
    countryCode: textOrUndefined(address?.countryCode),
  };
}

function formatCanonicalShippingAddress(address = {}) {
  const parts = [
    address?.address1,
    address?.address2,
    address?.city,
    address?.province,
    address?.postalCode,
    address?.countryCode,
  ]
    .map(textOrUndefined)
    .filter(Boolean);

  return parts.length ? parts.join(", ") : "No shipping address";
}

function formatCanonicalAttributeList(deliveryArea, deliveryDay) {
  return [
    deliveryArea ? { key: "Delivery Area", value: deliveryArea } : null,
    deliveryDay ? { key: "Delivery Day", value: deliveryDay } : null,
  ].filter(Boolean);
}

function formatDeliveryAttributes(deliveryArea, deliveryDay) {
  return formatCanonicalAttributeList(deliveryArea, deliveryDay)
    .map((attribute) => `${attribute.key}: ${attribute.value}`)
    .join(", ");
}

function textOrUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function numberOrUndefined(value) {
  if (value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
```

- [ ] **Step 4: Run adapter test**

```bash
node --test app/features/orders/canonical-orders.test.js
```

Expected: PASS.

---

## Task 3: Add delivery-server Orders API client

**Files:**

- Modify: `app/features/delivery/route-plans.server.js`
- Create: `app/features/delivery/orders.server.js`
- Create: `app/features/delivery/orders.server.test.js`

- [ ] **Step 1: Export the shared API helper**

In `app/features/delivery/route-plans.server.js`, change:

```js
async function deliveryApiRequest(request, path, options) {
```

to:

```js
export async function deliveryApiRequest(request, path, options) {
```

- [ ] **Step 2: Write failing Orders client tests**

Create `app/features/delivery/orders.server.test.js`:

```js
/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { fetchDeliveryOrders, syncDeliveryOrders } from "./orders.server.js";

test("syncs Shopify order snapshots through the delivery Admin Orders API", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  const calls = [];

  const result = await syncDeliveryOrders(
    new Request("https://app.example/app/orders"),
    {
      reason: "orders_page_open",
      orders: [
        {
          id: "gid://shopify/Order/123",
          legacyResourceId: "123",
          name: "#1035",
          updatedAt: "2026-05-07T13:00:00.000Z",
          customAttributes: [],
          currentTotalPriceSet: null,
          displayFinancialStatus: "PAID",
          displayFulfillmentStatus: "UNFULFILLED",
          email: null,
          phone: null,
          processedAt: null,
          cancelledAt: null,
          note: null,
          shippingAddress: null,
        },
      ],
    },
    {
      sessionToken: "client-session-token",
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          data: {
            orders: [{ shopifyOrderGid: "gid://shopify/Order/123", readiness: "READY_TO_PLAN" }],
            sync: { received: 1, created: 1, updated: 0, unchanged: 0, skipped: 0, readyToPlan: 1, needsReview: 0 },
          },
          error: null,
        });
      },
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.equal(calls[0].url, "https://delivery.example/admin/orders/sync");
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.headers.authorization, "Bearer client-session-token");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    source: "clever-app-orders",
    reason: "orders_page_open",
    orders: [
      {
        id: "gid://shopify/Order/123",
        legacyResourceId: "123",
        name: "#1035",
        updatedAt: "2026-05-07T13:00:00.000Z",
        customAttributes: [],
        currentTotalPriceSet: null,
        displayFinancialStatus: "PAID",
        displayFulfillmentStatus: "UNFULFILLED",
        email: null,
        phone: null,
        processedAt: null,
        cancelledAt: null,
        note: null,
        shippingAddress: null,
      },
    ],
  });
  assert.equal(result.orders[0].shopifyOrderGid, "gid://shopify/Order/123");
  assert.deepEqual(result.errors, []);
});

test("fetches canonical delivery orders with serialized filters", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  const calls = [];

  const result = await fetchDeliveryOrders(
    new Request("https://app.example/app/orders", {
      headers: { authorization: "Bearer session-token" },
    }),
    { planned: false, readiness: "READY_TO_PLAN", deliveryWeekday: "FRIDAY", search: "#1035" },
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({ data: { orders: [{ shopifyOrderGid: "gid://shopify/Order/123" }] }, error: null });
      },
    },
  );

  process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;

  assert.equal(
    calls[0].url,
    "https://delivery.example/admin/orders?planned=false&readiness=READY_TO_PLAN&deliveryWeekday=FRIDAY&search=%231035",
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.authorization, "Bearer session-token");
  assert.equal(result.orders[0].shopifyOrderGid, "gid://shopify/Order/123");
  assert.deepEqual(result.errors, []);
});
```

- [ ] **Step 3: Run failing Orders client tests**

```bash
node --test app/features/delivery/orders.server.test.js
```

Expected before implementation: FAIL because `orders.server.js` does not exist.

- [ ] **Step 4: Implement `orders.server.js`**

Create `app/features/delivery/orders.server.js`:

```js
import { deliveryApiRequest } from "./route-plans.server.js";

export async function syncDeliveryOrders(request, payload, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/orders/sync", {
    body: JSON.stringify({
      source: "clever-app-orders",
      reason: payload.reason ?? "orders_page_open",
      orders: Array.isArray(payload.orders) ? payload.orders : [],
    }),
    fetch: options.fetch,
    method: "PATCH",
    sessionToken: options.sessionToken,
  });

  return {
    orders: result.data?.orders ?? [],
    sync: result.data?.sync ?? null,
    errors: result.errors,
  };
}

export async function fetchDeliveryOrders(request, filters = {}, options = {}) {
  const query = buildOrdersQuery(filters);
  const result = await deliveryApiRequest(request, `/admin/orders${query}`, {
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
  });

  return {
    orders: result.data?.orders ?? [],
    errors: result.errors,
  };
}

function buildOrdersQuery(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}
```

- [ ] **Step 5: Run focused tests**

```bash
node --test app/features/delivery/orders.server.test.js app/features/delivery/route-plans.server.test.js
```

Expected: PASS.

---

## Task 4: Wire Orders action sync branch

**Files:**

- Modify: `app/routes/app.orders.jsx`
- Modify: `tests/orders-page.test.mjs`

- [ ] **Step 1: Add source-level tests for action intent separation**

In `tests/orders-page.test.mjs`, add a test:

```js
test("Orders action separates background order sync from route creation", () => {
  assert.match(ordersPageSource, /import \{ syncDeliveryOrders \} from "\.\.\/features\/delivery\/orders\.server"/);
  assert.match(ordersPageSource, /const intent = formData\.get\("_intent"\) \?\? "createRoutePlan"/);
  assert.match(ordersPageSource, /if \(intent === "syncOrders"\)/);
  assert.match(ordersPageSource, /JSON\.parse\(formData\.get\("orders"\) \?\? "\[\]"\)/);
  assert.match(ordersPageSource, /syncDeliveryOrders\(request,/);
  assert.match(ordersPageSource, /syncedOrders: syncedOrderData\.orders/);
});
```

- [ ] **Step 2: Run failing source test**

```bash
node --test tests/orders-page.test.mjs
```

Expected before implementation: FAIL because sync branch is absent.

- [ ] **Step 3: Add imports**

In `app/routes/app.orders.jsx`, add:

```js
import { syncDeliveryOrders } from "../features/delivery/orders.server";
import {
  getOrderSyncSnapshots,
  isOrderReadyToPlan,
  mapCanonicalOrdersToOrderRows,
} from "../features/orders/canonical-orders";
```

- [ ] **Step 4: Split action by `_intent`**

Change the top of `action` from direct route creation to:

```js
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_intent") ?? "createRoutePlan";
  const shopifySessionToken = formData.get("shopifySessionToken");

  if (intent === "syncOrders") {
    let orderSnapshots = [];
    try {
      orderSnapshots = JSON.parse(formData.get("orders") ?? "[]");
    } catch {
      return { syncedOrders: [], sync: null, errors: [{ message: "Order sync payload가 올바르지 않습니다." }] };
    }

    if (!Array.isArray(orderSnapshots) || orderSnapshots.length === 0) {
      return { syncedOrders: [], sync: null, errors: [] };
    }

    const syncedOrderData = await syncDeliveryOrders(
      request,
      { reason: "orders_page_open", orders: orderSnapshots },
      { sessionToken: shopifySessionToken },
    );

    return {
      syncedOrders: syncedOrderData.orders,
      sync: syncedOrderData.sync,
      errors: syncedOrderData.errors,
    };
  }

  const plannedOrderIds = JSON.parse(formData.get("plannedOrderIds") ?? "[]");
```

Keep the existing route-create code after this point.

- [ ] **Step 5: Mark route create submissions explicitly**

In `handleCreateRoute`, add:

```js
formData.set("_intent", "createRoutePlan");
```

- [ ] **Step 6: Run source test**

```bash
node --test tests/orders-page.test.mjs
```

Expected: PASS for new sync branch assertions.

---

## Task 5: Trigger page-open sync and adopt canonical rows

**Files:**

- Modify: `app/routes/app.orders.jsx`
- Modify: `tests/orders-page.test.mjs`

- [ ] **Step 1: Add source-level test for non-visual sync fetcher**

In `tests/orders-page.test.mjs`, add:

```js
test("Orders page syncs loaded Shopify snapshots without adding sync cards", () => {
  assert.match(ordersPageSource, /const ordersSyncFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /const orderSyncSubmittedRef = useRef\(false\)/);
  assert.match(ordersPageSource, /getOrderSyncSnapshots\(safeOrders\)/);
  assert.match(ordersPageSource, /ordersSyncFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(ordersPageSource, /mapCanonicalOrdersToOrderRows\(ordersSyncFetcher\.data\?\.syncedOrders/);
  assert.match(ordersPageSource, /const displayOrders = syncedOrders\.length > 0 \? syncedOrders : safeOrders/);
  assert.doesNotMatch(ordersPageSource, /Orders sync KPI/);
  assert.doesNotMatch(ordersPageSource, /orders sync card/i);
  assert.doesNotMatch(ordersPageSource, /sync status panel/i);
});
```

- [ ] **Step 2: Run failing source test**

```bash
node --test tests/orders-page.test.mjs
```

Expected before implementation: FAIL because no sync fetcher/display rows exist.

- [ ] **Step 3: Add sync fetcher state**

In `OrdersPage()`:

```js
const routePlanFetcher = useFetcher();
const ordersSyncFetcher = useFetcher();
```

Add ref:

```js
const orderSyncSubmittedRef = useRef(false);
```

- [ ] **Step 4: Derive canonical display rows**

After `safeOrders`:

```js
const syncedOrders = useMemo(
  () => mapCanonicalOrdersToOrderRows(ordersSyncFetcher.data?.syncedOrders),
  [ordersSyncFetcher.data?.syncedOrders],
);
const displayOrders = syncedOrders.length > 0 ? syncedOrders : safeOrders;
```

Then replace data derivations that currently use `safeOrders` for UI rendering with `displayOrders`:

```js
const locatedOrders = useMemo(
  () => displayOrders.filter((order) => order.hasCoordinates),
  [displayOrders],
);
```

Change `sortedOrders`, `plannedOrders`, selected-order validation, safe order ids, and `selectedOrder` to use `displayOrders`.

Keep `safeOrders` only for `getOrderSyncSnapshots(safeOrders)`.

- [ ] **Step 5: Add page-open sync effect**

After refs are declared:

```js
useEffect(() => {
  if (orderSyncSubmittedRef.current) return;

  const orderSnapshots = getOrderSyncSnapshots(safeOrders);
  if (orderSnapshots.length === 0) return;

  let cancelled = false;
  orderSyncSubmittedRef.current = true;

  shopify
    .idToken()
    .then((sessionToken) => {
      if (cancelled) return;
      const formData = new FormData();
      formData.set("_intent", "syncOrders");
      formData.set("shopifySessionToken", sessionToken);
      formData.set("orders", JSON.stringify(orderSnapshots));
      ordersSyncFetcher.submit(formData, { method: "post" });
    })
    .catch(() => {
      orderSyncSubmittedRef.current = false;
    });

  return () => {
    cancelled = true;
  };
}, [ordersSyncFetcher, safeOrders, shopify]);
```

- [ ] **Step 6: Include sync errors in banner without adding UI sections**

Change `actionErrors` to include sync errors:

```js
const actionErrors = createRouteClientError
  ? [{ message: createRouteClientError }]
  : [
      ...(routePlanFetcher.data?.errors ?? []),
      ...(ordersSyncFetcher.data?.errors ?? []),
    ];
```

Do not render a new sync status card.

- [ ] **Step 7: Run source test**

```bash
node --test tests/orders-page.test.mjs
```

Expected: PASS.

---

## Task 6: Guard route creation with server readiness

**Files:**

- Modify: `app/routes/app.orders.jsx`
- Modify: `tests/orders-page.test.mjs`

- [ ] **Step 1: Add source-level test for readiness guard**

In `tests/orders-page.test.mjs`, add:

```js
test("Orders route creation only submits ready planned orders", () => {
  assert.match(ordersPageSource, /const readyPlannedOrders = useMemo\(\(\) => plannedOrders\.filter\(isOrderReadyToPlan\)/);
  assert.match(ordersPageSource, /readyPlannedOrders\.length === 0 \|\| routePlanFetcher\.state !== "idle"/);
  assert.match(ordersPageSource, /JSON\.stringify\(readyPlannedOrders\.map\(\(order\) => order\.id\)\)/);
  assert.match(ordersPageSource, /setCreateRouteClientError\("Route plan에는 ready 상태의 주문만 보낼 수 있습니다\."\)/);
});
```

- [ ] **Step 2: Run failing source test**

```bash
node --test tests/orders-page.test.mjs
```

Expected before implementation: FAIL.

- [ ] **Step 3: Add `readyPlannedOrders`**

After `plannedOrders`:

```js
const readyPlannedOrders = useMemo(() => plannedOrders.filter(isOrderReadyToPlan), [plannedOrders]);
```

- [ ] **Step 4: Disable route creation when no ready planned order exists**

Replace create-route button disabled checks:

```js
readyPlannedOrders.length === 0 || routePlanFetcher.state !== "idle"
```

Keep `Clear plan` and `Zoom to planned` based on all planned orders, not only ready orders.

- [ ] **Step 5: Submit only ready order ids**

In `handleCreateRoute`:

```js
if (plannedOrderIds.length === 0 || isCreatingRoute) return;
if (readyPlannedOrders.length === 0) {
  setCreateRouteClientError("Route plan에는 ready 상태의 주문만 보낼 수 있습니다.");
  return;
}
```

Then set:

```js
formData.set("plannedOrderIds", JSON.stringify(readyPlannedOrders.map((order) => order.id)));
```

- [ ] **Step 6: Update dependencies**

`handleCreateRoute` is not currently wrapped in `useCallback`; no dependency array needed. If it becomes a callback later, include `readyPlannedOrders`.

- [ ] **Step 7: Run source test**

```bash
node --test tests/orders-page.test.mjs
```

Expected: PASS.

---

## Task 7: Run full clever-app verification

- [ ] **Step 1: Run all Node tests**

```bash
node --test tests/*.mjs app/features/**/*.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: exit 0.

---

## Execution order and ownership for subagents

Use fresh subagents to avoid polluting the main session.

1. **App data worker**
   - Owns Tasks 1 and 2.
   - Write scope:
     - `app/features/orders/shopify-orders.server.js`
     - `app/features/orders/shopify-orders.server.test.js`
     - `app/features/orders/canonical-orders.js`
     - `app/features/orders/canonical-orders.test.js`

2. **Delivery client worker**
   - Owns Task 3.
   - Write scope:
     - `app/features/delivery/route-plans.server.js`
     - `app/features/delivery/route-plans.server.test.js`
     - `app/features/delivery/orders.server.js`
     - `app/features/delivery/orders.server.test.js`

3. **Orders route worker**
   - Owns Tasks 4, 5, and 6 after workers 1 and 2 finish.
   - Write scope:
     - `app/routes/app.orders.jsx`
     - `tests/orders-page.test.mjs`

4. **Verifier**
   - Owns Task 7.
   - Read-only unless fixing a failure is explicitly assigned back to the owning worker.

---

## Contract risks to watch during execution

1. **`legacyResourceId` and `updatedAt` are required by server.**
   - If the app syncs current rows before Task 1, server returns 400.

2. **Do not submit canonical rows back to `/admin/orders/sync`.**
   - Sync payload must come from `shopifyOrderSnapshot` or complete Shopify raw payload, not from canonical adapter rows.

3. **Route creation still uses existing route-plan API.**
   - Initial app integration can continue sending the existing `buildCreateRoutePlanPayload` order payload.
   - Future improvement can switch route creation to `deliveryStopIds`; do not scope that into this task.

4. **No new Orders visual sections.**
   - Sync errors can join the existing banner.
   - Do not add cards, chips, or a visible sync status panel.

5. **Concrete delivery date is not present in Shopify attributes.**
   - Server normalizes weekday/service type/time window.
   - Do not invent `DeliveryStop.deliveryDate` in app.

---

## Final acceptance checklist

- [ ] Shopify Orders query contains `legacyResourceId`, `email`, `updatedAt`, `cancelledAt`, `note`, `province`, `provinceCode`.
- [ ] `mapOrderNode()` returns full `shopifyOrderSnapshot` and `rawPayload`.
- [ ] `syncDeliveryOrders()` sends `PATCH /admin/orders/sync` with bearer token and `source=clever-app-orders`.
- [ ] Orders page posts `_intent=syncOrders` on page open using `shopify.idToken()`.
- [ ] Orders page uses canonical rows from sync response when available.
- [ ] Orders table/map/route-plan UI remains visually unchanged except data source.
- [ ] Route creation submits only ready planned orders.
- [ ] No Orders KPI/filter/review-card sections return.
- [ ] `node --test tests/*.mjs app/features/**/*.test.js` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
