/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createMemoryRouter, redirect } from "react-router";
import {
  deliveryApiRequest,
  fetchDeliveryRoutePlans,
  getCleverAppId,
  primeDeliveryApiGetResponseCache,
} from "../app/features/delivery/route-plans.server.js";
import { fetchDeliveryRouteGroups } from "../app/features/delivery/route-groups.server.js";
import { buildRouteRows } from "../app/features/delivery/route-list-rows.js";
import { shouldRevalidateRoutesRoute } from "../app/features/delivery/route-helpers.js";
import { withEmbeddedShopifyContext } from "../app/features/delivery/route-paths.js";
import {
  confirmRouteListRefresh,
  getConfirmedRouteListRefresh,
  getRouteListRefreshKey,
  readRouteListRefresh,
  readRouteListRefreshRequest,
  ROUTE_LIST_REFRESH_PARAM,
  isRouteListRefreshCleanup,
  rememberRouteListRefresh,
  routeListRefreshWasAttempted,
} from "../app/features/delivery/route-list-refresh.js";

process.env.CLEVER_DELIVERY_API_URL = "https://synthetic-delivery.test";
process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "15000";

const routesSource = readFileSync(new URL("../app/routes/app.routes.jsx", import.meta.url), "utf8");
const loaderStart = routesSource.indexOf("export const loader = async");
const loaderEnd = routesSource.indexOf("export function shouldRevalidate", loaderStart);
assert.ok(loaderStart >= 0 && loaderEnd > loaderStart);

// Run the exported production loader body. Only Shopify authentication/settings
// and transport are synthetic; plans, groups, rows and the live GET cache are real.
const loaderFactory = Function(
  "authenticate", "fetchDeliveryRoutePlans", "fetchDeliveryRouteGroups",
  "fetchShopifyDepartureLocation", "fetchRouteFallbackTimeZone", "resolveRouteListTimeZones",
  "measureRouteLoaderStep", "logStructuredMetric", "redirect", "getCleverAppId",
  "getRouteListRefreshKey", "readRouteListRefreshRequest", "getConfirmedRouteListRefresh", "buildRouteRows",
  `${routesSource.slice(loaderStart, loaderEnd).replace("export const loader", "const loader")} return loader;`,
);

function sessionStorageFixture() {
  const values = new Map();
  let writes = 0;
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes += 1; values.set(key, String(value)); },
    removeItem(key) { writes += 1; values.delete(key); },
    get writes() { return writes; },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createFixture() {
  const storage = sessionStorageFixture();
  const statuses = new Map();
  const reads = [];
  const failures = new Map();
  let block = null;
  const transport = async (url, options) => {
    const path = new URL(url).pathname;
    const appId = options.headers["x-clever-app-id"];
    const shop = options.headers.authorization.slice("Bearer ".length);
    reads.push({ appId, shop, path, search: new URL(url).search });
    if (block) await block.promise;
    const failure = failures.get(path);
    if (failure) {
      failures.delete(path);
      if (failure === "network") throw new Error("Synthetic connection failure");
      return Response.json({ error: { code: "SYNTHETIC_READ_FAILURE", message: "Synthetic read failure" } }, { status: failure });
    }
    const status = statuses.get(`${appId}:${shop}`) ?? "READY";
    return Response.json({ data: path === "/admin/route-groups"
      ? { routeGroups: [{ id: "synthetic-group", children: [{ routePlanId: "synthetic-child", routePlan: { id: "synthetic-child", status } }] }] }
      : path === "/admin/route-plans"
        ? { routePlans: [{ id: "synthetic-standalone", status }] }
        : { routePlan: { id: "synthetic-detail", status } },
    });
  };
  const loader = loaderFactory(
    { admin: async request => ({ admin: {}, session: { shop: request.headers.get("x-fixture-shop") } }) },
    (request, options) => fetchDeliveryRoutePlans(request, { ...options, fetch: transport }),
    (request, query, options) => fetchDeliveryRouteGroups(request, query, { ...options, fetch: transport }),
    async () => ({ departureLocation: null, errors: [] }),
    async () => ({ ianaTimezone: "America/Toronto", errors: [] }),
    async () => ({}),
    async load => ({ data: await load(), durationMs: 0 }),
    () => {}, redirect, getCleverAppId, getRouteListRefreshKey,
    readRouteListRefreshRequest, getConfirmedRouteListRefresh, buildRouteRows,
  );
  const shop = "synthetic-a.myshopify.com";
  const refreshKey = targetShop => getRouteListRefreshKey(getCleverAppId(), targetShop ?? shop);
  const request = (path = "/app/routes", targetShop = shop) => new Request(`https://synthetic-app.test${path}`, {
    headers: { authorization: `Bearer ${targetShop}`, "x-fixture-shop": targetShop },
  });
  return {
    storage, reads, failures, transport, shop, refreshKey, request, loader,
    setStatus(status, targetShop = shop) { statuses.set(`${getCleverAppId()}:${targetShop}`, status); },
    mark(status, routeIds = ["synthetic-standalone", "synthetic-child"]) {
      for (const routeId of routeIds) rememberRouteListRefresh(refreshKey(), routeId, status, storage);
    },
    read(path = "/app/routes", targetShop = shop) { return loader({ request: request(path, targetShop) }); },
    refresh(path = "/app/routes", targetShop = shop) {
      const url = new URL(`https://synthetic-app.test${path}`);
      url.searchParams.set(ROUTE_LIST_REFRESH_PARAM, JSON.stringify({
        key: refreshKey(targetShop), pending: readRouteListRefresh(refreshKey(targetShop), storage),
      }));
      return loader({ request: request(`${url.pathname}${url.search}`, targetShop) });
    },
    block() { block = deferred(); return block; },
    unblock() { const previous = block; block = null; previous?.resolve(); },
    pending() { return readRouteListRefresh(refreshKey(), storage); },
    confirm(data) { confirmRouteListRefresh(data.routesRefresh.key, data.routesRefresh.confirmed, storage); },
  };
}

function rowStatuses(data) {
  return Object.fromEntries(buildRouteRows(data.routePlans, data.routeGroups).map(row => [row.id, row.status]));
}

function assertStatuses(data, status, message) {
  assert.deepEqual(rowStatuses(data), { "synthetic-child": status, "synthetic-standalone": status }, message);
}

for (const terminalStatus of ["INCOMPLETE", "COMPLETED", "CANCELLED"]) {
  test(`production list loader replaces active READY plans/groups caches with ${terminalStatus}`, async () => {
    const fixture = createFixture();
    assertStatuses(await fixture.read(), "READY");
    fixture.setStatus(terminalStatus);
    assertStatuses(await fixture.read(), "READY");
    assert.equal(fixture.reads.length, 2, "both 15-second server cache entries are still active");
    fixture.mark(terminalStatus);
    assert.equal(fixture.pending().length, 2, "detail unmount cannot clear session storage");
    const data = await fixture.refresh();
    assertStatuses(data, terminalStatus);
    assert.deepEqual(data.routesRefresh.confirmed, fixture.pending());
    assert.equal(fixture.pending().length, 2, "a server read does not clear session storage before client confirmation");
    fixture.confirm(data);
    assert.deepEqual(fixture.pending(), []);
    assertStatuses(await fixture.read(), terminalStatus);
    assert.equal(fixture.reads.length, 4, "fresh values replace the requested cache entries and stay cached");
  });
}

for (const [path, failure] of [["/admin/route-plans", 503], ["/admin/route-groups", 503], ["/admin/route-plans", "network"]]) {
  test(`${path} ${failure} failure keeps the refresh marker pending until a successful retry`, async () => {
    const fixture = createFixture();
    assertStatuses(await fixture.read(), "READY");
    fixture.setStatus("INCOMPLETE");
    fixture.mark("INCOMPLETE");
    fixture.failures.set(path, failure);
    const failed = await fixture.refresh();
    assert.equal(failed.errors.length, 1);
    assert.deepEqual(failed.routesRefresh.confirmed, []);
    fixture.confirm(failed);
    assert.equal(fixture.pending().length, 2);
    const retried = await fixture.refresh();
    assert.equal(retried.errors.length, 0);
    assertStatuses(retried, "INCOMPLETE");
    fixture.confirm(retried);
    assert.deepEqual(fixture.pending(), []);
    assertStatuses(await fixture.read(), "INCOMPLETE");
    assert.equal(fixture.reads.length, 6, "one explicit retry completes both required reads; later reads use the cache");
  });
}

test("a successful read with a still-stale result does not confirm or clear the mismatch", async () => {
  const fixture = createFixture();
  await fixture.read();
  fixture.mark("INCOMPLETE");
  const stale = await fixture.refresh();
  assertStatuses(stale, "READY");
  assert.deepEqual(stale.routesRefresh.confirmed, []);
  fixture.confirm(stale);
  assert.equal(fixture.pending().length, 2);
  fixture.setStatus("INCOMPLETE");
  const retry = await fixture.refresh();
  assertStatuses(retry, "INCOMPLETE");
  fixture.confirm(retry);
  assert.deepEqual(fixture.pending(), []);
});

test("refresh stays scoped to the current tenant/app list keys and preserves unrelated GET caches", async () => {
  const fixture = createFixture();
  const otherShop = "synthetic-b.myshopify.com";
  const appId = getCleverAppId();
  const previousAppId = process.env.CLEVER_APP_ID;
  assertStatuses(await fixture.read(), "READY");
  assertStatuses(await fixture.read("/app/routes", otherShop), "READY");
  const detailPath = "/admin/route-plans/synthetic-detail";
  const options = { cacheKey: fixture.shop, fetch: fixture.transport };
  const detail = await deliveryApiRequest(fixture.request(), detailPath, options);
  assert.equal(detail.data.routePlan.status, "READY");
  try {
    process.env.CLEVER_APP_ID = `${appId}-synthetic-other`;
    assertStatuses(await fixture.read(), "READY");
    fixture.setStatus("CANCELLED");
    process.env.CLEVER_APP_ID = appId;
    fixture.setStatus("INCOMPLETE");
    fixture.setStatus("COMPLETED", otherShop);
    fixture.mark("INCOMPLETE");
    const fresh = await fixture.refresh();
    assertStatuses(fresh, "INCOMPLETE");
    fixture.confirm(fresh);
    assertStatuses(await fixture.read("/app/routes", otherShop), "READY");
    assert.equal((await deliveryApiRequest(fixture.request(), detailPath, options)).data.routePlan.status, "READY");
    process.env.CLEVER_APP_ID = `${appId}-synthetic-other`;
    assertStatuses(await fixture.read(), "READY");
    assert.equal(fixture.reads.length, 9, "only the current tenant/app plans and routes-list groups are refreshed");
    assert.equal(fixture.reads.filter(read => read.path === "/admin/route-groups" && read.search === "?view=routes-list").length, 4);
  } finally {
    if (previousAppId === undefined) delete process.env.CLEVER_APP_ID;
    else process.env.CLEVER_APP_ID = previousAppId;
  }
});

test("concurrent loader refreshes share in-flight plans/groups reads and return fresh final statuses", async () => {
  const fixture = createFixture();
  await fixture.read();
  fixture.setStatus("COMPLETED");
  fixture.mark("COMPLETED");
  fixture.block();
  const first = fixture.refresh();
  const second = fixture.refresh();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.reads.length, 4, "two concurrent loaders issue only one refresh per required cache key");
  fixture.unblock();
  const [firstData, secondData] = await Promise.all([first, second]);
  assertStatuses(firstData, "COMPLETED");
  assertStatuses(secondData, "COMPLETED");
  fixture.confirm(secondData);
  assertStatuses(await fixture.read(), "COMPLETED");
  assert.equal(fixture.reads.length, 4);
});

for (const failure of [503, 401]) {
  test(`an older ${failure} refresh failure cannot delete a newer successful cache entry`, async () => {
    const fixture = createFixture();
    const request = fixture.request();
    const path = "/admin/route-plans";
    const options = { cacheKey: fixture.shop, fetch: fixture.transport };
    await fetchDeliveryRoutePlans(request, options);
    fixture.block();
    fixture.failures.set(path, failure);
    const oldRead = fetchDeliveryRoutePlans(request, { ...options, refreshCache: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(primeDeliveryApiGetResponseCache(request, path, {
      data: { routePlans: [{ id: "synthetic-newer", status: "INCOMPLETE" }] }, errors: [],
    }, options), true);
    fixture.unblock();
    if (failure === 401) await assert.rejects(oldRead, error => error instanceof Response && error.status === 401);
    else assert.equal((await oldRead).errors.length, 1);
    assert.deepEqual((await fetchDeliveryRoutePlans(request, options)).routePlans, [{ id: "synthetic-newer", status: "INCOMPLETE" }]);
    assert.equal(fixture.reads.length, 2, "failed old work leaves the newer cache value intact");
  });
}

test("unchanged list navigation preserves plans/groups caches without extra backend reads", async () => {
  const fixture = createFixture();
  assertStatuses(await fixture.read(), "READY");
  for (const path of ["/app/routes/synthetic-child", "/app/routes", "/app/routes?status=READY", "/app/routes"]) {
    const data = await fixture.read(path);
    assertStatuses(data, "READY");
    assert.deepEqual(data.routesRefresh.requested, []);
    assert.deepEqual(data.routesRefresh.confirmed, []);
  }
  assert.equal(fixture.reads.length, 2);
  assert.equal(fixture.storage.writes, 0);
});

test("session pending survives reload and confirms only an exact observation version", () => {
  const storage = sessionStorageFixture();
  const key = getRouteListRefreshKey("synthetic-app", "synthetic-a.myshopify.com");
  const otherKey = getRouteListRefreshKey("synthetic-app", "synthetic-b.myshopify.com");
  rememberRouteListRefresh(key, "synthetic-a", "INCOMPLETE", storage);
  rememberRouteListRefresh(otherKey, "synthetic-b", "COMPLETED", storage);
  const original = readRouteListRefresh(key, storage);
  assert.equal(original[0].routeId, "synthetic-a");
  assert.equal(original[0].status, "INCOMPLETE");
  assert.match(original[0].version, /^[0-9a-f-]{36}$/);
  const afterReload = { getItem: name => storage.getItem(name) };
  assert.deepEqual(readRouteListRefresh(key, afterReload), original);
  rememberRouteListRefresh(key, "synthetic-a", "INCOMPLETE", storage);
  assert.equal(storage.writes, 2, "the same pending mismatch is not rewritten each render");
  confirmRouteListRefresh(key, original, storage);
  rememberRouteListRefresh(key, "synthetic-a", "INCOMPLETE", storage);
  const newer = readRouteListRefresh(key, storage);
  assert.equal(newer[0].status, original[0].status);
  assert.notEqual(newer[0].version, original[0].version);
  confirmRouteListRefresh(key, original, storage);
  assert.deepEqual(readRouteListRefresh(key, storage), newer, "an old same-status acknowledgement cannot consume a new observation");
  assert.equal(routeListRefreshWasAttempted(newer, original), false);
  confirmRouteListRefresh(key, newer, storage);
  assert.deepEqual(readRouteListRefresh(key, storage), []);
  assert.equal(readRouteListRefresh(otherKey, storage)[0].status, "COMPLETED");
  storage.setItem(key, JSON.stringify([{ routeId: "synthetic-a", status: "READY", version: "synthetic-version" }]));
  assert.deepEqual(readRouteListRefresh(key, storage), []);
});

test("a foreign tenant/app refresh query cannot bypass the authenticated tenant cache", async () => {
  const fixture = createFixture();
  assertStatuses(await fixture.read(), "READY");
  fixture.setStatus("INCOMPLETE");
  fixture.mark("INCOMPLETE");
  for (const key of [getRouteListRefreshKey(getCleverAppId(), "synthetic-b.myshopify.com"), getRouteListRefreshKey("synthetic-other-app", fixture.shop)]) {
    const url = new URL("https://synthetic-app.test/app/routes");
    url.searchParams.set(ROUTE_LIST_REFRESH_PARAM, JSON.stringify({ key, pending: fixture.pending() }));
    const result = await fixture.read(`${url.pathname}${url.search}`);
    assertStatuses(result, "READY");
    assert.deepEqual(result.routesRefresh.requested, []);
    assert.deepEqual(result.routesRefresh.confirmed, []);
  }
  assert.equal(fixture.reads.length, 2);
  assertStatuses(await fixture.refresh(), "INCOMPLETE");
  assert.equal(fixture.reads.length, 4);
});

test("a scoped refresh succeeds without readable or writable document cookies", async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { get cookie() { throw new Error("Third-party cookies are blocked"); }, set cookie(_value) { throw new Error("Third-party cookies are blocked"); } },
  });
  try {
    const fixture = createFixture();
    assert.equal(fixture.request().headers.has("cookie"), false);
    assertStatuses(await fixture.read(), "READY");
    fixture.setStatus("INCOMPLETE");
    fixture.mark("INCOMPLETE");
    assertStatuses(await fixture.read(), "READY", "storage by itself cannot bypass the server cache");
    const result = await fixture.refresh();
    assertStatuses(result, "INCOMPLETE");
    fixture.confirm(result);
    assert.deepEqual(fixture.pending(), []);
    assert.equal(fixture.reads.length, 4);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  }
});

test("an in-flight refresh remains shared after 15 seconds and gets a full TTL after settlement", async () => {
  const fixture = createFixture();
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    await fixture.read();
    fixture.setStatus("CANCELLED");
    fixture.mark("CANCELLED");
    fixture.block();
    const first = fixture.refresh();
    await new Promise(resolve => setImmediate(resolve));
    now += 15_001;
    const second = fixture.refresh();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.reads.length, 4, "TTL expiry cannot start another in-flight plans/groups refresh");
    fixture.unblock();
    const [firstData, secondData] = await Promise.all([first, second]);
    assertStatuses(firstData, "CANCELLED");
    assertStatuses(secondData, "CANCELLED");
    fixture.confirm(secondData);
    now += 14_999;
    assertStatuses(await fixture.read(), "CANCELLED");
    assert.equal(fixture.reads.length, 4, "settled results have a fresh complete 15-second TTL");
    now += 2;
    fixture.setStatus("COMPLETED");
    assertStatuses(await fixture.read(), "COMPLETED");
    assert.equal(fixture.reads.length, 6, "normal cache expiry still starts new reads after settlement");
  } finally {
    fixture.unblock();
    Date.now = originalNow;
  }
});

test("quota failures retain the pending observation when storage getItem still returns null", () => {
  const key = getRouteListRefreshKey("synthetic-quota-app", "synthetic.myshopify.com");
  const storage = {
    getItem: () => null,
    setItem() { throw new DOMException("Synthetic full storage", "QuotaExceededError"); },
    removeItem() { throw new DOMException("Synthetic full storage", "QuotaExceededError"); },
  };
  rememberRouteListRefresh(key, "synthetic-quota-route", "INCOMPLETE", storage);
  const pending = readRouteListRefresh(key, storage);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].status, "INCOMPLETE");
  const url = new URL("https://synthetic-app.test/app/routes");
  url.searchParams.set(ROUTE_LIST_REFRESH_PARAM, JSON.stringify({ key, pending }));
  assert.deepEqual(readRouteListRefreshRequest(key, url), pending, "in-memory fallback still produces a scoped loader query");
  confirmRouteListRefresh(key, pending, storage);
  assert.deepEqual(readRouteListRefresh(key, storage), []);
});

test("a failed storage removal cannot resurrect the acknowledged old observation", () => {
  const key = getRouteListRefreshKey("synthetic-remove-failure-app", "synthetic.myshopify.com");
  const storage = sessionStorageFixture();
  rememberRouteListRefresh(key, "synthetic-remove-route", "COMPLETED", storage);
  const pending = readRouteListRefresh(key, storage);
  const savedRemove = storage.removeItem;
  storage.removeItem = () => { throw new DOMException("Synthetic storage blocked", "SecurityError"); };
  confirmRouteListRefresh(key, pending, storage);
  assert.notEqual(storage.getItem(key), null, "the old value remains in the failing storage backend");
  assert.deepEqual(readRouteListRefresh(key, storage), [], "memory confirmation takes precedence over the old stored value");
  storage.removeItem = savedRemove;
  rememberRouteListRefresh(key, "synthetic-remove-route", "COMPLETED", storage);
  const newer = readRouteListRefresh(key, storage);
  assert.equal(newer.length, 1);
  assert.notEqual(newer[0].version, pending[0].version);
  confirmRouteListRefresh(key, pending, storage);
  assert.deepEqual(readRouteListRefresh(key, storage), newer);
  confirmRouteListRefresh(key, newer, storage);
  assert.equal(storage.getItem(key), null, "successful storage recovery clears the acknowledged value");
  assert.deepEqual(readRouteListRefresh(key, storage), []);
});

test("loader query validation rejects malformed and nonterminal refresh observations", () => {
  const key = getRouteListRefreshKey("synthetic-validation-app", "synthetic.myshopify.com");
  const url = new URL("https://synthetic-app.test/app/routes");
  for (const request of ["malformed", { key, pending: [{ routeId: "synthetic-route", status: "INCOMPLETE" }] }, { key, pending: [{ routeId: "synthetic-route", status: "READY", version: "synthetic-version" }] }, { key, pending: [{ routeId: "", status: "COMPLETED", version: "synthetic-version" }] }]) {
    url.searchParams.set(ROUTE_LIST_REFRESH_PARAM, typeof request === "string" ? request : JSON.stringify(request));
    assert.deepEqual(readRouteListRefreshRequest(key, url), []);
  }
});

async function waitForIdle(router) {
  if (router.state.initialized && router.state.navigation.state === "idle" && router.state.revalidation === "idle") return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe(); reject(new Error("Router did not become idle")); }, 2000);
    const unsubscribe = router.subscribe(state => {
      if (state.initialized && state.navigation.state === "idle" && state.revalidation === "idle") {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });
}

const effectStart = routesSource.indexOf("    if (!isRoutesIndex) {");
const effectEnd = routesSource.indexOf("  }, [isRoutesIndex, navigate, revalidator.state, routesRefresh, searchParams]);", effectStart);
assert.ok(effectStart >= 0 && effectEnd > effectStart);
const listEffect = Function("isRoutesIndex", "refreshAttemptRef", "routesRefresh", "setHasPendingListRefresh", "revalidator", "confirmRouteListRefresh", "readRouteListRefresh", "routeListRefreshWasAttempted", "searchParams", "navigate", "withEmbeddedShopifyContext", "ROUTE_LIST_REFRESH_PARAM", routesSource.slice(effectStart, effectEnd));
const revalidateStart = routesSource.indexOf("export function shouldRevalidate");
const revalidateEnd = routesSource.indexOf("export const action", revalidateStart);
assert.ok(revalidateEnd > revalidateStart);
const productionShouldRevalidate = Function("isRouteListRefreshCleanup", "shouldRevalidateRoutesRoute", "ROUTE_LIST_REFRESH_PARAM", `${routesSource.slice(revalidateStart, revalidateEnd).replace("export function", "function")} return shouldRevalidate;`)(isRouteListRefreshCleanup, shouldRevalidateRoutesRoute, ROUTE_LIST_REFRESH_PARAM);

for (const terminalStatus of ["INCOMPLETE", "COMPLETED", "CANCELLED"]) {
  for (const navigation of ["Routes button", "Back/Forward", "full reload"]) {
    test(`${navigation} returns ${terminalStatus} using the production loader and list component query handshake`, async () => {
      const fixture = createFixture();
      const listUrl = "/app/routes?shop=synthetic-a.myshopify.com&embedded=1&host=synthetic-host&status=Ready";
      const routes = [{
        id: "routes-list", path: "/app/routes",
        loader: ({ request }) => { const url = new URL(request.url); return fixture.read(`${url.pathname}${url.search}`); },
        shouldRevalidate: productionShouldRevalidate,
        children: [{ index: true }, { path: ":routeId", loader: () => null }],
      }];
      let router = createMemoryRouter(routes, { initialEntries: [listUrl] });
      const attemptRef = { current: null };
      let pendingVisible = false;
      const runIndexEffect = () => listEffect(
        true, attemptRef, router.state.loaderData["routes-list"].routesRefresh,
        value => { pendingVisible = value; },
        { state: router.state.revalidation, revalidate: () => router.revalidate() },
        (key, confirmed) => confirmRouteListRefresh(key, confirmed, fixture.storage),
        key => readRouteListRefresh(key, fixture.storage), routeListRefreshWasAttempted,
        new URLSearchParams(router.state.location.search), (href, options) => router.navigate(href, options),
        withEmbeddedShopifyContext, ROUTE_LIST_REFRESH_PARAM,
      );
      try {
        await waitForIdle(router);
        assertStatuses(router.state.loaderData["routes-list"], "READY");
        await router.navigate("/app/routes/synthetic-standalone");
        fixture.setStatus(terminalStatus);
        fixture.mark(terminalStatus);
        assert.equal(fixture.reads.length, 2, "detail navigation keeps the active READY cache");
        if (navigation === "full reload") {
          router.dispose();
          router = createMemoryRouter(routes, { initialEntries: [listUrl] });
          await waitForIdle(router);
        } else if (navigation === "Back/Forward") {
          await router.navigate(-1);
        } else {
          await router.navigate(listUrl);
        }
        assertStatuses(router.state.loaderData["routes-list"], "READY", "stored pending state requires an explicit server query handshake");
        runIndexEffect();
        await waitForIdle(router);
        assertStatuses(router.state.loaderData["routes-list"], terminalStatus);
        assert.equal(new URLSearchParams(router.state.location.search).has(ROUTE_LIST_REFRESH_PARAM), true);
        runIndexEffect();
        await waitForIdle(router);
        assert.equal(pendingVisible, false);
        assert.deepEqual(fixture.pending(), []);
        const cleanSearch = new URLSearchParams(router.state.location.search);
        assert.equal(cleanSearch.has(ROUTE_LIST_REFRESH_PARAM), false);
        assert.equal(cleanSearch.get("shop"), fixture.shop);
        assert.equal(cleanSearch.get("embedded"), "1");
        assert.equal(cleanSearch.get("host"), "synthetic-host");
        assert.equal(cleanSearch.get("status"), "Ready");
        assert.equal(fixture.reads.length, 4, "cleanup navigation does not issue another backend refresh");
        if (navigation === "Back/Forward") {
          await router.navigate(1);
          await router.navigate(-1);
          runIndexEffect();
          await waitForIdle(router);
          assertStatuses(router.state.loaderData["routes-list"], terminalStatus);
          assert.equal(fixture.reads.length, 4, "later Forward/Back preserves fresh cached list data");
        }
        assertStatuses(await fixture.read(), terminalStatus);
        assert.equal(fixture.reads.length, 4, "a new page loader retains the successfully refreshed cache");
      } finally {
        router.dispose();
      }
    });
  }
}
