/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync("app/features/orders/orders-page.server.js", "utf8");
const start = source.indexOf("async function resolveOrdersDateContext");
const end = source.indexOf("\nfunction getOrdersResourceFilters", start);
function resolver(timeZone = "America/Toronto", mode = "shopify") {
  const auth = [];
  const resolve = vm.runInNewContext(`(${source.slice(start, end)})`, {
    process: { env: { CLEVER_ORDERS_SOURCE_MODE: mode } }, Response,
    getDeliveryOnlyShopTimeZoneData: () => ({ ianaTimezone: timeZone, errors: [] }),
    authenticate: { admin: async (request) => { auth.push(request); return { admin: {}, session: { shop: "fixture.myshopify.com" } }; } },
    authenticatedResourceRequest: (request, token) => ({ request, token }),
    fetchShopifyShopTimeZone: async () => ({ ianaTimezone: timeZone, errors: [] }),
  });
  return { resolve, auth };
}
test("resource date context uses the authenticated store zone across page/facets/map/selection", async () => {
  const { resolve, auth } = resolver();
  const result = await resolve({}, { shopifySessionToken: "fixture", filters: { orderedDateFrom: "2026-10-06", orderedDateTimeZone: "Asia/Seoul" } });
  assert.equal(auth.length, 1);
  assert.equal(result.filters.orderedDateTimeZone, "America/Toronto");
  for (const functionName of ["loadOrdersPageResource", "loadOrdersFacetsResource", "loadOrdersMapPointsResource", "handleOrdersSelectionSnapshotsResource"]) {
    const body = source.slice(source.indexOf(`export async function ${functionName}`));
    assert.match(body.slice(0, body.indexOf("\nexport ")), /resolveOrdersDateContext\(request, payload\)/);
  }
});
test("missing store timezone fails closed instead of applying the browser or Seoul zone", async () => {
  await assert.rejects(resolver(null).resolve({}, { filters: {} }), { status: 503 });
});
test("delivery-only mode uses the server-configured IANA zone", async () => {
  const { resolve, auth } = resolver("America/Toronto", "delivery_only");
  assert.equal((await resolve({}, { filters: {} })).timeZone, "America/Toronto");
  assert.equal(auth.length, 0);
});
