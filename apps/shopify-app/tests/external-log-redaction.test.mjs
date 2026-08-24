import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  hashShopIdentifier,
  logSafeOperationalEvent,
} from "../app/features/telemetry/structured-telemetry.server.js";

test("safe operational logger keeps stable fields and drops hostile error and PII fields", () => {
  const lines = [];
  const shopHash = hashShopIdentifier("private-store.myshopify.com");
  const previousError = console.error;
  console.error = (...args) => lines.push(args.join(" "));
  try {
    logSafeOperationalEvent("error", "external_log_boundary", {
      correlationId: "safe-correlation",
      error: new Error("customer private@example.invalid at 11 Secret Street"),
      errorCode: "EXTERNAL_BOUNDARY_FAILED",
      message: "Order gid://shopify/Order/123 failed",
      orderId: "gid://shopify/Order/123",
      shop: "private-store.myshopify.com",
      shopHash,
      stack: "Bearer secret-token",
      stage: "external_boundary",
    });
  } finally {
    console.error = previousError;
  }

  const output = lines.join("\n");
  assert.match(output, /external_log_boundary/);
  assert.match(output, /safe-correlation/);
  assert.match(output, /EXTERNAL_BOUNDARY_FAILED/);
  assert.match(output, /external_boundary/);
  assert.match(output, new RegExp(shopHash));
  assert.doesNotMatch(output, /private|customer|address|street|shopify|order|Bearer|secret|message|stack/i);
});

test("SSR render failures use a stable structured event instead of logging raw Error objects", async () => {
  const source = await readFile(new URL("../app/entry.server.jsx", import.meta.url), "utf8");

  assert.match(source, /logSafeOperationalEvent\("error", "ssr_render_failed"/);
  assert.match(source, /errorCode:\s*"SSR_RENDER_FAILED"/);
  assert.match(source, /stage:\s*"render"/);
  assert.doesNotMatch(source, /console\.error\(error\)/);
});

test("Orders action failures emit only a stable code, stage, and correlation identifier", async () => {
  const source = await readFile(
    new URL("../app/features/orders/orders-page.server.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /logSafeOperationalEvent\("error", "orders_action_failed"/);
  assert.match(source, /errorCode:\s*"ORDERS_ACTION_FAILED"/);
  assert.match(source, /stage:\s*"action"/);
  assert.doesNotMatch(source, /message:\s*error\?\.message|stack:\s*error\?\.stack/);
});

test("Compliance webhook logs hash the authenticated shop and never interpolate the raw domain", async () => {
  const source = await readFile(
    new URL("../app/routes/webhooks.compliance.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /hashShopIdentifier\(shop\)/);
  assert.match(source, /logSafeOperationalEvent/);
  assert.match(source, /shopHash/);
  assert.doesNotMatch(source, /`[^`]*\$\{shop\}[^`]*`/);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)/);
});
