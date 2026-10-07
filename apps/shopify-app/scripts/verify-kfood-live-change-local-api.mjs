/* eslint-env node */
// Run with an explicit PR486 checkout. Owns a temporary loopback PostgreSQL cluster.
// Uses only synthetic records and local JWT keys. No .env or provider configuration is loaded.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const serverRoot = process.argv[2] && resolve(process.argv[2]);
if (!serverRoot) throw new Error("Usage: node verify-kfood-live-change-local-api.mjs <PR486 checkout> [PostgreSQL bin directory]");
const pgBin = process.argv[3] ?? "/opt/homebrew/opt/postgresql@17/bin";
const apiDir = join(serverRoot, "apps/delivery-api");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const resultPath = join(repoRoot, "docs/verification/kfood-live-change-local-api-20261007.json");
const temp = await mkdtemp(join(tmpdir(), "kfood-live-ui-api-"));
const childEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C" };
const checks = [];
let pgStarted = false;
let app;
let prisma;
let unregister;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", env: childEnv, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command.split("/").at(-1)} failed: ${result.error?.message ?? result.stderr.slice(-1500)}`);
  return result.stdout.trim();
}
async function unusedPort() {
  const listener = createServer();
  await new Promise((accept, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", accept); });
  const port = listener.address().port;
  await new Promise((accept, reject) => listener.close((error) => error ? reject(error) : accept()));
  return port;
}
const source = async (path) => import(pathToFileURL(join(apiDir, "src", path)).href);
const ok = (result) => { assert.equal(result.error, null, JSON.stringify(result.error)); return result.data; };
const expectError = (result, code, status) => { assert.equal(result.error?.code, code); if (status !== undefined) assert.equal(result.error?.status, status); };
const mark = (name) => checks.push({ name, result: "pass" });
function loseReplyAfterCommit(method, suffix) {
  let lost = false;
  return async (url, init) => {
    const response = await fetch(url, init);
    if (!lost && init.method === method && url.endsWith(suffix)) {
      lost = true;
      assert.equal(response.status, 200);
      await response.arrayBuffer();
      throw new Error("Synthetic response loss after transaction commit");
    }
    return response;
  };
}

try {
  const port = await unusedPort();
  run(join(pgBin, "initdb"), ["-D", join(temp, "pg"), "--auth-local=trust", "--auth-host=trust", "--no-locale", "-E", "UTF8"]);
  run(join(pgBin, "pg_ctl"), ["-D", join(temp, "pg"), "-l", join(temp, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${temp} -c max_connections=16 -c shared_buffers=32MB`, "-w", "start"]);
  pgStarted = true;
  run(join(pgBin, "createdb"), ["-h", "127.0.0.1", "-p", String(port), "kfood_live_change"]);
  const databaseUrl = `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:${port}/kfood_live_change?schema=public`;
  const databaseTarget = new URL(databaseUrl);
  assert.equal(databaseTarget.hostname, "127.0.0.1");
  assert.equal(databaseTarget.pathname, "/kfood_live_change");
  run(process.execPath, [join(apiDir, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", join(apiDir, "prisma/schema.prisma")], {
    cwd: temp, env: { ...childEnv, DATABASE_URL: databaseUrl },
  });
  const { register } = await import(pathToFileURL(join(apiDir, "node_modules/tsx/dist/esm/api/index.mjs")).href);
  unregister = register({ tsconfig: join(apiDir, "tsconfig.json") });
  const { PrismaClient } = await import(pathToFileURL(join(apiDir, "node_modules/@prisma/client/default.js")).href);
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const { buildApp } = await source("app.ts");
  const { PrismaLiveRouteChangeService } = await source("modules/route-plans/live-route-change.service.ts");
  const { PrismaRoutePlanRepository } = await source("modules/route-plans/route-plan.repository.ts");
  const { RoutePlanAdminService } = await source("modules/route-plans/route-plan.service.ts");
  const { ShopifySessionTokenVerifier } = await source("modules/shopify/session-token-verifier.ts");
  const { PrismaDriverEventRepository } = await source("modules/driver/driver-event.repository.ts");
  const { PrismaDriverTokenAccessRepository } = await source("modules/driver/driver-token-access.repository.ts");
  const { signDriverRouteToken } = await source("modules/driver/driver-token-verifier.ts");
  const { KFOOD_DELIVERY_APP_ID: appId, KFOOD_DELIVERY_SHOP_DOMAIN: shopDomain } = await source("modules/route-plans/kfood-delivery-completion.ts");
  const fixture = await seedFixture(prisma, appId, shopDomain);
  const clientId = "synthetic-local-shopify-client";
  const clientSecret = randomUUID();
  const driverSecret = randomUUID();
  const events = new PrismaDriverEventRepository(prisma);
  const liveService = new PrismaLiveRouteChangeService(prisma);
  app = await buildApp({
    adminRoutePlans: {
      liveRouteChangeService: liveService,
      routePlanService: new RoutePlanAdminService(new PrismaRoutePlanRepository(prisma)),
      sessionTokenVerifier: new ShopifySessionTokenVerifier({ appId, clientId, clientSecret }),
    },
    driverApi: { driverEventService: events, driverTokenAccessRepository: new PrismaDriverTokenAccessRepository(prisma), liveRouteChangeService: liveService, jwtSecret: driverSecret },
  });
  const apiUrl = await app.listen({ port: 0, host: "127.0.0.1" });
  process.env.CLEVER_APP_ID = appId;
  process.env.CLEVER_KFOOD_LIVE_CHANGE_ENABLED = "true";
  process.env.CLEVER_DELIVERY_API_URL = apiUrl;
  process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "60000";
  const { fetchKfoodLiveChange, getKfoodLiveChangeContext, runKfoodLiveChangeCommand } = await import("../app/features/delivery/live-change.server.js");
  const { fetchDeliveryRoutePlanDetail, primeDeliveryApiGetResponseCache } = await import("../app/features/delivery/route-plans.server.js");
  const session = { shop: shopDomain, id: `offline_${shopDomain}` };
  const token = jwt(shopDomain, clientId, clientSecret);
  const request = (bearer = token) => new Request(`http://127.0.0.1/app/routes/${fixture.route.id}`, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
  const options = { session, scopeKey: getKfoodLiveChangeContext(session).liveChangeScopeKey, routePlanId: fixture.route.id, routeGroupId: fixture.group.id };
  const read = async () => ok(await fetchKfoodLiveChange(request(), fixture.route.id, options));
  const command = (draft, extra = {}) => ({ commandId: randomUUID(), expectedAssignmentGeneration: draft.assignmentGeneration, expectedRouteVersionId: draft.expectedRouteVersionId, expectedRevision: draft.revision, ...extra });
  const send = (intent, payload, extra = {}) => runKfoodLiveChangeCommand(request(), fixture.route.id, intent, JSON.stringify(payload), { ...options, ...extra });
  const driverToken = signDriverRouteToken({ accountId: fixture.account.id, routePlanId: fixture.route.id, tokenVersion: fixture.account.tokenVersion, subject: `driver-account:${fixture.account.id}`, expiresInSeconds: 300 }, { secret: driverSecret }).token;
  const driverRead = async () => {
    const response = await fetch(`${apiUrl}/driver/routes/${fixture.route.id}/live-change`, { headers: { authorization: `Bearer ${driverToken}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    return (await response.json()).data;
  };
  const initial = await read();
  assert.equal(initial.revision, 0);
  assert.equal(initial.expectedRouteVersionId, fixture.version.id);
  assert.deepEqual(initial.editableFutureStopIds, fixture.stops.slice(2).map((stop) => stop.id));
  expectError(await fetchKfoodLiveChange(request(null), fixture.route.id, options), "DELIVERY_SESSION_TOKEN_MISSING");
  assert.equal((await fetch(`${apiUrl}/admin/route-plans/${fixture.route.id}/live-change`)).status, 401);
  expectError(await fetchKfoodLiveChange(request(jwt("foreign.myshopify.com", clientId, clientSecret)), fixture.route.id, options), "NOT_FOUND", 404);
  await assert.rejects(() => fetchKfoodLiveChange(request(jwt(shopDomain, clientId, "incorrect-secret")), fixture.route.id, options), (error) => error instanceof Response && error.status === 401);
  mark("actual HTTP authentication, tenant scope and canonical route/version guards");
  const upstreamBefore = await prisma.order.findMany({ where: { shopId: fixture.shop.id }, orderBy: { name: "asc" } });
  const executionBefore = await prisma.driverEvent.findMany({ where: { routePlanId: fixture.route.id }, orderBy: { id: "asc" } });
  const futureOrder = [fixture.stops[2], fixture.stops[6], fixture.stops[5], fixture.stops[4], fixture.stops[3]].map((stop) => stop.id);
  const save = command(initial, { stopOverrides: [{ deliveryStopId: fixture.stops[6].id, address1: "700 Synthetic Verified Avenue", latitude: 43.57, longitude: -80.57 }], futureStopOrder: futureOrder });
  const lost = await send("liveChangeSave", save, { fetch: loseReplyAfterCommit("PATCH", "/live-change") });
  assert.equal(lost.outcomeUnknown, true);
  const saved = ok(await send("liveChangeSave", save));
  assert.equal(saved.revision, 1);
  assert.equal((await prisma.deliveryStop.findUniqueOrThrow({ where: { id: fixture.stops[6].id } })).address1, "7 Integration Road");
  assert.equal(await prisma.routeLiveChangeCommandReceipt.count({ where: { routePlanId: fixture.route.id, commandId: save.commandId } }), 1);
  assert.deepEqual(await prisma.driverEvent.findMany({ where: { routePlanId: fixture.route.id }, orderBy: { id: "asc" } }), executionBefore);
  expectError(await send("liveChangeSave", { ...save, stopOverrides: [{ ...save.stopOverrides[0], address1: "Changed command content" }] }), "IDEMPOTENCY_CONFLICT", 409);
  expectError(await send("liveChangeSave", { ...save, commandId: randomUUID() }), "REVISION_CONFLICT", 409);
  mark("Save remains private; lost reply retries the immutable command; command reuse and revision conflicts are preserved");
  primeDeliveryApiGetResponseCache(request(), `/admin/route-plans/${fixture.route.id}`, { data: { routePlan: { id: fixture.route.id, name: "stale marker" } }, errors: [] }, { cacheKey: session.shop });
  assert.equal((await fetchDeliveryRoutePlanDetail(request(), fixture.route.id, { cacheKey: session.shop })).routePlan.name, "stale marker");
  const dispatch = command(saved);
  assert.equal((await send("liveChangeDispatch", dispatch, { fetch: loseReplyAfterCommit("POST", "/live-change/dispatch") })).outcomeUnknown, true);
  assert.notEqual((await fetchDeliveryRoutePlanDetail(request(), fixture.route.id, { cacheKey: session.shop })).routePlan.name, "stale marker");
  const published = ok(await send("liveChangeDispatch", dispatch));
  const repeated = ok(await send("liveChangeDispatch", dispatch));
  assert.equal(repeated.publicationVersionId, published.publicationVersionId);
  assert.equal(ok(await send("liveChangeDispatch", command(await read()))).publicationVersionId, published.publicationVersionId);
  assert.equal(await prisma.routeLiveChangePublication.count({ where: { routePlanId: fixture.route.id, sequence: { gt: 0 } } }), 1);
  assert.equal(published.geometry.status, "unavailable");
  assert.equal(published.notification.status, "FAILED");
  assert.notEqual((await fetchDeliveryRoutePlanDetail(request(), fixture.route.id, { cacheKey: session.shop })).routePlan.name, "stale marker");
  const publishedStops = await prisma.routePlanStop.findMany({ where: { routePlanId: fixture.route.id }, orderBy: { sequence: "asc" } });
  assert.deepEqual(publishedStops.map((stop) => stop.deliveryStopId), [fixture.stops[0].id, fixture.stops[1].id, ...futureOrder]);
  assert.equal((await prisma.deliveryStop.findUniqueOrThrow({ where: { id: fixture.stops[6].id } })).address1, "700 Synthetic Verified Avenue");
  assert.equal((await prisma.deliveryStop.findUniqueOrThrow({ where: { id: fixture.stops[1].id } })).status, "ARRIVED");
  assert.equal((await driverRead()).pending, true);
  assert.deepEqual(await prisma.driverEvent.findMany({ where: { routePlanId: fixture.route.id }, orderBy: { id: "asc" } }), executionBefore);
  assert.deepEqual(await prisma.order.findMany({ where: { shopId: fixture.shop.id }, orderBy: { name: "asc" } }), upstreamBefore);
  mark("Dispatch survives lost reply with one publication, preserves current stop and Shopify upstream, invalidates route cache, and stays driver-pending");
  const blocked = ok(await send("liveChangeSave", command(await read(), { stopOverrides: [{ deliveryStopId: fixture.stops[2].id, address1: "300 Stranded Synthetic Draft", latitude: 43.53, longitude: -80.53 }] })));
  await events.recordDriverEvent({ shopId: fixture.shop.id, shopDomain, driverId: fixture.driver.id, routePlanId: fixture.route.id, assignmentGeneration: "2", expectedRouteVersionId: fixture.version.id, driverContractVersion: 2, deliveryStopId: fixture.stops[1].id, clientEventId: randomUUID(), eventType: "STOP_DELIVERED", occurredAt: new Date(), latitude: null, longitude: null, payload: { source: "synthetic-local-integration" } });
  expectError(await send("liveChangeDispatch", command(blocked)), "STOP_NOT_FUTURE", 409);
  assert.equal((await read()).hasUnpublishedChanges, true);
  const discardCommand = command(await read());
  assert.equal((await send("liveChangeDiscard", discardCommand, { fetch: loseReplyAfterCommit("POST", "/live-change/discard") })).outcomeUnknown, true);
  const discarded = ok(await send("liveChangeDiscard", discardCommand));
  assert.equal(discarded.revision, blocked.revision + 1);
  assert.equal(discarded.hasUnpublishedChanges, false);
  assert.deepEqual(ok(await send("liveChangeDiscard", discardCommand)), discarded);
  assert.equal((await prisma.deliveryStop.findUniqueOrThrow({ where: { id: fixture.stops[2].id } })).address1, "3 Integration Road");
  assert.equal(await prisma.routeLiveChangePublication.count({ where: { routePlanId: fixture.route.id, sequence: { gt: 0 } } }), 1);
  mark("driver progression blocks stranded draft; explicit Discard restores publication and survives lost reply with exact command replay");
  const noLocation = ok(await send("liveChangeSave", command(await read(), { stopOverrides: [{ deliveryStopId: fixture.stops[6].id, address1: "700 Second Synthetic Address" }] })));
  expectError(await send("liveChangeDispatch", command(noLocation)), "STOP_LOCATION_NOT_ROUTEABLE", 409);
  const restoredCoordinates = ok(await send("liveChangeSave", command(await read(), { stopOverrides: [{ deliveryStopId: fixture.stops[6].id, latitude: 43.58, longitude: -80.58 }] })));
  const second = ok(await send("liveChangeDispatch", command(restoredCoordinates)));
  assert.notEqual(second.publicationVersionId, published.publicationVersionId);
  assert.equal(second.sequence, 2);
  assert.deepEqual(ok(await send("liveChangeDiscard", discardCommand)), discarded);
  assert.equal((await read()).revision, restoredCoordinates.revision);
  assert.equal((await driverRead()).publicationVersionId, second.publicationVersionId);
  mark("Discard permits fresh future editing; missing coordinates block Dispatch; exact old receipt retry is followed by fresh authoritative GET");
  const sourceSha = run("git", ["rev-parse", "HEAD"], { cwd: serverRoot });
  const result = {
    verifiedAt: new Date().toISOString(), status: "pass", serverSourceSha: sourceSha,
    environment: { database: "temporary PostgreSQL 17 cluster; 127.0.0.1 only; migrations from PR486", transport: "actual loopback Fastify HTTP", commerce: "synthetic seven-stop route and locally signed JWTs", shopifyBoundary: "actual BFF helpers with real fetch; authenticated session provided by test", providers: "disabled push; no routing/geocoding provider" },
    checks,
    limitations: ["Shopify platform authentication and embedded iframe require separate authenticated store verification", "Map/geocode provider calls and driver application Apply are outside this local run"],
    cleanup: "HTTP server, Prisma client and temporary PostgreSQL cluster are closed and removed in finally",
  };
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: result.status, checks: checks.length, serverSourceSha: sourceSha, resultPath }));
} finally {
  await app?.close();
  await prisma?.$disconnect();
  await unregister?.();
  if (pgStarted) run(join(pgBin, "pg_ctl"), ["-D", join(temp, "pg"), "-m", "immediate", "-w", "stop"]);
  await rm(temp, { recursive: true, force: true });
}

function jwt(shopDomain, clientId, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ aud: clientId, dest: `https://${shopDomain}`, iss: `https://${shopDomain}/admin`, sub: "synthetic-office", exp: now + 300, nbf: now - 1 })).toString("base64url");
  return `${header}.${claims}.${createHmac("sha256", secret).update(`${header}.${claims}`).digest("base64url")}`;
}

async function seedFixture(database, appId, shopDomain) {
  // Mirrors PR486's seven-stop fixture: stop 1 completed, stop 2 arrived, stops 3–7 future.
  const now = new Date();
  const shop = await database.shop.create({ data: { appId, shopDomain } });
  const account = await database.driverAccount.create({ data: { phone: `synthetic-${randomUUID()}` } });
  const driver = await database.driver.create({ data: { accountId: account.id, authSubject: randomUUID(), displayName: "Synthetic Driver", shopId: shop.id } });
  const route = await database.routePlan.create({ data: { shopId: shop.id, driverId: driver.id, name: "Synthetic seven-stop route", planDate: now, constraints: { timezone: "America/Toronto" }, metrics: {}, optimizerVersion: "synthetic-local-integration", status: "IN_PROGRESS", assignmentGeneration: 2n } });
  const group = await database.routeGrouping.create({ data: { shopId: shop.id, name: "Synthetic group", planDate: now } });
  const parent = await database.routeGroupingVersion.create({ data: { shopId: shop.id, groupingId: group.id, version: 1 } });
  const version = await database.routeGroupingChildVersion.create({ data: { shopId: shop.id, groupingId: group.id, groupingVersionId: parent.id, routePlanId: route.id, driverId: driver.id, version: 1, snapshot: {}, publishedAt: now } });
  const stops = [];
  for (let index = 0; index < 7; index += 1) {
    const sourceOrderId = `gid://shopify/Order/synthetic-${index + 1}`;
    const order = await database.order.create({ data: { shopId: shop.id, name: `#synthetic-${index + 1}`, rawPayload: { shippingAddress: { address1: `${index + 1} Integration Road` }, source: "immutable-test-source" }, shopifyOrderGid: sourceOrderId, currentRouteVersionId: version.id } });
    const stop = await database.deliveryStop.create({ data: { shopId: shop.id, orderId: order.id, address1: `${index + 1} Integration Road`, city: "Synthetic City", countryCode: "CA", latitude: 43.4 + index / 100, longitude: -80.4 - index / 100, status: index === 0 ? "DELIVERED" : index === 1 ? "ARRIVED" : "ASSIGNED" } });
    await database.routePlanStop.create({ data: { shopId: shop.id, routePlanId: route.id, deliveryStopId: stop.id, sequence: index + 1, estimatedArrivalAt: new Date(now.getTime() + index * 60_000), durationFromPreviousSeconds: 60, distanceFromPreviousMeters: 1000, etaInputRouteVersionId: version.id, etaStatus: "READY", etaCalculatedAt: now, etaSource: "SYNTHETIC" } });
    stops.push(stop);
  }
  await database.routeGroupingChildVersion.update({ where: { id: version.id }, data: { snapshot: { membershipSchemaVersion: 1, stops: stops.map((stop, index) => ({ sequence: index + 1, deliveryStopId: stop.id, orderId: stop.orderId, sourceOrderId: `gid://shopify/Order/synthetic-${index + 1}`, address1: stop.address1, latitude: stop.latitude.toString(), longitude: stop.longitude.toString() })) } } });
  for (const [eventType, stopIndex] of [["ROUTE_STARTED", null], ["PICKUP_COMPLETED", null], ["STOP_DELIVERED", 0], ["STOP_ARRIVED", 1]]) {
    await database.driverEvent.create({ data: { shopId: shop.id, driverId: driver.id, routePlanId: route.id, routeVersionId: version.id, assignmentGeneration: 2n, expectedRouteVersionId: version.id, driverContractVersion: 2, clientEventId: randomUUID(), eventType, occurredAt: new Date(now.getTime() - 60_000), payload: { source: "synthetic-seed" }, ...(stopIndex === null ? {} : { deliveryStopId: stops[stopIndex].id }) } });
  }
  return { shop, account, driver, route, version, group, stops };
}
