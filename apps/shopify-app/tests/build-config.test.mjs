import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const viteConfigSource = readFileSync(join(root, "vite.config.js"), "utf8");
const ordersPageSource = readFileSync(
  join(root, "app/routes/app.orders.jsx"),
  "utf8",
);
const routeDetailPageSource = readFileSync(
  join(root, "app/routes/app.routes.$routeId.jsx"),
  "utf8",
);
const settingsPageSource = readFileSync(
  join(root, "app/routes/app.settings.jsx"),
  "utf8",
);

test("build config treats MapLibre as an intentional lazy map chunk", () => {
  assert.match(ordersPageSource, /import\("maplibre-gl"\)/);
  assert.match(routeDetailPageSource, /import\("maplibre-gl"\)/);
  assert.match(settingsPageSource, /await import\("maplibre-gl"\)/);
  assert.match(ordersPageSource, /import\("pmtiles"\)/);
  assert.match(routeDetailPageSource, /import\("pmtiles"\)/);
  assert.match(viteConfigSource, /chunkSizeWarningLimit:\s*1200/);
  assert.match(viteConfigSource, /MapLibre/);
});

test("MapLibre maps avoid symbol fade delays", () => {
  assert.match(ordersPageSource, /fadeDuration:\s*0/);
  assert.match(routeDetailPageSource, /fadeDuration:\s*0/);
  assert.match(settingsPageSource, /fadeDuration:\s*0/);
});

test("route detail map does not rebuild DOM markers after pan or zoom", () => {
  assert.doesNotMatch(routeDetailPageSource, /\.on\("moveend",\s*renderRouteMarkers\)/);
  assert.doesNotMatch(routeDetailPageSource, /\.off\("moveend",\s*renderRouteMarkers\)/);
  assert.doesNotMatch(routeDetailPageSource, /\.on\("zoomend",\s*renderRouteMarkers\)/);
  assert.doesNotMatch(routeDetailPageSource, /\.off\("zoomend",\s*renderRouteMarkers\)/);
});

test("orders map renders order pins through a MapLibre source layer", () => {
  assert.match(ordersPageSource, /ORDERS_MAP_SOURCE_ID/);
  assert.match(ordersPageSource, /ORDERS_MAP_ORDER_LAYER_ID/);
  assert.match(ordersPageSource, /map\.addSource\(ORDERS_MAP_SOURCE_ID/);
  assert.match(ordersPageSource, /type:\s*"symbol"/);
  assert.match(ordersPageSource, /map\.on\("click",\s*ORDERS_MAP_ORDER_LAYER_ID/);
  assert.doesNotMatch(ordersPageSource, /const marker = new maplibregl\.Marker/);
});

test("route detail map renders route stops through MapLibre source layers", () => {
  assert.match(routeDetailPageSource, /ROUTE_DETAIL_STOPS_SOURCE_ID/);
  assert.match(routeDetailPageSource, /ROUTE_DETAIL_STOP_POINTER_LAYER_ID/);
  assert.match(routeDetailPageSource, /ROUTE_DETAIL_STOP_POINT_LAYER_ID/);
  assert.match(routeDetailPageSource, /map\.addSource\(ROUTE_DETAIL_STOPS_SOURCE_ID/);
  assert.match(routeDetailPageSource, /map\.on\("dblclick",\s*ROUTE_DETAIL_STOP_POINTER_LAYER_ID/);
  assert.doesNotMatch(routeDetailPageSource, /const pointerMarker = new maplibregl\.Marker/);
  assert.doesNotMatch(routeDetailPageSource, /const stopPointMarker = new maplibregl\.Marker/);
});
