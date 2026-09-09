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
import RouteDetail from ${JSON.stringify(`${appDirectory}/app/routes/app.routes.$routeId.jsx`)};

window.fetch = async () => new Response(JSON.stringify({ errors: [{ message: "Fixture transport is disabled" }] }), {
  status: 503,
  headers: { "content-type": "application/json" },
});
const makeStop = (index) => ({
  address: { address1: index + " Fixture Street", city: "Toronto", countryCode: "CA", postalCode: "M5V 1A1", province: "ON" },
  deliveryStopId: "stop-" + index, itemCount: index, latitude: 43.64 + index / 1000,
  longitude: -79.39 - index / 1000, orderId: "order-" + index, orderName: "#FIX-" + index,
  recipientName: "Fixture customer " + index, sequence: index, status: "PENDING",
});
const fixtureStops = Array.from({ length: 6 }, (_, index) => makeStop(index + 1));
const makePlan = (id, name, index = 0) => ({
  createdAt: "2026-08-22T0" + index + ":00:00.000Z", deliveryDate: "2026-08-22",
  depot: { address: "Fixture depot", latitude: 43.65, longitude: -79.38, name: "Fixture depot" },
  driver: { displayName: ["Alex", "Blair", "Casey"][index] || "Unassigned", id: "driver-" + (index + 1) },
  id, itemSummary: { totalQuantity: (index + 1) * 3 }, name, planDate: "2026-08-22",
  routeMetrics: { distanceMeters: (index + 1) * 1000, durationSeconds: (index + 1) * 600 },
  scheduledStartAt: "2026-08-22T" + String(9 + index).padStart(2, "0") + ":00:00.000-04:00",
  scheduledStartTimeZone: "America/Toronto", status: "DRAFT", stops: index === 0 ? fixtureStops : [],
  stopsCount: index === 0 ? fixtureStops.length : index + 2,
  totalAmount: { amount: String((index + 1) * 25), currencyCode: "CAD" },
  updatedAt: "2026-08-22T0" + index + ":30:00.000Z",
});
const original = makePlan("route-original", "2026.08.22 All deliveries");
const copied = makePlan("route-copy", "2026.08.22 All deliveries Copy");
const savedPlans = [makePlan("saved-1", "North route", 0), makePlan("saved-2", "Downtown route", 1), makePlan("saved-3", "West route", 2)];
const makeGroup = (plans, id = "saved-group") => ({
  children: plans.map((routePlan, index) => ({ routeIdx: index + 1, routePlan, routePlanId: routePlan.id })),
  id, name: "Fixture saved membership", totalOrders: plans.reduce((total, routePlan) => total + (routePlan.stopsCount || 0), 0),
  updatedAt: "2026-08-22T03:30:00.000Z",
});
const singletonGroup = makeGroup([copied], "singleton-group");
const params = new URLSearchParams(location.search);
const mode = params.get("mode") || "ordinary";
const saveResult = params.get("save") || "complete";
if (mode === "bridge") copied.routeGroupingChild = { groupingId: singletonGroup.id, routePlanId: copied.id };
const detailData = (routePlan, routeGroup = null) => ({
  childRouteDetails: (routeGroup?.children || []).map(child => ({ routePlan: child.routePlan, stops: child.routePlan.stops || [] })),
  drivers: [], errors: [], ianaTimezone: "America/Toronto", routeGroup, routePlan,
  stops: routePlan?.stops || [], timezoneAbbreviation: "EDT",
});
let persistedPlans = [copied];
let persistedGroup = singletonGroup;
let nextRouteIdx = 2;
const fixtureAction = async ({ request }) => {
  const formData = await request.formData();
  const intent = formData.get("_intent");
  if (intent === "queryNextRouteIdx") {
    const result = { errors: [], nextRouteIdx, tempId: formData.get("tempId") };
    nextRouteIdx += 1;
    return result;
  }
  if (intent !== "saveRouteDraft") return { errors: [{ message: "Fixture accepts route-index queries and draft saves only" }] };
  const draft = JSON.parse(String(formData.get("draft") || "{}"));
  const responsePlans = (draft.routes || []).map((route, index) => ({
    ...savedPlans[index], id: route.routePlanId || "saved-temp-" + (index + 1),
    name: route.label || savedPlans[index].name,
    routeGroupingChild: { groupingId: singletonGroup.id, routePlanId: route.routePlanId || "saved-temp-" + (index + 1) },
    stops: route.orderIds.map((orderId) => fixtureStops.find((stop) => stop.orderId === orderId)).filter(Boolean),
    stopsCount: route.orderIds.length,
  }));
  const responseGroup = makeGroup(saveResult === "incomplete" ? responsePlans.slice(0, 2) : responsePlans, singletonGroup.id);
  if (saveResult === "complete") {
    persistedPlans = responsePlans;
    persistedGroup = responseGroup;
  }
  return saveResult === "error" ? { errors: [{ message: "Synthetic save failure" }], routeGroup: persistedGroup } : { errors: [], routeGroup: responseGroup };
};
const listLoader = () => mode === "saved"
  ? { errors: [], routeGroups: [makeGroup(savedPlans)], routePlans: savedPlans }
  : mode === "singleton"
    ? { errors: [], routeGroups: [singletonGroup], routePlans: [copied] }
    : mode === "bridge"
      ? { errors: [], routeGroups: [persistedGroup], routePlans: [original] }
      : { errors: [], routeGroups: [], routePlans: [original, copied] };
const router = createMemoryRouter([{
  id: "routes/app", path: "/", loader: () => ({ language: "en" }), children: [
    { path: "app/routes", loader: listLoader, element: React.createElement(RoutesPage) },
    { path: "app/routes/:routeId", loader: ({ params: routeParams }) => {
      const selectedPlan = persistedPlans.find((routePlan) => routePlan.id === routeParams.routeId) || copied;
      return detailData(selectedPlan, mode === "bridge" ? persistedGroup : null);
    }, action: fixtureAction, element: React.createElement(RouteDetail) },
    { path: "app/routes/groups/:routeGroupId/routes/:routeId", loader: ({ params: routeParams }) => {
      const selectedPlan = persistedPlans.find((routePlan) => routePlan.id === routeParams.routeId) || copied;
      return detailData(selectedPlan, persistedGroup);
    }, action: fixtureAction, element: React.createElement(RouteDetail) },
  ],
}], { initialEntries: [mode === "saved" || mode === "singleton" ? "/app/routes" : "/app/routes/route-copy"] });
createRoot(document.getElementById("app")).render(React.createElement(RouterProvider, { router }));
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
  response.end(`<!doctype html><html><head><title>Routes split-on-save fixture</title><link rel="stylesheet" href="/global.css"></head><body style="font-family:Arial;margin:0"><aside style="background:#fff4cc;padding:8px;position:sticky;top:0;z-index:1000">Local synthetic fixture · network and production mutations disabled · <a href="/?mode=ordinary">ordinary</a> · <a href="/?mode=bridge&save=complete">bridge complete</a> · <a href="/?mode=bridge&save=incomplete">bridge incomplete</a> · <a href="/?mode=bridge&save=error">bridge error</a> · <a href="/?mode=singleton">saved singleton</a> · <a href="/?mode=saved">saved 3-member list</a></aside><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>`);
});
server.listen(port, "127.0.0.1", () => console.log(`Routes split fixture ready at http://127.0.0.1:${port}/?mode=ordinary`));
