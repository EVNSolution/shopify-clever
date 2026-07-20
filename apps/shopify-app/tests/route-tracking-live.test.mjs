import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const appRoot = new URL("../app/", import.meta.url);
const trackingContractPath = new URL("features/delivery/route-tracking.js", appRoot);
const trackingProxyPath = new URL("features/delivery/route-tracking.server.js", appRoot);
const trackingResourcePath = new URL("routes/app.route-tracking.$routePlanId.jsx", appRoot);
const routeDetailPath = new URL("routes/app.routes.$routeId.jsx", appRoot);
const routeMapPath = new URL("features/delivery/route-detail-map.js", appRoot);

function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

test("Shopify proxies the authenticated delivery tracking stream without exposing the delivery API", () => {
  assert.ok(existsSync(trackingProxyPath));
  assert.ok(existsSync(trackingResourcePath));
  const proxySource = readIfPresent(trackingProxyPath);
  const resourceSource = readIfPresent(trackingResourcePath);

  assert.match(resourceSource, /authenticate\.admin\(request\)/);
  assert.match(resourceSource, /mode === "snapshot"/);
  assert.match(resourceSource, /proxyDeliveryRouteTrackingSnapshot\(request, params\.routePlanId\)/);
  assert.match(resourceSource, /proxyDeliveryRouteTrackingStream\(request, params\.routePlanId\)/);
  assert.match(proxySource, /\/admin\/route-plans\/\$\{safeRoutePlanId\}\/tracking`/);
  assert.match(proxySource, /\/admin\/route-plans\/\$\{safeRoutePlanId\}\/tracking\/stream/);
  assert.match(proxySource, /authorization/);
  assert.match(proxySource, /"x-clever-app-id"/);
  assert.match(proxySource, /signal: request\.signal/);
  assert.match(proxySource, /"cache-control": "no-store, no-transform"/);
});

test("child route detail subscribes with a fresh Shopify token and reconnects the SSE stream", () => {
  assert.ok(existsSync(trackingContractPath));
  const routeDetailSource = readIfPresent(routeDetailPath);

  assert.match(routeDetailSource, /shopifyRef\.current\.idToken\(\)/);
  assert.match(routeDetailSource, /fetch\(`\/app\/route-tracking\/\$\{encodeURIComponent\(liveTrackingRoutePlanId\)\}`/);
  assert.match(routeDetailSource, /Authorization: `Bearer \$\{sessionToken\}`/);
  assert.match(routeDetailSource, /consumeRouteTrackingSseChunk/);
  assert.match(routeDetailSource, /tracking_snapshot/);
  assert.match(routeDetailSource, /tracking_position/);
  assert.match(routeDetailSource, /tracking_progress/);
  assert.match(routeDetailSource, /const liveTrackingRoutePlanId = routeExecutionStatus === "IN_PROGRESS"/);
  assert.match(routeDetailSource, /\?mode=snapshot/);
  assert.match(routeDetailSource, /getRouteExecutionStatusFromTrackingEvent/);
  assert.match(routeDetailSource, /document\.visibilityState/);
  assert.match(routeDetailSource, /AbortController/);
  assert.match(routeDetailSource, /trackingReconnectDelayMs/);
  assert.match(routeDetailSource, /const isCurrentController = streamController === controller/);
  assert.doesNotMatch(routeDetailSource, /\}, \[shopify, liveTrackingRoutePlanId\]\)/);
});

test("live tracking updates MapLibre sources instead of rebuilding the child map", () => {
  const routeDetailSource = readIfPresent(routeDetailPath);
  const routeMapSource = readIfPresent(routeMapPath);

  assert.match(routeMapSource, /const ROUTE_DETAIL_TRACKING_SOURCE_ID = "route-detail-live-tracking"/);
  assert.match(routeMapSource, /function syncRouteDetailLiveTracking\(map, trackingSnapshot/);
  assert.match(routeMapSource, /existingSource\?\.setData/);
  assert.match(routeMapSource, /trackingTrail/);
  assert.match(routeMapSource, /trackingPosition/);
  assert.match(routeMapSource, /"line-dasharray"/);
  assert.match(routeMapSource, /map\.moveLayer\?\.\(ROUTE_DETAIL_TRACKING_POSITION_LAYER_ID\)/);
  assert.match(routeMapSource, /ROUTE_DETAIL_COMPLETED_STOP_COLOR/);
  assert.match(routeDetailSource, /completedTrackingStopIds/);
  assert.match(routeDetailSource, /syncRouteDetailLiveTracking\(routeMapRef\.current, routeTrackingSnapshot/);
});

test("Tracking tab presents status-aware live or historical tracking and the latest received position", () => {
  const routeDetailSource = readIfPresent(routeDetailPath);

  assert.match(routeDetailSource, /getRouteTrackingPresentation/);
  assert.match(routeDetailSource, /routeTrackingPresentation\.mode === "live"/);
  assert.match(routeDetailSource, /routeTrackingPresentation\.trackingLabel/);
  assert.match(routeDetailSource, /routeTrackingConnectionLabel/);
  assert.match(routeDetailSource, /routeTrackingSnapshot\?\.policy/);
  assert.match(routeDetailSource, /Latest position/);
  assert.match(routeDetailSource, /Last received/);
  assert.match(routeDetailSource, /trackingConnectionState/);
  assert.match(routeDetailSource, /Driver stage/);
  assert.match(routeDetailSource, /routeTrackingSnapshot\?\.progress/);
});
