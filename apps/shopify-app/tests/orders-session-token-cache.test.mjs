import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  createOrdersResourceSessionTokenGetter,
  getOrdersSessionTokenCacheExpiry,
} from "../app/features/orders/orders-session-token-cache.js";

function encodeJwt(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encodedPayload}.signature`;
}

test("Orders resource session tokens are reused only inside the short in-memory window", async () => {
  let nowMs = 1_000;
  let calls = 0;
  const getToken = createOrdersResourceSessionTokenGetter(async () => {
    calls += 1;
    return `token-${calls}`;
  }, {
    fallbackCacheMs: 5_000,
    maxCacheMs: 5_000,
    now: () => nowMs,
  });

  assert.equal(await getToken(), "token-1");
  nowMs = 5_999;
  assert.equal(await getToken(), "token-1");
  assert.equal(calls, 1);

  nowMs = 6_000;
  assert.equal(await getToken(), "token-2");
  assert.equal(calls, 2);
});

test("Orders resource session token acquisition coalesces concurrent App Bridge requests", async () => {
  let resolveToken;
  let calls = 0;
  const tokenPromise = new Promise((resolve) => {
    resolveToken = resolve;
  });
  const getToken = createOrdersResourceSessionTokenGetter(() => {
    calls += 1;
    return tokenPromise;
  });

  const first = getToken();
  const second = getToken();
  resolveToken("shared-token");

  assert.deepEqual(await Promise.all([first, second]), ["shared-token", "shared-token"]);
  assert.equal(calls, 1);
});

test("Orders resource session token cache respects JWT expiry leeway and maximum TTL", () => {
  const nowMs = 1_000_000;
  assert.equal(
    getOrdersSessionTokenCacheExpiry(encodeJwt({ exp: (nowMs + 120_000) / 1000 }), { nowMs }),
    nowMs + 30_000,
  );
  assert.equal(
    getOrdersSessionTokenCacheExpiry(encodeJwt({ exp: (nowMs + 15_000) / 1000 }), { nowMs }),
    nowMs + 5_000,
  );
});

test("Orders resource token cache never persists or logs credentials", () => {
  const source = readFileSync(
    join(process.cwd(), "app/features/orders/orders-session-token-cache.js"),
    "utf8",
  );

  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|console\./);
});
