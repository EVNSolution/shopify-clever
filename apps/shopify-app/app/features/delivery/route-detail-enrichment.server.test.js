/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";

import {
  attachDeliveryOrderFieldsToStops,
  attachDeliveryOrderFieldsToRouteDetails,
  mergeCurrentChildDirectDetail,
} from "./route-detail-enrichment.server.js";
import {
  collectRouteRefreshOrderGids,
  getBulkRefreshRoutePlanIds,
  getRoutePlanIdsForOrderRefresh,
  partitionRefreshableRouteDetails,
} from "./route-order-refresh.js";
import { getTimeZoneAbbreviationForInstant } from "../shopify/shop-timezone.server.js";

test("merges authoritative direct route-plan stops into only the current child", () => {
  const childDetails = [
    {
      routePlanId: "child-1",
      routePlan: { id: "child-1", name: "Group child 1" },
      stops: [{ orderName: "#1001", sequence: 99, sourceSequence: 1 }],
    },
    {
      routePlanId: "child-2",
      routePlan: { id: "child-2", name: "Group child 2" },
      stops: [{ orderName: "#1002", sequence: 1, sourceSequence: 2 }],
    },
  ];
  const directDetail = {
    routePlanId: "child-1",
    routePlan: { id: "child-1", name: "Direct child 1", status: "READY" },
    stops: [{ orderName: "#1001", sequence: 1, sourceSequence: 99, estimatedArrivalAt: "2026-07-01T14:00:00.000Z" }],
    routeStopPoints: [{ shopifyOrderGid: "gid://shopify/Order/1001", sequence: 1 }],
  };

  const merged = mergeCurrentChildDirectDetail(childDetails, directDetail);

  assert.equal(merged[0].routePlan.name, "Group child 1");
  assert.equal(merged[0].routePlan.status, "READY");
  assert.deepEqual(merged[0].stops, directDetail.stops);
  assert.deepEqual(merged[0].routeStopPoints, directDetail.routeStopPoints);
  assert.equal(merged[1], childDetails[1], "sibling child detail remains thin and unchanged");
});

test("joins canonical order-owned fields onto route stops without using payment method as Method", () => {
  const stops = [
    {
      orderName: "#1001",
      shopifyOrderGid: "gid://shopify/Order/1001",
      lineItems: [{ title: "Existing detail item", quantity: 1 }],
    },
  ];
  const orders = [
    {
      shopifyOrderGid: "gid://shopify/Order/1001",
      name: "#1001",
      orderCreatedAt: "2026-06-30T18:20:00.000Z",
      deliveryStatus: "ready",
      deliveryStopStatus: "in_progress",
      fulfillmentStatus: "UNFULFILLED",
      serviceType: "EVENING_DELIVERY",
      paymentMethodTitle: "Visa",
      items: [{ title: "Canonical item", quantity: 2 }],
    },
  ];

  const [stop] = attachDeliveryOrderFieldsToStops(stops, orders);

  assert.equal(stop.orderCreatedAt, "2026-06-30T18:20:00.000Z");
  assert.equal(stop.deliveryStatus, "ready");
  assert.equal(stop.deliveryStopStatus, "in_progress");
  assert.equal(stop.fulfillmentStatus, "UNFULFILLED");
  assert.equal(stop.serviceType, "EVENING_DELIVERY");
  assert.equal(stop.method, "EVENING_DELIVERY");
  assert.notEqual(stop.method, "Visa");
  assert.deepEqual(stop.lineItems, stops[0].lineItems, "direct detail items remain authoritative when already present");
  assert.deepEqual(stop.canonicalLineItems, orders[0].items);
});

test("enriches route details with canonical order fields through a shared lookup", () => {
  const routeDetails = [
    {
      routePlanId: "child-1",
      stops: [{ orderName: "#1001" }],
    },
  ];
  const orders = [{ name: "#1001", serviceType: "PICKUP", orderCreatedAt: "2026-07-01T01:00:00.000Z" }];

  assert.equal(
    attachDeliveryOrderFieldsToRouteDetails(routeDetails, orders)[0].stops[0].serviceType,
    "PICKUP",
  );
});

test("derives timezone abbreviation from the ETA instant, including DST changes", () => {
  assert.equal(
    getTimeZoneAbbreviationForInstant("America/New_York", "2026-01-15T16:00:00.000Z", "ET"),
    "EST",
  );
  assert.equal(
    getTimeZoneAbbreviationForInstant("America/New_York", "2026-07-15T16:00:00.000Z", "ET"),
    "EDT",
  );
});

test("collects unique materialized child routes and Shopify orders for route refresh", () => {
  assert.deepEqual(
    getRoutePlanIdsForOrderRefresh({
      children: [
        { routePlanId: "route-1" },
        { routePlan: { id: "route-2" } },
        { routePlanId: "route-1" },
        { tempId: "preview-only" },
      ],
    }),
    ["route-1", "route-2"],
  );

  assert.deepEqual(
    collectRouteRefreshOrderGids([
      {
        stops: [
          { shopifyOrderGid: "gid://shopify/Order/1" },
          { shopifyOrderGid: "gid://shopify/Order/2" },
        ],
      },
      {
        stops: [
          { shopifyOrderGid: "gid://shopify/Order/2" },
          { orderId: "canonical-only" },
        ],
      },
    ]),
    ["gid://shopify/Order/1", "gid://shopify/Order/2"],
  );
});

test("bulk order refresh targets only ready-compatible routes", () => {
  assert.deepEqual(
    getBulkRefreshRoutePlanIds([
      { id: "ready", status: "READY" },
      { id: "draft", status: "DRAFT" },
      { id: "legacy", status: "ASSIGNED" },
      { id: "active", status: "IN_PROGRESS" },
      { id: "done", status: "COMPLETED" },
      { id: "cancelled", status: "CANCELLED" },
    ]),
    ["ready", "draft", "legacy"],
  );
});

test("explicit refresh permits active routes but skips terminal routes", () => {
  const partitioned = partitionRefreshableRouteDetails([
    { routePlan: { id: "ready", status: "READY" } },
    { routePlan: { id: "active", status: "IN_PROGRESS" } },
    { routePlan: { id: "done", status: "COMPLETED" } },
    { routePlan: { id: "unknown", status: "SOMETHING_NEW" } },
  ]);

  assert.deepEqual(partitioned.refreshable.map((detail) => detail.routePlan.id), ["ready", "active"]);
  assert.deepEqual(partitioned.skipped, [
    { routePlanId: "done", status: "COMPLETED" },
    { routePlanId: "unknown", status: "SOMETHING_NEW" },
  ]);
});
