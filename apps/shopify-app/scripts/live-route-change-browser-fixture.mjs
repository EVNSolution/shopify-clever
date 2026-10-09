/* eslint-env node */
// Local synthetic transport around the production Routes components and list loader.
// No credentials, operational databases, driver devices, or provider writes are used.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createLiveRouteFixture, FIXTURE_IDS } from "./live-route-change-fixture-state.mjs";

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(`${appDirectory}/package.json`);
const { build } = require("esbuild");
const portArgument = process.argv.indexOf("--port");
const port = portArgument >= 0 ? Number(process.argv[portArgument + 1]) : 43822;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid fixture port");
const bundlePath = resolve(tmpdir(), `live-route-change-browser-fixture-${port}.js`);
const serverBundlePath = resolve(appDirectory, "node_modules/.cache", `live-route-change-list-fixture-${port}.mjs`);
const ids = { route: FIXTURE_IDS.route, group: FIXTURE_IDS.group, child: FIXTURE_IDS.child, ready: FIXTURE_IDS.ready };

const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import RoutesPage, { shouldRevalidate as shouldRevalidateList } from ${JSON.stringify(`${appDirectory}/app/routes/app.routes.jsx`)};
import RouteDetail, { shouldRevalidate as shouldRevalidateDetail } from ${JSON.stringify(`${appDirectory}/app/routes/app.routes.$routeId.jsx`)};
const ids = ${JSON.stringify(ids)};
const nativeFetch = window.fetch.bind(window);
const streams = new Set();
let router;
let language = new URLSearchParams(location.search).get("lang") || "en";
const record = (kind, detail = {}) => { void nativeFetch("/fixture/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, detail }) }); };
const readJSON = async (url, init) => { const response = await nativeFetch(url, init); return response.json(); };
const listLoader = async ({ request }) => {
  record("list-loader", { path: new URL(request.url).pathname });
  return readJSON("/fixture/list", { method: "POST", signal: request.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ requestUrl: request.url }) });
};
const detailLoader = async ({ params, request }) => {
  record("detail-loader", { pathId: params.routeId, groupId: params.routeGroupId });
  return readJSON("/fixture/detail?routeId=" + encodeURIComponent(params.routeId || "") + "&group=" + (params.routeId ? "0" : "1"), { signal: request.signal });
};
const fixtureAction = async ({ request }) => {
  const form = await request.formData();
  const response = await nativeFetch(new URL(request.url).pathname, { method: "POST", body: form, signal: request.signal });
  return response.json();
};
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  const method = (init?.method || input?.method || "GET").toUpperCase();
  if (url.origin !== location.origin) {
    record("blocked-external-request", { method, pathname: url.pathname });
    return Response.json({ error: { code: "FIXTURE_EXTERNAL_BLOCKED", message: "Synthetic fixture blocks external transport" } }, { status: 503 });
  }
  const tracking = url.pathname.match(/^\\/app\\/route-tracking\\/([^/]+)$/);
  if (tracking && method === "GET") {
    const routeId = decodeURIComponent(tracking[1]);
    if (url.searchParams.get("mode") === "snapshot") return nativeFetch("/fixture/tracking?routeId=" + encodeURIComponent(routeId), init);
    const stream = { routeId, controller: null, closed: false };
    const body = new ReadableStream({ start(controller) {
      stream.controller = controller; streams.add(stream);
      init?.signal?.addEventListener("abort", () => { if (!stream.closed) { stream.closed = true; controller.close(); } streams.delete(stream); }, { once: true });
    }, cancel() { stream.closed = true; streams.delete(stream); } });
    record("tracking-stream", { routeId });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  }
  if (/^\\/app\\/route-live-change\\/[^/]+$/.test(url.pathname) && ["GET", "POST"].includes(method)) return nativeFetch(input, init);
  if (/^\\/app\\/routes\\/[^/]+\\/cash-settlements$/.test(url.pathname) && method === "GET") return nativeFetch(input, init);
  if (url.pathname === "/perf") return Response.json({ ok: true });
  record("blocked-operational-request", { method, pathname: url.pathname });
  return Response.json({ error: { code: "FIXTURE_OPERATION_BLOCKED", message: "Only synthetic live-change transport is enabled" } }, { status: 503 });
};
async function emitSnapshot() {
  const response = await nativeFetch("/fixture/tracking?routeId=" + ids.route);
  const data = await response.json();
  const chunk = new TextEncoder().encode("event: tracking_snapshot\\ndata: " + JSON.stringify(data.data.snapshot) + "\\n\\n");
  for (const stream of streams) if (!stream.closed && stream.routeId === ids.route) stream.controller.enqueue(chunk);
}
async function state() { return readJSON("/state"); }
async function control(action, value) {
  await readJSON("/fixture/control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, value }) });
  if (["driver-current", "terminal"].includes(action)) await emitSnapshot();
  await showState();
}
async function showState() {
  const result = await state();
  document.getElementById("fixture-status").textContent = "Published " + result.counters.publications + " · Private revision " + result.revision
    + " · Dirty " + result.hasUnpublishedChanges + " · Current stop " + result.currentStopId.slice(-1)
    + " · Receipt replays " + result.counters.receiptReplays + " · Held reads " + result.heldReads + " · Held searches " + result.heldSearches;
  document.getElementById("fixture-log").textContent = JSON.stringify({ counters: result.counters, receipts: result.receipts, log: result.log.slice(-8) }, null, 2);
}
const detailRoute = path => ({ path, loader: detailLoader, action: fixtureAction, shouldRevalidate: shouldRevalidateDetail, element: React.createElement(RouteDetail) });
router = createBrowserRouter([{ id: "routes/app", path: "/", loader: () => ({ language, ianaTimezone: "America/Toronto", kfoodOfficeEnabled: true }), children: [{
  id: "routes/app.routes", path: "app/routes", loader: listLoader, action: fixtureAction, shouldRevalidate: shouldRevalidateList, element: React.createElement(RoutesPage), children: [
    detailRoute("groups/:routeGroupId/routes/:routeId"), detailRoute("groups/:routeGroupId"), detailRoute(":routeId"),
    { path: ":routeId/cash-settlements", action: fixtureAction },
  ],
}] }]);
router.subscribe(() => { void showState(); });
window.liveRouteChangeFixture = { state, control, revalidate: () => router.revalidate(), navigate: path => router.navigate(path), ids };
const paths = { direct: "/app/routes/" + ids.route, child: "/app/routes/groups/" + ids.group + "/routes/" + ids.child,
  group: "/app/routes/groups/" + ids.group, ready: "/app/routes/" + ids.ready, list: "/app/routes/" };
for (const [key, path] of Object.entries(paths)) document.getElementById("fixture-open-" + key).onclick = () => router.navigate(path);
for (const button of document.querySelectorAll("[data-fixture-action]")) button.onclick = () => {
  const value = button.dataset.fixtureValue;
  void control(button.dataset.fixtureAction, value === "true" ? true : value === "false" ? false : value);
};
document.getElementById("fixture-reset").onclick = async () => { await control("reset"); sessionStorage.clear(); location.href = paths.child; };
document.getElementById("fixture-revalidate").onclick = () => router.revalidate();
document.getElementById("fixture-refresh").onclick = () => location.reload();
document.getElementById("fixture-state").onclick = showState;
window.addEventListener("error", event => record("browser-error", { message: event.message }));
window.addEventListener("unhandledrejection", event => record("browser-rejection", { message: String(event.reason) }));
createRoot(document.getElementById("app")).render(React.createElement(RouterProvider, { router }));
void showState();
`;
const stubs = `
const appBridge = { idToken: async () => "synthetic-fixture-token", toast: { show() {} } };
export const useAppBridge = () => appBridge;
export const authenticate = { admin: async () => ({}) };
export const boundary = { headers: () => ({}), error: () => null };
export const deleteDeliveryRoutePlan = () => {};
export const fetchDeliveryRoutePlans = () => {};
export const getCleverAppId = () => "synthetic-browser";
export const fetchShopifyDepartureLocation = () => {};
export const fetchRouteFallbackTimeZone = () => {};
export const resolveRouteListTimeZones = () => {};
export const deleteDeliveryRouteGroup = () => {};
export const deleteDeliveryRouteGroupChildRoutes = () => {};
export const fetchDeliveryRouteGroups = () => {};
export const logStructuredMetric = () => {};
export const routeDetailLoader = () => {};
export const routeDetailAction = () => { throw new Error("Fixture only accepts synthetic commands"); };
`;
await build({ stdin: { contents: entry, loader: "jsx", resolveDir: appDirectory }, bundle: true, define: { "process.env.NODE_ENV": '"production"' },
  format: "esm", jsx: "automatic", outfile: bundlePath, platform: "browser", plugins: [{ name: "fixture-stubs", setup(builder) {
    builder.onResolve({ filter: /^(?:@shopify\/app-bridge-react|@shopify\/shopify-app-react-router\/server)$|\.server(?:\.js)?$/ }, () => ({ path: "server-stub", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: stubs }));
    builder.onResolve({ filter: /^(maplibre-gl|pmtiles)$/ }, () => ({ path: "map-stub", namespace: "fixture-map" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture-map" }, () => ({ contents: `export class Protocol { tile() {} } class Map { on() {} off() {} remove() {} getSource() { return null; } isStyleLoaded() { return false; } } export default { Map, addProtocol() {} };` }));
  } }] });

// Keep the real PR293 list refresh/cache behavior. Authentication and settings use synthetic values.
await build({ stdin: { contents: `export { loader } from ${JSON.stringify(`${appDirectory}/app/routes/app.routes.jsx`)}; export { invalidateDeliveryRouteResponseCache } from ${JSON.stringify(`${appDirectory}/app/features/delivery/route-plans.server.js`)};`, resolveDir: appDirectory },
  bundle: true, format: "esm", platform: "node", packages: "external", outfile: serverBundlePath, plugins: [{ name: "fixture-list-auth", setup(builder) {
    builder.onResolve({ filter: /shopify\.server$|shopify-locations\.server$|route-timezone\.server$|structured-telemetry\.server(?:\.js)?$|^@shopify\/shopify-app-react-router\/server$/ }, () => ({ path: "list-stub", namespace: "list-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "list-fixture" }, () => ({ contents: `
      export const authenticate = { admin: async () => ({ admin: {}, session: { shop: "synthetic-browser.myshopify.com" } }) };
      export const fetchShopifyDepartureLocation = async () => ({ departureLocation: null, errors: [] });
      export const fetchRouteFallbackTimeZone = async () => ({ ianaTimezone: "America/Toronto", errors: [] });
      export const resolveRouteListTimeZones = async () => ({});
      export const logStructuredMetric = () => {};
      export const createTelemetryRequestId = () => "synthetic-correlation";
      export const logSafeOperationalEvent = () => {};
      export const sanitizeRequestPath = value => value;
      export const boundary = { headers: () => ({}) };
    ` }));
  } }] });
const { loader: productionListLoader, invalidateDeliveryRouteResponseCache } = await import(serverBundlePath);
process.env.CLEVER_APP_ID = "synthetic-browser";
process.env.CLEVER_DELIVERY_API_URL = "http://synthetic-delivery.invalid";
process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "15000";
let fixture = createLiveRouteFixture();
let upstreamReads = 0;
let failedListReads = 0;
let clockNow = Date.now();
Date.now = () => clockNow;
globalThis.fetch = async (url, init) => {
  if (init.method !== "GET" || !url.startsWith(process.env.CLEVER_DELIVERY_API_URL)) throw new Error("Fixture blocks external transport");
  upstreamReads += 1;
  if (failedListReads > 0) { failedListReads -= 1; return Response.json({ error: { message: "Synthetic list read failed" } }, { status: 503 }); }
  return Response.json({ data: url.includes("route-groups") ? { routeGroups: [fixture.group()] } : { routePlans: [fixture.plan(), fixture.plan(true)] } });
};
const createCashReceipts = () => [
  { completion: { id: "cash-1", deliveryStopId: FIXTURE_IDS.stop(1), currencyCode: "CAD", payment: { methodTitle: "Cash" }, expectedAmount: "122.25", actualAmount: "122.00", differenceAmount: "-0.25" },
    revision: 0, settlement: null, history: [] },
  { completion: { id: "cash-2", deliveryStopId: FIXTURE_IDS.stop(2), currencyCode: "CAD", payment: { methodTitle: "Cash" }, expectedAmount: "20.00", actualAmount: "20.00", differenceAmount: "0.00" },
    revision: 1, settlement: { id: "settlement-1", confirmedAmount: "20.00", currency: "CAD", reason: "", actor: "Office QA", recordedAt: "2026-10-09T00:01:00Z" },
    history: [{ id: "settlement-1", confirmedAmount: "20.00", currency: "CAD", reason: "", actor: "Office QA", recordedAt: "2026-10-09T00:01:00Z" }] },
];
let cashReceipts = createCashReceipts();
let holdNextRead = false;
let holdNextSearch = false;
let failNextSearch = false;
let loseNextIntent = null;
const heldReads = [];
const heldSearches = [];
const status = () => ({ ...fixture.state(), upstreamReads, listCacheTtlMs: 15000, frozenListCacheClock: true,
  heldReads: heldReads.length, heldSearches: heldSearches.length, loseNextIntent, failNextSearch });
const release = (pending) => { for (const resolveHeld of pending.splice(0)) resolveHeld(); };
const sendJSON = (response, payload, code = 200) => { if (response.destroyed) return; response.writeHead(code, { "content-type": "application/json" }); response.end(JSON.stringify(payload)); };
const parseBody = async (request) => { const chunks = []; for await (const chunk of request) chunks.push(chunk); return Buffer.concat(chunks).toString(); };
const requestForm = (request, text) => new Request(`http://127.0.0.1:${port}${request.url}`, { method: "POST", headers: request.headers, body: text }).formData();
const tracking = (routeId) => {
  const plan = fixture.plan(routeId === FIXTURE_IDS.ready);
  return { routePlanId: routeId, status: "NO_DATA", serverTime: plan.updatedAt,
    operationalState: { routePlanId: routeId, routeStatus: plan.status, displayState: plan.status, executionStatus: plan.status, updatedAt: plan.updatedAt },
    progress: { completedStopIds: plan.stops.filter((stop) => stop.status === "DELIVERED").map((stop) => stop.deliveryStopId), currentStage: "AT_STOP", latestEvent: null },
    executionEvidence: { routeEndMode: "RETURN_TO_DEPOT", schemaVersion: "route_execution_evidence.v1", timeSemantics: "EVENT_TIMESTAMPS_ONLY",
      start: { eventId: "synthetic-start", occurredAt: "2026-10-07T13:00:00.000Z" }, completion: null, returnToDepot: { status: "UNCONFIRMED", source: "NONE", observedAt: null } },
    stopArrivals: plan.stops.filter((stop) => stop.status === "ARRIVED").map((stop) => ({ routePlanId: routeId, deliveryStopId: stop.deliveryStopId,
      driverId: "synthetic-driver", eventId: "synthetic-arrival", occurredAt: "2026-10-07T13:02:00.000Z" })), recentPositions: [] };
};
const controlButton = (label, action, value) => `<button data-fixture-action="${action}"${value === undefined ? "" : ` data-fixture-value="${value}"`}>${label}</button>`;
const html = `<!doctype html><html lang="en"><head><title>KFood live-change synthetic fixture</title>
<script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script><link rel="stylesheet" href="/global.css">
<style>body{font-family:Arial;margin:0}#fixture-controls{background:#fff4cc;padding:8px;font-size:12px}#fixture-controls button{margin:3px;padding:5px}#fixture-status{font-weight:700;margin:5px 0}#fixture-log{max-height:180px;overflow:auto;font-size:10px}#fixture-controls details{margin-top:4px}</style></head><body>
<aside id="fixture-controls" aria-label="Synthetic fixture controls"><strong>LOCAL SYNTHETIC DATA · Production Routes UI and list cache · No operational writes or driver push</strong>
<div><button id="fixture-open-child">Open child alias path</button><button id="fixture-open-direct">Open direct route</button><button id="fixture-open-group">Open group</button>
<button id="fixture-open-list">Return to Routes</button><button id="fixture-open-ready">Open READY regression</button><button id="fixture-revalidate">Reload latest loaders</button>
<button id="fixture-refresh">Page refresh</button><button id="fixture-reset">Reset synthetic data</button><button id="fixture-state">Read fixture evidence</button></div>
<details><summary>Conflict, transport, and timing controls</summary><div>
${controlButton("Driver makes stop 7 current", "driver-current", 7)}${controlButton("Other office saves revision", "admin-edit")}
${controlButton("Reassign driver", "assignment")}${controlButton("Deny route access", "forbidden", true)}${controlButton("Restore route access", "forbidden", false)}
${controlButton("Change app/shop/session scope", "scope")}${controlButton("Disable live-change gate", "enabled", false)}${controlButton("Enable synthetic gate", "enabled", true)}
${controlButton("Lose next Save response after commit", "lose", "liveChangeSave")}${controlButton("Lose next Dispatch response after commit", "lose", "liveChangeDispatch")}
${controlButton("Lose next Discard response after commit", "lose", "liveChangeDiscard")}${controlButton("Fail geometry and notification", "delivery-failure", true)}
${controlButton("Recover geometry and notification", "delivery-failure", false)}${controlButton("Fail next address search", "fail-search")}
${controlButton("Hold next address search", "hold-search")}${controlButton("Release held searches", "release-search")}
${controlButton("Hold next live read", "hold-read")}${controlButton("Release held reads", "release-read")}
${controlButton("Fail next list reads", "fail-list")}${controlButton("Finalize route INCOMPLETE", "terminal", "INCOMPLETE")}
</div><p>Child alias UUID differs from actual routePlan.id and group UUID. Save keeps the published route unchanged. Dispatch alone publishes. Current/completed stop IDs stay fixed.</p>
<p>Use fixture controls to create a conflict while office fields remain open. Exact command retries return immutable receipts. GET always returns current synthetic draft.</p>
<pre id="fixture-log"></pre></details><div id="fixture-status"></div></aside><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  response.setHeader("cache-control", "no-store");
  try {
    if (request.method === "GET" && url.pathname === "/state") { sendJSON(response, status()); return; }
    if (request.method === "POST" && url.pathname === "/fixture/log") {
      const { kind, detail } = JSON.parse(await parseBody(request)); fixture.record(kind, detail); sendJSON(response, {}); return;
    }
    if (request.method === "POST" && url.pathname === "/fixture/control") {
      const { action, value } = JSON.parse(await parseBody(request));
      if (action === "reset") { cashReceipts = createCashReceipts(); release(heldReads); release(heldSearches); fixture = createLiveRouteFixture(); clockNow += 15001; upstreamReads = 0; failedListReads = 0;
        holdNextRead = false; holdNextSearch = false; failNextSearch = false; loseNextIntent = null; }
      else if (action === "hold-read") holdNextRead = true;
      else if (action === "hold-search") holdNextSearch = true;
      else if (action === "fail-search") failNextSearch = true;
      else if (action === "lose") loseNextIntent = value;
      else if (action === "release-read") release(heldReads);
      else if (action === "release-search") release(heldSearches);
      else if (action === "fail-list") failedListReads = 2;
      else fixture.control(action, value);
      sendJSON(response, status()); return;
    }
    if (request.method === "GET" && url.pathname === "/fixture/detail") {
      sendJSON(response, fixture.detail(url.searchParams.get("routeId"), url.searchParams.get("group") === "1")); return;
    }
    if (request.method === "GET" && url.pathname === "/fixture/tracking") { sendJSON(response, { data: { snapshot: tracking(url.searchParams.get("routeId")) } }); return; }
    if (request.method === "POST" && url.pathname === "/fixture/list") {
      const input = JSON.parse(await parseBody(request));
      const result = await productionListLoader({ request: new Request(`http://127.0.0.1:${port}/app/routes${new URL(input.requestUrl).search}`, { headers: { authorization: "Bearer synthetic-browser" } }) });
      fixture.record("list-result", { upstreamReads, requested: result.routesRefresh?.requested, confirmed: result.routesRefresh?.confirmed,
        statuses: result.routePlans.map(({ id, status: planStatus }) => ({ id, status: planStatus })), errors: result.errors });
      sendJSON(response, result); return;
    }
    const liveEndpoint = url.pathname.match(/^\/app\/route-live-change\/([^/]+)$/);
    if (liveEndpoint && request.method === "GET") {
      if (decodeURIComponent(liveEndpoint[1]) !== FIXTURE_IDS.route) { sendJSON(response, { error: { code: "NOT_FOUND", message: "Actual routePlanId is required" } }, 404); return; }
      const result = fixture.read(url.searchParams.get("scopeKey"));
      if (holdNextRead) { holdNextRead = false; await new Promise((resolveHeld) => heldReads.push(resolveHeld)); }
      sendJSON(response, result.body, result.status); return;
    }
    if (liveEndpoint && request.method === "POST") {
      const form = await requestForm(request, await parseBody(request));
      const intent = String(form.get("intent") ?? form.get("_intent"));
      let result;
      if (decodeURIComponent(liveEndpoint[1]) !== FIXTURE_IDS.route || String(form.get("routePlanId")) !== FIXTURE_IDS.route) result = { status: 404, body: { error: { code: "NOT_FOUND", message: "Actual routePlanId is required" } } };
      else if (intent === "liveChangeGeocode") {
        result = fixture.geocode(JSON.parse(String(form.get("command"))), String(form.get("scopeKey")), failNextSearch); failNextSearch = false;
        if (holdNextSearch) { holdNextSearch = false; await new Promise((resolveHeld) => heldSearches.push(resolveHeld)); }
      } else result = fixture.command(intent, JSON.parse(String(form.get("command") ?? "{}")), String(form.get("scopeKey")));
      if (result.status === 200 && ["liveChangeSave", "liveChangeDispatch", "liveChangeDiscard"].includes(intent)) {
        invalidateDeliveryRouteResponseCache(new Request(`http://127.0.0.1:${port}${request.url}`, { headers: { authorization: "Bearer synthetic-browser" } }), { cacheKey: "synthetic-browser.myshopify.com" });
        fixture.record("production-list-cache-invalidated", { intent, ttlMs: 15000, clockExpired: false });
      }
      if (loseNextIntent === intent && result.status === 200) {
        loseNextIntent = null;
        result = fixture.loseCommittedResponse(intent, result);
      }
      sendJSON(response, result.body, result.status); return;
    }
    const cashEndpoint = url.pathname.match(/^\/app\/routes\/([^/]+)\/cash-settlements$/);
    if (cashEndpoint) {
      const routePlanId = decodeURIComponent(cashEndpoint[1]);
      const receipts = routePlanId === FIXTURE_IDS.route ? cashReceipts : [];
      if (request.method === "GET") { sendJSON(response, { routePlanId, receipts, errors: [] }); return; }
      const form = await requestForm(request, await parseBody(request));
      const receipt = cashReceipts.find((candidate) => candidate.completion.id === String(form.get("receiptId")));
      fixture.record("cash-command", { receiptId: String(form.get("receiptId")), amount: String(form.get("confirmedAmount")), reason: String(form.get("reason") ?? "") });
      if (!receipt) { sendJSON(response, { errors: [{ message: "Receipt not found." }] }); return; }
      if (Number(form.get("expectedRevision")) !== receipt.revision) { sendJSON(response, { errors: [{ message: "Another office user changed this receipt. Reload the page." }] }); return; }
      receipt.revision += 1;
      receipt.settlement = { id: `settlement-${receipt.revision}`, confirmedAmount: String(form.get("confirmedAmount")), currency: String(form.get("currency")), reason: String(form.get("reason") ?? ""), actor: "Office QA", recordedAt: "2026-10-09T00:02:00Z" };
      receipt.history.unshift(receipt.settlement);
      sendJSON(response, { routePlanId, receipts, saved: true, errors: [] }); return;
    }
    if (url.pathname === "/global.css") { response.setHeader("content-type", "text/css"); response.end(readFileSync(`${appDirectory}/app/styles/global.css`)); return; }
    if (url.pathname === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(readFileSync(bundlePath)); return; }
    if (url.pathname === "/") { response.writeHead(302, { location: `/app/routes/groups/${FIXTURE_IDS.group}/routes/${FIXTURE_IDS.child}` }); response.end(); return; }
    if (request.method === "GET" && url.pathname.startsWith("/app/routes")) { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(html); return; }
    sendJSON(response, { error: { code: "FIXTURE_OPERATION_BLOCKED", message: "Synthetic endpoint not found" } }, 404);
  } catch (error) { fixture.record("fixture-error", { message: String(error) }); sendJSON(response, { error: { code: "FIXTURE_ERROR", message: String(error) } }, 500); }
});
server.listen(port, "127.0.0.1", () => console.log(`Live-change fixture ready at http://127.0.0.1:${port}/ · Evidence: http://127.0.0.1:${port}/state`));
