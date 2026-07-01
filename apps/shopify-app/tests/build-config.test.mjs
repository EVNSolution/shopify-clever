import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readOrdersPageSource } from "./helpers/orders-source.mjs";

const root = process.cwd();

const viteConfigSource = readFileSync(join(root, "vite.config.js"), "utf8");
const tsConfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8"));
const ordersPageSource = readOrdersPageSource();
const routeDetailPageSource = readFileSync(
  join(root, "app/routes/app.routes.$routeId.jsx"),
  "utf8",
);
const routeDetailMapSource = readFileSync(
  join(root, "app/features/delivery/route-detail-map.js"),
  "utf8",
);
const settingsPageSource = readFileSync(
  join(root, "app/routes/app.settings.jsx"),
  "utf8",
);
const settingsDepartureMapSource = readFileSync(
  join(root, "app/features/settings/settings-departure-map.jsx"),
  "utf8",
);
const mapLibreMapSource = readFileSync(
  join(root, "app/features/maps/maplibre-map.js"),
  "utf8",
);
const mapMarkersSource = readFileSync(
  join(root, "app/features/maps/map-markers.js"),
  "utf8",
);

test("build config treats MapLibre as an intentional lazy map chunk", () => {
  assert.match(ordersPageSource, /import\("maplibre-gl"\)/);
  assert.match(routeDetailPageSource, /import\("maplibre-gl"\)/);
  assert.match(settingsDepartureMapSource, /await import\("maplibre-gl"\)/);
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

test("dev config allows Shopify CLI Cloudflare tunnel hosts without disabling host checks", () => {
  assert.match(viteConfigSource, /const SHOPIFY_DEV_TUNNEL_HOST = "\.trycloudflare\.com"/);
  assert.match(viteConfigSource, /allowedHosts:\s*\[host,\s*SHOPIFY_DEV_TUNNEL_HOST\]/);
  assert.doesNotMatch(viteConfigSource, /allowedHosts:\s*true/);
});

test("MapLibre maps share global interaction defaults", () => {
  assert.match(mapLibreMapSource, /cooperativeGestures:\s*true/);
  assert.match(mapLibreMapSource, /scrollZoom:\s*true/);
  assert.match(mapLibreMapSource, /new maplibregl\.Map/);
  assert.match(ordersPageSource, /createMapLibreMap\(maplibregl, \{/);
  assert.match(routeDetailPageSource, /createMapLibreMap\(maplibregl, \{/);
  assert.match(settingsDepartureMapSource, /createMapLibreMap\(maplibregl, \{/);
  assert.match(ordersPageSource, /fadeDuration:\s*0/);
  assert.match(routeDetailPageSource, /fadeDuration:\s*0/);
  assert.match(settingsDepartureMapSource, /fadeDuration:\s*0/);
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
  assert.match(ordersPageSource, /createMapPinSymbolLayer\(\{/);
  assert.match(mapMarkersSource, /type: "symbol"/);
  assert.doesNotMatch(ordersPageSource, /ORDER_MARKER_MIN_ZOOM/);
  assert.doesNotMatch(ordersPageSource, /minzoom/);
  assert.match(ordersPageSource, /map\.on\("click",\s*ORDERS_MAP_ORDER_LAYER_ID/);
  assert.doesNotMatch(ordersPageSource, /const marker = new maplibregl\.Marker/);
});

test("route detail map renders route stops through MapLibre source layers", () => {
  assert.match(routeDetailMapSource, /function syncRouteDetailMapMarkerLayers\(map, departureLocation, routeStops/);
  assert.match(routeDetailMapSource, /const ROUTE_DETAIL_MARKER_SOURCE_ID = "route-detail-markers"/);
  assert.match(routeDetailMapSource, /const ROUTE_DETAIL_STOP_LAYER_ID = "route-detail-stop-markers"/);
  assert.match(routeDetailMapSource, /createMapPinSymbolLayer\(\{/);
  assert.doesNotMatch(routeDetailPageSource, /const stopMarker = new maplibregl\.Marker/);
  assert.doesNotMatch(routeDetailPageSource, /const snappedStopPointMarker = new maplibregl\.Marker/);
  assert.doesNotMatch(routeDetailMapSource, /const stopMarker = new maplibregl\.Marker/);
  assert.doesNotMatch(routeDetailMapSource, /const snappedStopPointMarker = new maplibregl\.Marker/);
});

test("TypeScript config avoids deprecated baseUrl", () => {
  assert.equal(Object.hasOwn(tsConfig.compilerOptions, "baseUrl"), false);
  assert.equal(Object.hasOwn(tsConfig.compilerOptions, "ignoreDeprecations"), false);
});
