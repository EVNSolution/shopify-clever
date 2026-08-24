import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  hashShopIdentifier,
  logSafeOperationalEvent,
  logStructuredMetric,
} from "../app/features/telemetry/structured-telemetry.server.js";
import { deliveryApiRequest } from "../app/features/delivery/route-plans.server.js";

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

test("structured metrics reject hostile event names and metric name overrides", () => {
  const lines = [];
  const previousInfo = console.info;
  console.info = (...args) => lines.push(args.join(" "));
  try {
    logStructuredMetric("customer private@example.invalid", {
      customer: "Private Customer",
      name: "Order gid://shopify/Order/123",
      token: "Bearer secret-token",
    });
  } finally {
    console.info = previousInfo;
  }

  const output = lines.join("\n");
  assert.match(output, /telemetry_metric/);
  assert.doesNotMatch(output, /private|customer|shopify|order|Bearer|secret|token/i);
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
  const routeSource = await readFile(
    new URL("../app/routes/webhooks.compliance.jsx", import.meta.url),
    "utf8",
  );
  const source = await readFile(
    new URL("../app/features/delivery/compliance-webhook-admission.server.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /hashShopIdentifier\(shop\)/);
  assert.match(source, /logSafeOperationalEvent/);
  assert.match(source, /shopHash/);
  assert.doesNotMatch(source, /`[^`]*\$\{shop\}[^`]*`/);
  assert.doesNotMatch(source + routeSource, /console\.(?:log|warn|error)/);
});

test("Shopify lifecycle webhook logs hash shops and never interpolate authenticated domains", async () => {
  for (const relativePath of [
    "../app/routes/webhooks.app.scopes_update.jsx",
    "../app/routes/webhooks.app.uninstalled.jsx",
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /hashShopIdentifier\(shop\)/, relativePath);
    assert.match(source, /logSafeOperationalEvent/, relativePath);
    assert.doesNotMatch(source, /`[^`]*\$\{shop\}[^`]*`/, relativePath);
    assert.doesNotMatch(source, /console\.(?:log|warn|error)/, relativePath);
  }
});

test("Delivery and browser error boundaries never log arbitrary messages, stacks, or status text", async () => {
  const delivery = await readFile(
    new URL("../app/features/delivery/route-plans.server.js", import.meta.url),
    "utf8",
  );
  const routeDetail = await readFile(
    new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url),
    "utf8",
  );
  const adminBoundary = await readFile(
    new URL("../app/ui/admin-route-error-boundary.jsx", import.meta.url),
    "utf8",
  );

  assert.match(delivery, /logSafeOperationalEvent\("warn", "delivery_api_request_failed"/);
  assert.doesNotMatch(delivery, /message:\s*sanitizeTelemetryValue\(error\?\.message\)/);
  assert.doesNotMatch(routeDetail, /console\.warn\([^\n]*error/);
  assert.doesNotMatch(adminBoundary, /statusText:\s*typeof error\?\.statusText/);
});

test("Delivery network failures keep hostile error messages out of every external log", async () => {
  const previousUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  const lines = [];
  const previousWarn = console.warn;
  const previousInfo = console.info;
  console.warn = (...args) => lines.push(args.join(" "));
  console.info = (...args) => lines.push(args.join(" "));
  try {
    const result = await deliveryApiRequest(
      new Request("https://app.invalid/app", { headers: { authorization: "Bearer session-secret" } }),
      "/admin/orders",
      {
        fetch: async () => {
          throw new Error("customer private@example.invalid at 11 Secret Street, Bearer token-secret");
        },
      },
    );
    assert.equal(result.errors.length, 1);
  } finally {
    console.warn = previousWarn;
    console.info = previousInfo;
    if (previousUrl === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previousUrl;
  }

  const output = lines.join("\n");
  assert.match(output, /DELIVERY_API_ERROR/);
  assert.doesNotMatch(output, /private|customer|street|@|Bearer|token-secret|session-secret/i);
});

test("Application runtime console sinks are centralized behind allowlisted telemetry", async () => {
  const appRoot = new URL("../app/", import.meta.url);
  const allowed = new Set([
    "features/telemetry/structured-telemetry.server.js",
    "routes/_index/route.jsx",
    "routes/app._index.jsx",
    "routes/app.jsx",
    "routes/perf.jsx",
  ]);
  const files = await collectRuntimeFiles(appRoot);
  const violations = [];

  for (const file of files) {
    const relativePath = file.href.slice(appRoot.href.length);
    if (allowed.has(relativePath) || /\.test\.js$/u.test(relativePath)) continue;
    const source = await readFile(file, "utf8");
    if (/\bconsole\.(?:debug|error|info|log|warn)\b/u.test(source)) violations.push(relativePath);
  }

  assert.deepEqual(violations, []);
});

test("Service error diagnostics retain stable codes and status without raw message or path", async () => {
  const source = await readFile(
    new URL("../app/features/service-errors.js", import.meta.url),
    "utf8",
  );
  const diagnosticsBlock = source.slice(
    source.indexOf("function reportServiceErrorDiagnostics"),
    source.length,
  );

  assert.match(diagnosticsBlock, /code:/);
  assert.match(diagnosticsBlock, /status:/);
  assert.doesNotMatch(diagnosticsBlock, /message:|path:/);
});

async function collectRuntimeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...await collectRuntimeFiles(child));
    else if (/\.(?:js|jsx|mjs)$/u.test(entry.name)) files.push(child);
  }
  return files;
}
