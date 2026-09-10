/* eslint-env node */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, "..");
const require = createRequire(`${appDirectory}/package.json`);
const { build } = require("esbuild");
const bundlePath = "/tmp/routes-split-browser-fixture.js";
const portArgumentIndex = process.argv.indexOf("--port");
const port = portArgumentIndex >= 0 ? Number(process.argv[portArgumentIndex + 1]) : 43819;

const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import RoutesPage from ${JSON.stringify(`${appDirectory}/app/routes/app.routes.jsx`)};
import RouteDetail, { shouldRevalidate as shouldRevalidateRouteDetail } from ${JSON.stringify(`${appDirectory}/app/routes/app.routes.$routeId.jsx`)};

const fetchFixtureAsset = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url, window.location.href);
  const method = init?.method ?? (typeof input === "string" ? "GET" : input.method) ?? "GET";
  if (url.origin === "https://cdn.shopify.com" && method.toUpperCase() === "GET") {
    return fetchFixtureAsset(input, init);
  }
  return new Response(JSON.stringify({ errors: [{ message: "Fixture transport is disabled" }] }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
};
const makeStop = (index, prefix = "source") => ({
  address: { address1: index + " Fixture Street", city: "Toronto", countryCode: "CA", postalCode: "M5V 1A1", province: "ON" },
  deliveryStopId: prefix + "-stop-" + index, itemCount: index, latitude: 43.64 + index / 1000,
  longitude: -79.39 - index / 1000, orderId: prefix + "-order-" + index, orderName: "#FIX-" + index,
  recipientName: "Fixture customer " + index, sequence: index, status: "PENDING",
  shopifyOrderId: "gid://shopify/Order/fixture-" + index,
});
const fixtureStops = Array.from({ length: 6 }, (_, index) => makeStop(index + 1));
const copiedFixtureStops = Array.from({ length: 6 }, (_, index) => makeStop(index + 1, "copy-virtual"));
const makePlan = (id, name, index = 0) => ({
  createdAt: "2026-08-22T0" + index + ":00:00.000Z", deliveryDate: "2026-08-22",
  depot: { address: "Fixture depot", latitude: 43.65, longitude: -79.38, name: "Fixture depot" },
  driver: { displayName: ["Alex", "Blair", "Casey"][index] || "Unassigned", id: "driver-" + (index + 1) },
  id, itemSummary: { totalQuantity: (index + 1) * 3 }, name, planDate: "2026-08-22",
  routeMetrics: { distanceMeters: (index + 1) * 1000, durationSeconds: (index + 1) * 600 },
  scheduledStartAt: "2026-08-22T" + String(9 + index).padStart(2, "0") + ":00:00.000-04:00",
  scheduledStartTimeZone: "America/Toronto", status: "READY", stops: index === 0 ? fixtureStops : [],
  stopsCount: index === 0 ? fixtureStops.length : index + 2,
  totalAmount: { amount: String((index + 1) * 25), currencyCode: "CAD" },
  updatedAt: "2026-08-22T0" + index + ":30:00.000Z",
});
const original = makePlan("route-original", "2026.08.22 All deliveries");
const copied = {
  ...makePlan("route-copy", "2026.08.22 All deliveries Copy"),
  driver: null,
  executionProgress: null,
  stops: copiedFixtureStops,
  stopsCount: copiedFixtureStops.length,
  updatedAt: "2026-08-22T04:30:00.000Z",
  vehicle: null,
};
const savedPlans = [makePlan("saved-1", "North route", 0), makePlan("saved-2", "Downtown route", 1), makePlan("saved-3", "West route", 2)];
const makeGroup = (plans, id = "saved-group") => ({
  children: plans.map((routePlan, index) => ({ routeIdx: index + 1, routePlan, routePlanId: routePlan.id })),
  id, name: "Fixture saved membership", totalOrders: plans.reduce((total, routePlan) => total + (routePlan.stopsCount || 0), 0),
  updatedAt: "2026-08-22T03:30:00.000Z",
});
const singletonGroup = makeGroup([copied], "singleton-group");
const params = new URLSearchParams(location.search);
const mode = params.get("mode") || "ordinary";
const unassignedStops = Array.from({ length: 42 }, (_, index) => makeStop(index + 1, "group"));
const unassignedPlans = [44, 46, 47, 48].map((routeIdx, index) => ({
  ...makePlan("route-" + routeIdx, "#" + routeIdx, index),
  stops: index === 0 ? unassignedStops.slice(0, 41) : [],
  stopsCount: index === 0 ? 41 : 0,
}));
const unassignedGroup = { ...makeGroup(unassignedPlans, "unassigned-group"), assignments: unassignedStops, totalOrders: 42 };
const copyResult = params.get("copy") || "complete";
const saveResult = params.get("save") || "complete";
if (mode === "bridge") copied.routeGroupingChild = { groupingId: singletonGroup.id, routePlanId: copied.id };
const detailData = (routePlan, routeGroup = null) => ({
  childRouteDetails: (routeGroup?.children || []).map(child => ({ routePlan: child.routePlan, stops: child.routePlan.stops || [] })),
  drivers: [], errors: [], ianaTimezone: "America/Toronto", routeGroup, routePlan,
  stops: routePlan?.stops || [], timezoneAbbreviation: "EDT",
});
let persistedPlans = mode === "bridge" ? [copied] : [original];
let persistedGroup = mode === "bridge" ? singletonGroup : null;
if (mode === "unassigned") { persistedPlans = unassignedPlans; persistedGroup = unassignedGroup; }
if (mode === "reference") {
  persistedPlans = [
    { ...makePlan("reference-north", "North route", 0), stops: fixtureStops.slice(0, 2), stopsCount: 2 },
    { ...makePlan("reference-south", "South route", 1), stops: fixtureStops.slice(2), stopsCount: 4 },
  ];
  persistedGroup = { ...makeGroup(persistedPlans, "reference-group"), assignments: fixtureStops };
}
let totalActionSubmissions = 0;
let copySubmissions = 0;
let saveSubmissions = 0;
let addEmptyServerSubmissions = 0;
const originalSnapshot = JSON.stringify(original);
const renderFixtureStatus = () => {
  const status = document.getElementById("fixture-status");
  if (!status) return;
  const originalUnchanged = JSON.stringify(original) === originalSnapshot;
  status.textContent = "Total action submissions: " + totalActionSubmissions
    + " · Copy submissions: " + copySubmissions
    + " · Save submissions: " + saveSubmissions
    + " · Add Empty server submissions: " + addEmptyServerSubmissions
    + " · Original unchanged: " + (originalUnchanged ? "yes (6 stops)" : "NO");
};
const fixtureAction = async ({ request }) => {
  const formData = await request.formData();
  const intent = formData.get("_intent");
  totalActionSubmissions += 1;
  renderFixtureStatus();
  if (intent === "queryNextRouteIdx" || String(intent).toLowerCase().includes("addempty")) {
    addEmptyServerSubmissions += 1;
    renderFixtureStatus();
    return { errors: [{ message: "Add Empty must remain local in this fixture" }] };
  }
  if (intent === "copyRoutePlan") {
    copySubmissions += 1;
    renderFixtureStatus();
    if (String(formData.get("expectedRoutePlanUpdatedAt")) !== original.updatedAt) {
      return { errors: [{ message: "Synthetic stale copy revision" }] };
    }
    if (copyResult === "error") return { errors: [{ message: "Synthetic copy failure" }] };
    if (copyResult === "unknown") {
      return { errors: [{ message: "Synthetic copy outcome unknown" }], outcomeUnknown: true };
    }
    if (copyResult === "incomplete") return { errors: [], routePlan: { id: copied.id } };
    persistedPlans = [original, copied];
    persistedGroup = null;
    return { errors: [], routePlan: copied };
  }
  if (intent !== "saveRouteDraft") return { errors: [{ message: "Fixture accepts ordinary copy and draft save only" }] };
  saveSubmissions += 1;
  renderFixtureStatus();
  if (mode === "unassigned") {
    const draft = JSON.parse(String(formData.get("draft") || "{}"));
    const ids = (draft.routes || []).flatMap(route => route.orderIds);
    if (ids.length !== 42 || new Set(ids).size !== 42 || ids.some(id => !unassignedStops.some(stop => stop.orderId === id))) {
      return { errors: [{ message: "All 42 group orders must be assigned exactly once" }] };
    }
    if (draft.routes.length !== 4 || draft.routes.some(route => !unassignedPlans.some(plan => plan.id === route.routePlanId))) {
      return { errors: [{ message: "Unassigned must not be saved as a route" }] };
    }
    persistedPlans = draft.routes.map(route => ({ ...unassignedPlans.find(plan => plan.id === route.routePlanId),
      stops: route.orderIds.map(id => unassignedStops.find(stop => stop.orderId === id)), stopsCount: route.orderIds.length }));
    persistedGroup = { ...makeGroup(persistedPlans, "unassigned-group"), assignments: unassignedStops, totalOrders: 42 };
    return { errors: [], routeGroup: persistedGroup };
  }
  if (mode !== "bridge" && String(formData.get("expectedRoutePlanUpdatedAt")) !== copied.updatedAt) {
    return { errors: [{ message: "Synthetic stale split revision" }] };
  }
  const draft = JSON.parse(String(formData.get("draft") || "{}"));
  if (mode === "bridge" && draft.expectedUpdatedAt !== singletonGroup.updatedAt) {
    return { errors: [{ message: "Synthetic stale group revision" }] };
  }
  const draftRoutes = draft.routes || [];
  const hasCopiedFirst = draftRoutes[0]?.routePlanId === copied.id;
  const hasTwoTemporaryRoutes = draftRoutes.filter((route) => route.tempId && !route.routePlanId).length === 2;
  const allocatedOrderIds = draftRoutes.flatMap((route) => route.orderIds || []);
  const expectedOrderIds = copiedFixtureStops.map((stop) => stop.orderId).sort();
  const allocationIsExact = allocatedOrderIds.length === expectedOrderIds.length
    && [...new Set(allocatedOrderIds)].sort().join(",") === expectedOrderIds.join(",");
  if (!hasCopiedFirst || !hasTwoTemporaryRoutes || !allocationIsExact) {
    return { errors: [{ message: "Synthetic split requires copied child first, two temporary routes, and every copied order exactly once" }] };
  }
  const savedGroupId = mode === "bridge" ? singletonGroup.id : "ordinary-saved-group";
  const responsePlans = (draft.routes || []).map((route, index) => {
    const routePlanId = route.routePlanId || "saved-temp-" + (index + 1);
    const routeStops = route.orderIds
      .map((orderId) => copiedFixtureStops.find((stop) => stop.orderId === orderId))
      .filter(Boolean);
    const driverId = route.driverId ?? null;
    return {
      ...savedPlans[index],
      driver: driverId ? { displayName: driverId, id: driverId } : null,
      driverId,
      id: routePlanId,
      itemSummary: {
        totalQuantity: routeStops.reduce((total, stop) => total + Number(stop.itemCount || 0), 0),
      },
      name: route.label || savedPlans[index].name,
      routeGroupingChild: { groupingId: savedGroupId, routePlanId },
      scheduledStartAt: route.scheduledStartAt === undefined ? copied.scheduledStartAt : route.scheduledStartAt,
      scheduledStartTimeZone: route.scheduledStartTimeZone === undefined
        ? copied.scheduledStartTimeZone
        : route.scheduledStartTimeZone,
      stops: routeStops,
      stopsCount: routeStops.length,
    };
  });
  const responseGroup = makeGroup(saveResult === "incomplete" ? responsePlans.slice(0, 2) : responsePlans, savedGroupId);
  if (saveResult === "complete") {
    persistedPlans = mode === "bridge" ? responsePlans : [original, ...responsePlans];
    persistedGroup = responseGroup;
  }
  if (saveResult === "error") return { errors: [{ message: "Synthetic save failure" }] };
  if (saveResult === "unknown") return { errors: [{ message: "Synthetic save outcome unknown" }], outcomeUnknown: true };
  return { errors: [], routeGroup: responseGroup };
};
const listLoader = () => mode === "saved"
  ? { errors: [], routeGroups: [makeGroup(savedPlans)], routePlans: savedPlans }
  : mode === "singleton"
    ? { errors: [], routeGroups: [singletonGroup], routePlans: [copied] }
    : mode === "bridge"
      ? { errors: [], routeGroups: [persistedGroup], routePlans: [original] }
      : { errors: [], routeGroups: persistedGroup ? [persistedGroup] : [], routePlans: persistedPlans };
const initialPath = mode === "reference" ? "/app/routes/groups/reference-group" : mode === "unassigned" ? (params.get("child") === "1" ? "/app/routes/groups/unassigned-group/routes/route-46" : "/app/routes/groups/unassigned-group") : mode === "saved" || mode === "singleton" ? "/app/routes" : mode === "bridge" ? "/app/routes/route-copy" : "/app/routes/route-original";
const router = createMemoryRouter([{
  id: "routes/app", path: "/", loader: () => ({ language: "en" }), children: [
    { path: "app/routes", loader: listLoader, element: React.createElement(RoutesPage) },
    { path: "app/routes/groups/:routeGroupId", loader: () => detailData(null, persistedGroup),
      action: fixtureAction, shouldRevalidate: shouldRevalidateRouteDetail, element: React.createElement(RouteDetail) },
    { path: "app/routes/:routeId", loader: ({ params: routeParams }) => {
      const selectedPlan = persistedPlans.find((routePlan) => routePlan.id === routeParams.routeId) || original;
      return detailData(selectedPlan, mode === "bridge" ? persistedGroup : null);
    }, action: fixtureAction, shouldRevalidate: shouldRevalidateRouteDetail, element: React.createElement(RouteDetail) },
    { path: "app/routes/groups/:routeGroupId/routes/:routeId", loader: ({ params: routeParams }) => {
      const selectedPlan = persistedPlans.find((routePlan) => routePlan.id === routeParams.routeId) || copied;
      return detailData(selectedPlan, persistedGroup);
    }, action: fixtureAction, shouldRevalidate: shouldRevalidateRouteDetail, element: React.createElement(RouteDetail) },
  ],
}], { initialEntries: [params.get("notice") === "1" ? {
  pathname: initialPath,
  state: { scheduledNoticeRoutePlanIds: persistedPlans.map(plan => plan.id), scheduledNoticeRoutePlanId: persistedPlans[0]?.id },
} : initialPath] });
createRoot(document.getElementById("app")).render(React.createElement(RouterProvider, { router }));
renderFixtureStatus();
`;

const serverStubs = `
export const useAppBridge = () => ({ idToken: async () => "fixture-token", toast: { show() {} } });
export const authenticate = { admin: async () => ({}) };
export const boundary = { headers: () => ({}), error: () => null };
export const deleteDeliveryRoutePlan = () => {};
export const fetchDeliveryRoutePlans = () => {};
export const deleteDeliveryRouteGroup = () => {};
export const deleteDeliveryRouteGroupChildRoutes = () => {};
export const fetchDeliveryRouteGroups = () => {};
export const logStructuredMetric = () => {};
export const routeDetailLoader = () => {};
export const routeDetailAction = () => { throw new Error("Fixture server module is disabled"); };
`;

await build({
  stdin: { contents: entry, loader: "jsx", resolveDir: appDirectory }, bundle: true,
  define: { "process.env.NODE_ENV": '"production"' }, format: "esm", jsx: "automatic",
  outfile: bundlePath, platform: "browser",
  plugins: [{ name: "fixture-stubs", setup(builder) {
    builder.onResolve({ filter: /^(?:@shopify\/app-bridge-react|@shopify\/shopify-app-react-router\/server)$|\.server$/ }, () => ({ path: "server-stub", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: serverStubs }));
    builder.onResolve({ filter: /^(maplibre-gl|pmtiles)$/ }, () => ({ path: "map-stub", namespace: "fixture-map" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture-map" }, () => ({ contents: "export class Protocol { tile() {} }; class Map { on() {} remove() {} getSource() { return null } isStyleLoaded() { return false } }; export default { Map, addProtocol() {} };" }));
  } }],
});

const server = createServer((request, response) => {
  if (request.url === "/global.css") { response.setHeader("content-type", "text/css"); response.end(readFileSync(`${appDirectory}/app/styles/global.css`)); return; }
  if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(readFileSync(bundlePath)); return; }
  response.setHeader("cache-control", "no-store"); response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html><html><head><title>Routes split-on-save fixture</title><script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script><link rel="stylesheet" href="/global.css"></head><body style="font-family:Arial;margin:0"><aside style="background:#fff4cc;padding:8px;position:sticky;top:0;z-index:1000">Local synthetic fixture · network and production mutations disabled · <a href="/?mode=ordinary">ordinary complete</a> · <a href="/?mode=ordinary&copy=error">copy error</a> · <a href="/?mode=ordinary&copy=unknown">copy unknown</a> · <a href="/?mode=ordinary&copy=incomplete">copy incomplete</a> · <a href="/?mode=ordinary&save=incomplete">save incomplete</a> · <a href="/?mode=ordinary&save=error">save error</a> · <a href="/?mode=ordinary&save=unknown">save unknown</a> · <a href="/?mode=bridge&save=complete">existing group complete</a> · <a href="/?mode=singleton">saved singleton</a> · <a href="/?mode=saved">saved 3-member list</a><div id="fixture-status" style="margin-top:6px;font-weight:700">Total action submissions: 0 · Copy submissions: 0 · Save submissions: 0 · Add Empty server submissions: 0 · Original unchanged: yes (6 stops)</div></aside><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>`);
});
server.listen(port, "127.0.0.1", () => console.log(`Routes split fixture ready at http://127.0.0.1:${port}/?mode=ordinary`));
