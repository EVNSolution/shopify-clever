#!/usr/bin/env node
/* eslint-env node */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, "..");
const require = createRequire(`${appDirectory}/package.json`);
const { build } = require("esbuild");
const bundlePath = "/tmp/orders-table-browser-fixture.js";
const portArgumentIndex = process.argv.indexOf("--port");
const port = portArgumentIndex >= 0 ? Number(process.argv[portArgumentIndex + 1]) : 43827;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid port: ${port}`);
}

const entry = String.raw`
import React from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import OrdersPage from "./app/features/orders/orders-page.jsx";
import { mapCanonicalOrdersToOrderRows } from "./app/features/orders/canonical-orders.js";
import { shouldRevalidateOrdersRoute } from "./app/features/orders/orders-page.shared.js";
import { normalizeOrderNumberPrefix } from "./app/features/orders/order-number-search.js";

const PAGE_SIZE = 50;
const TOTAL_ORDERS = 123;
const paginationEnabled = new URLSearchParams(window.location.search).get("pagination") !== "off";
const allOrders = Array.from({ length: TOTAL_ORDERS }, (_value, index) => {
  const sequence = TOTAL_ORDERS - index;
  const orderNumber = 2300 + sequence;
  return {
    orderId: "delivery-order-" + sequence,
    shopifyOrderGid: "gid://shopify/Order/" + (900000 + sequence),
    shopifyOrderLegacyId: String(900000 + sequence),
    name: "#" + orderNumber,
    recipientName: "Sample Customer " + ((index % 4) + 1),
    ...(index === 1 ? { phone: "2335" } : {}),
    shippingAddress: {
      address1: index === 0 ? "2335 Fixture Street" : (100 + sequence) + " Fixture Street",
      city: ["Toronto", "Oakville", "London"][index % 3],
      provinceCode: "ON",
      zip: "M4P " + String(100 + sequence).slice(-3),
    },
    orderCreatedAt: new Date(Date.UTC(2026, 9, 6, 15, 0, 0) - index * 60000).toISOString(),
    deliveryDate: "2026-10-10",
    deliveryDayRaw: "SATURDAY",
    deliveryArea: ["Toronto", "Oakville", "London"][index % 3],
    fulfillmentStatus: "UNFULFILLED",
    financialStatus: index % 5 === 0 ? "PENDING" : "PAID",
    serviceType: "DELIVERY",
    totalPriceAmount: String(40 + sequence) + ".00",
    currencyCode: "CAD",
    items: [{ name: "Fixture item", quantity: (index % 6) + 1 }],
    latitude: 43.62 + (index % 10) * 0.01,
    longitude: -79.48 + (index % 12) * 0.01,
    hasCoordinates: true,
    planningStatus: "unplanned",
    ...(sequence === 60 ? { cancelledAt: "2026-10-06T12:00:00.000Z" } : {}),
  };
});

const toRows = (orders) => mapCanonicalOrdersToOrderRows(orders, "America/Toronto");
const matchingOrders = (filters = {}) => {
  const query = normalizeOrderNumberPrefix(filters.orderNumberPrefix ?? filters.search).toLowerCase();
  const areas = new Set((Array.isArray(filters.areas) ? filters.areas : filters.areas ? [filters.areas] : []).map(String));
  return allOrders.filter((order) => {
    const matchesSearch = !query || normalizeOrderNumberPrefix(order.name).toLowerCase().startsWith(query);
    return matchesSearch && (areas.size === 0 || areas.has(order.deliveryArea));
  });
};
const pageResponse = ({ page = 1, filters = {}, requestKey = null } = {}) => {
  const matches = matchingOrders(filters);
  const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const rows = toRows(paginationEnabled ? matches.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) : matches);
  return {
    rows,
    pageInfo: {
      currentPage,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1,
      startCursor: currentPage > 1 ? "page-" + (currentPage - 1) : null,
      endCursor: currentPage < totalPages ? "page-" + (currentPage + 1) : null,
      readWatermark: "2026-10-06T14:34:11.000Z",
    },
    result: { count: matches.length, countPrecision: "exact" },
    freshness: { resultGeneratedAt: "2026-10-06T14:34:11.000Z" },
    errors: [],
    _requestKey: requestKey,
  };
};

const initialPage = pageResponse();
const fixtureActions = [];
const recordFixtureAction = (resource, payload) => {
  fixtureActions.push({ resource, payload });
  queueMicrotask(() => {
    const status = document.getElementById("fixture-status");
    if (status) status.textContent = fixtureActions.map((action) => {
      const areas = action.payload?.filters?.areas;
      const areaLabel = Array.isArray(areas) ? areas.join("+") : areas || "all-areas";
      return action.resource + ":" + (action.payload?.filters?.search ?? "all") + ":" + areaLabel + ":" + (action.payload?.page ?? "1");
    }).join(" · ");
  });
};
const createLoaderData = (pageData) => ({
  ...pageData,
  orders: pageData.rows,
  pageResult: pageData.result,
  ordersLoaded: true,
  inventories: [],
  routeGroups: [{ id: "fixture-group", name: "Fixture route group", routes: [] }],
  errors: [],
  departureLocation: {
    hasCoordinates: true,
    coordinates: [-79.3832, 43.6532],
    address: "Fixture depot",
  },
  deliveryCycle: null,
  featureFlags: {
    autoSyncOrdersOnLoad: false,
    backgroundReconciliation: false,
    compactMap: true,
    pagination: paginationEnabled,
    performanceCapture: false,
    selectionSnapshots: true,
  },
  needsSessionTokenRefresh: false,
  ordersCacheKey: "fixture-store.myshopify.com",
  perf: null,
  shopLocalDate: "2026-10-06",
  shopTimeZone: "America/Toronto",
});
const loaderData = createLoaderData(initialPage);

async function readPayload(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return request.json();
  const formData = await request.formData();
  return Object.fromEntries(formData);
}

async function pageAction({ request }) {
  const payload = await readPayload(request);
  recordFixtureAction("page", payload);
  return pageResponse({
    page: payload.page,
    filters: payload.filters,
    requestKey: payload._requestKey,
  });
}

async function facetsAction({ request }) {
  const payload = await readPayload(request);
  recordFixtureAction("facets", payload);
  const count = matchingOrders(payload.filters).length;
  return {
    _requestKey: payload._requestKey,
    countPrecision: "exact",
    totalCount: count,
    facets: {
      areas: ["Toronto", "Oakville", "London"].map((value) => ({ value, count: Math.ceil(count / 3) })),
      serviceTypes: [{ value: "DELIVERY", count }],
      deliveryProgress: [{ value: "unplanned", count }],
      fulfillmentStatuses: [{ value: "UNFULFILLED", count }],
      paymentStatuses: [{ value: "PAID", count: Math.floor(count * 0.8) }, { value: "PENDING", count: Math.ceil(count * 0.2) }],
    },
    errors: [],
  };
}

async function mapAction({ request }) {
  const payload = await readPayload(request);
  recordFixtureAction("map", payload);
  const points = matchingOrders(payload.filters).slice(0, 1000).map((order) => ({
    id: order.shopifyOrderGid,
    orderId: order.orderId,
    name: order.name,
    latitude: order.latitude,
    longitude: order.longitude,
  }));
  return { _requestKey: payload._requestKey, points, errors: [] };
}

async function routeGroupsAction({ request }) {
  const payload = await readPayload(request);
  return {
    _requestKey: payload._requestKey,
    routeGroups: loaderData.routeGroups,
    errors: [],
  };
}

let frozenSelectionFilters = {};
async function selectionAction({ request }) {
  const payload = await readPayload(request);
  const requestKey = payload._requestKey;
  const exclusions = JSON.parse(payload.excludeOrderIds || "[]");
  if (request.method.toUpperCase() === "PATCH") {
    recordFixtureAction("selection-patch", {
      ...payload,
      filters: frozenSelectionFilters,
    });
    const selectedCount = matchingOrders(frozenSelectionFilters).filter((order) =>
      !order.cancelledAt && !exclusions.includes(order.orderId)
    ).length;
    return {
      _requestKey: requestKey,
      _selectionOperation: "replace",
      selectedCount,
      expiresAt: "2026-10-07T00:00:00.000Z",
      errors: [],
    };
  }
  const filters = JSON.parse(payload.filters || "{}");
  recordFixtureAction("selection", { ...payload, filters });
  frozenSelectionFilters = filters;
  const selectedCount = matchingOrders(filters).filter((order) =>
    !order.cancelledAt && !exclusions.includes(order.orderId)
  ).length;
  return {
    _requestKey: requestKey,
    selectionToken: "fixture-selection-token",
    selectedCount,
    expiresAt: "2026-10-07T00:00:00.000Z",
    errors: [],
  };
}

const Root = () => React.createElement(Outlet);
const router = createMemoryRouter([{
  id: "routes/app",
  path: "/app",
  loader: () => ({ language: "en", ianaTimezone: "America/Toronto" }),
  element: React.createElement(Root),
  children: [{
    path: "orders",
    loader: ({ request }) => {
      const params = new URL(request.url).searchParams;
      const pageData = pageResponse({ filters: { search: params.get("search") ?? "", areas: params.getAll("areas") } });
      return { ordersPageData: Promise.resolve(createLoaderData(pageData)) };
    },
    shouldRevalidate: shouldRevalidateOrdersRoute,
    element: React.createElement(OrdersPage),
  }, {
    path: "orders/page",
    action: pageAction,
  }, {
    path: "orders/facets",
    action: facetsAction,
  }, {
    path: "orders/map-points",
    action: mapAction,
  }, {
    path: "orders/route-groups",
    action: routeGroupsAction,
  }, {
    path: "orders/selection-snapshots",
    action: selectionAction,
  }],
}], { initialEntries: ["/app/orders?filterVersion=2"] });

window.__ordersFixture = { actions: fixtureActions, allOrders, pageResponse };
createRoot(document.getElementById("app")).render(React.createElement(RouterProvider, { router }));
`;

const appBridgeStub = `
const appBridge = { idToken: async () => "fixture-token", toast: { show() {} } };
export const useAppBridge = () => appBridge;
`;

const mapPackageStub = `
class FixtureMap {
  constructor() { this.handlers = new Map(); this.canvas = { style: {} }; }
  on(type, layerOrHandler, maybeHandler) {
    const handler = typeof layerOrHandler === "function" ? layerOrHandler : maybeHandler;
    this.handlers.set(type, handler);
    if (type === "load") setTimeout(() => handler({ type: "load" }), 0);
  }
  off() {}
  remove() {}
  resize() {}
  flyTo() {}
  jumpTo() {}
  getZoom() { return 9; }
  getCanvas() { return this.canvas; }
  getSource() { return null; }
  addSource() {}
  getLayer() { return null; }
  addLayer() {}
  isStyleLoaded() { return true; }
  hasImage() { return true; }
  addImage() {}
}
class Marker {
  setLngLat() { return this; }
  addTo() { return this; }
  remove() {}
}
export class Protocol { tile() {} }
export default { Map: FixtureMap, Marker, addProtocol() {} };
`;

await build({
  stdin: { contents: entry, loader: "jsx", resolveDir: appDirectory },
  bundle: true,
  define: {
    "import.meta.env.DEV": "false",
    "process.env.NODE_ENV": '"production"',
  },
  format: "esm",
  jsx: "automatic",
  outfile: bundlePath,
  platform: "browser",
  plugins: [{
    name: "orders-fixture-stubs",
    setup(builder) {
      builder.onResolve({ filter: /^@shopify\/app-bridge-react$/ }, () => ({ path: "app-bridge", namespace: "fixture" }));
      builder.onLoad({ filter: /^app-bridge$/, namespace: "fixture" }, () => ({ contents: appBridgeStub }));
      builder.onResolve({ filter: /^(maplibre-gl|pmtiles)$/ }, () => ({ path: "map-package", namespace: "fixture" }));
      builder.onLoad({ filter: /^map-package$/, namespace: "fixture" }, () => ({ contents: mapPackageStub }));
      builder.onResolve({ filter: /\.server(?:\.[cm]?[jt]sx?)?$/ }, () => ({ path: "server-module", namespace: "fixture" }));
      builder.onLoad({ filter: /^server-module$/, namespace: "fixture" }, () => ({ contents: "export default {};" }));
    },
  }],
});

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  response.setHeader("cache-control", "no-store");
  if (requestUrl.pathname === "/fixture.js") {
    response.setHeader("content-type", "text/javascript");
    response.end(readFileSync(bundlePath));
    return;
  }
  if (requestUrl.pathname === "/global.css") {
    response.setHeader("content-type", "text/css");
    response.end(readFileSync(resolve(appDirectory, "app/styles/global.css")));
    return;
  }
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Orders search and selection fixture</title>
    <link rel="stylesheet" href="/global.css">
  </head>
  <body style="font-family:Arial,sans-serif;margin:0;background:#f6f6f7">
    <aside style="background:#fff4cc;border-bottom:1px solid #d6c67c;padding:8px 12px;position:sticky;top:0;z-index:10000">
      <strong>Local synthetic Orders fixture</strong>
      · 123 generated orders
      · no external requests or production mutations
      · try <code>#2301</code>, page 2, page selection, and Select all 123 orders
      <div id="fixture-status" style="font-size:12px;margin-top:4px">No resource actions yet</div>
    </aside>
    <div id="app"></div>
    <script type="module" src="/fixture.js"></script>
  </body>
</html>`);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Orders table fixture ready at http://127.0.0.1:${port}/`);
});
