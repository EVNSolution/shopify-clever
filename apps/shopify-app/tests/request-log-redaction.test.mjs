import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { redactSensitiveRequestLogValues } from "../scripts/start-server.mjs";

test("redacts Shopify embedded authentication query values from request logs", () => {
  const line =
    "GET /app/orders.data?embedded=1&hmac=secret-hmac&id_token=secret-token&session=secret-session&shop=store.myshopify.com 200 - - 402.522 ms";

  const redacted = redactSensitiveRequestLogValues(line);

  assert.equal(
    redacted,
    "GET /app/orders.data?embedded=1&hmac=REDACTED&id_token=REDACTED&session=REDACTED&shop=store.myshopify.com 200 - - 402.522 ms",
  );
  assert.equal(redacted.includes("secret-"), false);
});

test("redacts sensitive keys case-insensitively without changing safe request details", () => {
  const line = "POST /auth/callback?HMAC=abc&Session=def&locale=ko 302 0 - 12.4 ms";

  assert.equal(
    redactSensitiveRequestLogValues(line),
    "POST /auth/callback?HMAC=REDACTED&Session=REDACTED&locale=ko 302 0 - 12.4 ms",
  );
});

test("production start routes React Router output through the redacting wrapper", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageJson.scripts.start,
    "node ./scripts/start-server.mjs ./build/server/index.js",
  );
});
