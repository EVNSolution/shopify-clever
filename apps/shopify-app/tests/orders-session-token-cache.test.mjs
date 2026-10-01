import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  createOrdersResourceSessionTokenGetter,
} from "../app/features/orders/orders-session-token-cache.js";

test("Orders resource session tokens are fresh for sequential requests", async () => {
  let calls = 0;
  const getToken = createOrdersResourceSessionTokenGetter(async () => {
    calls += 1;
    return `token-${calls}`;
  });

  assert.equal(await getToken(), "token-1");
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

test("Orders resource token getter never persists or logs credentials", () => {
  const source = readFileSync(
    join(process.cwd(), "app/features/orders/orders-session-token-cache.js"),
    "utf8",
  );

  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|console\./);
});
