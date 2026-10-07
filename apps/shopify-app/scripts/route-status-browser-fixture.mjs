/* eslint-env node */
// Local synthetic transport around the production Routes components. No API credentials are read.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, "..");
const require = createRequire(`${appDirectory}/package.json`);
const { build } = require("esbuild");
const portArgumentIndex = process.argv.indexOf("--port");
const port = portArgumentIndex >= 0 ? Number(process.argv[portArgumentIndex + 1]) : 43821;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid fixture port");
const bundlePath = resolve(tmpdir(), `route-status-browser-fixture-${port}.js`);

const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import RoutesPage, { shouldRevalidate as shouldRevalidateList } from ${JSON.stringify(`${appDirectory}/app/routes/app.routes.jsx`)};
import RouteDetail, { shouldRevalidate as shouldRevalidateDetail } from ${JSON.stringify(`${appDirectory}/app/routes/app.routes.$routeId.jsx`)};

const storageKey = "clever-route-status-fixture-v1";
const clone = value => JSON.parse(JSON.stringify(value));
const receivedAt = "2026-10-03T20:00:00.000Z";
const log = [];
const pendingSnapshots = [];
const pendingLoaders = [];
const snapshotHolds = new Set();
const loaderHolds = new Map();
const streams = new Set();
let nextRequestId = 1;
let router;
let saved;
try { saved = JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch { saved = null; }
let language = new URLSearchParams(location.search).get("lang") || saved?.language || "en";
if (!["en", "ko"].includes(language)) language = "en";

const record = (kind, details = {}) => {
  log.push({ sequence: log.length + 1, kind, ...details });
  renderFixtureStatus();
};
const makeStop = (routeId, index, status = "PENDING") => ({
  id: routeId + "-stop-" + index, deliveryStopId: routeId + "-stop-" + index,
  address: { address1: index + " Synthetic Road", city: "Toronto", province: "ON", postalCode: "M5V 1A1", countryCode: "CA" },
  currencyCode: "CAD", itemCount: 1, latitude: 43.65 + index / 10000, longitude: -79.38 - index / 10000,
  lineItems: [{ quantity: 1, sku: "SYN-" + index, title: "Synthetic item " + index }],
  orderId: routeId + "-order-" + index, orderName: "#SYN-" + String(index).padStart(3, "0"),
  recipientName: "Synthetic recipient " + index, sequence: index, serviceMinutes: 5,
  status, deliveryStopStatus: status, paymentStatus: "PAID", totalPriceAmount: "25.00",
  totalShippingPriceAmount: "5.00", totalShippingPriceCurrencyCode: "CAD", routePlanId: routeId,
});
const makePlan = (id, name, status, options = {}) => {
  const stopCount = options.stopCount ?? 3;
  const delivered = options.delivered ?? 0;
  const stops = Array.from({ length: stopCount }, (_, index) => makeStop(id, index + 1,
    index < delivered ? "DELIVERED" : options.arrived && index === stopCount - 1 ? "ARRIVED" : "PENDING"));
  return {
    id, name, status, ...options, stops, stopsCount: stops.length,
    createdAt: "2026-10-03T12:00:00.000Z", updatedAt: "2026-10-03T20:00:00.000Z",
    deliveryDate: "2026-10-03", planDate: "2026-10-03", deliveryAreas: ["Synthetic area"],
    depot: { address: "Synthetic depot", name: "Synthetic depot", latitude: 43.65, longitude: -79.38 },
    driver: { id: id + "-driver", displayName: "Synthetic driver" }, driverId: id + "-driver",
    itemSummary: { totalQuantity: stopCount }, totalAmount: { amount: String(stopCount * 25), currencyCode: "CAD" },
    routeMetrics: { distanceMeters: 25000, durationSeconds: 5400 },
    scheduledStartAt: "2026-10-03T13:00:00.000Z", scheduledStartTimeZone: "America/Toronto",
    routeEndMode: "RETURN_TO_DEPOT",
  };
};
const groupId = "synthetic-group";
let plans = [
  makePlan("route-incomplete", "Incomplete standalone", "INCOMPLETE", { stopCount: 11, delivered: 10, arrived: true }),
  makePlan("route-ready", "Ready standalone", "READY"),
  makePlan("route-progress", "In progress standalone", "IN_PROGRESS", { delivered: 1 }),
  makePlan("route-completed", "Completed standalone", "COMPLETED", { delivered: 3 }),
  makePlan("route-cancelled", "Cancelled standalone", "CANCELLED"),
  makePlan("route-unknown", "Unsupported standalone", "AWAITING_DRIVER"),
  makePlan("route-missing", "Missing state standalone", undefined),
  ...["DRAFT", "PUBLISHED", "OPTIMIZED", "ASSIGNED", "UNSTARTED", "CHANGED"].map(status =>
    makePlan("legacy-" + status.toLowerCase(), "Legacy " + status, status)),
  makePlan("route-grace", "Completed with return grace", "COMPLETED", {
    delivered: 3, executionStatus: "IN_PROGRESS", rawStatus: "IN_PROGRESS", displayStatus: "COMPLETED",
    displayState: "COMPLETED", returnNavigationGraceUntil: "2026-10-03T20:30:00.000Z",
  }),
  makePlan("route-race", "Race A", "IN_PROGRESS"),
  makePlan("route-b", "Race B", "READY"),
  makePlan("child-incomplete", "Incomplete child", "INCOMPLETE", {
    stopCount: 11, delivered: 10, arrived: true, routeGroupingChild: { groupingId: groupId, routePlanId: "child-incomplete" },
  }),
  makePlan("child-missing", "Missing state child", undefined, { routeGroupingChild: { groupingId: groupId, routePlanId: "child-missing" } }),
  makePlan("child-ready", "Ready child", "READY", { routeGroupingChild: { groupingId: groupId, routePlanId: "child-ready" } }),
];
if (saved?.plans) plans = saved.plans;
const persist = () => sessionStorage.setItem(storageKey, JSON.stringify({ language, plans }));
const planById = routeId => plans.find(plan => plan.id === routeId);
const makeGroup = () => {
  const children = plans.filter(plan => plan.routeGroupingChild?.groupingId === groupId).map((routePlan, index) => ({
    routeIdx: index + 1, routePlanId: routePlan.id, routePlan, displayStatus: routePlan.displayStatus ?? routePlan.status,
  }));
  return {
    id: groupId, name: "Synthetic group aggregate", status: "IN_PROGRESS", displayStatus: "IN_PROGRESS", displayState: "IN_PROGRESS",
    children, totalOrders: children.reduce((sum, child) => sum + child.routePlan.stopsCount, 0),
    assignments: children.flatMap(child => child.routePlan.stops), updatedAt: receivedAt,
  };
};
const makeProgressEvent = (routeId, eventType, eventId = "synthetic-" + eventType.toLowerCase()) => ({
  routePlanId: routeId, driverId: routeId + "-driver", eventId, eventType,
  occurredAt: "2026-10-03T13:05:00.000Z", receivedAt: "2026-10-03T13:05:01.000Z",
});
const makeSnapshot = (routeId, status = planById(routeId)?.status) => {
  const plan = planById(routeId);
  const deliveredIds = (plan?.stops || []).filter(stop => stop.deliveryStopStatus === "DELIVERED").map(stop => stop.deliveryStopId);
  const started = !["READY", "CANCELLED", undefined].includes(status);
  const completed = status === "COMPLETED";
  return {
    routePlanId: routeId, status: "NO_DATA", serverTime: plan?.updatedAt ?? receivedAt,
    operationalState: { routePlanId: routeId, routeStatus: status, displayState: status, updatedAt: plan?.updatedAt ?? receivedAt,
      executionStatus: plan?.executionStatus ?? status },
    executionEvidence: {
      routeEndMode: "RETURN_TO_DEPOT", schemaVersion: "route_execution_evidence.v1", timeSemantics: "EVENT_TIMESTAMPS_ONLY",
      start: started ? { eventId: routeId + "-started", occurredAt: "2026-10-03T13:05:00.000Z" } : null,
      completion: completed ? { eventId: routeId + "-completed", occurredAt: "2026-10-03T19:45:00.000Z" } : null,
      returnToDepot: { status: "UNCONFIRMED", source: "NONE", observedAt: null },
    },
    progress: { completedStopIds: deliveredIds, currentStage: completed ? "COMPLETED" : started ? "AT_STOP" : "READY",
      latestEvent: started ? makeProgressEvent(routeId, completed ? "ROUTE_COMPLETED" : "ROUTE_STARTED") : null },
    stopArrivals: (plan?.stops || []).filter(stop => stop.deliveryStopStatus === "ARRIVED").map(stop => ({
      routePlanId: routeId, deliveryStopId: stop.deliveryStopId, driverId: routeId + "-driver",
      eventId: stop.id + "-arrived", occurredAt: "2026-10-03T19:55:00.000Z",
    })), recentPositions: [],
  };
};
const detailData = (routePlan, routeGroup = null) => ({
  addOrderCandidates: [], childRouteDetails: (routeGroup?.children || []).map(child => ({ routePlan: child.routePlan, stops: child.routePlan.stops })),
  currentDepartureLocation: { address: "Synthetic depot", hasCoordinates: true, coordinates: [-79.38, 43.65] },
  drivers: [], errors: [], ianaTimezone: "America/Toronto", timezoneAbbreviation: "EDT", timezoneSource: "fixture",
  routePlan, routeGroup, routeMetrics: routePlan?.routeMetrics ?? null, stops: routePlan?.stops || [],
});
const listLoader = () => {
  record("list-loader");
  return clone({ errors: [], routeGroups: [makeGroup()], routePlans: plans, routeTimeZones: {} });
};
const detailLoader = async ({ params, request }) => {
  const routeId = params.routeId;
  const group = params.routeGroupId ? makeGroup() : null;
  const payload = clone(detailData(routeId ? planById(routeId) : null, group));
  const id = nextRequestId++;
  record("detail-loader", { id, routeId: routeId || groupId, status: payload.routePlan?.status });
  if (loaderHolds.has(routeId)) {
    const staleStatus = loaderHolds.get(routeId);
    loaderHolds.delete(routeId);
    if (payload.routePlan) {
      payload.routePlan.status = staleStatus;
      delete payload.routePlan.displayStatus;
      delete payload.routePlan.displayState;
    }
    return new Promise(resolve => {
      const pending = { id, routeId, payload, resolve };
      pendingLoaders.push(pending);
      request.signal.addEventListener("abort", () => record("loader-aborted", { id, routeId }), { once: true });
      record("loader-held", { id, routeId, status: payload.routePlan?.status });
    });
  }
  return payload;
};
const fixtureAction = async ({ request }) => {
  const form = await request.formData();
  record("blocked-action", { intent: String(form.get("_intent")) });
  return { errors: [{ message: "Synthetic fixture blocks all action submissions" }] };
};
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url, location.href);
  const method = (init?.method || input?.method || "GET").toUpperCase();
  const match = url.pathname.match(/^\\/app\\/route-tracking\\/([^/]+)$/);
  if (url.origin !== location.origin || method !== "GET" || !match) {
    record("blocked-network", { pathname: url.pathname, method });
    return Response.json({ errors: [{ message: "Fixture transport only accepts synthetic tracking reads" }] }, { status: 503 });
  }
  const routeId = decodeURIComponent(match[1]);
  const id = nextRequestId++;
  if (url.searchParams.get("mode") === "snapshot") {
    const payload = clone(makeSnapshot(routeId));
    record("snapshot-request", { id, routeId, status: payload.operationalState.routeStatus });
    if (snapshotHolds.delete(routeId)) {
      return new Promise(resolve => {
        pendingSnapshots.push({ id, routeId, payload, resolve });
        init?.signal?.addEventListener("abort", () => record("snapshot-aborted", { id, routeId }), { once: true });
        record("snapshot-held", { id, routeId });
      });
    }
    return Response.json({ data: { snapshot: payload } });
  }
  let streamRecord;
  const body = new ReadableStream({
    start(controller) {
      streamRecord = { id, routeId, controller, closed: false };
      streams.add(streamRecord);
      record("stream-open", { id, routeId });
      init?.signal?.addEventListener("abort", () => {
        if (!streamRecord.closed) { streamRecord.closed = true; controller.close(); }
        streams.delete(streamRecord);
        record("stream-aborted", { id, routeId });
      }, { once: true });
    },
    cancel() { streamRecord.closed = true; streams.delete(streamRecord); record("stream-cancelled", { id, routeId }); },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
};
const emit = (receiverRouteId, events) => {
  const chunk = events.map(({ event, data }) => "event: " + event + "\\ndata: " + JSON.stringify(data) + "\\n\\n").join("");
  let count = 0;
  for (const stream of streams) {
    if (stream.routeId !== receiverRouteId || stream.closed) continue;
    stream.controller.enqueue(new TextEncoder().encode(chunk)); count += 1;
  }
  record("sse-send", { receiverRouteId, eventCount: events.length, streamCount: count,
    events: events.map(({ event, data }) => ({ event, routePlanId: data.routePlanId, status: data.operationalState?.routeStatus, eventType: data.eventType })) });
  return count;
};
const terminal = (routeId = currentRouteId(), status = "INCOMPLETE", withLateEvents = false) => {
  const plan = planById(routeId);
  if (!plan) throw new Error("No synthetic route selected");
  const stale = makeSnapshot(routeId, "READY");
  plan.status = status; plan.displayStatus = status; plan.displayState = status;
  plan.updatedAt = "2026-10-03T20:05:00.000Z"; persist();
  const events = [{ event: "tracking_snapshot", data: makeSnapshot(routeId, status) }];
  if (withLateEvents) events.push(
    { event: "tracking_snapshot", data: stale },
    { event: "tracking_progress", data: makeProgressEvent(routeId, "ROUTE_STARTED", "late-start") },
    { event: "tracking_progress", data: makeProgressEvent(routeId, "ROUTE_PAUSED", "late-pause") },
    { event: "tracking_progress", data: makeProgressEvent(routeId, "ROUTE_PAUSED", "late-pause") },
  );
  return emit(routeId, events);
};
const currentRouteId = () => router?.state.matches.map(match => match.params.routeId).filter(Boolean).at(-1);
const openRoute = routeId => router.navigate(planById(routeId)?.routeGroupingChild
  ? "/app/routes/groups/" + groupId + "/routes/" + routeId : "/app/routes/" + routeId);
const releaseLoaders = (routeId) => {
  for (let index = pendingLoaders.length - 1; index >= 0; index -= 1) {
    const pending = pendingLoaders[index];
    if (routeId && pending.routeId !== routeId) continue;
    pendingLoaders.splice(index, 1); pending.resolve(pending.payload);
    record("loader-released", { id: pending.id, routeId: pending.routeId, status: pending.payload.routePlan?.status });
  }
};
const releaseSnapshots = (routeId, payloadRouteId) => {
  for (let index = pendingSnapshots.length - 1; index >= 0; index -= 1) {
    const pending = pendingSnapshots[index];
    if (routeId && pending.routeId !== routeId) continue;
    pendingSnapshots.splice(index, 1);
    const snapshot = payloadRouteId ? makeSnapshot(payloadRouteId) : pending.payload;
    pending.resolve(Response.json({ data: { snapshot } }));
    record("snapshot-released", { id: pending.id, routeId: pending.routeId, payloadRouteId: snapshot.routePlanId });
  }
};
const state = () => ({
  path: router?.state.location.pathname, routeId: currentRouteId(), language,
  pendingLoaders: pendingLoaders.map(({ id, routeId, payload }) => ({ id, routeId, status: payload.routePlan?.status })),
  pendingSnapshots: pendingSnapshots.map(({ id, routeId }) => ({ id, routeId })),
  streams: [...streams].map(({ id, routeId }) => ({ id, routeId })),
  statuses: plans.map(({ id, status, executionStatus, displayState }) => ({ id, status, executionStatus, displayState })),
  log: clone(log),
});
function renderFixtureStatus() {
  const target = document.getElementById("fixture-status");
  if (!target) return;
  target.textContent = (router?.state.location.pathname || location.pathname)
    + " · List reads " + log.filter(entry => entry.kind === "list-loader").length
    + " · Detail reads " + log.filter(entry => entry.kind === "detail-loader").length
    + " · Held loaders " + pendingLoaders.length + " · Held snapshots " + pendingSnapshots.length
    + " · Blocked actions " + log.filter(entry => entry.kind === "blocked-action").length;
  const history = document.getElementById("fixture-log");
  if (history) history.textContent = JSON.stringify(log.slice(-10), null, 2);
}

const detailRoute = path => ({ path, loader: detailLoader, action: fixtureAction,
  shouldRevalidate: shouldRevalidateDetail, element: React.createElement(RouteDetail) });
router = createBrowserRouter([{
  id: "routes/app", path: "/", loader: () => ({ language, ianaTimezone: "America/Toronto" }), children: [{
    id: "routes/app.routes", path: "app/routes", loader: listLoader, action: fixtureAction,
    shouldRevalidate: shouldRevalidateList, element: React.createElement(RoutesPage), children: [
      detailRoute("groups/:routeGroupId/routes/:routeId"), detailRoute("groups/:routeGroupId"), detailRoute(":routeId"),
    ],
  }],
}]);
router.subscribe(renderFixtureStatus);
window.routeStatusFixture = {
  state, navigate: path => router.navigate(path), openRoute, revalidate: () => router.revalidate(),
  deferNextSnapshot: routeId => { snapshotHolds.add(routeId); record("snapshot-hold-armed", { routeId }); },
  beginStaleLoader: (routeId = currentRouteId(), staleStatus = "READY") => { loaderHolds.set(routeId, staleStatus); router.revalidate(); },
  releaseLoaders, releaseSnapshots, emit, terminal,
  emitForeign: (receiverRouteId = currentRouteId(), payloadRouteId = "route-incomplete") => emit(receiverRouteId, [
    { event: "tracking_snapshot", data: makeSnapshot(payloadRouteId, "INCOMPLETE") },
    { event: "tracking_progress", data: makeProgressEvent(payloadRouteId, "ROUTE_COMPLETED", "foreign-completion") },
  ]),
  reset: () => { sessionStorage.removeItem(storageKey); location.href = "/app/routes/?lang=" + language; },
};
const select = document.getElementById("fixture-route");
for (const plan of plans) {
  const option = document.createElement("option"); option.value = plan.id; option.textContent = plan.name; select.append(option);
}
select.value = currentRouteId() || "route-incomplete";
document.getElementById("fixture-open").onclick = () => openRoute(select.value);
document.getElementById("fixture-finalize-selected").onclick = () => terminal(select.value);
document.getElementById("fixture-group").onclick = () => router.navigate("/app/routes/groups/" + groupId);
document.getElementById("fixture-list").onclick = () => router.navigate("/app/routes/");
document.getElementById("fixture-refresh").onclick = () => location.reload();
document.getElementById("fixture-reset").onclick = () => window.routeStatusFixture.reset();
document.getElementById("fixture-stale-loader").onclick = () => window.routeStatusFixture.beginStaleLoader();
document.getElementById("fixture-terminal").onclick = () => terminal(undefined, "INCOMPLETE", false);
document.getElementById("fixture-terminal-late").onclick = () => terminal(undefined, "INCOMPLETE", true);
document.getElementById("fixture-completed-late").onclick = () => {
  const routeId = currentRouteId();
  const plan = planById(routeId);
  plan.status = "COMPLETED"; persist();
  emit(routeId, ["ROUTE_COMPLETED", "STOP_ARRIVED", "ROUTE_STARTED"].map((eventType, index) => ({
    event: "tracking_progress", data: { ...makeProgressEvent(routeId, eventType, "batch-" + index),
      occurredAt: "2026-10-03T20:0" + index + ":00.000Z" },
  })));
};
document.getElementById("fixture-release-loader").onclick = () => releaseLoaders();
document.getElementById("fixture-defer-a").onclick = () => { window.routeStatusFixture.deferNextSnapshot("route-race"); openRoute("route-race"); };
document.getElementById("fixture-open-b").onclick = () => openRoute("route-b");
document.getElementById("fixture-release-snapshot").onclick = () => releaseSnapshots();
document.getElementById("fixture-foreign").onclick = () => window.routeStatusFixture.emitForeign();
const languageSelect = document.getElementById("fixture-language"); languageSelect.value = language;
languageSelect.onchange = () => { language = languageSelect.value; persist(); const url = new URL(location.href); url.searchParams.set("lang", language); location.href = url.toString(); };
window.addEventListener("error", event => record("browser-error", { message: event.message }));
window.addEventListener("unhandledrejection", event => record("browser-rejection", { message: String(event.reason) }));
createRoot(document.getElementById("app")).render(React.createElement(RouterProvider, { router }));
renderFixtureStatus();
`;

const serverStubs = `
const appBridge = { idToken: async () => "synthetic-fixture-token", toast: { show() {} } };
export const useAppBridge = () => appBridge;
export const authenticate = { admin: async () => ({}) };
export const boundary = { headers: () => ({}), error: () => null };
export const deleteDeliveryRoutePlan = () => {};
export const fetchDeliveryRoutePlans = () => {};
export const fetchShopifyDepartureLocation = () => {};
export const fetchRouteFallbackTimeZone = () => {};
export const resolveRouteListTimeZones = () => {};
export const deleteDeliveryRouteGroup = () => {};
export const deleteDeliveryRouteGroupChildRoutes = () => {};
export const fetchDeliveryRouteGroups = () => {};
export const logStructuredMetric = () => {};
export const routeDetailLoader = () => {};
export const routeDetailAction = () => { throw new Error("Fixture server action is disabled"); };
`;
const mapStubs = `
export class Protocol { tile() {} }
class Map {
  on() {} off() {} remove() {} getSource() { return null; } isStyleLoaded() { return false; }
}
export default { Map, addProtocol() {} };
`;

await build({
  stdin: { contents: entry, loader: "jsx", resolveDir: appDirectory }, bundle: true,
  define: { "process.env.NODE_ENV": '"production"' }, format: "esm", jsx: "automatic",
  outfile: bundlePath, platform: "browser",
  plugins: [{ name: "fixture-stubs", setup(builder) {
    builder.onResolve({ filter: /^(?:@shopify\/app-bridge-react|@shopify\/shopify-app-react-router\/server)$|\.server$/ }, () => ({ path: "server-stub", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: serverStubs }));
    builder.onResolve({ filter: /^(maplibre-gl|pmtiles)$/ }, () => ({ path: "map-stub", namespace: "fixture-map" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture-map" }, () => ({ contents: mapStubs }));
  } }],
});

const html = `<!doctype html><html lang="en"><head><title>Routes status synthetic fixture</title>
<script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script><link rel="stylesheet" href="/global.css">
<style>body{font-family:Arial;margin:0}#fixture-controls{background:#fff4cc;padding:8px;font-size:12px}#fixture-controls button,#fixture-controls select{margin:3px;padding:4px}#fixture-status{font-weight:700;margin:5px 0}#fixture-log{max-height:150px;overflow:auto;font-size:10px}#fixture-controls details{margin-top:4px}</style></head><body>
<aside id="fixture-controls" aria-label="Synthetic fixture controls">
<strong>Local synthetic fixture · Production Routes components · Synthetic tracking transport · Map and App Bridge stubs</strong>
<div><label>Language <select id="fixture-language"><option value="en">English</option><option value="ko">한국어</option></select></label>
<label>Route <select id="fixture-route"></select></label><button id="fixture-open">Open selected route</button>
<button id="fixture-finalize-selected">Finalize selected route before opening</button><button id="fixture-group">Open group aggregate</button><button id="fixture-list">Return to Routes (trailing slash)</button>
<button id="fixture-refresh">Page refresh</button><button id="fixture-reset">Reset synthetic data</button></div>
<div><button id="fixture-stale-loader">Hold stale detail loader</button><button id="fixture-terminal">Receive INCOMPLETE snapshot</button>
<button id="fixture-terminal-late">Receive INCOMPLETE + late duplicates</button><button id="fixture-release-loader">Release stale loader</button><button id="fixture-completed-late">Receive COMPLETED + later events</button>
<button id="fixture-defer-a">Hold A snapshot and open A</button><button id="fixture-open-b">Open B</button>
<button id="fixture-release-snapshot">Release held snapshots</button><button id="fixture-foreign">Receive foreign route payload</button></div>
<div id="fixture-status"></div><details><summary>Fixture request log and procedure</summary>
<p>Stale loader: Open Race A. Hold stale detail loader. Receive INCOMPLETE + late duplicates. Release stale loader.</p>
<p>Route scope: Reset data. Open B. Hold A snapshot and open A. Open B. Release held snapshots. Receive foreign route payload.</p>
<p>Group aggregate is IN_PROGRESS. Incomplete child is INCOMPLETE. Completed return grace has raw IN_PROGRESS and display COMPLETED.</p>
<pre id="fixture-log"></pre></details></aside><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  response.setHeader("cache-control", "no-store");
  if (url.pathname === "/global.css") { response.setHeader("content-type", "text/css"); response.end(readFileSync(`${appDirectory}/app/styles/global.css`)); return; }
  if (url.pathname === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(readFileSync(bundlePath)); return; }
  if (url.pathname === "/") { response.writeHead(302, { location: "/app/routes/" + url.search }); response.end(); return; }
  if (request.method !== "GET" || !url.pathname.startsWith("/app/routes")) {
    response.writeHead(404, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "Synthetic fixture endpoint not found" })); return;
  }
  response.setHeader("content-type", "text/html; charset=utf-8"); response.end(html);
});
server.listen(port, "127.0.0.1", () => console.log(`Route status fixture ready at http://127.0.0.1:${port}/app/routes/`));
