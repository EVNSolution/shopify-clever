import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const viteConfigSource = readFileSync(join(root, "vite.config.js"), "utf8");
const tsConfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8"));
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

test("dev config pre-optimizes route hydration dependencies", () => {
  [
    "@shopify/shopify-app-react-router/adapters/node",
    "@shopify/shopify-app-react-router/react",
    "@shopify/shopify-app-react-router/server",
    "@shopify/shopify-app-session-storage-prisma",
    "@prisma/client",
    "maplibre-gl",
    "pmtiles",
  ].forEach((dependencyName) => {
    assert.match(
      viteConfigSource,
      new RegExp(`include:\\s*\\[[^\\]]*"${dependencyName}"`, "s"),
    );
  });
});

test("dev config keeps /app/routes document navigations out of Vite's route manifest module", () => {
  assert.match(viteConfigSource, /name:\s*"clever-routes-document-fallback"/);
  assert.match(viteConfigSource, /pathname !== "\/app\/routes"/);
  assert.match(viteConfigSource, /fetchDest\) === "document"/);
  assert.match(viteConfigSource, /fetchMode\) === "navigate"/);
  assert.match(viteConfigSource, /accept\.includes\("text\/html"\)/);
  assert.match(viteConfigSource, /accept === "\*\/\*"/);
  assert.match(viteConfigSource, /req\.headers\.accept = "text\/html"/);
  assert.doesNotMatch(viteConfigSource, /res\.statusCode = 302|Location/);
  assert.match(viteConfigSource, /plugins:\s*\[routesDocumentFallbackPlugin\(\),\s*reactRouter\(\),\s*tsconfigPaths\(\)\]/);
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

test("route detail map renders route stops as stable DOM overlay markers", () => {
  assert.match(routeDetailPageSource, /function createRouteDetailMapMarkers\(map, maplibregl, departureLocation, routeStops, routeStopPoints\) \{/);
  assert.match(routeDetailPageSource, /function createRouteStopMarkerElement\(stop\) \{/);
  assert.match(routeDetailPageSource, /function createRouteStopPointMarkerElement\(\) \{/);
  assert.match(routeDetailPageSource, /const stopMarker = new maplibregl\.Marker/);
  assert.match(routeDetailPageSource, /const snappedStopPointMarker = new maplibregl\.Marker/);
  assert.match(routeDetailPageSource, /markerElement\.addEventListener\("dblclick", handleStopMarkerDoubleClick\)/);
  assert.doesNotMatch(routeDetailPageSource, /ROUTE_DETAIL_STOPS_SOURCE_ID|ROUTE_DETAIL_STOP_POINTER_LAYER_ID|ROUTE_DETAIL_STOP_POINT_LAYER_ID/);
  assert.doesNotMatch(routeDetailPageSource, /map\.addSource\(ROUTE_DETAIL_STOPS_SOURCE_ID|map\.on\("dblclick",\s*ROUTE_DETAIL_STOP_POINTER_LAYER_ID/);
});

test("TypeScript config avoids deprecated baseUrl", () => {
  assert.equal(Object.hasOwn(tsConfig.compilerOptions, "baseUrl"), false);
  assert.equal(Object.hasOwn(tsConfig.compilerOptions, "ignoreDeprecations"), false);
});
