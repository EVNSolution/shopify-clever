import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const ordersPageSource = readFileSync(
  join(root, "app/routes/app.orders.jsx"),
  "utf8",
);
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
  assert.match(ordersPageSource, /fetchShopifyOrders\(admin,\s*\{\s*cacheKey: shopifyShopCacheKey,?\s*\}\)/);
  assert.match(ordersPageSource, /fetchShopifyOrders\(admin\)/);
  assert.match(ordersPageSource, /fetchShopifyDepartureLocation\(admin,\s*\{\s*cacheKey: shopifyShopCacheKey\s*\}\)/);
  assert.match(ordersPageSource, /useLoaderData\(\)/);
  assert.match(ordersPageSource, /<TabLayout\s+title="Orders"/);
  assert.doesNotMatch(ordersPageSource, /Shopify orders connected to the delivery map/);
  assert.match(ordersPageSource, /primary=\{/);
  assert.match(ordersPageSource, /id="orders-map"/);
  assert.match(ordersPageSource, /label: "Area"/);
  assert.match(ordersPageSource, /label: "Ordered"/);
  assert.match(ordersPageSource, /label: "Delivery"/);
  assert.match(ordersPageSource, /PROTECTED_ORDER_ACCESS/);
  assert.match(ordersPageSource, /Protected customer data access/);
  assert.match(ordersPageSource, /import\("maplibre-gl"\)/);
  assert.match(ordersPageSource, /import\("pmtiles"\)/);
  assert.match(ordersPageSource, /installPmtilesProtocol\(maplibregl, Protocol\)/);
  assert.doesNotMatch(ordersPageSource, /const orders = \[/);
  assert.match(appConfigSource, /scopes = "[^"]*read_orders/);
  assert.match(appConfigSource, /scopes = "[^"]*read_locations/);
  assert.equal(packageJson.dependencies["maplibre-gl"]?.length > 0, true);
  assert.equal(packageJson.dependencies.pmtiles?.length > 0, true);
});

test("Orders map defers MapLibre initialization until after initial navigation paint", () => {
  assert.match(ordersPageSource, /function scheduleIdleTask\(callback\) \{/);
  assert.match(ordersPageSource, /window\.requestIdleCallback/);
  assert.match(ordersPageSource, /window\.cancelIdleCallback/);
  assert.match(ordersPageSource, /const cancelMapInitialization = scheduleIdleTask\(initializeMap\)/);
  assert.match(ordersPageSource, /cancelMapInitialization\(\)/);
});

test("Orders map assets use stable local URLs to avoid dev console load warnings", () => {
  assert.doesNotMatch(
    ordersPageSource,
    /maplibre-gl\/dist\/maplibre-gl\.css\?url/,
  );
  assert.match(
    ordersPageSource,
    /export const links = \(\) => \[\{ rel: "stylesheet", href: "\/vendor\/maplibre-gl\.css" \}\]/,
  );
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
  assert.equal(buildingLayer?.paint?.["fill-opacity"], 0.34);
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
  assert.match(ordersPageSource, /function buildOrdersMapFeatureCollection\(orders, plannedOrderIds\) \{/);
  assert.match(ordersPageSource, /\.filter\(\(order\) => order\.hasCoordinates\)/);
  assert.match(ordersPageSource, /syncOrdersMapMarkerLayer\(map, locatedOrders, plannedOrderIds\)/);
});

test("Orders table container has a capped height and scrolls internally", () => {
  assert.match(ordersPageSource, /maxHeight:\s*"min\(320px,\s*36vh\)"/);
  assert.match(ordersPageSource, /overflowY:\s*"auto"/);
});

test("Orders table keeps the title row sticky outside Shopify table internals", () => {
  assert.match(ordersPageSource, /const tableHeaderCellStyle = \{/);
  assert.match(ordersPageSource, /position:\s*"sticky"/);
  assert.match(ordersPageSource, /top:\s*0/);
  assert.match(ordersPageSource, /<table/);
  assert.match(ordersPageSource, /<thead>/);
  assert.match(ordersPageSource, /style=\{tableHeaderCellStyle\}/);
  assert.doesNotMatch(ordersPageSource, /<s-table/);
  assert.doesNotMatch(ordersPageSource, /s-table-header-row/);
});

test("Orders filter and plan controls sit outside the table scroll area", () => {
  assert.match(ordersPageSource, /const orderTableLayoutStyle = \{/);
  assert.match(ordersPageSource, /const orderControlsStyle = \{/);
  assert.match(ordersPageSource, /const compactAlertStyle = \{/);
  assert.doesNotMatch(ordersPageSource, /const orderFilterBarStyle = \{/);
  assert.doesNotMatch(ordersPageSource, /const planActionRowStyle = \{/);
  assert.match(ordersPageSource, /padding:\s*"6px 10px"/);
  assert.match(ordersPageSource, /flexWrap:\s*"nowrap"/);
  assert.match(ordersPageSource, /overflowX:\s*"auto"/);
  assert.match(ordersPageSource, /overflowY:\s*"hidden"/);
  assert.match(ordersPageSource, /role="alert" style=\{compactAlertStyle\}/);
  assert.doesNotMatch(ordersPageSource, /<s-banner tone="critical">/);
  assert.match(ordersPageSource, /<div style=\{orderControlsStyle\}>/);
  assert.doesNotMatch(ordersPageSource, /style=\{orderFilterBarStyle\}/);
  assert.doesNotMatch(ordersPageSource, /style=\{planActionRowStyle\}/);
  assert.match(ordersPageSource, /<div style=\{tableWrapStyle\}>\s*<table/s);
});

test("Orders table uses a compact centered layout", () => {
  assert.match(ordersPageSource, /width:\s*"100%"/);
  assert.match(ordersPageSource, /minWidth:\s*"1040px"/);
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
  assert.match(ordersPageSource, /const \[checkedOrderIds, setCheckedOrderIds\] = useState\(\[\]\)/);
  assert.match(ordersPageSource, /const \[plannedOrderIds, setPlannedOrderIds\] = useState\(\[\]\)/);
  assert.match(ordersPageSource, /tableColumnWidths = \["4%", "8%", "9%", "13%", "27%", "11%", "12%", "8%", "8%"\]/);
  assert.match(ordersPageSource, /aria-label="Select all visible orders for plan"/);
  assert.match(ordersPageSource, /aria-label=\{`Select \${order\.name} for plan`\}/);
  assert.match(ordersPageSource, /checked=\{!routePlanningLocked && checkedOrderIdSet\.has\(order\.id\)\}/);
  assert.match(ordersPageSource, /disabled=\{routePlanningLocked\}/);
});

test("Orders column uses the order number itself as a neutral transparent button area", () => {
  assert.match(ordersPageSource, /const orderNumberButtonStyle = \{/);
  assert.match(ordersPageSource, /width:\s*"100%"/);
  assert.match(ordersPageSource, /className="order-number-button"/);
  assert.match(ordersPageSource, /aria-label=\{`View \${order\.name}`\}/);
  assert.match(ordersPageSource, /style=\{orderNumberButtonStyle\}/);
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


test("Orders page persists scoped planned orders through the delivery route-plan action", () => {
  assert.match(ordersPageSource, /import \{ useAppBridge \} from "@shopify\/app-bridge-react"/);
  assert.match(ordersPageSource, /import \{ useFetcher, useLoaderData, useNavigate, useRouteError, useSearchParams \} from "react-router"/);
  assert.match(ordersPageSource, /import \{[\s\S]*buildCreateRoutePlanPayload[\s\S]*createDeliveryRoutePlan[\s\S]*\} from "\.\.\/features\/delivery\/route-plans\.server"/);
  assert.match(ordersPageSource, /import \{ buildRouteScopeFromOrders \} from "\.\.\/features\/delivery\/route-scope"/);
  assert.match(ordersPageSource, /export const action = async \(\{ request \}\) => \{/);
  assert.match(ordersPageSource, /const formData = await request\.formData\(\)/);
  assert.match(ordersPageSource, /JSON\.parse\(formData\.get\("plannedOrderIds"\) \?\? "\[\]"\)/);
  assert.match(ordersPageSource, /JSON\.parse\(formData\.get\("routeScope"\) \?\? "null"\)/);
  assert.match(ordersPageSource, /const shopifySessionToken = formData\.get\("shopifySessionToken"\)/);
  assert.match(ordersPageSource, /reason: "route_create_preflight"/);
  assert.match(ordersPageSource, /buildCreateRoutePlanPayload\(\{/);
  assert.match(ordersPageSource, /routeScope,/);
  assert.match(ordersPageSource, /createDeliveryRoutePlan\(\s*request,\s*routePlanPayload,\s*\{\s*sessionToken: shopifySessionToken/s);
  assert.match(ordersPageSource, /return \{ routePlan, errors: \[\] \}/);
  assert.match(ordersPageSource, /const routePlanFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /const shopify = useAppBridge\(\)/);
  assert.match(ordersPageSource, /const navigate = useNavigate\(\)/);
  assert.match(ordersPageSource, /const sessionToken = await shopify\.idToken\(\)/);
  assert.match(ordersPageSource, /const routeDraftScope = buildRouteScopeFromOrders\(readyPlannedOrders\)/);
  assert.match(ordersPageSource, /formData\.set\("routeScope", JSON\.stringify\(routeDraftScope\)\)/);
  assert.match(ordersPageSource, /formData\.set\("shopifySessionToken", sessionToken\)/);
  assert.match(ordersPageSource, /routePlanFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(ordersPageSource, /navigate\(`\/app\/routes\/\$\{createdRoutePlan\.id\}\?id_token=\$\{encodeURIComponent\(sessionToken\)\}`\)/);
  assert.match(ordersPageSource, />Create route<\/button>/);
  assert.match(ordersPageSource, /disabled=\{readyPlannedOrders\.length === 0 \|\| routePlanFetcher\.state !== "idle"\}/);
  assert.doesNotMatch(ordersPageSource, /createRouteDraftSearchParams/);
  assert.doesNotMatch(ordersPageSource, /return redirect/);
});

test("Orders action separates background order sync from route creation", () => {
  assert.match(ordersPageSource, /import \{[\s\S]*fetchDeliveryOrders[\s\S]*syncDeliveryOrders[\s\S]*\} from "\.\.\/features\/delivery\/orders\.server"/);
  assert.match(ordersPageSource, /import \{[\s\S]*getOrderSyncSnapshots[\s\S]*isOrderReadyToPlan[\s\S]*mapCanonicalOrdersToOrderRows[\s\S]*mergeShopifyOrderRowsWithCanonicalRows[\s\S]*\} from "\.\.\/features\/orders\/canonical-orders"/);
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

test("Orders loader merges delivery server planning state before background sync", () => {
  assert.match(ordersPageSource, /const serverOrdersStartedAt = getSafePerformanceNow\(\)/);
  assert.match(ordersPageSource, /const serverOrderDataPromise = fetchDeliveryOrders\(\s*request,\s*\{\},\s*\{\s*cacheKey: shopifyShopCacheKey,?\s*\},?\s*\)\.then/);
  assert.match(ordersPageSource, /const serverOrderRows = mapCanonicalOrdersToOrderRows\(serverOrderData\.orders\)/);
  assert.match(ordersPageSource, /const mergedOrders = mergeShopifyOrderRowsWithCanonicalRows\(\s*orderData\.orders,\s*serverOrderRows,\s*\)/);
  assert.match(ordersPageSource, /orders: mergedOrders/);
  assert.match(ordersPageSource, /serverOrdersMs: serverOrderDataResult\.durationMs/);
  assert.match(ordersPageSource, /DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE/);
});

test("Orders page uses the Shopify shop timezone as today's delivery cutoff", () => {
  assert.match(ordersPageSource, /const SHOP_TIME_ZONE_QUERY = `#graphql/);
  assert.match(ordersPageSource, /shop \{[\s\S]*ianaTimezone[\s\S]*timezoneAbbreviation[\s\S]*\}/);
  assert.match(ordersPageSource, /async function fetchShopifyShopTimeZone\(admin\) \{/);
  assert.match(ordersPageSource, /admin\.graphql\(SHOP_TIME_ZONE_QUERY\)/);
  assert.match(ordersPageSource, /function getShopLocalDate\(shopTimeZoneData, date = new Date\(\)\) \{/);
  assert.match(ordersPageSource, /getLocalDateForTimeZone\(date, shopTimeZoneData\?\.ianaTimezone\)/);
  assert.match(ordersPageSource, /const shopLocalDate = getShopLocalDate\(shopTimeZoneData\)/);
  assert.match(ordersPageSource, /shopLocalDate,/);
  assert.match(ordersPageSource, /shopTimeZone: shopTimeZoneData\.ianaTimezone \?\? null/);
  assert.match(ordersPageSource, /shopTimeZoneMs: shopTimeZoneDataResult\.durationMs/);
  assert.match(ordersPageSource, /isOrderRoutePlanningLocked\(order, shopLocalDate\)/);
});

test("Orders page syncs loaded Shopify snapshots without adding sync cards", () => {
  assert.match(ordersPageSource, /const ordersSyncFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /const orderSyncSubmittedRef = useRef\(false\)/);
  assert.match(ordersPageSource, /getOrderSyncSnapshots\(safeOrders\)/);
  assert.match(ordersPageSource, /ordersSyncFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(ordersPageSource, /mapCanonicalOrdersToOrderRows\(ordersSyncFetcher\.data\?\.syncedOrders\)/);
  assert.match(ordersPageSource, /const displayOrders = syncedOrders\.length > 0 \? syncedOrders : safeOrders/);
  assert.doesNotMatch(ordersPageSource, /Orders sync KPI/);
  assert.doesNotMatch(ordersPageSource, /orders sync card/i);
  assert.doesNotMatch(ordersPageSource, /sync status panel/i);
});

test("Orders route creation only submits ready planned orders", () => {
  assert.match(ordersPageSource, /const readyPlannedOrders = useMemo\(\(\) => plannedOrders\.filter\(isOrderReadyToPlan\), \[plannedOrders\]\)/);
  assert.match(ordersPageSource, /readyPlannedOrders\.length === 0 \|\| routePlanFetcher\.state !== "idle"/);
  assert.match(ordersPageSource, /JSON\.stringify\(readyPlannedOrders\.map\(\(order\) => order\.id\)\)/);
  assert.match(ordersPageSource, /setCreateRouteClientError\("Route plan에는 ready 상태의 주문만 보낼 수 있습니다\."\)/);
  assert.match(ordersPageSource, /plannedOrders\.some\(\(order\) => isOrderRoutePlanningLocked\(order, orderFilterReferenceDate\)\)/);
  assert.match(ordersPageSource, /이미 route가 있거나 Delivery 날짜가 지난 주문은 route plan을 생성할 수 없습니다\./);
});

test("Orders route creation syncs only selected planned orders during preflight", () => {
  assert.match(ordersPageSource, /const plannedOrderIdSet = new Set\(plannedOrderIds\)/);
  assert.match(ordersPageSource, /const plannedShopifyOrders = orderData\.orders\.filter\(\s*\(order\) =>\s*plannedOrderIdSet\.has\(order\.id\),?\s*\)/);
  assert.match(ordersPageSource, /orders: getOrderSyncSnapshots\(plannedShopifyOrders\)/);
  assert.doesNotMatch(ordersPageSource, /orders: getOrderSyncSnapshots\(orderData\.orders\)/);
});

test("Orders route creation revalidates planned orders after preflight sync", () => {
  assert.match(ordersPageSource, /const alreadyPlannedOrders = plannedOrders\.filter\(isOrderRouteCreated\)/);
  assert.match(ordersPageSource, /alreadyPlannedOrders\.length > 0/);
  assert.match(ordersPageSource, /formatOrderNames\(alreadyPlannedOrders\)/);
  assert.match(ordersPageSource, /이미 계획 이후 단계인 주문이 포함되어 route를 만들지 않았습니다/);
  assert.match(ordersPageSource, /const expiredDeliveryDateOrders = plannedOrders\.filter/);
  assert.match(ordersPageSource, /!isOrderRouteCreated\(order\) &&[\s\S]*isOrderRoutePlanningLocked\(order, shopLocalDate\)/);
  assert.match(ordersPageSource, /Delivery 날짜가 지난 주문은 새 route plan에 추가하지 않았습니다/);
  assert.match(ordersPageSource, /buildCreateRoutePlanPayload\(\{/);
});

test("Orders page surfaces concrete route creation errors instead of a generic message", () => {
  assert.match(ordersPageSource, /const visibleOrderErrorMessage = getFirstErrorMessage\(\[\s*\.\.\.actionErrors,\s*\.\.\.\(errors \?\? \[\]\),\s*\]\)/);
  assert.match(ordersPageSource, /\{visibleOrderErrorMessage\}/);
  assert.doesNotMatch(ordersPageSource, /Shopify 주문 또는 route plan 저장 중 일부 오류가 반환되었습니다\./);
});

test("Orders page keeps background sync errors out of the route creation alert", () => {
  assert.match(ordersPageSource, /\.\.\.\(routePlanFetcher\.data\?\.errors \?\? \[\]\)/);
  assert.doesNotMatch(ordersPageSource, /\.\.\.\(ordersSyncFetcher\.data\?\.errors \?\? \[\]\)/);
});

test("Orders route draft locks additions to ready orders in one route scope", () => {
  assert.match(ordersPageSource, /const plannedRouteScope = useMemo\(\(\) => buildRouteScopeFromOrders\(plannedOrders\), \[plannedOrders\]\)/);
  assert.match(ordersPageSource, /const selectedOrders = checkedOrderIds\s*\.map\(\(orderId\) => displayOrderById\.get\(orderId\)\)/);
  assert.match(ordersPageSource, /\.filter\(\(order\) => isOrderReadyToPlan\(order\)\)/);
  assert.match(ordersPageSource, /setCreateRouteClientError\("ready 상태 주문만 route plan에 추가할 수 있습니다\."\)/);
  assert.match(ordersPageSource, /const targetRouteScopeKey = plannedRouteScope\?\.routeScopeKey \?\? sameDateSelectedOrders\.find\(\(order\) => order\.routeScopeKey\)\?\.routeScopeKey/);
  assert.match(ordersPageSource, /sameDateSelectedOrders\.filter\(\(order\) => order\.routeScopeKey === targetRouteScopeKey\)/);
  assert.match(ordersPageSource, /setCreateRouteClientError\("같은 배송일\/세션 주문만 route plan에 추가할 수 있습니다\."\)/);
  assert.match(ordersPageSource, /setCreateRouteClientError\("같은 배송일\/세션 주문만 route plan에 추가했습니다\."\)/);
});

test("Orders selection locks the table and map to the first delivery date before Add to plan", () => {
  assert.match(ordersPageSource, /function getFirstOrderDeliveryDateByIds\(orderIds, orderById\) \{/);
  assert.match(ordersPageSource, /function getOrdersForDeliveryDate\(orders, deliveryDate\) \{/);
  assert.match(ordersPageSource, /const checkedDeliveryDateLock = useMemo\(\s*\(\) => getFirstOrderDeliveryDateByIds\(checkedOrderIds, displayOrderById\)/);
  assert.match(ordersPageSource, /const plannedDeliveryDateLock = useMemo\(\s*\(\) => getOrderDeliveryDateValue\(plannedOrders\[0\]\)/);
  assert.match(ordersPageSource, /const routePlanDeliveryDateLock =\s*plannedDeliveryDateLock \|\| checkedDeliveryDateLock/);
  assert.match(ordersPageSource, /const filteredDeliveryDateLock = useMemo\(\s*\(\) => getOrderDeliveryDateValue\(\{ deliveryDate: orderFilters\.deliveryDate \}\)/);
  assert.match(ordersPageSource, /const \[autoAppliedDeliveryDateFilter, setAutoAppliedDeliveryDateFilter\] =\s*useState\(null\)/);
  assert.match(ordersPageSource, /const applyDeliveryDateFilterLock = useCallback\(\(deliveryDate\) => \{/);
  assert.match(ordersPageSource, /const normalizedDeliveryDate = getOrderDeliveryDateValue\(\{ deliveryDate \}\)/);
  assert.match(ordersPageSource, /filteredDeliveryDateLock === normalizedDeliveryDate/);
  assert.match(ordersPageSource, /setAutoAppliedDeliveryDateFilter\(normalizedDeliveryDate\)/);
  assert.match(ordersPageSource, /updateOrderFilterSearchParams\(searchParams, \{\s*\.\.\.orderFilters,\s*deliveryDate: normalizedDeliveryDate,\s*\}\)/);
  assert.match(ordersPageSource, /const applyOrderDeliveryDateSelectionLock = useCallback\(\(order\) => \{/);
  assert.match(ordersPageSource, /const orderDeliveryDate = getOrderDeliveryDateValue\(order\)/);
  assert.match(ordersPageSource, /routePlanDeliveryDateLock \|\| filteredDeliveryDateLock/);
  assert.match(ordersPageSource, /currentDeliveryDateLock &&[\s\S]*orderDeliveryDate !== currentDeliveryDateLock/);
  assert.match(ordersPageSource, /applyDeliveryDateFilterLock\(currentDeliveryDateLock\)/);
  assert.match(ordersPageSource, /applyDeliveryDateFilterLock\(orderDeliveryDate\)/);
  assert.match(ordersPageSource, /if \(!isAlreadyChecked && !applyOrderDeliveryDateSelectionLock\(order\)\) \{/);
  assert.match(ordersPageSource, /const sameDateSelectableOrders = getOrdersForDeliveryDate\(\s*selectableTableOrders,\s*targetDeliveryDate,\s*\)/);
  assert.match(ordersPageSource, /\.\.\.sameDateSelectableOrders\.map\(\(order\) => order\.id\)/);
  assert.match(ordersPageSource, /if \(!applyOrderDeliveryDateSelectionLock\(order\)\) \{/);
  assert.match(ordersPageSource, /const sameDateSelectedOrders = getOrdersForDeliveryDate\(\s*selectedOrders,\s*targetDeliveryDate,\s*\)/);
  assert.match(ordersPageSource, /const ROUTE_PLAN_DELIVERY_DATE_PARTIAL_ADD_ERROR =\s*"같은 배송일 주문만 route plan에 추가했습니다\."/);
  assert.match(ordersPageSource, /setCreateRouteClientError\(ROUTE_PLAN_DELIVERY_DATE_PARTIAL_ADD_ERROR\)/);
});

test("Orders auto delivery-date filter clears only itself when the draft is empty", () => {
  assert.match(ordersPageSource, /routePlanDeliveryDateLock \|\|\s*!autoAppliedDeliveryDateFilter \|\|\s*filteredDeliveryDateLock !== autoAppliedDeliveryDateFilter/);
  assert.match(ordersPageSource, /setAutoAppliedDeliveryDateFilter\(null\);\s*setSearchParams\(\s*updateOrderFilterSearchParams\(searchParams, \{\s*\.\.\.orderFilters,\s*deliveryDate: "",\s*\}\)/);
  assert.match(ordersPageSource, /filterKey === "deliveryDate"[\s\S]*setAutoAppliedDeliveryDateFilter\(\s*routePlanDeliveryDateLock && nextFilterValue === routePlanDeliveryDateLock[\s\S]*: null,\s*\)/);
  assert.match(ordersPageSource, /setAutoAppliedDeliveryDateFilter\(routePlanDeliveryDateLock \|\| null\)/);
});

test("Orders delivery-date lock survives filter clear or conflicting filter changes while a draft exists", () => {
  assert.match(ordersPageSource, /filterKey === "deliveryDate" &&\s*routePlanDeliveryDateLock &&\s*filterValue !== routePlanDeliveryDateLock/);
  assert.match(ordersPageSource, /deliveryDate: routePlanDeliveryDateLock/);
  assert.match(ordersPageSource, /const ROUTE_PLAN_DELIVERY_DATE_FILTER_LOCKED_ERROR =\s*"선택된 주문과 같은 배송일만 표시합니다/);
  assert.match(ordersPageSource, /if \(!routePlanDeliveryDateLock\) \{\s*return;\s*\}/);
  assert.match(ordersPageSource, /if \(filteredDeliveryDateLock === routePlanDeliveryDateLock\) \{\s*return;\s*\}/);
  assert.match(ordersPageSource, /setAutoAppliedDeliveryDateFilter\(routePlanDeliveryDateLock\)/);
  assert.match(ordersPageSource, /updateOrderFilterSearchParams\(searchParams, \{\s*\.\.\.orderFilters,\s*deliveryDate: routePlanDeliveryDateLock,\s*\}\)/);
});

test("Orders page shows route readiness before moving to Routes", () => {
  assert.match(ordersPageSource, /const routeReadinessStyle = \{/);
  assert.match(ordersPageSource, /const routeReadinessHeaderStyle = \{/);
  assert.match(ordersPageSource, /gridTemplateColumns:\s*"repeat\(2, minmax\(140px, 1fr\)\)"/);
  assert.match(ordersPageSource, /whiteSpace:\s*"nowrap"/);
  assert.match(ordersPageSource, /aria-label="Route readiness"/);
  assert.match(ordersPageSource, />Route readiness<\/s-heading>/);
  assert.match(ordersPageSource, /scopeLabel: formatOrderDeliveryLabel\(plannedOrders\[0\]\)/);
  assert.match(ordersPageSource, /Scope: \{routeDraftSummary\.scopeLabel\}/);
  assert.match(ordersPageSource, /Orders: \{routeDraftSummary\.orderCount\}/);
  assert.match(ordersPageSource, /Coords: \{routeDraftSummary\.locatedCount\}\/\{routeDraftSummary\.orderCount\}/);
  assert.match(ordersPageSource, /Areas: \{formatRouteDraftList\(routeDraftSummary\.deliveryAreas\)\}/);
  assert.doesNotMatch(ordersPageSource, /Missing: \{routeDraftSummary\.missingCoordinateCount\}/);
  assert.doesNotMatch(ordersPageSource, /Day: \{formatRouteDraftList\(routeDraftSummary\.deliveryDays\)\}/);
  assert.doesNotMatch(ordersPageSource, /Next: optimize → assign → schedule/);
});

test("Orders route readiness provides a manual zoom to planned route fit", () => {
  assert.match(ordersPageSource, /const handleZoomToPlanned = \(\) => \{/);
  assert.match(ordersPageSource, /fitMapToOrders\(routeFitLocations\)/);
  assert.match(ordersPageSource, /disabled=\{plannedLocatedOrders\.length === 0\}/);
  assert.match(ordersPageSource, /aria-label="Zoom to planned route"/);
  assert.match(ordersPageSource, />Zoom to planned<\/button>/);
  assert.match(ordersPageSource, /onClick=\{handleZoomToPlanned\}/);
});

test("Orders page keeps Add to plan in the table controls", () => {
  assert.match(ordersPageSource, /const handleAddToPlan = \(\) => \{/);
  assert.match(ordersPageSource, /checkedOrderIds\.length === 0/);
  assert.match(ordersPageSource, /setPlannedOrderIds\(\(currentOrderIds\) =>/);
  assert.match(ordersPageSource, />Add to plan<\/button>/);
  assert.match(ordersPageSource, /disabled=\{checkedOrderIds\.length === 0\}/);
  assert.match(ordersPageSource, /const orderControlsTrailingStyle = \{[\s\S]*?marginLeft:\s*"auto"/);
  assert.match(
    ordersPageSource,
    /<div style=\{orderControlsTrailingStyle\}>[\s\S]*>Add to plan<\/button>[\s\S]*\{filteredOrders\.length\}\/\{displayOrders\.length\} orders[\s\S]*\$\{plannedOrderIds\.length\} added to plan\.[\s\S]*<\/div>/,
  );
  assert.doesNotMatch(ordersPageSource, />Add to plan<\/button>[\s\S]{0,400}>Create route<\/button>/);
});

test("Orders table focuses on ordered date, delivery scope, and area instead of fulfillment or payment text", () => {
  assert.match(ordersPageSource, /\{ key: "deliveryArea", label: "Area" \}/);
  assert.match(ordersPageSource, /\{ key: "orderedDate", label: "Ordered" \}/);
  assert.match(ordersPageSource, /\{ key: "deliveryLabel", label: "Delivery" \}/);
  assert.match(ordersPageSource, /\{ key: "planningStatus", label: "Delivery state" \}/);
  assert.match(ordersPageSource, /const deliveryInfoCellStyle = \{/);
  assert.match(ordersPageSource, /const deliveryInfoTabStyle = \{/);
  assert.match(ordersPageSource, /const routeCreatedTabStyle = \{/);
  assert.match(ordersPageSource, /const deliveryCompleteTabStyle = \{/);
  assert.match(ordersPageSource, /const deliveryOverdueAssignedTabStyle = \{/);
  assert.match(ordersPageSource, /const deliveryOverdueUnassignedTabStyle = \{/);
  assert.match(ordersPageSource, /background:\s*"rgba\(0, 0, 0, 0\.04\)"/);
  assert.match(ordersPageSource, /color:\s*"#303030"/);
  assert.match(ordersPageSource, /function formatOrderDeliveryLabel\(order\) \{/);
  assert.match(ordersPageSource, /if \(!order\) return "—"/);
  assert.match(ordersPageSource, /: "Date pending"/);
  assert.match(ordersPageSource, /function formatOrderDeliveryState\(order, referenceDate\) \{/);
  assert.match(ordersPageSource, /getOrderDeliveryExceptionState\(order, referenceDate\)/);
  assert.match(ordersPageSource, /Assigned · overdue/);
  assert.match(ordersPageSource, /Past due/);
  assert.doesNotMatch(ordersPageSource, /Past due · unassigned/);
  assert.match(ordersPageSource, /Assigned · undelivered/);
  assert.match(ordersPageSource, /formatDeliveryValue\(order\.orderedDate\)/);
  assert.match(ordersPageSource, /formatDeliveryValue\(order\.deliveryArea\)/);
  assert.match(ordersPageSource, /formatOrderDeliveryLabel\(order\)/);
  assert.match(ordersPageSource, /formatOrderDeliveryState\(order, orderFilterReferenceDate\)/);
  assert.match(ordersPageSource, /getOrderDeliveryStateTabStyle\(order, orderFilterReferenceDate\)/);
  assert.doesNotMatch(ordersPageSource, /formatDeliveryValue\(order\.deliveryLabel\)/);
  assert.doesNotMatch(ordersPageSource, /\{ key: "deliveryDay", label: "Day" \}/);
  assert.doesNotMatch(ordersPageSource, /\{ key: "status", label: "Status" \}/);
  assert.doesNotMatch(ordersPageSource, /\{ key: "paymentStatus", label: "Payment" \}/);
  assert.doesNotMatch(ordersPageSource, /\{ key: "attributes", label: "Attributes" \}/);
  assert.doesNotMatch(ordersPageSource, /\{order\.status\}<\/td>/);
  assert.doesNotMatch(ordersPageSource, /\{order\.paymentStatus\}<\/td>/);
  assert.doesNotMatch(ordersPageSource, /\{order\.attributes\}<\/td>/);
});

test("Orders table hides orders after they move into the route plan", () => {
  assert.match(ordersPageSource, /const plannedOrderIdSet = useMemo\(\s*\(\) => new Set\(plannedOrderIds\),\s*\[plannedOrderIds\],\s*\)/);
  assert.match(ordersPageSource, /const tableOrders = useMemo\(\s*\(\) => sortedOrders\.filter\(\(order\) => !plannedOrderIdSet\.has\(order\.id\)\),\s*\[plannedOrderIdSet, sortedOrders\],\s*\)/);
  assert.match(ordersPageSource, /const selectableTableOrders = useMemo\(/);
  assert.match(ordersPageSource, /tableOrders\.filter\(\s*\(order\) =>\s*isOrderReadyToPlan\(order\) &&\s*!isOrderRoutePlanningLocked\(order, orderFilterReferenceDate\),?\s*\)/);
  assert.match(ordersPageSource, /selectableTableOrders\.length > 0 &&\s*selectableTableOrders\.every\(\(order\) => checkedOrderIdSet\.has\(order\.id\)\)/);
  assert.match(ordersPageSource, /const visibleOrderIds = new Set\(selectableTableOrders\.map\(\(order\) => order\.id\)\)/);
  assert.match(ordersPageSource, /\.\.\.sameDateSelectableOrders\.map\(\(order\) => order\.id\)/);
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

test("Orders side card manages the route plan list instead of showing only selected order details", () => {
  assert.match(ordersPageSource, /const routePlanPanelStyle = \{/);
  assert.match(ordersPageSource, /const routePlanHeaderActionsStyle = \{/);
  assert.match(ordersPageSource, /const routePlanListStyle = \{/);
  assert.match(ordersPageSource, /const handleRemoveFromPlan = \(orderId\) => \{/);
  assert.match(ordersPageSource, /setPlannedOrderIds\(\(currentOrderIds\) =>\s*currentOrderIds\.filter\(\(plannedOrderId\) => plannedOrderId !== orderId\)/);
  assert.match(ordersPageSource, /const handleClearPlan = \(\) => \{/);
  assert.match(ordersPageSource, /setPlannedOrderIds\(\[\]\)/);
  assert.match(ordersPageSource, /plannedOrders\.map\(\(order, orderIndex\) =>/);
  assert.match(ordersPageSource, /aria-label=\{`Remove \${order\.name} from route plan`\}/);
  assert.match(ordersPageSource, />Remove<\/button>/);
  assert.match(ordersPageSource, /className="order-route-plan"[\s\S]*>Create route<\/button>[\s\S]*>Clear plan<\/button>/);
  assert.match(ordersPageSource, />Clear plan<\/button>/);
  assert.doesNotMatch(ordersPageSource, /Plan에서 추가\/제거합니다/);
});

test("Orders route plan list can be reordered with a left drag handle before creation", () => {
  assert.match(ordersPageSource, /function reorderOrderIds\(orderIds, sourceOrderId, targetOrderId\) \{/);
  assert.match(ordersPageSource, /const \[activeDraggedPlanOrderId, setActiveDraggedPlanOrderId\] = useState\(null\)/);
  assert.match(ordersPageSource, /const handlePlanOrderDragStart = useCallback\(\(event, orderId\) => \{/);
  assert.match(ordersPageSource, /const handlePlanOrderDrop = useCallback\(\(event, targetOrderId\) => \{/);
  assert.match(ordersPageSource, /reorderOrderIds\(currentOrderIds, sourceOrderId, targetOrderId\)/);
  assert.match(ordersPageSource, /draggable=\{true\}/);
  assert.match(ordersPageSource, /style=\{routePlanDragHandleStyle\}/);
  assert.match(ordersPageSource, />⋮<\/span>/);
  assert.doesNotMatch(ordersPageSource, />⋮⋮<\/span>/);
  assert.match(ordersPageSource, /aria-label=\{`Drag route plan order \$\{orderIndex \+ 1\}`\}/);
  assert.match(ordersPageSource, /onDrop=\{\(event\) => handlePlanOrderDrop\(event, order\.id\)\}/);
});

test("Orders route plan side panel keeps compact copy in a fixed scroll container", () => {
  assert.match(ordersPageSource, /const routePlanScrollAreaStyle = \{/);
  assert.match(ordersPageSource, /height:\s*"420px"/);
  assert.match(ordersPageSource, /maxHeight:\s*"420px"/);
  assert.match(ordersPageSource, /gridTemplateRows:\s*"auto minmax\(0, 1fr\)"/);
  assert.match(ordersPageSource, /overflow:\s*"hidden"/);
  assert.match(ordersPageSource, /minHeight:\s*0/);
  assert.match(ordersPageSource, /overflowY:\s*"auto"/);
  assert.match(ordersPageSource, /style=\{routePlanScrollAreaStyle\}/);
  assert.match(ordersPageSource, /Plan이 비어있습니다/);
  assert.doesNotMatch(ordersPageSource, /선택 → Add to plan/);
  assert.doesNotMatch(ordersPageSource, /체크박스로 주문을 선택한 뒤 Add to plan을 누르면 route plan에 담깁니다/);
  assert.doesNotMatch(ordersPageSource, /route plan에 추가된 주문을 여기서 빼거나 지도 위치를 확인합니다/);
  assert.doesNotMatch(ordersPageSource, /아직 plan에 추가된 주문이 없습니다/);
  assert.doesNotMatch(ordersPageSource, /Routes 화면에서 최적화, 배송원 배정, 일정 조율로 이어집니다/);
});

test("Orders route plan list does not stretch a single planned order into the empty panel height", () => {
  const scrollAreaBlock = ordersPageSource.match(
    /const routePlanScrollAreaStyle = \{[\s\S]*?\n\};/,
  )?.[0] ?? "";
  const listBlock = ordersPageSource.match(
    /const routePlanListStyle = \{[\s\S]*?\n\};/,
  )?.[0] ?? "";
  const itemBlock = ordersPageSource.match(
    /const routePlanItemStyle = \{[\s\S]*?\n\};/,
  )?.[0] ?? "";

  assert.match(scrollAreaBlock, /alignContent:\s*"start"/);
  assert.match(scrollAreaBlock, /gridAutoRows:\s*"max-content"/);
  assert.match(listBlock, /alignContent:\s*"start"/);
  assert.match(listBlock, /alignSelf:\s*"start"/);
  assert.match(itemBlock, /alignSelf:\s*"start"/);
});

test("Orders route plan list stays address-first without extra order metadata", () => {
  assert.match(ordersPageSource, /\{orderIndex \+ 1\}\. \{order\.address\}/);
  assert.match(ordersPageSource, /className="route-plan-address-button"/);
  assert.match(ordersPageSource, /const routePlanOrderButtonStyle = \{[\s\S]*?fontSize:\s*"12px"/);
  assert.match(ordersPageSource, /const routePlanOrderButtonStyle = \{[\s\S]*?lineHeight:\s*1\.35/);
  assert.match(globalCssSource, /\.route-plan-address-button\s*\{[\s\S]*?font-size:\s*12px !important/);
  assert.match(globalCssSource, /\.route-plan-address-button\s*\{[\s\S]*?line-height:\s*1\.35 !important/);
  assert.doesNotMatch(ordersPageSource, /\{orderIndex \+ 1\}\. \{order\.name\} · \{order\.customer\}/);
  assert.doesNotMatch(ordersPageSource, /\{order\.status\} · \{order\.paymentStatus\}/);
  assert.doesNotMatch(ordersPageSource, /\{order\.deliveryArea \? ` · \$\{order\.deliveryArea\}` : ""\}/);
  assert.doesNotMatch(ordersPageSource, /\{order\.deliveryDay \? ` · \$\{order\.deliveryDay\}` : ""\}/);
});

test("Orders map highlights markers that were added to the plan", () => {
  assert.match(ordersPageSource, /function createOrderPinImageData\(color, options = \{\}\) \{/);
  assert.match(ordersPageSource, /const ORDER_PIN_IMAGE_ID = "orders-map-pin"/);
  assert.match(ordersPageSource, /const ORDER_PIN_PLANNED_IMAGE_ID = "orders-map-pin-planned"/);
  assert.match(ordersPageSource, /id: ORDER_PIN_IMAGE_ID,\s+imageData: createOrderPinImageData\("#006fbb"/);
  assert.match(ordersPageSource, /id: ORDER_PIN_PLANNED_IMAGE_ID,\s+imageData: createOrderPinImageData\("#e11900"/);
  assert.match(ordersPageSource, /map\.addImage\(image\.id, image\.imageData, \{ pixelRatio: ORDER_PIN_PIXEL_RATIO \}\)/);
  assert.match(ordersPageSource, /function buildOrdersMapFeatureCollection\(orders, plannedOrderIds\) \{/);
  assert.match(ordersPageSource, /const plannedIndex = plannedOrderIds\.indexOf\(order\.id\) \+ 1/);
  assert.match(ordersPageSource, /pinImage: isPlanned \? ORDER_PIN_PLANNED_IMAGE_ID : ORDER_PIN_IMAGE_ID/);
  assert.match(ordersPageSource, /plannedLabel: isPlanned \? String\(plannedIndex\) : ""/);
  assert.match(ordersPageSource, /"icon-image": \["get", "pinImage"\]/);
  assert.match(ordersPageSource, /"text-field": \["get", "plannedLabel"\]/);
  assert.doesNotMatch(ordersPageSource, /function createOrderMarkerElement\(order, plannedIndex\)/);
});

test("Orders map marker popup can add the clicked order to the route plan", () => {
  assert.match(ordersPageSource, /function createOrderMarkerPopupElement\(order, plannedIndex, onAddToPlan, referenceDate\)/);
  assert.match(ordersPageSource, /const deliveryMetaValues = \[order\.deliveryArea, formatOrderDeliveryLabel\(order\)\]\.filter\(Boolean\)/);
  assert.match(ordersPageSource, /metaTabElement\.className = "order-marker-popup__meta-tab"/);
  assert.match(globalCssSource, /\.order-marker-popup__meta-tab\s*\{/);
  assert.match(globalCssSource, /background:\s*rgba\(0, 0, 0, 0\.05\)/);
  assert.match(globalCssSource, /color:\s*#303030/);
  assert.match(ordersPageSource, /const routePlanningLocked = isOrderRoutePlanningLocked\(order, referenceDate\)/);
  assert.match(ordersPageSource, /const routePlanningUnavailable = routePlanningLocked \|\| !isOrderReadyToPlan\(order\)/);
  assert.match(ordersPageSource, /routePlanningLocked\s*\?\s*formatOrderDeliveryState\(order, referenceDate\)[\s\S]*:\s*routePlanningUnavailable\s*\?\s*"Needs review"[\s\S]*:\s*"Add to plan"/);
  assert.match(ordersPageSource, /popupActionButton\.disabled = plannedIndex > 0 \|\| routePlanningUnavailable/);
  assert.match(ordersPageSource, /popupActionButton\.addEventListener\("click", \(event\) => \{/);
  assert.match(ordersPageSource, /if \(routePlanningUnavailable\) return/);
  assert.match(ordersPageSource, /onAddToPlan\(order\.id\)/);
  assert.match(
    ordersPageSource,
    /\.setDOMContent\(\s*createOrderMarkerPopupElement\(\s*order,\s*plannedIndex,\s*handleAddOrderToPlan,\s*orderFilterReferenceDate,\s*\),\s*\)/,
  );
  const popupBlock = ordersPageSource.match(
    /function createOrderMarkerPopupElement\(order, plannedIndex, onAddToPlan, referenceDate\) \{[\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.doesNotMatch(popupBlock, /order\.status/);
  assert.doesNotMatch(popupBlock, /order\.paymentStatus/);
});

test("Orders map popup content stays above all map markers", () => {
  assert.match(ordersPageSource, /map\.addLayer\(\{\s+id: ORDERS_MAP_ORDER_LAYER_ID,\s+type: "symbol"/);
  assert.match(ordersPageSource, /"symbol-sort-key": \["get", "sortKey"\]/);
  assert.match(ordersPageSource, /markerElement\.style\.zIndex = "3000"/);
  assert.match(globalCssSource, /\.maplibregl-popup\s*\{/);
  assert.match(globalCssSource, /z-index:\s*5000/);
});

test("Orders map has a compact refresh control for recovering failed tile loads", () => {
  assert.match(ordersPageSource, /const \[mapRenderKey, setMapRenderKey\] = useState\(0\)/);
  assert.match(ordersPageSource, /const handleRefreshMap = \(\) => \{/);
  assert.match(ordersPageSource, /setIsMapReady\(false\)/);
  assert.match(ordersPageSource, /setMapStatus\("idle"\)/);
  assert.match(ordersPageSource, /setMapRenderKey\(\(currentRenderKey\) => currentRenderKey \+ 1\)/);
  assert.match(ordersPageSource, /\}, \[mapRenderKey, scheduleMapRecovery\]\)/);
  assert.match(ordersPageSource, /aria-label="Refresh map"/);
  assert.match(ordersPageSource, /const mapToolbarButtonStyle = \{/);
  assert.match(ordersPageSource, /const mapToolbarIconStyle = \{/);
  assert.match(ordersPageSource, /width: "16px"/);
  assert.match(ordersPageSource, /height: "16px"/);
  assert.match(ordersPageSource, /function renderRefreshIcon\(\) \{/);
  assert.match(ordersPageSource, /viewBox="0 0 20 20"/);
  assert.match(ordersPageSource, /strokeWidth="1\.8"/);
  assert.doesNotMatch(ordersPageSource, /aria-hidden="true">↻<\/span>/);
  assert.match(ordersPageSource, /onClick=\{handleRefreshMap\}/);
  assert.doesNotMatch(ordersPageSource, />Re-render map<\/button>/);
});

test("Orders map has a compact width toggle that is not browser fullscreen", () => {
  assert.match(ordersPageSource, /const \[isMapWide, setIsMapWide\] = useState\(false\)/);
  assert.match(ordersPageSource, /const handleToggleMapWide = \(\) => \{/);
  assert.match(ordersPageSource, /setIsMapWide\(\(currentIsMapWide\) => !currentIsMapWide\)/);
  assert.match(ordersPageSource, /primaryExpanded=\{isMapWide\}/);
  assert.match(ordersPageSource, /aria-label=\{isMapWide \? "Restore map width" : "Expand map width"\}/);
  assert.match(ordersPageSource, /function renderWidthIcon\(isMapWide\) \{/);
  assert.match(ordersPageSource, /isMapWide \? renderRestoreWidthIcon\(\) : renderExpandWidthIcon\(\)/);
  assert.match(ordersPageSource, /function renderRestoreWidthIcon\(\) \{/);
  assert.match(ordersPageSource, /<path d="m3 6 4 4-4 4" \/>/);
  assert.match(ordersPageSource, /<path d="m17 6-4 4 4 4" \/>/);
  assert.doesNotMatch(ordersPageSource, /<path d="m4 7 3 3-3 3" \/>/);
  assert.doesNotMatch(ordersPageSource, /<path d="m16 7-3 3 3 3" \/>/);
  assert.doesNotMatch(ordersPageSource, /<path d="m6 7 3 3-3 3" \/>/);
  assert.doesNotMatch(ordersPageSource, /<path d="m14 7-3 3 3 3" \/>/);
  assert.doesNotMatch(ordersPageSource, /<rect /);
  assert.doesNotMatch(ordersPageSource, /<path d="M3 10h14" \/>/);
  assert.doesNotMatch(ordersPageSource, /<path d="M3 10h6" \/>/);
  assert.doesNotMatch(ordersPageSource, /<path d="M17 10h-6" \/>/);
  assert.doesNotMatch(ordersPageSource, /isMapWide \? "⤡" : "⤢"/);
  assert.match(ordersPageSource, /onClick=\{handleToggleMapWide\}/);
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
  assert.match(ordersPageSource, /const scheduleMapRecovery = useCallback\(\(\) => \{/);
  assert.match(ordersPageSource, /MAX_MAP_RECOVERY_ATTEMPTS/);
  assert.match(ordersPageSource, /MAP_RECOVERY_DELAY_MS/);
  assert.match(ordersPageSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(ordersPageSource, /setMapRenderKey\(\(currentRenderKey\) => currentRenderKey \+ 1\)/);
  assert.match(ordersPageSource, /import \{ installMissingMapImageFallback \} from "\.\.\/features\/maps\/maplibre-missing-images"/);
  assert.match(ordersPageSource, /installMissingMapImageFallback\(mapRef\.current\)/);
  assert.match(ordersPageSource, /mapRef\.current\.on\("error", \(event\) => \{/);
  assert.match(ordersPageSource, /tiles\.openfreemap\.org/);
  assert.match(ordersPageSource, /AJAXError/);
  assert.match(ordersPageSource, /setMapStatus\("recovering"\)/);
  assert.match(ordersPageSource, /setMapStatus\("failed"\)/);
  assert.match(ordersPageSource, /\{mapStatus !== "idle" \? \(/);
  assert.doesNotMatch(ordersPageSource, /지도 타일을 불러오지 못했습니다/);
});

test("Orders map zooms to fit the route plan only when the table Add to plan action registers orders", () => {
  const markerPopupAddBlock = ordersPageSource.match(
    /const handleAddOrderToPlan = useCallback\(\(orderId\) => \{[\s\S]*?\n  \]\);/,
  )?.[0] ?? "";
  const tableAddBlock = ordersPageSource.match(
    /const handleAddToPlan = \(\) => \{[\s\S]*?\n  \};/,
  )?.[0] ?? "";

  assert.match(ordersPageSource, /const \[planFitRequest, setPlanFitRequest\] = useState\(0\)/);
  assert.match(ordersPageSource, /const plannedLocatedOrders = useMemo\(\(\) =>/);
  assert.match(ordersPageSource, /plannedOrders\.filter\(\(order\) => order\.hasCoordinates\)/);
  assert.match(ordersPageSource, /const fitMapToOrders = useCallback\(\(ordersToFit\) => \{/);
  assert.match(ordersPageSource, /new maplibregl\.LngLatBounds\(/);
  assert.match(ordersPageSource, /mapRef\.current\.fitBounds\(bounds,/);
  assert.doesNotMatch(markerPopupAddBlock, /setPlanFitRequest/);
  assert.match(tableAddBlock, /setPlanFitRequest\(\(requestCount\) => requestCount \+ 1\)/);
  assert.match(ordersPageSource, /if \(planFitRequest === 0\) return/);
  assert.match(ordersPageSource, /const routeFitLocations = useMemo\(\s*\(\) =>/);
  assert.match(ordersPageSource, /departureLocation\?\.hasCoordinates/);
  assert.match(ordersPageSource, /fitMapToOrders\(routeFitLocations\)/);
});

test("Orders map shows the Shopify departure location as the route start point", () => {
  assert.match(ordersPageSource, /const \{ orders, errors, departureLocation/);
  assert.match(ordersPageSource, /function createDepartureMarkerElement\(departureLocation\)/);
  assert.match(ordersPageSource, /function createDepartureMarkerIconElement\(\)/);
  assert.match(ordersPageSource, /departure-map-marker/);
  assert.match(ordersPageSource, /departure-map-marker__icon/);
  assert.match(ordersPageSource, /markerPinElement\.append\(createDepartureMarkerIconElement\(\)\)/);
  assert.doesNotMatch(ordersPageSource, /markerPinElement\.textContent = "Start"/);
  assert.match(ordersPageSource, /markerElement\.style\.zIndex = "3000"/);
  assert.match(ordersPageSource, /departureLocation\?\.hasCoordinates \? departureLocation\.coordinates : DEFAULT_CENTER/);
  assert.match(ordersPageSource, /new maplibregl\.Marker\(\{ element: departureMarkerElement, anchor: "bottom" \}\)/);
  assert.match(ordersPageSource, /\.setLngLat\(departureLocation\.coordinates\)/);
  assert.match(ordersPageSource, /markerElement\.setAttribute\("aria-label", `Route start: \$\{departureLocation\.name\}`\)/);
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
  assert.doesNotMatch(ordersPageSource, /\}, \[initialMapCenter, mapRenderKey, scheduleMapRecovery\]\);/);
  assert.match(ordersPageSource, /\}, \[mapRenderKey, scheduleMapRecovery\]\);/);
  assert.match(ordersPageSource, /const initialMapFitAppliedRef = useRef\(false\)/);
  assert.match(ordersPageSource, /initialMapFitAppliedRef\.current = false/);
  assert.match(ordersPageSource, /mapRef\.current\.flyTo\(\{\s*center: initialMapCenter,\s*zoom: INITIAL_HOME_ZOOM,\s*essential: true,\s*\}\)/);
  assert.doesNotMatch(ordersPageSource, /const firstLocatedOrder = useMemo/);
  assert.doesNotMatch(ordersPageSource, /fitMapToOrders\(initialMapFitLocations\)/);
  assert.match(ordersPageSource, /const handleSelectOrder = useCallback\(\(orderId, options = \{\}\) => \{/);
  assert.match(ordersPageSource, /if \(options\.focusMap !== false\)/);
  assert.match(ordersPageSource, /selectedOrderFocusRequest === 0/);
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
  assert.match(ordersPageSource, /sortKey: isPlanned \? 1000 \+ plannedIndex : 1/);
  assert.match(ordersPageSource, /"symbol-sort-key": \["get", "sortKey"\]/);
  assert.match(ordersPageSource, /"icon-allow-overlap": true/);
  assert.match(ordersPageSource, /"icon-ignore-placement": true/);
  assert.doesNotMatch(ordersPageSource, /sortedLocatedOrders/);
});

test("Orders map keeps planned pins the same size and centers the planned number", () => {
  assert.match(ordersPageSource, /const ORDER_PIN_PIXEL_RATIO = 2/);
  assert.match(ordersPageSource, /const width = \(options\.width \?\? 40\) \* pixelRatio/);
  assert.match(ordersPageSource, /const height = \(options\.height \?\? 52\) \* pixelRatio/);
  assert.match(ordersPageSource, /const ORDER_PIN_ICON_SIZE = 0\.62/);
  assert.match(ordersPageSource, /const ORDER_PIN_LABEL_OFFSET = \[0, -1\.92\]/);
  assert.match(ordersPageSource, /"icon-size": ORDER_PIN_ICON_SIZE/);
  assert.doesNotMatch(ordersPageSource, /"icon-size": \[\s+"case"/);
  assert.match(ordersPageSource, /"text-offset": ORDER_PIN_LABEL_OFFSET/);
  assert.match(ordersPageSource, /"text-size": 11/);

  const plannedMarkerBlock = globalCssSource.match(/\.order-map-marker--planned \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(plannedMarkerBlock, /--marker-color: #e11900/);
  assert.doesNotMatch(plannedMarkerBlock, /--marker-height|--marker-width|--marker-label-size|--marker-label-top|font-size/);
});

test("Orders table headers sort rows by ascending and descending values", () => {
  assert.match(ordersPageSource, /const SORTABLE_ORDER_COLUMNS = \[/);
  assert.match(ordersPageSource, /const \[sortConfig, setSortConfig\] = useState\(null\)/);
  assert.match(ordersPageSource, /const sortedOrders = useMemo\(\(\) =>/);
  assert.match(ordersPageSource, /if \(columnKey === "deliveryLabel"\) \{/);
  assert.match(ordersPageSource, /return getOrderDeliveryDateValue\(order\) \|\| order\.deliveryLabel \|\| ""/);
  assert.match(ordersPageSource, /const tableOrders = useMemo\(\s*\(\) => sortedOrders\.filter/);
  assert.match(ordersPageSource, /handleSort\(column\.key\)/);
  assert.match(ordersPageSource, /aria-sort=\{/);
  assert.match(ordersPageSource, /tableOrders\.map\(\(order\) =>/);
  assert.doesNotMatch(ordersPageSource, /safeOrders\.map\(\(order\) =>\s*\(\s*<tr/);
});

test("Orders page filters table rows by area, delivery date, and ordered date without search", () => {
  assert.match(ordersPageSource, /import \{ useFetcher, useLoaderData, useNavigate, useRouteError, useSearchParams \} from "react-router"/);
  assert.match(ordersPageSource, /import \{[\s\S]*filterOrders[\s\S]*getOrderFilterOptions[\s\S]*getOrderFiltersFromSearchParams[\s\S]*hasActiveOrderFilters[\s\S]*isOrderRouteCreated[\s\S]*updateOrderFilterSearchParams[\s\S]*\} from "\.\.\/features\/orders\/order-filters"/);
  assert.match(ordersPageSource, /const \[searchParams, setSearchParams\] = useSearchParams\(\)/);
  assert.match(ordersPageSource, /const orderFilters = useMemo\(\s*\(\) => getOrderFiltersFromSearchParams\(searchParams\),\s*\[searchParams\],\s*\)/);
  assert.match(ordersPageSource, /const \{ orders, errors, departureLocation, perf, shopLocalDate \} = useLoaderData\(\)/);
  assert.match(ordersPageSource, /const orderFilterReferenceDate = useMemo\(\s*\(\) => shopLocalDate \?\? new Date\(\),\s*\[shopLocalDate\],\s*\)/);
  assert.match(ordersPageSource, /const orderFilterOptionOrders = useMemo\(\s*\(\) => filterOrders\(displayOrders, \{[\s\S]*?planned: orderFilters\.planned,[\s\S]*?referenceDate: orderFilterReferenceDate,[\s\S]*?\}\),\s*\[displayOrders, orderFilters\.planned, orderFilterReferenceDate\],\s*\)/);
  assert.match(ordersPageSource, /const orderFilterOptions = useMemo\(\s*\(\) => getOrderFilterOptions\(orderFilterOptionOrders\),\s*\[orderFilterOptionOrders\],\s*\)/);
  assert.match(ordersPageSource, /const filteredOrders = useMemo\(\s*\(\) => filterOrders\(displayOrders, \{[\s\S]*?\.\.\.orderFilters,[\s\S]*?referenceDate: orderFilterReferenceDate,[\s\S]*?\}\),\s*\[displayOrders, orderFilters, orderFilterReferenceDate\],\s*\)/);
  assert.match(ordersPageSource, /getOrderSortValue\(leftOrder, sortConfig\.key, orderFilterReferenceDate\)/);
  assert.match(ordersPageSource, /isOrderRoutePlanningLocked\(order, orderFilterReferenceDate\)/);
  assert.match(ordersPageSource, /const sortedOrders = useMemo\(\(\) => \{\s*if \(!sortConfig\) return filteredOrders/);
  assert.match(ordersPageSource, /aria-label="Filter orders by delivery area"/);
  assert.match(ordersPageSource, /aria-label="Filter orders by delivery date"/);
  assert.match(ordersPageSource, /aria-label="Filter orders by ordered date"/);
  assert.doesNotMatch(ordersPageSource, /aria-label="Search orders"/);
  assert.doesNotMatch(ordersPageSource, /placeholder="Search order, recipient, address"/);
  assert.doesNotMatch(ordersPageSource, /type="search"/);
  assert.doesNotMatch(ordersPageSource, /handleOrderFilterChange\("search"/);
  assert.doesNotMatch(ordersPageSource, /orderFilters\.search/);
  assert.match(ordersPageSource, />Clear filters<\/button>/);
  assert.match(ordersPageSource, /const allOrdersShown = orderFilters\.planned === "all"/);
  assert.match(ordersPageSource, /handleOrderFilterChange\("planned", allOrdersShown \? "" : "all"\)/);
  assert.match(ordersPageSource, /aria-pressed=\{allOrdersShown\}/);
  assert.match(ordersPageSource, /const orderFilterButtonStyle = \{/);
  assert.match(ordersPageSource, /const activeOrderFilterButtonStyle = \{/);
  assert.match(ordersPageSource, /style=\{allOrdersShown \? activeOrderFilterButtonStyle : orderFilterButtonStyle\}/);
  assert.match(ordersPageSource, /style=\{activeOrderFilters \? orderFilterButtonStyle : disabledOrderFilterButtonStyle\}/);
  assert.match(ordersPageSource, />\s*All\s*<\/button>/);
  assert.match(
    ordersPageSource,
    /aria-pressed=\{allOrdersShown\}[\s\S]*>\s*All\s*<\/button>[\s\S]*>Clear filters<\/button>/,
  );
  assert.doesNotMatch(ordersPageSource, />\s*Un-routed\s*<\/button>/);
  assert.doesNotMatch(ordersPageSource, /Show routed orders/);
  assert.doesNotMatch(ordersPageSource, /Show all orders/);
});

test("Orders filters hide non-target map markers without reshaping matched markers", () => {
  assert.match(ordersPageSource, /const activeOrderFilters = useMemo\(\s*\(\) => hasActiveOrderFilters\(orderFilters\),\s*\[orderFilters\],\s*\)/);
  assert.match(ordersPageSource, /const locatedOrders = useMemo\(\s*\(\) => filteredOrders\.filter\(\(order\) => order\.hasCoordinates\),\s*\[filteredOrders\],\s*\)/);
  assert.match(ordersPageSource, /syncOrdersMapMarkerLayer\(map, locatedOrders, plannedOrderIds\)/);
  assert.match(ordersPageSource, /existingSource\.setData\(featureCollection\)/);
  assert.match(ordersPageSource, /map\.addSource\(ORDERS_MAP_SOURCE_ID/);
  assert.doesNotMatch(ordersPageSource, /function createOrderMarkerElement\(order, plannedIndex\)/);
  assert.doesNotMatch(ordersPageSource, /filteredOrderIdSet/);
  assert.doesNotMatch(ordersPageSource, /markerMatchState/);
  assert.doesNotMatch(ordersPageSource, /order-map-marker--matched/);
  assert.doesNotMatch(ordersPageSource, /order-map-marker--dimmed/);
  assert.doesNotMatch(globalCssSource, /\.order-map-marker--matched\s*\{/);
  assert.doesNotMatch(globalCssSource, /\.order-map-marker--dimmed\s*\{/);
});

test("Shopify order mapping avoids Customer object and keeps coordinate metadata", () => {
  assert.match(shopifyOrdersSource, /export const SHOPIFY_ORDERS_QUERY/);
  assert.doesNotMatch(shopifyOrdersSource, /customer\s*\{/);
  assert.match(shopifyOrdersSource, /shippingAddress\s*\{/);
  assert.match(shopifyOrdersSource, /coordinates: \[longitude, latitude\]/);
});
