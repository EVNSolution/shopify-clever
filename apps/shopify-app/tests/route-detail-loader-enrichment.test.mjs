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

test("group-child route detail loader fetches direct child detail in the parallel loader block", () => {
  assert.match(
    routeDetailServerSource,
    /const \[routeGroupData, routePlanData, departureLocationData, driverData, orderData, shopTimeZoneData\] = await Promise\.all\(\[/,
  );
  assert.match(
    routeDetailServerSource,
    /fetchDeliveryRouteGroupDetail\(request, routeGroupIdHint,[\s\S]*fetchDeliveryRoutePlanDetail\(request, routeId,[\s\S]*fetchShopifyShopTimeZone\(admin,/,
  );
  assert.match(routeDetailServerSource, /mergeCurrentChildDirectDetail\(thinRouteChildDetails, directCurrentChildDetail\)/);
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
  assert.doesNotMatch(routeDetailServerSource, /paymentMethodTitle/);
});
