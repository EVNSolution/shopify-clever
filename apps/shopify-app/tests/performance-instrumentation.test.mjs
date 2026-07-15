import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readOrdersPageSource } from "./helpers/orders-source.mjs";

const root = process.cwd();

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const ordersPageSource = readOrdersPageSource();
const appRouteSource = readFileSync(join(root, "app/routes/app.jsx"), "utf8");
const routeDetailPageSource = readFileSync(
  join(root, "app/routes/app.routes.$routeId.jsx"),
  "utf8",
);
const routeDetailServerSource = readFileSync(
  join(root, "app/features/delivery/route-detail.server.js"),
  "utf8",
);
const settingsPageSource = readFileSync(join(root, "app/routes/app.settings.jsx"), "utf8");
const rootSource = readFileSync(join(root, "app/root.jsx"), "utf8");
const perfRoutePath = join(root, "app/routes/perf.jsx");
const perfScriptPath = join(root, "scripts/perf-orders.mjs");

test("performance evaluator captures real browser Orders navigation timings", () => {
  assert.equal(packageJson.scripts["perf:orders"], "node scripts/perf-orders.mjs");
  assert.equal(existsSync(perfScriptPath), true, "scripts/perf-orders.mjs should exist");

  const perfScriptSource = readFileSync(perfScriptPath, "utf8");
  assert.match(perfScriptSource, /orders-navigation\.jsonl/);
  assert.match(perfScriptSource, /tell application "Safari"/);
  assert.match(perfScriptSource, /shopify\.admin\.iframe/);
  assert.match(perfScriptSource, /app\.document\.navigation/);
  assert.match(perfScriptSource, /orders\.loader/);
  assert.match(perfScriptSource, /orders\.render\.commit/);
  assert.match(perfScriptSource, /orders\.maplibre\.init/);
  assert.match(perfScriptSource, /orders\.maplibre\.remove/);
  assert.match(perfScriptSource, /orders\.maplibre\.source_update/);
  assert.match(perfScriptSource, /orders\.maplibre\.source_retry/);
  assert.match(perfScriptSource, /shopifyOrdersCacheStatus/);
  assert.match(perfScriptSource, /serverOrdersMs/);
  assert.match(perfScriptSource, /ordersLoaderCold/);
  assert.match(perfScriptSource, /ordersLoaderWarm/);
  assert.match(perfScriptSource, /mapLibreCold/);
  assert.match(perfScriptSource, /mapLibreWarm/);
  assert.match(perfScriptSource, /ordersSourceUpdate/);
  assert.match(perfScriptSource, /ordersSourceRetry/);
});

test("Orders route renders its shell while slow loader data is still pending", () => {
  assert.match(ordersPageSource, /async function loadOrdersPageData\(/);
  assert.match(
    ordersPageSource,
    /export const loader = async \(\{ request \}\) => \{[\s\S]*authenticate\.admin\(request\)[\s\S]*ordersPageData: loadOrdersPageData\(/,
  );
  assert.doesNotMatch(ordersPageSource, /ordersPageData:\s*await loadOrdersPageData\(/);
  assert.match(ordersPageSource, /<Suspense fallback=\{<OrdersPageLoading \/>\}>/);
  assert.match(ordersPageSource, /<Await resolve=\{ordersPageData\}>/);
  assert.match(ordersPageSource, /function OrdersPageContent\(\{ loaderData \}\)/);
  assert.match(ordersPageSource, /aria-label="Orders are loading"/);
});

test("performance capture endpoint stores browser metrics outside app data", () => {
  assert.equal(existsSync(perfRoutePath), true, "app/routes/perf.jsx should exist");

  const perfRouteSource = readFileSync(perfRoutePath, "utf8");
  assert.match(perfRouteSource, /export async function action/);
  assert.match(perfRouteSource, /\.omx\/perf/);
  assert.match(perfRouteSource, /orders-navigation\.jsonl/);
  assert.match(perfRouteSource, /appendFile/);
  assert.match(perfRouteSource, /function shouldLogMetricToConsole\(metric\) \{/);
  assert.match(perfRouteSource, /metric\.name\.startsWith\("routes\.detail\.map\."\)/);
  assert.match(perfRouteSource, /console\.info\(metric\.name, entry\)/);
  assert.doesNotMatch(perfRouteSource, /prisma|migrate|Session/);
});

test("app shell records page navigation metrics by target page", () => {
  assert.match(appRouteSource, /useAppNavigationPerformance/);
  assert.match(appRouteSource, /name: "app\.page\.navigation"/);
  assert.match(appRouteSource, /fromPage: getAppPageName\(fromPath\)/);
  assert.match(appRouteSource, /toPage: getAppPageName\(currentPath\)/);
  assert.match(appRouteSource, /durationMs/);
  assert.match(appRouteSource, /markNavigationStart\(href, "sidebar-click"\)/);
  assert.match(appRouteSource, /navigation\.location\?\.pathname/);
  assert.match(appRouteSource, /trigger: "router"/);

  const perfRouteSource = readFileSync(perfRoutePath, "utf8");
  assert.match(perfRouteSource, /app-page-navigation\.jsonl/);
  assert.match(perfRouteSource, /metric\?\.name === "app\.page\.navigation"/);
});

test("Orders page emits loader, iframe, document, and MapLibre timing metrics", () => {
  assert.match(ordersPageSource, /const PERF_ENDPOINT = "\/perf"/);
  assert.match(ordersPageSource, /function getSanitizedUrl\(url\) \{/);
  assert.match(ordersPageSource, /function emitPerformanceMetric\(metric\) \{/);
  assert.match(ordersPageSource, /name: "shopify\.admin\.iframe"/);
  assert.match(ordersPageSource, /name: "app\.document\.navigation"/);
  assert.match(ordersPageSource, /name: "orders\.loader"/);
  assert.match(ordersPageSource, /name: "orders\.render\.commit"/);
  assert.match(ordersPageSource, /name: "orders\.maplibre\.init"/);
  assert.match(ordersPageSource, /name: "orders\.maplibre\.remove"/);
  assert.match(ordersPageSource, /name: "orders\.maplibre\.source_update"/);
  assert.match(ordersPageSource, /activeOrdersView/);
  assert.match(ordersPageSource, /shopifyOrdersCacheStatus/);
  assert.match(ordersPageSource, /shopifyOrdersMs/);
  assert.match(ordersPageSource, /departureLocationMs/);
  assert.match(ordersPageSource, /inventoriesMs/);
  assert.match(ordersPageSource, /shopTimeZoneMs/);
  assert.match(ordersPageSource, /mapLibreImportMs/);
  assert.match(ordersPageSource, /mapRemoveMs/);
  assert.match(ordersPageSource, /sourceUpdateMs/);
  assert.match(ordersPageSource, /plannedOrderCount/);
  assert.doesNotMatch(ordersPageSource, /durationMs: roundPerfDuration\(performance\.now\(\)\)/);
  assert.match(ordersPageSource, /durationMs: roundPerfDuration\(navigationEntry\.duration\)/);
});

test("root document preconnects to map tile infrastructure before MapLibre loads", () => {
  assert.match(rootSource, /https:\/\/tiles\.openfreemap\.org\//);
  assert.match(rootSource, /https:\/\/overturemaps-tiles-us-west-2-beta\.s3\.amazonaws\.com\//);
  assert.match(rootSource, /rel="preconnect"/);
});

test("app loaders scope cached Shopify departure location reads by authenticated shop", () => {
  for (const source of [ordersPageSource, routeDetailPageSource + routeDetailServerSource, settingsPageSource]) {
    assert.match(source, /session\?\.shop/);
    assert.match(source, /fetchShopifyDepartureLocation\(admin,\s*\{\s*cacheKey: shopifyShopCacheKey\s*\}\)/);
  }
});
