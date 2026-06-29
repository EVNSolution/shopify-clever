/* eslint-env node */
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
const routeGroupDetailPath = join(root, "app/routes/app.route-groups.$routeGroupId.jsx");
const routeGroupDetailSource = existsSync(routeGroupDetailPath)
  ? readFileSync(routeGroupDetailPath, "utf8")
  : "";
const globalCssSource = readFileSync(join(root, "app/styles/global.css"), "utf8");
const mapMarkersSource = readFileSync(join(root, "app/features/maps/map-markers.js"), "utf8");

test("Routes page loads persisted route plans and route groups from the delivery Admin API", () => {
  assert.match(routesPageSource, /import \{ deleteDeliveryRoutePlan, fetchDeliveryRoutePlans \} from "\.\.\/features\/delivery\/route-plans\.server"/);
  assert.match(routesPageSource, /import \{ deleteDeliveryRouteGroup, fetchDeliveryRouteGroups \} from "\.\.\/features\/delivery\/route-groups\.server"/);
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
  assert.match(routesPageSource, /function parseRouteDeleteTargets\(value\) \{/);
  assert.match(routesPageSource, /const routeDeleteTargets = parseRouteDeleteTargets\(formData\.get\("routePlanIds"\)\)/);
  assert.match(routesPageSource, /routeDeleteTargets\.map\(\(target\) =>/);
  assert.match(routesPageSource, /deleteDeliveryRouteGroup\(request, target\.id, \{ sessionToken: shopifySessionToken \}\)/);
  assert.match(routesPageSource, /deleteDeliveryRoutePlan\(request, target\.id, \{ sessionToken: shopifySessionToken \}\)/);
  assert.match(routesPageSource, /const \{ routeGroups = \[\], routePlans = \[\], errors = \[\] \} = useLoaderData\(\)/);
  assert.match(routesPageSource, /buildRouteRows\(routePlans, routeGroups\)/);
  assert.match(routesPageSource, /useSearchParams/);
  assert.match(routesPageSource, /const \[searchParams\] = useSearchParams\(\)/);
  assert.match(routesPageSource, /getRouteFilters\(searchParams\)/);
  assert.doesNotMatch(routesPageSource, /parseRouteDraft/);
  assert.doesNotMatch(routesPageSource, /searchParams\.get\("orderIds"\)/);
});

test("Routes page lists saved child routes below their parent route group", () => {
  assert.match(routesPageSource, /const routeChildRows = safeRouteGroups\.flatMap/);
  assert.match(routesPageSource, /\.filter\(\(child\) => child\?\.routePlanId\)/);
  assert.match(routesPageSource, /parentRouteGroupId: routeGroup\.id/);
  assert.match(routesPageSource, /isDeletable: false/);
  assert.match(routesPageSource, /return \[\.\.\.routeGroupRows, \.\.\.routeChildRows, \.\.\.routePlanRows\]/);
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
  assert.match(routesPageSource, /<div style=\{routesHeaderActionsStyle\}>/);
  assert.match(routesPageSource, /<span style=\{routeSelectionSummaryStyle\}>[\s\S]*\{checkedRouteIds\.length\} selected/);
  assert.match(routesPageSource, />Delete<\/button>/);
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
  assert.match(routesPageSource, /const ROUTE_NAME_COLUMN_MIN_WIDTH = 112/);
  assert.match(routesPageSource, /function getRouteNameColumnWidth\(routeRows\) \{/);
  assert.match(routesPageSource, /Math\.max\(ROUTE_NAME_COLUMN_MIN_WIDTH, longestRouteName \* 7 \+ 28\)/);
  assert.match(routesPageSource, /function getRouteColumnWidths\(routeRows\) \{/);
  assert.match(routesPageSource, /getRouteNameColumnWidth\(routeRows\)/);
  assert.match(routesPageSource, /const routesHeaderActionsStyle = \{/);
  assert.match(routesPageSource, /const routeSelectionSummaryStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeControlsStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeControlsTrailingStyle = \{/);
  assert.match(routesPageSource, /const routeCheckboxCellStyle = \{/);
  assert.match(routesPageSource, /const routeActionButtonStyle = \{/);
  assert.match(routesPageSource, /background: "#ffffff"/);
  assert.match(routesPageSource, /color: "#303030"/);
  assert.doesNotMatch(routesPageSource, /#d72c0d/);
  assert.match(routesPageSource, /const routeDisabledActionButtonStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeIndexActionsStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeIndexButtonStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeDeleteButtonStyle = \{/);
  assert.match(routesPageSource, /const singleRouteTableStyle = \{/);
  assert.match(routesPageSource, /minWidth: "996px"/);
  assert.match(routesPageSource, /width: "100%"/);
  assert.match(routesPageSource, /const routeNumberHeaderCellStyle = \{/);
  assert.match(routesPageSource, /<th style=\{routeNumberHeaderCellStyle\}>Orders<\/th>/);
  assert.match(routesPageSource, /padding: "7px 8px"/);
  assert.match(routesPageSource, /padding: "8px 8px"/);
  assert.match(routesPageSource, /<table style=\{singleRouteTableStyle\}>/);
  assert.match(routesPageSource, /<colgroup>/);
  assert.match(routesPageSource, /const routeColumnWidths = getRouteColumnWidths\(routeRows\)/);
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
  assert.match(routesPageSource, /checked=\{checkedRouteIdSet\.has\(route\.deleteKey\)\}/);
  assert.match(routesPageSource, /onChange=\{\(\) => toggleRouteCheck\(route\.deleteKey\)\}/);
  assert.match(routesPageSource, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(routesPageSource, />Delete<\/button>/);
  assert.doesNotMatch(routesPageSource, />Delete selected<\/button>/);
  assert.doesNotMatch(routesPageSource, />\{route\.routeIndex\}<\/button>/);
  assert.doesNotMatch(routesPageSource, /aria-label=\{`Delete \$\{route\.route\}`\}/);
});


test("Routes table rows are clickable links into route detail", () => {
  assert.match(routesPageSource, /import \{ Outlet, redirect, useFetcher, useLoaderData, useNavigate, useParams, useRouteError, useSearchParams \} from "react-router"/);
  assert.match(routesPageSource, /const navigate = useNavigate\(\)/);
  assert.match(routesPageSource, /function createRouteDetailHref\(route, idToken\) \{/);
  assert.ok(routesPageSource.includes("rowKey: `routeGroup:${routeGroup.id}`"));
  assert.ok(routesPageSource.includes("key={route.rowKey ?? route.id}"));
  assert.ok(routesPageSource.includes("href: `/app/route-groups/${routeGroup.id}`"));
  assert.ok(routesPageSource.includes("href: `/app/routes/${child.routePlanId}`"));
  assert.ok(routesPageSource.includes("href: `/app/routes/${routePlan.id}`"));
  assert.match(routesPageSource, /return `\$\{route\.href\}\$\{getRouteDetailSearch\(idToken\)\}`/);
  assert.match(routesPageSource, /function navigateRouteDetail\(route\) \{/);
  assert.match(routesPageSource, /shopify\.idToken\(\)/);
  assert.match(routesPageSource, /navigate\(createRouteDetailHref\(route, idToken\)\)/);
  assert.match(routesPageSource, /catch\(\(\) => navigate\(createRouteDetailHref\(route, fallbackIdToken\)\)\)/);
  assert.match(routesPageSource, /function handleRouteRowClick\(route\) \{/);
  assert.match(routesPageSource, /function handleRouteRowKeyDown\(event, route\) \{/);
  assert.match(routesPageSource, /navigateRouteDetail\(route\)/);
  assert.match(routesPageSource, /function getRouteDetailSearch\(idToken\) \{/);
  assert.match(routesPageSource, /const fallbackIdToken = searchParams\.get\("id_token"\)/);
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


test("Route detail loader reads server-saved drivers for route driver labels", () => {
  assert.match(routeDetailSource, /import \{ fetchDeliveryDrivers \} from "\.\.\/features\/delivery\/drivers\.server"/);
  assert.match(routeDetailSource, /drivers = \[\]/);
  assert.match(routeDetailSource, /fetchDeliveryDrivers\(request, \{\}\)/);
  assert.match(routeDetailSource, /fetchDeliveryRouteGroupDetail\(request, routeGroupId, \{ cacheKey: shopifyShopCacheKey \}\)/);
  assert.match(routeDetailSource, /routeGroup: routeGroupData\.routeGroup/);
  assert.match(routeDetailSource, /driverData\.drivers/);
  assert.match(routeDetailSource, /driverData\.errors/);
});

test("Route detail keeps the server driver action but removes the header assignment UI", () => {
  assert.match(routeDetailSource, /assignDeliveryRoutePlanDriver/);
  assert.match(routeDetailSource, /intent === "saveRouteDriver"/);
  assert.match(routeDetailSource, /formData\.get\("driverId"\)/);
  assert.match(routeDetailSource, /assignDeliveryRoutePlanDriver\(\s+request,\s+params\.routeId,\s+\{ driverId \},\s+\{ sessionToken: shopifySessionToken \},\s+\)/);
  assert.match(routeDetailSource, /buildRouteDriverOptions\(drivers, effectiveRoutePlan\?\.driver\)/);
  assert.match(routeDetailSource, /Invite pending/);
  assert.doesNotMatch(routeDetailSource, /const routeDriverSaveFetcher = useFetcher\(\)/);
  assert.doesNotMatch(routeDetailSource, /routeDriverSaveFetcher\.submit/);
  assert.doesNotMatch(routeDetailSource, />No driver<\/option>/);
  assert.doesNotMatch(routeDetailSource, /authStatus === "APP_LINKED" \?/);
  assert.doesNotMatch(routeDetailSource, /intent !== "saveRouteStops"/);
});


test("Route detail wires route group action buttons through App Bridge", () => {
  assert.match(routeDetailSource, /import \{ Link, useFetcher, useLoaderData, useLocation, useNavigate, useRevalidator, useRouteError \} from "react-router"/);
  assert.match(routeDetailSource, /import \{ useAppBridge \} from "@shopify\/app-bridge-react"/);
  assert.match(routeDetailSource, /previewDeliveryRouteGroupOptimization/);
  assert.doesNotMatch(routeDetailSource, /createDeliveryRouteGroupBranch/);
  assert.doesNotMatch(routeDetailSource, /reOptimizeDeliveryRouteGroup/);
  assert.doesNotMatch(routeDetailSource, /updateDeliveryRouteGroupBranchOrders/);
  assert.match(routeDetailSource, /fetchDeliveryRouteGroupDetail/);
  assert.match(routeDetailSource, /logRouteDetailPerformance\("routes\.detail\.action"/);
  assert.match(routeDetailSource, /logRouteGroupActionResult\("routes\.detail\.action\.previewRouteOptimization"/);
  assert.doesNotMatch(routeDetailSource, /getRouteGroupActionRedirectRouteId/);
  assert.doesNotMatch(routeDetailSource, /return redirect\(`\/app\/routes/);
  assert.match(routeDetailSource, /intent === "previewRouteOptimization"/);
  assert.match(routeDetailSource, /intent === "saveRouteDraft"/);
  assert.doesNotMatch(routeDetailSource, /intent === "addEmptyRouteBranch"/);
  assert.doesNotMatch(routeDetailSource, /intent === "assignPolygonToRoute"/);
  assert.match(routeDetailSource, /const shopify = useAppBridge\(\)/);
  assert.match(routeDetailSource, /const routeActionFetcher = useFetcher\(\)/);
  assert.match(routeDetailSource, /const revalidator = useRevalidator\(\)/);
  assert.match(routeDetailSource, /effectiveRoutePlan\?\.routeGroupingChild\?\.groupingId/);
  assert.match(routeDetailSource, /textOrUndefined\(effectiveRoutePlan\?\.routeGroupingChild\?\.groupingId\) \?\? textOrUndefined\(routeGroup\?\.id\)/);
  assert.match(routeDetailSource, /shopify\.idToken\(\)/);
  assert.doesNotMatch(routeDetailSource, /console\.info\("routes\.detail\.action\.submit"/);
  assert.doesNotMatch(routeDetailSource, /console\.warn\("routes\.detail\.action\.submit\.missing_route_group_id"/);
  assert.match(routeDetailSource, /routeActionFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(routeDetailSource, /const routeGroupActionIntent = routeActionFetcher\.formData\?\.get\("_intent"\)/);
  assert.match(routeDetailSource, /const reOptimizeRouteGroupBusy = routeGroupActionBusy && routeGroupActionIntent === "previewRouteOptimization"/);
  assert.match(routeDetailSource, /const addEmptyRouteBranchBusy = false/);
  assert.match(routeDetailSource, /\{reOptimizeRouteGroupBusy \? "Working…" : "Re-optimize"\}/);
  assert.match(routeDetailSource, /\{addEmptyRouteBranchBusy \? "Working…" : "Add Empty Route"\}/);
  assert.match(routeDetailSource, /submitRouteGroupAction\("previewRouteOptimization", \{\s+draft: JSON\.stringify\(buildRouteDraftPayload\(timelineRouteRows, \{ includeExistingOptimized: true \}\)\),/);
  assert.match(routeDetailSource, /submitRouteGroupAction\("saveRouteDraft", \{\s+draft: JSON\.stringify\(buildRouteDraftPayload\(timelineRouteRows, \{ includeEmptyTempRoutes: false, includeExistingOptimized: false \}\)\),/);
  assert.match(routeDetailSource, /const handleAddEmptyRoute = \(\) => \{/);
  assert.match(routeDetailSource, /setClientRouteRows\(\(rows\) => \[/);
  assert.match(routeDetailSource, /const polygonCandidateOrderIds = polygonCandidateStops\.map\(\(stop\) => stop\.orderId\)/);
  assert.match(routeDetailSource, /setRouteTimelineOrderByRouteId\(\(currentOrderByRouteId\) =>/);
  assert.match(routeDetailSource, /moveTimelineStop\(routeRows, nextOrderByRouteId, \{ stopId \}, targetRouteRow\.id\)/);
  assert.doesNotMatch(routeDetailSource, /submitRouteGroupAction\("assignPolygonToRoute"/);
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
  assert.match(routeDetailSource, /import \{ Link, useFetcher, useLoaderData, useLocation, useNavigate, useRevalidator, useRouteError \} from "react-router"/);
  assert.match(routeDetailSource, /currentDepartureLocation = null/);
  assert.match(routeDetailSource, /childRouteDetails = \[],\s+currentDepartureLocation = null,\s+drivers = \[],\s+routePlan,\s+routeGeometry = null,\s+routeGroup = null,\s+routeDetailTitleOverride = null,\s+routeMetrics = null,\s+routeStopPoints = \[],\s+stops = \[],\s+errors = \[]/);
  assert.doesNotMatch(routeDetailSource, /routeStopPointDebug: buildRouteStopPointDebug/);
  assert.match(routeDetailSource, /const routeMapRows = isRouteGroupDetail \? timelineRouteRows : currentRouteRows/);
  assert.match(routeDetailSource, /const routeMapStops = routeMapRows\.flatMap/);
  assert.match(routeDetailSource, /buildRouteGeometryRows\(routeGeometrySourceRows, routeChildDetailsByOrders, routeGeometry, routeStopPoints\)/);
  assert.match(routeDetailSource, /const savedRouteGeometryRows = routeGeometryRows/);
  assert.match(routeDetailSource, /const savedRouteMarkerStopPoints = routeMarkerStopPoints/);
  assert.match(routeDetailSource, /const routePathColor = softenRouteColor\(routeLineColor\)/);
  assert.match(routeDetailSource, /syncRouteDetailRouteLine\(map, savedRouteGeometryRows, routePathColor\)/);
  assert.match(routeDetailSource, /createRouteDetailMapMarkers\(\s+map,\s+maplibregl,\s+departureLocation,\s+routeMapStops,\s+savedRouteMarkerStopPoints,\s+routeLineColor,\s+routeStopColorById,\s+\)/);
  assert.match(routeDetailSource, /buildRouteDetail\(effectiveRoutePlan\)/);
  assert.match(routeDetailSource, /<h1 className="route-detail-title" style=\{routesDetailTitleStyle\}>\{routeDetailTitle\}<\/h1>/);
  assert.doesNotMatch(routeDetailSource, /parseRouteDetailDraft/);
  assert.doesNotMatch(routeDetailSource, /useSearchParams/);
});

test("Route detail loader reads the selected persisted route plan", () => {
  assert.doesNotMatch(routeDetailSource, /fetchDeliveryOrders/);
  assert.match(routeDetailSource, /assignDeliveryRoutePlanDriver,[\s\S]*fetchDeliveryRoutePlanDetail,[\s\S]*from "\.\.\/features\/delivery\/route-plans\.server"/);
  assert.doesNotMatch(routeDetailSource, /updateDeliveryRoutePlanStops/);
  assert.match(routeDetailSource, /import \{ fetchShopifyDepartureLocation \} from "\.\.\/features\/locations\/shopify-locations\.server"/);
  assert.match(routeDetailSource, /import \{ authenticate \} from "\.\.\/shopify\.server"/);
  assert.match(routeDetailSource, /export const loader = async \(\{ params, request \}\) => loadRoutePlanDetail\(request, params\.routeId\)/);
  assert.match(routeDetailSource, /const \{ admin, session \} = await authenticate\.admin\(request\)/);
  assert.match(routeDetailSource, /const shopifyShopCacheKey = session\?\.shop/);
  assert.match(routeDetailSource, /Promise\.all\(\[/);
  assert.match(routeDetailSource, /fetchDeliveryRoutePlanDetail\(request, routeId, \{\s+cacheKey: shopifyShopCacheKey,\s+\}\)/);
  assert.match(routeDetailSource, /fetchShopifyDepartureLocation\(admin,\s*\{\s*cacheKey: shopifyShopCacheKey\s*\}\)/);
  assert.match(routeDetailSource, /fetchDeliveryDrivers\(request, \{\}\)/);
  assert.match(routeDetailSource, /fetchDeliveryRouteGroupDetail\(request, routeGroupId, \{ cacheKey: shopifyShopCacheKey \}\)/);
  assert.match(routeDetailSource, /routeGroup: routeGroupData\.routeGroup/);
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

test("Route detail preserves id_token on back and switch links", () => {
  assert.match(routeDetailSource, /useLocation/);
  assert.match(routeDetailSource, /function getRouteSessionSearch\(locationSearch\) \{/);
  assert.match(routeDetailSource, /new URLSearchParams\(locationSearch\)\.get\("id_token"\)/);
  assert.match(routeDetailSource, /const routesListHref = `\/app\/routes\$\{routeSessionSearch\}`/);
  assert.match(routeDetailSource, /to=\{`\$\{routeLink\.href\}\$\{routeSessionSearch\}`\}/);
});

test("Route detail uses the selected route title unless a group route supplies an override", () => {
  assert.match(routeDetailSource, /const routeDetailTitle = textOrUndefined\(routeDetailTitleOverride\) \?\? textOrUndefined\(routeDetail\.route\) \?\? textOrUndefined\(routeGroup\?\.name\) \?\? "Route"/);
  assert.match(routeDetailSource, /<h1 className="route-detail-title" style=\{routesDetailTitleStyle\}>\{routeDetailTitle\}<\/h1>/);
});

test("Route detail renders a compact route overview panel with inline summary", () => {
  const headerBlock = routeDetailSource.match(/const routeOverviewHeaderStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const titleBlock = routeDetailSource.match(/const routesDetailTitleStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const metricBlock = routeDetailSource.match(/const routeDetailTitleMetricStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const metricLabelBlock = routeDetailSource.match(/const routeDetailTitleMetricLabelStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const metricValueBlock = routeDetailSource.match(/const routeDetailTitleMetricValueStyle = \{[\s\S]*?\n\};/)?.[0] ?? "";

  assert.match(headerBlock, /linear-gradient\(180deg, #ffffff 0%, #fafafa 100%\)/);
  assert.match(headerBlock, /border: "1px solid #e3e3e3"/);
  assert.match(headerBlock, /borderRadius: "16px"/);
  assert.match(headerBlock, /boxShadow: "0 8px 24px rgba\(0, 0, 0, 0\.045\)"/);
  assert.match(headerBlock, /gap: "10px"/);
  assert.match(headerBlock, /padding: "14px 16px"/);
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
  assert.match(routeDetailSource, /const routeDriverSummary = routeDriverId[\s\S]*: "Unassigned"/);
  assert.match(
    routeDetailSource,
    /<h1 className="route-detail-title"[\s\S]*<span style=\{routeStatusBadgeStyle\}>[\s\S]*aria-label="Route summary" className="route-overview-summary"/,
  );
  assert.match(
    routeDetailSource,
    /aria-label="Route summary" className="route-overview-summary">[\s\S]*renderRouteHeaderMetric\("Orders", routeDetail\.orders\)[\s\S]*renderRouteHeaderMetric\("Delivery date", routeDetail\.deliveryDate\)[\s\S]*renderRouteHeaderMetric\("Driver", routeDriverSummary\)/,
  );
  assert.doesNotMatch(routeDetailSource, /aria-label="Route driver assignment"/);
  assert.doesNotMatch(routeDetailSource, /const routeOverviewDriverPanelStyle/);
  assert.doesNotMatch(routeDetailSource, /const routeDetailDriverSelectStyle/);
  assert.doesNotMatch(routeDetailSource, /Review and assign a driver before publishing this route\./);
  assert.doesNotMatch(routeDetailSource, /renderRouteHeaderMetric\("Delivery area", routeDetail\.deliveryArea\)/);
  assert.match(routeDetailSource, /function renderRouteHeaderMetric\(label, value\) \{/);
  assert.doesNotMatch(routeDetailSource, /const routeDriverBuckets = useMemo/);
  assert.doesNotMatch(routeDetailSource, /aria-label="Route driver stop groups"/);
  assert.match(routeDetailSource, /aria-label="Route timing"/);
  assert.match(routeDetailSource, /aria-label="Driver route rows"/);
  assert.match(routeDetailSource, /aria-label="Route stop timeline"/);
  assert.match(routeDetailSource, /borderRight: "1px solid #d6d6d6"/);
  assert.match(routeDetailSource, /marginRight: "6px"/);
  assert.match(routeDetailSource, /minWidth: "64px"/);
  assert.match(routeDetailSource, /paddingRight: "6px"/);
  assert.match(routeDetailSource, /const routeTimelineBottomSpacerStyle = \{/);
  assert.match(routeDetailSource, /borderTop: "1px solid #d6d6d6"/);
  assert.match(routeDetailSource, /height: "56px"/);
  assert.match(routeDetailSource, /const routeTimelineRowsStyle = \{/);
  assert.match(routeDetailSource, /overflowX: "auto"/);
  assert.match(routeDetailSource, /const currentRouteRows = timelineRouteRows\.filter\(\(routeRow\) => routeRow\.isCurrent\)/);
  assert.match(routeDetailSource, /const routeTimelineRowsMinHeight = `\$\{Math\.max\(1, timelineRouteRows\.length\) \* 24\}px`/);
  assert.match(routeDetailSource, /style=\{\{ \.\.\.routeTimelineRowsStyle, minHeight: routeTimelineRowsMinHeight \}\}/);
  assert.match(routeDetailSource, /const routeTimelineDropHintStyle = \{/);
  assert.match(routeDetailSource, /justifyContent: "center"/);
  assert.match(routeDetailSource, /textAlign: "center"/);
  assert.match(routeDetailSource, /Drop orders here to remove them from the route/);
  assert.match(routeDetailSource, /function moveTimelineStop\(routeRows, orderByRouteId, drag, targetRouteId/);
  assert.match(routeDetailSource, /function buildTimelineRows\(routeRows, orderByRouteId\)/);
  assert.match(routeDetailSource, /flushSync\(applyChange\)/);
  assert.match(routeDetailSource, /flushSync\(\(\) => setRouteTimelineDrag\(null\)\)/);
  assert.match(routeDetailSource, /pointerEvents: "none"/);
  assert.match(routeDetailSource, /event\.dataTransfer\.setDragImage\(event\.currentTarget, 9, 9\)/);
  assert.match(routeDetailSource, /afterStopId === "__start__"/);
  assert.match(routeDetailSource, /draggable/);
  assert.match(routeDetailSource, /onDragStart=\{\(event\) => handleRouteTimelineDragStart\(event, routeRow, stop\)\}/);
  assert.match(routeDetailSource, /onDrop=\{handleRouteTimelineRemoveDrop\}/);
  assert.match(routeDetailSource, /routeRow\.stops\.map\(\(stop\) =>/);
  assert.doesNotMatch(routeDetailSource, /activeRouteDriverStops/);
  assert.match(routeDetailSource, /height: "440px"/);
  assert.match(routeDetailSource, /minHeight: "490px"/);
  assert.doesNotMatch(routeDetailSource, /routeDetailHeaderInfoCardStyle/);
  assert.doesNotMatch(routeDetailSource, /routeDetailPageNavStyle/);
  assert.doesNotMatch(routeDetailSource, /routeDetailTitleMetricsStyle/);
  assert.doesNotMatch(routeDetailSource, /routeDetailMapRegionStyle|routeDetailMapInfoPanelStyle/);
  assert.doesNotMatch(routeDetailSource, /routeDetailSummaryGridStyle|routeDetailSummaryItemStyle|routeDetailSummaryLabelStyle|routeDetailSummaryValueStyle/);
  assert.doesNotMatch(routeDetailSource, /function renderSummaryItem/);
  assert.doesNotMatch(routeDetailSource, /renderSummaryItem\("Coordinates"/);
  assert.doesNotMatch(routeDetailSource, /renderSummaryItem\("Missing"/);
});


test("Route overview header has responsive CSS for inline summary", () => {
  assert.match(globalCssSource, /\.route-overview-header/);
  assert.match(globalCssSource, /\.route-overview-main/);
  assert.match(globalCssSource, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(globalCssSource, /\.route-overview-driver-control/);
  assert.match(globalCssSource, /\.route-overview-summary[\s\S]*display: flex/);
  assert.match(globalCssSource, /\.route-overview-summary[\s\S]*flex-wrap: wrap/);
  assert.match(globalCssSource, /\.route-overview-summary[\s\S]*gap: 4px 10px/);
  assert.doesNotMatch(globalCssSource, /\.route-overview-summary[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(globalCssSource, /@media \(max-width: 900px\)[\s\S]*\.route-overview-main[\s\S]*grid-template-columns: 1fr/);
});


test("Route detail uses OpenFreeMap MapLibre without copying every reference control", () => {
  assert.match(routeDetailSource, /export const links = \(\) => \[\{ rel: "stylesheet", href: "\/vendor\/maplibre-gl\.css" \}\]/);
  assert.match(
    routeDetailSource,
    /const OPENFREEMAP_STYLE_URL = "\/vendor\/openfreemap-clever-lite\.json"/,
  );
  assert.match(routeDetailSource, /import\("maplibre-gl"\)/);
  assert.match(routeDetailSource, /import\("pmtiles"\)/);
  assert.match(routeDetailSource, /import \{ createMapLibreMap \} from "\.\.\/features\/maps\/maplibre-map"/);
  assert.match(routeDetailSource, /import \{ installMissingMapImageFallback \} from "\.\.\/features\/maps\/maplibre-missing-images"/);
  assert.match(routeDetailSource, /import \{ installPmtilesProtocol \} from "\.\.\/features\/maps\/pmtiles-protocol"/);
  assert.match(routeDetailSource, /installPmtilesProtocol\(maplibregl, Protocol\)/);
  assert.match(routeDetailSource, /installMissingMapImageFallback\(mapRef\.current\)/);
  assert.match(routeDetailSource, /style: OPENFREEMAP_STYLE_URL/);
  assert.match(routeDetailSource, /createMapLibreMap\(maplibregl, \{/);
  assert.doesNotMatch(routeDetailSource, /new maplibregl\.NavigationControl/);
  assert.match(routeDetailSource, /import \{ MapPanel, MapToolbar, renderMapFitIcon, renderMapRefreshIcon, renderMapZoomInIcon, renderMapZoomOutIcon \} from "\.\.\/ui\/map-panel"/);
  assert.match(routeDetailSource, /const routeDetailMapFrameStyle = \{/);
  assert.match(routeDetailSource, /const routeDetailMapCanvasStyle = \{/);
  assert.match(routeDetailSource, /canvasRef=\{mapContainerRef\}/);
  assert.match(routeDetailSource, /createDepartureMarkerElement\(departureLocation\)/);
  assert.match(routeDetailSource, /const ROUTE_DETAIL_ROUTE_SOURCE_ID = "route-detail-osrm-route"/);
  assert.match(routeDetailSource, /const ROUTE_DETAIL_ROUTE_LAYER_ID = "route-detail-osrm-route-line"/);
  assert.match(routeDetailSource, /function syncRouteDetailRouteLine\(map, routeLines, routeColor = "#e11900"\) \{/);
  assert.match(routeDetailSource, /function softenRouteColor\(routeColor\) \{/);
  assert.match(routeDetailSource, /function createRouteDetailMapMarkers\(map, maplibregl, departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById = new Map\(\)\) \{/);
  assert.match(routeDetailSource, /type: "LineString"/);
  assert.match(routeDetailSource, /map\.addSource\(ROUTE_DETAIL_ROUTE_SOURCE_ID/);
  assert.match(routeDetailSource, /map\.addLayer\(\{/);
  assert.match(routeDetailSource, /source: ROUTE_DETAIL_ROUTE_SOURCE_ID/);
  assert.match(routeDetailSource, /syncRouteDetailRouteLine\(map, savedRouteGeometryRows, routePathColor\)/);
  assert.match(routeDetailSource, /createRouteDetailMapMarkers\(\s+map,\s+maplibregl,\s+departureLocation,\s+routeMapStops,\s+savedRouteMarkerStopPoints,\s+routeLineColor,\s+routeStopColorById,\s+\)/);
  assert.doesNotMatch(routeDetailSource, /Dispatch|Mark all as ready|Add orders|Inventory|Start free trial/);
});

test("Route detail does not let route-line style readiness block marker rendering", () => {
  assert.match(routeDetailSource, /function isRouteDetailMapStyleReady\(map\) \{/);
  assert.match(routeDetailSource, /typeof map\?\.isStyleLoaded !== "function"/);
  assert.match(routeDetailSource, /return map\.isStyleLoaded\(\)/);
  assert.match(routeDetailSource, /catch \{\s+return false;\s+\}/);
  assert.match(routeDetailSource, /return true/);
  assert.match(routeDetailSource, /syncRouteDetailRouteLine\(map, savedRouteGeometryRows, routePathColor\)/);
  assert.match(
    routeDetailSource,
    /const routeDetailMarkers = createRouteDetailMapMarkers\(\s+map,\s+maplibregl,\s+departureLocation,\s+routeMapStops,\s+savedRouteMarkerStopPoints,\s+routeLineColor,\s+routeStopColorById,\s+\);/,
  );
  assert.match(routeDetailSource, /logRouteDetailPerformance\("routes\.detail\.map\.sync"/);
  assert.doesNotMatch(
    routeDetailSource,
    /syncRouteDetailRouteLine\(map, savedRouteGeometry, routePathColor\)\s+&&\s+syncRouteDetailStopLayers\(map, orderedRouteStops, savedRouteMarkerStopPoints\)/,
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
  assert.match(routeDetailSource, /function createRouteStopMarkerElement\(stop, routeColor\) \{/);
  assert.match(routeDetailSource, /markerElement\.className = "order-map-marker order-map-marker--planned"/);
  assert.match(routeDetailSource, /markerElement\.style\.setProperty\("--marker-color", routeColor\)/);
  assert.match(globalCssSource, /--marker-border-width: 2px/);
  assert.match(globalCssSource, /paint-order: fill stroke/);
  assert.match(globalCssSource, /vector-effect: non-scaling-stroke/);
  assert.match(globalCssSource, /--marker-height: 30px/);
  assert.match(globalCssSource, /--marker-width: 23px/);
  assert.match(globalCssSource, /font-size: 11px/);
  assert.match(globalCssSource, /font-weight: 800/);
  assert.match(routeDetailSource, /pathElement\.setAttribute\("d", MAP_PIN_PATH\)/);
  assert.match(routeDetailSource, /labelElement\.className = "order-map-marker__label"/);
  assert.match(routeDetailSource, /labelElement\.textContent = String\(stop\.stop\)/);
  assert.match(routeDetailSource, /new maplibregl\.Marker\(\{\s+anchor: "bottom",\s+element: markerElement,\s+\}\)/);
  assert.doesNotMatch(globalCssSource, /\.route-detail-stop-marker/);
  assert.match(routeDetailSource, /markerElement\.addEventListener\("dblclick", handleStopMarkerDoubleClick\)/);
  assert.match(routeDetailSource, /event\.preventDefault\?\.\(\)/);
  assert.match(routeDetailSource, /event\.stopPropagation\?\.\(\)/);
  assert.match(routeDetailSource, /fitRouteStopAndSnappedPoint\(\s+map,\s+maplibregl,\s+stop,\s+routeStopPoint,\s+\)/);
  assert.match(routeDetailSource, /\.setLngLat\(departureLocation\.coordinates\)/);
  assert.match(routeDetailSource, /const markerCoordinates = getRouteStopPointerCoordinates\(stop, routeStopPoint\)/);
  assert.match(routeDetailSource, /\.setLngLat\(markerCoordinates\)/);
  assert.match(routeDetailSource, /fitRouteDetailMap\(mapRef\.current, maplibregl, routeMapLocations\)/);
  assert.doesNotMatch(routeDetailSource, /createRouteStopPopupElement|new maplibregl\.Popup|setPopup/);
});

test("Route detail falls back to route stop point coordinates before dropping stop markers", () => {
  assert.match(routeDetailSource, /function getRouteStopPointerCoordinates\(stop, routeStopPoint\) \{/);
  assert.match(routeDetailSource, /if \(stop\.hasCoordinates\) return stop\.coordinates/);
  assert.match(routeDetailSource, /normalizeLngLatPair\(routeStopPoint\?\.inputCoordinates\)/);
  assert.match(routeDetailSource, /normalizeLngLatPair\(routeStopPoint\?\.snappedCoordinates\)/);
  assert.match(routeDetailSource, /for \(const stop of routeStops\) \{\s+const routeStopPoint = findRouteStopPoint\(stop, routeStopPoints\);\s+const markerCoordinates = getRouteStopPointerCoordinates\(stop, routeStopPoint\);\s+if \(!markerCoordinates\) continue;/);
});

test("Route detail keeps removed stop-edit and driver-assignment controls out", () => {
  assert.doesNotMatch(routeDetailSource, /const routeDetailDriverSaveButtonStyle/);
  assert.doesNotMatch(routeDetailSource, /const routeDetailDriverDisabledSaveButtonStyle/);
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

test("Route detail renders every stop as a route-colored teardrop marker without click expansion", () => {
  assert.match(routeDetailSource, /function createRouteStopMarkerElement\(stop, routeColor\) \{/);
  assert.match(routeDetailSource, /markerElement\.className = "order-map-marker order-map-marker--planned"/);
  assert.match(routeDetailSource, /const ROUTE_DETAIL_ORDER_MARKER_MIN_ZOOM = 7/);
  assert.match(routeDetailSource, /function syncRouteDetailMarkerZoomVisibility\(map, container\) \{/);
  assert.match(routeDetailSource, /route-detail-map--hide-order-markers/);
  assert.match(globalCssSource, /\.route-detail-map--hide-order-markers \.order-map-marker,[\s\S]*\.route-detail-map--hide-order-markers \.route-detail-snapped-stop-point \{[\s\S]*display: none;/);
  assert.match(routeDetailSource, /markerElement\.style\.setProperty\("--marker-color", routeColor\)/);
  assert.match(routeDetailSource, /markerElement\.style\.setProperty\("--map-marker-color", routeColor\)/);
  assert.match(routeDetailSource, /pathElement\.style\.fill = routeColor/);
  assert.match(routeDetailSource, /function getRouteStopDisplayColor\(stop, routeColor, routeStopColorById\) \{/);
  assert.match(routeDetailSource, /markerElement\.setAttribute\("aria-label", `Stop \$\{stop\.stop\}: \$\{stop\.order\}`\)/);
  assert.match(routeDetailSource, /labelElement\.textContent = String\(stop\.stop\)/);
  assert.match(routeDetailSource, /new maplibregl\.Marker\(\{\s+anchor: "bottom",\s+element: markerElement,\s+\}\)/);
  assert.doesNotMatch(routeDetailSource, /expandedRouteStopIds|setExpandedRouteStopIds|toggleExpandedRouteStop|addEventListener\("click"|createRouteStopPopupElement|route-stop-precision-point|Show stop|Show \$\{group\.stops\.length\} overlapping route stops|getRouteStopOverlapGroupKey|expandedRouteStopOverlapGroupKey|toggleExpandedRouteStopGroup|getRouteStopOverlapMarkerOffset|markerOffset|ROUTE_STOP_EXPANDED_MARKER_GAP|offset: markerOffset|cluster|Cluster|supercluster|buildRouteStopMarkerGroups|ROUTE_STOP_OVERLAP_PIXEL_RADIUS/);
});

test("Route detail renders OSRM snapped stop points as small route-colored DOM points without zoom gating", () => {
  assert.doesNotMatch(routeDetailSource, /ROUTE_STOP_POINT_MARKER_MIN_ZOOM|minzoom:/);
  assert.match(routeDetailSource, /const ROUTE_STOP_POINT_MIN_DISTANCE_METERS = 1/);
  assert.match(routeDetailSource, /function buildRouteStopPointMarker\(stop, routeStopPoint\) \{/);
  assert.match(routeDetailSource, /const snappedCoordinates = normalizeLngLatPair\(routeStopPoint\?\.snappedCoordinates\)/);
  assert.match(routeDetailSource, /calculateLngLatDistanceMeters\(stop\.coordinates, snappedCoordinates\)/);
  assert.match(routeDetailSource, /distanceMeters < ROUTE_STOP_POINT_MIN_DISTANCE_METERS/);
  assert.match(routeDetailSource, /function createRouteStopPointMarkerElement\(routeColor\) \{/);
  assert.match(routeDetailSource, /className: "route-detail-snapped-stop-point"/);
  assert.match(routeDetailSource, /color: routeColor/);
  assert.match(routeDetailSource, /markerElement\.style\.backgroundColor = routeColor/);
  assert.match(routeDetailSource, /const stopPointMarker = buildRouteStopPointMarker\(stop, routeStopPoint\)/);
  assert.match(routeDetailSource, /new maplibregl\.Marker\(\{\s+anchor: "center",\s+element: createRouteStopPointMarkerElement\(stopColor\),\s+\}\)/);
  assert.match(routeDetailSource, /\.setLngLat\(stopPointMarker\.coordinates\)/);
  assert.match(globalCssSource, /\.route-detail-snapped-stop-point \{[\s\S]*border: 2px solid #ffffff;[\s\S]*height: 8px;[\s\S]*width: 8px;/);
  assert.match(routeDetailSource, /mapRef\.current\.on\("zoom", syncMarkerZoomVisibility\)/);
  assert.doesNotMatch(routeDetailSource, /function shouldRenderRouteStopPoints|zoomend/);
});

test("Route detail avoids WebGL stop layers so marker visibility is not style-layer dependent", () => {
  assert.match(routeDetailSource, /function createRouteDetailMapMarkers\(map, maplibregl, departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById = new Map\(\)\) \{/);
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
  assert.match(routeDetailSource, /function logRouteDetailPerformance\(name, metric = \{\}\) \{/);
  assert.match(routeDetailSource, /routes\.detail\.action\.saveRouteDraft\.request/);
  assert.match(routeDetailSource, /left: "50%"/);
  assert.match(routeDetailSource, /top: "12px"/);
  assert.match(routeDetailSource, /transform: "translateX\(-50%\)"/);
  assert.match(routeDetailSource, /optimizedExistingRoutePlanCount: draft\.routes\.filter\(\(route\) => route\.routePlanId && route\.optimized !== undefined\)\.length/);
  assert.match(routeDetailSource, /orderCounts: draft\.routes\.map\(\(route\) => route\.orderIds\.length\)/);
  assert.match(routeDetailSource, /function buildRouteStops\(stops\) \{/);
  assert.match(routeDetailSource, /const orderedRouteStops = useMemo\(\(\) => buildRouteStops\(stops\), \[stops\]\)/);
  assert.match(routeDetailSource, /function buildRouteGroupStops\(routeGroup, childRouteDetails, currentRouteStops\) \{/);
  assert.match(routeDetailSource, /\.\.\.buildRouteStops\(routeGroup\?\.assignments \?\? \[\]\)/);
  assert.match(routeDetailSource, /const allRouteGroupStops = useMemo/);
  assert.match(routeDetailSource, /const routeGroupStopsSource = isRouteGroupDetail \? orderedRouteStops : allRouteGroupStops/);
  assert.match(routeDetailSource, /buildRouteBranchRows\(routeGroup, routeGroupStopsSource, routeChildDetailsByOrders\)/);
  assert.match(routeDetailSource, /const routePlanRowsColumnWidths = \[/);
  assert.match(routeDetailSource, /function buildRouteBranchRows\(routeGroup, routeStops = \[\], childRouteDetailsByOrders = new Map\(\)\) \{/);
  assert.match(routeDetailSource, /readRouteOptimizedSnapshot\(branch\.optimized\)/);
  assert.match(routeDetailSource, /formatRouteDurationSeconds\(optimized\?\.metrics\?\.durationSeconds\)/);
  assert.match(routeDetailSource, /formatRouteDistanceMeters\(optimized\?\.metrics\?\.distanceMeters\)/);
  assert.match(routeDetailSource, /const childDetail = childRouteDetailsByOrders\.get\(routeOrderKey\(branchStops\)\)[\s\S]*routePlanId: childDetail\?\.routePlanId \?\? null/);
  assert.match(routeDetailSource, /orderIds: orderedRouteStops\.map\(\(stop\) => stop\.orderId\)\.filter\(Boolean\)/);
  assert.match(routeDetailSource, /stops: orderedRouteStops/);
  assert.match(routeDetailSource, /const editedRouteRows = \[/);
  assert.match(routeDetailSource, /const routeRows = ensureUniqueRouteRowColors\(editedRouteRows\)/);
  assert.match(routeDetailSource, /function getRouteDraftOptimized\(routeRow, includeExistingOptimized\) \{/);
  assert.match(routeDetailSource, /if \(routeRow\.routePlanId && !includeExistingOptimized\) return undefined/);
  assert.match(routeDetailSource, /function shouldIncludeRouteDraftRow\(routeRow, includeEmptyTempRoutes\) \{/);
  assert.match(routeDetailSource, /return !\(routeRow\.tempId && !routeRow\.routePlanId && routeRow\.stops\.length === 0\)/);
  assert.match(routeDetailSource, /buildRouteDraftPayload\(timelineRouteRows, \{ includeEmptyTempRoutes: false, includeExistingOptimized: false \}\)/);
  assert.ok(
    routeDetailSource.indexOf("const [routeCandidateTitle") < routeDetailSource.indexOf("const editedRouteRows = ["),
    "routeRows reads route line state after the state is initialized",
  );
  assert.match(routeDetailSource, /const ROUTE_EMPTY_LABEL = "-"/);
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
  assert.match(routeDetailSource, /function getRouteCandidateTitle\(\) \{/);
  assert.match(routeDetailSource, /return "Route 1"/);
  assert.match(routeDetailSource, /title: textOrUndefined\(branch\.label\) \?\? `Route \$\{index \+ 2\}`/);
  assert.match(routeDetailSource, /aria-label="Change route driver"/);
  assert.match(routeDetailSource, /aria-label="Change route vehicle"/);
  assert.match(routeDetailSource, /aria-label="Change route start time"/);
  assert.match(routeDetailSource, /handleOpenRouteStartTimeEditor\(routeRow\)/);
  assert.match(routeDetailSource, /aria-label="Edit route start time"/);
  assert.match(routeDetailSource, /type="date"/);
  assert.match(routeDetailSource, /type="time"/);
  assert.match(routeDetailSource, /routeStartTimeByRouteId\[routeRow\.id\]/);
  assert.match(routeDetailSource, /function renderRouteEditableChevron\(\) \{/);
  assert.match(routeDetailSource, /function renderRouteLineEditIcon\(\) \{/);
  assert.match(routeDetailSource, /src="\/icons\/route-edit\.png"/);
  assert.match(routeDetailSource, /src="\/icons\/route-polygon-edit\.png"/);
  assert.match(routeDetailSource, /ariaLabel: isRoutePolygonEditMode \? "Stop editing route polygon" : "Edit route polygon"/);
  assert.match(routeDetailSource, /const ROUTE_DETAIL_POLYGON_SOURCE_ID = "route-detail-edit-polygon"/);
  assert.match(routeDetailSource, /function syncRouteEditPolygon\(map, points, isClosed\) \{/);
  assert.match(routeDetailSource, /function buildRouteDetailRouteLineData\(routeLines, fallbackRouteColor\) \{/);
  assert.match(routeDetailSource, /\["coalesce", \["get", "routeColor"\], routeColor\]/);
  assert.match(routeDetailSource, /createRouteStopPointMarkerElement\(stopColor\)/);
  assert.match(routeDetailSource, /map\.on\("styledata", syncPolygon\)/);
  assert.match(routeDetailSource, /function isLngLatInPolygon\(point, polygon\) \{/);
  assert.match(routeDetailSource, /Save polygon/);
  assert.match(routeDetailSource, /aria-label="Polygon route target"/);
  assert.match(routeDetailSource, /map\.doubleClickZoom\?\.disable\?\.\(\)/);
  assert.match(routeDetailSource, /new maplibregl\.Marker\(\{\s*draggable: true,/);
  assert.doesNotMatch(routeDetailSource, />✏<\/span>/);
  assert.doesNotMatch(routeDetailSource, /strokeWidth="2\.2"/);
  assert.match(routeDetailSource, /function ensureUniqueRouteRowColors\(routeRows\) \{/);
  assert.match(routeDetailSource, /const ROUTE_DEFAULT_COLORS = \[MAP_MARKER_PALETTE\.plannedOrder\.color/);
  assert.match(routeDetailSource, /ROUTE_DEFAULT_COLORS\[\(index \+ 1\) % ROUTE_DEFAULT_COLORS\.length\]/);
  assert.match(routeDetailSource, /ROUTE_COLOR_OPTIONS\.map\(\(color\) =>/);
  assert.match(routeDetailSource, /function getUnusedRouteColor\(preferredColor, usedColors/);
  assert.match(routeDetailSource, /aria-label="Route color picker"/);
  assert.match(routeDetailSource, /type="color"/);
  assert.match(routeDetailSource, /aria-label=\{`Edit \$\{routeRow\.title\} name`\}/);
  assert.match(routeDetailSource, /const \[routeLineEdits, setRouteLineEdits\] = useState\(\{\}\)/);
  assert.match(routeDetailSource, /setActiveRouteLineId\(routeRow\.id\)/);
  assert.match(routeDetailSource, /setRouteLineEdits\(\(currentEdits\) => \(\{/);
  assert.match(routeDetailSource, /viewBox="0 0 10 10"/);
  assert.doesNotMatch(routeDetailSource, />⌄<\/span>/);
  assert.doesNotMatch(routeDetailSource, /type="datetime-local"/);
  assert.match(routeDetailSource, /borderRight: "1px solid #d6d6d6"/);
  assert.match(routeDetailSource, /marginRight: "6px"/);
  assert.match(routeDetailSource, /minWidth: "64px"/);
  assert.match(routeDetailSource, /paddingRight: "6px"/);
  assert.match(routeDetailSource, /const routeTimelineBottomSpacerStyle = \{/);
  assert.match(routeDetailSource, /borderTop: "1px solid #d6d6d6"/);
  assert.match(routeDetailSource, /height: "56px"/);
  assert.match(routeDetailSource, /const routeTimelineRowsStyle = \{/);
  assert.match(routeDetailSource, /overflowX: "auto"/);
  assert.match(routeDetailSource, /const routeTimelineDropHintStyle = \{/);
  assert.match(routeDetailSource, /justifyContent: "center"/);
  assert.match(routeDetailSource, /textAlign: "center"/);
  assert.match(routeDetailSource, /Drop orders here to remove them from the route/);
  assert.match(routeDetailSource, /routeRow\.stops\.map\(\(stop\) =>/);
  assert.doesNotMatch(routeDetailSource, />Order<\/th>/);
  assert.doesNotMatch(routeDetailSource, />Recipient<\/th>/);
  assert.doesNotMatch(routeDetailSource, />Address<\/th>/);
  assert.doesNotMatch(routeDetailSource, /Same-date orders/);
  assert.doesNotMatch(routeDetailSource, /Save order/);
});

test("Route group detail keeps its own page instead of becoming a child route", () => {
  assert.match(routeGroupDetailSource, /routePlan: null/);
  assert.match(routeGroupDetailSource, /routeDetailTitleOverride: routeGroupData\.routeGroup\?\.name \?\? null/);
  assert.doesNotMatch(routeGroupDetailSource, /primaryRoutePlanData/);
  assert.match(routeDetailSource, /function buildRouteGroupChildRows\(routeGroup, childRouteDetails = \[\]\) \{/);
  assert.match(routeDetailSource, /const isRouteGroupDetail = !effectiveRoutePlan && routeGroup != null/);
  assert.match(routeDetailSource, /const currentRouteRowsSource = isRouteGroupDetail \|\| !currentRouteLineId[\s\S]*\? \[\]/);
  assert.match(routeDetailSource, /const groupRouteRowsSource = isRouteGroupDetail[\s\S]*routeBranchRows\.length > 0 \? routeBranchRows : routeGroupChildRows/);
  assert.match(routeGroupDetailSource, /fetchDeliveryRouteGroupDetail\(request, params\.routeGroupId, \{ cacheKey \}\)/);
  assert.match(routeGroupDetailSource, /stops: routeGroupData\.routeGroup\?\.assignments \?\? \[\]/);
  assert.match(routeDetailSource, /const currentRouteRowsSource = isRouteGroupDetail \|\| !currentRouteLineId[\s\S]*\? \[\]/);
  assert.match(routeDetailSource, /const routeMapRows = isRouteGroupDetail \? timelineRouteRows : currentRouteRows/);
  assert.match(routeDetailSource, /const routeMapStops = routeMapRows\.flatMap/);
  assert.match(routeDetailSource, /const routeGroupStopsSource = isRouteGroupDetail \? orderedRouteStops : allRouteGroupStops/);
  assert.match(routeDetailSource, /const routeGeometrySourceRows = isRouteGroupDetail \? timelineRouteRows : currentRouteRows/);
  assert.match(routeDetailSource, /const routeMarkerStopPoints = isRouteGroupDetail \? \[\] : routeGeometryStopPoints/);
  assert.match(routeDetailSource, /savedRouteMarkerStopPoints/);
});

test("Route detail page provides page navigation back to the route list", () => {
  assert.match(routeDetailSource, /import \{ Link, useFetcher, useLoaderData, useLocation, useNavigate, useRevalidator, useRouteError \} from "react-router"/);
  assert.match(routeDetailSource, /const navigate = useNavigate\(\)/);
  assert.match(routeDetailSource, /const routesListHref = `\/app\/routes\$\{routeSessionSearch\}`/);
  assert.match(routeDetailSource, /onClick=\{\(\) => navigate\(routesListHref\)\}/);
  assert.match(routeDetailSource, /<span aria-hidden="true" style=\{routeDetailBackIconStyle\}>/);
  assert.match(routeDetailSource, /viewBox="0 0 20 20"/);
  assert.match(routeDetailSource, /d="M12\.5 4\.5 7 10l5\.5 5\.5"/);
  assert.match(routeDetailSource, /<span>Back to routes<\/span>/);
  assert.match(routeDetailSource, /aria-label="Back to routes list"/);
  assert.match(routeDetailSource, /const routeOverviewTopBarStyle = \{/);
  assert.match(routeDetailSource, /buildRouteGroupRouteLinks\(timelineRouteRows, childRouteDetails, routeGroup, effectiveRoutePlan\?\.id \?\? null, routeDetailTitle, isRouteGroupDetail \? routeGroup\?\.id : null\)/);
  assert.match(routeGroupDetailSource, /export const loader = async \(\{ params, request \}\) => \{/);
  assert.ok(routeGroupDetailSource.includes("fetchDeliveryRouteGroupDetail(request, params.routeGroupId, { cacheKey })"));
  assert.doesNotMatch(routeGroupDetailSource, /redirect\(childRoutePlanId/);
  assert.match(routeDetailSource, /const seenIds = new Set\(\)/);
  assert.match(routeDetailSource, /const seenLabels = new Set\(\)/);
  assert.match(routeDetailSource, /seenIds\.has\(id\)/);
  assert.match(routeDetailSource, /seenLabels\.has\(labelKey\)/);
  assert.match(routeDetailSource, /routeGroup\?\.switchRoutes \?\? \[\]\)\.forEach\(\(routeLink\) => \{/);
  assert.match(routeDetailSource, /routeLink\?\.routeGroupId/);
  assert.match(routeDetailSource, /textOrUndefined\(routeLink\?\.label\) === groupLabel \? groupId : null/);
  assert.match(routeDetailSource, /childRouteDetails \?\? \[\]\)\.forEach\(\(detail\) => addLink\(\{ label: detail\?\.routePlan\?\.name, routePlanId: detail\?\.routePlanId \?\? detail\?\.routePlan\?\.id \}\)\)/);
  assert.match(routeDetailSource, /routeGroup\?\.children \?\? \[\]\)\.forEach\(\(child\) => addLink\(\{ label: child\?\.routePlan\?\.name \?\? child\?\.label, routePlanId: child\?\.routePlanId \?\? child\?\.routePlan\?\.id \}\)\)/);
  assert.match(routeDetailSource, /<Link[\s\S]*prefetch="intent"[\s\S]*to=\{`\$\{routeLink\.href\}\$\{routeSessionSearch\}`\}/);
  assert.match(routeDetailSource, /key=\{routeLink\.id\}/);
  assert.doesNotMatch(routeDetailSource, /onClick=\{\(\) => navigate\(`\/app\/routes\/\$\{routeLink\.routePlanId\}`\)\}/);
  assert.match(routeDetailSource, /<header className="route-overview-header" style=\{routeOverviewHeaderStyle\}>[\s\S]*style=\{routeOverviewTopBarStyle\}[\s\S]*aria-label="Back to routes list"/);
  assert.match(routeDetailSource, /const routeDetailBackButtonStyle = \{/);
  assert.match(routeDetailSource, /const routeDetailBackIconStyle = \{/);
  assert.match(routeDetailSource, /background: "transparent"/);
});
