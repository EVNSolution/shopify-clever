/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const routeDetailServerSource = readFileSync(
  join(root, "app/features/delivery/route-detail.server.js"),
  "utf8",
);
const routeTimeZoneSource = readFileSync(
  join(root, "app/features/delivery/route-timezone.server.js"),
  "utf8",
);

test("group-child route detail loader fetches direct child detail in the parallel loader block", () => {
  assert.match(
    routeDetailServerSource,
    /const \[routeGroupData, routePlanData, departureLocationData, driverData, orderData, fallbackTimeZoneData\] = await Promise\.all\(\[/,
  );
  assert.match(
    routeDetailServerSource,
    /fetchDeliveryRouteGroupDetail\(request, routeGroupIdHint,[\s\S]*fetchDeliveryRoutePlanDetail\(request, routeId,[\s\S]*fetchRouteFallbackTimeZone\(admin,/,
  );
  assert.match(routeDetailServerSource, /mergeCurrentChildDirectDetail\(thinRouteChildDetails, directCurrentChildDetail\)/);
});

test("route detail uses the configured delivery-only store timezone without a Shopify timezone request", () => {
  assert.match(routeTimeZoneSource, /process\.env\.CLEVER_ORDERS_SOURCE_MODE !== "delivery_only"/);
  assert.match(routeTimeZoneSource, /process\.env\.CLEVER_DELIVERY_ONLY_TIME_ZONE \|\| "Asia\/Seoul"/);
  assert.match(routeDetailServerSource, /fetchRouteFallbackTimeZone\(admin, shopifyShopCacheKey\)/);
  assert.match(routeDetailServerSource, /resolveRouteTimeZone\(\{[\s\S]*departureLocation: departureLocationData\.departureLocation,[\s\S]*routePlan: routePlanData\.routePlan/);
});

test("route detail loader exposes canonical order and timezone owned fields without hidden writes", () => {
  assert.match(
    routeDetailServerSource,
    /stops: attachDeliveryOrderFieldsToStops\(\s*attachDeliveryOrderItemsToStops\(routePlanData\.stops \?\? \[\], buildDeliveryOrderLookup\(orderData\.orders\)\),\s*orderData\.orders,/,
  );
  assert.match(routeDetailServerSource, /\.\.\.\(routePlanData\.errors \?\? \[\]\)/);
  assert.match(routeDetailServerSource, /\.\.\.\(orderData\.errors \?\? \[\]\)/);
  assert.match(routeDetailServerSource, /\.\.\.\(shopTimeZoneData\.errors \?\? \[\]\)/);
  assert.match(routeDetailServerSource, /ianaTimezone: shopTimeZoneData\.ianaTimezone/);
  assert.match(routeDetailServerSource, /timezoneAbbreviation: shopTimeZoneData\.timezoneAbbreviation/);
  assert.match(routeDetailServerSource, /timezoneSource: shopTimeZoneData\.timezoneSource/);
  assert.doesNotMatch(routeDetailServerSource, /paymentMethodTitle/);
});

test("route detail owns eligible add-order candidates and persists to a selected group destination", () => {
  assert.match(routeDetailServerSource, /addOrderCandidates: buildRouteAddOrderCandidates\(orderData\.orders/);
  assert.match(routeDetailServerSource, /intent === "loadAddOrderCandidates"/);
  assert.match(routeDetailServerSource, /intent === "addRouteOrders"/);
  assert.match(routeDetailServerSource, /const targetRoutePlanId = textOrUndefined\(formData\.get\("targetRoutePlanId"\)\) \?\? routeId/);
  assert.match(routeDetailServerSource, /updateDeliveryRouteGroupOrders\([\s\S]*\.\.\.\(targetRoutePlanId \? \{ targetRoutePlanId \} : \{\}\)/);
  assert.doesNotMatch(routeDetailServerSource, /buildRouteGroupAddOrdersDraft/);
  assert.match(routeDetailServerSource, /addOrderIds\.length !== requestedOrderIds\.length/);
  assert.doesNotMatch(routeDetailServerSource, /orderUpdate|customerUpdate/);
});
