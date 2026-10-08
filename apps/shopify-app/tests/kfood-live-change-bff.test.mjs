/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import vm from "node:vm";
import { createRequestHandler } from "react-router";
import {
  fetchKfoodLiveChange,
  geocodeKfoodLiveChange,
  getKfoodLiveChangeContext,
  handleKfoodLiveChangeAction,
  liveChangeJsonResponse,
  runKfoodLiveChangeCommand,
} from "../app/features/delivery/live-change.server.js";
import {
  clearDeliveryApiResponseCache,
  fetchDeliveryRoutePlanDetail,
  fetchDeliveryRoutePlans,
  primeDeliveryApiGetResponseCache,
} from "../app/features/delivery/route-plans.server.js";

process.env.CLEVER_DELIVERY_API_URL = "https://delivery.test";
process.env.CLEVER_APP_ID = "clever-route-kfood";
process.env.CLEVER_KFOOD_LIVE_CHANGE_ENABLED = "true";
process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "60000";

const routePlanId = "60000000-0000-4000-8000-000000000001";
const childId = "61000000-0000-4000-8000-000000000001";
const stopId = "70000000-0000-4000-8000-000000000007";
const session = { shop: "fixture.myshopify.com", id: "offline_fixture.myshopify.com" };
const request = () => new Request(`https://admin.test/app/routes/groups/group/routes/${childId}`, {
  headers: { authorization: "Bearer authenticated-fixture-token" },
});
const draft = () => ({
  routePlanId, revision: 1, assignmentGeneration: "2", expectedRouteVersionId: childId,
  publishedVersionId: null, hasUnpublishedChanges: true,
  editableFutureStopIds: [stopId], draft: { schemaVersion: 1, stops: [] },
});
const command = () => ({
  commandId: "80000000-0000-4000-8000-000000000001",
  expectedAssignmentGeneration: "2", expectedRouteVersionId: childId, expectedRevision: 0,
  stopOverrides: [{ deliveryStopId: stopId, address1: "700 Test Avenue", latitude: 43.7, longitude: -79.4 }],
});
const response = (data, status = 200, error = null) => ({
  ok: status >= 200 && status < 300, status, json: async () => ({ data, error }),
});
function fetchFixture(liveResponse = () => response(draft())) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith(`/admin/route-plans/${childId}`) || url.endsWith(`/admin/route-plans/${routePlanId}`)) {
      return response({ routePlan: { id: routePlanId, status: "IN_PROGRESS", routeGroupingChild: { groupingId: "group" } } });
    }
    if (url.includes("live-change")) return liveResponse(url, init);
    return response({ routePlans: [{ id: "fresh-list" }] });
  };
  return { calls, fetch };
}
function options(fetch) {
  return { fetch, session, scopeKey: getKfoodLiveChangeContext(session).liveChangeScopeKey, routePlanId };
}

test("server feature gate defaults off and only enables the KFood runtime", () => {
  assert.equal(getKfoodLiveChangeContext(session, {}).liveChangeEnabled, false);
  assert.equal(getKfoodLiveChangeContext(session, { CLEVER_KFOOD_LIVE_CHANGE_ENABLED: "true", CLEVER_APP_ID: "clever" }).liveChangeEnabled, false);
  assert.equal(getKfoodLiveChangeContext(session, { CLEVER_KFOOD_LIVE_CHANGE_ENABLED: "true", CLEVER_APP_ID: "clever-route-kfood" }).liveChangeEnabled, true);
  const key = getKfoodLiveChangeContext(session).liveChangeScopeKey;
  assert.notEqual(getKfoodLiveChangeContext({ ...session, id: "new-session" }).liveChangeScopeKey, key);
  assert.notEqual(getKfoodLiveChangeContext({ ...session, shop: "other.myshopify.com" }).liveChangeScopeKey, key);
  assert.ok(!key.includes(session.shop));
});

test("live reads bypass cached detail and draft and resolve the actual routePlan.id", async () => {
  clearDeliveryApiResponseCache();
  let revision = 1;
  const fixture = fetchFixture(() => response({ ...draft(), revision: revision++ }));
  primeDeliveryApiGetResponseCache(request(), `/admin/route-plans/${childId}`, {
    data: { routePlan: { id: "wrong-cached-plan" } }, errors: [],
  }, { fetch: fixture.fetch, cacheKey: session.shop });
  for (const expectedRevision of [1, 2]) {
    const result = await fetchKfoodLiveChange(request(), childId, options(fixture.fetch));
    assert.equal(result.data.revision, expectedRevision);
    assert.equal(result.error, null);
    assert.equal(result.scopeKey, options(fixture.fetch).scopeKey);
  }
  assert.equal(fixture.calls.length, 4);
  assert.equal(fixture.calls[1].url, `https://delivery.test/admin/route-plans/${routePlanId}/live-change`);
  for (const { init } of fixture.calls) {
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers.authorization, "Bearer authenticated-fixture-token");
    assert.equal(init.headers["x-clever-app-id"], "clever-route-kfood");
  }
});

test("Save, Dispatch and Discard use the resolved plan and preserve immutable command bodies", async () => {
  const fixture = fetchFixture((url) => response(url.endsWith("/dispatch")
    ? { routePlanId, revision: 1, publicationVersionId: "90000000-0000-4000-8000-000000000001", geometry: { status: "failed" }, notification: { status: "FAILED" } }
    : draft()));
  for (const [intent, suffix, method] of [
    ["liveChangeSave", "", "PATCH"], ["liveChangeDispatch", "/dispatch", "POST"], ["liveChangeDiscard", "/discard", "POST"],
  ]) {
    const body = command();
    if (intent !== "liveChangeSave") delete body.stopOverrides;
    const raw = JSON.stringify(body, null, 2);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await runKfoodLiveChangeCommand(request(), childId, intent, raw, options(fixture.fetch));
      assert.equal(result.error, null);
    }
    const calls = fixture.calls.filter(({ url, init }) => url.endsWith(`/live-change${suffix}`) && init.method === method);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.body, raw);
    assert.equal(calls[1].init.body, raw);
    assert.ok(calls[0].url.includes(routePlanId));
  }
});

test("reorder-only Save forwards every future ID with an empty override array", async () => {
  const fixture = fetchFixture();
  const body = command();
  body.stopOverrides = [];
  body.futureStopOrder = [stopId];
  const raw = JSON.stringify(body);
  const result = await runKfoodLiveChangeCommand(request(), childId, "liveChangeSave", raw, options(fixture.fetch));
  assert.equal(result.error, null);
  const saved = fixture.calls.find(({ init }) => init.method === "PATCH");
  assert.equal(saved.init.body, raw);
});

test("disabled runtime, changed session and forged route guards block requests", async () => {
  const fixture = fetchFixture();
  for (const extra of [{ scopeKey: "other-scope" }, { routePlanId: "other-plan" }]) {
    const result = await runKfoodLiveChangeCommand(request(), childId, "liveChangeSave", JSON.stringify(command()), { ...options(fixture.fetch), ...extra });
    assert.equal(result.error.code, extra.scopeKey ? "SCOPE_CHANGED" : "VERSION_CONFLICT");
  }
  assert.equal(fixture.calls.filter(({ init }) => init.method === "PATCH").length, 0);
  const previous = process.env.CLEVER_KFOOD_LIVE_CHANGE_ENABLED;
  try {
    delete process.env.CLEVER_KFOOD_LIVE_CHANGE_ENABLED;
    const before = fixture.calls.length;
    assert.equal((await fetchKfoodLiveChange(request(), childId, options(fixture.fetch))).error.code, "LIVE_CHANGE_DISABLED");
    assert.equal(fixture.calls.length, before);
  } finally { process.env.CLEVER_KFOOD_LIVE_CHANGE_ENABLED = previous; }
});

test("commands reject tenant selection and malformed guards without writing", async () => {
  const fixture = fetchFixture();
  const missingOverrides = command();
  delete missingOverrides.stopOverrides;
  missingOverrides.futureStopOrder = [stopId];
  for (const body of ["not-json", "null", JSON.stringify({ ...command(), tenantId: "another" }), JSON.stringify({ ...command(), expectedRevision: -1 }), JSON.stringify(missingOverrides)]) {
    const result = await runKfoodLiveChangeCommand(request(), childId, "liveChangeSave", body, options(fixture.fetch));
    assert.equal(result.error.code, "BAD_REQUEST");
  }
  assert.equal(fixture.calls.length, 0);
});

test("API conflicts retain their codes; lost or malformed mutation replies preserve unknown outcome", async () => {
  for (const code of ["STOP_NOT_FUTURE", "REVISION_CONFLICT", "ASSIGNMENT_CHANGED", "VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "DRAFT_CONFLICT", "STOP_LOCATION_NOT_ROUTEABLE"]) {
    const fixture = fetchFixture(() => response(null, 409, { code, message: "fixture conflict" }));
    const result = await runKfoodLiveChangeCommand(request(), childId, "liveChangeSave", JSON.stringify(command()), options(fixture.fetch));
    assert.equal(result.error.code, code);
    assert.equal(result.error.status, 409);
    assert.notEqual(result.outcomeUnknown, true);
  }
  for (const reply of [() => { throw new Error("lost after commit"); }, () => response(null, 502, { code: "BAD_GATEWAY" }), () => response({})]) {
    const fixture = fetchFixture(reply);
    const result = await runKfoodLiveChangeCommand(request(), childId, "liveChangeSave", JSON.stringify(command()), options(fixture.fetch));
    assert.equal(result.outcomeUnknown, true);
    assert.equal(fixture.calls.filter(({ init }) => init.method === "PATCH").length, 1);
  }
});

test("lost writes invalidate current scoped detail and list while preserving other shops", async () => {
  clearDeliveryApiResponseCache();
  const fixture = fetchFixture(() => { throw new Error("lost after commit"); });
  for (const cacheKey of [session.shop, "other.myshopify.com"]) {
    primeDeliveryApiGetResponseCache(request(), "/admin/route-plans", {
      data: { routePlans: [{ id: `stale-${cacheKey}` }] }, errors: [],
    }, { fetch: fixture.fetch, cacheKey });
  }
  await runKfoodLiveChangeCommand(request(), childId, "liveChangeSave", JSON.stringify(command()), options(fixture.fetch));
  assert.deepEqual((await fetchDeliveryRoutePlans(request(), { fetch: fixture.fetch, cacheKey: session.shop })).routePlans, [{ id: "fresh-list" }]);
  assert.deepEqual((await fetchDeliveryRoutePlans(request(), { fetch: fixture.fetch, cacheKey: "other.myshopify.com" })).routePlans, [{ id: "stale-other.myshopify.com" }]);
});

test("geocode replies retain request and address identity and expose lookup failure", async () => {
  const address = { address1: "700 Test Avenue", city: "Toronto", countryCode: "CA" };
  const body = { requestId: "lookup-7", deliveryStopId: stopId, address };
  const fixture = fetchFixture();
  let query;
  const result = await geocodeKfoodLiveChange(request(), childId, JSON.stringify(body), {
    ...options(fixture.fetch), geocodeAddress: async (value) => { query = value; return { latitude: 43.7, longitude: -79.4 }; },
  });
  assert.deepEqual(result.data, { ...body, latitude: 43.7, longitude: -79.4 });
  assert.equal(query, "700 Test Avenue, Toronto, CA");
  const failed = await geocodeKfoodLiveChange(request(), childId, JSON.stringify(body), {
    ...options(fixture.fetch), geocodeAddress: async () => null,
  });
  assert.equal(failed.error.code, "GEOCODE_NOT_FOUND");
  assert.deepEqual(failed.data, body);
});

test("resource action authenticates before passing live commands to BFF and ignores body tenant scope", async () => {
  const source = readFileSync(new URL("../app/routes/app.route-live-change.$routeId.jsx", import.meta.url), "utf8");
  const start = source.indexOf("export async function action");
  const events = [];
  const action = vm.runInNewContext(`(${source.slice(start + "export ".length).trim()})`, {
    authenticate: { admin: async () => { events.push("auth"); return { admin: {}, session }; } },
    handleKfoodLiveChangeAction: async (req, id, intent, form, opts) => { events.push("command"); return { id, intent, scope: opts.session }; },
  });
  const form = new FormData();
  form.set("intent", "liveChangeSave");
  form.set("tenantId", "browser-tenant");
  const result = await action({ params: { routeId: childId }, request: new Request("https://admin.test", { method: "POST", body: form }) });
  assert.deepEqual(events, ["auth", "command"]);
  assert.equal(result.id, childId);
  assert.equal(result.scope, session);
});

test("authenticated URL bearer cannot be replaced with a forged form bearer", async () => {
  const fixture = fetchFixture();
  const form = new FormData();
  form.set("command", JSON.stringify(command()));
  form.set("scopeKey", getKfoodLiveChangeContext(session).liveChangeScopeKey);
  form.set("routePlanId", routePlanId);
  form.set("shopifySessionToken", "forged-other-tenant-token");
  const authenticatedRequest = new Request("https://admin.test/detail?id_token=authenticated-tenant-a-token", { method: "POST", body: form });
  const result = await handleKfoodLiveChangeAction(authenticatedRequest, childId, "liveChangeSave", form, options(fixture.fetch));
  assert.equal(result.status, 200);
  assert.equal(fixture.calls.length, 2);
  for (const { init } of fixture.calls) assert.equal(init.headers.authorization, "Bearer authenticated-tenant-a-token");
});

test("resource loader authenticates and returns private no-store JSON without rendering the detail page", async () => {
  const source = readFileSync(new URL("../app/routes/app.route-live-change.$routeId.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /export default/u);
  const start = source.indexOf("export async function loader");
  const end = source.indexOf("\nexport async function action", start);
  const events = [];
  const loader = vm.runInNewContext(`(${source.slice(start + "export ".length, end).trim()})`, {
    URL,
    authenticate: { admin: async () => { events.push("auth"); return { admin: {}, session }; } },
    fetchKfoodLiveChange: async (_request, id, opts) => { events.push("read"); assert.equal(id, routePlanId); assert.equal(opts.session, session); return { data: draft(), error: null, errors: [] }; },
    liveChangeJsonResponse,
  });
  const result = await loader({ request: new Request(`https://admin.test/app/route-live-change/${routePlanId}?scopeKey=${getKfoodLiveChangeContext(session).liveChangeScopeKey}`), params: { routeId: routePlanId } });
  assert.deepEqual(events, ["auth", "read"]);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal((await result.json()).data.routePlanId, routePlanId);
});

test("real React Router resource HTTP returns JSON for GET, POST and errors with a synthetic authenticated SDK", async () => {
  const source = readFileSync(new URL("../app/routes/app.route-live-change.$routeId.jsx", import.meta.url), "utf8");
  let liveReply = () => response(draft());
  const fixture = fetchFixture((...args) => liveReply(...args));
  const events = [];
  const routeModule = vm.runInNewContext(`${source.slice(source.indexOf("export async function loader")).replaceAll("export async", "async")}; ({loader, action})`, {
    URL,
    authenticate: { admin: async () => { events.push("auth"); return { session }; } },
    fetchKfoodLiveChange: (request, id, opts) => fetchKfoodLiveChange(request, id, { ...opts, fetch: fixture.fetch }),
    handleKfoodLiveChangeAction: (request, id, intent, form, opts) => handleKfoodLiveChangeAction(request, id, intent, form, { ...opts, fetch: fixture.fetch }),
    liveChangeJsonResponse,
  });
  let documentRenders = 0;
  const handler = createRequestHandler({
    basename: "/", ssr: true, prerender: [], future: {},
    routeDiscovery: { mode: "initial", manifestPath: "/__manifest" },
    routes: {
      root: { id: "root", path: "", module: { default() {} } },
      app: { id: "app", parentId: "root", path: "app", module: { default() {} } },
      live: { id: "live", parentId: "app", path: "route-live-change/:routeId", module: routeModule },
    },
    entry: { module: { default: () => { documentRenders += 1; return new Response("<html>UI document</html>"); } } },
  }, "test");
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const request = new Request(`http://127.0.0.1:${server.address().port}${incoming.url}`, {
        method: incoming.method, headers: incoming.headers,
        ...(body.length ? { body } : {}),
      });
      const result = await handler(request);
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      outgoing.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      outgoing.writeHead(500);
      outgoing.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const scopeKey = getKfoodLiveChangeContext(session).liveChangeScopeKey;
    const url = `http://127.0.0.1:${server.address().port}/app/route-live-change/${routePlanId}?scopeKey=${scopeKey}&routePlanId=${routePlanId}`;
    const headers = { authorization: "Bearer authenticated-fixture-token" };
    const read = await fetch(url, { headers });
    assert.equal(read.status, 200);
    assert.match(read.headers.get("content-type"), /application\/json/u);
    assert.equal(read.headers.get("cache-control"), "private, no-store");
    assert.equal((await read.json()).data.routePlanId, routePlanId);
    const form = new FormData();
    form.set("intent", "liveChangeSave");
    form.set("command", JSON.stringify(command()));
    form.set("scopeKey", scopeKey);
    form.set("routePlanId", routePlanId);
    const saved = await fetch(url, { method: "POST", headers, body: form });
    assert.equal(saved.status, 200);
    assert.match(saved.headers.get("content-type"), /application\/json/u);
    assert.equal(saved.headers.get("cache-control"), "private, no-store");
    assert.equal((await saved.json()).data.revision, 1);
    liveReply = () => response(null, 409, { code: "STOP_NOT_FUTURE", message: "advanced" });
    const conflict = await fetch(url, { method: "POST", headers, body: form });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.code, "STOP_NOT_FUTURE");
    assert.equal(conflict.headers.get("cache-control"), "private, no-store");
    liveReply = () => response(null, 401, { code: "UNAUTHORIZED", message: "expired" });
    const unauthorized = await fetch(url, { headers });
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get("X-Shopify-Retry-Invalid-Session-Request"), "1");
    assert.equal(unauthorized.headers.get("cache-control"), "private, no-store");
    assert.equal(documentRenders, 0);
    assert.deepEqual(events, ["auth", "auth", "auth", "auth"]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("HTTP authorization failures preserve Shopify reauthentication and do not retry writes", async () => {
  const fixture = fetchFixture(() => response(null, 401, { code: "UNAUTHORIZED", message: "expired" }));
  await assert.rejects(
    runKfoodLiveChangeCommand(request(), childId, "liveChangeSave", JSON.stringify(command()), options(fixture.fetch)),
    (error) => error instanceof Response && error.status === 401 && error.headers.get("X-Shopify-Retry-Invalid-Session-Request") === "1"
      && error.headers.get("Cache-Control") === "private, no-store",
  );
  assert.equal(fixture.calls.filter(({ init }) => init.method === "PATCH").length, 1);
  const missingBearer = await runKfoodLiveChangeCommand(new Request("https://admin.test/detail"), childId, "liveChangeSave", JSON.stringify(command()), options(fixture.fetch));
  assert.equal(missingBearer.error.code, "DELIVERY_SESSION_TOKEN_MISSING");
  assert.equal(fixture.calls.filter(({ init }) => init.method === "PATCH").length, 1);
});

test("live JSON errors preserve HTTP status and prevent browser caching", () => {
  for (const status of [403, 409, 422, 502]) {
    const response = liveChangeJsonResponse({ data: null, error: { code: "FIXTURE", status }, errors: [] });
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("detail API honors no-store options without consuming an existing cached response", async () => {
  clearDeliveryApiResponseCache();
  const fixture = fetchFixture();
  primeDeliveryApiGetResponseCache(request(), `/admin/route-plans/${childId}`, {
    data: { routePlan: { id: "cached" } }, errors: [],
  }, { fetch: fixture.fetch });
  const result = await fetchDeliveryRoutePlanDetail(request(), childId, { fetch: fixture.fetch, cache: "no-store" });
  assert.equal(result.routePlan.id, routePlanId);
  assert.equal(fixture.calls[0].init.cache, "no-store");
});
