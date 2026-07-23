import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const appRoot = new URL("../app/", import.meta.url);
const trackingContractPath = new URL("features/delivery/route-tracking.js", appRoot);
const trackingProxyPath = new URL("features/delivery/route-tracking.server.js", appRoot);
const trackingResourcePath = new URL("routes/app.route-tracking.$routePlanId.jsx", appRoot);
const routeDetailPath = new URL("routes/app.routes.$routeId.jsx", appRoot);
const routeMapPath = new URL("features/delivery/route-detail-map.js", appRoot);
const globalCssPath = new URL("styles/global.css", appRoot);

function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

test("Tracking map fits the latest GPS position when no recorded path exists yet", () => {
  const routeMapSource = readIfPresent(routeMapPath);
  const routeDetailSource = readIfPresent(routeDetailPath);

  assert.match(routeMapSource, /getRouteTrackingFitCoordinates\(trackingSnapshot\)\.map/);
  assert.doesNotMatch(routeMapSource, /getRouteTrackingPathPoints\(trackingSnapshot\)\.map/);
  assert.match(routeDetailSource, /const hasTrackingGpsFitRef = useRef\(false\)/);
  assert.match(routeDetailSource, /if \(!isTrackingMapView \|\| !isMapReady \|\| routeTrackingMapLocations\.length === 0\) return/);
  assert.match(routeDetailSource, /fitRouteDetailMap\(mapRef\.current, mapLibraryRef\.current, routeTrackingMapLocations\)/);
});

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

test("tracking proxy remains a React Router resource route", () => {
  const resourceSource = readIfPresent(trackingResourcePath);

  assert.doesNotMatch(resourceSource, /export\s+default\b/);
  assert.doesNotMatch(resourceSource, /export\s+(?:function|const)\s+ErrorBoundary\b/);
  assert.doesNotMatch(resourceSource, /export\s+const\s+headers\b/);
});

test("ready and in-progress child routes observe lifecycle events with a fresh Shopify token", () => {
  assert.ok(existsSync(trackingContractPath));
  const routeDetailSource = readIfPresent(routeDetailPath);

  assert.match(routeDetailSource, /shopifyRef\.current\.idToken\(\)/);
  assert.match(routeDetailSource, /fetch\(`\/app\/route-tracking\/\$\{encodeURIComponent\(trackingStreamRoutePlanId\)\}`/);
  assert.match(routeDetailSource, /Authorization: `Bearer \$\{sessionToken\}`/);
  assert.match(routeDetailSource, /consumeRouteTrackingSseChunk/);
  assert.match(routeDetailSource, /tracking_snapshot/);
  assert.match(routeDetailSource, /tracking_position/);
  assert.match(routeDetailSource, /tracking_progress/);
  assert.match(routeDetailSource, /const liveTrackingRoutePlanId = routeExecutionStatus === "IN_PROGRESS"/);
  assert.match(routeDetailSource, /const trackingStreamRoutePlanId = \["READY", "IN_PROGRESS"\]\.includes\(routeExecutionStatus\)/);
  assert.match(routeDetailSource, /\?mode=snapshot/);
  assert.match(routeDetailSource, /getRouteExecutionStatusFromTrackingEvent/);
  assert.match(routeDetailSource, /document\.visibilityState/);
  assert.match(routeDetailSource, /AbortController/);
  assert.match(routeDetailSource, /trackingReconnectDelayMs/);
  assert.match(routeDetailSource, /isRouteTrackingPayloadForRoute/);
  assert.match(routeDetailSource, /if \(isDisposed \|\| controller\.signal\.aborted\) break;/);
  assert.match(routeDetailSource, /const isCurrentController = streamController === controller/);
  assert.doesNotMatch(routeDetailSource, /\}, \[shopify, trackingStreamRoutePlanId\]\)/);
});

test("live tracking keeps the server past-path snapshot while the stream connects and reconnects", () => {
  const routeDetailSource = readIfPresent(routeDetailPath);

  assert.match(routeDetailSource, /\?mode=snapshot/);
  assert.doesNotMatch(
    routeDetailSource,
    /if \(!trackingRoutePlanId \|\| trackingStreamRoutePlanId\) return undefined/,
  );
  assert.doesNotMatch(
    routeDetailSource,
    /routeTrackingSnapshotRef\.current = null;\s*setRouteTrackingSnapshot\(null\);\s*document\.addEventListener\("visibilitychange"/,
  );
  assert.match(routeDetailSource, /mergeRouteTrackingPosition\(/);
  assert.match(routeDetailSource, /getRouteTrackingStreamInactivityMs\(routeTrackingSnapshotRef\.current\)/);
  assert.match(routeDetailSource, /armStreamInactivityTimer\(controller\)/);
  assert.match(routeDetailSource, /streamController !== controller/);
  assert.match(routeDetailSource, /setTrackingConnectionState\("reconnecting"\);\s*controller\.abort\(\)/);
});

test("server ETA lifecycle events revalidate route detail for both Stops and Tracking tables", () => {
  const routeDetailSource = readIfPresent(routeDetailPath);

  assert.match(routeDetailSource, /doesTrackingEventRefreshEta\(progressEvent\)/);
  assert.match(routeDetailSource, /revalidatorRef\.current\.revalidate\(\)/);
  assert.match(routeDetailSource, /\["ETA \(est\.\)", "120px"\]/);
  assert.match(routeDetailSource, /<td style=\{childRouteOrderCellStyle\}>\{row\.eta\}<\/td>/);
});

test("live tracking updates MapLibre sources instead of rebuilding the child map", () => {
  const routeDetailSource = readIfPresent(routeDetailPath);
  const routeMapSource = readIfPresent(routeMapPath);
  const globalCssSource = readIfPresent(globalCssPath);

  assert.match(routeMapSource, /const ROUTE_DETAIL_TRACKING_SOURCE_ID = "route-detail-live-tracking"/);
  assert.match(routeMapSource, /const ROUTE_DETAIL_TRACKING_ARRIVAL_SOURCE_ID = "route-detail-tracking-arrivals"/);
  assert.match(routeMapSource, /const ROUTE_DETAIL_TRACKING_ARRIVAL_CIRCLE_LAYER_ID/);
  assert.match(routeMapSource, /const ROUTE_DETAIL_TRACKING_ARRIVAL_LABEL_LAYER_ID/);
  assert.match(routeMapSource, /function syncRouteDetailLiveTracking\(map, trackingSnapshot/);
  assert.match(routeMapSource, /existingSource\?\.setData/);
  assert.match(routeMapSource, /trackingTrail/);
  assert.match(routeMapSource, /trackingConnector/);
  assert.match(routeMapSource, /getRouteTrackingLineFeatures/);
  assert.match(routeMapSource, /const routeLineOpacity = options\.isTrackingReference \? 0\.42 : 0\.78/);
  assert.match(routeMapSource, /const routeLineWidth = options\.isTrackingReference \? 3\.5 : 2\.5/);
  assert.equal((routeMapSource.match(/"line-dasharray": \[1\.5, 1\.25\]/g) ?? []).length, 2);
  assert.doesNotMatch(routeMapSource, /"line-width": 4\.5/);
  assert.match(routeMapSource, /isTrackingReference/);
  assert.doesNotMatch(routeMapSource, /trackingPosition|trackingHistoryPoint/);
  assert.doesNotMatch(routeMapSource, /ROUTE_DETAIL_TRACKING_POSITION_LAYER_ID|ROUTE_DETAIL_TRACKING_HISTORY_LAYER_ID/);
  assert.match(routeMapSource, /featureType: "stopArrival"/);
  assert.match(routeMapSource, /"text-field": \["get", "displayLabel"\]/);
  assert.match(routeMapSource, /arrivalStopCount/);
  assert.match(routeMapSource, /arrivalDetailsJson/);
  assert.doesNotMatch(routeMapSource, /badgeOffset|labelOffset|ARRIVAL_BADGE_IMAGE_ID/);
  assert.match(routeMapSource, /ROUTE_DETAIL_COMPLETED_STOP_COLOR/);
  assert.match(routeMapSource, /const ROUTE_DETAIL_STOP_COMPLETION_BADGE_LAYER_ID/);
  assert.match(routeMapSource, /const ROUTE_DETAIL_STOP_COMPLETION_CHECK_LAYER_ID/);
  assert.match(routeMapSource, /isCompleted: Boolean\(stop\.isTrackingCompleted\)/);
  assert.doesNotMatch(routeMapSource, /isCompleted: Boolean\(stop\.isTrackingCompleted \|\| isRouteStopCompleted\(stop\)\)/);
  assert.match(routeMapSource, /"circle-translate": \[-10, -28\]/);
  assert.match(routeMapSource, /"text-translate": \[-10, -28\]/);
  assert.match(routeMapSource, /"text-field": "✓"/);
  assert.doesNotMatch(routeMapSource, /const stopOpacity = isTrackingView \? 0\.42 : 1/);
  assert.match(routeDetailSource, /const completedTrackingStopIds = useMemo\(\s*\(\) => new Set\(routeTrackingProgress\?\.completedStopIds \?\? \[\]\)/);
  assert.doesNotMatch(routeDetailSource, /completedStopIds\.add\(stop\.(?:id|deliveryStopId)\)/);
  assert.match(routeDetailSource, /isTrackingCompleted: completedTrackingStopIds\.has\(stop\.id\)/);
  assert.match(routeDetailSource, /preserveRouteColor: isTrackingMapView/);
  assert.match(routeDetailSource, /background: completedTrackingStopIds\.has\(row\.id\)[\s\S]*ROUTE_DETAIL_COMPLETED_STOP_COLOR[\s\S]*routeStopColorById\.get\(row\.id\) \?\? routeLineColor/);
  assert.match(routeDetailSource, /if \(!isTrackingMapView \|\| !isMapReady \|\| !routeMapRef\.current\) return undefined/);
  assert.match(routeDetailSource, /syncRouteDetailLiveTracking\(routeMapRef\.current, displayedRouteTrackingSnapshot, routeMapStops\)/);
  assert.match(routeDetailSource, /map\.on\("click", ROUTE_DETAIL_TRACKING_ARRIVAL_CIRCLE_LAYER_ID, handleArrivalMarkerClick\)/);
  assert.match(routeDetailSource, /new maplibregl\.Popup\(/);
  assert.match(routeDetailSource, /\.setDOMContent\(content\)/);
  assert.match(routeDetailSource, /closeButton: false/);
  assert.match(routeDetailSource, /padding: \{ bottom: 12, left: 12, right: 12, top: 12 \}/);
  assert.match(routeDetailSource, /getRouteDetailPopupPanOffset/);
  assert.match(routeDetailSource, /map\.panBy\(panOffset/);
  assert.match(routeDetailSource, /const routeTrackingMapCanvasStyle = \{[\s\S]*height: "100%"[\s\S]*minHeight: 0/);
  assert.doesNotMatch(routeDetailSource, /minHeight: "570px"/);
  assert.match(routeDetailSource, /close\.className = "route-tracking-arrival-popup__close"/);
  assert.match(globalCssSource, /\.route-tracking-arrival-popup__stop\s*\{[\s\S]*min-width:\s*56px/);
  assert.match(globalCssSource, /\.route-tracking-arrival-popup__close\s*\{[\s\S]*font-size:\s*16px/);
  assert.match(globalCssSource, /\.route-tracking-arrival-popup__list\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(routeMapSource, /function syncRouteDetailMapViewEmphasis\(map, isTrackingView = false\)/);
  assert.match(routeDetailSource, /syncRouteDetailMapViewEmphasis\(map, isTrackingMapView\)/);
  assert.match(routeMapSource, /function syncRouteDetailTrackingVisibility\(map, isTrackingView = false\)/);
  assert.match(routeMapSource, /setLayoutProperty\?\.\(layerId, "visibility", visibility\)/);
  assert.match(routeDetailSource, /syncRouteDetailTrackingVisibility\(map, isTrackingMapView\)/);
  assert.match(routeMapSource, /syncRouteDetailTrackingVisibility\(map, true\)/);
});

test("Tracking tab presents status-aware live or historical tracking and the latest received position", () => {
  const routeDetailSource = readIfPresent(routeDetailPath);

  assert.match(routeDetailSource, /getRouteTrackingPresentation/);
  assert.match(routeDetailSource, /routeTrackingPresentation\.mode === "live"/);
  assert.match(routeDetailSource, /routeTrackingPresentation\.trackingLabel/);
  assert.match(routeDetailSource, /routeTrackingConnectionLabel/);
  assert.match(routeDetailSource, /displayedRouteTrackingSnapshot\?\.policy/);
  assert.match(routeDetailSource, /Latest position/);
  assert.match(routeDetailSource, /Last received/);
  assert.match(routeDetailSource, /trackingConnectionState/);
  assert.match(routeDetailSource, /Driver stage/);
  assert.match(routeDetailSource, /displayedRouteTrackingSnapshot\?\.progress/);
  assert.match(routeDetailSource, /GPS records/);
  assert.match(routeDetailSource, /Fit recorded GPS path/);
  assert.doesNotMatch(routeDetailSource, /GPS record #/);
});
