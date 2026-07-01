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
const routeGroupDetailPath = join(root, "app/routes/app.routes.groups.$routeGroupId.jsx");
const routeGroupDetailSource = existsSync(routeGroupDetailPath)
  ? readFileSync(routeGroupDetailPath, "utf8")
  : "";
const legacyRouteGroupDetailPath = join(root, "app/routes/app.route-groups.$routeGroupId.jsx");
const legacyRouteGroupDetailSource = existsSync(legacyRouteGroupDetailPath)
  ? readFileSync(legacyRouteGroupDetailPath, "utf8")
  : "";
const routeGroupChildDetailPath = join(root, "app/routes/app.routes.groups.$routeGroupId_.routes.$routeId.jsx");
const routeGroupChildDetailSource = existsSync(routeGroupChildDetailPath)
  ? readFileSync(routeGroupChildDetailPath, "utf8")
  : "";
const routeDetailServerSource = readFileSync(join(root, "app/features/delivery/route-detail.server.js"), "utf8");
const routeDetailMapSource = readFileSync(join(root, "app/features/delivery/route-detail-map.js"), "utf8");
const routeHelpersSource = readFileSync(join(root, "app/features/delivery/route-helpers.js"), "utf8");
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
  assert.match(routesPageSource, /from "\.\.\/features\/delivery\/route-helpers"/);
  assert.match(routesPageSource, /const routeChildRows = safeRouteGroups\.flatMap/);
  assert.match(routeHelpersSource, /function getRouteGroupChildren\(routeGroup\) \{/);
  assert.match(routeHelpersSource, /function getRouteGroupChildRoutePlanId\(child\) \{/);
  assert.match(routeHelpersSource, /textOrUndefined\(child\?\.routePlanId\) \?\? textOrUndefined\(child\?\.routePlan\?\.id\)/);
  assert.match(routeHelpersSource, /filter\(\(child\) => getRouteGroupChildRoutePlanId\(child\)\)/);
  assert.match(routesPageSource, /const routePlanId = getRouteGroupChildRoutePlanId\(child\)/);
  assert.match(routesPageSource, /href: routeGroupChildPath\(routeGroup\.id, routePlanId\)/);
  assert.match(routeHelpersSource, /function getRouteGroupChildRouteName\(routeGroup, child, routePlan, index\) \{/);
  assert.match(routeHelpersSource, /name\.startsWith\(`\$\{groupName\} — `\)/);
  assert.match(routesPageSource, /route: getRouteGroupChildRouteName\(routeGroup, child, routePlan, index\)/);
  assert.match(routesPageSource, /parentRouteGroupId: routeGroup\.id/);
  assert.doesNotMatch(routeHelpersSource, /return children\.length >= 2 \? children : \[\]/);
  assert.match(routeHelpersSource, /leftRouteIdx = numberOrUndefined\(left\.child\?\.routeIdx\)/);
  assert.match(routesPageSource, /isDeletable: true,[\s\S]*deleteKey: `routePlan:\$\{routePlanId\}`/);
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
  assert.match(routesPageSource, /function getRouteColumnWidths\(routeRows\) \{/);
  assert.match(routesPageSource, /const routeColumnWidths = getRouteColumnWidths\(routeRows\)/);
  assert.match(routesPageSource, /const routesHeaderActionsStyle = \{/);
  assert.match(routesPageSource, /const routeSelectionSummaryStyle = \{/);
  assert.match(routesPageSource, /gap: "8px"/);
  assert.match(routesPageSource, /const routeCheckboxCellStyle = \{/);
  assert.match(routesPageSource, /const routeActionButtonStyle = \{/);
  assert.match(routesPageSource, /const routeDisabledActionButtonStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeIndexActionsStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeIndexButtonStyle = \{/);
  assert.doesNotMatch(routesPageSource, /const routeDeleteButtonStyle = \{/);
  assert.match(routesPageSource, /const singleRouteTableStyle = \{/);
  assert.match(routesPageSource, /minWidth: "996px"/);
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
  assert.match(routesPageSource, />Total drive time<\/th>/);
  assert.match(routesPageSource, />Total distance<\/th>/);
  assert.match(routesPageSource, />Driver<\/th>/);
  assert.doesNotMatch(routesPageSource, />Planned for<\/th>/);
  assert.doesNotMatch(routesPageSource, />Delivery date<\/th>/);
  assert.doesNotMatch(routesPageSource, />Coordinates<\/th>/);
  assert.doesNotMatch(routesPageSource, />Missing<\/th>/);
  assert.doesNotMatch(routesPageSource, />Created<\/th>/);
  assert.match(routesPageSource, /formatRouteStatus\(route\.status\)/);
  assert.match(routesPageSource, /standaloneRoutePlans\.map\(\(routePlan\) =>/);
  assert.match(routesPageSource, /const routeGroupRows = safeRouteGroups\.map\(\(routeGroup\) =>/);
  assert.match(routesPageSource, /function getRouteGroupTotalOrders\(routeGroup\)/);
  assert.match(routesPageSource, /return Number\(routeGroup\?\.totalOrders \?\? routeGroup\?\.ordersCount \?\? routeGroup\?\.assignments\?\.length \?\? 0\) \|\| 0/);
  assert.doesNotMatch(routeHelpersSource, /return children\.length >= 2 \? children : \[\]/);
  assert.match(routeHelpersSource, /rightRouteIdx = numberOrUndefined\(right\.child\?\.routeIdx\)/);
  assert.match(routesPageSource, /const routeGroupMetricsById = new Map/);
  assert.match(routesPageSource, /distanceMeters: sumOptionalNumbers\(childRows\.map\(\(routeRow\) => routeRow\.distanceMeters\)\)/);
  assert.match(routesPageSource, /durationSeconds: sumOptionalNumbers\(childRows\.map\(\(routeRow\) => routeRow\.driveTimeSeconds\)\)/);
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

test("Routes table renders OSRM drive metrics instead of start and end placeholders", () => {
  assert.match(routesPageSource, />Total drive time<\/th>/);
  assert.match(routesPageSource, />Total distance<\/th>/);
  assert.doesNotMatch(routesPageSource, />Start<\/th>/);
  assert.doesNotMatch(routesPageSource, />End<\/th>/);
  assert.match(routesPageSource, /function readRouteMetrics\(routePlan\) \{/);
  assert.match(routesPageSource, /routeMetrics\?\.durationSeconds/);
  assert.match(routesPageSource, /routeMetrics\?\.distanceMeters/);
  assert.match(routesPageSource, /formatRouteDurationSeconds\(route\.driveTimeSeconds\)/);
  assert.match(routesPageSource, /formatRouteDistanceMeters\(route\.distanceMeters\)/);
  assert.match(routesPageSource, /const routeGroupMetricsById = new Map/);
  assert.match(routesPageSource, /parentRouteGroupId: routeGroup\.id/);
  assert.match(routesPageSource, /const summaryRouteRows = activeRouteRows\.filter\(\(route\) => !route\.isRouteGroup\)/);
  assert.match(routesPageSource, /value: String\(summaryRouteRows\.length\)/);
  assert.match(routesPageSource, /sumNumbers\(summaryRouteRows\.map\(\(route\) => route\.orders\)\)/);
  assert.match(routesPageSource, /sumNumbers\(summaryRouteRows\.map\(\(route\) => route\.delivered\)\)/);
  assert.match(routesPageSource, /sumNumbers\(summaryRouteRows\.map\(\(route\) => route\.attempted\)\)/);
  assert.match(routesPageSource, /sumOptionalNumbers\(summaryRouteRows\.map\(\(route\) => route\.driveTimeSeconds\)\)/);
  assert.match(routesPageSource, /sumOptionalNumbers\(summaryRouteRows\.map\(\(route\) => route\.distanceMeters\)\)/);
  assert.doesNotMatch(routesPageSource, /driveTimeMinutes: firstNumber/);
  assert.doesNotMatch(routesPageSource, /distanceMiles: firstNumber/);
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
  assert.doesNotMatch(routesPageSource, />\{route\.routeIndex\}<\/button>/);
  assert.doesNotMatch(routesPageSource, /aria-label=\{`Delete \$\{route\.route\}`\}/);
});


test("Routes table rows are clickable links into route detail", () => {
  assert.match(routesPageSource, /import \{ Outlet, redirect, useFetcher, useLoaderData, useNavigate, useParams, useRouteError, useSearchParams \} from "react-router"/);
  assert.match(routesPageSource, /const navigate = useNavigate\(\)/);
  assert.match(routesPageSource, /function createRouteDetailHref\(route, idToken\) \{/);
  assert.match(routesPageSource, /function handleRouteRowClick\(route\) \{/);
  assert.match(routesPageSource, /function handleRouteRowKeyDown\(event, route\) \{/);
  assert.match(routesPageSource, /navigateRouteDetail\(route\)/);
  assert.match(routesPageSource, /navigate\(createRouteDetailHref\(route, idToken\)\)/);
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
  assert.match(routesPageSource, /const \{ routeId, routeGroupId \} = useParams\(\)/);
  assert.match(routesPageSource, /if \(routeId \|\| routeGroupId\) return <Outlet \/>/);
});


test("Route detail loader reads server-saved drivers for route driver labels", () => {
  assert.match(routeDetailServerSource, /import \{ fetchDeliveryDrivers \} from "\.\/drivers\.server"/);
  assert.match(routeDetailSource, /drivers = \[\]/);
  assert.match(routeDetailServerSource, /fetchDeliveryDrivers\(request, \{\}\)/);
  assert.match(routeDetailServerSource, /fetchDeliveryRouteGroupDetail\(request, routeGroupId, \{ cacheKey: shopifyShopCacheKey \}\)/);
  assert.match(routeDetailServerSource, /routeGroup: routeGroupData\.routeGroup/);
  assert.match(routeDetailServerSource, /driverData\.drivers/);
  assert.match(routeDetailServerSource, /driverData\.errors/);
});

test("Route detail drive metrics are OSRM-only and use child DTO metrics", () => {
  assert.match(routeDetailServerSource, /routeMetrics: child\?\.routeMetrics \?\? routePlan\?\.routeMetrics \?\? null/);
  assert.match(routeDetailSource, /driveTimeLabel: getRouteMetricLabel\(formatRouteDurationSeconds\(detail\?\.routeMetrics\?\.durationSeconds\)\)/);
  assert.match(routeDetailSource, /totalDistanceLabel: getRouteMetricLabel\(formatRouteDistanceMeters\(detail\?\.routeMetrics\?\.distanceMeters\)\)/);
  assert.match(routeDetailSource, /const routeTotalDriveTime = getRouteMetricLabel\(formatRouteDurationSeconds\(routeMetrics\?\.durationSeconds\)\)/);
  assert.match(routeDetailSource, /const routeTotalDistance = getRouteMetricLabel\(formatRouteDistanceMeters\(routeMetrics\?\.distanceMeters\)\)/);
  assert.doesNotMatch(routeDetailSource, /effectiveRoutePlan\?\.totalDriveTime/);
  assert.doesNotMatch(routeDetailSource, /effectiveRoutePlan\?\.driveTime/);
  assert.doesNotMatch(routeDetailSource, /effectiveRoutePlan\?\.totalDistance/);
  assert.doesNotMatch(routeDetailSource, /effectiveRoutePlan\?\.distance/);
});

test("Route detail keeps the server driver action but removes the header assignment UI", () => {
  assert.match(routeDetailServerSource, /assignDeliveryRoutePlanDriver/);
  assert.match(routeDetailServerSource, /intent === "saveRouteDriver"/);
  assert.match(routeDetailServerSource, /formData\.get\("driverId"\)/);
  assert.match(routeDetailServerSource, /assignDeliveryRoutePlanDriver\(\s+request,\s+routeId,\s+\{ driverId \},\s+\{ sessionToken: shopifySessionToken \},\s+\)/);
  assert.match(routeDetailSource, /buildRouteDriverOptions\(drivers, effectiveRoutePlan\?\.driver\)/);
  assert.match(routeDetailSource, /Invite pending/);
  assert.doesNotMatch(routeDetailSource, /const routeDriverSaveFetcher = useFetcher\(\)/);
  assert.doesNotMatch(routeDetailSource, /routeDriverSaveFetcher\.submit/);
  assert.doesNotMatch(routeDetailSource, />No driver<\/option>/);
  assert.doesNotMatch(routeDetailSource, /authStatus === "APP_LINKED" \?/);
  assert.doesNotMatch(routeDetailSource, /intent !== "saveRouteStops"/);
});


test("Route detail wires route group action buttons through App Bridge", () => {
  assert.match(routeDetailSource, /import \{ useFetcher, useLoaderData, useNavigate, useRevalidator, useRouteError \} from "react-router"/);
  assert.match(routeDetailSource, /import \{ useAppBridge \} from "@shopify\/app-bridge-react"/);
  assert.match(routeDetailServerSource, /previewDeliveryRouteGroupOptimization/);
  assert.doesNotMatch(routeDetailSource, /createDeliveryRouteGroupBranch/);
  assert.doesNotMatch(routeDetailSource, /reOptimizeDeliveryRouteGroup/);
  assert.doesNotMatch(routeDetailSource, /updateDeliveryRouteGroupBranchOrders/);
  assert.match(routeDetailServerSource, /fetchDeliveryRouteGroupDetail/);
  assert.match(routeDetailServerSource, /logRouteDetailPerformance\("routes\.detail\.action"/);
  assert.match(routeDetailServerSource, /logRouteGroupActionResult\("routes\.detail\.action\.previewRouteOptimization"/);
  assert.doesNotMatch(routeDetailSource, /getRouteGroupActionRedirectRouteId/);
  assert.doesNotMatch(routeDetailSource, /return redirect\(`\/app\/routes/);
  assert.match(routeDetailServerSource, /intent === "previewRouteOptimization"/);
  assert.match(routeDetailServerSource, /intent === "saveRouteDraft"/);
  assert.doesNotMatch(routeDetailSource, /intent === "addEmptyRouteBranch"/);
  assert.doesNotMatch(routeDetailSource, /intent === "assignPolygonToRoute"/);
  assert.match(routeDetailSource, /const shopify = useAppBridge\(\)/);
  assert.match(routeDetailSource, /const routeActionFetcher = useFetcher\(\)/);
  assert.match(routeDetailSource, /const revalidator = useRevalidator\(\)/);
  assert.match(routeDetailSource, /effectiveRoutePlan\?\.routeGroupingChild\?\.groupingId/);
  assert.match(routeDetailSource, /shopify\.idToken\(\)/);
  assert.doesNotMatch(routeDetailSource, /console\.info\("routes\.detail\.action\.submit"/);
  assert.doesNotMatch(routeDetailSource, /console\.warn\("routes\.detail\.action\.submit\.missing_route_group_id"/);
  assert.match(routeDetailSource, /routeActionFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(routeDetailSource, /const routeGroupActionIntent = routeActionFetcher\.formData\?\.get\("_intent"\)/);
  assert.match(routeDetailSource, /const reOptimizeRouteGroupBusy = routeGroupActionBusy && routeGroupActionIntent === "previewRouteOptimization"/);
  assert.match(routeDetailSource, /const addEmptyRouteBranchBusy = false/);
  assert.match(routeDetailSource, /\{reOptimizeRouteGroupBusy \? "Working…" : "Re-optimize"\}/);
  assert.match(routeDetailSource, /\{addEmptyRouteBranchBusy \? "Working…" : "Add Empty Route"\}/);
  assert.match(routeDetailSource, /submitRouteGroupAction\("previewRouteOptimization", \{\s+draft: JSON\.stringify\(buildRouteDraftPayload\(contextTimelineRouteRows, \{ includeExistingOptimized: true \}\)\),/);
  assert.match(routeDetailSource, /submitRouteGroupAction\("saveRouteDraft", \{\s+draft: JSON\.stringify\(buildRouteDraftPayload\(contextTimelineRouteRows, \{ includeExistingOptimized: false \}\)\),/);
  assert.match(routeDetailSource, /const handleAddEmptyRoute = \(\) => \{/);
  assert.match(routeDetailSource, /setClientRouteRows\(\(rows\) => \[/);
  assert.match(routeDetailSource, /const polygonCandidateOrderIds = polygonCandidateStops\.map\(\(stop\) => stop\.orderId\)/);
  assert.doesNotMatch(routeDetailSource, /routeTimelineStopSelectedStyle/);
  assert.match(routeDetailSource, /setRouteTimelineOrderByRouteId\(\(currentOrderByRouteId\) =>/);
  assert.match(routeDetailSource, /moveTimelineStop\(routeRows, nextOrderByRouteId, \{ stopId \}, targetRouteRow\.id\)/);
  assert.doesNotMatch(routeDetailSource, /submitRouteGroupAction\("assignPolygonToRoute"/);
});

test("Route detail exposes inventory and delete header actions", () => {
  assert.match(routeDetailSource, /function getLinkedInventoryId\(routePlan, routeGroup, routeGroupChild, isRouteGroupDetail\) \{/);
  assert.match(routeDetailSource, /ponytail: linked inventory field contract is pending/);
  assert.match(routeDetailSource, /const inventoryDetailHref = linkedInventoryId \? `\/app\/orders\/inventory\?id=\$\{encodeURIComponent\(linkedInventoryId\)\}` : null/);
  assert.match(routeDetailSource, /disabled=\{!inventoryDetailHref\}/);
  assert.match(routeDetailSource, /View inventory/);
  assert.match(routeDetailSource, /if \(inventoryDetailHref\) navigate\(inventoryDetailHref\)/);
  assert.match(routeDetailSource, /window\.confirm\(`Delete \$\{routeDetailTitle\}\?`\)/);
  assert.match(routeDetailSource, /formData\.set\("_intent", "deleteRoute"\)/);
  assert.match(routeDetailSource, /lastRouteActionIntentRef\.current !== "deleteRoute"/);
  assert.match(routeDetailSource, /navigate\(ROUTES_ROOT_PATH\)/);
  assert.match(routeDetailSource, /Delete route/);
});

test("Route detail delete action uses params and existing delete helpers", () => {
  assert.match(routeDetailServerSource, /deleteDeliveryRouteGroup/);
  assert.match(routeDetailServerSource, /deleteDeliveryRoutePlan/);
  assert.match(routeDetailServerSource, /const routeGroupIdFromParams = cleanRoutePathParam\(params\.routeGroupId\)/);
  assert.match(routeDetailServerSource, /intent === "deleteRoute"/);
  assert.match(routeDetailServerSource, /if \(routeGroupIdFromParams && !routeId\)/);
  assert.match(routeDetailServerSource, /deleteDeliveryRouteGroup\(request, routeGroupIdFromParams, \{ sessionToken: shopifySessionToken \}\)/);
  assert.match(routeDetailServerSource, /deleteDeliveryRoutePlan\(request, routeId, \{ sessionToken: shopifySessionToken \}\)/);
  assert.doesNotMatch(routeDetailServerSource, /formData\.get\("(target|routeType)"\)/);
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
  assert.match(routeDetailSource, /import \{ useFetcher, useLoaderData, useNavigate, useRevalidator, useRouteError \} from "react-router"/);
  assert.match(routeDetailSource, /currentDepartureLocation = null/);
  assert.match(routeDetailSource, /childRouteDetails = \[],\s+currentDepartureLocation = null,\s+drivers = \[],\s+routePlan,\s+routeGeometry = null,\s+routeGroup = null,\s+routeDetailTitleOverride = null,\s+routeMetrics = null,\s+routeStopPoints = \[],\s+stops = \[],\s+errors = \[]/);
  assert.doesNotMatch(routeDetailSource, /routeStopPointDebug: buildRouteStopPointDebug/);
  assert.match(routeDetailSource, /const savedRouteGeometryRows = routeGeometryRows/);
  assert.match(routeDetailSource, /const savedRouteStopPoints = routeGeometryStopPoints/);
  assert.match(routeDetailSource, /const routePathColor = softenRouteColor\(routeLineColor\)/);
  assert.match(routeDetailSource, /syncRouteDetailRouteLine\(map, savedRouteGeometryRows, routePathColor\)/);
  assert.match(routeDetailSource, /syncRouteDetailMapMarkerLayers\(\s+map,\s+departureLocation,\s+routeMapStops,\s+savedRouteStopPoints,\s+routeLineColor,\s+routeStopColorById,\s+\)/);
  assert.match(routeDetailSource, /buildRouteDetail\(effectiveRoutePlan, routeGroup\)/);
  assert.match(routeDetailSource, /<h1 className="route-detail-title" style=\{routesDetailTitleStyle\}>\{routeDetailTitle\}<\/h1>/);
  assert.doesNotMatch(routeDetailSource, /parseRouteDetailDraft/);
  assert.doesNotMatch(routeDetailSource, /useSearchParams/);
});

test("Route group detail keeps its own page instead of becoming a child route", () => {
  assert.match(routesPageSource, /href: routeGroupPath\(routeGroup\.id\)/);
  assert.match(routesPageSource, /function createRouteDetailHref\(route, idToken\) \{\n  return appendIdToken\(route\.href, idToken\);\n\}/);
  assert.match(routeGroupDetailSource, /routePlan: null/);
  assert.match(routeGroupDetailSource, /route_group_detail\.api\.raw/);
  assert.match(routeGroupDetailSource, /JSON\.stringify\(data, null, 2\)/);
  assert.match(routeGroupDetailSource, /logRouteGroupApiPayload\(\{ routeGroupData, departureLocationData, driverData \}\)/);
  assert.match(routeGroupDetailSource, /routeDetailTitleOverride: routeGroupData\.routeGroup\?\.name \?\? null/);
  assert.doesNotMatch(routeGroupDetailSource, /redirect\(childRoutePlanId/);
  assert.match(legacyRouteGroupDetailSource, /redirect\(/);
  assert.match(legacyRouteGroupDetailSource, /routeGroupPath\(cleanRoutePathParam\(params\.routeGroupId\)\)/);
  assert.match(routeDetailSource, /const isRouteGroupDetail = !effectiveRoutePlan && routeGroup != null/);
  assert.match(routeDetailSource, /const displayRouteRowsSource = isRouteGroupDetail \? groupRouteRowsSource : currentRouteRowsSource/);
  assert.match(routeDetailSource, /const contextRouteRowsSource = isRouteGroupDetail/);
});

test("Route detail loader reads the selected persisted route plan", () => {
  assert.doesNotMatch(routeDetailServerSource, /fetchDeliveryOrders/);
  assert.match(routeDetailServerSource, /assignDeliveryRoutePlanDriver,[\s\S]*fetchDeliveryRoutePlanDetail,[\s\S]*from "\.\/route-plans\.server"/);
  assert.doesNotMatch(routeDetailServerSource, /updateDeliveryRoutePlanStops/);
  assert.match(routeDetailServerSource, /import \{ fetchShopifyDepartureLocation \} from "\.\.\/locations\/shopify-locations\.server"/);
  assert.match(routeDetailServerSource, /import \{ authenticate \} from "\.\.\/\.\.\/shopify\.server"/);
  assert.match(routeDetailSource, /import \{ routeDetailAction, routeDetailLoader \} from "\.\.\/features\/delivery\/route-detail\.server"/);
  assert.match(routeDetailSource, /export const loader = routeDetailLoader/);
  assert.match(routeDetailServerSource, /export const routeDetailLoader = async \(\{ params, request \}\) => \{/);
  assert.match(routeDetailServerSource, /return loadRoutePlanDetail\(request, routeId\)/);
  assert.match(routeDetailServerSource, /const \{ admin, session \} = await authenticate\.admin\(request\)/);
  assert.match(routeDetailServerSource, /const shopifyShopCacheKey = session\?\.shop/);
  assert.match(routeDetailServerSource, /Promise\.all\(\[/);
  assert.match(routeDetailServerSource, /fetchDeliveryRoutePlanDetail\(request, routeId, \{\s+cacheKey: shopifyShopCacheKey,\s+\}\)/);
  assert.match(routeDetailServerSource, /fetchShopifyDepartureLocation\(admin,\s*\{\s*cacheKey: shopifyShopCacheKey\s*\}\)/);
  assert.match(routeDetailServerSource, /fetchDeliveryDrivers\(request, \{\}\)/);
  assert.match(routeDetailServerSource, /fetchDeliveryRouteGroupDetail\(request, routeGroupId, \{ cacheKey: shopifyShopCacheKey \}\)/);
  assert.match(routeDetailServerSource, /routeGroup: routeGroupData\.routeGroup/);
  assert.doesNotMatch(routeDetailServerSource, /sameDateOrderData/);
  assert.match(routeDetailServerSource, /currentDepartureLocation: departureLocationData\.departureLocation/);
  assert.doesNotMatch(routeDetailServerSource, /fetchShopifyOrders\(admin\)/);
  assert.doesNotMatch(routeDetailServerSource, /getRouteOrderIds/);
});

test("Route detail summarizes delivery with the actual date label", () => {
  assert.match(routeDetailSource, /from "\.\.\/features\/delivery\/route-helpers"/);
  assert.match(routeHelpersSource, /function formatRouteDeliveryScope\(routePlan, emptyLabel = "-"\) \{/);
  assert.match(routeHelpersSource, /formatDeliveryScopeLabel\(\{/);
  assert.match(routeHelpersSource, /deliveryDate: routePlan\?\.routeScope\?\.deliveryDate \?\? routePlan\?\.deliveryDate \?\? routePlan\?\.planDate/);
  assert.match(routeDetailSource, /deliveryDate: formatRouteDeliveryScope\(routePlan, ROUTE_EMPTY_LABEL\)/);
  assert.match(routeDetailSource, /renderRouteHeaderMetric\("Delivery date", routeDetail\.deliveryDate\)/);
  assert.doesNotMatch(routeDetailSource, /renderSummaryItem\("Delivery day", routeDetail\.deliveryDay\)/);
});

test("Routes canonical group child route loads by group id", () => {
  assert.match(routeGroupChildDetailSource, /loadRoutePlanDetail\(/);
  assert.match(routeGroupChildDetailSource, /cleanRoutePathParam\(params\.routeId\)/);
  assert.match(routeGroupChildDetailSource, /cleanRoutePathParam\(params\.routeGroupId\)/);
  assert.match(routeDetailServerSource, /return redirect\(`\$\{routeGroupChildPath\(routeGroupIdHint, routeId\)\}/);
  assert.match(routeDetailServerSource, /getRedirectSearch\(request, \["routeGroupId", "groupId"\]\)/);
});

test("Route detail separates group and child titles", () => {
  assert.match(routeDetailSource, /const routeDetailTitle = textOrUndefined\(routeDetailTitleOverride\) \?\? \(isRouteGroupDetail \? textOrUndefined\(routeGroup\?\.name\) : textOrUndefined\(routeDetail\.route\)\) \?\? "Route"/);
  assert.match(routeHelpersSource, /function getRouteGroupChildRouteName\(routeGroup, child, routePlan, index\) \{/);
  assert.match(routeHelpersSource, /name\.startsWith\(`\$\{groupName\} — `\)/);
  assert.match(routeDetailServerSource, /name: getRouteGroupChildRouteName\(routeGroup, child, routePlan, index\)/);
  assert.match(routeDetailSource, /title: getRouteGroupChildRouteName\(routeGroup, child, detail\?\.routePlan \?\? child\?\.routePlan, index\)/);
  assert.match(routeDetailServerSource, /routePlan: currentChildDetail\?\.routePlan \?\? routePlanData\.routePlan/);
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
  assert.match(routeDetailSource, /const items = normalizeRouteStopItems\(stop\.items\)/);
  assert.match(routeDetailSource, /onClick=\{\(event\) => handleRouteTimelineStopClick\(event, stop\)\}/);
  assert.match(routeDetailSource, /role="tooltip"/);
  assert.match(routeDetailSource, /Customer: \{activeRouteTimelineStop\.recipient\}/);
  assert.match(routeDetailSource, /\(activeRouteTimelineStop\.items \?\? \[\]\)\.map/);
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
  assert.doesNotMatch(routeDetailSource, /routeMapWheelHintVisible|handleRouteDetailMapWheel|routeDetailMapWheelHintStyle/);
  assert.match(routeDetailMapSource, /createDepartureMarkerImageData\(\)/);
  assert.match(routeDetailMapSource, /const ROUTE_DETAIL_ROUTE_SOURCE_ID = "route-detail-osrm-route"/);
  assert.match(routeDetailMapSource, /const ROUTE_DETAIL_ROUTE_LAYER_ID = "route-detail-osrm-route-line"/);
  assert.match(routeDetailMapSource, /function syncRouteDetailRouteLine\(map, routeLines, routeColor = "#e11900"\) \{/);
  assert.match(routeDetailMapSource, /function softenRouteColor\(routeColor\) \{/);
  assert.match(routeDetailMapSource, /function syncRouteDetailMapMarkerLayers\(map, departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById = new Map\(\)\) \{/);
  assert.match(routeDetailMapSource, /type: "LineString"/);
  assert.match(routeDetailMapSource, /map\.addSource\(ROUTE_DETAIL_ROUTE_SOURCE_ID/);
  assert.match(routeDetailMapSource, /map\.addLayer\(\{/);
  assert.match(routeDetailMapSource, /source: ROUTE_DETAIL_ROUTE_SOURCE_ID/);
  assert.match(routeDetailSource, /syncRouteDetailRouteLine\(map, savedRouteGeometryRows, routePathColor\)/);
  assert.match(routeDetailSource, /syncRouteDetailMapMarkerLayers\(\s+map,\s+departureLocation,\s+routeMapStops,\s+savedRouteStopPoints,\s+routeLineColor,\s+routeStopColorById,\s+\)/);
  assert.doesNotMatch(routeDetailSource, /Dispatch|Mark all as ready|Add orders|Start free trial/);
});

test("Route detail does not let route-line style readiness block marker rendering", () => {
  assert.match(routeDetailMapSource, /function isRouteDetailMapStyleReady\(map\) \{/);
  assert.match(routeDetailMapSource, /typeof map\?\.isStyleLoaded !== "function"/);
  assert.match(routeDetailMapSource, /return map\.isStyleLoaded\(\)/);
  assert.match(routeDetailMapSource, /catch \{\s+return false;\s+\}/);
  assert.match(routeDetailMapSource, /return true/);
  assert.match(routeDetailSource, /syncRouteDetailRouteLine\(map, savedRouteGeometryRows, routePathColor\)/);
  assert.match(
    routeDetailSource,
    /const didSyncMarkerLayers = syncRouteDetailMapMarkerLayers\(\s+map,\s+departureLocation,\s+routeMapStops,\s+savedRouteStopPoints,\s+routeLineColor,\s+routeStopColorById,\s+\);/,
  );
  assert.match(routeDetailSource, /logRouteDetailPerformance\("routes\.detail\.map\.sync"/);
  assert.doesNotMatch(
    routeDetailSource,
    /syncRouteDetailRouteLine\(map, savedRouteGeometry, routePathColor\)\s+&&\s+syncRouteDetailStopLayers\(map, orderedRouteStops, savedRouteStopPoints\)/,
  );
  assert.doesNotMatch(routeDetailSource, /if \(!didSyncRouteLine\) return|return;\s+if \(departureLocation\?\.hasCoordinates\)/);
  assert.match(routeDetailSource, /const handleRouteDetailStyleData = \(\) => \{/);
  assert.match(routeDetailSource, /map\.on\("styledata", handleRouteDetailStyleData\)/);
  assert.doesNotMatch(routeDetailSource, /bindRouteStopPointerHandlers|map\.on\("styledata", syncRouteDetailMapLayers\)/);
});

test("Route detail keeps marker coordinates validated and ordered for MapLibre", () => {
  assert.match(routeDetailMapSource, /function normalizeLngLat\(latitudeValue, longitudeValue\) \{/);
  assert.match(routeDetailMapSource, /function isValidLatitude\(latitude\) \{/);
  assert.match(routeDetailMapSource, /function isValidLongitude\(longitude\) \{/);
  assert.match(routeDetailMapSource, /return \[longitude, latitude\]/);
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

test("Route detail places stop and departure markers through MapLibre source layers", () => {
  assert.match(routeDetailSource, /import \{ MAP_MARKER_PALETTE \} from "\.\.\/features\/maps\/map-markers"/);
  assert.match(routeDetailMapSource, /import \{ addMapPinImage, createDepartureMarkerImageData, createMapPinImageData, createMapPinSymbolLayer \}/);
  assert.match(routeDetailMapSource, /const ROUTE_DETAIL_MARKER_SOURCE_ID = "route-detail-markers"/);
  assert.match(routeDetailMapSource, /const ROUTE_DETAIL_DEPARTURE_LAYER_ID = "route-detail-departure-marker"/);
  assert.match(routeDetailMapSource, /const ROUTE_DETAIL_STOP_LAYER_ID = "route-detail-stop-markers"/);
  assert.match(routeDetailMapSource, /function buildRouteDetailMarkerFeatureCollection\(departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById\) \{/);
  assert.match(routeDetailMapSource, /featureType: "departure"/);
  assert.match(routeDetailMapSource, /featureType: "routeStop"/);
  assert.match(mapMarkersSource, /DEPARTURE_HOUSE_ICON_PATH/);
  assert.match(mapMarkersSource, /function createDepartureMarkerImageData\(options = \{\}\) \{/);
  assert.match(routeDetailMapSource, /createDepartureMarkerImageData\(\)/);
  assert.match(routeDetailMapSource, /createMapPinImageData\(stopColor, \{/);
  assert.match(routeDetailMapSource, /map\.addSource\(ROUTE_DETAIL_MARKER_SOURCE_ID/);
  assert.match(routeDetailMapSource, /map\.addLayer\(createMapPinSymbolLayer\(\{/);
  assert.match(routeDetailMapSource, /id: ROUTE_DETAIL_DEPARTURE_LAYER_ID,[\s\S]*iconSize: 1,/);
  assert.match(routeDetailSource, /map\.on\("dblclick", ROUTE_DETAIL_STOP_LAYER_ID, handleRouteStopLayerDoubleClick\)/);
  assert.match(routeDetailSource, /fitRouteStopAndSnappedPoint\(/);
  assert.match(routeDetailSource, /fitRouteDetailMap\(mapRef\.current, maplibregl, routeMapLocations\)/);
  assert.doesNotMatch(routeDetailSource, /createRouteStopMarkerElement|createDepartureMarkerElement\(departureLocation\)|const stopMarker = new maplibregl\.Marker|const snappedStopPointMarker = new maplibregl\.Marker/);
});
test("Route detail falls back to route stop point coordinates before dropping stop markers", () => {
  assert.match(routeDetailMapSource, /function getRouteStopPointerCoordinates\(stop, routeStopPoint\) \{/);
  assert.match(routeDetailMapSource, /if \(stop\.hasCoordinates\) return stop\.coordinates/);
  assert.match(routeDetailMapSource, /normalizeLngLatPair\(routeStopPoint\?\.inputCoordinates\)/);
  assert.match(routeDetailMapSource, /normalizeLngLatPair\(routeStopPoint\?\.snappedCoordinates\)/);
  assert.match(routeDetailMapSource, /for \(const stop of routeStops\) \{\s+const routeStopPoint = findRouteStopPoint\(stop, routeStopPoints\);\s+const markerCoordinates = getRouteStopPointerCoordinates\(stop, routeStopPoint\);\s+if \(!markerCoordinates\) continue;/);
});

test("Route detail keeps removed stop-edit and driver-assignment controls out", () => {
  assert.doesNotMatch(routeDetailSource, /const routeDetailDriverSaveButtonStyle/);
  assert.doesNotMatch(routeDetailSource, /const routeDetailDriverDisabledSaveButtonStyle/);
  assert.doesNotMatch(routeDetailSource, /const routeStopSequenceActionButtonStyle/);
});

test("Route detail can zoom a stop marker to its OSRM snapped stop point", () => {
  assert.match(routeDetailMapSource, /function normalizeLngLatPair\(coordinates\) \{/);
  assert.match(routeDetailMapSource, /function areLngLatPairsEqual\(firstCoordinates, secondCoordinates\) \{/);
  assert.match(routeDetailMapSource, /function findRouteStopPoint\(stop, routeStopPoints\) \{/);
  assert.match(routeDetailMapSource, /point\.deliveryStopId && stop\.deliveryStopId && point\.deliveryStopId === stop\.deliveryStopId/);
  assert.match(routeDetailMapSource, /point\.shopifyOrderGid === stop\.shopifyOrderGid/);
  assert.match(routeDetailMapSource, /function buildRouteStopPointFitLocations\(stop, routeStopPoint\) \{/);
  assert.match(routeDetailMapSource, /normalizeLngLatPair\(routeStopPoint\?\.snappedCoordinates\)/);
  assert.match(routeDetailMapSource, /areLngLatPairsEqual\(location\.coordinates, snappedCoordinates\)/);
  assert.match(routeDetailMapSource, /function fitRouteStopAndSnappedPoint\(map, maplibregl, stop, routeStopPoint\) \{/);
  assert.match(routeDetailMapSource, /fitRouteDetailMap\(map, maplibregl, locations, \{\s+maxZoom: 17,\s+singleZoom: 17,\s+\}\)/);
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
  assert.match(routeDetailSource, /const routeMapCenterRef = useRef\(DEFAULT_CENTER\)/);
  assert.match(routeDetailSource, /routeMapCenterRef\.current = routeMapCenter/);
  assert.match(routeDetailSource, /center: routeMapCenterRef\.current/);
  assert.doesNotMatch(routeDetailSource, /\}, \[mapRenderKey, routeMapCenter, scheduleMapRecovery\]\)/);
  assert.match(routeDetailSource, /hasInitialRouteMapFitRef\.current = false/);
  assert.match(routeDetailSource, /if \(hasInitialRouteMapFitRef\.current\) return/);
  assert.match(routeDetailSource, /hasInitialRouteMapFitRef\.current = true/);
  assert.match(routeDetailMapSource, /const duration = options\.duration \?\? 250/);
  assert.match(routeDetailMapSource, /map\.flyTo\(\{ center: locations\[0\]\.coordinates, duration, essential: true, zoom: singleZoom \}\)/);
  assert.match(routeDetailMapSource, /duration,/);
});

test("Route detail renders every stop as a route-colored source-layer teardrop", () => {
  assert.doesNotMatch(routeDetailSource, /ROUTE_DETAIL_ORDER_MARKER_MIN_ZOOM/);
  assert.doesNotMatch(routeDetailSource, /minzoom/);
  assert.match(routeDetailMapSource, /function getRouteStopDisplayColor\(stop, routeColor, routeStopColorById\) \{/);
  assert.match(routeDetailMapSource, /getRouteDetailStopPinImageId\(stop, stopColor\)/);
  assert.match(routeDetailMapSource, /label: stop\.stop/);
  assert.match(mapMarkersSource, /"icon-anchor": "bottom"/);
  assert.match(routeDetailSource, /map\.on\("dblclick", ROUTE_DETAIL_STOP_LAYER_ID, handleRouteStopLayerDoubleClick\)/);
  assert.doesNotMatch(routeDetailSource, /expandedRouteStopIds|setExpandedRouteStopIds|toggleExpandedRouteStop|addEventListener\("click"|createRouteStopPopupElement|route-stop-precision-point|Show stop|Show \${group\.stops\.length} overlapping route stops|getRouteStopOverlapGroupKey|expandedRouteStopOverlapGroupKey|toggleExpandedRouteStopGroup|getRouteStopOverlapMarkerOffset|markerOffset|ROUTE_STOP_EXPANDED_MARKER_GAP|offset: markerOffset|cluster|Cluster|supercluster|buildRouteStopMarkerGroups|ROUTE_STOP_OVERLAP_PIXEL_RADIUS|createRouteStopMarkerElement/);
});
test("Route detail renders OSRM snapped stop points as route-colored circle layers", () => {
  assert.match(routeDetailMapSource, /const ROUTE_STOP_POINT_MIN_DISTANCE_METERS = 1/);
  assert.match(routeDetailMapSource, /const ROUTE_DETAIL_STOP_POINT_SOURCE_ID = "route-detail-snapped-stop-points"/);
  assert.match(routeDetailMapSource, /const ROUTE_DETAIL_STOP_POINT_LAYER_ID = "route-detail-snapped-stop-points"/);
  assert.match(routeDetailMapSource, /function buildRouteStopPointMarker\(stop, routeStopPoint\) \{/);
  assert.match(routeDetailMapSource, /const snappedCoordinates = normalizeLngLatPair\(routeStopPoint\?\.snappedCoordinates\)/);
  assert.match(routeDetailMapSource, /calculateLngLatDistanceMeters\(stop\.coordinates, snappedCoordinates\)/);
  assert.match(routeDetailMapSource, /distanceMeters < ROUTE_STOP_POINT_MIN_DISTANCE_METERS/);
  assert.match(routeDetailMapSource, /function buildRouteDetailStopPointFeatureCollection\(routeStops, routeStopPoints, routeColor, routeStopColorById\) \{/);
  assert.match(routeDetailMapSource, /map\.addSource\(ROUTE_DETAIL_STOP_POINT_SOURCE_ID/);
  assert.match(routeDetailMapSource, /type: "circle"/);
  assert.match(routeDetailMapSource, /"circle-color": \["coalesce", \["get", "color"\], routeColor\]/);
  assert.doesNotMatch(routeDetailSource, /createRouteStopPointMarkerElement|const snappedStopPointMarker = new maplibregl\.Marker|function shouldRenderRouteStopPoints|zoomend/);
});
test("Route detail uses WebGL stop layers so marker projection follows the map", () => {
  assert.match(routeDetailMapSource, /function syncRouteDetailMapMarkerLayers\(map, departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById = new Map\(\)\) \{/);
  assert.match(routeDetailMapSource, /ROUTE_DETAIL_MARKER_SOURCE_ID/);
  assert.match(routeDetailSource, /ROUTE_DETAIL_STOP_LAYER_ID/);
  assert.match(routeDetailMapSource, /ROUTE_DETAIL_STOP_POINT_LAYER_ID/);
  assert.match(routeDetailMapSource, /featureType: "routeStop"/);
  assert.match(routeDetailMapSource, /map\.addLayer\(createMapPinSymbolLayer\(\{/);
  assert.doesNotMatch(routeDetailSource, /function createRouteDetailMapMarkers|function createRouteStopMarkerElement|const stopMarker = new maplibregl\.Marker|const snappedStopPointMarker = new maplibregl\.Marker/);
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
  assert.match(routeDetailSource, /map\.on\("dblclick", ROUTE_DETAIL_STOP_LAYER_ID, handleRouteStopLayerDoubleClick\)/);
  assert.doesNotMatch(routeDetailSource, /\.on\("moveend", syncRouteDetailMapLayers\)/);
  assert.doesNotMatch(routeDetailSource, /\.on\("zoomend", syncRouteDetailMapLayers\)/);
});


test("Route detail uses child-only rows and global routeIdx save assertions", () => {
  assert.doesNotMatch(routeHelpersSource, /return children\.length >= 2 \? children : \[\]/);
  assert.match(routeHelpersSource, /routeIdx/);
  assert.doesNotMatch(routeDetailSource, /function buildRouteBranchRows\(/);
  assert.doesNotMatch(routeDetailSource, /buildRouteBranchRows\(routeGroup/);
  assert.doesNotMatch(routeDetailSource, /groupRootRouteRows/);
  assert.doesNotMatch(routeDetailSource, /branchOrderIds/);
  assert.doesNotMatch(routeDetailSource, /rootRouteStops/);
  assert.match(routeDetailSource, /routeGroupChildRows\.sort/);
  assert.match(routeDetailSource, /routeIdx/);
});

test("Route detail draft payload is child-only and treats routeIdx as server assertion", () => {
  const start = routeDetailSource.indexOf("function buildRouteDraftPayload(");
  const end = routeDetailSource.indexOf("function renderRouteHeaderMetric", start);
  const payloadBuilder = routeDetailSource.slice(start, end);

  assert.match(payloadBuilder, /routeIdx:/);
  assert.match(payloadBuilder, /routePlanId: routeRow\.routePlanId \?\? null/);
  assert.match(payloadBuilder, /tempId: routeRow\.tempId \?\? null/);
  assert.doesNotMatch(payloadBuilder, /branchId:/);
  assert.doesNotMatch(routeDetailSource, /routeKey: "root"/);
  assert.doesNotMatch(routeDetailSource, /if \(routeRow\.isCurrent\) return "root"/);
});

test("Route detail renders route lines and a stop timeline below the map", () => {
  assert.match(routeDetailSource, /function logRouteDetailPerformance\(name, metric = \{\}\) \{/);
  assert.match(routeDetailServerSource, /routes\.detail\.action\.saveRouteDraft\.request/);
  assert.match(routeDetailServerSource, /optimizedExistingRoutePlanCount: draft\.routes\.filter\(\(route\) => route\.routePlanId && route\.optimized !== undefined\)\.length/);
  assert.match(routeDetailServerSource, /orderCounts: draft\.routes\.map\(\(route\) => route\.orderIds\.length\)/);
  assert.match(routeDetailSource, /function buildRouteStops\(stops\) \{/);
  assert.match(routeDetailSource, /const orderedRouteStops = useMemo\(\(\) => buildRouteStops\(stops\), \[stops\]\)/);
  assert.match(routeDetailSource, /function buildRouteGroupStops\(routeGroup, childRouteDetails, currentRouteStops\) \{/);
  assert.match(routeDetailSource, /const assignmentStops = buildRouteStops\(routeGroup\?\.assignments \?\? \[\]\)/);
  assert.match(routeDetailSource, /const allRouteGroupStops = useMemo/);
  assert.match(routeDetailSource, /const routePlanRowsColumnWidths = \[/);
  assert.match(routeDetailSource, /function buildRouteGroupChildRows\(routeGroup, childDetailsByRoutePlanId = new Map\(\), routeStops = \[\]\) \{/);
  assert.match(routeDetailSource, /getVisibleRouteGroupChildren\(routeGroup\)\.map/);
  assert.match(routeDetailSource, /const routeIdx = numberOrUndefined\(child\?\.routeIdx\)/);
  assert.match(routeDetailSource, /routeIdx: routeIdx \?\? null/);
  assert.match(routeDetailSource, /routeGroupChildRows\.sort/);
  assert.doesNotMatch(routeDetailSource, /function buildRouteBranchRows\(/);
  assert.doesNotMatch(routeDetailSource, /rootRouteStops/);
  assert.doesNotMatch(routeDetailSource, /groupRootRouteRows/);
  assert.doesNotMatch(routeDetailSource, /routeBranchRows/);
  assert.match(routeDetailSource, /formatRouteDurationSeconds\(optimized\?\.metrics\?\.durationSeconds\)/);
  assert.match(routeDetailSource, /formatRouteDistanceMeters\(optimized\?\.metrics\?\.distanceMeters\)/);
  assert.match(routeDetailSource, /const maxRouteIdx = routeRows\.reduce/);
  assert.match(routeDetailSource, /const draft = getNextChildRouteDraft\(contextRouteRows\)/);
  assert.match(routeDetailSource, /routeIdx: draft\.routeIdx/);
  assert.match(routeDetailSource, /routeIndex: draft\.routeIndex/);
  assert.match(routeHelpersSource, /getDefaultRouteGroupChildName\(index, child\)/);
  assert.match(routeDetailSource, /const routePolygonSourceStops = timelineRouteRows\.length > 0[\s\S]*: isRouteGroupDetail \? routeGroupStopsSource : \[\]/);
  assert.match(routeDetailSource, /const routeMapStops = useMemo\(\(\) => \{[\s\S]*timelineRouteRows\.length > 0[\s\S]*return isRouteGroupDetail[\s\S]*routeGroupStopsSource\.map/);
  assert.match(routeDetailSource, /const displayRouteRowsSource = isRouteGroupDetail \? groupRouteRowsSource : currentRouteRowsSource/);
  assert.match(routeDetailSource, /const contextRouteRowsSource = isRouteGroupDetail/);
  assert.match(routeDetailSource, /const routeRows = ensureUniqueRouteRowColors\(applyRouteRowDraftState\(\[\.\.\.displayRouteRowsSource, \.\.\.clientRouteRows\]/);
  assert.match(routeDetailSource, /const contextRouteRows = ensureUniqueRouteRowColors\(applyRouteRowDraftState\(\[\.\.\.contextRouteRowsSource, \.\.\.clientRouteRows\]/);
  assert.match(routeDetailSource, /function getRouteDraftOptimized\(routeRow, includeExistingOptimized\) \{/);
  assert.match(routeDetailSource, /if \(routeRow\.routePlanId && !includeExistingOptimized\) return undefined/);
  assert.match(routeDetailSource, /function shouldIncludeRouteDraftRow\(routeRow, includeEmptyTempRoutes\) \{/);
  assert.match(routeDetailSource, /return !\(routeRow\.tempId && !routeRow\.routePlanId && routeRow\.stops\.length === 0\)/);
  assert.match(routeDetailSource, /buildRouteDraftPayload\(contextTimelineRouteRows, \{ includeExistingOptimized: false \}\)/);
  assert.ok(
    routeDetailSource.indexOf("const [routeCandidateTitle") < routeDetailSource.indexOf("const currentRouteRowsSource ="),
    "routeRows reads route line state after the state is initialized",
  );
  assert.match(routeDetailSource, /const ROUTE_EMPTY_LABEL = "–"/);
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
  assert.match(routeDetailSource, /const defaultRouteCandidateTitle = isRouteGroupDetail \? "#1" : routeDetailTitle/);
  assert.match(routeDetailSource, /title: getRouteGroupChildRouteName\(routeGroup, child, detail\?\.routePlan \?\? child\?\.routePlan, index\)/);
  assert.match(routeDetailSource, /aria-label="Change route driver"/);
  assert.match(routeDetailSource, /aria-label="Change route vehicle"/);
  assert.match(routeDetailSource, /aria-label="Change route start time"/);
  assert.match(routeDetailSource, /function renderRouteEditableChevron\(\) \{/);
  assert.match(routeDetailSource, /function renderRouteLineEditIcon\(\) \{/);
  assert.match(routeDetailSource, /src="\/icons\/route-edit\.png"/);
  assert.match(routeDetailSource, /src="\/icons\/route-polygon-edit\.png"/);
  assert.match(routeDetailSource, /ariaLabel: isRoutePolygonEditMode \? "Stop editing route polygon" : "Edit route polygon"/);
  assert.match(routeDetailSource, /wheelHintEnabled=\{!isRoutePolygonEditMode\}/);
  assert.match(routeDetailMapSource, /const ROUTE_DETAIL_POLYGON_SOURCE_ID = "route-detail-edit-polygon"/);
  assert.match(routeDetailMapSource, /function syncRouteEditPolygon\(map, points, isClosed\) \{/);
  assert.ok(
    routeDetailMapSource.indexOf("const existingSource = map.getSource?.(ROUTE_DETAIL_POLYGON_SOURCE_ID)") <
      routeDetailMapSource.indexOf("if (!isRouteDetailMapStyleReady(map))", routeDetailMapSource.indexOf("function syncRouteEditPolygon")),
    "route polygon source updates before transient style readiness can block double-click close",
  );
  assert.match(routeDetailMapSource, /function buildRouteDetailRouteLineData\(routeLines, fallbackRouteColor\) \{/);
  assert.match(routeDetailMapSource, /\["coalesce", \["get", "routeColor"\], routeColor\]/);
  assert.match(routeDetailMapSource, /ROUTE_DETAIL_STOP_POINT_LAYER_ID/);
  assert.match(routeDetailSource, /map\.on\("styledata", syncPolygon\)/);
  assert.match(routeDetailMapSource, /function isLngLatInPolygon\(point, polygon\) \{/);
  assert.match(routeDetailMapSource, /const ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID = "route-detail-edit-polygon-corners"/);
  assert.match(routeDetailMapSource, /filter: \["==", \["geometry-type"\], "Point"\]/);
  assert.match(routeDetailMapSource, /"circle-color": "#ffffff"/);
  assert.match(routeDetailMapSource, /"circle-radius": 7/);
  assert.match(routeDetailMapSource, /"circle-stroke-color": "#2563eb"/);
  assert.match(routeDetailMapSource, /properties: \{ pointIndex \}/);
  assert.match(routeDetailSource, /const routePolygonPointsRef = useRef\(\[\]\)/);
  assert.match(routeDetailSource, /const routePolygonCornerDragIndexRef = useRef\(null\)/);
  assert.match(routeDetailSource, /const routePolygonSkipNextMapClickRef = useRef\(false\)/);
  assert.match(routeDetailSource, /const routePolygonClosedRef = useRef\(false\)/);
  assert.match(routeDetailSource, /routePolygonClosedRef\.current = nextIsClosed/);
  assert.match(routeDetailSource, /if \(\(event\.originalEvent\?\.detail \?\? 1\) > 1\) return/);
  assert.doesNotMatch(routeDetailSource, /ROUTE_POLYGON_CLICK_DELAY_MS|routePolygonClickTimerRef/);
  assert.match(routeDetailSource, /Save polygon/);
  assert.match(routeDetailSource, /aria-label="Polygon route target"/);
  assert.match(routeDetailSource, /map\.doubleClickZoom\?\.disable\?\.\(\)/);
  assert.match(routeDetailSource, /map\.on\("mousedown", ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID, handlePolygonCornerDragStart\)/);
  assert.match(routeDetailSource, /map\.on\("mousemove", handlePolygonCornerDragMove\)/);
  assert.match(routeDetailSource, /map\.on\("mouseup", handlePolygonCornerDragEnd\)/);
  assert.doesNotMatch(routeDetailMapSource, /createRoutePolygonCornerElement|route-polygon-corner-marker|zIndex: "4500"/);
  assert.doesNotMatch(routeDetailSource, /polygonCornerMarkersRef|new maplibregl\.Marker\(\{\s*draggable: true,/);
  assert.doesNotMatch(routeDetailSource, />✏<\/span>/);
  assert.doesNotMatch(routeDetailSource, /strokeWidth="2\.2"/);
  assert.match(routeDetailSource, /function ensureUniqueRouteRowColors\(routeRows\) \{/);
  assert.match(routeDetailSource, /const ROUTE_DEFAULT_COLORS = \[MAP_MARKER_PALETTE\.plannedOrder\.color/);
  assert.match(routeDetailSource, /ROUTE_DEFAULT_COLORS\[index % ROUTE_DEFAULT_COLORS\.length\]/);
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

test("Route detail page provides page navigation back to the route list", () => {
  assert.match(routeDetailSource, /import \{ useFetcher, useLoaderData, useNavigate, useRevalidator, useRouteError \} from "react-router"/);
  assert.match(routeDetailSource, /const navigate = useNavigate\(\)/);
  assert.match(routeDetailSource, /const routesListHref = ROUTES_ROOT_PATH/);
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
