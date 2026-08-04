import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

const root = process.env.ORDERS_CONTRACT_ROOT ?? process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const pageRouteSource = read("app/routes/app.orders_.page.jsx");
const facetsRouteSource = read("app/routes/app.orders_.facets.jsx");
const mapRouteSource = read("app/routes/app.orders_.map-points.jsx");
const selectionRouteSource = read("app/routes/app.orders_.selection-snapshots.jsx");
const ordersPageServerSource = read("app/features/orders/orders-page.server.js");
const ordersResourceStateSource = read("app/features/orders/orders-resource-state.js");

test("Orders pagination, facets, and map use independent authenticated POST resources", () => {
  assert.match(pageRouteSource, /loadOrdersPageResource/);
  assert.match(pageRouteSource, /export const action/);
  assert.doesNotMatch(pageRouteSource, /export default/);

  assert.match(facetsRouteSource, /loadOrdersFacetsResource/);
  assert.match(facetsRouteSource, /export const action/);
  assert.doesNotMatch(facetsRouteSource, /export default/);

  assert.match(mapRouteSource, /loadOrdersMapPointsResource/);
  assert.match(mapRouteSource, /export const action/);
  assert.doesNotMatch(mapRouteSource, /export default/);

  assert.match(
    ordersPageServerSource,
    /export async function loadOrdersPageResource\(request\) \{[\s\S]*readOrdersQueryResourcePayload\(request\)[\s\S]*authenticatedResourceRequest\(request, payload\.shopifySessionToken\)[\s\S]*fetchDeliveryOrdersPage\(/,
  );
  assert.match(
    ordersPageServerSource,
    /export async function loadOrdersFacetsResource\(request\) \{[\s\S]*readOrdersQueryResourcePayload\(request\)[\s\S]*fetchDeliveryOrderFacets\(/,
  );
  assert.match(
    ordersPageServerSource,
    /export async function loadOrdersMapPointsResource\(request\) \{[\s\S]*readOrdersQueryResourcePayload\(request\)[\s\S]*fetchDeliveryOrderMapPoints\(/,
  );
  assert.match(
    ordersPageServerSource,
    /async function measureOrdersResource\(request, name, operation\) \{[\s\S]*await authenticate\.admin\(request\)/,
  );
});

test("Orders selection snapshots use an authenticated action and never put the token in a URL", () => {
  assert.match(selectionRouteSource, /handleOrdersSelectionSnapshotsResource/);
  assert.match(selectionRouteSource, /export const action/);
  assert.doesNotMatch(selectionRouteSource, /export const loader|export default/);

  assert.match(
    ordersPageServerSource,
    /export async function handleOrdersSelectionSnapshotsResource\(request\) \{[\s\S]*authenticatedResourceRequest\(request, sessionToken\)[\s\S]*request\.method === "POST"[\s\S]*createDeliveryOrdersSelectionSnapshot\([\s\S]*request\.method === "PATCH"[\s\S]*replaceDeliveryOrdersSelectionExclusions\(/,
  );
  assert.doesNotMatch(ordersResourceStateSource, /searchParams\.set\("selectionToken"/);
  assert.match(ordersResourceStateSource, /selection: "\/app\/orders\/selection-snapshots"/);
  assert.match(ordersPageServerSource, /_selectionOperation: "create"/);
  assert.match(ordersPageServerSource, /_selectionOperation: "replace"/);
  assert.match(ordersPageServerSource, /_requestKey: payload\._requestKey \?\? null/);
});

test("Orders resource numeric navigation posts a page number and rejects stale responses", () => {
  assert.match(ordersResourceStateSource, /searchParams\.delete\("after"\)/);
  assert.match(ordersResourceStateSource, /searchParams\.delete\("before"\)/);
  assert.match(ordersResourceStateSource, /searchParams\.delete\("page"\)/);
  assert.match(
    ordersResourceStateSource,
    /\.\.\.\(options\.page \? \{ page: String\(options\.page\) \} : \{\}\)/,
  );
  assert.match(ordersResourceStateSource, /options\.readWatermark \? \{ readWatermark: options\.readWatermark \}/);
  assert.doesNotMatch(ordersResourceStateSource, /searchParams\.set\("id_token"/);
  assert.match(
    ordersResourceStateSource,
    /data\?\._requestKey === requestKey/,
  );
  assert.match(ordersPageServerSource, /page: payload\.page \?\? 1/);
  assert.match(ordersPageServerSource, /readWatermark: payload\.readWatermark/);
});
