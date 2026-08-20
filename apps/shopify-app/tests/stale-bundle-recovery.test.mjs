import assert from "node:assert/strict";
import test from "node:test";

import {
  createStaleBundleRecoveryHandler,
  STALE_BUNDLE_RECOVERY_KEY,
} from "../app/features/runtime/stale-bundle-recovery.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function preloadError(message = "Unable to preload /assets/route-old.js") {
  return {
    payload: new Error(message),
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

test("First stale Vite preload failure reloads once", () => {
  const storage = memoryStorage();
  let reloads = 0;
  const handler = createStaleBundleRecoveryHandler({
    now: () => 1_000,
    reload: () => { reloads += 1; },
    renderFallback: () => assert.fail("first failure should reload"),
    storage,
  });
  const event = preloadError();

  handler(event);

  assert.equal(event.prevented, true);
  assert.equal(reloads, 1);
  assert.match(storage.getItem(STALE_BUNDLE_RECOVERY_KEY), /route-old/u);
});

test("Repeated failure for the same stale chunk renders a fallback without a reload loop", () => {
  const storage = memoryStorage();
  let reloads = 0;
  let fallbacks = 0;
  const options = {
    now: () => 1_000,
    reload: () => { reloads += 1; },
    renderFallback: () => { fallbacks += 1; },
    storage,
  };

  createStaleBundleRecoveryHandler(options)(preloadError());
  createStaleBundleRecoveryHandler(options)(preloadError());

  assert.equal(reloads, 1);
  assert.equal(fallbacks, 1);
});

test("Different stale chunks share one page-level reload budget", () => {
  const storage = memoryStorage();
  let reloads = 0;
  let fallbacks = 0;
  const handler = createStaleBundleRecoveryHandler({
    now: () => 1_000,
    reload: () => { reloads += 1; },
    renderFallback: () => { fallbacks += 1; },
    storage,
  });

  handler(preloadError("Unable to preload /assets/route-a.js"));
  handler(preloadError("Unable to preload /assets/route-b.js"));

  assert.equal(reloads, 1);
  assert.equal(fallbacks, 1);
});

test("A stale preload failure after the cooldown can recover again", () => {
  const storage = memoryStorage();
  let now = 1_000;
  let reloads = 0;
  const handler = createStaleBundleRecoveryHandler({
    cooldownMs: 60_000,
    now: () => now,
    reload: () => { reloads += 1; },
    renderFallback: () => assert.fail("cooldown elapsed"),
    storage,
  });

  handler(preloadError());
  now = 61_001;
  handler(preloadError());

  assert.equal(reloads, 2);
});

test("Unavailable sessionStorage still caps reloads in memory", () => {
  let reloads = 0;
  let fallbacks = 0;
  const handler = createStaleBundleRecoveryHandler({
    now: () => 1_000,
    reload: () => { reloads += 1; },
    renderFallback: () => { fallbacks += 1; },
    storage: {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
    },
  });

  handler(preloadError());
  handler(preloadError());

  assert.equal(reloads, 1);
  assert.equal(fallbacks, 1);
});

test("Stale bundle markers never persist URL query credentials", () => {
  const storage = memoryStorage();
  const handler = createStaleBundleRecoveryHandler({
    now: () => 1_000,
    reload: () => {},
    storage,
  });

  handler(preloadError("Unable to preload https://app.example/assets/route-old.js?id_token=secret#chunk"));

  const marker = storage.getItem(STALE_BUNDLE_RECOVERY_KEY);
  assert.match(marker, /\/assets\/route-old\.js/u);
  assert.doesNotMatch(marker, /id_token|secret|#chunk/u);
});
