import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { readOrdersPageSource } from "./helpers/orders-source.mjs";
import { mapCanonicalOrdersToOrderRows } from "../app/features/orders/canonical-orders.js";
import {
  buildOrderTimelineDetails,
  formatLatestShopifyOrderUpdatedAt,
  formatOrdersResultGeneratedAt,
  getOrdersReconciliationPollingCompletion,
  getOrdersReconciliationStatusMessage,
  getOrdersRefreshCompletion,
  getLatestShopifyOrderUpdatedAt,
  isOrdersReconciliationTerminalFailure,
  isOrdersReconciliationTerminalSuccess,
  shouldIgnoreTransientEmptyOrdersPageResponse,
  shouldPollOrdersReconciliationJob,
} from "../app/features/orders/orders-page.shared.js";

const root = process.cwd();

const ordersPageSource = readOrdersPageSource();
const ordersPageServerSource = readFileSync(
  join(root, "app/features/orders/orders-page.server.js"),
  "utf8",
);
const rootDocumentSource = readFileSync(join(root, "app/root.jsx"), "utf8");
const shopifyOrdersSource = readFileSync(
  join(root, "app/features/orders/shopify-orders.server.js"),
  "utf8",
);
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const appConfigSource = readFileSync(join(root, "shopify.app.toml"), "utf8");
const globalCssSource = readFileSync(join(root, "app/styles/global.css"), "utf8");
const pmtilesProtocolSource = readFileSync(
  join(root, "app/features/maps/pmtiles-protocol.js"),
  "utf8",
);
const serviceErrorsSource = readFileSync(
  join(root, "app/features/service-errors.js"),
  "utf8",
);
const shopTimeZoneSource = readFileSync(
  join(root, "app/features/shopify/shop-timezone.server.js"),
  "utf8",
);
const deliveryOrdersSource = readFileSync(
  join(root, "app/features/delivery/orders.server.js"),
  "utf8",
);
const mapPanelSource = readFileSync(
  join(root, "app/ui/map-panel.jsx"),
  "utf8",
);
const mapMarkersSource = readFileSync(
  join(root, "app/features/maps/map-markers.js"),
  "utf8",
);
const appShellSource = readFileSync(
  join(root, "app/routes/app.jsx"),
  "utf8",
);
const inventoryDetailSource = readFileSync(
  join(root, "app/routes/app.orders_.inventory.jsx"),
  "utf8",
);
const infoPillSource = readFileSync(join(root, "app/ui/info-pill.jsx"), "utf8");
const openFreeMapStyle = JSON.parse(
  readFileSync(join(root, "public/vendor/openfreemap-liberty.json"), "utf8"),
);
const cleverLiteStylePath = join(root, "public/vendor/openfreemap-clever-lite.json");
const cleverLiteStyle = existsSync(cleverLiteStylePath)
  ? JSON.parse(readFileSync(cleverLiteStylePath, "utf8"))
  : null;

test("Orders tab loads Shopify orders and renders them in the shared map layout", () => {
  assert.match(ordersPageSource, /export const loader = async \(\{ request \}\) =>/);
  assert.match(ordersPageSource, /authenticate\.admin\(request\)/);
  assert.match(ordersPageSource, /const shopifyShopCacheKey = session\?\.shop/);
  assert.match(ordersPageSource, /fetchShopifyAppPreferences\(admin\)/);
  assert.match(
    ordersPageSource,
    /fetchShopifyOrders\(admin,\s*\{[\s\S]*cacheKey: shopifyShopCacheKey,[\s\S]*deliveryCycle: preferencesData\.appPreferences\.deliveryCycle,[\s\S]*\}\)/,
  );
  assert.match(ordersPageSource, /fetchShopifyDepartureLocation\(admin,\s*\{\s*cacheKey: shopifyShopCacheKey\s*\}\)/);
  assert.match(ordersPageSource, /useLoaderData\(\)/);
  assert.doesNotMatch(ordersPageSource, /title="Orders"/);
  assert.doesNotMatch(ordersPageSource, /Shopify orders connected to the delivery map/);
  assert.match(ordersPageSource, /primary=\{/);
  assert.match(ordersPageSource, /id="orders-map"/);
  assert.match(ordersPageSource, /label: "Area"/);
  assert.match(ordersPageSource, /label: "Ordered"/);
  assert.match(ordersPageSource, /label: "Delivery"/);
  assert.match(serviceErrorsSource, /PROTECTED_ORDER_ACCESS/);
  assert.match(serviceErrorsSource, /Protected customer data access/);
  assert.match(ordersPageSource, /import\("maplibre-gl"\)/);
  assert.match(ordersPageSource, /import\("pmtiles"\)/);
  assert.match(ordersPageSource, /installPmtilesProtocol\(maplibregl, Protocol\)/);
  assert.doesNotMatch(ordersPageSource, /const orders = \[/);
  assert.match(appConfigSource, /scopes = "[^"]*read_orders/);
  assert.match(appConfigSource, /scopes = "[^"]*read_locations/);
  assert.match(appConfigSource, /scopes = "[^"]*read_customers/);
  assert.equal(packageJson.dependencies["maplibre-gl"]?.length > 0, true);
  assert.equal(packageJson.dependencies.pmtiles?.length > 0, true);
});

test("Orders update action shows when the current query result was generated", () => {
  assert.match(ordersPageSource, /Results as of: \{ordersResultGeneratedAt\}/);
  assert.match(ordersPageSource, /Update Shopify orders/);
  assert.doesNotMatch(ordersPageSource, />Update routes</);
  assert.match(ordersPageSource, /clearShopifyOrdersCache\(shopifyShopCacheKey\)/);

  const orders = [
    { updatedAt: "2026-07-29T01:00:00.000Z" },
    {
      updatedAtShopify: "2026-07-29T02:00:00.000Z",
      updatedAt: "2026-07-29T05:00:00.000Z",
    },
    {
      shopifyOrderSnapshot: { updatedAt: "2026-07-29T04:30:15.000Z" },
    },
    {
      rawPayload: { updatedAt: "not-a-date" },
    },
  ];

  assert.equal(
    getLatestShopifyOrderUpdatedAt(orders),
    "2026-07-29T05:00:00.000Z",
  );
  assert.equal(
    formatLatestShopifyOrderUpdatedAt(orders, "Asia/Seoul"),
    "2026-07-29, 14:00:00",
  );
  assert.equal(formatLatestShopifyOrderUpdatedAt([], "Asia/Seoul"), "—");
  assert.equal(
    formatOrdersResultGeneratedAt("2026-07-29T05:00:00.000Z", "Asia/Seoul"),
    "2026-07-29, 14:00:00",
  );
  assert.equal(formatOrdersResultGeneratedAt("not-a-date", "Asia/Seoul"), "—");
});

test("Orders Shopify refresh completion is handled once per background request", () => {
  const completedRefresh = {
    errors: [],
    refreshRequestId: "refresh-1",
    refreshedRoutes: 3,
    updatedOrders: 12,
  };

  assert.equal(
    getOrdersRefreshCompletion({
      activeRequestId: "refresh-1",
      data: completedRefresh,
      fetcherState: "loading",
      handledRequestId: null,
    }),
    null,
  );
  assert.deepEqual(
    getOrdersRefreshCompletion({
      activeRequestId: "refresh-1",
      data: completedRefresh,
      fetcherState: "idle",
      handledRequestId: null,
    }),
    {
      data: completedRefresh,
      hasErrors: false,
      requestId: "refresh-1",
    },
  );
  assert.equal(
    getOrdersRefreshCompletion({
      activeRequestId: "refresh-1",
      data: completedRefresh,
      fetcherState: "idle",
      handledRequestId: "refresh-1",
    }),
    null,
  );
  assert.equal(
    getOrdersRefreshCompletion({
      activeRequestId: "refresh-2",
      data: completedRefresh,
      fetcherState: "idle",
      handledRequestId: null,
    }),
    null,
  );
  assert.equal(
    getOrdersRefreshCompletion({
      activeRequestId: "refresh-1",
      data: {
        ...completedRefresh,
        errors: [{ message: "sync failed" }],
      },
      fetcherState: "idle",
      handledRequestId: null,
    })?.hasErrors,
    true,
  );
  assert.equal(
    getOrdersRefreshCompletion({
      activeRequestId: "refresh-1",
      data: { errors: [{ message: "action failed before correlation" }] },
      fetcherState: "idle",
      handledRequestId: null,
    })?.requestId,
    "refresh-1",
  );
});

test("Orders reconciliation polling ignores stale jobs and classifies terminal statuses", () => {
  const runningData = {
    errors: [],
    refreshRequestId: "refresh-1",
    reconciliationJob: {
      counts: { scanned: 20, updated: 8 },
      jobId: "job-1",
      status: "running",
    },
  };

  assert.equal(shouldPollOrdersReconciliationJob(runningData.reconciliationJob), true);
  assert.equal(isOrdersReconciliationTerminalSuccess(runningData.reconciliationJob), false);
  assert.equal(isOrdersReconciliationTerminalFailure(runningData.reconciliationJob), false);
  assert.equal(
    getOrdersReconciliationStatusMessage(runningData.reconciliationJob),
    "Reconciliation running: 20 scanned, 8 updated",
  );

  assert.deepEqual(
    getOrdersReconciliationPollingCompletion({
      activeJobId: "job-1",
      activeRequestId: "refresh-1",
      data: runningData,
      fetcherState: "idle",
    }),
    {
      data: runningData,
      hasErrors: false,
      job: runningData.reconciliationJob,
      jobId: "job-1",
      requestId: "refresh-1",
    },
  );
  assert.equal(
    getOrdersReconciliationPollingCompletion({
      activeJobId: "job-2",
      activeRequestId: "refresh-1",
      data: runningData,
      fetcherState: "idle",
    }),
    null,
  );
  assert.equal(
    getOrdersReconciliationPollingCompletion({
      activeJobId: "job-1",
      activeRequestId: "refresh-2",
      data: runningData,
      fetcherState: "idle",
    }),
    null,
  );

  const succeededJob = { ...runningData.reconciliationJob, status: "SUCCEEDED" };
  assert.equal(shouldPollOrdersReconciliationJob(succeededJob), false);
  assert.equal(isOrdersReconciliationTerminalSuccess(succeededJob), true);
  assert.equal(getOrdersReconciliationStatusMessage(succeededJob), "Reconciliation complete: 8 updated");

  const failedJob = {
    jobId: "job-1",
    lastError: { message: "safe delivery API error" },
    status: "DEAD_LETTER",
  };
  assert.equal(shouldPollOrdersReconciliationJob(failedJob), false);
  assert.equal(isOrdersReconciliationTerminalFailure(failedJob), true);
  assert.equal(getOrdersReconciliationStatusMessage(failedJob), "Reconciliation failed: safe delivery API error");
});

test("Orders loader can isolate CLEVER delivery orders for synthetic dev data", () => {
  assert.match(
    ordersPageSource,
    /process\.env\.CLEVER_ORDERS_SOURCE_MODE\s*!==\s*"delivery_only"/,
  );
  assert.match(
    ordersPageSource,
    /function shouldUseCanonicalFirstOrders\(\) \{[\s\S]*CLEVER_ORDERS_CANONICAL_FIRST/,
  );
  assert.match(
    ordersPageSource,
    /const shouldLoadShopifyMetadata =\s*shouldLoadOrders && shouldFetchShopifyOrders\(\)/,
  );
  assert.match(
    ordersPageSource,
    /const shouldLoadShopifyOrders =\s*shouldLoadShopifyMetadata && !canonicalFirst/,
  );
  assert.match(ordersPageSource, /canonicalFirst\s*\?\s*serverOrderRows\s*:\s*mergeShopifyOrderRowsWithCanonicalRows/);
});

test("Order page keeps the current rows when a failed pagination response is empty", () => {
  assert.equal(
    shouldIgnoreTransientEmptyOrdersPageResponse({
      errors: [{ message: "Orders pagination requires a complete visible-order sequence backfill" }],
      rows: [],
      result: { count: 603 },
    }),
    true,
  );
  assert.equal(
    shouldIgnoreTransientEmptyOrdersPageResponse({
      errors: [{ message: "temporary delivery API failure" }],
      rows: [],
      result: { count: null },
    }),
    true,
  );
  assert.equal(
    shouldIgnoreTransientEmptyOrdersPageResponse({
      errors: [],
      rows: [],
      result: { count: 0 },
    }),
    false,
  );
  assert.equal(
    shouldIgnoreTransientEmptyOrdersPageResponse({
      errors: [{ message: "temporary failure" }],
      rows: [{ id: "order-1" }],
      result: { count: 603 },
    }),
    false,
  );
});

test("Orders canonical-first first load skips Shopify full order fetch and disables mount sync by default", () => {
  assert.match(ordersPageSource, /CLEVER_ORDERS_CANONICAL_FIRST/);
  assert.match(ordersPageSource, /CLEVER_ORDERS_AUTO_SYNC_ON_LOAD/);
  assert.match(ordersPageSource, /featureFlags: \{[\s\S]*autoSyncOrdersOnLoad,[\s\S]*canonicalFirst/);
  assert.match(ordersPageSource, /if \(!autoSyncOrdersOnLoad\) return;[\s\S]*formData\.set\("_intent", "syncOrders"\)/);
  assert.doesNotMatch(ordersPageSource, /CLEVER_ORDERS_CANONICAL_FIRST[\s\S]{0,240}fetchShopifyOrders\(admin/);
});

test("Orders canonical-first preserves lightweight Shopify metadata reads when Shopify reads are enabled", () => {
  assert.match(
    ordersPageSource,
    /const shouldLoadShopifyMetadata =\s*shouldLoadOrders && shouldFetchShopifyOrders\(\)/,
  );
  assert.match(
    ordersPageSource,
    /const shouldLoadShopifyOrders =\s*shouldLoadShopifyMetadata && !canonicalFirst/,
  );
  assert.match(
    ordersPageSource,
    /const orderDataPromise = shouldLoadShopifyOrders[\s\S]*fetchShopifyOrders\(admin,\s*\{/,
  );
  assert.match(
    ordersPageSource,
    /const departureLocationDataPromise = shouldLoadOrders\s*\?\s*\(shouldLoadShopifyMetadata[\s\S]*fetchShopifyDepartureLocation\(admin,\s*\{\s*cacheKey: shopifyShopCacheKey\s*\}\)/,
  );
  assert.match(
    ordersPageSource,
    /const shopTimeZoneDataPromise = shouldLoadOrders\s*\?\s*\(shouldLoadShopifyMetadata[\s\S]*fetchShopifyShopTimeZone\(admin,\s*\{\s*cacheKey: shopifyShopCacheKey\s*\}\)/,
  );
  assert.doesNotMatch(
    ordersPageSource,
    /shouldLoadShopifyOrders[\s\S]{0,120}fetchShopifyDepartureLocation\(admin/,
  );
  assert.doesNotMatch(
    ordersPageSource,
    /shouldLoadShopifyOrders[\s\S]{0,120}fetchShopifyShopTimeZone\(admin/,
  );
});

test("Orders map defers MapLibre initialization until after initial navigation paint", () => {
  assert.match(ordersPageSource, /function scheduleIdleTask\(callback\) \{/);
  assert.match(ordersPageSource, /window\.requestIdleCallback/);
  assert.match(ordersPageSource, /window\.cancelIdleCallback/);
  assert.match(ordersPageSource, /const cancelMapInitialization = scheduleIdleTask\(initializeMap\)/);
  assert.match(ordersPageSource, /cancelMapInitialization\(\)/);
  assert.match(ordersPageSource, /try \{\s*const mapLibreImportStartedAt = performance\.now\(\)/);
  assert.match(ordersPageSource, /catch \{\s*if \(!isMounted\) return;\s*scheduleMapRecovery\(\);/);
});

test("Orders map assets use stable local URLs to avoid dev console load warnings", () => {
  assert.doesNotMatch(
    ordersPageSource,
    /maplibre-gl\/dist\/maplibre-gl\.css\?url/,
  );
  assert.match(
    rootDocumentSource,
    /export const links = \(\) => \[[\s\S]*\{ rel: "stylesheet", href: "\/vendor\/maplibre-gl\.css" \}/,
  );
  assert.doesNotMatch(ordersPageSource, /export const links = \(\)/);
  assert.match(
    ordersPageSource,
    /const OPENFREEMAP_STYLE_URL = "\/vendor\/openfreemap-clever-lite\.json"/,
  );
  assert.equal(
    existsSync(join(root, "public/vendor/maplibre-gl.css")),
    true,
  );
  assert.equal(
    existsSync(cleverLiteStylePath),
    true,
  );
});

test("CLEVER lite map style keeps lightweight buildings without POI-heavy layers", () => {
  const expectedLayerIds = [
    "background",
    "natural_earth",
    "park",
    "park_outline",
    "waterway_river",
    "waterway_other",
    "water",
    "building",
    "road_link",
    "road_minor",
    "road_secondary_tertiary",
    "road_trunk_primary",
    "road_motorway",
    "bridge_link",
    "bridge_street",
    "bridge_secondary_tertiary",
    "bridge_trunk_primary",
    "bridge_motorway",
    "highway-name-path",
    "highway-name-minor",
    "highway-name-major",
    "label_town",
    "label_city",
    "label_city_capital",
  ];
  const layerIds = cleverLiteStyle?.layers?.map((layer) => layer.id) ?? [];
  const buildingLayer = cleverLiteStyle?.layers?.find((layer) => layer.id === "building");

  assert.deepEqual(layerIds, expectedLayerIds);
  assert.equal(cleverLiteStyle?.sources?.openmaptiles?.url, "https://tiles.openfreemap.org/planet");
  assert.equal(
    cleverLiteStyle?.sources?.overture_buildings?.url,
    "pmtiles://https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/2026-01-21/buildings.pmtiles",
  );
  assert.equal(cleverLiteStyle?.layers?.filter((layer) => layer.type === "symbol").length, 6);
  assert.equal(buildingLayer?.type, "fill");
  assert.equal(buildingLayer?.source, "overture_buildings");
  assert.equal(buildingLayer?.["source-layer"], "building");
  assert.equal(buildingLayer?.minzoom, 10);
  assert.equal(buildingLayer?.maxzoom, undefined);
  assert.equal(buildingLayer?.paint?.["fill-opacity"], 0.44);
  assert.equal(layerIds.includes("building-3d"), false);
  assert.equal(cleverLiteStyle?.layers?.some((layer) =>
    /poi|aeroway|rail|transit|shield|one_way|label_country|label_state|label_village|label_other|landuse|landcover/i.test(layer.id),
  ), false);
});

test("PMTiles protocol is installed once before building overlay styles load", () => {
  assert.match(pmtilesProtocolSource, /const PMTILES_PROTOCOL_NAME = "pmtiles"/);
  assert.match(pmtilesProtocolSource, /const PMTILES_PROTOCOL_KEY = "__cleverPmtilesProtocolInstalled"/);
  assert.match(pmtilesProtocolSource, /new Protocol\(\{ metadata: true \}\)/);
  assert.match(pmtilesProtocolSource, /maplibregl\.addProtocol\(PMTILES_PROTOCOL_NAME, protocol\.tile\)/);
  assert.match(pmtilesProtocolSource, /window\[PMTILES_PROTOCOL_KEY\]/);
});

test("CLEVER lite map style mutes bright yellow road colors", () => {
  const roadColors = new Map(
    cleverLiteStyle?.layers
      ?.filter((layer) => /^(road|bridge)_/.test(layer.id))
      .map((layer) => [layer.id, layer.paint?.["line-color"]]) ?? [],
  );
  const styleJson = JSON.stringify(cleverLiteStyle);

  assert.equal(roadColors.get("road_link"), "#ead9bd");
  assert.equal(roadColors.get("road_secondary_tertiary"), "#ead9bd");
  assert.equal(roadColors.get("road_trunk_primary"), "#e6cda7");
  assert.equal(roadColors.get("bridge_link"), "#ead9bd");
  assert.equal(roadColors.get("bridge_secondary_tertiary"), "#ead9bd");
  assert.equal(roadColors.get("bridge_trunk_primary"), "#e6cda7");
  assert.equal(roadColors.get("bridge_motorway"), "#e2b282");
  assert.deepEqual(roadColors.get("road_motorway"), [
    "interpolate",
    ["linear"],
    ["zoom"],
    5,
    "hsl(26,45%,58%)",
    6,
    "#e2b282",
  ]);
  assert.equal(styleJson.includes("#fea"), false);
  assert.equal(styleJson.includes("#fc8"), false);
  assert.equal(styleJson.includes("hsl(26,87%,62%)"), false);
});

test("Orders OpenFreeMap style guards nullable building heights", () => {
  const buildingLayer = openFreeMapStyle.layers.find(
    (layer) => layer.id === "building-3d",
  );

  assert.deepEqual(buildingLayer?.paint?.["fill-extrusion-base"], [
    "to-number",
    ["get", "render_min_height"],
    0,
  ]);
  assert.deepEqual(buildingLayer?.paint?.["fill-extrusion-height"], [
    "to-number",
    ["get", "render_height"],
    0,
  ]);
});

test("Orders OpenFreeMap style guards nullable numeric filter fields", () => {
  const nullableNumericFields = new Set([
    "admin_level",
    "capital",
    "disputed",
    "maritime",
    "oneway",
    "ramp",
    "rank",
    "ref_length",
  ]);
  const comparisonOperators = new Set([">", ">=", "<", "<=", "==", "!="]);
  const unsafeFilters = [];

  function collectUnsafeFilterExpressions(expression, layerId) {
    if (!Array.isArray(expression)) return;

    if (
      comparisonOperators.has(expression[0]) &&
      expression
        .slice(1, 3)
        .some(
          (value) =>
            Array.isArray(value) &&
            value[0] === "get" &&
            nullableNumericFields.has(value[1]),
        )
    ) {
      unsafeFilters.push({ layerId, expression });
    }

    for (const childExpression of expression) {
      collectUnsafeFilterExpressions(childExpression, layerId);
    }
  }

  for (const layer of openFreeMapStyle.layers) {
    collectUnsafeFilterExpressions(layer.filter, layer.id);
  }

  assert.deepEqual(unsafeFilters, []);
});

test("Orders map stays visible when Shopify has no orders with coordinates", () => {
  assert.doesNotMatch(ordersPageSource, /primary=\{\s*locatedOrders\.length > 0 \?/s);
  assert.doesNotMatch(ordersPageSource, /locatedOrders\.length === 0/);
  assert.match(ordersPageSource, /departureLocation\?\.hasCoordinates \? departureLocation\.coordinates : DEFAULT_CENTER/);
  assert.match(ordersPageSource, /function buildOrdersMapFeatureCollection\(orders, plannedOrderIds, focusedOrderId = null\) \{/);
  assert.match(ordersPageSource, /plannedIndexByOrderId\.has\(order\.id\) \|\| order\.id === focusedOrderId/);
  assert.match(ordersPageSource, /syncOrdersMapMarkerLayer\(map, locatedOrders, plannedOrderIds, activeOrderPopupId\)/);
});

test("Orders table container uses viewport height and scrolls internally", () => {
  assert.match(ordersPageSource, /height:\s*"calc\(100vh - 150px\)"/);
  assert.match(ordersPageSource, /minHeight:\s*"320px"/);
  assert.match(ordersPageSource, /overflowY:\s*"auto"/);
  assert.match(ordersPageSource, /paddingRight:\s*"10px"/);
  assert.match(ordersPageSource, /paddingBottom:\s*"10px"/);
  assert.match(ordersPageSource, /scrollbarGutter:\s*"stable"/);
});

test("Orders table keeps the title row sticky outside Shopify table internals", () => {
  assert.match(ordersPageSource, /const tableHeaderCellStyle = \{/);
  assert.match(ordersPageSource, /const checkboxHeaderCellStyle = \{/);
  assert.match(ordersPageSource, /textOverflow:\s*"clip"/);
  assert.match(ordersPageSource, /position:\s*"sticky"/);
  assert.match(ordersPageSource, /top:\s*0/);
  assert.match(ordersPageSource, /<table/);
  assert.match(ordersPageSource, /<thead>/);
  assert.match(ordersPageSource, /style=\{resizableHeaderCellStyle\}/);
  assert.doesNotMatch(ordersPageSource, /<s-table/);
  assert.doesNotMatch(ordersPageSource, /s-table-header-row/);
});

test("Orders filter and plan controls sit outside the table scroll area", () => {
  const orderControlsStyleBlock =
    ordersPageSource.match(/const orderControlsStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";

  assert.match(ordersPageSource, /const orderTableLayoutStyle = \{/);
  assert.match(orderControlsStyleBlock, /const orderControlsStyle = \{/);
  assert.match(ordersPageSource, /const orderPageNoticeStyle = \{/);
  assert.doesNotMatch(ordersPageSource, /const orderFilterBarStyle = \{/);
  assert.doesNotMatch(ordersPageSource, /const planActionRowStyle = \{/);
  assert.match(orderControlsStyleBlock, /padding:\s*"6px 10px 8px"/);
  assert.match(orderControlsStyleBlock, /flexWrap:\s*"nowrap"/);
  assert.match(orderControlsStyleBlock, /overflowX:\s*"auto"/);
  assert.doesNotMatch(orderControlsStyleBlock, /maxWidth:\s*"100%"/);
  assert.doesNotMatch(orderControlsStyleBlock, /overflowX:\s*"visible"/);
  assert.doesNotMatch(orderControlsStyleBlock, /overflowY:\s*"visible"/);
  assert.match(ordersPageSource, /className="orders-error-filter" role="alert" style=\{orderPageNoticeStyle\}/);
  assert.doesNotMatch(ordersPageSource, /<s-banner tone="critical">/);
  assert.match(ordersPageSource, /<div style=\{orderControlsStyle\}>/);
  assert.match(ordersPageSource, /getServiceErrorNotice\(\[/);
  assert.match(ordersPageSource, /collectServiceErrors\(\s*\[preferencesData, orderData, departureLocationData, serverOrderData, inventoryData, routeGroupData\]/);
  assert.doesNotMatch(ordersPageSource, /style=\{orderFilterBarStyle\}/);
  assert.doesNotMatch(ordersPageSource, /style=\{planActionRowStyle\}/);
  assert.match(ordersPageSource, /<div style=\{tableWrapStyle\}>\s*<table/s);
});

test("Orders table uses a compact centered layout", () => {
  assert.match(ordersPageSource, /width:\s*"100%"/);
  assert.match(ordersPageSource, /minWidth:\s*"1520px"/);
  assert.match(ordersPageSource, /tableLayout:\s*"fixed"/);
  assert.match(ordersPageSource, /const tableCellStyle = \{/);
  assert.match(ordersPageSource, /padding:\s*"6px 8px"/);
  assert.match(ordersPageSource, /textAlign:\s*"center"/);
  assert.match(ordersPageSource, /whiteSpace:\s*"nowrap"/);
  assert.match(ordersPageSource, /overflow:\s*"hidden"/);
  assert.match(ordersPageSource, /textOverflow:\s*"ellipsis"/);
  assert.doesNotMatch(ordersPageSource, /wordBreak:\s*"break-word"/);
});

test("Orders table has a compact checkbox column for route-plan candidates", () => {
  assert.match(ordersPageSource, /const \[selectedOrderRows, setSelectedOrderRows\] = useState\(\[\]\)/);
  assert.match(ordersPageSource, /const checkedOrderIds = useMemo\(/);
  assert.match(ordersPageSource, /const \[plannedOrderIds, setPlannedOrderIds\] = useState\(\[\]\)/);
  assert.match(ordersPageSource, /const ORDER_TABLE_COLUMN_WIDTHS = \{/);
  assert.match(ordersPageSource, /select: "2\.5%"/);
  assert.match(ordersPageSource, /name: "64px"/);
  assert.match(ordersPageSource, /notes: "44px"/);
  assert.match(ordersPageSource, /address: "calc\(37% - 88px\)"/);
  assert.match(ordersPageSource, /const DEFAULT_TABLE_COLUMN_WIDTHS = \[\s*ORDER_TABLE_COLUMN_WIDTHS\.select,[\s\S]*?SORTABLE_ORDER_COLUMNS\.flatMap/);
  assert.match(ordersPageSource, /aria-label="Select all visible orders for plan"/);
  assert.match(ordersPageSource, /const orderIsPlanned = plannedOrderIdSet\.has\(order\.id\)/);
  assert.match(ordersPageSource, /const checkboxChecked = snapshotSelectionActive/);
  assert.match(ordersPageSource, /!selectionExcludedOrderIdSet\.has\(order\.orderId\)/);
  assert.match(ordersPageSource, /`Select \${order\.name} for plan`/);
  assert.match(ordersPageSource, /checked=\{checkboxChecked\}/);
  assert.match(ordersPageSource, /snapshotSelectionUpdating/);
  assert.match(
    ordersPageSource,
    /onChange=\{\(event\) => toggleOrderCheck\(order, event\.currentTarget\.checked\)\}/,
  );
  assert.doesNotMatch(ordersPageSource, /Shift range|orderSelectionAnchorRef|handleOrderRowShiftSelect/);
  assert.doesNotMatch(ordersPageSource, /routePlanningUnavailable/);
});

test("Orders column uses the order number itself as a neutral transparent button area", () => {
  assert.match(ordersPageSource, /const orderNumberButtonStyle = \{/);
  assert.match(ordersPageSource, /width:\s*"100%"/);
  assert.match(ordersPageSource, /padding:\s*0/);
  assert.match(ordersPageSource, /justifyContent:\s*"center"/);
  assert.match(ordersPageSource, /className="order-number-button"/);
  assert.match(ordersPageSource, /aria-label=\{`View \${order\.name}`\}/);
  assert.match(ordersPageSource, /style=\{orderNumberButtonStyle\}/);
  assert.match(ordersPageSource, /onClick=\{\(\) => handleSelectOrder\(order\.id\)\}/);
  assert.match(ordersPageSource, /\{order\.name\}/);
  assert.doesNotMatch(ordersPageSource, /#005bd3/);
  assert.doesNotMatch(ordersPageSource, />View<\/button>/);
});

test("Orders order-number button shows a subtle rounded hover state", () => {
  assert.match(globalCssSource, /\.order-number-button\s*\{/);
  assert.match(globalCssSource, /background-color:\s*transparent/);
  assert.match(globalCssSource, /border-radius:\s*8px/);
  assert.match(globalCssSource, /transition:\s*background-color 120ms ease/);
  assert.match(globalCssSource, /\.order-number-button:hover\s*\{/);
  assert.match(globalCssSource, /background-color:\s*rgba\(0, 0, 0, 0\.06\)/);
});

test("Orders ID stays centered while Note uses a separate headerless column", () => {
  assert.match(ordersPageSource, /\{ key: "name", label: "ID" \}/);
  assert.match(ordersPageSource, /const noteCellStyle = \{[\s\S]*?textAlign:\s*"center"/);
  assert.match(ordersPageSource, /const orderSignalSlotsStyle = \{[\s\S]*?gridTemplateColumns:\s*"18px 18px"[\s\S]*?width:\s*"100%"/);
  assert.match(ordersPageSource, /const orderSignalSlotStyle = \{[\s\S]*?height:\s*"18px"[\s\S]*?width:\s*"18px"/);
  assert.doesNotMatch(ordersPageSource, /const subscriptionSignalIconStyle = \{/);
  assert.match(ordersPageSource, /column\.key !== "name" && columnIndex < SORTABLE_ORDER_COLUMNS\.length - 1/);
  assert.match(ordersPageSource, /const addressCellStyle = \{[\s\S]*?textAlign:\s*"left"/);
  assert.match(ordersPageSource, /<th key="notes" scope="col" aria-label="Notes" style=\{checkboxHeaderCellStyle\} \/>/);
  assert.match(ordersPageSource, /<td style=\{tableCellStyle\}>[\s\S]*?className="order-number-button"[\s\S]*?<\/td>\s*<td style=\{noteCellStyle\}>[\s\S]*?<span style=\{orderSignalSlotsStyle\}>[\s\S]*?<span style=\{orderSignalSlotStyle\}>[\s\S]*?data-order-notes-popover-root="true"/);
  assert.match(ordersPageSource, /<\/span>\s*<span style=\{orderSignalSlotStyle\}>[\s\S]*?\{subscriptionSignalLabel \? \(/);
  assert.doesNotMatch(ordersPageSource, /const orderIdentityStyle = \{/);
  assert.match(ordersPageSource, /<td style=\{addressCellStyle\}>\{order\.address\}<\/td>/);
  assert.match(ordersPageSource, /overflowX:\s*"auto"/);
  assert.match(ordersPageSource, /const \[hoveredNoteOrderId, setHoveredNoteOrderId\] = useState\(null\)/);
  assert.match(ordersPageSource, /const \[pinnedNoteOrderId, setPinnedNoteOrderId\] = useState\(null\)/);
  assert.match(ordersPageSource, /const visibleNoteOrderId = pinnedNoteOrderId \?\? hoveredNoteOrderId/);
  assert.match(ordersPageSource, /const orderNote = getOrderNote\(order\)/);
  assert.match(ordersPageSource, /const customerNote = getCustomerNote\(order\)/);
  assert.match(ordersPageSource, /\{orderNote \|\| customerNote \? \(/);
  assert.match(ordersPageSource, /onMouseEnter=\{\(event\) => openNotePopover\(event, order\.id\)\}/);
  assert.match(ordersPageSource, /onMouseLeave=\{\(\) => closeHoveredNotePopover\(order\.id\)\}/);
  assert.match(ordersPageSource, /onClick=\{\(event\) => togglePinnedNotePopover\(event, order\.id\)\}/);
  assert.match(ordersPageSource, /function getRightPopoverPosition\(rect, popoverSize = \{\}\) \{/);
  assert.match(ordersPageSource, /const rightLeft = rect\.right \+ window\.scrollX \+ gap/);
  assert.match(ordersPageSource, /createPortal\([\s\S]*?ref=\{notePopoverRef\}[\s\S]*?notePopoverPosition\.left/);
  assert.match(ordersPageSource, /data-order-notes-popover-root="true"/);
  assert.match(ordersPageSource, /<s-icon type="note"/);
  assert.match(ordersPageSource, /getAppstleSubscriptionOrderKind\(order\)/);
  assert.match(ordersPageSource, /<s-icon[\s\S]*?type="order-repeat"[\s\S]*?tone="info"[\s\S]*?interestFor=\{subscriptionTooltipId\}/);
  assert.match(ordersPageSource, /<s-tooltip id=\{subscriptionTooltipId\}>[\s\S]*?\{subscriptionSignalLabel\}[\s\S]*?<\/s-tooltip>/);
  assert.match(ordersPageSource, /Recurring subscription order/);
  assert.match(ordersPageSource, />Notes</);
  assert.match(ordersPageSource, />Order Note</);
  assert.match(ordersPageSource, />Customer Note</);
  assert.match(ordersPageSource, /const noteCardStyle = \{/);
  assert.match(ordersPageSource, /const noteStackStyle = \{/);
  assert.match(ordersPageSource, /const noteLabelStyle = \{/);
  assert.match(ordersPageSource, /const noteTextStyle = \{/);
  assert.match(ordersPageSource, /\{orderNote \? \([\s\S]*?<div style=\{noteLabelStyle\}>Order Note<\/div>[\s\S]*?<div style=\{noteTextStyle\}>\{orderNote\}<\/div>/);
  assert.match(ordersPageSource, /\{customerNote \? \([\s\S]*?<div style=\{noteLabelStyle\}>Customer Note<\/div>[\s\S]*?<div style=\{noteTextStyle\}>\{customerNote\}<\/div>/);
  assert.doesNotMatch(ordersPageSource, /const noteListStyle = \{/);
  assert.doesNotMatch(ordersPageSource, /<ul style=\{noteListStyle\}>/);
});

test("Ordered pill exposes order timing and delivery-cycle sequence on hover", () => {
  assert.match(ordersPageSource, /deliveryCycle: preferencesData\.appPreferences\.deliveryCycle \?\? null/);
  assert.match(ordersPageSource, /export function buildOrderTimelineDetails\(\{ deliveryCycle, order, shopTimeZone \}\) \{/);
  assert.match(ordersPageSource, /formatTimelineDetail\(\s*"Ordered"/);
  assert.match(ordersPageSource, /formatTimelineDetail\(\s*"Processed"/);
  assert.match(ordersPageSource, /formatTimelineDetail\(\s*"Updated"/);
  assert.match(ordersPageSource, /formatTimelineDetail\("Cutoff"/);
  assert.match(ordersPageSource, /formatTimelineDetail\("Delivery"/);
  assert.match(ordersPageSource, /formatTimelineDetail\("Stop"/);
  assert.match(ordersPageSource, /formatTimelineDetail\("Time zone"/);
  assert.match(ordersPageSource, /const orderedPillDetails = buildOrderTimelineDetails\(\{ deliveryCycle, order, shopTimeZone \}\)/);
  assert.match(ordersPageSource, /children: formatDeliveryValue\(order\.orderedDate\),[\s\S]*?details: orderedPillDetails,[\s\S]*?interactive: true,[\s\S]*?label: "Ordered timeline"/);
});

test("Area pill distinguishes delivery attention, valid delivery, and pickup rows", () => {
  assert.match(infoPillSource, /const INFO_PILL_TONES = new Set\(\["neutral", "info", "success", "warning", "critical", "pickup"\]\)/);
  assert.match(globalCssSource, /\.info-pill--pickup \{[\s\S]*?background: rgba\(0, 91, 211, 0\.12\);[\s\S]*?color: #005bd3/);
  assert.match(ordersPageSource, /function formatAreaValue\(order\) \{\s*if \(order\?\.serviceType === "PICKUP"\) return "Pickup";\s*return textOrUndefined\(order\?\.deliveryArea\) \?\? "Null";\s*\}/);
  assert.match(ordersPageSource, /function getOrderAreaPillTone\(order\) \{\s*if \(order\?\.serviceType === "PICKUP"\) return "pickup";\s*if \(textOrUndefined\(order\?\.deliveryArea\)\) return "neutral";\s*return "warning";\s*\}/);
  assert.match(ordersPageSource, /function getOrderAreaPillDetails\(order\) \{\s*const tone = getOrderAreaPillTone\(order\);\s*if \(!isAttentionPillTone\(tone\)\) return \[\];/);
  assert.match(ordersPageSource, /const areaPillTone = getOrderAreaPillTone\(order\);[\s\S]*?const areaPill = renderDetailPill\(\{[\s\S]*?children: formatAreaValue\(order\),[\s\S]*?details: areaPillDetails,[\s\S]*?tone: areaPillTone/);
  assert.match(ordersPageSource, /isAttentionPillTone\(areaPillTone\) \? \(\s*<button[\s\S]*?aria-label=\{`Edit delivery area for \$\{order\.name\}`\}[\s\S]*?\{areaPill\}[\s\S]*?<\/button>\s*\) : areaPill/);
});

test("Area data issues exclude pickup and include missing delivery areas", () => {
  assert.match(ordersPageSource, /function getOrderAreaPillTone\(order\) \{\s*if \(order\?\.serviceType === "PICKUP"\) return "pickup";\s*if \(textOrUndefined\(order\?\.deliveryArea\)\) return "neutral";\s*return "warning";\s*\}/);
  assert.match(ordersPageSource, /function isAttentionPillTone\(tone\) \{\s*return tone === "warning" \|\| tone === "critical";\s*\}/);
  assert.match(ordersPageSource, /if \(isAttentionPillTone\(getOrderAreaPillTone\(order\)\)\) reasons\.push\("Area"\)/);
});

test("Order popovers use border-box sizing for idempotent scroll repositioning", () => {
  assert.match(ordersPageSource, /const itemPopoverStyle = \{\s*[\s\S]*?boxSizing:\s*"border-box"/);
  assert.match(ordersPageSource, /height: popoverNode\?\.offsetHeight,\s*[\s\S]*?width: popoverNode\?\.offsetWidth/);
  assert.match(ordersPageSource, /width: `\$\{Math\.round\(activeDetailPopover\.position\.width\)\}px`/);
});

test("Order items popover wraps long rows without changing note or ordered popovers", () => {
  const itemPopoverTableStyleSource = ordersPageSource.match(
    /const itemPopoverTableStyle = \{[\s\S]*?\n\};/,
  )?.[0] ?? "";
  const itemPopoverTableSource = ordersPageSource.match(
    /<table style=\{itemPopoverTableStyle\}>[\s\S]*?<\/table>/,
  )?.[0] ?? "";

  assert.match(ordersPageSource, /const orderedItemsPopoverStyle = \{\s*[\s\S]*?\.\.\.itemPopoverStyle[\s\S]*?width:\s*"clamp\(360px, 60vw, 640px\)"[\s\S]*?maxWidth:\s*"calc\(100vw - 16px\)"[\s\S]*?minWidth:\s*0[\s\S]*?maxHeight:\s*"calc\(100vh - 16px\)"[\s\S]*?overflowY:\s*"auto"[\s\S]*?overscrollBehavior:\s*"contain"/);
  assert.match(itemPopoverTableStyleSource, /width:\s*"100%"/);
  assert.doesNotMatch(itemPopoverTableStyleSource, /tableLayout:\s*"fixed"/);
  assert.match(ordersPageSource, /const itemPopoverCellStyle = \{\s*[\s\S]*?overflowWrap:\s*"anywhere"[\s\S]*?verticalAlign:\s*"top"[\s\S]*?whiteSpace:\s*"normal"/);
  assert.match(ordersPageSource, /const itemPopoverCompactCellStyle = \{\s*[\s\S]*?\.\.\.itemPopoverCellStyle[\s\S]*?whiteSpace:\s*"nowrap"[\s\S]*?width:\s*"1%"/);
  assert.match(ordersPageSource, /const itemPopoverQtyCellStyle = \{\s*[\s\S]*?\.\.\.itemPopoverCompactCellStyle[\s\S]*?textAlign:\s*"right"/);
  assert.doesNotMatch(itemPopoverTableSource, /<colgroup>/);
  assert.match(ordersPageSource, /<th style=\{itemPopoverCompactCellStyle\}>Options<\/th>[\s\S]*?<th style=\{itemPopoverCompactCellStyle\}>SKU<\/th>/);
  assert.match(ordersPageSource, /<td style=\{itemPopoverCompactCellStyle\}>\{item\.options\}<\/td>[\s\S]*?<td style=\{itemPopoverCompactCellStyle\}>\{item\.sku\}<\/td>/);
  assert.match(ordersPageSource, /style=\{\{\s*\.\.\.orderedItemsPopoverStyle,[\s\S]*?left: `\$\{Math\.round\(itemPopoverPosition\.left\)\}px`,[\s\S]*?top: `\$\{Math\.round\(itemPopoverPosition\.top\)\}px`,[\s\S]*?transform: "none",[\s\S]*?\}\}/);
  assert.doesNotMatch(ordersPageSource, /style=\{\{\s*\.\.\.orderedItemsPopoverStyle,[\s\S]*?width: `\$\{Math\.round\(itemPopoverPosition\.width\)\}px`/);
});

test("Order items popover stays hidden until its responsive size is measured", () => {
  assert.match(ordersPageSource, /setItemPopoverPosition\(\{\s*\.\.\.getOrderDetailPopoverPosition\([\s\S]*?measured:\s*false,?\s*\}\)/);
  assert.match(ordersPageSource, /setItemPopoverPosition\(\{\s*\.\.\.getOrderDetailPopoverPosition\([\s\S]*?measured:\s*true,?\s*\}\)/);
  assert.match(ordersPageSource, /visibility:\s*itemPopoverPosition\.measured \? "visible" : "hidden"/);
});

test("Ordered and other detail pill popovers stay hidden until measured", () => {
  assert.match(ordersPageSource, /setActiveOrderDetailPopover\(\{\s*\.\.\.detail,[\s\S]*?position:\s*\{\s*\.\.\.getOrderDetailPopoverPosition\([\s\S]*?measured:\s*false,?\s*\}/);
  assert.match(ordersPageSource, /setActiveOrderDetailPopover\(\(current\) => current \? \{[\s\S]*?position:\s*\{\s*\.\.\.position,[\s\S]*?measured:\s*true,?\s*\}/);
  assert.match(ordersPageSource, /visibility:\s*activeDetailPopover\.position\.measured \? "visible" : "hidden"/);
});

test("Order items popover keeps order total out of the fixed Qty column", () => {
  assert.doesNotMatch(ordersPageSource, /<td style=\{itemPopoverCellStyle\} colSpan=\{3\}>Order total<\/td>\s*<td style=\{itemPopoverQtyCellStyle\}>\{formatOrderTotal\(order\)\}<\/td>/);
  assert.match(ordersPageSource, /<\/table>\s*<div style=\{itemPopoverFooterStyle\}>\s*<span>Order total<\/span>\s*<span style=\{itemPopoverFooterValueStyle\}>\{formatOrderTotal\(order\)\}<\/span>\s*<\/div>/);
  assert.match(ordersPageSource, /const itemPopoverFooterStyle = \{\s*[\s\S]*?display:\s*"flex"[\s\S]*?justifyContent:\s*"space-between"[\s\S]*?width:\s*"100%"/);
  assert.match(ordersPageSource, /const itemPopoverFooterValueStyle = \{\s*[\s\S]*?minWidth:\s*0[\s\S]*?overflowWrap:\s*"anywhere"[\s\S]*?textAlign:\s*"right"[\s\S]*?whiteSpace:\s*"normal"/);
});

test("Ordered timeline formats Shopify and delivery-cycle timestamps in shop time", () => {
  const timelineDetails = buildOrderTimelineDetails({
    deliveryCycle: {
      cutoffTime: "12:00",
      cutoffWeekday: "TUESDAY",
      timeZone: "America/Toronto",
    },
    order: {
      deliveryDate: "2026-07-16",
      deliveryDay: "THURSDAY",
      deliveryLabel: "Thu 07/16",
      deliverySession: "DAY",
      orderCreatedAt: "2026-07-14T16:05:00.000Z",
      orderedDate: "2026-07-14",
      processedAt: "2026-07-14T16:10:00.000Z",
      routeSequence: 4,
      timeWindowEnd: "14:00",
      timeWindowStart: "12:00",
      updatedAt: "2026-07-14T16:30:00.000Z",
    },
    shopTimeZone: "America/Toronto",
  });

  assert.deepEqual(timelineDetails, [
    "Ordered: 2026-07-14, 12:05",
    "Processed: 12:10",
    "Updated: 12:30",
    "Cutoff: Tue, 12:00",
    "Delivery: Thu, 2026-07-16, 12:00–14:00 (Day)",
    "Stop: 4",
    "Time zone: America/Toronto",
  ]);
  assert.equal(timelineDetails.some((detail) => detail.includes(" · ")), false);

  assert.deepEqual(
    buildOrderTimelineDetails({
      order: {
        orderedDate: "2026-07-14",
      },
    }),
    ["Ordered: 2026-07-14"],
  );

  assert.deepEqual(
    buildOrderTimelineDetails({
      order: {
        orderCreatedAt: "2026-07-14T16:05:00.000Z",
        orderedDate: "2026-07-14",
        processedAt: "2026-07-14T16:10:00.000Z",
        updatedAt: "2026-07-14T16:10:00.000Z",
      },
      shopTimeZone: "America/Toronto",
    }),
    [
      "Ordered: 2026-07-14, 12:05",
      "Processed: 12:10",
      "Time zone: America/Toronto",
    ],
  );

  assert.deepEqual(
    buildOrderTimelineDetails({
      order: {
        orderCreatedAt: "2026-07-14T16:05:00.000Z",
        orderedDate: "2026-07-14",
        processedAt: "2026-07-15T16:10:00.000Z",
        updatedAt: "2026-07-15T16:30:00.000Z",
      },
      shopTimeZone: "America/Toronto",
    }),
    [
      "Ordered: 2026-07-14, 12:05",
      "Processed: 2026-07-15, 12:10",
      "Updated: 2026-07-15, 12:30",
      "Time zone: America/Toronto",
    ],
  );
});


test("Orders page creates a childless route group from scoped planned orders", () => {
  assert.match(ordersPageSource, /import \{ useAppBridge \} from "@shopify\/app-bridge-react"/);
  assert.match(ordersPageSource, /import \{ Await, useFetcher, useLoaderData, useNavigate, useNavigation, useRevalidator, useSearchParams \} from "react-router"/);
  assert.match(ordersPageSource, /import \{[\s\S]*buildCreateRoutePlanPayload[\s\S]*\} from "(?:\.\.\/features\/delivery|\.\.\/delivery)\/route-plans\.server"/);
  assert.match(ordersPageSource, /import \{[\s\S]*createDeliveryRouteGroup[\s\S]*\} from "(?:\.\.\/features\/delivery|\.\.\/delivery)\/route-groups\.server"/);
  assert.doesNotMatch(ordersPageSource, /generateDeliveryRouteGroupChildRoutes/);
  assert.match(ordersPageSource, /import \{ buildRouteScopeFromOrders \} from "(?:\.\.\/features\/delivery|\.\.\/delivery)\/route-scope"/);
  assert.match(ordersPageSource, /export const action = async \(\{ request \}\) => \{/);
  assert.match(ordersPageSource, /const formData = await request\.formData\(\)/);
  assert.match(ordersPageSource, /JSON\.parse\(formData\.get\("plannedOrderIds"\) \?\? "\[\]"\)/);
  assert.match(ordersPageSource, /JSON\.parse\(formData\.get\("routeScope"\) \?\? "null"\)/);
  assert.match(ordersPageSource, /const routeName = textOrUndefined\(formData\.get\("routeName"\)\)/);
  assert.match(ordersPageSource, /const shopifySessionToken = formData\.get\("shopifySessionToken"\)/);
  assert.match(ordersPageSource, /route_create_preflight/);
  assert.match(ordersPageSource, /buildCreateRoutePlanPayload\(\{/);
  assert.match(ordersPageSource, /routeName,/);
  assert.match(ordersPageSource, /routeScope,/);
  assert.match(ordersPageSource, /createDeliveryRouteGroup\(\s*request,\s*buildCreateRouteGroupPayload\(\{/s);
  assert.match(ordersPageSource, /const routePlan = getFirstRouteGroupRoutePlan\(routeGroup\)/);
  assert.match(ordersPageSource, /return \{ routePlan, routeGroup, errors: \[\] \}/);
  assert.match(ordersPageSource, /const routePlanFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /const shopify = useAppBridge\(\)/);
  assert.match(ordersPageSource, /const navigate = useNavigate\(\)/);
  assert.match(ordersPageSource, /const sessionToken = await shopify\.idToken\(\)/);
  assert.match(ordersPageSource, /const routeDraftScope = buildRouteScopeFromOrders\(plannedOrders\)/);
  assert.match(ordersPageSource, /formData\.set\("routeScope", JSON\.stringify\(routeDraftScope\)\)/);
  assert.match(ordersPageSource, /formData\.set\("routeName", routePlanTitle\.trim\(\) \|\| DEFAULT_ROUTE_PLAN_TITLE\)/);
  assert.match(ordersPageSource, /formData\.set\("orderScope", orderFilters\.scope\)/);
  assert.match(ordersPageSource, /formData\.set\("shopifySessionToken", sessionToken\)/);
  assert.match(ordersPageSource, /routePlanFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(ordersPageSource, /const createdRouteGroup = routePlanFetcher\.data\?\.routeGroup/);
  assert.match(ordersPageSource, /navigate\(destination\)/);
  assert.match(ordersPageSource, /navigate\(routePlanPath\(createdRoutePlan\.id\)\)/);
  assert.match(ordersPageSource, />Assign<\/button>/);
  assert.match(ordersPageSource, /const createRouteDisabled = plannedOrders\.length === 0 \|\| routePlanFetcher\.state !== "idle"/);
  assert.match(ordersPageSource, /disabled=\{createRouteDisabled\}/);
  assert.doesNotMatch(ordersPageSource, /createRouteDraftSearchParams/);
  assert.doesNotMatch(ordersPageSource, /return redirect/);
});


test("Orders page keeps the UI label as route creation while using route groups underneath", () => {
  assert.match(ordersPageSource, /createDeliveryRouteGroup/);
  assert.match(ordersPageSource, /buildCreateRouteGroupPayload/);
  assert.doesNotMatch(ordersPageSource, />Create group<\/button>/);
  assert.match(ordersPageSource, />Create route<\/button>/);
});

test("Orders page adds planned orders to the selected route child", () => {
  assert.match(ordersPageSource, /fetchDeliveryRouteGroups/);
  assert.match(ordersPageSource, /updateDeliveryRouteGroupOrders/);
  assert.match(ordersPageSource, /saveDeliveryRouteGroupDraft/);
  assert.match(ordersPageSource, /buildRouteGroupAddOrdersDraft/);
  assert.match(ordersPageSource, /targetRoutePlanId/);
  assert.match(ordersPageSource, /fetchDeliveryRouteGroupDetail/);
  assert.ok(
    ordersPageSource.indexOf("const targetExists = getVisibleRouteGroupChildren")
      < ordersPageSource.indexOf("const addResult = await updateDeliveryRouteGroupOrders"),
  );
  assert.match(ordersPageSource, /if \(intent === "addOrdersToRouteGroup"\) \{/);
  assert.match(ordersPageSource, /addOrderIds,/);
  assert.match(ordersPageSource, /expectedUpdatedAt/);
  assert.match(ordersPageSource, /if \(!draftPayload\) return \{/);
  assert.match(ordersPageSource, /formData\.set\("_intent", "addOrdersToRouteGroup"\)/);
  assert.match(ordersPageSource, /formData\.set\("routeGroupId", selectedRouteGroup\.id\)/);
  assert.match(ordersPageSource, /addToRoutePlanId && selectedRouteGroup\.id === addToRouteGroupId/);
  assert.match(ordersPageSource, /const handleOpenAddRoutePreview = \(\) => \{/);
  assert.match(ordersPageSource, /function buildRouteAddSnapshotOrders\(routeGroup, orders\)/);
  assert.match(ordersPageSource, /function RouteAddSnapshotMap\(\{ departureLocation, orders \}\)/);
  assert.match(ordersPageSource, /const routeAddSnapshotOrders = useMemo/);
  assert.match(ordersPageSource, /createMapLibreMap\(maplibregl, \{/);
  assert.match(ordersPageSource, /interactive:\s*false/);
  assert.match(ordersPageSource, /syncOrdersMapMarkerLayer\(snapshotMap, locatedOrders, locatedOrders\.map\(\(order\) => order\.id\)\)/);
  assert.doesNotMatch(ordersPageSource, /getRouteAddSnapshotPinPosition/);
  assert.match(ordersPageSource, /aria-label="Add orders to route preview"/);
  assert.match(ordersPageSource, /aria-label="Route to add orders"/);
  assert.match(ordersPageSource, /aria-label="Selected route snapshot"/);
  assert.match(ordersPageSource, /pointerEvents:\s*"none"/);
  assert.match(ordersPageSource, /Route snapshot/);
  assert.match(ordersPageSource, /Orders in group/);
  assert.match(ordersPageSource, /Target first route/);
  assert.match(ordersPageSource, /Existing route orders/);
  assert.match(ordersPageSource, /getRouteAddOptionLabel\(routeGroup\)/);
  assert.doesNotMatch(ordersPageSource, /disabled=\{true\}\s*>Add to route/);
});

test("Orders route-group payload sends delivery-api order UUIDs, not Shopify GIDs", () => {
  assert.match(ordersPageSource, /orderIds: plannedOrders\.map\(\(order\) => order\.orderId\)/);
  assert.doesNotMatch(ordersPageSource, /orderIds: plannedOrders\.map\(\(order\) => order\.id\)/);
  assert.match(ordersPageSource, /서버 주문 ID가 없는 주문이 있어 경로를 만들 수 없습니다/);
});

test("Orders action separates background order sync from route creation", () => {
  assert.match(ordersPageSource, /import \{[\s\S]*bulkUpdateDeliveryOrders[\s\S]*fetchDeliveryOrders[\s\S]*syncDeliveryOrders[\s\S]*\} from "(?:\.\.\/features\/delivery|\.\.\/delivery)\/orders\.server"/);
  assert.match(ordersPageSource, /import \{[\s\S]*getOrderSyncSnapshots[\s\S]*mapCanonicalOrdersToOrderRows[\s\S]*mergeShopifyOrderRowsWithCanonicalRows[\s\S]*\} from "(?:\.\.\/features\/orders|\.)\/canonical-orders"/);
  assert.match(ordersPageSource, /const intent = formData\.get\("_intent"\) \?\? "createRoutePlan"/);
  assert.match(ordersPageSource, /if \(intent === "syncOrders"\)/);
  assert.match(ordersPageSource, /JSON\.parse\(formData\.get\("orders"\) \?\? "\[\]"\)/);
  assert.match(ordersPageSource, /syncDeliveryOrders\(\s*request,/);
  assert.match(
    ordersPageSource,
    /syncDeliveryOrders\(\s*request,\s*\{[\s\S]*reason: "orders_page_open"[\s\S]*orders: orderSnapshots[\s\S]*\},\s*\{\s*cacheKey: shopifyShopCacheKey,\s*primeOrdersCache: true,\s*sessionToken: shopifySessionToken,?\s*\},?\s*\)/,
  );
  assert.match(ordersPageSource, /syncedOrders: syncedOrderData\.orders/);
});

test("Orders page bulk-changes selected server order state or payment", () => {
  assert.match(ordersPageSource, /const ORDER_BULK_ACTION_OPTIONS = \[/);
  assert.match(ordersPageSource, /\{ label: "State", value: "state" \}/);
  assert.match(ordersPageSource, /\{ label: "Payment", value: "payment" \}/);
  assert.match(ordersPageSource, /\{ label: "Fix data", value: ORDER_DATA_FIX_ACTION \}/);
  assert.match(ordersPageSource, /const ORDER_STATE_CHANGE_OPTIONS = \[/);
  assert.match(ordersPageSource, /\{ label: "Delivered", value: "DELIVERED" \}/);
  assert.match(ordersPageSource, /const ORDER_PAYMENT_CHANGE_OPTIONS = \[/);
  assert.match(ordersPageSource, /\{ label: "Awaiting payment", value: "PENDING" \}/);
  assert.doesNotMatch(ordersPageSource, /\{ label: "Cash", value: "CASH" \}/);
  assert.doesNotMatch(ordersPageSource, /\{ label: "eTransfer", value: "ETRANSFER" \}/);
  assert.match(ordersPageSource, /const orderBulkUpdateFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /if \(intent === "bulkUpdateOrders"\)/);
  assert.match(ordersPageSource, /bulkUpdateDeliveryOrders\(\s*request,\s*\{ field, orderIds, selectionToken, value \},\s*\{ sessionToken: shopifySessionToken \},?\s*\)/);
  assert.match(ordersPageSource, /const bulkUpdatedOrders = useMemo\(/);
  assert.match(ordersPageSource, /mergeShopifyOrderRowsWithCanonicalRows\(refreshMergedOrders, bulkUpdatedOrders\)/);
  assert.match(ordersPageSource, /const checkedServerOrderIds = useMemo\(/);
  assert.match(ordersPageSource, /checkedOrders\.map\(\(order\) => order\.orderId\)\.filter\(Boolean\)/);
  assert.match(ordersPageSource, /formData\.set\("_intent", "bulkUpdateOrders"\)/);
  assert.match(ordersPageSource, /formData\.set\("orderIds", JSON\.stringify\(checkedServerOrderIds\)\)/);
  assert.match(ordersPageSource, /orderBulkUpdateFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(ordersPageSource, />Action<\/button>/);
  assert.match(ordersPageSource, /aria-modal="true" role="dialog"/);
  assert.match(ordersPageSource, /option.value === ORDER_DATA_FIX_ACTION/);
  assert.match(ordersPageSource, />Save<\/button>/);
  assert.match(ordersPageSource, />Cancel<\/button>/);
});

test("Orders page fixes selected order delivery metadata from Action", () => {
  assert.match(ordersPageSource, /const ORDER_DATA_FIX_ACTION = "fixData"/);
  assert.match(ordersPageSource, /Orders needing review/);
  assert.match(ordersPageSource, /<strong>Customer Note<\/strong>/);
  assert.match(ordersPageSource, /Fix data/);
  assert.match(ordersPageSource, /formData\.set\("_intent", "patchOrderData"\)/);
  assert.match(ordersPageSource, /deliveryDate: \(getOrderDeliveryDateValue\(order\) \?\? ""\)\.replaceAll\("-", "\."\)/);
  assert.match(ordersPageSource, /formData\.set\("deliveryDate", orderDataDraft\.deliveryDate\.replaceAll\("\.", "-"\)\)/);
  assert.match(ordersPageSource, /formData\.set\("deliveryArea", orderDataDraft\.deliveryArea\)/);
  assert.match(ordersPageSource, /aria-label="Delivery date"[\s\S]*?type="text"[\s\S]*?inputMode="numeric"[\s\S]*?maxLength=\{10\}[\s\S]*?placeholder="yyyy\.mm\.dd"/);
  assert.match(ordersPageSource, /patchDeliveryOrderMetadata\(/);
  assert.match(deliveryOrdersSource, /`\/admin\/orders\/\$\{encodeURIComponent\(orderId\)\}\/metadata`/);
});

test("Orders data fix suggests a nearby delivery area without saving it", () => {
  assert.match(ordersPageSource, /getOrderAreaSuggestion\(activeOrderDataOrder, displayOrders\)/);
  assert.match(ordersPageSource, /Suggested area: \{activeOrderAreaSuggestion\.area\}/);
  assert.match(ordersPageSource, /Based on \{activeOrderAreaSuggestion\.matchedOrders\} of \{activeOrderAreaSuggestion\.nearbyOrders\} nearby orders/);
  assert.match(ordersPageSource, /handleOrderDataDraftChange\("deliveryArea", activeOrderAreaSuggestion\.area\)/);
  assert.match(ordersPageSource, />Apply<\/button>/);
});

test("Area and Date pending pills open Fix data without keeping the row selected", () => {
  assert.match(ordersPageSource, /const handleOpenOrderDataAction = \(order\) => \{/);
  assert.match(ordersPageSource, /const pillOrderDataOrder = activeOrderDataOrderId && checkedOrders\.length === 0/);
  assert.match(ordersPageSource, /setSelectedOrderRows\(\[\]\)/);
  assert.match(ordersPageSource, /setOrderActionField\(ORDER_DATA_FIX_ACTION\)/);
  assert.match(ordersPageSource, /selectOrderDataOrder\(order\)/);
  assert.match(ordersPageSource, /setOrderActionModalOpen\(true\)/);
  assert.match(ordersPageSource, /aria-label=\{`Edit delivery area for \$\{order\.name\}`\}/);
  assert.match(ordersPageSource, /aria-label=\{`Edit delivery date for \$\{order\.name\}`\}/);
  assert.match(ordersPageSource, /onClick=\{\(\) => handleOpenOrderDataAction\(order\)\}/);
});

test("Orders loader merges delivery server planning state before background sync", () => {
  assert.match(ordersPageSource, /const activeOrdersView = new URL\(request\.url\)\.searchParams\.get\("view"\) === "inventory"/);
  assert.match(ordersPageSource, /const shouldLoadOrders = activeOrdersView !== "inventory"/);
  assert.match(ordersPageSource, /const serverOrdersStartedAt = getSafePerformanceNow\(\)/);
  assert.match(ordersPageSource, /const serverOrdersRequestPromise = shouldLoadOrders\s*\?\s*\(resourceFlags\.pagination[\s\S]*fetchDeliveryOrdersPage\([\s\S]*:\s*fetchDeliveryOrders\(\s*request,\s*\{\},\s*\{\s*cacheKey: shopifyShopCacheKey,?\s*\},?\s*\)\)\s*:\s*null/);
  assert.match(ordersPageSource, /const serverOrderDataPromise = shouldLoadOrders\s*\?\s*serverOrdersRequestPromise\.then/);
  assert.match(ordersPageSource, /Promise\.resolve\(\{ data: \{ orders: \[\], errors: \[\] \}, durationMs: 0 \}\)/);
  assert.match(ordersPageSource, /const serverOrderRows = mapCanonicalOrdersToOrderRows\(serverOrderData\.orders\)/);
  assert.match(
    ordersPageSource,
    /const mergedOrders = canonicalFirst\s*\?\s*serverOrderRows\s*:\s*mergeShopifyOrderRowsWithCanonicalRows\(\s*orderData\.orders,\s*serverOrderRows,\s*\{\s*includeCanonicalOnly:\s*!shouldLoadShopifyOrders \|\| orderData\.complete !== true,\s*\},\s*\)/,
  );
  assert.match(ordersPageSource, /orders: mergedOrders/);
  assert.match(ordersPageSource, /activeOrdersView,/);
  assert.match(ordersPageSource, /serverOrdersMs: serverOrderDataResult\.durationMs/);
  assert.match(ordersPageSource, /needsSessionTokenRefresh: hasSessionTokenRefreshError\(\[serverOrderData, inventoryData\]\)/);
  assert.match(ordersPageSource, /DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE/);
  assert.match(ordersPageSource, /INVALID_SHOPIFY_SESSION_TOKEN_MESSAGE = "Invalid Shopify session token"/);
  assert.match(ordersPageSource, /error\?\.code === "UNAUTHORIZED"[\s\S]*error\?\.message === INVALID_SHOPIFY_SESSION_TOKEN_MESSAGE/);
});

test("Orders resources bind planning queries to the shop-local date", () => {
  assert.match(
    ordersPageSource,
    /resourceFilters\.set\("routeOpsToday", shopLocalDate\)/,
  );
  assert.match(
    ordersPageSource,
    /routeOpsToday:\s*getShopLocalDate\(shopTimeZoneData\)/,
    "the initial paged request must carry the same explicit shop-local planning date as follow-up resources",
  );
  assert.match(
    ordersPageSource,
    /fetchDeliveryOrdersPage\([\s\S]*\.\.\.payload\.filters/,
  );
});

test("Orders ignores stale all-filtered selection responses", () => {
  assert.match(ordersPageSource, /latestSelectionRequestKeyRef/);
  assert.match(
    ordersPageSource,
    /shouldApplyOrdersResourceResponse\(ordersSelectionFetcher\.data, latestSelectionRequestKeyRef\.current\)/,
  );
  assert.match(ordersPageSource, /_requestKey:\s*payload\._requestKey \?\? null/);
});

test("Orders frozen all-filtered selection persists across pages and patches canonical exclusions", () => {
  assert.match(ordersPageSource, /const \[selectionExcludedOrderIds, setSelectionExcludedOrderIds\] = useState\(\[\]\)/);
  assert.match(ordersPageSource, /pendingSelectionExclusionsRef/);
  assert.match(ordersPageSource, /formData\.set\("selectionToken", selectionSnapshot\.selectionToken\)/);
  assert.match(ordersPageSource, /formData\.set\("excludeOrderIds", JSON\.stringify\(excludeOrderIds\)\)/);
  assert.match(ordersPageSource, /method: "patch"/);
  assert.match(ordersPageSource, /updateOrdersSelectionExclusions\([\s\S]*order\.orderId,[\s\S]*checked/);
  assert.match(ordersPageSource, /snapshotSelectableTableOrders\.map\(\(order\) => order\.orderId\)/);
  assert.match(ordersPageSource, /selectedOrderCount = snapshotSelectionActive/);
  assert.match(ordersPageSource, /setSelectionSnapshot\(null\);[\s\S]*setSelectionExcludedOrderIds\(\[\]\)/);
  assert.match(ordersPageSource, /availableOrderBulkActionOptions = snapshotSelectionActive/);
  assert.match(ordersPageSource, /option\.value !== ORDER_DATA_FIX_ACTION/);
  assert.match(ordersPageSource, /snapshotSelectionActive && orderActionField === ORDER_DATA_FIX_ACTION/);
  assert.match(ordersPageSource, /전체 선택에서는 상태 또는 결제만 일괄 변경할 수 있습니다/);
});

test("Orders preserve every server-owned route membership while keeping a primary route", () => {
  const [order] = mapCanonicalOrdersToOrderRows([{
    orderId: "order-1",
    routePlanId: "route-live",
    routeMemberships: [
      { routePlanId: "route-live", status: "IN_PROGRESS" },
      { routePlanId: "route-ready", status: "READY" },
    ],
    shopifyOrderGid: "gid://shopify/Order/1",
  }]);

  assert.equal(order.routePlanId, "route-live");
  assert.deepEqual(order.routeMemberships, [
    { routePlanId: "route-live", status: "IN_PROGRESS" },
    { routePlanId: "route-ready", status: "READY" },
  ]);
});

test("Orders page retries loader authentication without persisting a Shopify token in the URL", () => {
  assert.match(ordersPageSource, /const sessionTokenRefreshSubmittedRef = useRef\(false\)/);
  assert.match(ordersPageSource, /if \(!needsSessionTokenRefresh\) \{[\s\S]*sessionTokenRefreshSubmittedRef\.current = false/);
  assert.match(ordersPageSource, /if \(sessionTokenRefreshSubmittedRef\.current\) return/);
  assert.match(ordersPageSource, /await shopify\.idToken\(\)/);
  assert.match(ordersPageSource, /revalidator\.revalidate\(\)/);
  assert.doesNotMatch(ordersPageSource, /SESSION_TOKEN_REFRESH_PARAM/);
  assert.doesNotMatch(ordersPageSource, /nextSearchParams\.set\("id_token"/);
});

test("Orders reconciliation polling never retains or reuses a session token", () => {
  assert.doesNotMatch(
    ordersPageSource,
    /activeOrdersReconciliationRef\.current\s*=\s*\{[\s\S]{0,240}sessionToken/,
  );
  assert.match(
    ordersPageSource,
    /const sessionToken = await shopify\.idToken\(\)[\s\S]{0,500}formData\.set\("shopifySessionToken", sessionToken\)[\s\S]{0,300}ordersReconciliationStatusFetcher\.submit/,
  );
  assert.doesNotMatch(ordersPageSource, /active\.sessionToken|current\.sessionToken/);
});

test("Orders post-action navigation does not retain a submitted session token", () => {
  assert.doesNotMatch(ordersPageSource, /submittedRouteSessionTokenRef|submittedInventorySessionTokenRef/);
  assert.match(ordersPageSource, /submittedRouteRequestRef\.current = true/);
  assert.doesNotMatch(ordersPageSource, /submittedInventoryRequestRef/);
  assert.doesNotMatch(ordersPageSource, /navigate\(appendIdToken\(/);
  assert.doesNotMatch(ordersPageSource, /navigate\(`\/app\/orders\/inventory\?[^`]*id_token/);
});

test("Orders page uses the Shopify shop timezone as today's delivery cutoff", () => {
  assert.match(shopTimeZoneSource, /const SHOP_TIME_ZONE_QUERY = `#graphql/);
  assert.match(shopTimeZoneSource, /shop \{[\s\S]*ianaTimezone[\s\S]*timezoneAbbreviation[\s\S]*\}/);
  assert.match(shopTimeZoneSource, /const shopTimeZoneCache = new Map\(\)/);
  assert.match(shopTimeZoneSource, /export async function fetchShopifyShopTimeZone\(admin, options = \{\}\) \{/);
  assert.match(shopTimeZoneSource, /const cacheKey = textOrUndefined\(options\.cacheKey\)/);
  assert.match(shopTimeZoneSource, /return cached\.promise\.then\(cloneShopTimeZoneResult\)/);
  assert.match(shopTimeZoneSource, /admin\.graphql\(SHOP_TIME_ZONE_QUERY\)/);
  assert.match(ordersPageSource, /fetchShopifyShopTimeZone\(\s*admin,\s*\{\s*cacheKey: shopifyShopCacheKey\s*\},?\s*\)/);
  assert.match(shopTimeZoneSource, /export function getShopLocalDate\(shopTimeZoneData, date = new Date\(\)\) \{/);
  assert.match(shopTimeZoneSource, /getLocalDateForTimeZone\(date, shopTimeZoneData\?\.ianaTimezone\)/);
  assert.match(ordersPageSource, /const shopLocalDate = getShopLocalDate\(shopTimeZoneData\)/);
  assert.match(ordersPageSource, /shopLocalDate,/);
  assert.match(ordersPageSource, /shopTimeZone: shopTimeZoneData\.ianaTimezone \?\? null/);
  assert.match(ordersPageSource, /shopTimeZoneMs: shopTimeZoneDataResult\.durationMs/);
  assert.match(ordersPageSource, /const orderFilterReferenceDate = useMemo/);
});

test("Orders page syncs loaded Shopify snapshots without adding sync cards", () => {
  assert.match(ordersPageSource, /const ordersSyncFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /const orderSyncSubmittedRef = useRef\(false\)/);
  assert.match(ordersPageSource, /const autoSyncOrdersOnLoad = featureFlags\?\.autoSyncOrdersOnLoad === true/);
  assert.match(ordersPageSource, /if \(!autoSyncOrdersOnLoad\) return/);
  assert.match(ordersPageSource, /getOrderSyncSnapshots\(safeOrders\)/);
  assert.match(ordersPageSource, /ordersSyncFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(ordersPageSource, /mapCanonicalOrdersToOrderRows\(ordersSyncFetcher\.data\?\.syncedOrders\)/);
  assert.match(ordersPageSource, /const displayOrders = useMemo\(/);
  assert.match(ordersPageSource, /syncedOrders\.length > 0[\s\S]*mergeShopifyOrderRowsWithCanonicalRows\(safeOrders, syncedOrders\)[\s\S]*: safeOrders/);
  assert.doesNotMatch(ordersPageSource, /Orders sync KPI/);
  assert.doesNotMatch(ordersPageSource, /orders sync card/i);
  assert.doesNotMatch(ordersPageSource, /sync status panel/i);
});

test("Orders owns global Shopify order update and safe route refresh", () => {
  assert.match(ordersPageSource, /import \{ refreshRouteOrders \} from "\.\.\/delivery\/route-detail\.server"/);
  assert.match(ordersPageSource, /import \{ getBulkRefreshRoutePlanIds \} from "\.\.\/delivery\/route-order-refresh"/);
  assert.match(ordersPageSource, /const ordersRefreshFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /const ordersReconciliationStatusFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /intent === "refreshAllRoutes"/);
  assert.match(ordersPageSource, /intent === "pollOrdersReconciliation"/);
  assert.match(ordersPageSource, /startDeliveryOrdersReconciliation\(/);
  assert.match(ordersPageSource, /\{ correlationId: refreshRequestId, mode: "FULL" \}/);
  assert.match(ordersPageSource, /fetchDeliveryOrdersReconciliationStatus\(/);
  assert.match(ordersPageSource, /reconciliationMode: "background"/);
  assert.match(ordersPageSource, /fetchShopifyOrders\(admin,\s*\{[\s\S]*deliveryCycle: preferencesData\.appPreferences\.deliveryCycle,[\s\S]*\}\)/);
  assert.match(ordersPageSource, /reason: "orders_page_open"/);
  assert.match(ordersPageSource, /syncedOrderData,/);
  assert.match(ordersPageSource, /allowInProgress: false/);
  assert.match(ordersPageSource, /const routePlanIds = getBulkRefreshRoutePlanIds\(routePlans\)/);
  assert.match(ordersPageSource, /formData\.set\("_intent", "refreshAllRoutes"\)/);
  assert.match(ordersPageSource, /formData\.set\("refreshRequestId", refreshRequestId\)/);
  assert.match(ordersPageSource, /ordersRefreshFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(ordersPageSource, /formData\.set\("_intent", "pollOrdersReconciliation"\)/);
  assert.match(ordersPageSource, /formData\.set\("jobId", active\.jobId\)/);
  assert.match(ordersPageSource, /ordersReconciliationStatusFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(ordersPageSource, /refreshResult\.updatedOrders \?\? reconciliationJob\?\.appliedCount/);
  assert.match(ordersPageSource, /Order reconciliation queued/);
  assert.match(ordersPageSource, /\$\{updatedOrders\} orders synced; \$\{refreshedRoutes\} READY routes refreshed\$\{skippedMessage\}/);
  assert.match(ordersPageSource, /ordersRefreshPhase === "reloading"/);
  assert.match(ordersPageSource, /pendingOrdersRefreshCompletionRef\.current = \{[\s\S]*message:/);
  assert.match(ordersPageSource, /if \(!ordersRefreshRevalidationObservedRef\.current\) return/);
  assert.match(ordersPageSource, /shopify\.toast\.show\(completion\.message\)/);
  assert.match(
    ordersPageSource,
    /isOrdersReconciliationTerminalSuccess\(job\)[\s\S]*ordersReconciliationRevalidatedJobIdRef\.current !== completion\.jobId[\s\S]*setOrdersRefreshPhase\("reloading"\)[\s\S]*revalidator\.revalidate\(\)/,
  );
  assert.match(ordersPageSource, /isOrdersReconciliationTerminalFailure\(job\)/);
  assert.match(ordersPageSource, /window\.clearTimeout\(timeout\)/);
  assert.match(ordersPageSource, /current\?\.jobId !== active\.jobId \|\| current\?\.requestId !== active\.requestId/);
  assert.doesNotMatch(ordersPageSource, /orderUpdate|customerUpdate|mutation\s+\w*Order|mutation\s+\w*Customer/);
});

test("Orders route creation submits the planned draft without client ready-state filtering", () => {
  assert.doesNotMatch(ordersPageSource, /readyPlannedOrders/);
  assert.match(ordersPageSource, /const createRouteDisabled = plannedOrders\.length === 0 \|\| routePlanFetcher\.state !== "idle"/);
  assert.match(ordersPageSource, /JSON\.stringify\(plannedOrders\.map\(\(order\) => order\.id\)\)/);
  assert.doesNotMatch(ordersPageSource, /History \/ All Orders scope는 조회 전용입니다/);
  assert.doesNotMatch(ordersPageSource, /ready 상태의 주문만/);
  assert.doesNotMatch(ordersPageSource, /isOrderRoutePlanningLocked\(order, orderFilterReferenceDate\)/);
});

test("Orders route creation syncs only selected planned orders during preflight", () => {
  assert.match(ordersPageSource, /const plannedOrderIdSet = new Set\(plannedOrderIds\)/);
  assert.match(ordersPageSource, /const missingPlannedOrderIds = plannedOrderIds\.filter\(\(orderId\) => !canonicalOrderById\.has\(orderId\)\)/);
  assert.match(ordersPageSource, /fetchShopifyOrdersByIds\(admin, missingPlannedOrderIds/);
  assert.match(ordersPageSource, /const plannedShopifyOrders = canonicalFirst\s*\?\s*orderData\.orders\s*:\s*orderData\.orders\.filter\(\(order\) =>\s*plannedOrderIdSet\.has\(order\.id\)\)/);
  assert.match(ordersPageSource, /const plannedShopifyOrderSnapshots = getOrderSyncSnapshots\(plannedShopifyOrders\)/);
  assert.match(ordersPageSource, /plannedShopifyOrderSnapshots\.length > 0\s*\?\s*await syncDeliveryOrders/);
  assert.match(ordersPageSource, /orders: plannedShopifyOrderSnapshots/);
  assert.match(ordersPageSource, /fetchDeliveryOrders\(\s*request,\s*\{\},\s*\{\s*cacheKey: shopifyShopCacheKey,\s*sessionToken: shopifySessionToken,?\s*\},?\s*\)/);
  assert.match(ordersPageSource, /const canonicalOrders = mergeShopifyOrderRowsWithCanonicalRows\(\s*canonicalRows,\s*mapCanonicalOrdersToOrderRows\(syncedOrderData\.orders\),\s*\)/);
  assert.match(ordersPageSource, /if \(plannedOrders\.length !== plannedOrderIds\.length\)/);
  assert.doesNotMatch(ordersPageSource, /orders: getOrderSyncSnapshots\(orderData\.orders\)/);
});

test("Orders route creation revalidates only that selected orders still resolve after preflight sync", () => {
  assert.match(ordersPageSource, /const plannedOrders = plannedOrderIds\s*\.map\(\(orderId\) => orderById\.get\(orderId\)\)\s*\.filter\(Boolean\)/);
  assert.match(ordersPageSource, /if \(plannedOrders\.length !== plannedOrderIds\.length\)/);
  assert.match(ordersPageSource, /buildCreateRoutePlanPayload\(\{/);
  assert.doesNotMatch(ordersPageSource, /alreadyPlannedOrders/);
  assert.doesNotMatch(ordersPageSource, /expiredDeliveryDateOrders/);
  assert.doesNotMatch(ordersPageSource, /nonPlanningScopeOrders/);
});

test("Orders page surfaces concrete route creation errors instead of a generic message", () => {
  assert.match(ordersPageSource, /getServiceErrorNotice\(\[/);
  assert.match(ordersPageSource, /\{orderPageNoticeMessage\}/);
  assert.doesNotMatch(ordersPageSource, /Shopify 주문 또는 route plan 저장 중 일부 오류가 반환되었습니다\./);
});

test("Orders page keeps background sync errors out of the route creation alert", () => {
  assert.match(ordersPageSource, /: routePlanFetcher\.data/);
  assert.match(ordersPageSource, /getServiceErrorNotice\(\[/);
  assert.doesNotMatch(ordersPageSource, /ordersSyncFetcher\.data\?\.errors/);
});

test("Orders route draft lets filters guide selection without client route-scope locks", () => {
  assert.match(ordersPageSource, /const selectedOrders = selectedOrderRows\.filter\(\(order\) =>\s*!plannedOrderIdSet\.has\(order\.id\),\s*\)/);
  assert.match(ordersPageSource, /const selectedOrderIds = selectedOrders\.map\(\(order\) => order\.id\)/);
  assert.match(ordersPageSource, /Array\.from\(new Set\(\[\.\.\.plannedOrderIds, \.\.\.selectedOrderIds\]\)\)/);
  assert.match(ordersPageSource, /setRoutePlanTitle\(buildRoutePlanTitleFromOrders\(nextOrders\)\)/);
  assert.doesNotMatch(ordersPageSource, /worksetAvailabilityContext/);
  assert.doesNotMatch(ordersPageSource, /isOrderSelectableForCurrentWorkset/);
  assert.doesNotMatch(ordersPageSource, /getBulkOrderSelectionState/);
});

test("Orders selection does not lock the table or filters before Add to map", () => {
  assert.doesNotMatch(ordersPageSource, /getFirstOrderDeliveryDateByIds/);
  assert.doesNotMatch(ordersPageSource, /getOrdersForDeliveryDate/);
  assert.doesNotMatch(ordersPageSource, /routePlanDeliveryDateLock/);
  assert.doesNotMatch(ordersPageSource, /autoAppliedDeliveryDateFilter/);
  assert.doesNotMatch(ordersPageSource, /applyDeliveryDateFilterLock/);
  assert.doesNotMatch(ordersPageSource, /applyOrderDeliveryDateSelectionLock/);
  assert.match(ordersPageSource, /updatePagedOrderSelection\(currentOrders, selectableTableOrders, true\)/);
});

test("Orders pending selection and route draft survive paginated table data changes", () => {
  assert.match(ordersPageSource, /const \[selectedOrderRows, setSelectedOrderRows\] = useState\(\[\]\)/);
  assert.match(ordersPageSource, /const checkedOrders = selectedOrderRows/);
  assert.match(ordersPageSource, /updatePagedOrderSelection\(currentOrders, \[order\], checked\)/);
  assert.match(ordersPageSource, /const selectedOrderById = new Map\(selectedOrders\.map\(\(order\) => \[order\.id, order\]\)\)/);
  assert.match(ordersPageSource, /selectedOrderById\.get\(orderId\) \?\? displayOrderById\.get\(orderId\) \?\? plannedOrderRowById\.get\(orderId\)/);
  assert.doesNotMatch(ordersPageSource, /const selectableOrderIds = new Set\(/);
  assert.match(ordersPageSource, /useEffect\(\(\) => \{\s*setSelectedOrderRows\(\[\]\);\s*\}, \[resourceFilterKey\]\)/);
  assert.match(ordersPageSource, /const \[plannedOrderRows, setPlannedOrderRows\] = useState\(\[\]\)/);
  assert.match(ordersPageSource, /displayOrderById\.get\(orderId\) \?\? plannedOrderRowById\.get\(orderId\)/);
  assert.match(ordersPageSource, /displayOrderById\.get\(nextOrderId\) \?\? plannedOrderRowById\.get\(nextOrderId\)/);
  assert.doesNotMatch(
    ordersPageSource,
    /setPlannedOrderIds\(\(currentOrderIds\) => \{[\s\S]*?displayOrderIds\.has\(orderId\)/,
  );
});

test("Orders table keeps route-created orders visible and relies on State labels", () => {
  assert.match(ordersPageSource, /filterOrders\(displayOrders, \{[\s\S]*tab: "all",[\s\S]*referenceDate: orderFilterReferenceDate/);
  assert.match(ordersPageSource, /const stateValue = getOrderDeliveryStateFilterValue\(order, referenceDate\)/);
  assert.match(ordersPageSource, /if \(stateValue === "planned"\) return "Planned"/);
  assert.match(ordersPageSource, /getOrderDeliveryStatePillTone\(order, orderFilterReferenceDate\)/);
});


test("Orders table treats no active filters as literally unfiltered", () => {
  assert.match(ordersPageSource, /const activeOrderFilters = useMemo\([\s\S]*hasActiveOrderFilters\(orderFilters\)/);
  assert.match(ordersPageSource, /activeOrderFilters\s*\? filterOrders\(displayOrders, \{[\s\S]*?: displayOrders/);
});

test("Orders filter changes apply directly without automatic delivery-date lock rewrites", () => {
  assert.match(ordersPageSource, /const handleOrderFilterChange = \(filterKey, filterValue\) => \{[\s\S]*?\[filterKey\]: filterValue/);
  assert.doesNotMatch(ordersPageSource, /autoAppliedDeliveryDateFilter/);
  assert.doesNotMatch(ordersPageSource, /setAutoAppliedDeliveryDateFilter/);
});

test("Orders clear filters resets date placeholders even with a draft", () => {
  assert.match(ordersPageSource, /const handleClearOrderFilters = \(\) => \{/);
  assert.match(ordersPageSource, /deliveryDate: ""/);
  assert.match(ordersPageSource, /orderedDateFrom: ""/);
  assert.match(ordersPageSource, /orderedDateTo: ""/);
  assert.doesNotMatch(ordersPageSource, /ROUTE_PLAN_DELIVERY_DATE_FILTER_LOCKED_ERROR/);
});

test("Orders page shows a route summary before moving to Routes", () => {
  assert.match(ordersPageSource, /const routeReadinessStyle = \{/);
  assert.match(ordersPageSource, /const routeReadinessHeaderStyle = \{/);
  assert.match(ordersPageSource, /containerName:\s*"route-summary"/);
  assert.match(ordersPageSource, /containerType:\s*"inline-size"/);
  assert.match(globalCssSource, /\.order-route-summary-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(136px, 1fr\)\)/);
  assert.match(globalCssSource, /@container route-summary \(max-width: 280px\) \{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(ordersPageSource, /className="order-route-summary"/);
  assert.match(ordersPageSource, /flexWrap:\s*"wrap"/);
  assert.match(ordersPageSource, /minWidth:\s*0/);
  assert.match(ordersPageSource, /whiteSpace:\s*"nowrap"/);
  assert.match(ordersPageSource, /aria-label="Order summary"/);
  assert.match(ordersPageSource, />Order summary<\/s-heading>/);
  assert.match(ordersPageSource, /function formatRouteDraftScopeLabel\(orders\) \{/);
  assert.match(ordersPageSource, /getOrderDeliveryDateValue\(order\)/);
  assert.match(ordersPageSource, /scopeLabel: formatRouteDraftScopeLabel\(plannedOrders\)/);
  assert.match(ordersPageSource, /<span>Scope<\/span>/);
  assert.match(ordersPageSource, /title=\{routeDraftSummary\.scopeLabel\}/);
  assert.match(ordersPageSource, /\{routeDraftSummary\.scopeLabel\}/);
  assert.match(ordersPageSource, /<span>Orders<\/span>/);
  assert.match(ordersPageSource, /\{routeDraftSummary\.orderCount\}/);
  assert.match(ordersPageSource, /<span>Areas<\/span>/);
  assert.match(ordersPageSource, /title=\{formatRouteDraftList\(routeDraftSummary\.deliveryAreas\)\}/);
  assert.match(ordersPageSource, /formatRouteDraftAreaSummary\(routeDraftSummary\.deliveryAreas\)/);
  assert.match(ordersPageSource, /<span>Items<\/span>/);
  assert.match(ordersPageSource, /\{routeDraftSummary\.itemCount\}/);
  assert.doesNotMatch(ordersPageSource, /Coords: \{routeDraftSummary\.locatedCount\}\/\{routeDraftSummary\.orderCount\}/);
  assert.doesNotMatch(ordersPageSource, /Missing: \{routeDraftSummary\.missingCoordinateCount\}/);
  assert.doesNotMatch(ordersPageSource, /Day: \{formatRouteDraftList\(routeDraftSummary\.deliveryDays\)\}/);
  assert.doesNotMatch(ordersPageSource, /Next: optimize → assign → schedule/);
});

test("Orders route summary keeps Clear in the former zoom action slot", () => {
  assert.match(ordersPageSource, /const handleZoomToPlanned = \(\) => \{/);
  assert.match(ordersPageSource, /fitMapToOrders\(routeFitLocations\)/);
  assert.match(ordersPageSource, />Order summary<\/s-heading>[\s\S]*onClick=\{handleClearPlan\}[\s\S]*>Clear<\/button>/);
  assert.doesNotMatch(ordersPageSource, /aria-label="Zoom to planned route"/);
  assert.doesNotMatch(ordersPageSource, />Zoom to planned<\/button>/);
});

test("Orders page keeps Add to map in the table controls", () => {
  assert.match(ordersPageSource, /const handleAddToPlan = \(\) => \{/);
  assert.match(ordersPageSource, /checkedOrderIds\.length === 0/);
  assert.match(ordersPageSource, /const nextOrderIds = Array\.from\(new Set\(\[\.\.\.plannedOrderIds, \.\.\.selectedOrderIds\]\)\)/);
  assert.match(ordersPageSource, /setRoutePlanTitle\(buildRoutePlanTitleFromOrders\(nextOrders\)\)/);
  assert.match(ordersPageSource, />Add to map<\/button>/);
  assert.match(ordersPageSource, /disabled=\{checkedOrderIds\.length === 0 \|\| snapshotSelectionActive\}/);
  assert.match(ordersPageSource, /const orderControlsTrailingStyle = \{[\s\S]*?marginLeft:\s*"auto"/);
  assert.match(ordersPageSource, />Clear selection<\/button>/);
  assert.doesNotMatch(ordersPageSource, /shown ·/);
  assert.doesNotMatch(ordersPageSource, /added to plan\./);
  assert.doesNotMatch(ordersPageSource, />Add to map<\/button>[\s\S]{0,400}>Assign<\/button>/);
});

test("Orders table keeps delivery state operational and payment state separate", () => {
  assert.match(ordersPageSource, /\{ key: "deliveryArea", label: "Area" \}/);
  assert.match(ordersPageSource, /\{ key: "orderedDate", label: "Ordered" \}/);
  assert.match(ordersPageSource, /\{ key: "deliveryLabel", label: "Delivery" \}/);
  assert.match(ordersPageSource, /\{ key: "planningStatus", label: "State" \}/);
  assert.match(ordersPageSource, /\{ key: "payment", label: "Payment" \}/);
  assert.match(ordersPageSource, /import \{ InfoPill \} from "(?:\.\.\/ui|\.\.\/\.\.\/ui)\/info-pill"/);
  assert.match(ordersPageSource, /const deliveryInfoCellStyle = \{/);
  assert.match(infoPillSource, /className=\{`info-pill info-pill--\$\{normalizeInfoPillTone\(tone\)\}`\}/);
  assert.match(infoPillSource, /title=\{title \?\? fallbackTitle\}/);
  assert.match(globalCssSource, /\.info-pill \{[\s\S]*?border-radius: 999px/);
  assert.match(globalCssSource, /\.info-pill \{[\s\S]*?min-width: max-content/);
  assert.match(globalCssSource, /\.info-pill \{[\s\S]*?width: max-content/);
  assert.match(ordersPageSource, /function getTableColumnPillMinWidth\(tableElement, columnIndex\) \{/);
  assert.match(ordersPageSource, /if \(pills\.length === 0\) return null/);
  assert.match(ordersPageSource, /function getTableColumnMinWidth\(tableElement, columnIndex\) \{/);
  assert.match(ordersPageSource, /return getTableColumnPillMinWidth\(tableElement, columnIndex\) \?\? MIN_TABLE_COLUMN_WIDTH/);
  assert.match(ordersPageSource, /function getTableColumnPillMinWidths\(tableElement, columnCount\) \{/);
  assert.match(ordersPageSource, /return pillMinWidth == null \? width : Math\.max\(width, pillMinWidth\)/);
  assert.doesNotMatch(ordersPageSource, /header \? Math\.ceil\(header\.scrollWidth\) : 0/);
  assert.match(ordersPageSource, /setLockedTableWidth\(nextTableWidth\)/);
  assert.match(ordersPageSource, /getTableColumnMinWidth\(tableElement, columnIndex\) - leftStartWidth/);
  assert.match(ordersPageSource, /rightStartWidth - getTableColumnMinWidth\(tableElement, rightColumnIndex\)/);
  assert.match(globalCssSource, /\.info-pill--success \{[\s\S]*?color: #006c48/);
  assert.match(globalCssSource, /\.info-pill--warning \{[\s\S]*?color: #8a4b00/);
  assert.match(globalCssSource, /\.info-pill--critical \{[\s\S]*?color: #b42318/);
  assert.match(ordersPageSource, /function formatOrderDeliveryLabel\(order\) \{/);
  assert.match(ordersPageSource, /if \(!order\) return "—"/);
  assert.match(ordersPageSource, /: "Date pending"/);
  assert.match(ordersPageSource, /function formatOrderDeliveryState\(order, referenceDate\) \{/);
  assert.match(ordersPageSource, /getOrderDeliveryExceptionState\(order, referenceDate\)/);
  assert.doesNotMatch(ordersPageSource, /Assigned · overdue/);
  assert.match(ordersPageSource, /Past due/);
  assert.doesNotMatch(ordersPageSource, /Past due · unassigned/);
  assert.match(ordersPageSource, /Assigned · undelivered/);
  assert.doesNotMatch(ordersPageSource, /formatOrderShopifyFulfillmentState\(order\)/);
  assert.doesNotMatch(ordersPageSource, /getOrderShopifyFulfillmentPillTone\(order\)/);
  assert.doesNotMatch(ordersPageSource, /title="Shopify fulfillment"/);
  assert.doesNotMatch(ordersPageSource, /const statePillStackStyle = \{/);
  assert.doesNotMatch(ordersPageSource, /\{ label: "Fulfilled", value: "FULFILLED" \}/);
  assert.doesNotMatch(ordersPageSource, /\{ label: "Unfulfilled", value: "UNFULFILLED" \}/);
  assert.match(ordersPageSource, /En route/);
  assert.match(ordersPageSource, /Arrived/);
  assert.match(ordersPageSource, /Failed/);
  assert.match(ordersPageSource, /Skipped/);
  assert.match(ordersPageSource, /Cancelled/);
  assert.match(ordersPageSource, /formatDeliveryValue\(order\.orderedDate\)/);
  assert.match(ordersPageSource, /function formatAreaValue\(order\)/);
  assert.match(ordersPageSource, /if \(order\?\.serviceType === "PICKUP"\) return "Pickup"/);
  assert.doesNotMatch(ordersPageSource, new RegExp("diag" + "nostic", "i"));
  assert.match(ordersPageSource, /const \[activeOrderDetailPopover, setActiveOrderDetailPopover\] = useState\(null\)/);
  assert.match(ordersPageSource, /function isAttentionPillTone\(tone\) \{/);
  assert.match(ordersPageSource, /return tone === "warning" \|\| tone === "critical"/);
  assert.match(ordersPageSource, /function getOrderDetailPopoverPosition\(rect, popoverSize = \{\}\) \{/);
  assert.match(ordersPageSource, /const viewportLeft = window\.scrollX/);
  assert.match(ordersPageSource, /const viewportTop = window\.scrollY/);
  assert.match(ordersPageSource, /const aboveTop = rect\.top \+ window\.scrollY - height - gap/);
  assert.match(ordersPageSource, /const belowTop = rect\.bottom \+ window\.scrollY \+ gap/);
  assert.match(ordersPageSource, /aboveTop >= viewportTop \+ gap/);
  assert.match(ordersPageSource, /\? aboveTop\s*: clampPopoverPosition\(belowTop/);
  assert.match(ordersPageSource, /const showDetails = details\.length > 0 && \(interactive \|\| isAttentionPillTone\(tone\)\)/);
  assert.match(ordersPageSource, /if \(!showDetails\) \{/);
  assert.match(ordersPageSource, /data-order-detail-popover-root="true"/);
  assert.match(ordersPageSource, /onMouseEnter=\{\(event\) => openOrderDetailPopover\(event, \{ detailKey, details, label \}\)\}/);
  assert.match(ordersPageSource, /onMouseLeave=\{\(\) => closeOrderDetailPopover\(detailKey\)\}/);
  assert.match(ordersPageSource, /window\.addEventListener\("scroll", handleWindowLayoutChange, true\)/);
  assert.match(ordersPageSource, /window\.addEventListener\("resize", handleWindowLayoutChange\)/);
  assert.match(ordersPageSource, /createPortal\(/);
  assert.match(ordersPageSource, /document\.body/);
  assert.match(ordersPageSource, /<InfoPill title="" tone=\{tone\}>/);
  assert.match(ordersPageSource, /role="tooltip"/);
  assert.match(ordersPageSource, /label: "Area details"/);
  assert.match(ordersPageSource, /label: "Delivery details"/);
  assert.match(ordersPageSource, /label: "State details"/);
  assert.match(ordersPageSource, /label: "Payment details"/);
  assert.match(ordersPageSource, /function getOrderAreaPillDetails\(order\)/);
  assert.match(ordersPageSource, /const areaPillTone = getOrderAreaPillTone\(order\)/);
  assert.match(ordersPageSource, /tone: areaPillTone/);
  assert.match(ordersPageSource, /Delivery area is missing/);
  assert.match(ordersPageSource, /Raw Delivery Area missing/);
  assert.match(ordersPageSource, /function getOrderDeliveryPillDetails\(order\)/);
  assert.match(ordersPageSource, /tone: getOrderDeliveryPillTone\(order\)/);
  assert.match(ordersPageSource, /tomatono_delivery_date/);
  assert.match(ordersPageSource, /Delivery date is missing/);
  assert.match(ordersPageSource, /Raw Delivery Date missing/);
  assert.match(ordersPageSource, /Raw Delivery Day/);
  assert.match(ordersPageSource, /hasNoteDeliveryContext\(note\)/);
  assert.match(ordersPageSource, /Item date range:/);
  assert.match(ordersPageSource, /function getOrderDeliveryStatePillDetails\(order, referenceDate\)/);
  assert.match(ordersPageSource, /function getOrderDeliveryStateHint\(order, referenceDate\) \{/);
  assert.match(ordersPageSource, /Past due: assigned route is not delivered/);
  assert.match(ordersPageSource, /Past due: no route assigned/);
  assert.match(ordersPageSource, /Shopify shows fulfilled, but CLEVER driver status is missing/);
  assert.match(ordersPageSource, /isShopifyFulfilledWithoutDriverStatus\(order\)/);
  assert.match(ordersPageSource, /formatInfoDetail\("Shopify fulfillment"/);
  assert.match(ordersPageSource, /CLEVER driver status missing/);
  assert.doesNotMatch(ordersPageSource, /Filter state|CLEVER planning|CLEVER delivery|CLEVER driver stop/);
  assert.match(ordersPageSource, /tone: getOrderDeliveryStatePillTone\(order, orderFilterReferenceDate\)/);
  assert.match(ordersPageSource, /function getOrderPaymentPillDetails\(order\)/);
  assert.match(ordersPageSource, /tone: getOrderPaymentPillTone\(order\)/);
  assert.match(ordersPageSource, /Payment is awaiting collection/);
  assert.match(ordersPageSource, /Payment status or gateway is unknown/);
  assert.match(ordersPageSource, /Raw payment status/);
  assert.match(ordersPageSource, /Raw payment gateway/);
  assert.match(ordersPageSource, /formatOrderPaymentState\(order\)/);
  assert.match(ordersPageSource, /function getOrderPaymentStatus\(order\) \{/);
  assert.match(ordersPageSource, /order\?\.paymentStatus/);
  assert.match(ordersPageSource, /order\?\.rawPayload\?\.displayFinancialStatus/);
  assert.match(ordersPageSource, /order\?\.shopifyOrderSnapshot\?\.displayFinancialStatus/);
  assert.match(ordersPageSource, /function getOrderPaymentGatewayNames\(order\) \{/);
  assert.match(ordersPageSource, /order\?\.rawPayload\?\.paymentGatewayNames/);
  assert.match(ordersPageSource, /order\?\.shopifyOrderSnapshot\?\.paymentGatewayNames/);
  assert.match(ordersPageSource, /if \(status === "PAID"\) return "Paid"/);
  assert.doesNotMatch(ordersPageSource, /if \(status === "CASH"\) return "Cash"/);
  assert.doesNotMatch(ordersPageSource, /if \(status === "ETRANSFER"\) return "eTransfer"/);
  assert.match(ordersPageSource, /if \(status === "PENDING"\) return "Awaiting payment"/);
  assert.match(ordersPageSource, /return "Unknown"/);
  assert.match(ordersPageSource, /function getOrderPaymentPillTone\(order\) \{/);
  assert.match(ordersPageSource, /if \(paymentState === "Paid"\) return "success"/);
  assert.match(ordersPageSource, /if \(paymentState === "Awaiting payment"\) return "warning"/);
  assert.match(ordersPageSource, /return "critical"/);
  assert.doesNotMatch(ordersPageSource, /formatPaymentStatusLabel/);
  assert.doesNotMatch(ordersPageSource, /formatPaymentGatewayName/);
  assert.doesNotMatch(ordersPageSource, /Payment unknown/);
  assert.doesNotMatch(ordersPageSource, /Cash · collect|eTransfer · request|Pending ·|Payment ·|\$\{statusLabel\} · \$\{gatewayLabel\}/);
  assert.match(ordersPageSource, /function getOrderLineItems\(order\) \{/);
  assert.match(ordersPageSource, /const \[hoveredItemPopoverOrderId, setHoveredItemPopoverOrderId\] = useState\(null\)/);
  assert.match(ordersPageSource, /const \[pinnedItemPopoverOrderId, setPinnedItemPopoverOrderId\] = useState\(null\)/);
  assert.match(ordersPageSource, /const \[itemPopoverPosition, setItemPopoverPosition\] = useState\(null\)/);
  assert.match(ordersPageSource, /const itemPopoverAnchorRef = useRef\(null\)/);
  assert.match(ordersPageSource, /const itemPopoverRef = useRef\(null\)/);
  assert.match(ordersPageSource, /const visibleItemPopoverOrderId = pinnedItemPopoverOrderId \?\? hoveredItemPopoverOrderId/);
  assert.match(ordersPageSource, /const syncItemPopover = useCallback\(\(\) => \{/);
  assert.match(ordersPageSource, /height: popoverNode\?\.offsetHeight \?\? ITEM_POPOVER_HEIGHT/);
  assert.match(ordersPageSource, /width: popoverNode\?\.offsetWidth \?\? ITEM_POPOVER_WIDTH/);
  assert.match(ordersPageSource, /window\.addEventListener\("scroll", handleWindowLayoutChange, true\)/);
  assert.match(ordersPageSource, /data-order-items-popover-root="true"/);
  assert.match(ordersPageSource, /onMouseEnter=\{\(event\) => openItemPopover\(event, order\.id\)\}/);
  assert.match(ordersPageSource, /onMouseLeave=\{\(\) => closeHoveredItemPopover\(order\.id\)\}/);
  assert.match(ordersPageSource, /onClick=\{\(event\) => togglePinnedItemPopover\(event, order\.id\)\}/);
  assert.match(ordersPageSource, /setPinnedItemPopoverOrderId\(\(currentOrderId\) => currentOrderId === orderId \? null : orderId\)/);
  assert.match(ordersPageSource, /visibleItemPopoverOrderId === order\.id && itemPopoverPosition && typeof document !== "undefined" \? createPortal\(/);
  assert.match(ordersPageSource, /event\.target\?\.closest\?\.\('\[data-order-items-popover-root="true"\]'\)/);
  assert.match(ordersPageSource, /aria-label=\{`Show items for \$\{order\.name\}`\}/);
  assert.match(ordersPageSource, /<s-icon type="info" size="base" color="subdued"><\/s-icon>/);
  assert.doesNotMatch(ordersPageSource, /<svg aria-hidden="true"/);
  assert.doesNotMatch(ordersPageSource, /formatDeliveryValue\(order\.deliveryLabel\)/);
  assert.doesNotMatch(ordersPageSource, /\{ key: "deliveryDay", label: "Day" \}/);
  assert.doesNotMatch(ordersPageSource, /\{ key: "status", label: "Status" \}/);
  assert.doesNotMatch(ordersPageSource, /\{ key: "paymentStatus", label: "Payment" \}/);
  assert.doesNotMatch(ordersPageSource, /\{ key: "attributes", label: "Attributes" \}/);
  assert.doesNotMatch(ordersPageSource, /\{order\.status\}<\/td>/);
  assert.doesNotMatch(ordersPageSource, /\{order\.paymentStatus\}<\/td>/);
  assert.doesNotMatch(ordersPageSource, /\{order\.attributes\}<\/td>/);
});

test("Orders table keeps planned orders visible but removes them from selectable candidates", () => {
  assert.match(ordersPageSource, /const plannedOrderIdSet = useMemo\(\s*\(\) => new Set\(plannedOrderIds\),\s*\[plannedOrderIds\],\s*\)/);
  assert.match(ordersPageSource, /const tableOrders = sortedOrders/);
  assert.match(ordersPageSource, /const selectableTableOrders = useMemo\(/);
  assert.match(ordersPageSource, /tableOrders\.filter\(\(order\) => !plannedOrderIdSet\.has\(order\.id\)\)/);
  assert.match(ordersPageSource, /selectableTableOrders\.length > 0 &&\s*selectableTableOrders\.every\(\(order\) => checkedOrderIdSet\.has\(order\.id\)\)/);
  assert.match(ordersPageSource, /updatePagedOrderSelection\(currentOrders, selectableTableOrders, false\)/);
  assert.match(ordersPageSource, /updatePagedOrderSelection\(currentOrders, selectableTableOrders, true\)/);
  assert.match(ordersPageSource, /\{tableOrders\.map\(\(order\) => \{/);
  assert.doesNotMatch(ordersPageSource, /\{sortedOrders\.map\(\(order\) => \(/);
});

test("Orders action buttons avoid React border shorthand collisions", () => {
  const createRouteButtonBlock = ordersPageSource.match(
    /const createRouteButtonStyle = \{[\s\S]*?\n\};/,
  )?.[0];

  assert.ok(createRouteButtonBlock);
  assert.doesNotMatch(createRouteButtonBlock, /\bborder:\s*["']/);
  assert.match(createRouteButtonBlock, /borderColor:\s*"#303030"/);
  assert.match(createRouteButtonBlock, /borderStyle:\s*"solid"/);
  assert.match(createRouteButtonBlock, /borderWidth:\s*"1px"/);
});

test("Orders side card shows a compact route summary instead of a route-plan order list", () => {
  assert.match(ordersPageSource, /const routePlanPanelStyle = \{/);
  assert.match(ordersPageSource, /const DEFAULT_ROUTE_PLAN_TITLE = "CLEVER route draft"/);
  assert.match(ordersPageSource, /const \[routePlanTitle, setRoutePlanTitle\] = useState\(DEFAULT_ROUTE_PLAN_TITLE\)/);
  assert.match(ordersPageSource, /aria-label="Route plan title"/);
  assert.match(ordersPageSource, /placeholder="YYYY\.MM\.DD X요일"/);
  assert.match(ordersPageSource, /function buildRoutePlanTitleFromOrders\(orders\) \{/);
  assert.match(ordersPageSource, /`\$\{scopeLabel\} orders`/);
  assert.match(ordersPageSource, /const routePlanHeaderActionsStyle = \{/);
  assert.match(ordersPageSource, /const routeAssignActionsStyle = \{/);
  assert.match(ordersPageSource, /transition:\s*"max-height 180ms ease, opacity 140ms ease, margin-top 180ms ease"/);
  assert.match(ordersPageSource, /const routeReadinessValueStyle = \{/);
  assert.match(ordersPageSource, /const handleClearPlan = \(\) => \{/);
  assert.match(ordersPageSource, /setPlannedOrderIds\(\[\]\)/);
  assert.match(ordersPageSource, /setRouteAssignActionsOpen\(false\)/);
  assert.match(ordersPageSource, /setRouteAddModalOpen\(false\)/);
  assert.match(ordersPageSource, /const \[routeAssignActionsOpen, setRouteAssignActionsOpen\] = useState\(false\)/);
  assert.match(ordersPageSource, /const \[routeAddModalOpen, setRouteAddModalOpen\] = useState\(false\)/);
  assert.match(ordersPageSource, /const handleToggleRouteAssignActions = \(\) => \{/);
  assert.match(ordersPageSource, /const handleOpenAddRoutePreview = \(\) => \{/);
  assert.doesNotMatch(ordersPageSource, /plannedOrders\.map\(\(order, orderIndex\) =>/);
  assert.doesNotMatch(ordersPageSource, /aria-label=\{`Remove \${order\.name} from route plan`\}/);
  assert.doesNotMatch(ordersPageSource, />Remove<\/button>/);
  assert.match(ordersPageSource, /className="order-route-plan"[\s\S]*>Route plan<\/s-heading>[\s\S]*>Assign<\/button>[\s\S]*>Add to route<\/button>[\s\S]*>Create route<\/button>[\s\S]*>Order summary<\/s-heading>[\s\S]*>Clear<\/button>/);
  assert.match(ordersPageSource, /aria-expanded=\{routeAssignActionsOpen\}/);
  assert.match(ordersPageSource, />Assign<\/button>[\s\S]*>Add to route<\/button>[\s\S]*>Create route<\/button>/);
  assert.doesNotMatch(ordersPageSource, /aria-expanded=\{routeAssignActionsOpen\}[\s\S]{0,1200}aria-label="Route to add orders"/);
  assert.match(ordersPageSource, /aria-label="Add orders to route preview"[\s\S]*aria-label="Selected route snapshot"[\s\S]*>Add<\/button>/);
  assert.match(ordersPageSource, />Route plan<\/s-heading>[\s\S]*>Order summary<\/s-heading>/);
  assert.doesNotMatch(ordersPageSource, />Inventory<\/s-heading>[\s\S]*>Assign<\/button>/);
  assert.doesNotMatch(ordersPageSource, />Inventory plan<\/s-heading>/);
  assert.doesNotMatch(ordersPageSource, />Assign to inventory<\/button>/);
  assert.doesNotMatch(ordersPageSource, />Create<\/button>[\s\S]{0,80}disabled=\{true\}/);
  assert.match(ordersPageSource, />Clear<\/button>/);
  assert.doesNotMatch(ordersPageSource, /Plan에서 추가\/제거합니다/);
});

test("Orders route plan side panel does not carry per-order reorder UI", () => {
  assert.doesNotMatch(ordersPageSource, /function reorderOrderIds\(orderIds, sourceOrderId, targetOrderId\) \{/);
  assert.doesNotMatch(ordersPageSource, /activeDraggedPlanOrderId/);
  assert.doesNotMatch(ordersPageSource, /handlePlanOrderDragStart|handlePlanOrderDrop/);
  assert.doesNotMatch(ordersPageSource, /draggable=\{true\}/);
  assert.doesNotMatch(ordersPageSource, /style=\{routePlanDragHandleStyle\}/);
  assert.doesNotMatch(ordersPageSource, />⋮<\/span>/);
});

test("Orders route plan side panel keeps compact copy in a fixed scroll container", () => {
  assert.match(ordersPageSource, /const routePlanScrollAreaStyle = \{/);
  assert.match(ordersPageSource, /height: `\$\{ordersMapHeight\}px`/);
  assert.match(ordersPageSource, /maxHeight: `\$\{ordersMapHeight\}px`/);
  assert.match(ordersPageSource, /flexDirection:\s*"column"/);
  assert.match(ordersPageSource, /overflowY:\s*"auto"/);
  assert.match(ordersPageSource, /minHeight:\s*0/);
  assert.match(ordersPageSource, /overflow:\s*"visible"/);
  assert.match(ordersPageSource, /marginTop:\s*"auto"/);
  assert.match(ordersPageSource, /maxHeight:\s*"150px"/);
  assert.match(ordersPageSource, /style=\{routePlanScrollAreaStyle\}/);
  assert.match(ordersPageSource, />Order summary<\/s-heading>/);
  assert.doesNotMatch(ordersPageSource, /선택 → Add to plan/);
  assert.doesNotMatch(ordersPageSource, /체크박스로 주문을 선택한 뒤 Add to plan을 누르면 route plan에 담깁니다/);
  assert.doesNotMatch(ordersPageSource, /route plan에 추가된 주문을 여기서 빼거나 지도 위치를 확인합니다/);
  assert.doesNotMatch(ordersPageSource, /아직 plan에 추가된 주문이 없습니다/);
  assert.doesNotMatch(ordersPageSource, /Routes 화면에서 최적화, 배송원 배정, 일정 조율로 이어집니다/);
});

test("Orders route plan summary does not stretch into the empty panel height", () => {
  const scrollAreaBlock = ordersPageSource.match(
    /const routePlanScrollAreaStyle = \{[\s\S]*?\n\};/,
  )?.[0] ?? "";
  const summaryBlock = ordersPageSource.match(
    /const routeReadinessStyle = \{[\s\S]*?\n\};/,
  )?.[0] ?? "";

  assert.match(scrollAreaBlock, /alignContent:\s*"end"/);
  assert.match(scrollAreaBlock, /gridAutoRows:\s*"max-content"/);
  assert.match(scrollAreaBlock, /marginTop:\s*"auto"/);
  assert.match(scrollAreaBlock, /overflow:\s*"visible"/);
  assert.match(summaryBlock, /display:\s*"grid"/);
});

test("Orders route plan summary stays aggregate-only without per-order metadata", () => {
  assert.doesNotMatch(ordersPageSource, /\{orderIndex \+ 1\}\. \{order\.address\}/);
  assert.doesNotMatch(ordersPageSource, /className="route-plan-address-button"/);
  assert.doesNotMatch(ordersPageSource, /\{orderIndex \+ 1\}\. \{order\.name\} · \{order\.customer\}/);
  assert.doesNotMatch(ordersPageSource, /\{order\.status\} · \{order\.paymentStatus\}/);
  assert.doesNotMatch(ordersPageSource, /\{order\.deliveryArea \? ` · \$\{order\.deliveryArea\}` : ""\}/);
  assert.doesNotMatch(ordersPageSource, /\{order\.deliveryDay \? ` · \$\{order\.deliveryDay\}` : ""\}/);
});

test("Orders map highlights markers that were added to the plan", () => {
  assert.match(mapMarkersSource, /export const MAP_MARKER_PALETTE = \{/);
  assert.match(mapMarkersSource, /order: \{[\s\S]*color: "#006fbb"/);
  assert.match(mapMarkersSource, /plannedOrder: \{[\s\S]*color: "#006fbb"/);
  assert.match(mapMarkersSource, /function createPaletteMapPinImageData\(markerType, options = \{\}\) \{/);
  assert.match(mapMarkersSource, /const paletteEntry = MAP_MARKER_PALETTE\[markerType\]/);
  assert.match(ordersPageSource, /createPaletteMapPinImageData\("order"\)/);
  assert.match(ordersPageSource, /createPaletteMapPinImageData\("plannedOrder", \{/);
  assert.doesNotMatch(ordersPageSource, /MAP_MARKER_PALETTE\.order\.color|MAP_MARKER_PALETTE\.plannedOrder\.color/);
  assert.match(ordersPageSource, /const ORDER_PIN_IMAGE_ID = "orders-map-pin"/);
  assert.match(ordersPageSource, /const ORDER_PIN_PLANNED_IMAGE_ID = "orders-map-pin-planned"/);
  assert.match(ordersPageSource, /function getPlannedOrderPinImageId\(plannedIndex\) \{/);
  assert.match(ordersPageSource, /id: getPlannedOrderPinImageId\(plannedIndex\)/);
  assert.match(ordersPageSource, /label: plannedIndex/);
  assert.match(mapMarkersSource, /function addMapPinImage\(map, imageId, imageData\) \{/);
  assert.match(mapMarkersSource, /map\.addImage\(imageId, imageData, \{ pixelRatio: MAP_PIN_PIXEL_RATIO \}\)/);
  assert.match(ordersPageSource, /addMapPinImage\(map, image\.id, image\.imageData\)/);
  assert.match(ordersPageSource, /function buildOrdersMapFeatureCollection\(orders, plannedOrderIds, focusedOrderId = null\) \{/);
  assert.match(ordersPageSource, /const plannedIndex = plannedIndexByOrderId\.get\(order\.id\) \?\? 0/);
  assert.match(ordersPageSource, /pinImage: isPlanned \? getPlannedOrderPinImageId\(plannedIndex\) : ORDER_PIN_IMAGE_ID/);
  assert.match(ordersPageSource, /const isPlanned = plannedIndex > 0/);
  assert.match(mapMarkersSource, /"icon-image": iconImage/);
  assert.doesNotMatch(ordersPageSource, /"text-field": \["get", "plannedLabel"\]/);
  assert.doesNotMatch(ordersPageSource, /function createOrderMarkerElement\(order, plannedIndex\)/);
});

test("Orders map popup uses a left-center overlay and can add the order to the route plan", () => {
  assert.match(ordersPageSource, /const \[activeOrderPopupId, setActiveOrderPopupId\] = useState\(null\)/);
  assert.match(ordersPageSource, /const activeOrderPopupItems = activeOrderPopup \? getOrderLineItems\(activeOrderPopup\) : \[\]/);
  assert.match(ordersPageSource, /className="order-marker-popup order-map-focus-popup"/);
  assert.match(ordersPageSource, /role="dialog"/);
  assert.match(ordersPageSource, /className="order-marker-popup__close"/);
  assert.match(ordersPageSource, /activeOrderPopupItems\.map\(\(item, itemIndex\) =>/);
  assert.match(ordersPageSource, /×\{item\.quantity\}/);
  assert.match(ordersPageSource, /disabled=\{activeOrderPopupPlannedIndex > 0\}/);
  assert.match(ordersPageSource, /handleAddOrderToPlan\(activeOrderPopup\.id\)/);
  assert.match(ordersPageSource, /const activeOrderPopupShopifyUrl = activeOrderPopup \? getShopifyAdminOrderUrl\(activeOrderPopup\) : null/);
  assert.match(ordersPageSource, /href=\{activeOrderPopupShopifyUrl\}/);
  assert.match(ordersPageSource, /target="_blank"/);
  assert.match(ordersPageSource, /rel="noopener noreferrer"/);
  assert.match(ordersPageSource, />View in Shopify<\/a>/);
  assert.match(ordersPageSource, /onClick=\{\(\) => setActiveOrderPopup\(null\)\}/);
  assert.match(ordersPageSource, /const handleUserMapMoveStart = \(event\) => \{/);
  assert.match(ordersPageSource, /if \(!event\?\.originalEvent\) return/);
  assert.match(ordersPageSource, /setActiveOrderPopup\(null\)/);
  assert.match(ordersPageSource, /map\.on\("movestart", handleUserMapMoveStart\)/);
  assert.match(ordersPageSource, /map\.off\("movestart", handleUserMapMoveStart\)/);
  assert.match(mapPanelSource, /children,/);
  assert.match(mapPanelSource, /\{children\}/);
  assert.match(globalCssSource, /\.order-map-focus-popup\s*\{/);
  assert.match(globalCssSource, /left:\s*16px/);
  assert.match(globalCssSource, /top:\s*16px/);
  assert.match(globalCssSource, /max-width:\s*260px/);
  assert.match(globalCssSource, /min-width:\s*200px/);
  assert.match(globalCssSource, /width:\s*min\(260px, calc\(100% - 96px\)\)/);
  assert.match(globalCssSource, /font-size:\s*12px/);
  assert.match(globalCssSource, /\.order-map-focus-popup\s*\{[\s\S]*z-index:\s*6000/);
  assert.match(globalCssSource, /\.order-marker-popup__actions\s*\{/);
  assert.match(globalCssSource, /\.order-marker-popup__items\s*\{/);
  assert.match(globalCssSource, /max-height:\s*160px/);
  assert.match(globalCssSource, /background:\s*rgba\(0, 0, 0, 0\.05\)/);
  assert.match(globalCssSource, /color:\s*#303030/);
  assert.doesNotMatch(ordersPageSource, /new map(?:LibraryRef\.current|libregl)\.Popup/);
});

test("Orders map popup content stays above all map markers", () => {
  assert.match(ordersPageSource, /map\.addLayer\(createMapPinSymbolLayer\(\{\s+id: ORDERS_MAP_ORDER_LAYER_ID/);
  assert.match(mapMarkersSource, /type: "symbol"/);
  assert.match(mapMarkersSource, /"symbol-sort-key": sortKey/);
  assert.match(mapMarkersSource, /markerElement\.style\.zIndex = options\.zIndex \?\? "3000"/);
  assert.match(globalCssSource, /\.maplibregl-popup\s*\{/);
  assert.match(globalCssSource, /z-index:\s*5000/);
  assert.match(globalCssSource, /\.maplibregl-map \.maplibregl-cooperative-gesture-screen\s*\{[\s\S]*display:\s*none !important/);
});

test("Orders map has a compact refresh control for recovering failed tile loads", () => {
  assert.match(ordersPageSource, /const \[mapRenderKey, setMapRenderKey\] = useState\(0\)/);
  assert.match(ordersPageSource, /const mapLoadedRef = useRef\(false\)/);
  assert.match(ordersPageSource, /const handleRefreshMap = \(\) => \{/);
  assert.match(ordersPageSource, /setIsMapReady\(false\)/);
  assert.match(ordersPageSource, /setMapStatus\("idle"\)/);
  assert.match(ordersPageSource, /setMapRenderKey\(\(currentRenderKey\) => currentRenderKey \+ 1\)/);
  assert.match(ordersPageSource, /\}, \[activeOrdersView, clearMapSourceSyncRetryTimer, mapRenderKey, requestMapSourceSync, scheduleMapRecovery\]\)/);
  assert.match(ordersPageSource, /canvasKey=\{mapRenderKey\}/);
  assert.match(ordersPageSource, /ariaLabel: "Refresh map"/);
  assert.match(ordersPageSource, /import \{ MapPanel, MapResizeHandle, MapToolbar, renderMapFitIcon, renderMapRefreshIcon, renderMapWidthIcon, renderMapZoomInIcon, renderMapZoomOutIcon \} from "(?:\.\.\/ui|\.\.\/\.\.\/ui)\/map-panel"/);
  assert.match(ordersPageSource, /<MapPanel/);
  assert.match(ordersPageSource, /<MapToolbar/);
  assert.match(mapPanelSource, /flexDirection: "column"/);
  assert.match(mapPanelSource, /right: `\$\{MAPLIBRE_CONTROL_OFFSET_PX\}px`/);
  assert.match(mapPanelSource, /MAPLIBRE_CONTROL_OFFSET_PX = 12/);
  assert.match(mapPanelSource, /MAPLIBRE_CONTROL_SIZE_PX = 30/);
  assert.match(mapPanelSource, /MAPLIBRE_CONTROL_BORDER_WIDTH_PX = 2/);
  assert.match(mapPanelSource, /const toolbarGroups = \[actions\.slice\(0, 2\), actions\.slice\(2, 4\), actions\.slice\(4\)\]/);
  assert.match(mapPanelSource, /MAP_TOOLBAR_BORDER_COLOR = "#8a8a8a"/);
  assert.match(mapPanelSource, /MAP_TOOLBAR_DIVIDER_COLOR = MAP_TOOLBAR_BORDER_COLOR/);
  assert.match(mapPanelSource, /border: `\$\{MAPLIBRE_CONTROL_BORDER_WIDTH_PX\}px solid \$\{MAP_TOOLBAR_BORDER_COLOR\}`/);
  assert.match(mapPanelSource, /borderTop: `\$\{MAPLIBRE_CONTROL_BORDER_WIDTH_PX\}px solid \$\{MAP_TOOLBAR_DIVIDER_COLOR\}`/);
  assert.match(mapPanelSource, /top: `\$\{MAPLIBRE_CONTROL_OFFSET_PX\}px`/);
  assert.match(mapPanelSource, /MAP_WHEEL_HINT_TEXT = "Hold Ctrl or ⌘ while scrolling to zoom the map\."/);
  assert.match(mapPanelSource, /background: "rgba\(0, 0, 0, 0\.38\)"/);
  assert.match(mapPanelSource, /wheelHintEnabled = true/);
  assert.match(mapPanelSource, /if \(!wheelHintEnabled \|\| !mapCanvasElement\) \{/);
  assert.match(mapPanelSource, /opacity: wheelHintEnabled && wheelHintVisible \? 1 : 0/);
  assert.match(mapPanelSource, /transition: wheelHintEnabled && wheelHintVisible \? "opacity 80ms ease-out" : "opacity 260ms ease-in"/);
  assert.match(mapPanelSource, /addEventListener\("wheel", handleMapWheel, \{ capture: true, passive: true \}\)/);
  assert.match(mapPanelSource, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(ordersPageSource, /renderMapZoomInIcon\(\)/);
  assert.match(ordersPageSource, /renderMapZoomOutIcon\(\)/);
  assert.doesNotMatch(ordersPageSource, /NavigationControl/);
  assert.match(ordersPageSource, /ariaLabel: "Fit highlighted map markers"/);
  assert.match(ordersPageSource, /onClick: handleZoomToPlanned/);
  assert.doesNotMatch(ordersPageSource, /aria-hidden="true">↻<\/span>/);
  assert.match(ordersPageSource, /onClick: handleRefreshMap/);
  assert.doesNotMatch(ordersPageSource, />Re-render map<\/button>/);
});

test("Orders map has a compact width toggle that is not browser fullscreen", () => {
  assert.match(ordersPageSource, /const \[isMapWide, setIsMapWide\] = useState\(false\)/);
  assert.match(ordersPageSource, /const handleToggleMapWide = \(\) => \{/);
  assert.match(ordersPageSource, /setIsMapWide\(\(currentIsMapWide\) => !currentIsMapWide\)/);
  assert.match(ordersPageSource, /primaryExpanded=\{isMapWide\}/);
  assert.match(ordersPageSource, /ariaLabel: isMapWide \? "Restore map width" : "Expand map width"/);
  assert.match(ordersPageSource, /renderMapWidthIcon\(isMapWide\)/);
  assert.match(mapPanelSource, /<path d="m3 6 4 4-4 4" \/>/);
  assert.match(mapPanelSource, /<path d="m17 6-4 4 4 4" \/>/);
  assert.doesNotMatch(mapPanelSource, /<path d="m4 7 3 3-3 3" \/>/);
  assert.doesNotMatch(mapPanelSource, /<path d="m16 7-3 3 3 3" \/>/);
  assert.doesNotMatch(mapPanelSource, /<path d="m6 7 3 3-3 3" \/>/);
  assert.doesNotMatch(mapPanelSource, /<path d="m14 7-3 3 3 3" \/>/);
  assert.doesNotMatch(mapPanelSource, /<rect /);
  assert.doesNotMatch(mapPanelSource, /<path d="M3 10h14" \/>/);
  assert.doesNotMatch(mapPanelSource, /<path d="M3 10h6" \/>/);
  assert.doesNotMatch(mapPanelSource, /<path d="M17 10h-6" \/>/);
  assert.doesNotMatch(ordersPageSource, /isMapWide \? "⤡" : "⤢"/);
  assert.match(ordersPageSource, /onClick: handleToggleMapWide/);
  assert.match(ordersPageSource, /mapRef\.current\?\.resize\(\)/);
  assert.doesNotMatch(ordersPageSource, /requestFullscreen|webkitRequestFullscreen|mozRequestFullScreen|msRequestFullscreen/);
});

test("Orders map resize waits for layout to settle before resizing MapLibre", () => {
  assert.match(ordersPageSource, /const firstResizeFrame = window\.requestAnimationFrame/);
  assert.match(ordersPageSource, /secondResizeFrame = window\.requestAnimationFrame/);
  assert.match(ordersPageSource, /mapRef\.current\?\.resize\(\)/);
  assert.match(ordersPageSource, /window\.cancelAnimationFrame\(firstResizeFrame\)/);
  assert.match(ordersPageSource, /window\.cancelAnimationFrame\(secondResizeFrame\)/);
});

test("Orders map captures MapLibre tile errors without long visible copy", () => {
  assert.match(ordersPageSource, /const \[mapStatus, setMapStatus\] = useState\("idle"\)/);
  assert.match(ordersPageSource, /const mapRecoveryTimerRef = useRef\(null\)/);
  assert.match(ordersPageSource, /const mapRecoveryAttemptsRef = useRef\(0\)/);
  assert.match(ordersPageSource, /const mapSourceSyncRetryTimerRef = useRef\(null\)/);
  assert.match(ordersPageSource, /const mapSourceSyncRetryAttemptsRef = useRef\(0\)/);
  assert.match(ordersPageSource, /const mapSourceSyncPendingRef = useRef\(false\)/);
  assert.match(ordersPageSource, /const \[mapSourceSyncRequest, setMapSourceSyncRequest\] = useState\(0\)/);
  assert.match(ordersPageSource, /const scheduleMapRecovery = useCallback\(\(\) => \{/);
  assert.match(ordersPageSource, /const requestMapSourceSync = useCallback\(\(trigger\) => \{/);
  assert.match(ordersPageSource, /const scheduleMapSourceSyncRetry = useCallback\(\(\) => \{/);
  assert.match(ordersPageSource, /MAX_MAP_RECOVERY_ATTEMPTS/);
  assert.match(ordersPageSource, /MAP_RECOVERY_DELAY_MS/);
  assert.match(ordersPageSource, /MAX_MAP_SOURCE_SYNC_RETRY_ATTEMPTS/);
  assert.match(ordersPageSource, /MAP_SOURCE_SYNC_RETRY_DELAY_MS/);
  assert.match(ordersPageSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(ordersPageSource, /setMapRenderKey\(\(currentRenderKey\) => currentRenderKey \+ 1\)/);
  assert.match(ordersPageSource, /setMapSourceSyncRequest\(\(requestCount\) => requestCount \+ 1\)/);
  assert.match(ordersPageSource, /name: "orders\.maplibre\.source_retry"/);
  assert.match(ordersPageSource, /window\.__cleverOrdersMap = map/);
  assert.match(ordersPageSource, /delete window\.__cleverOrdersMap/);
  assert.match(ordersPageSource, /import \{ installMissingMapImageFallback \} from "(?:\.\.\/features\/maps|\.\.\/maps)\/maplibre-missing-images"/);
  assert.match(ordersPageSource, /installMissingMapImageFallback\(map\)/);
  assert.match(ordersPageSource, /map\.on\("styledata", handleSourceSyncEvent\)/);
  assert.match(ordersPageSource, /map\.on\("sourcedata", handleSourceSyncEvent\)/);
  assert.match(ordersPageSource, /map\.on\("idle", handleSourceSyncEvent\)/);
  assert.match(ordersPageSource, /map\.on\("error", \(event\) => \{/);
  assert.match(ordersPageSource, /if \(!isMounted \|\| mapRef\.current !== map\) return/);
  assert.match(ordersPageSource, /if \(mapLoadedRef\.current\) return/);
  assert.match(ordersPageSource, /tiles\.openfreemap\.org/);
  assert.match(ordersPageSource, /AJAXError/);
  assert.match(ordersPageSource, /setMapStatus\("recovering"\)/);
  assert.match(ordersPageSource, /setMapStatus\("failed"\)/);
  assert.match(ordersPageSource, /statusLabel=\{\s*mapStatus !== "idle"/s);
  assert.doesNotMatch(ordersPageSource, /지도 타일을 불러오지 못했습니다/);
});

test("Orders map zooms to fit the route plan when either Add to map action registers orders", () => {
  const markerPopupAddBlock = ordersPageSource.match(
    /const handleAddOrderToPlan = useCallback\(\(orderId\) => \{[\s\S]*?\n {2}\}, \[[^\]]+\]\);/,
  )?.[0] ?? "";
  const tableAddBlock = ordersPageSource.match(
    /const handleAddToPlan = \(\) => \{[\s\S]*?\n {2}\};/,
  )?.[0] ?? "";

  assert.match(ordersPageSource, /const \[planFitRequest, setPlanFitRequest\] = useState\(0\)/);
  assert.match(ordersPageSource, /const plannedLocatedOrders = useMemo\(\(\) =>/);
  assert.match(ordersPageSource, /plannedOrders\.filter\(\(order\) => order\.hasCoordinates\)/);
  assert.match(ordersPageSource, /const fitMapToOrders = useCallback\(\(ordersToFit\) => \{/);
  assert.match(ordersPageSource, /new maplibregl\.LngLatBounds\(/);
  assert.match(ordersPageSource, /mapRef\.current\.fitBounds\(bounds,/);
  assert.match(markerPopupAddBlock, /setPlanFitRequest\(\(requestCount\) => requestCount \+ 1\)/);
  assert.match(tableAddBlock, /setPlanFitRequest\(\(requestCount\) => requestCount \+ 1\)/);
  assert.match(ordersPageSource, /if \(planFitRequest === 0\) return/);
  assert.match(ordersPageSource, /const routeFitLocations = useMemo\(\s*\(\) =>/);
  assert.match(ordersPageSource, /departureLocation\?\.hasCoordinates/);
  assert.match(ordersPageSource, /fitMapToOrders\(routeFitLocations\)/);
});

test("Orders map shows the Shopify departure location as the route start point", () => {
  assert.match(ordersPageSource, /const \{ orders, ordersLoaded, inventories, routeGroups, errors, departureLocation/);
  assert.match(ordersPageSource, /import \{ createDepartureMarkerElement \} from "(?:\.\.\/features\/maps|\.\.\/maps)\/map-markers"/);
  assert.match(ordersPageSource, /import \{ addMapPinImage, createMapPinSymbolLayer, createPaletteMapPinImageData \} from "(?:\.\.\/features\/maps|\.\.\/maps)\/map-markers"/);
  assert.match(mapMarkersSource, /function createDepartureMarkerElement\(departureLocation, options = \{\}\)/);
  assert.match(mapMarkersSource, /function createDepartureMarkerIconElement\(\)/);
  assert.match(mapMarkersSource, /departure-map-marker/);
  assert.match(mapMarkersSource, /departure-map-marker__icon/);
  assert.match(mapMarkersSource, /markerPinElement\.append\(createDepartureMarkerIconElement\(\)\)/);
  assert.doesNotMatch(ordersPageSource, /markerPinElement\.textContent = "Start"/);
  assert.match(mapMarkersSource, /markerElement\.style\.zIndex = options\.zIndex \?\? "3000"/);
  assert.match(ordersPageSource, /departureLocation\?\.hasCoordinates \? departureLocation\.coordinates : DEFAULT_CENTER/);
  assert.match(ordersPageSource, /new maplibregl\.Marker\(\{ element: departureMarkerElement, anchor: "bottom" \}\)/);
  assert.match(ordersPageSource, /\.setLngLat\(departureLocation\.coordinates\)/);
  assert.match(mapMarkersSource, /markerElement\.setAttribute\("aria-label", `Route start: \$\{departureLocation\.name\}`\)/);
  assert.match(globalCssSource, /\.departure-map-marker\s*\{/);
  assert.match(globalCssSource, /\.departure-map-marker__pin\s*\{/);
  assert.match(globalCssSource, /\.departure-map-marker__icon\s*\{/);
});

test("Orders map initially centers on the departure home with a wide zoom", () => {
  assert.match(ordersPageSource, /const INITIAL_HOME_ZOOM = 10/);
  assert.match(ordersPageSource, /const \[selectedOrderFocusRequest, setSelectedOrderFocusRequest\] = useState\(0\)/);
  assert.match(ordersPageSource, /const initialMapCenter = useMemo\(/);
  assert.match(ordersPageSource, /const initialMapCenterRef = useRef\(DEFAULT_CENTER\)/);
  assert.match(ordersPageSource, /initialMapCenterRef\.current = initialMapCenter/);
  assert.match(ordersPageSource, /departureLocation\?\.hasCoordinates \? departureLocation\.coordinates : DEFAULT_CENTER/);
  assert.match(ordersPageSource, /center: initialMapCenterRef\.current/);
  assert.match(ordersPageSource, /zoom: INITIAL_HOME_ZOOM/);
  assert.doesNotMatch(ordersPageSource, /\}, \[initialMapCenter, activeOrdersView, mapRenderKey, scheduleMapRecovery\]\);/);
  assert.match(ordersPageSource, /\}, \[activeOrdersView, clearMapSourceSyncRetryTimer, mapRenderKey, requestMapSourceSync, scheduleMapRecovery\]\);/);
  assert.match(ordersPageSource, /const initialMapFitAppliedRef = useRef\(false\)/);
  assert.match(ordersPageSource, /initialMapFitAppliedRef\.current = false/);
  assert.match(ordersPageSource, /mapRef\.current\.flyTo\(\{\s*center: initialMapCenter,\s*zoom: INITIAL_HOME_ZOOM,\s*essential: true,\s*\}\)/);
  assert.doesNotMatch(ordersPageSource, /const firstLocatedOrder = useMemo/);
  assert.doesNotMatch(ordersPageSource, /fitMapToOrders\(initialMapFitLocations\)/);
  assert.match(ordersPageSource, /const setActiveOrderPopup = useCallback\(\(orderId\) => \{/);
  assert.match(ordersPageSource, /const handleSelectOrder = useCallback\(\(orderId, options = \{\}\) => \{/);
  assert.match(ordersPageSource, /syncOrdersMapMarkerLayer\(mapRef\.current, locatedOrders, plannedOrderIds, orderId\)/);
  assert.match(ordersPageSource, /if \(options\.focusMap !== false\)/);
  assert.match(ordersPageSource, /selectedOrderFocusRequest === 0/);
  assert.match(ordersPageSource, /mapRef\.current\.jumpTo\(\{\s*center: selectedOrder\.coordinates,\s*zoom: 11,\s*\}\)/);
  assert.match(ordersPageSource, /onClick=\{\(\) => handleSelectOrder\(order\.id\)\}/);
  assert.match(ordersPageSource, /handleSelectOrder\(order\.id, \{ focusMap: false \}\)/);
});

test("Orders marker click only nudges zoom when the map is farther out than city level", () => {
  assert.match(ordersPageSource, /const MARKER_CLICK_ZOOM_OUT_THRESHOLD = 8/);
  assert.match(ordersPageSource, /const MARKER_CLICK_TARGET_ZOOM = 10/);
  assert.match(ordersPageSource, /map\.on\("click", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerClick\)/);
  assert.match(ordersPageSource, /const markerClickZoom = map\.getZoom\?\.\(\)/);
  assert.match(ordersPageSource, /markerClickZoom < MARKER_CLICK_ZOOM_OUT_THRESHOLD/);
  assert.match(ordersPageSource, /zoom: MARKER_CLICK_TARGET_ZOOM/);
  assert.match(ordersPageSource, /handleSelectOrder\(order\.id, \{ focusMap: false \}\)/);
});

test("Orders map renders planned markers above overlapping unplanned markers", () => {
  assert.match(ordersPageSource, /sortKey: isPlanned \? 1000 - plannedIndex : 1/);
  assert.match(mapMarkersSource, /"symbol-sort-key": sortKey/);
  assert.match(mapMarkersSource, /"icon-allow-overlap": true/);
  assert.match(mapMarkersSource, /"icon-ignore-placement": true/);
  assert.doesNotMatch(ordersPageSource, /ORDERS_MAP_ORDER_TEXT_LAYER_ID/);
  assert.doesNotMatch(ordersPageSource, /sortedLocatedOrders/);
});

test("Orders map keeps planned pins two display steps larger and centers the planned number", () => {
  assert.match(mapMarkersSource, /export const MAP_PIN_PIXEL_RATIO = 2/);
  assert.match(mapMarkersSource, /const width = \(options\.width \?\? 40\) \* pixelRatio/);
  assert.match(mapMarkersSource, /const height = \(options\.height \?\? 52\) \* pixelRatio/);
  assert.match(mapMarkersSource, /export const MAP_PIN_ICON_SIZE = 0\.66/);
  assert.match(mapMarkersSource, /"icon-size": MAP_PIN_ICON_SIZE/);
  assert.match(mapMarkersSource, /function createMapPinSymbolLayer\(\{ id, source, iconImage/);
  assert.match(ordersPageSource, /createMapPinSymbolLayer\(\{\s+id: ORDERS_MAP_ORDER_LAYER_ID,\s+source: ORDERS_MAP_SOURCE_ID,\s+\}\)/);
  assert.doesNotMatch(mapMarkersSource, /minzoom/);
  assert.doesNotMatch(ordersPageSource, /"icon-size": \[\s+"case"/);
  assert.match(mapMarkersSource, /context\.fillText\(String\(options\.label\), 20, 18\)/);
  assert.doesNotMatch(ordersPageSource, /"text-size": 9\.5/);

  const plannedMarkerBlock = globalCssSource.match(/\.order-map-marker--planned \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(plannedMarkerBlock, /--marker-color: #006fbb/);
  assert.doesNotMatch(plannedMarkerBlock, /--marker-height|--marker-width|--marker-label-size|--marker-label-top|font-size/);
});

test("Orders table headers sort rows by ascending and descending values", () => {
  assert.match(ordersPageSource, /const SORTABLE_ORDER_COLUMNS = \[/);
  assert.match(
    ordersPageSource,
    /const \[sortConfig, setSortConfig\] = useState\(\{\s*key: "name",\s*direction: "descending",\s*\}\)/,
  );
  assert.match(ordersPageSource, /const \[tableColumnWidths, setTableColumnWidths\] = useState\(DEFAULT_TABLE_COLUMN_WIDTHS\)/);
  assert.match(ordersPageSource, /const tableRef = useRef\(null\)/);
  assert.match(ordersPageSource, /const sortedOrders = useMemo\(\(\) =>/);
  assert.match(ordersPageSource, /if \(!sortConfig\) return sortOrdersByDeliveryDatePriority\(filteredOrders\)/);
  assert.match(ordersPageSource, /sortConfig\.key === "deliveryLabel"/);
  assert.match(ordersPageSource, /if \(columnKey === "deliveryLabel"\) \{/);
  assert.match(ordersPageSource, /return getOrderDeliveryDateValue\(order\) \|\| order\.deliveryLabel \|\| ""/);
  assert.match(ordersPageSource, /if \(columnKey === "payment"\) \{/);
  assert.match(ordersPageSource, /return formatOrderPaymentState\(order\)/);
  assert.match(ordersPageSource, /const tableOrders = sortedOrders/);
  assert.match(ordersPageSource, /handleSort\(column\.key\)/);
  assert.match(ordersPageSource, /return \{ key: columnKey, direction: "ascending" \}/);
  assert.match(ordersPageSource, /return \{ key: columnKey, direction: "descending" \}/);
  assert.match(ordersPageSource, /return null/);
  assert.match(ordersPageSource, /const \[lockedTableWidth, setLockedTableWidth\] = useState\(null\)/);
  assert.match(ordersPageSource, /const tableWidth = lockedTableWidth \? `max\(100%, \$\{lockedTableWidth\}px\)` : "100%"/);
  assert.match(ordersPageSource, /const handleColumnResizeStart = \(columnIndex, event\) => \{/);
  assert.match(ordersPageSource, /function getTableColumnPixelState\(tableElement\) \{/);
  assert.match(ordersPageSource, /const roundingDiff = tableWidth - widths\.reduce/);
  assert.match(ordersPageSource, /setLockedTableWidth\(measuredTableWidth\)/);
  assert.match(ordersPageSource, /const rightColumnIndex = columnIndex \+ 1/);
  assert.match(ordersPageSource, /const delta = Math\.min\(Math\.max\(rawDelta, minDelta\), maxDelta\)/);
  assert.match(ordersPageSource, /widthIndex === rightColumnIndex\) return rightStartWidth - delta/);
  assert.match(ordersPageSource, /style=\{\{ \.\.\.tableStyle, width: tableWidth \}\}/);
  assert.match(ordersPageSource, /querySelectorAll\("thead th"\)/);
  assert.match(ordersPageSource, /const columnResizeHandleLineStyle = \{/);
  assert.match(ordersPageSource, /background:\s*"#c9c9c9"/);
  assert.match(ordersPageSource, /right:\s*"0"/);
  assert.doesNotMatch(ordersPageSource, /right:\s*"-4px"/);
  assert.match(ordersPageSource, /<span style=\{columnResizeHandleLineStyle\} \/>/);
  assert.match(ordersPageSource, /columnIndex < SORTABLE_ORDER_COLUMNS\.length - 1/);
  assert.match(ordersPageSource, /key=\{columnIndex\}/);
  assert.match(ordersPageSource, /onPointerDown=\{\(event\) => handleColumnResizeStart\(columnIndex \+ 1 \+ \(columnIndex > 0 \? 1 : 0\), event\)\}/);
  assert.match(ordersPageSource, /function getTableColumnFitWidth\(tableElement, columnIndex\) \{/);
  assert.match(ordersPageSource, /querySelectorAll\(\s*`thead th:nth-child/);
  assert.match(ordersPageSource, /const handleColumnAutoFit = \(columnIndex, event\) => \{/);
  assert.match(ordersPageSource, /getTableColumnFitWidth\(tableElement, columnIndex\) - leftStartWidth/);
  assert.match(ordersPageSource, /const clone = cell\.cloneNode\(true\)/);
  assert.match(ordersPageSource, /width:\s*"max-content"/);
  assert.match(ordersPageSource, /clone\.querySelectorAll\("\*"\)\.forEach/);
  assert.match(ordersPageSource, /clone\.getBoundingClientRect\(\)\.width/);
  assert.doesNotMatch(ordersPageSource, /cell\.scrollWidth/);
  assert.match(ordersPageSource, /onDoubleClick=\{\(event\) => handleColumnAutoFit\(columnIndex \+ 1 \+ \(columnIndex > 0 \? 1 : 0\), event\)\}/);
  assert.doesNotMatch(ordersPageSource, /handleColumnResizeStart\(0, event\)/);
  assert.match(ordersPageSource, /const tableHeaderButtonStyle = \{[\s\S]*?padding:\s*0/);
  assert.match(ordersPageSource, /const orderNumberButtonStyle = \{[\s\S]*?padding:\s*0/);
  assert.match(globalCssSource, /\.info-pill \{[\s\S]*?justify-content: center/);
  assert.match(globalCssSource, /\.info-pill \{[\s\S]*?box-sizing: border-box/);
  assert.match(ordersPageSource, /aria-sort=\{/);
  assert.match(ordersPageSource, /tableOrders\.map\(\(order\) =>/);
  assert.doesNotMatch(ordersPageSource, /safeOrders\.map\(\(order\) =>\s*\(\s*<tr/);
});

test("Orders page filters table rows by order date, delivery date, delivery day, type, and area", () => {
  assert.match(ordersPageSource, /import \{ Await, useFetcher, useLoaderData, useNavigate, useNavigation, useRevalidator, useSearchParams \} from "react-router"/);
  assert.match(ordersPageSource, /import \{[\s\S]*filterOrders[\s\S]*getOrderFilterOptions[\s\S]*getOrderFiltersFromSearchParams[\s\S]*ORDER_HISTORY_SCOPE[\s\S]*ORDER_PLANNING_SCOPE[\s\S]*ORDER_WEEKDAY_OPTIONS[\s\S]*updateOrderFilterSearchParams[\s\S]*\} from "(?:\.\.\/features\/orders|\.)\/order-filters"/);
  assert.match(ordersPageSource, /const \[searchParams, setSearchParams\] = useSearchParams\(\)/);
  assert.match(ordersPageSource, /const \[optimisticOrderFilters, setOptimisticOrderFilters\] = useState\(null\)/);
  assert.match(ordersPageSource, /const urlOrderFilters = useMemo\(\s*\(\) => getOrderFiltersFromSearchParams\(searchParams\),\s*\[searchParams\],\s*\)/);
  assert.match(ordersPageSource, /const orderFilters = optimisticOrderFilters \?\? urlOrderFilters/);
  assert.match(ordersPageSource, /setOptimisticOrderFilters\(null\);\s*\}, \[searchParams\]\)/);
  assert.match(ordersPageSource, /const \{ orders, ordersLoaded, inventories, routeGroups, errors, departureLocation, featureFlags, freshness, needsSessionTokenRefresh, perf, shopLocalDate \} = displayLoaderData/);
  assert.match(ordersPageSource, /const orderFilterReferenceDate = useMemo\(\s*\(\) => shopLocalDate \?\? new Date\(\),\s*\[shopLocalDate\],\s*\)/);
  assert.match(ordersPageSource, /const effectiveOrderFilters = useMemo\([\s\S]*ORDER_HISTORY_SCOPE[\s\S]*: orderFilters,[\s\S]*\[activeOrderFilters, orderFilters\]/);
  assert.match(ordersPageSource, /const orderFilterOptionOrders = useMemo\(\s*\(\) =>\s*activeOrderFilters\s*\? filterOrders\(displayOrders, \{[\s\S]*?\.\.\.effectiveOrderFilters,[\s\S]*?deliveryArea: "",[\s\S]*?deliveryWeekday: "",[\s\S]*?orderedDateFrom: "",[\s\S]*?orderedDateTo: "",[\s\S]*?serviceType: "",[\s\S]*?referenceDate: orderFilterReferenceDate,[\s\S]*?\}\)\s*: displayOrders,\s*\[activeOrderFilters, displayOrders, effectiveOrderFilters, orderFilterReferenceDate\],\s*\)/);
  assert.match(ordersPageSource, /deliveryAreas: getOrderFilterOptions\(filterOrders\(orderFilterOptionOrders, \{[\s\S]*?deliveryArea: ""/);
  assert.match(ordersPageSource, /deliveryDates: getOrderDeliveryDateFilterOptions\(filterOrders\(orderFilterOptionOrders, \{[\s\S]*?deliveryDate: ""/);
  assert.match(ordersPageSource, /deliveryWeekdays: getOrderFilterOptions\(filterOrders\(orderFilterOptionOrders, \{[\s\S]*?deliveryWeekday: ""/);
  assert.match(ordersPageSource, /serviceTypes: getOrderFilterOptions\(filterOrders\(orderFilterOptionOrders, \{[\s\S]*?serviceType: ""/);
  assert.match(ordersPageSource, /const appliedOrdersPageFilterKeyRef = useRef\(resourceFilterKey\)/);
  assert.match(ordersPageSource, /appliedOrdersPageFilterKeyRef\.current = resourceFilterKey/);
  assert.match(ordersPageSource, /const filteredOrders = useMemo\(\s*\(\) =>\s*paginationEnabled &&\s*\(\s*ordersResourceTransitionPending \|\|\s*appliedOrdersPageFilterKeyRef\.current !== resourceFilterKey\s*\)\s*\?\s*displayOrders\s*:\s*activeOrderFilters\s*\? filterOrders\(displayOrders, \{[\s\S]*?\.\.\.effectiveOrderFilters,[\s\S]*?referenceDate: orderFilterReferenceDate,[\s\S]*?\}\)\s*: displayOrders,\s*\[activeOrderFilters, displayOrders, effectiveOrderFilters, orderFilterReferenceDate, ordersResourceTransitionPending, paginationEnabled, resourceFilterKey\],\s*\)/);
  assert.match(ordersPageSource, /getOrderSortValue\(leftOrder, sortConfig\.key, orderFilterReferenceDate\)/);
  assert.match(ordersPageSource, /const sortedOrders = useMemo\(\(\) => \{\s*if \(!sortConfig\) return sortOrdersByDeliveryDatePriority\(filteredOrders\)/);
  assert.match(ordersPageSource, /aria-label="Filter orders by ordered date"/);
  assert.match(ordersPageSource, /const orderedDateFieldRef = useRef\(null\)/);
  assert.match(ordersPageSource, /const rect = orderedDateFieldRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(ordersPageSource, /if \(orderedDateFieldRef\.current\?\.contains\(event\.target\)\) return/);
  assert.match(ordersPageSource, /<div ref=\{orderedDateFieldRef\} style=\{orderFilterDateFieldStyle\}>/);
  assert.match(ordersPageSource, /style=\{orderedDateFilterActive \? orderFilterDateButtonStyle : orderFilterDatePlaceholderButtonStyle\}/);
  assert.match(ordersPageSource, /const orderFilterDateFieldStyle = \{[\s\S]*?overflow:\s*"hidden"/);
  assert.match(ordersPageSource, /const orderFilterDateButtonStyle = \{[\s\S]*?fontWeight:\s*650[\s\S]*?minWidth:\s*0/);
  assert.match(ordersPageSource, /const orderFilterDatePlaceholderButtonStyle = \{[\s\S]*?\.\.\.orderFilterDateButtonStyle[\s\S]*?fontWeight:\s*500/);
  assert.match(ordersPageSource, /const orderFilterSelectFieldStyle = \{/);
  assert.match(ordersPageSource, /function OrderFilterMenu\(\{ ariaLabel, clearLabel, label, onChange, onClear, options, value \}\)/);
  assert.match(ordersPageSource, /const \[menuPosition, setMenuPosition\] = useState\(null\)/);
  assert.match(ordersPageSource, /\{open && menuPosition\s*\? createPortal/);
  assert.match(ordersPageSource, /aria-haspopup="listbox"/);
  assert.match(ordersPageSource, /role="listbox"/);
  assert.match(ordersPageSource, /const orderFilterMenuStyle = \{/);
  assert.match(ordersPageSource, /const orderFilterMenuStyle = \{[\s\S]*?position:\s*"absolute"/);
  assert.match(ordersPageSource, /rect\.bottom \+ window\.scrollY \+ 4/);
  assert.match(ordersPageSource, /const orderFilterMenuOptionStyle = \{/);
  assert.match(ordersPageSource, /const orderFilterClearButtonStyle = \{/);
  assert.match(ordersPageSource, /if \(!startDate && !endDate\) return ""/);
  assert.match(ordersPageSource, /function formatOrderDateValue\(value\) \{[\s\S]*?replaceAll\("-", "\."\)/);
  assert.match(ordersPageSource, /`\$\{formatOrderDateValue\(startDate\)\}~\$\{formatOrderDateValue\(endDate\)\}`/);
  assert.match(ordersPageSource, /textAlign:\s*"left"/);
  assert.match(ordersPageSource, /\{orderedDateFilterActive \? orderedDateLabel : "Order date"\}<\/button>/);
  assert.match(ordersPageSource, /aria-label="Clear ordered date filter"/);
  assert.match(ordersPageSource, /const \[pendingOrderedDateStart, setPendingOrderedDateStart\] = useState\(""\)/);
  assert.match(ordersPageSource, /const \[orderedDateCalendarPosition, setOrderedDateCalendarPosition\] = useState\(null\)/);
  assert.match(ordersPageSource, /\{orderedDateCalendarOpen && orderedDateCalendarPosition\s*\? createPortal/);
  assert.match(ordersPageSource, /const orderDateCalendarStyle = \{[\s\S]*?position:\s*"absolute"/);
  assert.doesNotMatch(ordersPageSource, /window\.addEventListener\("scroll", positionMenu, true\)/);
  assert.match(ordersPageSource, /orderedDateFrom: startDate/);
  assert.match(ordersPageSource, /orderedDateTo: endDate/);
  assert.match(ordersPageSource, /applyOrderedDateRange\(pendingOrderedDateStart, pendingOrderedDateStart\)/);
  assert.match(ordersPageSource, /getCalendarDayStyle\(day, orderFilters, pendingOrderedDateStart\)/);
  assert.match(ordersPageSource, /const nextFilters = \{\s*\.\.\.orderFilters,\s*orderedDateFrom: startDate,\s*orderedDateTo: endDate,\s*\}/);
  assert.match(ordersPageSource, /const nextSearchParams = beginOrderResourceTransition\(nextFilters\);\s*setSearchParams\(\s*nextSearchParams/);
  assert.match(ordersPageSource, /const handleClearOrderFilter = \(filterKey\) => \{/);
  assert.match(ordersPageSource, /nextFilters\.orderedDateFrom = ""/);
  assert.match(ordersPageSource, /nextFilters\.orderedDateTo = ""/);
  assert.match(ordersPageSource, /nextFilters\[filterKey\] = ""/);
  assert.match(ordersPageSource, /onClick=\{handleOrderedDateCalendarOpen\}/);
  assert.match(ordersPageSource, /aria-label="Filter orders by delivery day"/);
  assert.match(ordersPageSource, /value=\{orderFilters\.deliveryWeekday\}/);
  assert.match(ordersPageSource, /const handleOrderFilterChange = \(filterKey, filterValue\) => \{[\s\S]*?const nextSearchParams = beginOrderResourceTransition\(nextFilters\);[\s\S]*?setSearchParams\(\s*nextSearchParams/);
  assert.match(ordersPageSource, /label="Delivery day"/);
  assert.match(ordersPageSource, /renderOrderFilterChevron\(\)/);
  assert.match(ordersPageSource, /options=\{ORDER_WEEKDAY_OPTIONS\}/);
  assert.match(ordersPageSource, /handleOrderFilterChange\("deliveryWeekday", filterValue\)/);
  assert.match(ordersPageSource, /clearLabel="Clear delivery day filter"/);
  assert.match(ordersPageSource, /aria-label="Filter orders by delivery date"/);
  assert.match(ordersPageSource, /label="Delivery date"/);
  assert.match(ordersPageSource, /orderFilterOptions\.deliveryDates\.map\(\(\{ count, value \}\) => \(\{/);
  assert.match(ordersPageSource, /formatDeliveryDateFilterLabel\(value, count\)/);
  assert.match(ordersPageSource, /value=\{orderFilters\.deliveryDate\}/);
  assert.match(ordersPageSource, /handleOrderFilterChange\("deliveryDate", filterValue\)/);
  assert.match(ordersPageSource, /clearLabel="Clear delivery date filter"/);
  assert.match(ordersPageSource, /aria-label="Visible order count"/);
  assert.match(ordersPageSource, /aria-label="Filter orders by service type"/);
  assert.match(ordersPageSource, /label="Type"/);
  assert.match(ordersPageSource, /\{ label: "Delivery", value: "DELIVERY" \}/);
  assert.match(ordersPageSource, /\{ label: "Pickup", value: "PICKUP" \}/);
  assert.match(ordersPageSource, /clearLabel="Clear service type filter"/);
  assert.match(ordersPageSource, /aria-label="Filter orders by delivery area"/);
  assert.match(ordersPageSource, /label="Area"/);
  assert.match(ordersPageSource, /orderFilterOptions\.deliveryAreas\.map\(\(deliveryArea\) => \(\{/);
  assert.match(ordersPageSource, /handleOrderFilterChange\("deliveryArea", filterValue\)/);
  assert.match(ordersPageSource, /clearLabel="Clear delivery area filter"/);
  assert.match(ordersPageSource, /aria-label="Filter orders by state"/);
  assert.match(ordersPageSource, /label="State"/);
  assert.match(ordersPageSource, /ORDER_DELIVERY_STATE_OPTIONS/);
  assert.match(ordersPageSource, /options=\{ORDER_DELIVERY_STATE_OPTIONS\}/);
  assert.doesNotMatch(ordersPageSource, /stateOption\) => orderFilterOptions\.deliveryStates\.includes/);
  assert.match(ordersPageSource, /handleOrderFilterChange\("deliveryState", filterValue\)/);
  assert.match(ordersPageSource, /clearLabel="Clear state filter"/);
  assert.match(ordersPageSource, /const nextSearchParams = beginOrderResourceTransition\(nextFilters\);\s*setSearchParams\(/);
  assert.match(ordersPageSource, />Clear filters<\/button>/);
  assert.match(ordersPageSource, />Clear selection<\/button>/);
  assert.match(ordersPageSource, />Clear<\/button>/);
  assert.match(ordersPageSource, /disabled=\{checkedOrderIds\.length === 0 \|\| snapshotSelectionActive\}/);
  assert.match(ordersPageSource, /deliveryWeekday: ""/);
  assert.match(ordersPageSource, /orderedDateFrom: ""/);
  assert.match(ordersPageSource, /orderedDateTo: ""/);
  assert.match(ordersPageSource, /const orderFilterControlStyle = \{[\s\S]*?flex:\s*"0 1 122px"[\s\S]*?minWidth:\s*"104px"[\s\S]*?padding:\s*"0 8px"/);
  assert.match(ordersPageSource, /const orderFilterDateFieldStyle = \{[\s\S]*?\.\.\.orderFilterControlStyle[\s\S]*?flex:\s*"0 1 176px"[\s\S]*?minWidth:\s*"148px"/);
  assert.match(ordersPageSource, /boxSizing:\s*"border-box"/);
  assert.match(ordersPageSource, /const orderControlsStyle = \{[\s\S]*?flexWrap:\s*"nowrap"[\s\S]*?overflowX:\s*"auto"[\s\S]*?padding:\s*"6px 10px 8px"/);
  assert.match(ordersPageSource, /const orderControlsTrailingStyle = \{[\s\S]*?flex:\s*"0 0 auto"[\s\S]*?marginLeft:\s*"auto"/);
  assert.doesNotMatch(ordersPageSource, /aria-label="Order planning tabs" role="tablist"/);
  assert.doesNotMatch(ordersPageSource, /ORDER_STATUS_TABS\.map/);
  assert.doesNotMatch(ordersPageSource, /aria-label="Choose order scope"/);
  assert.doesNotMatch(ordersPageSource, />Planning Scope<\/option>/);
  assert.doesNotMatch(ordersPageSource, />History \/ All Orders<\/option>/);
  assert.doesNotMatch(ordersPageSource, /aria-label="Search orders"/);
  assert.doesNotMatch(ordersPageSource, /placeholder="Search orders"/);
  assert.doesNotMatch(ordersPageSource, /type="search"/);
  assert.doesNotMatch(ordersPageSource, /formatServiceTypeLabel\(serviceType\)/);
  assert.doesNotMatch(ordersPageSource, /const serviceTypeFilterOptions = useMemo\(/);
  assert.doesNotMatch(ordersPageSource, /const orderFilterSearchStyle = \{/);
  assert.doesNotMatch(ordersPageSource, /background:\s*"#ffffff",\s*\n\s*borderBottom:\s*"1px solid #ebebeb"/);
  assert.doesNotMatch(ordersPageSource, /const allOrdersShown = orderFilters\.planned === "all"/);
  assert.doesNotMatch(ordersPageSource, /aria-pressed=\{allOrdersShown\}/);
  assert.doesNotMatch(ordersPageSource, /Showing all orders, including past and planned orders/);
  assert.doesNotMatch(ordersPageSource, /Include past and planned orders/);
  assert.doesNotMatch(ordersPageSource, />\s*Un-routed\s*<\/button>/);
  assert.doesNotMatch(ordersPageSource, /Show routed orders/);
});

test("Orders paginated resource defaults to all history orders and renders numeric page buttons", () => {
  assert.match(ordersPageSource, /import \{ createPortal, flushSync \} from "react-dom"/);
  assert.match(
    ordersPageSource,
    /const ordersResourceTransitionPending = paginationEnabled && optimisticOrderFilters !== null/,
  );
  assert.match(
    ordersPageSource,
    /const beginOrderResourceTransition = useCallback\([\s\S]*const navigationWillChange = nextSearchParams\.toString\(\) !== searchParams\.toString\(\)[\s\S]*setOptimisticOrderFilters\(\s*paginationEnabled \? \(navigationWillChange \? nextFilters : null\) : nextFilters,?\s*\)[\s\S]*return nextSearchParams[\s\S]*\[paginationEnabled, searchParams\]/,
  );
  assert.match(
    ordersPageSource,
    /function getOrdersResourceFilters\(filters = \{\}\) \{[\s\S]*scope: ORDER_HISTORY_SCOPE,[\s\S]*tab: "all"/,
  );
  assert.match(
    ordersPageSource,
    /updateOrderFilterSearchParams\([\s\S]*new URLSearchParams\(\),[\s\S]*getOrdersResourceFilters\(urlOrderFilters\),[\s\S]*\)/,
  );
  assert.match(
    ordersPageServerSource,
    /getOrdersResourceFilters\(getOrderFiltersFromSearchParams\([\s\S]*page: 1,[\s\S]*routeOpsToday/,
  );
  assert.match(ordersPageSource, /formData\.set\("filters", JSON\.stringify\(Object\.fromEntries\(resourceFilterSearchParams\)\)\)/);
  assert.match(ordersPageSource, /const ordersCurrentPage = getPositiveInteger\(ordersPageInfo\?\.currentPage\)/);
  assert.match(ordersPageSource, /const ordersTotalPages = getPositiveInteger\(ordersPageInfo\?\.totalPages\)/);
  assert.match(ordersPageSource, /import \{ getOrdersPageNumbers \} from "\.\/orders-pagination"/);
  assert.match(ordersPageSource, /ordersPageNumbers\.map\(\(pageNumber\) =>/);
  assert.match(
    ordersPageSource,
    /const ordersPageUpdating = isOrdersPageUpdating\(\{[\s\S]*filterTransitionPending: ordersResourceTransitionPending,[\s\S]*pendingRequestKey: ordersPagePendingRequestKey,[\s\S]*fetcherState: ordersPageFetcher\.state,[\s\S]*appliedFilterKey: appliedOrdersPageFilterKeyRef\.current,[\s\S]*requestedFilterKey: resourceFilterKey/,
  );
  assert.match(ordersPageSource, /ordersPagePendingRequestKey/);
  assert.match(
    ordersPageSource,
    /setOrdersPagePendingRequestKey\(pageRequestKey\)[\s\S]*await getOrdersResourceSessionToken\(\)/,
  );
  assert.match(
    ordersPageSource,
    /completeOrdersPageRequest\(pendingRequestKey, ordersPageFetcher\.data\._requestKey\)/,
  );
  assert.match(ordersPageSource, /ordersFacetsFilterKey === resourceFilterKey/);
  assert.match(
    ordersPageSource,
    /<s-spinner size="base" accessibilityLabel="Loading order results"><\/s-spinner>/,
  );
  assert.match(ordersPageSource, />Updating order results…<\/span>/);
  assert.match(ordersPageSource, /const disabled = active \|\| ordersPageUpdating/);
  assert.match(ordersPageSource, /\{ordersPageResult\.count\} total orders/);
  assert.match(ordersPageSource, /Page \{ordersCurrentPage\} of \{ordersTotalPages\}/);
  assert.doesNotMatch(ordersPageSource, /\? `, \$\{ordersPageResult\.count\} orders`/);
  assert.match(ordersPageSource, /typeof pageNumber !== "number"/);
  assert.match(ordersPageSource, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(ordersPageSource, /onClick=\{\(\) => handleOrdersPageChange\(pageNumber\)\}/);
  assert.match(
    ordersPageSource,
    /const ordersPaginationBlockStyle = \{[\s\S]*margin: "6px 10px 8px",[\s\S]*padding: "4px 0",[\s\S]*\};/,
  );
  assert.match(
    ordersPageSource,
    /const compactOrdersPageButtonStyle = \{[\s\S]*minHeight: "26px",[\s\S]*minWidth: "28px",[\s\S]*padding: "2px 8px",[\s\S]*\};/,
  );
  assert.match(ordersPageSource, /const activeOrdersPageButtonStyle = \{[\s\S]*\.\.\.compactOrdersPageButtonStyle,[\s\S]*\};/);
  assert.match(ordersPageSource, /const ordersPageButtonStyle = \{[\s\S]*\.\.\.compactOrdersPageButtonStyle,[\s\S]*\};/);
  assert.match(ordersPageSource, /const disabledOrdersPageButtonStyle = \{[\s\S]*\.\.\.compactOrdersPageButtonStyle,[\s\S]*\};/);
  assert.match(ordersPageSource, /readWatermark: ordersPageInfo\?\.readWatermark/);
  assert.doesNotMatch(ordersPageSource, />Previous<\/button>|>Next<\/button>/);
  assert.doesNotMatch(ordersPageSource, /Frozen selected set/);
});

test("Orders initial loader leaves optional route and inventory data off the critical path", () => {
  assert.match(
    ordersPageServerSource,
    /const inventoryDataPromise = activeOrdersView === "inventory"/,
  );
  assert.doesNotMatch(
    ordersPageServerSource,
    /const routeGroupDataPromise = shouldLoadOrders[\s\S]*fetchDeliveryRouteGroups/,
  );
  assert.match(ordersPageSource, /const routeGroupsFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /submitOrdersResourceRequest\([\s\S]*"routeGroups"/);
});

test("Orders map and route plan share an accessible resizable height", () => {
  assert.match(mapPanelSource, /export function MapResizeHandle/);
  assert.match(mapPanelSource, /role="slider"/);
  assert.match(mapPanelSource, /setPointerCapture/);
  assert.match(mapPanelSource, /aria-valuenow/);
  assert.match(ordersPageSource, /const \[ordersMapHeight, setOrdersMapHeight\] = useState\(ORDERS_MAP_DEFAULT_HEIGHT\)/);
  assert.match(ordersPageSource, /frameStyle=\{\{ height: `\$\{ordersMapHeight\}px` \}\}/);
  assert.match(ordersPageSource, /height: `\$\{ordersMapHeight\}px`/);
  assert.match(ordersPageSource, /<MapResizeHandle[\s\S]*onChange=\{setOrdersMapHeight\}/);
  assert.match(ordersPageSource, /\[isMapReady, isMapWide, ordersMapHeight\]/);
});

test("Orders map renders current-filter planned pins and the focused table-click pin", () => {
  assert.match(ordersPageSource, /mapCompactOrderPointsToRows\(ordersMapFilterKey === resourceFilterKey \? ordersMapPoints : \[\]\)/);
  assert.match(ordersPageSource, /mergeLocatedOrderRows\(resourceLocatedOrders, plannedOrders\)/);
  assert.match(ordersPageSource, /syncOrdersMapMarkerLayer\(map, locatedOrders, plannedOrderIds, activeOrderPopupId\)/);
  assert.match(ordersPageSource, /if \(!ordersLayerSynced\) \{\s*mapSourceSyncPendingRef\.current = true;\s*scheduleMapSourceSyncRetry\(\);\s*return undefined;\s*\}/);
  assert.match(ordersPageSource, /mapSourceSyncPendingRef\.current = false/);
  assert.match(ordersPageSource, /clearMapSourceSyncRetryTimer\(\)/);
  assert.match(ordersPageSource, /plannedIndexByOrderId\.has\(order\.id\) \|\| order\.id === focusedOrderId/);
  assert.match(ordersPageSource, /existingSource\.setData\(featureCollection\)/);
  assert.match(ordersPageSource, /map\.addSource\(ORDERS_MAP_SOURCE_ID/);
  assert.match(ordersPageSource, /const handleUserMapMoveStart = \(event\) => \{\s*if \(!event\?\.originalEvent\) return;\s*setActiveOrderPopup\(null\);\s*\};/);
  assert.doesNotMatch(ordersPageSource, /function createOrderMarkerElement\(order, plannedIndex\)/);
  assert.doesNotMatch(ordersPageSource, /filteredOrderIdSet/);
  assert.match(ordersPageSource, /activeOrderPopupId/);
  assert.doesNotMatch(ordersPageSource, /markerMatchState/);
  assert.doesNotMatch(ordersPageSource, /order-map-marker--matched/);
  assert.doesNotMatch(ordersPageSource, /order-map-marker--dimmed/);
  assert.doesNotMatch(globalCssSource, /\.order-map-marker--matched\s*\{/);
  assert.doesNotMatch(globalCssSource, /\.order-map-marker--dimmed\s*\{/);
});

test("Shopify order mapping reads only the Customer note and keeps coordinate metadata", () => {
  assert.match(shopifyOrdersSource, /export const SHOPIFY_ORDERS_QUERY/);
  assert.match(shopifyOrdersSource, /\btags\b/);
  assert.match(shopifyOrdersSource, /customer\s*\{\s*note\s*\}/);
  assert.match(shopifyOrdersSource, /shippingAddress\s*\{/);
  assert.match(shopifyOrdersSource, /coordinates: \[longitude, latitude\]/);
});


test("Orders page keeps inventory browsing and deletion as an Orders subview", () => {
  assert.match(ordersPageSource, /fetchDeliveryInventories/);
  assert.match(ordersPageSource, />Inventory<\/button>/);
  assert.match(ordersPageSource, /ordersLoaded: shouldLoadOrders/);
  assert.match(ordersPageSource, /if \(activeOrdersView === "orders" && !ordersLoaded\)/);
  assert.match(ordersPageSource, /aria-label="Inventory list"/);
  assert.match(ordersPageSource, /Order count/);
  assert.match(ordersPageSource, /Item count/);
  assert.match(ordersPageSource, /Delta summary/);
  assert.match(ordersPageSource, /Changed time/);
  assert.match(ordersPageSource, /inventory\.ordersCount \?\? inventory\.orderIds\?\.length \?\? inventory\.orders\?\.length \?\? 0/);
  assert.match(ordersPageSource, /const INVENTORY_TABLE_COLUMN_WIDTHS = \["32px", "220px", "88px", "82px", "150px", "128px"\]/);
  assert.match(ordersPageSource, /const inventoryTableStyle = \{[\s\S]*\.\.\.tableStyle[\s\S]*minWidth:\s*"700px"/);
  assert.doesNotMatch(ordersPageSource, /const inventoryTableStyle = \{[\s\S]*width:\s*"700px"/);
  assert.match(ordersPageSource, /<colgroup>[\s\S]*INVENTORY_TABLE_COLUMN_WIDTHS/);
  assert.match(ordersPageSource, /const inventoryCheckboxStyle = \{[\s\S]*margin:\s*0/);
  assert.match(ordersPageSource, /aria-label="Select all visible inventories"/);
  assert.match(ordersPageSource, /aria-label=\{`Select \$\{inventory\.name \?\? "inventory"\} for deletion`\}/);
  assert.match(ordersPageSource, /const inventoryDeleteFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /formData\.set\("_intent", "deleteInventory"\)/);
  assert.match(ordersPageSource, /formData\.set\("inventoryIds", JSON\.stringify\(checkedInventoryIds\)\)/);
  assert.match(ordersPageSource, /const ordersViewTabsRowStyle = \{[\s\S]*justifyContent:\s*"space-between"/);
  assert.match(ordersPageSource, /activeOrdersView === "inventory" \? \([\s\S]*>Delete<\/button>/);
  assert.doesNotMatch(ordersPageSource, /inventoryToolbarStyle/);
  assert.match(ordersPageSource, /className="route-table-row"[\s\S]*onClick=\{\(\) => openInventoryDetail\(inventory\.id\)\}/);
  assert.doesNotMatch(ordersPageSource, />Detail<\/th>|>Open<\/button>/);
  assert.doesNotMatch(ordersPageSource, /lower=\{<div \/>}/);
  assert.match(ordersPageSource, /if \(activeOrdersView !== "orders" \|\| !mapContainerElement \|\| mapRef\.current\)/);
  assert.doesNotMatch(appShellSource, /nav\.inventory|Inventory plan/);
  assert.doesNotMatch(ordersPageSource, /Inventory plan|Inventory dashboard|KPI|summary-card/i);
});

test("Orders inventory tabs avoid border shorthand style collisions", () => {
  assert.match(
    ordersPageSource,
    /const ordersViewTabButtonStyle = \{[\s\S]*borderColor:\s*"#d4d4d4"[\s\S]*borderStyle:\s*"solid"[\s\S]*borderWidth:\s*"1px"/,
  );
  assert.doesNotMatch(
    ordersPageSource,
    /const ordersViewTabButtonStyle = \{[\s\S]*border:\s*"1px solid #d4d4d4"/,
  );
});

test("Orders removes standalone inventory creation while keeping inventory browsing and deletion", () => {
  assert.match(ordersPageSource, /import \{ deleteDeliveryInventory, fetchDeliveryInventories \}/);
  assert.doesNotMatch(ordersPageSource, /const inventoryFetcher = useFetcher\(\)/);
  assert.doesNotMatch(ordersPageSource, /formData\.set\("_intent", "createInventory"\)/);
  assert.doesNotMatch(ordersPageSource, /if \(intent === "createInventory"\) \{/);
  assert.doesNotMatch(ordersPageSource, /createDeliveryInventory\(/);
  assert.doesNotMatch(ordersPageSource, />Inventory<\/s-heading>[\s\S]{0,800}>Assign<\/button>/);
  assert.match(ordersPageSource, /aria-label="Inventory list"/);
  assert.match(ordersPageSource, /deleteDeliveryInventory\(request, inventoryId, \{ sessionToken: shopifySessionToken \}\)/);
});

test("Orders inventory detail shows a printable product matrix without delta", () => {
  assert.match(inventoryDetailSource, /fetchDeliveryInventoryOrderView/);
  assert.match(inventoryDetailSource, /<PrefetchPageLinks page="\/app\/orders" \/>/);
  assert.match(inventoryDetailSource, /export const meta = \(\{ data \}\) => \[\{ title: data\?\.inventory\?\.name \?\? "Inventory" \}\]/);
  assert.match(inventoryDetailSource, /buildInventoryProductMatrix/);
  assert.match(inventoryDetailSource, /buildInventoryHistoryItems/);
  assert.match(inventoryDetailSource, /Inventory product matrix/);
  assert.doesNotMatch(inventoryDetailSource, /Product quantities by date/);
  assert.match(inventoryDetailSource, /generatedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(inventoryDetailSource, /gridTemplateColumns: "210mm 360px"/);
  assert.match(inventoryDetailSource, /minWidth: "calc\(210mm \+ 380px\)"/);
  assert.match(inventoryDetailSource, /className="inventory-detail-sheet"/);
  assert.match(inventoryDetailSource, /className="inventory-detail-history inventory-detail-no-print"/);
  assert.doesNotMatch(inventoryDetailSource, /const HISTORY_ITEMS = \[/);
  assert.doesNotMatch(inventoryDetailSource, /Hardcoded delta preview/);
  assert.match(inventoryDetailSource, /Orders in this inventory/);
  assert.match(inventoryDetailSource, /No order history/);
  assert.match(inventoryDetailSource, /const historyPanelStyle = \{/);
  assert.match(inventoryDetailSource, /maxHeight: "calc\(100vh - 24px\)"/);
  assert.match(inventoryDetailSource, /top: "12px"/);
  assert.match(inventoryDetailSource, /paddingRight: "6px"/);
  assert.match(inventoryDetailSource, /scrollbarGutter: "stable"/);
  assert.doesNotMatch(inventoryDetailSource, /openHistoryTitle/);
  assert.match(inventoryDetailSource, /const historyCardContentStyle = \{/);
  assert.match(inventoryDetailSource, /maxHeight: "300px"/);
  assert.match(inventoryDetailSource, /overflowY: "auto"/);
  assert.match(inventoryDetailSource, /paddingRight: "8px"/);
  assert.match(inventoryDetailSource, /open=\{index === 0\}/);
  assert.match(inventoryDetailSource, /gridTemplateColumns: "70px minmax\(0, 1fr\) 54px"/);
  assert.doesNotMatch(inventoryDetailSource, /<span>Order<\/span>/);
  assert.doesNotMatch(inventoryDetailSource, /<span>Customer<\/span>/);
  assert.doesNotMatch(inventoryDetailSource, /<span>Items<\/span>/);
  assert.match(inventoryDetailSource, /const historyOrderAddStyle = \{/);
  assert.match(inventoryDetailSource, /const historyOrderRemoveStyle = \{/);
  assert.match(inventoryDetailSource, /order\.itemDelta < 0 \? historyOrderRemoveStyle : historyOrderAddStyle/);
  assert.match(inventoryDetailSource, /`\+\$\{order\.itemDelta\}`/);
  assert.match(inventoryDetailSource, /order\.items\.map/);
  assert.match(inventoryDetailSource, /const headerActionStyle = \{/);
  assert.match(inventoryDetailSource, /marginLeft: "auto"/);
  assert.match(inventoryDetailSource, /Output: \{formatOutputTime\(generatedAt\)\}/);
  assert.match(inventoryDetailSource, /aria-label="Inventory detail view"/);
  assert.match(inventoryDetailSource, /needsSessionTokenRefresh: hasSessionTokenRefreshError\(errors\)/);
  assert.match(inventoryDetailSource, /shopify\s*\.\s*idToken\(\)/);
  assert.match(inventoryDetailSource, /revalidator\.revalidate\(\)/);
  assert.doesNotMatch(inventoryDetailSource, /_shopify_session_refreshed|nextSearchParams\.set\("id_token"/);
  assert.match(inventoryDetailSource, />Products<\/button>/);
  assert.match(inventoryDetailSource, />Orders<\/button>/);
  assert.match(inventoryDetailSource, /aria-label="Inventory orders"/);
  assert.match(inventoryDetailSource, />\{"Order\\u00a0id"\}<\/span>[\s\S]*>Address<\/span>[\s\S]*>ETA<\/span>[\s\S]*>\{"Drive\\u00a0time"\}<\/span>[\s\S]*>\{"Stop\\u00a0time"\}<\/span>[\s\S]*>Customer<\/span>[\s\S]*>Price<\/span>/);
  assert.doesNotMatch(inventoryDetailSource, /Shipping phone:/);
  assert.match(inventoryDetailSource, /inventory\.linkedRoutes/);
  assert.match(inventoryDetailSource, /customerNote: getInventoryOrderCustomerNote\(order\)/);
  assert.match(inventoryDetailSource, /className="inventory-detail-order-details"/);
  assert.match(inventoryDetailSource, /className="inventory-detail-order-note"/);
  assert.match(inventoryDetailSource, />Customer Note<\/span>/);
  assert.match(inventoryDetailSource, /data-print-line-count=\{getInventoryPrintTextLineCount\(order\.customerNote\)\}/);
  assert.doesNotMatch(inventoryDetailSource, /Order Note is intentionally not rendered/);
  assert.match(inventoryDetailSource, /`\$\{quantity\} EA \$\{options/);
  assert.doesNotMatch(inventoryDetailSource, /EA ·/);
  assert.match(inventoryDetailSource, /className="inventory-detail-order-meta"/);
  assert.match(inventoryDetailSource, /className="inventory-detail-orders-list"/);
  assert.match(inventoryDetailSource, /inventory-detail-view-\$\{inventoryDetailView\}/);
  assert.match(inventoryDetailSource, /className="inventory-detail-orders-head"/);
  assert.match(inventoryDetailSource, /<article\s+className="inventory-detail-order-card"/);
  assert.match(inventoryDetailSource, /className="inventory-detail-order-row"/);
  assert.match(inventoryDetailSource, /className="inventory-detail-order-items"/);
  assert.match(inventoryDetailSource, /className="inventory-detail-order-address"/);
  assert.match(inventoryDetailSource, /className="inventory-detail-order-payment"/);
  assert.match(inventoryDetailSource, /className="inventory-detail-order-customer"/);
  assert.match(inventoryDetailSource, /className="inventory-detail-order-phone"/);
  assert.match(inventoryDetailSource, /inventory-detail-order-customer[\s\S]*\{order\.phone\}[\s\S]*inventory-detail-order-items[\s\S]*inventory-detail-order-details[\s\S]*inventory-detail-order-payment[\s\S]*inventory-detail-order-note/);
  assert.match(inventoryDetailSource, /addressLines: getInventoryOrderAddressLines\(order\)/);
  assert.match(inventoryDetailSource, /const cityIndex = parts\.length >= 5 \? parts\.length - 4 : parts\.length - 3/);
  assert.match(inventoryDetailSource, /parts\.slice\(0, cityIndex\)\.join\(", "\)/);
  assert.match(inventoryDetailSource, /parts\.slice\(cityIndex \+ 2\)\.join\(", "\)/);
  assert.match(inventoryDetailSource, /const orderViewColumns = "70px minmax\(190px, 260px\) 52px 70px 68px minmax\(112px, 1fr\) 112px"/);
  assert.doesNotMatch(inventoryDetailSource, /function OrderViewColGroup/);
  assert.doesNotMatch(inventoryDetailSource, /className="inventory-detail-orders-table"/);
  assert.match(inventoryDetailSource, /break-inside: avoid/);
  assert.match(inventoryDetailSource, /page-break-inside: avoid/);
  assert.match(inventoryDetailSource, /break-inside: avoid-page/);
  assert.match(inventoryDetailSource, /getOrderViewPaymentPillStyle\(order\.paymentStatus\)/);
  assert.doesNotMatch(inventoryDetailSource, /orderViewItemStyle/);
  assert.doesNotMatch(inventoryDetailSource, /orderViewPaymentStyle/);
  assert.match(inventoryDetailSource, /const PRODUCT_COLUMNS_PER_TABLE = 6/);
  assert.match(inventoryDetailSource, /const PRINT_PAGE_HEIGHT_MM = 297/);
  assert.match(inventoryDetailSource, /const PRINT_PAGE_MARGIN_MM = 10/);
  assert.match(inventoryDetailSource, /const PRINT_CONTENT_HEIGHT_MM = PRINT_PAGE_HEIGHT_MM - PRINT_PAGE_MARGIN_MM \* 2/);
  assert.match(inventoryDetailSource, /const CSS_PX_PER_MM = 96 \/ 25\.4/);
  assert.match(inventoryDetailSource, /const PRINT_ORDER_SECTION_GAP_MM = 4/);
  assert.match(inventoryDetailSource, /const PRINT_ORDER_LIST_GAP_PX = PRINT_ORDER_SECTION_GAP_MM \* CSS_PX_PER_MM/);
  assert.match(inventoryDetailSource, /function getPrintOrderHeightPx\(card\)/);
  assert.match(inventoryDetailSource, /card\.querySelectorAll\("\.inventory-detail-order-items > div"\)\.length/);
  assert.match(inventoryDetailSource, /card\.querySelector\("\.inventory-detail-order-customer"\)/);
  assert.match(inventoryDetailSource, /card\.querySelector\("\.inventory-detail-order-details"\)/);
  assert.match(inventoryDetailSource, /card\.querySelector\("\.inventory-detail-order-note"\)/);
  assert.match(inventoryDetailSource, /const PRINT_ORDER_DETAILS_PADDING_PX = 1 \* CSS_PX_PER_MM/);
  assert.match(inventoryDetailSource, /customerLines \* PRINT_ORDER_CUSTOMER_LINE_HEIGHT_PX/);
  assert.match(inventoryDetailSource, /noteLines \* PRINT_ORDER_NOTE_LINE_HEIGHT_PX/);
  assert.match(inventoryDetailSource, /function applyInventoryOrderPrintBreaks/);
  assert.match(inventoryDetailSource, /function textOrDisplay\(value, fallback = "-"\)/);
  assert.match(inventoryDetailSource, /order\.paymentStatus !== "-"/);
  assert.doesNotMatch(inventoryDetailSource, /return "—"/);
  assert.match(inventoryDetailSource, /const height = getPrintOrderHeightPx\(card\)/);
  assert.match(inventoryDetailSource, /style\.breakBefore = "page"/);
  assert.match(inventoryDetailSource, /usedHeight = height % pageHeight/);
  assert.match(inventoryDetailSource, /usedHeight = \(usedHeight \+ requiredHeight\) % pageHeight/);
  assert.match(inventoryDetailSource, /window\.addEventListener\("beforeprint"/);
  assert.match(inventoryDetailSource, /applyInventoryOrderPrintBreaks\(\);\s*window\.print\(\)/);
  assert.match(inventoryDetailSource, /getProductChunks\(matrix\.products\)/);
  assert.match(inventoryDetailSource, /getProductSlots\(products\)/);
  assert.match(inventoryDetailSource, /Group total/);
  assert.match(inventoryDetailSource, /Overall total: \{matrix\.totalQuantity\}/);
  assert.match(inventoryDetailSource, /product\.displayLabel \?\? product\.label/);
  assert.match(inventoryDetailSource, /WebkitLineClamp: 2/);
  assert.match(globalCssSource, /--app-divider-strong: #c7c7c7;/);
  assert.match(globalCssSource, /--app-divider-subtle: #e5e7eb;/);
  assert.match(inventoryDetailSource, /const strongDividerStyle = "1px solid var\(--app-divider-strong\)"/);
  assert.match(inventoryDetailSource, /const subtleDividerStyle = "1px solid var\(--app-divider-subtle\)"/);
  assert.match(inventoryDetailSource, /borderRight: subtleDividerStyle/);
  assert.match(inventoryDetailSource, /const orderViewOrdersListStyle = \{[\s\S]*?gap: "10px"/);
  assert.match(inventoryDetailSource, /const orderViewDetailsStyle = \{[\s\S]*?padding: "2px 8px 4px"/);
  assert.doesNotMatch(inventoryDetailSource, /orderViewPaymentOnlyDetailsStyle/);
  assert.match(inventoryDetailSource, /const orderViewItemsCellStyle = \{[\s\S]*?padding: "6px 0 4px"/);
  assert.match(inventoryDetailSource, /textAlign: "center"/);
  assert.match(inventoryDetailSource, /aria-hidden="true"/);
  assert.match(inventoryDetailSource, /width: "70px"/);
  assert.match(inventoryDetailSource, /width: "76px"/);
  assert.match(inventoryDetailSource, /const tableSectionStyle = \{/);
  assert.match(inventoryDetailSource, /scrollbarGutter: "stable"/);
  assert.match(inventoryDetailSource, /<div style=\{tableSectionStyle\}>/);
  assert.match(inventoryDetailSource, /const tableWrapStyle = \{/);
  assert.match(inventoryDetailSource, /overflow: "visible"/);
  assert.doesNotMatch(inventoryDetailSource, /overflowX: "auto"/);
  assert.match(inventoryDetailSource, /\.inventory-detail-total-col \{ width: 64px !important; \}/);
  assert.match(inventoryDetailSource, /function DateCellLabel/);
  assert.match(inventoryDetailSource, /gridTemplateColumns: "22px 34px"/);
  assert.match(inventoryDetailSource, /className="inventory-detail-group-total-head" style=\{groupTotalHeadCellStyle\}>Group total/);
  assert.match(inventoryDetailSource, /fontSize: "12px"/);
  assert.match(inventoryDetailSource, /\.inventory-detail-group-total-head \{ font-size: 13px !important; \}/);
  assert.match(inventoryDetailSource, /\.inventory-detail-table \{ font-size: 13px !important; width: 100% !important; \}/);
  assert.match(inventoryDetailSource, /\.inventory-detail-orders-list \{ display: block !important; width: 100% !important; \}/);
  assert.match(inventoryDetailSource, /\.inventory-detail-orders-head \{ border-bottom: \$\{strongDividerStyle\} !important; font-size: 12px !important; font-weight: 750 !important; line-height: 16px !important; margin-bottom: \$\{PRINT_ORDER_SECTION_GAP_MM\}mm !important/);
  assert.match(inventoryDetailSource, /grid-template-columns: 17mm minmax\(0, 1fr\) 9mm 24mm 23mm 20mm 19mm !important/);
  assert.match(inventoryDetailSource, /\.inventory-detail-orders-head > span \{ white-space: nowrap !important; \}/);
  assert.match(inventoryDetailSource, /\.inventory-detail-orders-head > span:last-child \{ text-align: right !important; \}/);
  assert.match(inventoryDetailSource, /\.inventory-detail-order-card \{ -webkit-column-break-inside: avoid !important; border-top: \$\{strongDividerStyle\} !important; break-inside: avoid !important; break-inside: avoid-page !important; display: block !important/);
  assert.match(inventoryDetailSource, /\.inventory-detail-order-card:first-of-type \{ border-top: 0 !important; \}/);
  assert.match(inventoryDetailSource, /margin: 0 0 \$\{PRINT_ORDER_SECTION_GAP_MM\}mm !important/);
  assert.match(inventoryDetailSource, /\.inventory-detail-order-row \{ border-bottom: \$\{subtleDividerStyle\} !important; font-size: 12px !important; line-height: 17px !important; padding: 3mm 0 !important; \}/);
  assert.match(inventoryDetailSource, /\.inventory-detail-order-details \{[^}]*border-bottom: 0 !important;/);
  assert.match(inventoryDetailSource, /\.inventory-detail-order-details \{[^}]*padding: 0 0 1mm !important;/);
  assert.doesNotMatch(inventoryDetailSource, /inventory-detail-order-details--payment-only/);
  assert.doesNotMatch(inventoryDetailSource, /border-bottom: 1px solid #111/);
  assert.match(inventoryDetailSource, /\.inventory-detail-order-items \{ break-inside: avoid !important; display: grid !important; font-size: 12px !important; gap: 1mm !important; line-height: 17px !important; padding: 2mm 0 1mm !important; page-break-inside: avoid !important; \}/);
  assert.match(inventoryDetailSource, /box-sizing: border-box !important; display: block !important/);
  assert.match(inventoryDetailSource, /min-width: 0 !important; padding: 0 !important; width: 100% !important/);
  assert.match(inventoryDetailSource, /maxHeight: "28px"/);
  assert.match(inventoryDetailSource, /totalRowCellStyle/);
  assert.match(inventoryDetailSource, /borderTop: "1px solid #ebebeb"/);
  assert.doesNotMatch(inventoryDetailSource, /borderTop: "2px solid #d4d4d4"/);
  assert.match(inventoryDetailSource, /const backLinkStyle = \{/);
  assert.match(inventoryDetailSource, /<Link[\s\S]*className="inventory-detail-no-print"[\s\S]*style=\{backLinkStyle\}/);
  assert.doesNotMatch(inventoryDetailSource, /width:\s*"max-content"/);
  assert.match(inventoryDetailSource, /window\.print\(\)/);
  assert.match(inventoryDetailSource, /@media print/);
  assert.match(inventoryDetailSource, /maxWidth: "210mm"/);
  assert.match(inventoryDetailSource, /minHeight: "297mm"/);
  assert.match(inventoryDetailSource, /width: "210mm"/);
  assert.match(inventoryDetailSource, /\.inventory-detail-history \{ display: none !important; \}/);
  assert.match(inventoryDetailSource, /@page \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(inventoryDetailSource, /min-width: 0 !important/);
  assert.match(inventoryDetailSource, /inventory-detail-product-label/);
  assert.doesNotMatch(inventoryDetailSource, /Delta remarks|Order-by-order items|lastChange/);
});

test("Orders inventory detail logs API payload counts on the server", () => {
  assert.match(inventoryDetailSource, /logStructuredMetric\("orders\.inventory\.detail\.api"/);
  assert.match(inventoryDetailSource, /emptyItemReason/);
  assert.match(inventoryDetailSource, /orders_present_without_items/);
  assert.match(inventoryDetailSource, /orderCount: orders\.length/);
  assert.match(inventoryDetailSource, /rowCount: orderItems\.length/);
  assert.match(inventoryDetailSource, /totalCount: sumItemQuantity\(orderItems\)/);
  assert.doesNotMatch(inventoryDetailSource, /inventoryId:|name: inventory\?\.name|firstOrderItemKeys/);
});

test("Orders inventory detail renders payment method and status independently", () => {
  assert.match(inventoryDetailSource, /formatInventoryPaymentMethod\(order\)/);
  assert.match(inventoryDetailSource, /formatInventoryPaymentStatus\(order\)/);
  assert.match(inventoryDetailSource, />Method</);
  assert.match(inventoryDetailSource, />Status</);
  assert.doesNotMatch(inventoryDetailSource, /updateInventoryOrderPayment/);
  assert.doesNotMatch(inventoryDetailSource, /bulkUpdateDeliveryOrders/);
  assert.doesNotMatch(inventoryDetailSource, /INVENTORY_PAYMENT_METHOD_OPTIONS/);
  assert.doesNotMatch(inventoryDetailSource, />Pending</);
  assert.doesNotMatch(inventoryDetailSource, /orderUpdate|customerUpdate|mutation\s+\w+/);
});
