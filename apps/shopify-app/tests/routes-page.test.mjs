import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const routesPageSource = readFileSync(
  join(root, "app/routes/app.routes.jsx"),
  "utf8",
);
const routeDetailPath = join(root, "app/routes/app.routes.$routeId.jsx");
const routeDetailSource = existsSync(routeDetailPath)
  ? readFileSync(routeDetailPath, "utf8")
  : "";
const globalCssSource = readFileSync(join(root, "app/styles/global.css"), "utf8");
const mapMarkersSource = readFileSync(join(root, "app/features/maps/map-markers.js"), "utf8");

test("Routes page loads persisted route plans and route groups from the delivery Admin API", () => {
  assert.match(routesPageSource, /import \{ deleteDeliveryRoutePlan, fetchDeliveryRoutePlans \} from "\.\.\/features\/delivery\/route-plans\.server"/);
  assert.match(routesPageSource, /import \{ fetchDeliveryRouteGroups \} from "\.\.\/features\/delivery\/route-groups\.server"/);
  assert.match(routesPageSource, /import \{ authenticate \} from "\.\.\/shopify\.server"/);
  assert.match(routesPageSource, /import \{ Outlet, redirect,/);
  assert.match(routesPageSource, /export const loader = async \(\{ request \}\) => \{/);
  assert.match(routesPageSource, /if \(url\.pathname === "\/app\/routes\/"\) \{/);
  assert.match(routesPageSource, /url\.pathname = "\/app\/routes"/);
  assert.match(routesPageSource, /return redirect\(`\$\{url\.pathname\}\$\{url\.search\}\$\{url\.hash\}`\)/);
  assert.match(routesPageSource, /const \{ session \} = await authenticate\.admin\(request\)/);
  assert.match(routesPageSource, /const shopifyShopCacheKey = session\?\.shop/);
  assert.match(routesPageSource, /fetchDeliveryRoutePlans\(request,\s*\{\s*cacheKey: shopifyShopCacheKey,?\s*\}\)/);
  assert.match(routesPageSource, /fetchDeliveryRouteGroups\(request, \{\}, \{ cacheKey: shopifyShopCacheKey \}\)/);
  assert.match(routesPageSource, /export const action = async \(\{ request \}\) => \{/);
  assert.match(routesPageSource, /await authenticate\.admin\(request\)/);
  assert.match(routesPageSource, /await request\.formData\(\)/);
  assert.match(routesPageSource, /function parseRoutePlanIds\(value\) \{/);
  assert.match(routesPageSource, /const routePlanIds = parseRoutePlanIds\(formData\.get\("routePlanIds"\)\)/);
  assert.match(routesPageSource, /routePlanIds\.map\(\(routePlanId\) =>/);
  assert.match(routesPageSource, /deleteDeliveryRoutePlan\(request, routePlanId, \{ sessionToken: shopifySessionToken \}\)/);
  assert.match(routesPageSource, /const \{ routeGroups = \[\], routePlans = \[\], errors = \[\] \} = useLoaderData\(\)/);
  assert.match(routesPageSource, /buildRouteRows\(routePlans, routeGroups\)/);
  assert.match(routesPageSource, /useSearchParams/);
  assert.match(routesPageSource, /const \[searchParams\] = useSearchParams\(\)/);
  assert.match(routesPageSource, /getRouteFilters\(searchParams\)/);
  assert.doesNotMatch(routesPageSource, /parseRouteDraft/);
  assert.doesNotMatch(routesPageSource, /searchParams\.get\("orderIds"\)/);
});

test("Routes page renders a tab-consistent title header above the route table without info copy", () => {
  assert.match(routesPageSource, /const routesTablePageStyle = \{\s+padding: "8px 12px 12px"/);
  assert.match(routesPageSource, /const routesPageContentStyle = \{\s+display: "grid",\s+gap: "12px"/);
  assert.match(routesPageSource, /const routesHeaderStyle = \{\s+display: "grid",\s+gap: "4px"/);
  assert.match(routesPageSource, /const routesHeaderBarStyle = \{/);
  assert.match(routesPageSource, /const routesTitleStyle = \{\s+margin: 0,\s+fontFamily: "inherit",\s+fontSize: "20px",\s+fontWeight: "600",\s+lineHeight: "28px"/);
  assert.match(routesPageSource, /<header className="tab-layout-header" style=\{routesHeaderStyle\}>/);
  assert.match(routesPageSource, /<h1 style=\{routesTitleStyle\}>Routes<\/h1>/);
  assert.doesNotMatch(routesPageSource, /routesDescriptionStyle/);
  assert.doesNotMatch(routesPageSource, /Route plans created from selected orders/);
  assert.doesNotMatch(routesPageSource, /routesSummaryStyle/);
  assert.doesNotMatch(routesPageSource, /Route summary metrics show/);
});

test("Routes page adds only the top summary cards and Create routes action from the reference", () => {
  assert.match(routesPageSource, /const createRoutesButtonStyle = \{/);
  assert.match(routesPageSource, /const routesSummaryCardsStyle = \{/);
  assert.match(routesPageSource, /const routesSummaryCardStyle = \{/);
  assert.match(routesPageSource, /const routesSummaryLabelStyle = \{/);
  assert.match(routesPageSource, /const routesSummaryValueStyle = \{/);
  assert.match(routesPageSource, /gridTemplateColumns: "repeat\(6, minmax\(150px, 1fr\)\)"/);
  assert.match(routesPageSource, /overflowX: "auto"/);
  assert.match(routesPageSource, /overflowY: "hidden"/);
  assert.match(routesPageSource, /function buildRoutesSummary\(routeRows\) \{/);
  assert.match(routesPageSource, /label: "Routes"/);
  assert.match(routesPageSource, /label: "Stops"/);
  assert.match(routesPageSource, /label: "Delivered"/);
  assert.match(routesPageSource, /label: "Attempted"/);
  assert.match(routesPageSource, /label: "Drive time"/);
  assert.match(routesPageSource, /label: "Distance"/);
  assert.match(routesPageSource, /function handleCreateRoutesClick\(\) \{/);
  assert.match(routesPageSource, /navigate\("\/app\/orders"\)/);
  assert.match(routesPageSource, /<button type="button" style=\{createRoutesButtonStyle\} onClick=\{handleCreateRoutesClick\}>Create routes<\/button>/);
  assert.match(routesPageSource, /<section aria-label="Routes summary" style=\{routesSummaryCardsStyle\}>/);
  assert.match(routesPageSource, /routesSummary\.map\(\(summaryItem\) =>/);
  assert.doesNotMatch(routesPageSource, /Filter routes|Recent|Add filter|Clear all/);
});

test("Routes page keeps copied controls out while using checkbox route selection actions", () => {
  assert.doesNotMatch(routesPageSource, /import \{ TabLayout \}/);
  assert.doesNotMatch(routesPageSource, /<TabLayout\b/);
  assert.doesNotMatch(routesPageSource, /Filter routes|Recent|Optimize route|Schedule route|Add filter|Clear all/);
  assert.doesNotMatch(routesPageSource, /aria-label="Routes filters"/);
  assert.doesNotMatch(routesPageSource, /aria-label="Routes filters"/);
  assert.doesNotMatch(routesPageSource, /routesKpiGridStyle|routesKpiCardStyle|routesKpiLabelStyle|routesKpiValueStyle/);
  assert.doesNotMatch(routesPageSource, /routesFilterBarStyle|routesFilterChipStyle/);
  assert.doesNotMatch(routesPageSource, /routeStatusKpiLabels|routeFilterLabels|getRouteStatusCounts/);
  assert.doesNotMatch(routesPageSource, />Create route<\/a>/);
  assert.doesNotMatch(routesPageSource, /routesTableToolbarStyle|routeChipStyle/);
  assert.match(routesPageSource, /const routesTablePageStyle = \{/);
  assert.match(routesPageSource, /const routeColumnWidths = \[/);
  assert.match(routesPageSource, /const routeControlsStyle = \{/);
  assert.match(routesPageSource, /const routeControlsTrailingStyle = \{/);
  assert.match(routesPageSource, /const routeSelectionSummaryStyle = \{/);
  assert.match(routesPageSource, /flexWrap: "nowrap"/);
  assert.match(routesPageSource, /overflowX: "auto"/);
  assert.match(routesPageSource, /const routeCheckboxCellStyle = \{/);
  assert.match(routesPageSource, /const routeActionButtonStyle = \{/);
  assert.match(routesPageSource, /const routeDisabledActionButtonStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeIndexActionsStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeIndexButtonStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeDeleteButtonStyle = \{/);
  assert.match(routesPageSource, /const singleRouteTableStyle = \{/);
  assert.match(routesPageSource, /minWidth: "1040px"/);
  assert.match(routesPageSource, /padding: "7px 8px"/);
  assert.match(routesPageSource, /padding: "8px 8px"/);
  assert.match(routesPageSource, /<table style=\{singleRouteTableStyle\}>/);
  assert.match(routesPageSource, /<colgroup>/);
  assert.match(routesPageSource, /routeColumnWidths\.map\(\(width, index\) =>/);
  assert.match(routesPageSource, /key=\{`\$\{width\}-\$\{index\}`\}/);
});

test("Routes table uses aligned CLEVER planning columns", () => {
  assert.match(routesPageSource, /function buildRouteRows\(routePlans, routeGroups = \[\]\) \{/);
  assert.match(routesPageSource, /routeRows\.map\(\(route\) =>/);
  assert.match(routesPageSource, /aria-label="Select all visible routes"/);
  assert.match(routesPageSource, />Route<\/th>/);
  assert.match(routesPageSource, />Route<\/th>[\s\S]*>Date<\/th>[\s\S]*>Status<\/th>/);
  assert.match(routesPageSource, />Status<\/th>/);
  assert.match(routesPageSource, />Orders<\/th>/);
  assert.match(routesPageSource, />Area<\/th>/);
  assert.match(routesPageSource, />Start<\/th>/);
  assert.match(routesPageSource, />End<\/th>/);
  assert.match(routesPageSource, />Driver<\/th>/);
  assert.doesNotMatch(routesPageSource, />Planned for<\/th>/);
  assert.doesNotMatch(routesPageSource, />Delivery date<\/th>/);
  assert.doesNotMatch(routesPageSource, />Coordinates<\/th>/);
  assert.doesNotMatch(routesPageSource, />Missing<\/th>/);
  assert.doesNotMatch(routesPageSource, />Created<\/th>/);
  assert.match(routesPageSource, />DRAFT<\/span>/);
  assert.match(routesPageSource, /standaloneRoutePlans\.map\(\(routePlan\) =>/);
  assert.match(routesPageSource, /const routeGroupRows = safeRouteGroups\.map\(\(routeGroup\) =>/);
  assert.match(routesPageSource, /isRouteGroup: true/);
  assert.match(routesPageSource, /isDeletable: false/);
  assert.match(routesPageSource, /formatRouteGroupDate\(routeGroup\)/);
  assert.doesNotMatch(routesPageSource, /routeIndex: routeIndex \+ 1/);
  assert.match(routesPageSource, /formatRouteValues\(routePlan\.deliveryAreas\)/);
  assert.match(routesPageSource, /formatRouteDeliveryScope\(routePlan\)/);
  assert.match(routesPageSource, /date: formatRouteTableDate\(routePlan\)/);
  assert.match(routesPageSource, /<td style=\{routeTableCellStyle\}>\{route\.date\}<\/td>/);
  assert.doesNotMatch(routesPageSource, /\{route\.plannedFor\}/);
  assert.doesNotMatch(routesPageSource, /\{route\.deliveryDate\}/);
  assert.doesNotMatch(routesPageSource, />Delivery day<\/th>/);
});

test("Routes page removes the previous copied detail and settings rules", () => {
  assert.doesNotMatch(routesPageSource, /selectedRouteId/);
  assert.doesNotMatch(routesPageSource, /const routeMetricsGridStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeDetailMapStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeStopTimelineStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeSettingsPanelStyle = \{/);
  assert.doesNotMatch(routesPageSource, /function buildRouteStops\(routeDraft\) \{/);
  assert.doesNotMatch(routesPageSource, /Demo Route|EasyRoutes|Route settings|Route detail/);
});

test("Routes table selection column uses checkboxes and a single delete action", () => {
  assert.match(routesPageSource, /import \{ useEffect, useState \} from "react"/);
  assert.match(routesPageSource, /import \{ useAppBridge \} from "@shopify\/app-bridge-react"/);
  assert.match(routesPageSource, /useFetcher/);
  assert.match(routesPageSource, /const shopify = useAppBridge\(\)/);
  assert.match(routesPageSource, /const routeDeleteFetcher = useFetcher\(\)/);
  assert.match(routesPageSource, /const \[checkedRouteIds, setCheckedRouteIds\] = useState\(\[\]\)/);
  assert.match(routesPageSource, /const selectableRouteRows = routeRows\.filter\(\(route\) => route\.isClickable && route\.isDeletable !== false\)/);
  assert.match(routesPageSource, /const checkedRouteIdSet = new Set\(checkedRouteIds\)/);
  assert.match(routesPageSource, /const allVisibleRoutesChecked =/);
  assert.match(routesPageSource, /function toggleRouteCheck\(routeId\) \{/);
  assert.match(routesPageSource, /function toggleAllVisibleRouteChecks\(\) \{/);
  assert.match(routesPageSource, /async function handleDeleteSelectedRoutes\(\) \{/);
  assert.match(routesPageSource, /formData\.set\("_intent", "deleteRoutePlan"\)/);
  assert.match(routesPageSource, /formData\.set\("routePlanIds", JSON\.stringify\(checkedRouteIds\)\)/);
  assert.match(routesPageSource, /formData\.set\("shopifySessionToken", sessionToken\)/);
  assert.match(routesPageSource, /routeDeleteFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(routesPageSource, /aria-label="Select all visible routes"/);
  assert.match(routesPageSource, /aria-label=\{`Select \$\{route\.route\} for deletion`\}/);
  assert.match(routesPageSource, /checked=\{checkedRouteIdSet\.has\(route\.id\)\}/);
  assert.match(routesPageSource, /onChange=\{\(\) => toggleRouteCheck\(route\.id\)\}/);
  assert.match(routesPageSource, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(routesPageSource, />Delete selected<\/button>/);
  assert.doesNotMatch(routesPageSource, />\{route\.routeIndex\}<\/button>/);
  assert.doesNotMatch(routesPageSource, /aria-label=\{`Delete \$\{route\.route\}`\}/);
});


test("Routes table rows are clickable links into route detail", () => {
  assert.match(routesPageSource, /import \{ Outlet, redirect, useFetcher, useLoaderData, useNavigate, useParams, useRouteError, useSearchParams \} from "react-router"/);
  assert.match(routesPageSource, /const navigate = useNavigate\(\)/);
  assert.match(routesPageSource, /function createRouteDetailHref\(route\) \{/);
  assert.match(routesPageSource, /function handleRouteRowClick\(route\) \{/);
  assert.match(routesPageSource, /function handleRouteRowKeyDown\(event, route\) \{/);
  assert.match(routesPageSource, /navigate\(createRouteDetailHref\(route\)\)/);
  assert.match(routesPageSource, /onClick=\{\(\) => handleRouteRowClick\(route\)\}/);
  assert.match(routesPageSource, /onKeyDown=\{\(event\) => handleRouteRowKeyDown\(event, route\)\}/);
  assert.match(routesPageSource, /role=\{route\.isClickable \? "link" : undefined\}/);
  assert.match(routesPageSource, /tabIndex=\{route\.isClickable \? 0 : undefined\}/);
  assert.match(routesPageSource, /className=\{route\.isClickable \? "route-table-row" : undefined\}/);
  assert.match(routesPageSource, /aria-label=\{route\.isClickable \? `Open \$\{route\.route\} detail` : undefined\}/);
  assert.match(globalCssSource, /\.route-table-row\s*\{/);
  assert.match(globalCssSource, /cursor:\s*pointer/);
  assert.match(globalCssSource, /\.route-table-row:hover/);
  assert.match(globalCssSource, /\.route-table-row:focus-visible/);
});

test("Routes placeholder row is not clickable when there are no persisted route plans", () => {
  assert.match(routesPageSource, /isClickable: true/);
  assert.match(routesPageSource, /function handleRouteRowClick\(route\) \{/);
  assert.match(routesPageSource, /if \(!route\.isClickable\) return/);
  assert.match(routesPageSource, /function handleRouteRowKeyDown\(event, route\) \{/);
  assert.match(routesPageSource, /if \(!route\.isClickable\) return/);
  assert.match(routesPageSource, /onClick=\{\(\) => handleRouteRowClick\(route\)\}/);
  assert.match(routesPageSource, /onKeyDown=\{\(event\) => handleRouteRowKeyDown\(event, route\)\}/);
  assert.match(routesPageSource, /className=\{route\.isClickable \? "route-table-row" : undefined\}/);
  assert.match(routesPageSource, /role=\{route\.isClickable \? "link" : undefined\}/);
  assert.match(routesPageSource, /tabIndex=\{route\.isClickable \? 0 : undefined\}/);
  assert.match(routesPageSource, /aria-label=\{route\.isClickable \? `Open \$\{route\.route\} detail` : undefined\}/);
});

test("Routes parent renders the nested route detail page", () => {
  assert.match(routesPageSource, /const \{ routeId \} = useParams\(\)/);
  assert.match(routesPageSource, /if \(routeId\) return <Outlet \/>/);
});


test("Route detail loader reads server-saved drivers for route driver selection", () => {
  assert.match(routeDetailSource, /import \{ fetchDeliveryDrivers \} from "\.\.\/features\/delivery\/drivers\.server"/);
  assert.match(routeDetailSource, /drivers = \[\]/);
  assert.match(routeDetailSource, /fetchDeliveryDrivers\(request, \{\}\)/);
  assert.match(routeDetailSource, /driverData\.drivers/);
  assert.match(routeDetailSource, /driverData\.errors/);
});

test("Route detail saves a server-saved pending driver on the selected route", () => {
  assert.match(routeDetailSource, /assignDeliveryRoutePlanDriver/);
  assert.match(routeDetailSource, /intent === "saveRouteDriver"/);
  assert.match(routeDetailSource, /formData\.get\("driverId"\)/);
  assert.match(routeDetailSource, /assignDeliveryRoutePlanDriver\(\s+request,\s+params\.routeId,\s+\{ driverId \},\s+\{ sessionToken: shopifySessionToken \},\s+\)/);
  assert.match(routeDetailSource, /const routeDriverSaveFetcher = useFetcher\(\)/);
  assert.match(routeDetailSource, /buildRouteDriverOptions\(drivers, effectiveRoutePlan\?\.driver\)/);
  assert.match(routeDetailSource, /routeDriverSaveFetcher\.submit\(formData, \{ action: routeDetailSaveAction, method: "post" \}\)/);
  assert.match(routeDetailSource, />No driver<\/option>/);
  assert.match(routeDetailSource, /Invite pending/);
  assert.doesNotMatch(routeDetailSource, /authStatus === "APP_LINKED" \?/);
  assert.doesNotMatch(routeDetailSource, /intent !== "saveRouteStops"/);
});

test("Routes list displays assigned route drivers from the server response", () => {
  assert.match(routesPageSource, /function formatRouteDriver\(driver\) \{/);
  assert.match(routesPageSource, /driverId: routePlan\.driverId \?\? routePlan\.driver\?\.id \?\? null/);
  assert.match(routesPageSource, /driver: formatRouteDriver\(routePlan\.driver\)/);
  assert.match(routesPageSource, /routeFilters\.driverId && route\.driverId !== routeFilters\.driverId/);
});

test("Route detail route exists for clicked persisted route rows", () => {
  assert.equal(existsSync(routeDetailPath), true);
  assert.match(routeDetailSource, /import \{ useCallback, useEffect, useMemo, useRef, useState \} from "react"/);
  assert.match(routeDetailSource, /import \{ useAppBridge \} from "@shopify\/app-bridge-react"/);
  assert.match(routeDetailSource, /import \{ useFetcher, useLoaderData, useNavigate, useRouteError \} from "react-router"/);
  assert.match(routeDetailSource, /currentDepartureLocation = null/);
  assert.match(routeDetailSource, /drivers = \[],\s+routePlan,\s+routeGeometry = null,\s+routeStopPoints = \[],\s+stops = \[],\s+errors = \[]/);
  assert.doesNotMatch(routeDetailSource, /routeStopPointDebug: buildRouteStopPointDebug/);
  assert.match(routeDetailSource, /const savedRouteGeometry = routeGeometry/);
  assert.match(routeDetailSource, /const savedRouteStopPoints = routeStopPoints/);
  assert.match(routeDetailSource, /syncRouteDetailRouteLine\(map, savedRouteGeometry\)/);
  assert.match(routeDetailSource, /createRouteDetailMapMarkers\(\s+map,\s+maplibregl,\s+departureLocation,\s+orderedRouteStops,\s+savedRouteStopPoints,\s+\)/);
  assert.match(routeDetailSource, /buildRouteDetail\(effectiveRoutePlan\)/);
  assert.match(routeDetailSource, /<h1 className="route-detail-title" style=\{routesDetailTitleStyle\}>\{routeDetail\.route\}<\/h1>/);
  assert.doesNotMatch(routeDetailSource, /parseRouteDetailDraft/);
  assert.doesNotMatch(routeDetailSource, /useSearchParams/);
});

test("Route detail loader reads the selected persisted route plan", () => {
  assert.doesNotMatch(routeDetailSource, /fetchDeliveryOrders/);
  assert.match(routeDetailSource, /assignDeliveryRoutePlanDriver,[\s\S]*fetchDeliveryRoutePlanDetail,[\s\S]*from "\.\.\/features\/delivery\/route-plans\.server"/);
  assert.doesNotMatch(routeDetailSource, /updateDeliveryRoutePlanStops/);
  assert.match(routeDetailSource, /import \{ fetchShopifyDepartureLocation \} from "\.\.\/features\/locations\/shopify-locations\.server"/);
  assert.match(routeDetailSource, /import \{ authenticate \} from "\.\.\/shopify\.server"/);
  assert.match(routeDetailSource, /export const loader = async \(\{ params, request \}\) => \{/);
  assert.match(routeDetailSource, /const \{ admin, session \} = await authenticate\.admin\(request\)/);
  assert.match(routeDetailSource, /const shopifyShopCacheKey = session\?\.shop/);
  assert.match(routeDetailSource, /Promise\.all\(\[/);
  assert.match(routeDetailSource, /fetchDeliveryRoutePlanDetail\(request,\s*params\.routeId,\s*\{\s*cacheKey: shopifyShopCacheKey,?\s*\}\)/);
  assert.match(routeDetailSource, /fetchShopifyDepartureLocation\(admin,\s*\{\s*cacheKey: shopifyShopCacheKey\s*\}\)/);
  assert.match(routeDetailSource, /fetchDeliveryDrivers\(request, \{\}\)/);
  assert.doesNotMatch(routeDetailSource, /sameDateOrderData/);
  assert.match(routeDetailSource, /currentDepartureLocation: departureLocationData\.departureLocation/);
  assert.doesNotMatch(routeDetailSource, /fetchShopifyOrders\(admin\)/);
  assert.doesNotMatch(routeDetailSource, /getRouteOrderIds/);
});

test("Route detail summarizes delivery with the actual date label", () => {
  assert.match(routeDetailSource, /import \{ formatDeliveryScopeLabel \} from "\.\.\/features\/delivery\/delivery-labels"/);
  assert.match(routeDetailSource, /function formatRouteDeliveryScope\(routePlan\) \{/);
  assert.match(routeDetailSource, /formatDeliveryScopeLabel\(\{/);
  assert.match(routeDetailSource, /deliveryDate: routePlan\?\.routeScope\?\.deliveryDate \?\? routePlan\?\.deliveryDate \?\? routePlan\?\.planDate/);
  assert.match(routeDetailSource, /deliveryDate: formatRouteDeliveryScope\(routePlan\)/);
  assert.match(routeDetailSource, /renderRouteHeaderMetric\("Delivery date", routeDetail\.deliveryDate\)/);
  assert.doesNotMatch(routeDetailSource, /renderSummaryItem\("Delivery day", routeDetail\.deliveryDay\)/);
});

test("Route detail renders a cohesive route overview panel with driver assignment and summary", () => {
  const headerBlock = routeDetailSource.match(/const routeOverviewHeaderStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const titleBlock = routeDetailSource.match(/const routesDetailTitleStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const metricBlock = routeDetailSource.match(/const routeDetailTitleMetricStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const metricLabelBlock = routeDetailSource.match(/const routeDetailTitleMetricLabelStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const metricValueBlock = routeDetailSource.match(/const routeDetailTitleMetricValueStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const driverPanelBlock = routeDetailSource.match(/const routeOverviewDriverPanelStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const driverLabelBlock = routeDetailSource.match(/const routeDetailDriverLabelStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const driverSelectBlock = routeDetailSource.match(/const routeDetailDriverSelectStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const driverSaveButtonBlock = routeDetailSource.match(/const routeDetailDriverSaveButtonStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";

  assert.match(headerBlock, /linear-gradient\(180deg, #ffffff 0%, #fafafa 100%\)/);
  assert.match(headerBlock, /border: "1px solid #e3e3e3"/);
  assert.match(headerBlock, /borderRadius: "16px"/);
  assert.match(headerBlock, /boxShadow: "0 8px 24px rgba\(0, 0, 0, 0\.045\)"/);
  assert.match(headerBlock, /gap: "14px"/);
  assert.match(headerBlock, /padding: "16px"/);
  assert.doesNotMatch(headerBlock, /overflowX: "auto"/);
  assert.match(titleBlock, /fontSize: "24px"/);
  assert.match(titleBlock, /fontWeight: "700"/);
  assert.match(titleBlock, /lineHeight: "32px"/);
  assert.match(metricBlock, /display: "inline-flex"/);
  assert.match(metricBlock, /gap: "4px"/);
  assert.doesNotMatch(metricBlock, /background: "#ffffff"/);
  assert.doesNotMatch(metricBlock, /border: "1px solid #ebebeb"/);
  assert.match(metricLabelBlock, /lineHeight: 1\.1/);
  assert.match(metricValueBlock, /lineHeight: 1\.15/);
  assert.match(driverPanelBlock, /display: "flex"/);
  assert.match(driverPanelBlock, /justifyContent: "flex-end"/);
  assert.match(driverPanelBlock, /gap: "8px"/);
  assert.doesNotMatch(driverPanelBlock, /background: "#f7f7f7"/);
  assert.doesNotMatch(driverPanelBlock, /border: "1px solid #e5e5e5"/);
  assert.match(driverLabelBlock, /lineHeight: 1\.15/);
  assert.match(driverSelectBlock, /minHeight: "28px"/);
  assert.match(driverSelectBlock, /minWidth: 0/);
  assert.match(driverSelectBlock, /padding: "3px 8px"/);
  assert.match(driverSelectBlock, /width: "100%"/);
  assert.doesNotMatch(driverSelectBlock, /minWidth: "220px"/);
  assert.match(driverSaveButtonBlock, /minHeight: "28px"/);
  assert.match(driverSaveButtonBlock, /padding: "3px 10px"/);
  assert.match(routeDetailSource, /const routeDriverSummary = routeDriverId[\s\S]*: "Unassigned"/);
  assert.match(
    routeDetailSource,
    /<header className="route-overview-header" style=\{routeOverviewHeaderStyle\}>[\s\S]*aria-label="Back to routes list"[\s\S]*className="route-overview-main"[\s\S]*aria-label="Route driver assignment"/,
  );
  assert.doesNotMatch(routeDetailSource, /Review and assign a driver before publishing this route\./);
  assert.match(
    routeDetailSource,
    /aria-label="Route summary" className="route-overview-summary">[\s\S]*renderRouteHeaderMetric\("Orders", routeDetail\.orders\)[\s\S]*renderRouteHeaderMetric\("Delivery date", routeDetail\.deliveryDate\)[\s\S]*renderRouteHeaderMetric\("Driver", routeDriverSummary\)/,
  );
  assert.doesNotMatch(routeDetailSource, /renderRouteHeaderMetric\("Delivery area", routeDetail\.deliveryArea\)/);
  assert.match(routeDetailSource, /aria-label="Route summary" className="route-overview-summary">[\s\S]*<\/div>\n            <\/div>\n            <div\n              aria-label="Route driver assignment"/);
  assert.match(routeDetailSource, /function renderRouteHeaderMetric\(label, value\) \{/);
  assert.match(routeDetailSource, /aria-label="Route driver assignment"/);
  assert.doesNotMatch(routeDetailSource, /const routeDriverBuckets = useMemo/);
  assert.doesNotMatch(routeDetailSource, /aria-label="Route driver stop groups"/);
  assert.match(routeDetailSource, /aria-label="Route timing"/);
  assert.match(routeDetailSource, /aria-label="Driver route rows"/);
  assert.match(routeDetailSource, /aria-label="Route stop timeline"/);
  assert.match(routeDetailSource, /orderedRouteStops\.map\(\(stop\) =>/);
  assert.doesNotMatch(routeDetailSource, /activeRouteDriverStops/);
  assert.match(routeDetailSource, /height: "440px"/);
  assert.match(routeDetailSource, /minHeight: "440px"/);
  assert.doesNotMatch(routeDetailSource, /routeDetailHeaderInfoCardStyle/);
  assert.doesNotMatch(routeDetailSource, /routeDetailPageNavStyle/);
  assert.doesNotMatch(routeDetailSource, /routeDetailTitleMetricsStyle/);
  assert.doesNotMatch(routeDetailSource, /routeDetailMapRegionStyle|routeDetailMapInfoPanelStyle/);
  assert.doesNotMatch(routeDetailSource, /routeDetailSummaryGridStyle|routeDetailSummaryItemStyle|routeDetailSummaryLabelStyle|routeDetailSummaryValueStyle/);
  assert.doesNotMatch(routeDetailSource, /function renderSummaryItem/);
  assert.doesNotMatch(routeDetailSource, /renderSummaryItem\("Coordinates"/);
  assert.doesNotMatch(routeDetailSource, /renderSummaryItem\("Missing"/);
});

test("Route overview header has responsive CSS for driver and summary regions", () => {
  assert.match(globalCssSource, /\.route-overview-header/);
  assert.match(globalCssSource, /\.route-overview-main/);
  assert.match(globalCssSource, /grid-template-columns: minmax\(0, 1fr\) minmax\(280px, 380px\)/);
  assert.match(globalCssSource, /\.route-overview-driver-control[\s\S]*gap: 6px/);
  assert.match(globalCssSource, /\.route-overview-driver-control[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(globalCssSource, /\.route-overview-summary[\s\S]*display: flex/);
  assert.match(globalCssSource, /\.route-overview-summary[\s\S]*flex-wrap: wrap/);
  assert.match(globalCssSource, /\.route-overview-summary[\s\S]*gap: 6px 12px/);
  assert.doesNotMatch(globalCssSource, /\.route-overview-summary[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(globalCssSource, /@media \(max-width: 900px\)[\s\S]*\.route-overview-main[\s\S]*grid-template-columns: 1fr/);
  assert.match(globalCssSource, /@media \(max-width: 600px\)[\s\S]*\.route-overview-driver-control[\s\S]*grid-template-columns: 1fr/);
});

test("Route detail uses OpenFreeMap MapLibre without copying every reference control", () => {
  assert.match(routeDetailSource, /export const links = \(\) => \[\{ rel: "stylesheet", href: "\/vendor\/maplibre-gl\.css" \}\]/);
  assert.match(
    routeDetailSource,
    /const OPENFREEMAP_STYLE_URL = "\/vendor\/openfreemap-clever-lite\.json"/,
  );
  assert.match(routeDetailSource, /import\("maplibre-gl"\)/);
  assert.match(routeDetailSource, /import\("pmtiles"\)/);
  assert.match(routeDetailSource, /import \{ installMissingMapImageFallback \} from "\.\.\/features\/maps\/maplibre-missing-images"/);
  assert.match(routeDetailSource, /import \{ installPmtilesProtocol \} from "\.\.\/features\/maps\/pmtiles-protocol"/);
  assert.match(routeDetailSource, /installPmtilesProtocol\(maplibregl, Protocol\)/);
  assert.match(routeDetailSource, /installMissingMapImageFallback\(mapRef\.current\)/);
  assert.match(routeDetailSource, /style: OPENFREEMAP_STYLE_URL/);
  assert.match(routeDetailSource, /new maplibregl\.Map\(\{/);
  assert.doesNotMatch(routeDetailSource, /new maplibregl\.NavigationControl/);
  assert.match(routeDetailSource, /import \{ MapPanel, MapToolbar, renderMapFitIcon, renderMapRefreshIcon, renderMapZoomInIcon, renderMapZoomOutIcon \} from "\.\.\/ui\/map-panel"/);
  assert.match(routeDetailSource, /const routeDetailMapFrameStyle = \{/);
  assert.match(routeDetailSource, /const routeDetailMapCanvasStyle = \{/);
  assert.match(routeDetailSource, /canvasRef=\{mapContainerRef\}/);
  assert.match(routeDetailSource, /createDepartureMarkerElement\(departureLocation\)/);
  assert.match(routeDetailSource, /const ROUTE_DETAIL_ROUTE_SOURCE_ID = "route-detail-osrm-route"/);
  assert.match(routeDetailSource, /const ROUTE_DETAIL_ROUTE_LAYER_ID = "route-detail-osrm-route-line"/);
  assert.match(routeDetailSource, /function syncRouteDetailRouteLine\(map, routeGeometry\) \{/);
  assert.match(routeDetailSource, /function createRouteDetailMapMarkers\(map, maplibregl, departureLocation, routeStops, routeStopPoints\) \{/);
  assert.match(routeDetailSource, /type: "LineString"/);
  assert.match(routeDetailSource, /map\.addSource\(ROUTE_DETAIL_ROUTE_SOURCE_ID/);
  assert.match(routeDetailSource, /map\.addLayer\(\{/);
  assert.match(routeDetailSource, /source: ROUTE_DETAIL_ROUTE_SOURCE_ID/);
  assert.match(routeDetailSource, /syncRouteDetailRouteLine\(map, savedRouteGeometry\)/);
  assert.match(routeDetailSource, /createRouteDetailMapMarkers\(\s+map,\s+maplibregl,\s+departureLocation,\s+orderedRouteStops,\s+savedRouteStopPoints,\s+\)/);
  assert.doesNotMatch(routeDetailSource, /Dispatch|Mark all as ready|Add orders|Inventory|Start free trial/);
});

test("Route detail does not let route-line style readiness block marker rendering", () => {
  assert.match(routeDetailSource, /function isRouteDetailMapStyleReady\(map\) \{/);
  assert.match(routeDetailSource, /typeof map\?\.isStyleLoaded !== "function"/);
  assert.match(routeDetailSource, /return map\.isStyleLoaded\(\)/);
  assert.match(routeDetailSource, /catch \{\s+return false;\s+\}/);
  assert.match(routeDetailSource, /return true/);
  assert.match(routeDetailSource, /syncRouteDetailRouteLine\(map, savedRouteGeometry\)/);
  assert.match(
    routeDetailSource,
    /const routeDetailMarkers = createRouteDetailMapMarkers\(\s+map,\s+maplibregl,\s+departureLocation,\s+orderedRouteStops,\s+savedRouteStopPoints,\s+\);/,
  );
  assert.match(routeDetailSource, /logRouteDetailPerformance\("routes\.detail\.map\.sync"/);
  assert.doesNotMatch(
    routeDetailSource,
    /syncRouteDetailRouteLine\(map, savedRouteGeometry\)\s+&&\s+syncRouteDetailStopLayers\(map, orderedRouteStops, savedRouteStopPoints\)/,
  );
  assert.doesNotMatch(routeDetailSource, /if \(!didSyncRouteLine\) return|return;\s+if \(departureLocation\?\.hasCoordinates\)/);
  assert.match(routeDetailSource, /const handleRouteDetailStyleData = \(\) => \{/);
  assert.match(routeDetailSource, /map\.on\("styledata", handleRouteDetailStyleData\)/);
  assert.doesNotMatch(routeDetailSource, /bindRouteStopPointerHandlers|map\.on\("styledata", syncRouteDetailMapLayers\)/);
});

test("Route detail keeps marker coordinates validated and ordered for MapLibre", () => {
  assert.match(routeDetailSource, /function normalizeLngLat\(latitudeValue, longitudeValue\) \{/);
  assert.match(routeDetailSource, /function isValidLatitude\(latitude\) \{/);
  assert.match(routeDetailSource, /function isValidLongitude\(longitude\) \{/);
  assert.match(routeDetailSource, /return \[longitude, latitude\]/);
  assert.match(routeDetailSource, /const depotCoordinates = normalizeLngLat\(\s+routePlan\?\.depot\?\.latitude,\s+routePlan\?\.depot\?\.longitude,\s+\)/);
  assert.match(routeDetailSource, /const currentCoordinates =/);
  assert.match(routeDetailSource, /const coordinates = depotCoordinates \?\? currentCoordinates/);
  assert.match(routeDetailSource, /function normalizeRouteStopCoordinates\(stop\) \{/);
  assert.match(routeDetailSource, /Array\.isArray\(stop\?\.coordinates\)/);
  assert.match(routeDetailSource, /stop\?\.latitude \?\? stop\?\.coordinates\?\.latitude/);
  assert.match(routeDetailSource, /stop\?\.longitude \?\? stop\?\.coordinates\?\.longitude/);
  assert.match(routeDetailSource, /const coordinates = normalizeRouteStopCoordinates\(stop\)/);
  assert.match(routeDetailSource, /hasCoordinates: coordinates != null/);
});

test("Route detail places centered DOM stop markers and the departure marker on the map", () => {
  assert.match(mapMarkersSource, /markerElement\.style\.zIndex = options\.zIndex \?\? "3000"/);
  assert.match(mapMarkersSource, /function createDepartureMarkerIconElement\(\)/);
  assert.match(mapMarkersSource, /departure-map-marker__icon/);
  assert.match(mapMarkersSource, /markerPinElement\.append\(createDepartureMarkerIconElement\(\)\)/);
  assert.doesNotMatch(routeDetailSource, /markerPinElement\.textContent = "Start"/);
  assert.match(routeDetailSource, /new maplibregl\.Marker\(\{\s+anchor: "bottom",\s+element: createDepartureMarkerElement\(departureLocation\),\s+\}\)/);
  assert.match(routeDetailSource, /function createRouteStopMarkerElement\(stop\) \{/);
  assert.match(routeDetailSource, /className: "route-detail-stop-marker"/);
  assert.match(routeDetailSource, /labelClassName: "route-detail-stop-marker__label"/);
  assert.match(routeDetailSource, /label: stop\.stop/);
  assert.match(routeDetailSource, /zIndex: "3200"/);
  assert.match(routeDetailSource, /new maplibregl\.Marker\(\{\s+anchor: "center",\s+element: markerElement,\s+\}\)/);
  assert.match(globalCssSource, /\.route-detail-stop-marker \{[\s\S]*display: grid;[\s\S]*font-size: 9px;[\s\S]*place-items: center;/);
  assert.match(globalCssSource, /\.route-detail-stop-marker__label \{[\s\S]*display: inline-flex;[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*line-height: 1;/);
  assert.match(routeDetailSource, /markerElement\.addEventListener\("dblclick", handleStopMarkerDoubleClick\)/);
  assert.match(routeDetailSource, /event\.preventDefault\?\.\(\)/);
  assert.match(routeDetailSource, /event\.stopPropagation\?\.\(\)/);
  assert.match(routeDetailSource, /fitRouteStopAndSnappedPoint\(\s+map,\s+maplibregl,\s+stop,\s+routeStopPoint,\s+\)/);
  assert.match(routeDetailSource, /\.setLngLat\(departureLocation\.coordinates\)/);
  assert.match(routeDetailSource, /const markerCoordinates = getRouteStopPointerCoordinates\(stop, routeStopPoint\)/);
  assert.match(routeDetailSource, /\.setLngLat\(markerCoordinates\)/);
  assert.match(routeDetailSource, /fitRouteDetailMap\(mapRef\.current, maplibregl, routeMapLocations\)/);
  assert.doesNotMatch(routeDetailSource, /createRouteStopPopupElement|order-map-marker--planned|new maplibregl\.Popup|setPopup/);
});

test("Route detail falls back to route stop point coordinates before dropping stop markers", () => {
  assert.match(routeDetailSource, /function getRouteStopPointerCoordinates\(stop, routeStopPoint\) \{/);
  assert.match(routeDetailSource, /if \(stop\.hasCoordinates\) return stop\.coordinates/);
  assert.match(routeDetailSource, /normalizeLngLatPair\(routeStopPoint\?\.inputCoordinates\)/);
  assert.match(routeDetailSource, /normalizeLngLatPair\(routeStopPoint\?\.snappedCoordinates\)/);
  assert.match(routeDetailSource, /for \(const stop of routeStops\) \{\s+const routeStopPoint = findRouteStopPoint\(stop, routeStopPoints\);\s+const markerCoordinates = getRouteStopPointerCoordinates\(stop, routeStopPoint\);\s+if \(!markerCoordinates\) continue;/);
});

test("Route detail driver save button avoids React border shorthand collisions", () => {
  const driverSaveButtonBlock = routeDetailSource.match(/const routeDetailDriverSaveButtonStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const driverDisabledButtonBlock = routeDetailSource.match(/const routeDetailDriverDisabledSaveButtonStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";

  assert.doesNotMatch(driverSaveButtonBlock, /\bborder:\s*["']/);
  assert.match(driverSaveButtonBlock, /borderColor:\s*"#4f2bd9"/);
  assert.match(driverSaveButtonBlock, /borderStyle:\s*"solid"/);
  assert.match(driverSaveButtonBlock, /borderWidth:\s*"1px"/);
  assert.match(driverDisabledButtonBlock, /borderColor:\s*"#d6d6d6"/);
  assert.doesNotMatch(routeDetailSource, /const routeStopSequenceActionButtonStyle/);
});

test("Route detail can zoom a stop marker to its OSRM snapped stop point", () => {
  assert.match(routeDetailSource, /function normalizeLngLatPair\(coordinates\) \{/);
  assert.match(routeDetailSource, /function areLngLatPairsEqual\(firstCoordinates, secondCoordinates\) \{/);
  assert.match(routeDetailSource, /function findRouteStopPoint\(stop, routeStopPoints\) \{/);
  assert.match(routeDetailSource, /point\.deliveryStopId && stop\.deliveryStopId && point\.deliveryStopId === stop\.deliveryStopId/);
  assert.match(routeDetailSource, /point\.shopifyOrderGid === stop\.shopifyOrderGid/);
  assert.match(routeDetailSource, /function buildRouteStopPointFitLocations\(stop, routeStopPoint\) \{/);
  assert.match(routeDetailSource, /normalizeLngLatPair\(routeStopPoint\?\.snappedCoordinates\)/);
  assert.match(routeDetailSource, /areLngLatPairsEqual\(location\.coordinates, snappedCoordinates\)/);
  assert.match(routeDetailSource, /function fitRouteStopAndSnappedPoint\(map, maplibregl, stop, routeStopPoint\) \{/);
  assert.match(routeDetailSource, /fitRouteDetailMap\(map, maplibregl, locations, \{\s+maxZoom: 17,\s+singleZoom: 17,\s+\}\)/);
  assert.doesNotMatch(routeDetailSource, /routeGeometry\.coordinates.*snapped|routeGeometry.*findRouteStopPoint/);
});

test("Route detail keeps stop point diagnostics out of console and extra network traffic", () => {
  assert.doesNotMatch(routeDetailSource, /ROUTE_STOP_POINT_DEBUG_LOG_ENABLED/);
  assert.doesNotMatch(routeDetailSource, /routeStopPointDebug/);
  assert.doesNotMatch(routeDetailSource, /CLEVER_ROUTE_STOP_POINT_DEBUG/);
  assert.doesNotMatch(routeDetailSource, /createRouteDetailDebugHref/);
  assert.doesNotMatch(routeDetailSource, /debug=route-stop-points/);
  assert.doesNotMatch(routeDetailSource, /console\.groupCollapsed|console\.table|console\.log\("routeStopPointDebug"|console\.groupEnd/);
});

test("Route detail only auto-fits the map on initial map readiness", () => {
  assert.doesNotMatch(routeDetailSource, /appliedRouteStopSaveDataRef/);
  assert.doesNotMatch(routeDetailSource, /routeStopSaveFetcher/);
  assert.match(routeDetailSource, /const hasInitialRouteMapFitRef = useRef\(false\)/);
  assert.match(routeDetailSource, /const routeMapCenterRef = useRef\(routeMapCenter\)/);
  assert.match(routeDetailSource, /routeMapCenterRef\.current = routeMapCenter/);
  assert.match(routeDetailSource, /center: routeMapCenterRef\.current/);
  assert.doesNotMatch(routeDetailSource, /\}, \[mapRenderKey, routeMapCenter, scheduleMapRecovery\]\)/);
  assert.match(routeDetailSource, /hasInitialRouteMapFitRef\.current = false/);
  assert.match(routeDetailSource, /if \(hasInitialRouteMapFitRef\.current\) return/);
  assert.match(routeDetailSource, /hasInitialRouteMapFitRef\.current = true/);
  assert.match(routeDetailSource, /const duration = options\.duration \?\? 250/);
  assert.match(routeDetailSource, /map\.flyTo\(\{ center: locations\[0\]\.coordinates, duration, essential: true, zoom: singleZoom \}\)/);
  assert.match(routeDetailSource, /duration,/);
});

test("Route detail renders every stop as a small black numbered pointer without click expansion", () => {
  assert.match(routeDetailSource, /function createRouteStopMarkerElement\(stop\) \{/);
  assert.match(routeDetailSource, /className: "route-detail-stop-marker"/);
  assert.match(routeDetailSource, /ariaLabel: `Stop \$\{stop\.stop\}: \$\{stop\.order\}`/);
  assert.match(routeDetailSource, /label: stop\.stop/);
  assert.match(routeDetailSource, /new maplibregl\.Marker\(\{\s+anchor: "center",\s+element: markerElement,\s+\}\)/);
  assert.doesNotMatch(routeDetailSource, /expandedRouteStopIds|setExpandedRouteStopIds|toggleExpandedRouteStop|addEventListener\("click"|createRouteStopPopupElement|order-map-marker--planned|route-stop-precision-point|Show stop|Show \$\{group\.stops\.length\} overlapping route stops|getRouteStopOverlapGroupKey|expandedRouteStopOverlapGroupKey|toggleExpandedRouteStopGroup|getRouteStopOverlapMarkerOffset|markerOffset|ROUTE_STOP_EXPANDED_MARKER_GAP|offset: markerOffset|cluster|Cluster|supercluster|buildRouteStopMarkerGroups|ROUTE_STOP_OVERLAP_PIXEL_RADIUS/);
});

test("Route detail renders OSRM snapped stop points as small blue DOM points without zoom gating", () => {
  assert.doesNotMatch(routeDetailSource, /ROUTE_STOP_POINT_MARKER_MIN_ZOOM|minzoom:/);
  assert.match(routeDetailSource, /const ROUTE_STOP_POINT_MIN_DISTANCE_METERS = 1/);
  assert.match(routeDetailSource, /function buildRouteStopPointMarker\(stop, routeStopPoint\) \{/);
  assert.match(routeDetailSource, /const snappedCoordinates = normalizeLngLatPair\(routeStopPoint\?\.snappedCoordinates\)/);
  assert.match(routeDetailSource, /calculateLngLatDistanceMeters\(stop\.coordinates, snappedCoordinates\)/);
  assert.match(routeDetailSource, /distanceMeters < ROUTE_STOP_POINT_MIN_DISTANCE_METERS/);
  assert.match(routeDetailSource, /function createRouteStopPointMarkerElement\(\) \{/);
  assert.match(routeDetailSource, /className: "route-detail-snapped-stop-point"/);
  assert.match(routeDetailSource, /const stopPointMarker = buildRouteStopPointMarker\(stop, routeStopPoint\)/);
  assert.match(routeDetailSource, /new maplibregl\.Marker\(\{\s+anchor: "center",\s+element: createRouteStopPointMarkerElement\(\),\s+\}\)/);
  assert.match(routeDetailSource, /\.setLngLat\(stopPointMarker\.coordinates\)/);
  assert.match(globalCssSource, /\.route-detail-snapped-stop-point \{[\s\S]*background: var\(--map-marker-color, #1473e6\);[\s\S]*height: 8px;[\s\S]*width: 8px;/);
  assert.doesNotMatch(routeDetailSource, /function shouldRenderRouteStopPoints|zoomend/);
});

test("Route detail avoids WebGL stop layers so marker visibility is not style-layer dependent", () => {
  assert.match(routeDetailSource, /function createRouteDetailMapMarkers\(map, maplibregl, departureLocation, routeStops, routeStopPoints\) \{/);
  assert.doesNotMatch(routeDetailSource, /ROUTE_DETAIL_STOPS_SOURCE_ID|ROUTE_DETAIL_STOP_POINTER_LAYER_ID|ROUTE_DETAIL_STOP_POINTER_LABEL_LAYER_ID|ROUTE_DETAIL_STOP_POINT_LAYER_ID/);
  assert.doesNotMatch(routeDetailSource, /function syncRouteDetailStopLayers|function ensureRouteDetailStopLayerOrder|map\.moveLayer\(layerId\)/);
  assert.doesNotMatch(routeDetailSource, /featureType: "routeStop"|featureType: "snappedStopPoint"/);
});

test("Route detail map has compact refresh and automatic recovery controls", () => {
  assert.match(routeDetailSource, /const MAP_RECOVERY_DELAY_MS = 2500/);
  assert.match(routeDetailSource, /const MAX_MAP_RECOVERY_ATTEMPTS = 3/);
  assert.match(routeDetailSource, /import \{ MapPanel, MapToolbar, renderMapFitIcon, renderMapRefreshIcon, renderMapZoomInIcon, renderMapZoomOutIcon \} from "\.\.\/ui\/map-panel"/);
  assert.match(routeDetailSource, /<MapPanel/);
  assert.match(routeDetailSource, /<MapToolbar/);
  assert.match(routeDetailSource, /renderMapRefreshIcon\(\)/);
  assert.match(routeDetailSource, /renderMapFitIcon\(\)/);
  assert.match(routeDetailSource, /renderMapZoomInIcon\(\)/);
  assert.match(routeDetailSource, /renderMapZoomOutIcon\(\)/);
  assert.match(routeDetailSource, /const clearMapRecoveryTimer = useCallback\(\(\) => \{/);
  assert.match(routeDetailSource, /const scheduleMapRecovery = useCallback\(\(\) => \{/);
  assert.match(routeDetailSource, /const handleRefreshMap = \(\) => \{/);
  assert.match(routeDetailSource, /const handleFitRouteMap = \(\) => \{/);
  assert.match(routeDetailSource, /fitRouteDetailMap\(mapRef\.current, mapLibraryRef\.current, routeMapLocations\)/);
  assert.match(routeDetailSource, /setMapRenderKey\(\(currentRenderKey\) => currentRenderKey \+ 1\)/);
  assert.match(routeDetailSource, /scheduleMapRecovery\(\)/);
  assert.match(routeDetailSource, /ariaLabel: "Refresh route map"/);
  assert.match(routeDetailSource, /ariaLabel: "Fit highlighted map markers"/);
  assert.doesNotMatch(routeDetailSource, /Zoom route map to store|handleFitStoreMap/);
  assert.doesNotMatch(routeDetailSource, />Zoom to fit<|>Fit<|>Zoom<|>줌/);
  assert.match(routeDetailSource, /canvasKey=\{mapRenderKey\}/);
  assert.doesNotMatch(routeDetailSource, />Loading map</);
  assert.doesNotMatch(routeDetailSource, />Map unavailable</);
});



test("Route detail marker rendering does not call MapLibre resize from map event handlers", () => {
  assert.match(routeDetailSource, /const syncRouteDetailMap = \(\) => \{/);
  const layerSyncStart = routeDetailSource.indexOf("const syncRouteDetailMap = () => {");
  const layerSyncEnd = routeDetailSource.indexOf("const handleRouteDetailStyleData = () => {", layerSyncStart);
  const layerSyncBody = routeDetailSource.slice(layerSyncStart, layerSyncEnd);

  assert.doesNotMatch(layerSyncBody, /\.resize\(\)/);
  assert.match(routeDetailSource, /map\.on\("styledata", handleRouteDetailStyleData\)/);
  assert.match(routeDetailSource, /markerElement\.addEventListener\("dblclick", handleStopMarkerDoubleClick\)/);
  assert.doesNotMatch(routeDetailSource, /\.on\("moveend", syncRouteDetailMapLayers\)/);
  assert.doesNotMatch(routeDetailSource, /\.on\("zoomend", syncRouteDetailMapLayers\)/);
});

test("Route detail renders route lines and a stop timeline below the map", () => {
  assert.match(routeDetailSource, /function buildRouteStops\(stops\) \{/);
  assert.match(routeDetailSource, /const orderedRouteStops = useMemo\(\(\) => buildRouteStops\(stops\), \[stops\]\)/);
  assert.match(routeDetailSource, /const routePlanRowsColumnWidths = \[/);
  assert.match(routeDetailSource, />Name<\/th>/);
  assert.match(routeDetailSource, />Status<\/th>/);
  assert.match(routeDetailSource, />Driver<\/th>/);
  assert.match(routeDetailSource, />Vehicle<\/th>/);
  assert.match(routeDetailSource, />Start time<\/th>/);
  assert.match(routeDetailSource, />Stops<\/th>/);
  assert.match(routeDetailSource, />Delivered<\/th>/);
  assert.match(routeDetailSource, />Attempted<\/th>/);
  assert.match(routeDetailSource, />Total items<\/th>/);
  assert.match(routeDetailSource, />Total drive time<\/th>/);
  assert.match(routeDetailSource, />Total distance<\/th>/);
  assert.match(routeDetailSource, />Total weight<\/th>/);
  assert.match(routeDetailSource, />Created<\/th>/);
  assert.match(routeDetailSource, /function getRouteCandidateTitle\(routePlan\) \{/);
  assert.match(routeDetailSource, /aria-label="Change route driver"/);
  assert.match(routeDetailSource, /aria-label="Change route vehicle"/);
  assert.match(routeDetailSource, /aria-label="Change route start time"/);
  assert.match(routeDetailSource, /function renderRouteEditableChevron\(\) \{/);
  assert.match(routeDetailSource, /function renderRouteLineEditIcon\(\) \{/);
  assert.match(routeDetailSource, /aria-label="Edit route candidate name"/);
  assert.match(routeDetailSource, /viewBox="0 0 10 10"/);
  assert.doesNotMatch(routeDetailSource, />⌄<\/span>/);
  assert.doesNotMatch(routeDetailSource, /type="datetime-local"/);
  assert.match(routeDetailSource, /orderedRouteStops\.map\(\(stop\) =>/);
  assert.doesNotMatch(routeDetailSource, />Order<\/th>/);
  assert.doesNotMatch(routeDetailSource, />Recipient<\/th>/);
  assert.doesNotMatch(routeDetailSource, />Address<\/th>/);
  assert.doesNotMatch(routeDetailSource, /Same-date orders/);
  assert.doesNotMatch(routeDetailSource, /Save order/);
});

test("Route detail page provides page navigation back to the route list", () => {
  assert.match(routeDetailSource, /import \{ useFetcher, useLoaderData, useNavigate, useRouteError \} from "react-router"/);
  assert.match(routeDetailSource, /const navigate = useNavigate\(\)/);
  assert.match(routeDetailSource, /const routesListHref = "\/app\/routes"/);
  assert.match(routeDetailSource, /onClick=\{\(\) => navigate\(routesListHref\)\}/);
  assert.match(routeDetailSource, /<span aria-hidden="true" style=\{routeDetailBackIconStyle\}>/);
  assert.match(routeDetailSource, /viewBox="0 0 20 20"/);
  assert.match(routeDetailSource, /d="M12\.5 4\.5 7 10l5\.5 5\.5"/);
  assert.match(routeDetailSource, /<span>Back to routes<\/span>/);
  assert.match(routeDetailSource, /aria-label="Back to routes list"/);
  assert.match(routeDetailSource, /const routeOverviewTopBarStyle = \{/);
  assert.match(routeDetailSource, /<header className="route-overview-header" style=\{routeOverviewHeaderStyle\}>[\s\S]*style=\{routeOverviewTopBarStyle\}[\s\S]*aria-label="Back to routes list"/);
  assert.match(routeDetailSource, /const routeDetailBackButtonStyle = \{/);
  assert.match(routeDetailSource, /const routeDetailBackIconStyle = \{/);
  assert.match(routeDetailSource, /background: "transparent"/);
});
