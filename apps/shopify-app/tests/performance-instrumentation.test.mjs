import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  buildOrdersViewNavigationMetric,
  shouldRequestOrdersData,
  shouldRevalidateOrdersRoute,
  withPromiseTimeout,
} from "../app/features/orders/orders-page.shared.js";
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
const entryServerSource = readFileSync(join(root, "app/entry.server.jsx"), "utf8");
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
    /export const loader = async \(\{ request \}\) => \{[\s\S]*authenticate\.admin\(request\)[\s\S]*ordersPageData: withPromiseTimeout\([\s\S]*loadOrdersPageData\(/,
  );
  assert.doesNotMatch(ordersPageSource, /ordersPageData:\s*await loadOrdersPageData\(/);
  assert.match(ordersPageSource, /<Suspense fallback=\{<OrdersPageLoading \/>\}>/);
  assert.match(ordersPageSource, /<Await resolve=\{ordersPageData\} errorElement=\{<OrdersPageLoadError \/>\}>/);
  assert.match(ordersPageSource, /function OrdersPageContent\(\{ loaderData \}\)/);
  assert.match(ordersPageSource, /aria-label="Orders are loading"/);
});

test("Orders loading leaves the skeleton for a retryable error when data stalls", async () => {
  await assert.rejects(
    withPromiseTimeout(new Promise(() => {}), 5, "Orders data loading timed out."),
    /Orders data loading timed out\./,
  );

  assert.match(ordersPageSource, /const ORDERS_PAGE_LOAD_TIMEOUT_MS = 15_000/);
  assert.match(ordersPageSource, /ordersPageData: withPromiseTimeout\(/);
  assert.match(ordersPageSource, /<Await resolve=\{ordersPageData\} errorElement=\{<OrdersPageLoadError \/>\}>/);
  assert.match(ordersPageSource, /function OrdersPageLoadError\(\)/);
  assert.match(ordersPageSource, /const revalidator = useRevalidator\(\)/);
  assert.match(ordersPageSource, /ordersLoadAutoRetryAttempted/);
  assert.match(
    ordersPageSource,
    /window\.setTimeout\(\(\) => \{[\s\S]*ordersLoadAutoRetryAttempted = true;[\s\S]*revalidator\.revalidate\(\);[\s\S]*\}, ORDERS_AUTO_RETRY_DELAY_MS\)/,
  );
  assert.match(ordersPageSource, /ordersLoadAutoRetryAttempted = false/);
  assert.match(ordersPageSource, /onClick=\{\(\) => revalidator\.revalidate\(\)\}/);
  assert.match(ordersPageSource, /Shopify and delivery data are loading asynchronously/);
});

test("SSR keeps the stream open long enough to flush the Orders timeout boundary", () => {
  assert.match(entryServerSource, /export const streamTimeout = 30_000/);
  assert.match(entryServerSource, /setTimeout\(abort, streamTimeout \+ 1000\)/);
});

test("Orders UI-only query changes keep loaded Orders and Inventory data", () => {
  const routeArgs = (currentPath, nextPath, overrides = {}) => ({
    currentUrl: new URL(`https://admin.example${currentPath}`),
    nextUrl: new URL(`https://admin.example${nextPath}`),
    defaultShouldRevalidate: true,
    formMethod: undefined,
    ...overrides,
  });

  assert.equal(
    shouldRevalidateOrdersRoute(routeArgs("/app/orders", "/app/orders?view=inventory")),
    false,
  );
  assert.equal(
    shouldRevalidateOrdersRoute(routeArgs("/app/orders?view=inventory", "/app/orders")),
    false,
  );
  assert.equal(
    shouldRevalidateOrdersRoute(routeArgs("/app/orders", "/app/orders?deliveryArea=North")),
    false,
  );
  assert.equal(
    shouldRevalidateOrdersRoute(routeArgs("/app/orders", "/app/orders?id_token=next-token")),
    true,
  );
  assert.equal(
    shouldRevalidateOrdersRoute(routeArgs("/app/orders", "/app/orders?unexpected=1")),
    true,
  );
  assert.equal(
    shouldRevalidateOrdersRoute(routeArgs("/app/orders", "/app/orders")),
    true,
    "explicit revalidation on the same URL must remain available",
  );
  assert.equal(
    shouldRevalidateOrdersRoute(routeArgs("/app/orders", "/app/orders?view=inventory", { formMethod: "POST" })),
    true,
  );

  assert.match(ordersPageSource, /export function shouldRevalidate\(args\) \{/);
  assert.match(ordersPageSource, /return shouldRevalidateOrdersRoute\(args\)/);
});

test("direct Inventory entry loads Orders once only when the Orders tab is selected", () => {
  const initialOrdersSelection = {
    activeOrdersView: "orders",
    ordersLoaded: false,
    requestPending: false,
    revalidationState: "idle",
  };

  assert.equal(shouldRequestOrdersData(initialOrdersSelection), true);
  assert.equal(
    shouldRequestOrdersData({ ...initialOrdersSelection, activeOrdersView: "inventory" }),
    false,
  );
  assert.equal(
    shouldRequestOrdersData({ ...initialOrdersSelection, requestPending: true }),
    false,
    "the request guard prevents duplicate manual revalidation",
  );
  assert.equal(
    shouldRequestOrdersData({ ...initialOrdersSelection, ordersLoaded: true }),
    false,
    "loaded Orders data must not revalidate again",
  );
  assert.equal(
    shouldRequestOrdersData({ ...initialOrdersSelection, revalidationState: "loading" }),
    false,
  );

  assert.match(ordersPageSource, /ordersLoaded: shouldLoadOrders/);
  assert.match(ordersPageSource, /const \{[\s\S]*ordersLoaded[\s\S]*\} = loaderData/);
  assert.match(ordersPageSource, /const ordersLoadRequestedRef = useRef\(false\)/);
  assert.match(ordersPageSource, /const shouldRequestOrders = shouldRequestOrdersData\(\{/);
  assert.match(ordersPageSource, /ordersLoadRequestedRef\.current = true;[\s\S]*revalidator\.revalidate\(\)/);
  assert.match(ordersPageSource, /aria-label="Shopify orders are loading"/);
});

test("Orders view transitions emit query-safe performance metrics", () => {
  const metric = buildOrdersViewNavigationMetric({
    activeOrdersView: "inventory",
    observedAt: 112.5,
    pendingNavigation: {
      fromView: "orders",
      startedAt: 100,
      toView: "inventory",
      url: "/app/orders?view=inventory&id_token=secret",
    },
  });

  assert.deepEqual(metric, {
    name: "orders.view.navigation",
    category: "orders-view-navigation",
    durationMs: 12.5,
    fromView: "orders",
    toView: "inventory",
  });
  assert.equal(JSON.stringify(metric).includes("id_token"), false);
  assert.equal(
    buildOrdersViewNavigationMetric({
      activeOrdersView: "orders",
      observedAt: 112.5,
      pendingNavigation: { fromView: "orders", startedAt: 100, toView: "inventory" },
    }),
    null,
  );

  assert.match(ordersPageSource, /const pendingOrdersViewNavigationRef = useRef\(null\)/);
  assert.match(ordersPageSource, /emitPerformanceMetric\(navigationMetric\)/);
  assert.match(ordersPageSource, /pendingOrdersViewNavigationRef\.current = null/);
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
