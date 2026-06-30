import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readOrdersPageSource } from "./helpers/orders-source.mjs";

const root = process.cwd();

const ordersPageSource = readOrdersPageSource();
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
  assert.match(ordersPageSource, /fetchShopifyOrders\(admin,\s*\{\s*cacheKey: shopifyShopCacheKey,?\s*\}\)/);
  assert.match(ordersPageSource, /fetchShopifyOrders\(admin\)/);
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
  assert.match(ordersPageSource, /function buildOrdersMapFeatureCollection\(orders, plannedOrderIds\) \{/);
  assert.match(ordersPageSource, /\.filter\(\(order\) => order\.hasCoordinates && plannedIndexByOrderId\.has\(order\.id\)\)/);
  assert.match(ordersPageSource, /syncOrdersMapMarkerLayer\(map, locatedOrders, plannedOrderIds\)/);
});

test("Orders table container uses viewport height and scrolls internally", () => {
  assert.match(ordersPageSource, /height:\s*"calc\(100vh - 150px\)"/);
  assert.match(ordersPageSource, /minHeight:\s*"320px"/);
  assert.match(ordersPageSource, /overflowY:\s*"auto"/);
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
  assert.match(orderControlsStyleBlock, /flexWrap:\s*"wrap"/);
  assert.doesNotMatch(orderControlsStyleBlock, /maxWidth:\s*"100%"/);
  assert.doesNotMatch(orderControlsStyleBlock, /overflowX:\s*"visible"/);
  assert.doesNotMatch(orderControlsStyleBlock, /overflowY:\s*"visible"/);
  assert.match(ordersPageSource, /className="orders-error-filter" role="alert" style=\{orderPageNoticeStyle\}/);
  assert.doesNotMatch(ordersPageSource, /<s-banner tone="critical">/);
  assert.match(ordersPageSource, /<div style=\{orderControlsStyle\}>/);
  assert.match(ordersPageSource, /getServiceErrorNotice\(\[/);
  assert.match(ordersPageSource, /collectServiceErrors\(\s*\[orderData, departureLocationData, serverOrderData, inventoryData\]/);
  assert.doesNotMatch(ordersPageSource, /style=\{orderFilterBarStyle\}/);
  assert.doesNotMatch(ordersPageSource, /style=\{planActionRowStyle\}/);
  assert.match(ordersPageSource, /<div style=\{tableWrapStyle\}>\s*<table/s);
});

test("Orders table uses a compact centered layout", () => {
  assert.match(ordersPageSource, /width:\s*"100%"/);
  assert.match(ordersPageSource, /minWidth:\s*"960px"/);
  assert.match(ordersPageSource, /tableLayout:\s*"fixed"/);
  assert.match(ordersPageSource, /const tableCellStyle = \{/);
  assert.match(ordersPageSource, /padding:\s*"6px 8px"/);
  assert.match(ordersPageSource, /textAlign:\s*"left"/);
  assert.match(ordersPageSource, /whiteSpace:\s*"nowrap"/);
  assert.match(ordersPageSource, /overflow:\s*"hidden"/);
  assert.match(ordersPageSource, /textOverflow:\s*"ellipsis"/);
  assert.doesNotMatch(ordersPageSource, /wordBreak:\s*"break-word"/);
});

test("Orders table has a compact checkbox column for route-plan candidates", () => {
  assert.match(ordersPageSource, /const \[checkedOrderIds, setCheckedOrderIds\] = useState\(\[\]\)/);
  assert.match(ordersPageSource, /const \[plannedOrderIds, setPlannedOrderIds\] = useState\(\[\]\)/);
  assert.match(ordersPageSource, /const ORDER_TABLE_COLUMN_WIDTHS = \{/);
  assert.match(ordersPageSource, /address: "24%"/);
  assert.match(ordersPageSource, /itemCount: "6%"/);
  assert.match(ordersPageSource, /planningStatus: "7%"/);
  assert.match(ordersPageSource, /hasCoordinates: "6%"/);
  assert.match(ordersPageSource, /const DEFAULT_TABLE_COLUMN_WIDTHS = \[\s*ORDER_TABLE_COLUMN_WIDTHS\.select,[\s\S]*?SORTABLE_ORDER_COLUMNS\.map\(\(column\) => ORDER_TABLE_COLUMN_WIDTHS\[column\.key\]\)/);
  assert.match(ordersPageSource, /aria-label="Select all visible orders for plan"/);
  assert.match(ordersPageSource, /const orderIsPlanned = plannedOrderIdSet\.has\(order\.id\)/);
  assert.match(ordersPageSource, /const checkboxChecked = orderIsPlanned \|\| checkedOrderIdSet\.has\(order\.id\)/);
  assert.match(ordersPageSource, /`Select \${order\.name} for plan`/);
  assert.match(ordersPageSource, /checked=\{checkboxChecked\}/);
  assert.match(ordersPageSource, /disabled=\{orderIsPlanned\}/);
  assert.doesNotMatch(ordersPageSource, /routePlanningUnavailable/);
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


test("Orders page creates grouped child routes from scoped planned orders", () => {
  assert.match(ordersPageSource, /import \{ useAppBridge \} from "@shopify\/app-bridge-react"/);
  assert.match(ordersPageSource, /import \{ useFetcher, useLoaderData, useNavigate, useSearchParams \} from "react-router"/);
  assert.match(ordersPageSource, /import \{[\s\S]*buildCreateRoutePlanPayload[\s\S]*\} from "(?:\.\.\/features\/delivery|\.\.\/delivery)\/route-plans\.server"/);
  assert.match(ordersPageSource, /import \{[\s\S]*createDeliveryRouteGroup[\s\S]*generateDeliveryRouteGroupChildRoutes[\s\S]*\} from "(?:\.\.\/features\/delivery|\.\.\/delivery)\/route-groups\.server"/);
  assert.match(ordersPageSource, /import \{ buildRouteScopeFromOrders \} from "(?:\.\.\/features\/delivery|\.\.\/delivery)\/route-scope"/);
  assert.match(ordersPageSource, /export const action = async \(\{ request \}\) => \{/);
  assert.match(ordersPageSource, /const formData = await request\.formData\(\)/);
  assert.match(ordersPageSource, /JSON\.parse\(formData\.get\("plannedOrderIds"\) \?\? "\[\]"\)/);
  assert.match(ordersPageSource, /JSON\.parse\(formData\.get\("routeScope"\) \?\? "null"\)/);
  assert.match(ordersPageSource, /const routeName = textOrUndefined\(formData\.get\("routeName"\)\)/);
  assert.match(ordersPageSource, /const shopifySessionToken = formData\.get\("shopifySessionToken"\)/);
  assert.match(ordersPageSource, /reason: "route_create_preflight"/);
  assert.match(ordersPageSource, /buildCreateRoutePlanPayload\(\{/);
  assert.match(ordersPageSource, /routeName,/);
  assert.match(ordersPageSource, /routeScope,/);
  assert.match(ordersPageSource, /createDeliveryRouteGroup\(\s*request,\s*buildCreateRouteGroupPayload\(\{/s);
  assert.match(ordersPageSource, /generateDeliveryRouteGroupChildRoutes\(\s*request,\s*routeGroup\.id,/s);
  assert.match(ordersPageSource, /const routePlan = getFirstRouteGroupRoutePlan\(generatedRouteGroup\)/);
  assert.match(ordersPageSource, /return \{ routePlan, routeGroup: generatedRouteGroup, errors: \[\] \}/);
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
  assert.match(ordersPageSource, /navigate\(appendIdToken\(routeGroupPath\(createdRouteGroup\.id\), sessionToken\)\)/);
  assert.match(ordersPageSource, /navigate\(appendIdToken\(routePlanPath\(createdRoutePlan\.id\), sessionToken\)\)/);
  assert.match(ordersPageSource, />Assign to route<\/button>/);
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
  assert.match(ordersPageSource, /const ORDER_STATE_CHANGE_OPTIONS = \[/);
  assert.match(ordersPageSource, /\{ label: "Delivered", value: "DELIVERED" \}/);
  assert.match(ordersPageSource, /const ORDER_PAYMENT_CHANGE_OPTIONS = \[/);
  assert.match(ordersPageSource, /\{ label: "Cash", value: "CASH" \}/);
  assert.match(ordersPageSource, /\{ label: "eTransfer", value: "ETRANSFER" \}/);
  assert.match(ordersPageSource, /const orderBulkUpdateFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /if \(intent === "bulkUpdateOrders"\)/);
  assert.match(ordersPageSource, /bulkUpdateDeliveryOrders\(\s*request,\s*\{ field, orderIds, value \},\s*\{ sessionToken: shopifySessionToken \},?\s*\)/);
  assert.match(ordersPageSource, /const bulkUpdatedOrders = useMemo\(/);
  assert.match(ordersPageSource, /mergeShopifyOrderRowsWithCanonicalRows\(syncMergedOrders, bulkUpdatedOrders\)/);
  assert.match(ordersPageSource, /const checkedServerOrderIds = useMemo\(/);
  assert.match(ordersPageSource, /checkedOrders\.map\(\(order\) => order\.orderId\)\.filter\(Boolean\)/);
  assert.match(ordersPageSource, /formData\.set\("_intent", "bulkUpdateOrders"\)/);
  assert.match(ordersPageSource, /formData\.set\("orderIds", JSON\.stringify\(checkedServerOrderIds\)\)/);
  assert.match(ordersPageSource, /orderBulkUpdateFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(ordersPageSource, />Action<\/button>/);
  assert.match(ordersPageSource, /aria-modal="true" role="dialog"/);
  assert.match(ordersPageSource, /Change \{option\.label\}/);
  assert.match(ordersPageSource, />Save<\/button>/);
  assert.match(ordersPageSource, />Cancel<\/button>/);
});

test("Orders loader merges delivery server planning state before background sync", () => {
  assert.match(ordersPageSource, /const serverOrdersStartedAt = getSafePerformanceNow\(\)/);
  assert.match(ordersPageSource, /const serverOrderDataPromise = fetchDeliveryOrders\(\s*request,\s*\{\},\s*\{\s*cacheKey: shopifyShopCacheKey,?\s*\},?\s*\)\.then/);
  assert.match(ordersPageSource, /const serverOrderRows = mapCanonicalOrdersToOrderRows\(serverOrderData\.orders\)/);
  assert.match(ordersPageSource, /const mergedOrders = mergeShopifyOrderRowsWithCanonicalRows\(\s*orderData\.orders,\s*serverOrderRows,\s*\)/);
  assert.match(ordersPageSource, /orders: mergedOrders/);
  assert.match(ordersPageSource, /serverOrdersMs: serverOrderDataResult\.durationMs/);
  assert.match(ordersPageSource, /needsSessionTokenRefresh: hasSessionTokenRefreshError\(\[serverOrderData, inventoryData\]\)/);
  assert.match(ordersPageSource, /DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE/);
  assert.match(ordersPageSource, /INVALID_SHOPIFY_SESSION_TOKEN_MESSAGE = "Invalid Shopify session token"/);
  assert.match(ordersPageSource, /error\?\.code === "UNAUTHORIZED"[\s\S]*error\?\.message === INVALID_SHOPIFY_SESSION_TOKEN_MESSAGE/);
});

test("Orders page refreshes once with a Shopify id_token after a loader token auth error", () => {
  assert.match(ordersPageSource, /const sessionTokenRefreshSubmittedRef = useRef\(false\)/);
  assert.match(ordersPageSource, /const SESSION_TOKEN_REFRESH_PARAM = "_shopify_session_refreshed"/);
  assert.match(ordersPageSource, /if \(!needsSessionTokenRefresh \|\| searchParams\.get\(SESSION_TOKEN_REFRESH_PARAM\)\) return/);
  assert.match(ordersPageSource, /if \(sessionTokenRefreshSubmittedRef\.current\) return/);
  assert.match(ordersPageSource, /const nextSearchParams = new URLSearchParams\(searchParams\)/);
  assert.match(ordersPageSource, /nextSearchParams\.set\("id_token", sessionToken\)/);
  assert.match(ordersPageSource, /nextSearchParams\.set\(SESSION_TOKEN_REFRESH_PARAM, "1"\)/);
  assert.match(ordersPageSource, /setSearchParams\(nextSearchParams, \{\s*preventScrollReset: true,\s*replace: true,\s*\}\)/);
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
  assert.match(ordersPageSource, /const orderFilterReferenceDate = useMemo/);
});

test("Orders page syncs loaded Shopify snapshots without adding sync cards", () => {
  assert.match(ordersPageSource, /const ordersSyncFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /const orderSyncSubmittedRef = useRef\(false\)/);
  assert.match(ordersPageSource, /getOrderSyncSnapshots\(safeOrders\)/);
  assert.match(ordersPageSource, /ordersSyncFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(ordersPageSource, /mapCanonicalOrdersToOrderRows\(ordersSyncFetcher\.data\?\.syncedOrders\)/);
  assert.match(ordersPageSource, /const displayOrders = useMemo\(/);
  assert.match(ordersPageSource, /syncedOrders\.length > 0[\s\S]*mergeShopifyOrderRowsWithCanonicalRows\(safeOrders, syncedOrders\)[\s\S]*: safeOrders/);
  assert.doesNotMatch(ordersPageSource, /Orders sync KPI/);
  assert.doesNotMatch(ordersPageSource, /orders sync card/i);
  assert.doesNotMatch(ordersPageSource, /sync status panel/i);
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
  assert.match(ordersPageSource, /const plannedShopifyOrders = orderData\.orders\.filter\(\s*\(order\) =>\s*plannedOrderIdSet\.has\(order\.id\),?\s*\)/);
  assert.match(ordersPageSource, /const plannedShopifyOrderSnapshots = getOrderSyncSnapshots\(plannedShopifyOrders\)/);
  assert.match(ordersPageSource, /plannedShopifyOrderSnapshots\.length > 0\s*\?\s*await syncDeliveryOrders/);
  assert.match(ordersPageSource, /orders: plannedShopifyOrderSnapshots/);
  assert.match(ordersPageSource, /const canonicalOrderData = await fetchDeliveryOrders\(\s*request,\s*\{\},\s*\{\s*cacheKey: shopifyShopCacheKey,\s*sessionToken: shopifySessionToken,?\s*\},?\s*\)/);
  assert.match(ordersPageSource, /const canonicalOrders = mergeShopifyOrderRowsWithCanonicalRows\(\s*mapCanonicalOrdersToOrderRows\(canonicalOrderData\.orders\),\s*mapCanonicalOrdersToOrderRows\(syncedOrderData\.orders\),\s*\)/);
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
  assert.match(ordersPageSource, /const selectedOrderIds = checkedOrderIds\.filter\(\(orderId\) =>\s*displayOrderById\.has\(orderId\) && !plannedOrderIdSet\.has\(orderId\),\s*\)/);
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
  assert.match(ordersPageSource, /\.\.\.selectableTableOrders\.map\(\(order\) => order\.id\)/);
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
  assert.match(ordersPageSource, /disabled=\{checkedOrderIds\.length === 0\}/);
  assert.match(ordersPageSource, /const orderControlsTrailingStyle = \{[\s\S]*?marginLeft:\s*"auto"/);
  assert.doesNotMatch(ordersPageSource, />Clear selection<\/button>/);
  assert.doesNotMatch(ordersPageSource, /shown ·/);
  assert.doesNotMatch(ordersPageSource, /added to plan\./);
  assert.doesNotMatch(ordersPageSource, />Add to map<\/button>[\s\S]{0,400}>Assign to route<\/button>/);
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
  assert.match(ordersPageSource, /En route/);
  assert.match(ordersPageSource, /Arrived/);
  assert.match(ordersPageSource, /Failed/);
  assert.match(ordersPageSource, /Skipped/);
  assert.match(ordersPageSource, /Cancelled/);
  assert.match(ordersPageSource, /formatDeliveryValue\(order\.orderedDate\)/);
  assert.match(ordersPageSource, /function formatAreaValue\(order\)/);
  assert.match(ordersPageSource, /order\?\.serviceType === "PICKUP" \? "Pickup" : "Null"/);
  assert.match(ordersPageSource, /title=\{getOrderAreaPillTitle\(order\)\}/);
  assert.match(ordersPageSource, /title=\{getOrderDeliveryPillTitle\(order\)\}/);
  assert.match(ordersPageSource, /title=\{getOrderDeliveryStatePillTitle\(order, orderFilterReferenceDate\)\}/);
  assert.match(ordersPageSource, /tone=\{getOrderDeliveryStatePillTone\(order, orderFilterReferenceDate\)\}/);
  assert.match(ordersPageSource, /title=\{getOrderPaymentPillTitle\(order\)\}/);
  assert.match(ordersPageSource, /tone=\{getOrderPaymentPillTone\(order\)\}/);
  assert.match(ordersPageSource, /formatOrderPaymentState\(order\)/);
  assert.match(ordersPageSource, /function getOrderPaymentStatus\(order\) \{/);
  assert.match(ordersPageSource, /order\?\.paymentStatus/);
  assert.match(ordersPageSource, /order\?\.rawPayload\?\.displayFinancialStatus/);
  assert.match(ordersPageSource, /order\?\.shopifyOrderSnapshot\?\.displayFinancialStatus/);
  assert.match(ordersPageSource, /function getOrderPaymentGatewayNames\(order\) \{/);
  assert.match(ordersPageSource, /order\?\.rawPayload\?\.paymentGatewayNames/);
  assert.match(ordersPageSource, /order\?\.shopifyOrderSnapshot\?\.paymentGatewayNames/);
  assert.match(ordersPageSource, /if \(status === "PAID"\) return "Paid"/);
  assert.match(ordersPageSource, /if \(status === "CASH"\) return "Cash"/);
  assert.match(ordersPageSource, /if \(status === "ETRANSFER"\) return "eTransfer"/);
  assert.match(ordersPageSource, /return "Cash"/);
  assert.match(ordersPageSource, /return "eTransfer"/);
  assert.match(ordersPageSource, /if \(status === "PENDING"\) return "Pending"/);
  assert.match(ordersPageSource, /return "Unknown"/);
  assert.match(ordersPageSource, /function getOrderPaymentPillTone\(order\) \{/);
  assert.match(ordersPageSource, /if \(paymentState === "Paid"\) return "success"/);
  assert.match(ordersPageSource, /if \(paymentState === "Cash" \|\| paymentState === "eTransfer"\) return "warning"/);
  assert.match(ordersPageSource, /return "critical"/);
  assert.doesNotMatch(ordersPageSource, /formatPaymentStatusLabel/);
  assert.doesNotMatch(ordersPageSource, /formatPaymentGatewayName/);
  assert.doesNotMatch(ordersPageSource, /Payment unknown/);
  assert.doesNotMatch(ordersPageSource, /Cash · collect|eTransfer · request|Pending ·|Payment ·|\$\{statusLabel\} · \$\{gatewayLabel\}/);
  assert.match(ordersPageSource, /function getOrderLineItems\(order\) \{/);
  assert.match(ordersPageSource, /const \[hoveredItemPopoverOrderId, setHoveredItemPopoverOrderId\] = useState\(null\)/);
  assert.match(ordersPageSource, /const \[pinnedItemPopoverOrderId, setPinnedItemPopoverOrderId\] = useState\(null\)/);
  assert.match(ordersPageSource, /const visibleItemPopoverOrderId = pinnedItemPopoverOrderId \?\? hoveredItemPopoverOrderId/);
  assert.match(ordersPageSource, /data-order-items-popover-root="true"/);
  assert.match(ordersPageSource, /onMouseEnter=\{\(\) => setHoveredItemPopoverOrderId\(order\.id\)\}/);
  assert.match(ordersPageSource, /setPinnedItemPopoverOrderId\(\(currentOrderId\) => currentOrderId === order\.id \? null : order\.id\)/);
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
  assert.match(ordersPageSource, /const visibleOrderIds = new Set\(selectableTableOrders\.map\(\(order\) => order\.id\)\)/);
  assert.match(ordersPageSource, /\.\.\.selectableTableOrders\.map\(\(order\) => order\.id\)/);
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
  assert.match(ordersPageSource, /placeholder=\{DEFAULT_ROUTE_PLAN_TITLE\}/);
  assert.match(ordersPageSource, /function buildRoutePlanTitleFromOrders\(orders\) \{/);
  assert.match(ordersPageSource, /`\$\{scopeLabel\} orders`/);
  assert.match(ordersPageSource, /const routePlanHeaderActionsStyle = \{/);
  assert.match(ordersPageSource, /const routeAssignActionsStyle = \{/);
  assert.match(ordersPageSource, /transition:\s*"max-height 180ms ease, opacity 140ms ease, margin-top 180ms ease"/);
  assert.match(ordersPageSource, /const routeReadinessValueStyle = \{/);
  assert.match(ordersPageSource, /const handleClearPlan = \(\) => \{/);
  assert.match(ordersPageSource, /setPlannedOrderIds\(\[\]\)/);
  assert.match(ordersPageSource, /setRouteAssignActionsOpen\(false\)/);
  assert.match(ordersPageSource, /const \[routeAssignActionsOpen, setRouteAssignActionsOpen\] = useState\(false\)/);
  assert.match(ordersPageSource, /const handleToggleRouteAssignActions = \(\) => \{/);
  assert.doesNotMatch(ordersPageSource, /plannedOrders\.map\(\(order, orderIndex\) =>/);
  assert.doesNotMatch(ordersPageSource, /aria-label=\{`Remove \${order\.name} from route plan`\}/);
  assert.doesNotMatch(ordersPageSource, />Remove<\/button>/);
  assert.match(ordersPageSource, /className="order-route-plan"[\s\S]*>Assign to route<\/button>[\s\S]*>Order summary<\/s-heading>[\s\S]*>Clear<\/button>/);
  assert.match(ordersPageSource, /aria-expanded=\{routeAssignActionsOpen\}/);
  assert.match(ordersPageSource, />Add to route<\/button>[\s\S]*>Create route<\/button>/);
  assert.match(ordersPageSource, />Route plan<\/s-heading>[\s\S]*>Inventory<\/s-heading>[\s\S]*>Order summary<\/s-heading>/);
  assert.match(ordersPageSource, /const \[inventorySubmitAction, setInventorySubmitAction\] = useState\(null\)/);
  assert.match(ordersPageSource, /const handleAddInventory = async \(submitAction = "add"\) => \{/);
  assert.match(ordersPageSource, />Inventory<\/s-heading>[\s\S]*onClick=\{\(\) => handleAddInventory\("add"\)\}[\s\S]*inventorySubmitAction === "add" \? "Adding…" : "Add"[\s\S]*onClick=\{\(\) => handleAddInventory\("create"\)\}[\s\S]*inventorySubmitAction === "create" \? "Creating…" : "Create"/);
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
  assert.match(ordersPageSource, /height:\s*"420px"/);
  assert.match(ordersPageSource, /maxHeight:\s*"420px"/);
  assert.match(ordersPageSource, /flexDirection:\s*"column"/);
  assert.match(ordersPageSource, /overflowY:\s*"auto"/);
  assert.match(ordersPageSource, /minHeight:\s*0/);
  assert.match(ordersPageSource, /overflow:\s*"visible"/);
  assert.match(ordersPageSource, /marginTop:\s*"auto"/);
  assert.match(ordersPageSource, /maxHeight:\s*"100px"/);
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
  assert.match(ordersPageSource, /function buildOrdersMapFeatureCollection\(orders, plannedOrderIds\) \{/);
  assert.match(ordersPageSource, /const plannedIndex = plannedOrderIds\.indexOf\(order\.id\) \+ 1/);
  assert.match(ordersPageSource, /pinImage: isPlanned \? getPlannedOrderPinImageId\(plannedIndex\) : ORDER_PIN_IMAGE_ID/);
  assert.match(ordersPageSource, /const isPlanned = true/);
  assert.match(mapMarkersSource, /"icon-image": iconImage/);
  assert.doesNotMatch(ordersPageSource, /"text-field": \["get", "plannedLabel"\]/);
  assert.doesNotMatch(ordersPageSource, /function createOrderMarkerElement\(order, plannedIndex\)/);
});

test("Orders map marker popup can add the clicked order to the route plan", () => {
  assert.match(ordersPageSource, /function createOrderMarkerPopupElement\(order, plannedIndex, onAddToPlan\)/);
  assert.match(ordersPageSource, /const deliveryMetaValues = \[order\.deliveryArea, formatOrderDeliveryLabel\(order\)\]\.filter\(Boolean\)/);
  assert.match(ordersPageSource, /metaTabElement\.className = "order-marker-popup__meta-tab"/);
  assert.match(globalCssSource, /\.order-marker-popup__meta-tab\s*\{/);
  assert.match(globalCssSource, /background:\s*rgba\(0, 0, 0, 0\.05\)/);
  assert.match(globalCssSource, /color:\s*#303030/);
  assert.match(ordersPageSource, /popupActionButton\.textContent = plannedIndex > 0 \? "Added to map" : "Add to map"/);
  assert.match(ordersPageSource, /popupActionButton\.disabled = plannedIndex > 0/);
  assert.match(ordersPageSource, /popupActionButton\.addEventListener\("click", \(event\) => \{/);
  assert.match(ordersPageSource, /onAddToPlan\(order\.id\)/);
  assert.match(
    ordersPageSource,
    /\.setDOMContent\(\s*createOrderMarkerPopupElement\(\s*order,\s*plannedIndex,\s*handleAddOrderToPlan,\s*\),\s*\)/,
  );
  const popupBlock = ordersPageSource.match(
    /function createOrderMarkerPopupElement\(order, plannedIndex, onAddToPlan\) \{[\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.doesNotMatch(popupBlock, /order\.status/);
  assert.doesNotMatch(popupBlock, /order\.paymentStatus/);
});

test("Orders map popup content stays above all map markers", () => {
  assert.match(ordersPageSource, /map\.addLayer\(createMapPinSymbolLayer\(\{\s+id: ORDERS_MAP_ORDER_LAYER_ID/);
  assert.match(mapMarkersSource, /type: "symbol"/);
  assert.match(mapMarkersSource, /"symbol-sort-key": sortKey/);
  assert.match(mapMarkersSource, /markerElement\.style\.zIndex = options\.zIndex \?\? "3000"/);
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
  assert.match(ordersPageSource, /ariaLabel: "Refresh map"/);
  assert.match(ordersPageSource, /import \{ MapPanel, MapToolbar, renderMapFitIcon, renderMapRefreshIcon, renderMapWidthIcon, renderMapZoomInIcon, renderMapZoomOutIcon \} from "(?:\.\.\/ui|\.\.\/\.\.\/ui)\/map-panel"/);
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
  assert.match(ordersPageSource, /const scheduleMapRecovery = useCallback\(\(\) => \{/);
  assert.match(ordersPageSource, /MAX_MAP_RECOVERY_ATTEMPTS/);
  assert.match(ordersPageSource, /MAP_RECOVERY_DELAY_MS/);
  assert.match(ordersPageSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(ordersPageSource, /setMapRenderKey\(\(currentRenderKey\) => currentRenderKey \+ 1\)/);
  assert.match(ordersPageSource, /import \{ installMissingMapImageFallback \} from "(?:\.\.\/features\/maps|\.\.\/maps)\/maplibre-missing-images"/);
  assert.match(ordersPageSource, /installMissingMapImageFallback\(mapRef\.current\)/);
  assert.match(ordersPageSource, /mapRef\.current\.on\("error", \(event\) => \{/);
  assert.match(ordersPageSource, /tiles\.openfreemap\.org/);
  assert.match(ordersPageSource, /AJAXError/);
  assert.match(ordersPageSource, /setMapStatus\("recovering"\)/);
  assert.match(ordersPageSource, /setMapStatus\("failed"\)/);
  assert.match(ordersPageSource, /statusLabel=\{\s*mapStatus !== "idle"/s);
  assert.doesNotMatch(ordersPageSource, /지도 타일을 불러오지 못했습니다/);
});

test("Orders map zooms to fit the route plan only when the table Add to map action registers orders", () => {
  const markerPopupAddBlock = ordersPageSource.match(
    /const handleAddOrderToPlan = useCallback\(\(orderId\) => \{[\s\S]*?\}, \[plannedOrderIdSet\]\);/,
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
  assert.match(ordersPageSource, /const \{ orders, inventories, errors, departureLocation/);
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
  assert.match(ordersPageSource, /sortKey: isPlanned \? 1000 - plannedIndex : 1/);
  assert.match(mapMarkersSource, /"symbol-sort-key": sortKey/);
  assert.match(mapMarkersSource, /"icon-allow-overlap": true/);
  assert.match(mapMarkersSource, /"icon-ignore-placement": true/);
  assert.doesNotMatch(ordersPageSource, /ORDERS_MAP_ORDER_TEXT_LAYER_ID/);
  assert.doesNotMatch(ordersPageSource, /sortedLocatedOrders/);
});

test("Orders map keeps planned pins the same size and centers the planned number", () => {
  assert.match(mapMarkersSource, /export const MAP_PIN_PIXEL_RATIO = 2/);
  assert.match(mapMarkersSource, /const width = \(options\.width \?\? 40\) \* pixelRatio/);
  assert.match(mapMarkersSource, /const height = \(options\.height \?\? 52\) \* pixelRatio/);
  assert.match(mapMarkersSource, /export const MAP_PIN_ICON_SIZE = 0\.54/);
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
  assert.match(ordersPageSource, /const \[sortConfig, setSortConfig\] = useState\(null\)/);
  assert.match(ordersPageSource, /const \[tableColumnWidths, setTableColumnWidths\] = useState\(DEFAULT_TABLE_COLUMN_WIDTHS\)/);
  assert.match(ordersPageSource, /const tableRef = useRef\(null\)/);
  assert.match(ordersPageSource, /const sortedOrders = useMemo\(\(\) =>/);
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
  assert.match(ordersPageSource, /const tableWidth = lockedTableWidth \? `\$\{lockedTableWidth\}px` : "100%"/);
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
  assert.match(ordersPageSource, /onPointerDown=\{\(event\) => handleColumnResizeStart\(columnIndex \+ 1, event\)\}/);
  assert.match(ordersPageSource, /function getTableColumnFitWidth\(tableElement, columnIndex\) \{/);
  assert.match(ordersPageSource, /querySelectorAll\(\s*`thead th:nth-child/);
  assert.match(ordersPageSource, /const handleColumnAutoFit = \(columnIndex, event\) => \{/);
  assert.match(ordersPageSource, /getTableColumnFitWidth\(tableElement, columnIndex\) - leftStartWidth/);
  assert.match(ordersPageSource, /const clone = cell\.cloneNode\(true\)/);
  assert.match(ordersPageSource, /width:\s*"max-content"/);
  assert.match(ordersPageSource, /clone\.querySelectorAll\("\*"\)\.forEach/);
  assert.match(ordersPageSource, /clone\.getBoundingClientRect\(\)\.width/);
  assert.doesNotMatch(ordersPageSource, /cell\.scrollWidth/);
  assert.match(ordersPageSource, /onDoubleClick=\{\(event\) => handleColumnAutoFit\(columnIndex \+ 1, event\)\}/);
  assert.doesNotMatch(ordersPageSource, /handleColumnResizeStart\(0, event\)/);
  assert.match(ordersPageSource, /const tableHeaderButtonStyle = \{[\s\S]*?padding:\s*0/);
  assert.match(ordersPageSource, /const orderNumberButtonStyle = \{[\s\S]*?padding:\s*0/);
  assert.match(globalCssSource, /\.info-pill \{[\s\S]*?justify-content: center/);
  assert.match(globalCssSource, /\.info-pill \{[\s\S]*?box-sizing: border-box/);
  assert.match(ordersPageSource, /aria-sort=\{/);
  assert.match(ordersPageSource, /tableOrders\.map\(\(order\) =>/);
  assert.doesNotMatch(ordersPageSource, /safeOrders\.map\(\(order\) =>\s*\(\s*<tr/);
});

test("Orders page filters table rows by order date, delivery day, type, and area", () => {
  assert.match(ordersPageSource, /import \{ useFetcher, useLoaderData, useNavigate, useSearchParams \} from "react-router"/);
  assert.match(ordersPageSource, /import \{[\s\S]*filterOrders[\s\S]*getOrderFilterOptions[\s\S]*getOrderFiltersFromSearchParams[\s\S]*ORDER_HISTORY_SCOPE[\s\S]*ORDER_PLANNING_SCOPE[\s\S]*ORDER_WEEKDAY_OPTIONS[\s\S]*updateOrderFilterSearchParams[\s\S]*\} from "(?:\.\.\/features\/orders|\.)\/order-filters"/);
  assert.match(ordersPageSource, /const \[searchParams, setSearchParams\] = useSearchParams\(\)/);
  assert.match(ordersPageSource, /const \[optimisticOrderFilters, setOptimisticOrderFilters\] = useState\(null\)/);
  assert.match(ordersPageSource, /const urlOrderFilters = useMemo\(\s*\(\) => getOrderFiltersFromSearchParams\(searchParams\),\s*\[searchParams\],\s*\)/);
  assert.match(ordersPageSource, /const orderFilters = optimisticOrderFilters \?\? urlOrderFilters/);
  assert.match(ordersPageSource, /setOptimisticOrderFilters\(null\);\s*\}, \[searchParams\]\)/);
  assert.match(ordersPageSource, /const \{ orders, inventories, errors, departureLocation, needsSessionTokenRefresh, perf, shopLocalDate \} = useLoaderData\(\)/);
  assert.match(ordersPageSource, /const orderFilterReferenceDate = useMemo\(\s*\(\) => shopLocalDate \?\? new Date\(\),\s*\[shopLocalDate\],\s*\)/);
  assert.match(ordersPageSource, /const effectiveOrderFilters = useMemo\([\s\S]*ORDER_HISTORY_SCOPE[\s\S]*: orderFilters,[\s\S]*\[activeOrderFilters, orderFilters\]/);
  assert.match(ordersPageSource, /const orderFilterOptionOrders = useMemo\(\s*\(\) =>\s*activeOrderFilters\s*\? filterOrders\(displayOrders, \{[\s\S]*?\.\.\.effectiveOrderFilters,[\s\S]*?deliveryArea: "",[\s\S]*?deliveryWeekday: "",[\s\S]*?orderedDateFrom: "",[\s\S]*?orderedDateTo: "",[\s\S]*?serviceType: "",[\s\S]*?referenceDate: orderFilterReferenceDate,[\s\S]*?\}\)\s*: displayOrders,\s*\[activeOrderFilters, displayOrders, effectiveOrderFilters, orderFilterReferenceDate\],\s*\)/);
  assert.match(ordersPageSource, /deliveryAreas: getOrderFilterOptions\(filterOrders\(orderFilterOptionOrders, \{[\s\S]*?deliveryArea: ""/);
  assert.match(ordersPageSource, /deliveryWeekdays: getOrderFilterOptions\(filterOrders\(orderFilterOptionOrders, \{[\s\S]*?deliveryWeekday: ""/);
  assert.match(ordersPageSource, /serviceTypes: getOrderFilterOptions\(filterOrders\(orderFilterOptionOrders, \{[\s\S]*?serviceType: ""/);
  assert.match(ordersPageSource, /const filteredOrders = useMemo\(\s*\(\) =>\s*activeOrderFilters\s*\? filterOrders\(displayOrders, \{[\s\S]*?\.\.\.effectiveOrderFilters,[\s\S]*?referenceDate: orderFilterReferenceDate,[\s\S]*?\}\)\s*: displayOrders,\s*\[activeOrderFilters, displayOrders, effectiveOrderFilters, orderFilterReferenceDate\],\s*\)/);
  assert.match(ordersPageSource, /getOrderSortValue\(leftOrder, sortConfig\.key, orderFilterReferenceDate\)/);
  assert.match(ordersPageSource, /const sortedOrders = useMemo\(\(\) => \{\s*if \(!sortConfig\) return filteredOrders/);
  assert.match(ordersPageSource, /!orderedDateFilterActive \? <span style=\{orderFilterLabelStyle\}>Order date<\/span> : null/);
  assert.match(ordersPageSource, /aria-label="Filter orders by ordered date"/);
  assert.match(ordersPageSource, /style=\{orderFilterDateButtonStyle\}/);
  assert.match(ordersPageSource, /const orderFilterDateFieldStyle = \{[\s\S]*?overflow:\s*"hidden"/);
  assert.match(ordersPageSource, /const orderFilterDateButtonStyle = \{[\s\S]*?minWidth:\s*0/);
  assert.match(ordersPageSource, /const orderFilterSelectFieldStyle = \{/);
  assert.match(ordersPageSource, /const orderFilterSelectStyle = \{/);
  assert.match(ordersPageSource, /const orderFilterEmptySelectStyle = \{[\s\S]*?opacity:\s*0/);
  assert.match(ordersPageSource, /const orderFilterClearButtonStyle = \{/);
  assert.match(ordersPageSource, /if \(!startDate && !endDate\) return ""/);
  assert.match(ordersPageSource, /function formatOrderDateValue\(value\) \{[\s\S]*?replaceAll\("-", "\."\)/);
  assert.match(ordersPageSource, /`\$\{formatOrderDateValue\(startDate\)\}~\$\{formatOrderDateValue\(endDate\)\}`/);
  assert.match(ordersPageSource, /textAlign:\s*"left"/);
  assert.match(ordersPageSource, /\{orderedDateLabel\}<\/button>/);
  assert.match(ordersPageSource, /aria-label="Clear ordered date filter"/);
  assert.match(ordersPageSource, /const \[pendingOrderedDateStart, setPendingOrderedDateStart\] = useState\(""\)/);
  assert.match(ordersPageSource, /orderedDateFrom: startDate/);
  assert.match(ordersPageSource, /orderedDateTo: endDate/);
  assert.match(ordersPageSource, /applyOrderedDateRange\(pendingOrderedDateStart, pendingOrderedDateStart\)/);
  assert.match(ordersPageSource, /getCalendarDayStyle\(day, orderFilters, pendingOrderedDateStart\)/);
  assert.match(ordersPageSource, /const nextFilters = \{\s*\.\.\.orderFilters,\s*orderedDateFrom: startDate,\s*orderedDateTo: endDate,\s*\}/);
  assert.match(ordersPageSource, /setOptimisticOrderFilters\(nextFilters\);\s*setSearchParams\(\s*updateOrderFilterSearchParams\(searchParams, nextFilters\)/);
  assert.match(ordersPageSource, /const handleClearOrderFilter = \(filterKey\) => \{/);
  assert.match(ordersPageSource, /nextFilters\.orderedDateFrom = ""/);
  assert.match(ordersPageSource, /nextFilters\.orderedDateTo = ""/);
  assert.match(ordersPageSource, /nextFilters\[filterKey\] = ""/);
  assert.doesNotMatch(ordersPageSource, /type="date"/);
  assert.match(ordersPageSource, /aria-label="Filter orders by delivery day"/);
  assert.match(ordersPageSource, /value=\{orderFilters\.deliveryWeekday\}/);
  assert.match(ordersPageSource, /const handleOrderFilterChange = \(filterKey, filterValue\) => \{[\s\S]*?setOptimisticOrderFilters\(nextFilters\);[\s\S]*?updateOrderFilterSearchParams\(searchParams, nextFilters\)/);
  assert.match(ordersPageSource, /<option value=""[^>]*>Delivery day<\/option>/);
  assert.match(ordersPageSource, /<span style=\{orderFilterPlaceholderStyle\}>Delivery day<\/span>/);
  assert.match(ordersPageSource, /renderOrderFilterChevron\(\)/);
  assert.match(ordersPageSource, /ORDER_WEEKDAY_OPTIONS\.map\(\(weekday\) =>/);
  assert.match(ordersPageSource, /handleOrderFilterChange\("deliveryWeekday", event\.currentTarget\.value\)/);
  assert.match(ordersPageSource, /aria-label="Clear delivery day filter"/);
  assert.match(ordersPageSource, /aria-label="Filter orders by service type"/);
  assert.match(ordersPageSource, /<option value=""[^>]*>Type<\/option>/);
  assert.match(ordersPageSource, /<span style=\{orderFilterPlaceholderStyle\}>Type<\/span>/);
  assert.match(ordersPageSource, /<option value="DELIVERY">Delivery<\/option>/);
  assert.match(ordersPageSource, /<option value="PICKUP">Pickup<\/option>/);
  assert.match(ordersPageSource, /aria-label="Clear service type filter"/);
  assert.match(ordersPageSource, /aria-label="Filter orders by delivery area"/);
  assert.match(ordersPageSource, /<option value=""[^>]*>Area<\/option>/);
  assert.match(ordersPageSource, /<span style=\{orderFilterPlaceholderStyle\}>Area<\/span>/);
  assert.match(ordersPageSource, /handleOrderFilterChange\("deliveryArea", event\.currentTarget\.value\)/);
  assert.match(ordersPageSource, /aria-label="Clear delivery area filter"/);
  assert.match(ordersPageSource, /aria-label="Filter orders by state"/);
  assert.match(ordersPageSource, /<span style=\{orderFilterPlaceholderStyle\}>State<\/span>/);
  assert.match(ordersPageSource, /ORDER_DELIVERY_STATE_OPTIONS/);
  assert.match(ordersPageSource, /ORDER_DELIVERY_STATE_OPTIONS\.map\(\(stateOption\) =>/);
  assert.match(ordersPageSource, /<option value=""[^>]*>State<\/option>/);
  assert.doesNotMatch(ordersPageSource, /stateOption\) => orderFilterOptions\.deliveryStates\.includes/);
  assert.match(ordersPageSource, /handleOrderFilterChange\("deliveryState", event\.currentTarget\.value\)/);
  assert.match(ordersPageSource, /aria-label="Clear state filter"/);
  assert.match(ordersPageSource, /setOptimisticOrderFilters\(nextFilters\);\s*setSearchParams\(/);
  assert.match(ordersPageSource, />Clear filters<\/button>/);
  assert.doesNotMatch(ordersPageSource, />Clear selection<\/button>/);
  assert.match(ordersPageSource, />Clear<\/button>/);
  assert.match(ordersPageSource, /disabled=\{checkedOrderIds\.length === 0\}/);
  assert.match(ordersPageSource, /deliveryWeekday: ""/);
  assert.match(ordersPageSource, /orderedDateFrom: ""/);
  assert.match(ordersPageSource, /orderedDateTo: ""/);
  assert.match(ordersPageSource, /const orderFilterControlStyle = \{[\s\S]*?height:\s*"30px"[\s\S]*?padding:\s*"0 8px"/);
  assert.match(ordersPageSource, /const orderFilterDateFieldStyle = \{[\s\S]*?\.\.\.orderFilterControlStyle/);
  assert.match(ordersPageSource, /boxSizing:\s*"border-box"/);
  assert.match(ordersPageSource, /const orderControlsStyle = \{[\s\S]*?flexWrap:\s*"wrap"[\s\S]*?padding:\s*"6px 10px 8px"/);
  assert.doesNotMatch(ordersPageSource, /aria-label="Order planning tabs" role="tablist"/);
  assert.doesNotMatch(ordersPageSource, /ORDER_STATUS_TABS\.map/);
  assert.doesNotMatch(ordersPageSource, /aria-label="Choose order scope"/);
  assert.doesNotMatch(ordersPageSource, />Planning Scope<\/option>/);
  assert.doesNotMatch(ordersPageSource, />History \/ All Orders<\/option>/);
  assert.doesNotMatch(ordersPageSource, /aria-label="Filter orders by delivery date"/);
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

test("Orders map only renders orders after Add to map", () => {
  assert.match(ordersPageSource, /const locatedOrders = useMemo\(\s*\(\) => filteredOrders\.filter\(\(order\) => order\.hasCoordinates\),\s*\[filteredOrders\],\s*\)/);
  assert.match(ordersPageSource, /syncOrdersMapMarkerLayer\(map, locatedOrders, plannedOrderIds\)/);
  assert.match(ordersPageSource, /\.filter\(\(order\) => order\.hasCoordinates && plannedIndexByOrderId\.has\(order\.id\)\)/);
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


test("Orders page exposes inventory as an Orders subview with the side-card shortcut", () => {
  assert.match(ordersPageSource, /fetchDeliveryInventories/);
  assert.match(ordersPageSource, />Inventory<\/button>/);
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

test("Orders inventory side-card Add creates standalone inventory without route ownership checks", () => {
  assert.match(ordersPageSource, /import \{ createDeliveryInventory, deleteDeliveryInventory, fetchDeliveryInventories \}/);
  assert.match(ordersPageSource, /const inventoryFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /formData\.set\("_intent", "createInventory"\)/);
  assert.match(ordersPageSource, /inventoryFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(ordersPageSource, /reason: "route_create_preflight"/);
  assert.match(ordersPageSource, /if \(intent === "createInventory"\) \{/);
  assert.match(ordersPageSource, /createDeliveryInventory\(\s*request,/);
  assert.match(ordersPageSource, /deleteDeliveryInventory\(request, inventoryId, \{ sessionToken: shopifySessionToken \}\)/);
  assert.match(ordersPageSource, /orderIds: plannedOrders\.map\(\(order\) => order\.orderId\)/);
  assert.match(ordersPageSource, /return \{ inventory, errors: \[\] \}/);
  assert.match(ordersPageSource, /navigate\(`\/app\/orders\/inventory\?id=\$\{encodeURIComponent\(createdInventory\.id\)\}&id_token=\$\{encodeURIComponent\(sessionToken\)\}`\)/);
  assert.doesNotMatch(ordersPageSource, /inventoryRouteGroup/);
});

test("Orders inventory detail shows a printable product matrix without delta", () => {
  assert.match(inventoryDetailSource, /fetchDeliveryInventoryDetail/);
  assert.match(inventoryDetailSource, /buildInventoryProductMatrix/);
  assert.match(inventoryDetailSource, /Inventory product matrix/);
  assert.doesNotMatch(inventoryDetailSource, /Product quantities by date/);
  assert.match(inventoryDetailSource, /generatedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(inventoryDetailSource, /const headerActionStyle = \{/);
  assert.match(inventoryDetailSource, /marginLeft: "auto"/);
  assert.match(inventoryDetailSource, /Output: \{formatOutputTime\(generatedAt\)\}/);
  assert.match(inventoryDetailSource, /const PRODUCT_COLUMNS_PER_TABLE = 6/);
  assert.match(inventoryDetailSource, /getProductChunks\(matrix\.products\)/);
  assert.match(inventoryDetailSource, /getProductSlots\(products\)/);
  assert.match(inventoryDetailSource, /Group total/);
  assert.match(inventoryDetailSource, /Overall total: \{matrix\.totalQuantity\}/);
  assert.match(inventoryDetailSource, /product\.displayLabel \?\? product\.label/);
  assert.match(inventoryDetailSource, /WebkitLineClamp: 2/);
  assert.match(inventoryDetailSource, /borderRight: "1px solid #e5e7eb"/);
  assert.match(inventoryDetailSource, /textAlign: "center"/);
  assert.match(inventoryDetailSource, /aria-hidden="true"/);
  assert.match(inventoryDetailSource, /width: "78px"/);
  assert.match(inventoryDetailSource, /width: "68px"/);
  assert.match(inventoryDetailSource, /function DateCellLabel/);
  assert.match(inventoryDetailSource, /gridTemplateColumns: "24px 38px"/);
  assert.match(inventoryDetailSource, /style=\{groupTotalHeadCellStyle\}>Group total/);
  assert.match(inventoryDetailSource, /totalRowCellStyle/);
  assert.match(inventoryDetailSource, /borderTop: "1px solid #ebebeb"/);
  assert.doesNotMatch(inventoryDetailSource, /borderTop: "2px solid #d4d4d4"/);
  assert.match(inventoryDetailSource, /const backLinkStyle = \{/);
  assert.match(inventoryDetailSource, /<Link[\s\S]*className="inventory-detail-no-print"[\s\S]*style=\{backLinkStyle\}/);
  assert.doesNotMatch(inventoryDetailSource, /width:\s*"max-content"/);
  assert.match(inventoryDetailSource, /window\.print\(\)/);
  assert.match(inventoryDetailSource, /@media print/);
  assert.match(inventoryDetailSource, /@page \{ margin: 0; \}/);
  assert.match(inventoryDetailSource, /max-width: 190mm/);
  assert.doesNotMatch(inventoryDetailSource, /Delta remarks|Order-by-order items|lastChange/);
});

test("Orders inventory detail logs API payload counts on the server", () => {
  assert.match(inventoryDetailSource, /console\.info\("orders\.inventory\.detail\.api"/);
  assert.match(inventoryDetailSource, /apiPath/);
  assert.match(inventoryDetailSource, /emptyItemReason/);
  assert.match(inventoryDetailSource, /orders_present_without_items/);
  assert.match(inventoryDetailSource, /ordersCountField/);
  assert.match(inventoryDetailSource, /orderItemQuantity/);
  assert.match(inventoryDetailSource, /summaryItemQuantity/);
  assert.match(inventoryDetailSource, /firstOrderItemKeys/);
});
