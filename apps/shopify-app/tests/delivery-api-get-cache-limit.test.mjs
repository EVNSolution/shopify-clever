/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchDeliveryRoutePlans,
  primeDeliveryApiGetResponseCache,
} from "../app/features/delivery/route-plans.server.js";

process.env.CLEVER_DELIVERY_API_URL = "https://synthetic-cache-limit.test";
process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS = "15000";

function fixture(count) {
  const keys = Array.from({ length: count }, (_, index) => `synthetic-shop-${index}`);
  const reads = [];
  const attempts = new Map();
  const gates = new Map(keys.map(key => {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    return [key, { promise, release }];
  }));
  const transport = async (_url, options) => {
    const key = options.headers.authorization.slice("Bearer ".length);
    reads.push(key);
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    const { status = "READY", statusCode = 200 } = await gates.get(key).promise;
    // Failed first reads must be retryable. Every upstream call gets a new body.
    if (attempt === 1 && statusCode !== 200) {
      return Response.json({ error: { message: "Synthetic read failure" } }, { status: statusCode });
    }
    return Response.json({ data: { routePlans: [{ id: key, status }] } });
  };
  const request = key => new Request("https://synthetic-app.test/app/routes", {
    headers: { authorization: `Bearer ${key}` },
  });
  const options = key => ({ cacheKey: key, fetch: transport });
  const read = (key, extra = {}) => fetchDeliveryRoutePlans(request(key), { ...options(key), ...extra });
  return {
    keys, reads, request, options, read,
    release(key, result = {}) { gates.get(key).release(result); },
    start(extra = {}) { return keys.map(key => read(key, extra)); },
  };
}

async function countRetained(f) {
  let retained = 0;
  // Read newest keys first so filling an evicted oldest key cannot hide a hit.
  for (const key of [...f.keys].reverse()) {
    const before = f.reads.length;
    const result = await f.read(key);
    assert.equal(result.errors.length, 0);
    assert.equal(result.routePlans[0].id, key);
    if (f.reads.length === before) retained += 1;
  }
  return retained;
}

test("101 concurrent shop reads retain only 100 completed cache entries", async () => {
  const f = fixture(101);
  const pending = f.start();
  assert.equal(f.reads.length, 101);
  for (const key of f.keys) f.release(key);
  const results = await Promise.all(pending);
  assert.ok(results.every(result => result.errors.length === 0 && result.routePlans[0].status === "READY"));
  assert.equal(f.reads.length, 101);
  assert.equal(await countRetained(f), 100, "settlement must restore the completed cache's 100-entry limit");
  assert.equal(f.reads.length, 102, "one evicted key must refetch after all requests have completed");
});

test("mixed success and failure settlement keeps at most 100 entries and permits retries", async () => {
  const f = fixture(125);
  const pending = f.start();
  for (const key of f.keys.slice(0, 5)) f.release(key, { statusCode: 503 });
  const failures = await Promise.all(pending.slice(0, 5));
  assert.ok(failures.every(result => result.errors.length === 1));
  for (const key of f.keys.slice(5)) f.release(key, { status: "INCOMPLETE" });
  const successes = await Promise.all(pending.slice(5));
  assert.ok(successes.every(result => result.errors.length === 0 && result.routePlans[0].status === "INCOMPLETE"));
  assert.equal(f.reads.length, 125);
  assert.equal(await countRetained(f), 100, "failed reads must not leave the completed cache above its limit");
  assert.equal(f.reads.length, 150, "20 evicted successes and 5 failed keys need fresh reads");
});

test("overflow settlement protects a pending key and shares normal and explicit refresh reads", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const f = fixture(101);
  const pending = f.start({ refreshCache: true });
  for (const key of f.keys.slice(0, 100)) f.release(key);
  await Promise.all(pending.slice(0, 100));
  now += 15001;
  const key = f.keys[100];
  const normal = f.read(key);
  const refresh = f.read(key, { refreshCache: true });
  assert.equal(f.reads.length, 101, "pruning and TTL cannot discard the pending request or duplicate upstream work");
  f.release(key, { status: "INCOMPLETE" });
  for (const result of await Promise.all([pending[100], normal, refresh])) {
    assert.equal(result.routePlans[0].status, "INCOMPLETE");
    assert.equal(result.errors.length, 0);
  }
  now += 14999;
  assert.equal((await f.read(key)).routePlans[0].status, "INCOMPLETE");
  assert.equal(f.reads.length, 101, "the retained request receives its full TTL after completion");
  now += 1;
  await f.read(key);
  assert.equal(f.reads.length, 102, "normal TTL expiry remains effective");
});

for (const statusCode of [200, 503, 401]) {
  test(`an old ${statusCode} response cannot replace, remove or extend a newer cache entry`, async (t) => {
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    const f = fixture(1);
    const key = f.keys[0];
    const oldRead = f.read(key, { refreshCache: true });
    now += 1000;
    assert.equal(primeDeliveryApiGetResponseCache(f.request(key), "/admin/route-plans", {
      data: { routePlans: [{ id: key, status: "INCOMPLETE" }] }, errors: [],
    }, f.options(key)), true);
    now += 2000;
    f.release(key, { statusCode });
    if (statusCode === 401) await assert.rejects(oldRead, error => error instanceof Response && error.status === 401);
    else assert.equal((await oldRead).errors.length, statusCode === 200 ? 0 : 1);
    assert.equal((await f.read(key)).routePlans[0].status, "INCOMPLETE");
    assert.equal(f.reads.length, 1, "the newer cache value survives the older success or failure");
    now += 13000;
    await f.read(key);
    assert.equal(f.reads.length, 2, "the older completion cannot extend the newer entry's TTL");
  });
}
