import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  buildOrdersViewNavigationMetric,
  createOrdersViewSnapshot,
  getPendingOrdersView,
  restoreOrdersViewSnapshot,
  shouldRequestOrdersData,
  shouldRevalidateOrdersRoute,
  withPromiseTimeout,
} from "../app/features/orders/orders-page.shared.js";
import {
  allowlistTelemetryMetric,
  hashShopIdentifier,
  sanitizeRequestPath,
  sanitizeTelemetryValue,
} from "../app/features/telemetry/structured-telemetry.server.js";
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
const perfCohortScriptPath = join(root, "scripts/orders-browser-performance-cohorts.mjs");

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

test("Orders performance cohorts use real embedded-browser samples and merge server evidence", () => {
  assert.equal(packageJson.scripts["perf:orders:cohorts"], "node scripts/orders-browser-performance-cohorts.mjs");
  assert.equal(existsSync(perfCohortScriptPath), true);
  const source = readFileSync(perfCohortScriptPath, "utf8");
  assert.match(source, /orders\.loader\.first_usable/);
  assert.match(source, /orders\.page\.fetch/);
  assert.match(source, /PERF_SAMPLE_COUNT/);
  assert.match(source, /CLEVER_ROUTE_SERVER_ROOT/);
  assert.match(source, /Shopify embedded app; set PERF_TARGET_URL/);
  assert.match(source, /orders-server-performance-cohorts\.json/);
  assert.match(source, /assertPrivacyCanary/);
  assert.match(source, /distanceMs <= 1_000/);
});

test("Orders resource transitions reuse a short-lived in-memory App Bridge session token", () => {
  assert.match(ordersPageSource, /createOrdersResourceSessionTokenGetter\(\(\) => shopify\.idToken\(\)\)/);
  assert.match(ordersPageSource, /const idToken = await getOrdersResourceSessionToken\(\)/);
  assert.doesNotMatch(ordersPageSource, /const idToken = await shopify\.idToken\(\);[\s\S]{0,200}loadOrdersPageResource/);
});

test("Orders prefetches one bounded numeric page and restores pages from memory", () => {
  assert.match(ordersPageSource, /const ordersPagePrefetchFetcher = useFetcher\(\)/);
  assert.match(ordersPageSource, /const nextPage = getPositiveInteger\(ordersPageInfo\.currentPage\) \+ 1/);
  assert.match(ordersPageSource, /page: nextPage/);
  assert.match(ordersPageSource, /ordersPageCacheRef\.current\.get\(cacheKey\)/);
  assert.match(ordersPageSource, /getOrdersPageCacheKey\(resourceFilterKey, "page", currentPageNumber\)/);
  assert.doesNotMatch(ordersPageSource, /localStorage[\s\S]{0,500}ordersPageCache/);
});

test("performance capture preserves allowlisted metric names while redacting sensitive fields", () => {
  const metric = allowlistTelemetryMetric({
    name: "orders.loader.first_usable",
    customerName: "Private Customer",
  });

  assert.equal(metric.name, "orders.loader.first_usable");
  assert.equal("customerName" in metric, false);
  const perfRouteSource = readFileSync(perfRoutePath, "utf8");
  assert.doesNotMatch(perfRouteSource, /\.\.\.sanitizeTelemetryValue\(metric\)/);
});

test("Orders route renders its shell while slow loader data is still pending", () => {
  assert.match(ordersPageSource, /async function loadOrdersPageData\(/);
  assert.match(
    ordersPageSource,
    /export const loader = async \(\{ request \}\) => \{[\s\S]*authenticate\.admin\(request\)[\s\S]*const ordersPageData = withPromiseTimeout\([\s\S]*loadOrdersPageData\(/,
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
  assert.match(ordersPageSource, /const ordersPageData = withPromiseTimeout\(/);
  assert.match(ordersPageSource, /<Await resolve=\{ordersPageData\} errorElement=\{<OrdersPageLoadError \/>\}>/);
  assert.match(ordersPageSource, /function OrdersPageLoadError\(\)/);
  assert.match(ordersPageSource, /const revalidator = useRevalidator\(\)/);
  assert.doesNotMatch(ordersPageSource, /ordersLoadAutoRetryAttempted|ORDERS_AUTO_RETRY_DELAY_MS/);
  assert.match(ordersPageSource, /onClick=\{\(\) => revalidator\.revalidate\(\)\}/);
  assert.match(ordersPageSource, /Shopify and delivery data are loading asynchronously/);
});

test("SSR keeps the stream open long enough to flush the Orders timeout boundary", () => {
  assert.match(entryServerSource, /export const streamTimeout = 30_000/);
  assert.match(entryServerSource, /setTimeout\(abort, streamTimeout \+ 1000\)/);
});

test("Inventory to Orders reloads data while other UI-only query changes keep loaded data", () => {
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
    true,
    "returning to Orders must reload the list and map instead of reusing Inventory-only loader data",
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
  assert.equal(
    shouldRevalidateOrdersRoute(routeArgs("/app/orders", "/app/orders", {
      formData: new URLSearchParams({ _intent: "refreshAllRoutes" }),
      formMethod: "POST",
    })),
    false,
    "the background update owns one explicit loader refresh after its action completes",
  );
  assert.equal(
    shouldRevalidateOrdersRoute(routeArgs("/app/orders", "/app/orders", {
      formData: new URLSearchParams({ _intent: "pollOrdersReconciliation" }),
      formMethod: "POST",
    })),
    false,
    "reconciliation status polling must not reload Orders before terminal success",
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
  assert.match(ordersPageSource, /const sourceOrdersLoaded = loaderData\.ordersLoaded === true/);
  assert.match(ordersPageSource, /restoreOrdersViewSnapshot\(/);
  assert.match(ordersPageSource, /const \{[\s\S]*ordersLoaded[\s\S]*\} = displayLoaderData/);
  assert.match(ordersPageSource, /const ordersLoadRequestedRef = useRef\(false\)/);
  assert.match(
    ordersPageSource,
    /if \(activeOrdersView === "inventory"\) \{[\s\S]*ordersLoadRequestedRef\.current = false;[\s\S]*return;/,
  );
  assert.match(ordersPageSource, /const shouldRequestOrders = shouldRequestOrdersData\(\{/);
  assert.match(ordersPageSource, /ordersLoadRequestedRef\.current = true;[\s\S]*revalidator\.revalidate\(\)/);
  assert.match(ordersPageSource, /aria-label="Shopify orders are loading"/);
});

test("Orders tab selection follows the pending destination before its loader completes", () => {
  assert.equal(
    getPendingOrdersView({
      pathname: "/app/orders",
      search: "",
    }),
    "orders",
  );
  assert.equal(
    getPendingOrdersView({
      pathname: "/app/orders",
      search: "?view=inventory",
    }),
    "inventory",
  );
  assert.equal(
    getPendingOrdersView({
      pathname: "/app/orders/inventory",
      search: "",
    }),
    undefined,
  );
  assert.match(
    ordersPageSource,
    /const activeOrdersView = getPendingOrdersView\(navigation\.location\) \?\? currentOrdersView/,
  );
  assert.match(
    ordersPageSource,
    /navigation\.state === "idle" \? revalidator\.state : navigation\.state/,
  );
});

test("Orders restores the last complete view while inventory-only data refreshes", () => {
  const snapshot = createOrdersViewSnapshot(
    {
      departureLocation: { id: "depot-1" },
      deliveryCycle: { cutoffTime: "17:00" },
      orders: [{ id: "order-1" }],
      ordersCacheKey: "shop-a",
      ordersLoaded: true,
      routeGroups: [{ id: "group-1" }],
      shopLocalDate: "2026-07-30",
      shopTimeZone: "America/Toronto",
    },
    1_000,
  );
  const inventoryOnlyData = {
    inventories: [{ id: "inventory-2" }],
    orders: [],
    ordersCacheKey: "shop-a",
    ordersLoaded: false,
    routeGroups: [],
  };

  const restored = restoreOrdersViewSnapshot(
    inventoryOnlyData,
    snapshot,
    { now: 2_000 },
  );

  assert.equal(restored.restored, true);
  assert.deepEqual(restored.loaderData.orders, [{ id: "order-1" }]);
  assert.deepEqual(restored.loaderData.routeGroups, [{ id: "group-1" }]);
  assert.deepEqual(restored.loaderData.inventories, [{ id: "inventory-2" }]);
  assert.equal(restored.loaderData.ordersLoaded, true);
});

test("Orders never restores an expired or cross-shop view snapshot", () => {
  const snapshot = createOrdersViewSnapshot(
    {
      orders: [{ id: "order-1" }],
      ordersCacheKey: "shop-a",
      ordersLoaded: true,
    },
    1_000,
  );

  assert.equal(
    restoreOrdersViewSnapshot(
      {
        orders: [],
        ordersCacheKey: "shop-b",
        ordersLoaded: false,
      },
      snapshot,
      { now: 2_000 },
    ).restored,
    false,
  );
  assert.equal(
    restoreOrdersViewSnapshot(
      {
        orders: [],
        ordersCacheKey: "shop-a",
        ordersLoaded: false,
      },
      snapshot,
      { now: 2_000, ttlMs: 500 },
    ).restored,
    false,
  );
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

test("structured telemetry redacts sensitive nested values and raw identifiers", () => {
  const sanitized = sanitizeTelemetryValue({
    headers: {
      authorization: "Bearer secret-token",
      cookie: "session=secret",
      "x-shopify-hmac-sha256": "hmac-secret",
    },
    nested: {
      url: "https://admin.example/app/orders?id_token=secret#hash",
      customerEmail: "customer@example.com",
      phone: "+1 555 222 3333",
      rawPayload: { id: "gid://shopify/Order/1" },
      variables: { id: "gid://shopify/Order/1" },
    },
  });

  const serialized = JSON.stringify(sanitized);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("session=secret"), false);
  assert.equal(serialized.includes("hmac-secret"), false);
  assert.equal(serialized.includes("id_token"), false);
  assert.equal(serialized.includes("customer@example.com"), false);
  assert.equal(serialized.includes("+1 555 222 3333"), false);
  assert.equal(serialized.includes("gid://shopify/Order/1"), false);
  assert.equal(sanitizeRequestPath("https://admin.example/app/orders?id_token=secret"), "/app/orders");
  assert.match(hashShopIdentifier("KFood-Test.myshopify.com"), /^[a-f0-9]{16}$/);
});

test("structured telemetry keeps only allowlisted scalar metric fields", () => {
  assert.deepEqual(
    allowlistTelemetryMetric({
      authorization: "Bearer secret",
      durationMs: 12.34,
      name: "orders.loader",
      orderCount: 3,
      path: "/app/orders?id_token=secret",
      rawPayload: { order: 1 },
      requestId: "request-1",
      shop: "raw-shop.myshopify.com",
    }),
    {
      durationMs: 12.34,
      name: "orders.loader",
      orderCount: 3,
      path: "/app/orders",
      requestId: "request-1",
    },
  );
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
  assert.match(perfRouteSource, /metric\.name\.startsWith\("orders\."\)/);
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
