/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";

import {
  attachDeliveryOrderFieldsToStops,
  attachDeliveryOrderFieldsToRouteDetails,
  mergeCurrentChildDirectDetail,
} from "./route-detail-enrichment.server.js";
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
