import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const routesDir = join(root, "app/routes");

function readAppFile(path) {
  return readFileSync(join(root, path), "utf8");
}

const visibleRoutes = [
  ["/app/orders", "Orders", "app/routes/app.orders.jsx"],
  ["/app/routes", "Routes", "app/routes/app.routes.jsx"],
  ["/app/analytics", "Analytics", "app/routes/app.analytics.jsx"],
  ["/app/drivers-vehicles", "Drivers", "app/routes/app.drivers-vehicles.jsx"],
  ["/app/settings", "Settings", "app/routes/app.settings.jsx"],
];

const forbiddenRouteFiles = [
  "app/routes/app.additional.jsx",
  "app/routes/app.orders.$orderId.jsx",
  "app/routes/app.stops.$stopId.jsx",
  "app/routes/app.analytics.$reportId.jsx",
  "app/routes/app.workflows.jsx",
  "app/routes/app.workflows.rules.$ruleId.jsx",
  "app/routes/app.workflows.exceptions.$exceptionId.jsx",
  "app/routes/app.drivers-vehicles.drivers.$driverId.jsx",
  "app/routes/app.drivers-vehicles.vehicles.$vehicleId.jsx",
  "app/routes/app.settings.$section.jsx",
];

test("visible navigation is exactly the five daily operations tabs", () => {
  const appSource = readAppFile("app/routes/app.jsx");
  const [, navItemsSource = ""] = appSource.match(/const APP_NAV_ITEMS = \[([\s\S]*?)\];/) ?? [];
  const visibleLinks = [...navItemsSource.matchAll(/\{ href: "([^"]+)", labelKey: "([^"]+)" \}/g)].map(([, href, labelKey]) => [href, labelKey]);

  assert.deepEqual(visibleLinks, [
    ["/app/orders", "nav.orders"],
    ["/app/routes", "nav.routes"],
    ["/app/analytics", "nav.analytics"],
    ["/app/drivers-vehicles", "nav.drivers"],
    ["/app/settings", "nav.settings"],
  ]);
  assert.match(appSource, /translate\(language, item\.labelKey\)/);
  assert.doesNotMatch(navItemsSource, /additional/i);

  for (const [, , routeFile] of visibleRoutes) {
    assert.equal(existsSync(join(root, routeFile)), true, `${routeFile} should exist`);
  }
});

test("additional and forbidden object-detail routes are not present", () => {
  for (const routeFile of forbiddenRouteFiles) {
    assert.equal(existsSync(join(root, routeFile)), false, `${routeFile} must not exist`);
  }

  const appRouteFiles = readdirSync(routesDir).filter((file) => file.startsWith("app.") && file.endsWith(".jsx"));
  assert.deepEqual(
    appRouteFiles.filter((file) => file.startsWith("app.workflows")),
    [],
    "Workflows must not expose app route files while paused",
  );
  assert.deepEqual(
    appRouteFiles.filter((file) => file.includes("$")),
    ["app.route-groups.$routeGroupId.jsx", "app.routes.$routeId.jsx"],
    "only route plans and parent route groups should have app object detail routes",
  );
});

test("Orders stays map/table/route-plan first without placeholder KPI or review cards", () => {
  const source = readAppFile("app/routes/app.orders.jsx");

  assert.match(source, /<TabLayout\s+primaryExpanded=\{isMapWide\}/);
  assert.doesNotMatch(source, /title="Orders"/);
  assert.match(source, /id="orders-map"/);
  assert.match(source, /<table[\s\S]*?aria-label="Shopify orders"/);
  assert.match(source, /className="order-route-plan"/);
  assert.doesNotMatch(source, /ordersKpi|ordersFilter|orderReviewPanel|orderReviewCard/);
  assert.doesNotMatch(source, /Order detail drawer|DeliveryStop review panel|Create route plan panel/);
  assert.doesNotMatch(source, /orders\/:orderId|app\.orders\.\$orderId/);
});

test("Routes keeps route plan/group detail routes hidden behind the route table", () => {
  const routesSource = readAppFile("app/routes/app.routes.jsx");
  const detailSource = readAppFile("app/routes/app.routes.$routeId.jsx");

  assert.doesNotMatch(routesSource, /aria-label="Routes KPI"/);
  assert.doesNotMatch(routesSource, /aria-label="Routes filters"/);
  assert.doesNotMatch(routesSource, /routeStatusKpiLabels|routeFilterLabels|getRouteStatusCounts/);
  assert.match(routesSource, /getRouteFilters\(searchParams\)/);
  assert.match(routesSource, /filterRouteRows\(allRouteRows, routeFilters\)/);
  assert.match(routesSource, /<table style=\{singleRouteTableStyle\}>/);
  assert.match(routesSource, /createRouteDetailHref\(route, idToken\)/);

  assert.match(detailSource, /route-overview-header/);
  assert.match(detailSource, /route-overview-summary/);
  assert.doesNotMatch(detailSource, /aria-label="Route driver assignment"/);
  assert.match(detailSource, /Route stop location map/);
  assert.match(detailSource, /aria-label="Driver route rows"/);
  assert.match(detailSource, /aria-label="Route stop timeline"/);
  assert.match(detailSource, /routeRow\.stops\.map\(\(stop\) =>/);
  assert.doesNotMatch(detailSource, /Route operations|routeDetailOperationsGridStyle|routeDetailOperationsCardStyle/);
  assert.doesNotMatch(detailSource, /vehicle assignment|stop detail drawer|dispatch checklist|driver event timeline/i);
  assert.doesNotMatch(detailSource, /routes\/:routeId\/stops|assignments\/:assignmentId|events\/:eventId/);
});

test("Analytics summarizes current-batch sessions, issues, and execution without report details", () => {
  const source = readAppFile("app/routes/app.analytics.jsx");

  for (const label of [
    "Batch dashboard",
    "Week scope selector",
    "This week",
    "Next week",
    "Access-date week range",
    "Delivery session summary",
    "Urgent issue detail",
    "Delivery performance detail",
    "Selected week delivery",
    "Selected week pickup",
    "Selected week evening delivery",
    "Average execution time",
    "Awaiting batch data",
  ]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const href of [
    "/app/analytics?week=next",
    "weekScope",
    "deliveryMode",
    "/app/drivers-vehicles",
  ]) {
    assert.match(source, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(
    source,
    /\/app\/analytics\/|analytics\/:reportId|app\.analytics\.\$reportId|Webhook event detail page|Chart detail page/,
  );
  assert.match(source, /headerAction=\{/);
  assert.doesNotMatch(source, /className="batch-summary-list"|createBatchSummaryItems|<dl|description="/);
  assert.doesNotMatch(source, /status:\s*"Separate evening session"|statusTone:\s*"progress"/);
  assert.doesNotMatch(source, /Thursday-Saturday|Thursday delivery|Friday regular delivery|Friday evening delivery|Saturday pickup|목\/금/);
  assert.doesNotMatch(source, /analytics-kpi-grid|analytics-kpi-card|Overview KPI|Missing data report/);
  assert.doesNotMatch(source, /\/app\/workflows|Open workflow|Open ETA stage|Open evening workflow/);
});

test("Workflows is temporarily removed from the app surface", () => {
  const appSource = readAppFile("app/routes/app.jsx");
  const analyticsSource = readAppFile("app/routes/app.analytics.jsx");

  assert.equal(existsSync(join(root, "app/routes/app.workflows.jsx")), false);
  assert.doesNotMatch(appSource, /\/app\/workflows|Workflows/);
  assert.doesNotMatch(analyticsSource, /\/app\/workflows|Open workflow|Open ETA stage|Open evening workflow/);
});

test("Drivers is a single operational driver list without vehicle or assignment sub-tabs", () => {
  const source = readAppFile("app/routes/app.drivers-vehicles.jsx");

  for (const label of ["Drivers", "Invite driver", "Search drivers", "Driver list", "Assigned route", "Recent events"]) {
    assert.match(source, new RegExp(label));
  }
  assert.doesNotMatch(source, />Create driver</);
  assert.match(source, /assignedRouteTextStyle/);
  assert.doesNotMatch(source, /driver\.assignedRoute\.href|<a href=\{driver\.assignedRoute\.href\}/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-label="Invite driver"/);
  assert.match(source, /aria-label="Select country dial code"/);
  assert.match(source, /aria-expanded=\{countryCodeOpen\}/);
  assert.match(source, /aria-controls="driver-country-code-options"/);
  assert.match(source, /countryDialCodeOptions/);
  assert.match(source, /formatInvitePhoneInput/);
  assert.match(source, /formatSavedDriverPhone/);
  assert.match(source, /normalizeInvitePhone/);
  assert.match(source, /driverTableSurfaceStyle/);
  assert.match(source, /minHeight: "calc\(100vh - 48px\)"/);
  assert.match(source, /flex: "1 1 auto"/);
  assert.match(source, /<div style=\{driverTableSurfaceStyle\}>/);
  assert.match(source, /createPendingDeliveryDriver/);
  assert.match(source, /fetchDeliveryDrivers/);
  assert.match(source, /regenerateDeliveryDriverInviteCode/);
  assert.match(source, /const savePendingDriver = async \(\) =>/);
  assert.match(source, /const regenerateInviteCode = async \(driverId\) =>/);
  assert.match(source, /driverInviteFetcher\.submit/);
  assert.match(source, /onClick=\{savePendingDriver\}>Save<\/button>/);
  assert.match(source, /Pending driver saved\./);
  assert.doesNotMatch(source, /Save the pending driver before copying the link/);
  const [, copyInviteMessageBody = ""] = source.match(/const copyInviteMessage = async \(\) => \{([\s\S]*?)\n  \};/) ?? [];
  assert.match(copyInviteMessageBody, /inviteMessagePreview/);
  assert.doesNotMatch(copyInviteMessageBody, /normalizeInvitePhone/);
  assert.doesNotMatch(copyInviteMessageBody, /driverInviteFetcher\.submit/);
  assert.match(source, /Invite message preview/);
  assert.match(source, /<pre style=\{inviteMessagePreviewStyle\}>/);
  assert.match(source, /인증코드 생성/);
  assert.match(source, /재로그인/);
  assert.match(source, /canShowDriverReloginAction\(driver\)/);
  assert.match(source, /onClick=\{\(\) => regenerateInviteCode\(driver\.id\)\}/);
  assert.doesNotMatch(source, /driver\.status === "Pending" && driver\.inviteCode/);
  assert.doesNotMatch(source, /Copy download link<\/button>.*disabled=\{driverInviteFetcher\.state !== "idle"\}/);
  assert.match(source, /boxSizing: "border-box"/);
  assert.match(source, /overflow: "visible"/);
  assert.match(source, /Canada \/ United States/);
  assert.match(source, /South Korea/);
  assert.match(source, /Mexico/);
  assert.match(source, /United Kingdom/);
  assert.match(source, /Australia/);
  assert.match(source, /Germany/);
  assert.match(source, /France/);
  assert.match(source, /India/);
  assert.match(source, /Brazil/);
  assert.match(source, /South Africa/);
  assert.match(source, /010 1234 5678/);
  assert.match(source, /placeholder=\{`\$\{selectedCountryCode\.dialCode\} \$\{selectedCountryCode\.example\}`\}/);
  assert.match(source, /setInvitePhone\(formatInvitePhoneInput\(selectedCountryCode\.dialCode, event\.currentTarget\.value\)\)/);
  assert.match(source, /setInvitePhone\(formatInvitePhoneInput\(option\.dialCode, invitePhone\)\)/);
  assert.match(source, /aria-label="Driver phone number"/);
  assert.match(source, />Copy invite message<\/button>/);
  assert.doesNotMatch(source, /Create invite/);
  assert.doesNotMatch(source, /Create vehicle/);
  assert.doesNotMatch(source, /role="tablist"|role="tab"/);
  assert.doesNotMatch(source, /drivers-vehicles\?tab=|drivers-vehicles\/drivers|drivers-vehicles\/vehicles|assignments\/:assignmentId/);
});

test("Settings is a single plain form without navigation-only setting sections", () => {
  const source = readAppFile("app/routes/app.settings.jsx");

  assert.match(source, /<PageShell\s+title=\{copy\("settings\.title"\)\}/);
  assert.match(source, /method="post"/);
  assert.match(source, />\{copy\("settings\.general\.title"\)\}<\/legend>/);
  assert.match(source, /name="language"/);
  assert.match(source, /SUPPORTED_LANGUAGES\.map/);
  assert.match(source, /geocodeAddress/);
  assert.match(source, /name="departureAddress"/);
  assert.match(source, /ariaLabel="Departure location map"/);
  assert.match(source, /name="departureLatitude"|name="departureLongitude"/);
  assert.match(source, /type="hidden"/);
  assert.match(source, />\{copy\("settings\.departureLocation\.latitude"\)\}<\/span>/);
  assert.match(source, />\{copy\("settings\.departureLocation\.longitude"\)\}<\/span>/);
  assert.match(source, /aria-label="Departure latitude"/);
  assert.match(source, /aria-label="Departure longitude"/);
  assert.match(source, /readOnly/);
  assert.match(source, /type="reset"/);
  assert.match(source, />\{copy\("settings\.actions\.reset"\)\}<\/button>/);
  assert.match(source, />\{copy\("settings\.actions\.save"\)\}<\/button>/);
  assert.doesNotMatch(source, /PageSection|PageGrid|ValueList|StatusPill|PageNote/);
  assert.doesNotMatch(source, /Settings sections|User variables|Runtime\/system values/);
  assert.doesNotMatch(source, /Store Connection|API Connection|Delivery Rules|Map & Geocoding|Sync & Webhooks|Capacity Defaults|Advanced/);
  assert.doesNotMatch(source, /section=sync|section=api|section=planning/);
  assert.doesNotMatch(source, /settings\/store|settings\/api|settings\/sync|settings\/webhooks|settings\/advanced/);
});
