/* eslint-env node */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  forwardShopifyWebhookToDeliveryApi,
  getForwardedWebhookHeaders,
  normalizeOrderWebhookTopic,
  ORDER_WEBHOOK_TOPICS,
} from "../app/features/delivery/webhook-forwarding.server.js";
import {
  DEFAULT_ORDER_WEBHOOK_MAX_BODY_BYTES,
  MAX_ORDER_WEBHOOK_MAX_BODY_BYTES,
  createOrderWebhookAction,
  readBoundedOrderWebhookRawBody,
  resolveOrderWebhookMaxBodyBytes,
} from "../app/features/delivery/order-webhook-admission.server.js";
import { validateShopifyOrderWebhook } from "../app/features/delivery/shopify-webhook-validation.server.js";

const root = process.cwd();
const expectedOrderTopics = [
  "orders/create",
  "orders/updated",
  "orders/edited",
  "orders/cancelled",
  "orders/delete",
  "orders/fulfilled",
  "orders/partially_fulfilled",
];

function parseTopics(block) {
  return [...block.matchAll(/"([^"]+)"/g)].map(([, topic]) => topic);
}

test("Shopify app configs subscribe the same order webhook topics without fulfillment scope", () => {
  for (const configFile of [
    "shopify.app.toml",
    "shopify.app.dev.toml",
    "shopify.app.kfood.toml",
  ]) {
    const source = readFileSync(join(root, configFile), "utf8");
    const [, orderTopicsBlock = ""] =
      source.match(/uri = "\/webhooks\/orders"\s+topics = \[([^\]]+)\]/) ?? [];

    assert.deepEqual(parseTopics(orderTopicsBlock), expectedOrderTopics, configFile);
    assert.match(source, /scopes = "read_orders,read_locations,read_customers"/);
    assert.doesNotMatch(source, /\bwrite_(?:orders|customers)\b/);
    assert.doesNotMatch(source, /read_fulfillments/);
    assert.match(source, /compliance_topics = \["customers\/data_request", "customers\/redact", "shop\/redact"\]/);
  }

  assert.deepEqual([...ORDER_WEBHOOK_TOPICS], expectedOrderTopics);
});

test("order webhook route is session-free and never loads session storage or offline refresh", () => {
  const routePath = join(root, "app/routes/webhooks.orders.jsx");
  assert.equal(existsSync(routePath), true);

  const source = readFileSync(routePath, "utf8");
  assert.match(source, /createOrderWebhookAction/);
  assert.doesNotMatch(source, /shopify\.server|authenticate\.webhook|PrismaSessionStorage|ensureValidOfflineSession|offline/i);

  const admissionSource = readFileSync(join(root, "app/features/delivery/order-webhook-admission.server.js"), "utf8");
  const validationSource = readFileSync(join(root, "app/features/delivery/shopify-webhook-validation.server.js"), "utf8");
  assert.match(admissionSource, /readBoundedOrderWebhookRawBody/);
  assert.doesNotMatch(admissionSource, /request\.text\(\)/);
  assert.match(validationSource, /@shopify\/shopify-api/);
  assert.match(validationSource, /api\.webhooks\.validate/);
  assert.doesNotMatch(admissionSource + validationSource, /PrismaSessionStorage|ensureValidOfflineSession|authenticate\.webhook/);
});

test("order webhook body limit defaults to the documented 5 MiB safety budget", () => {
  assert.equal(DEFAULT_ORDER_WEBHOOK_MAX_BODY_BYTES, 5 * 1024 * 1024);
  assert.equal(MAX_ORDER_WEBHOOK_MAX_BODY_BYTES, 10 * 1024 * 1024);
  assert.equal(resolveOrderWebhookMaxBodyBytes(undefined), 5 * 1024 * 1024);
  assert.equal(resolveOrderWebhookMaxBodyBytes("10485760"), 10 * 1024 * 1024);
  assert.throws(() => resolveOrderWebhookMaxBodyBytes("10485761"), /body limit/i);
  for (const relativePath of [
    "../../infra/env/shopify-app.env.example",
    "../../infra/env/shopify-app-clever-route.env.example",
    "../../infra/env/shopify-app-kfood.env.example",
  ]) {
    const envExample = readFileSync(join(root, relativePath), "utf8");
    assert.match(envExample, /SHOPIFY_ORDER_WEBHOOK_MAX_BODY_BYTES=5242880/);
    assert.match(envExample, /default 5 MiB, maximum 10 MiB/);
  }
});

test("order webhook action validates and forwards the exact raw body before durable acknowledgement", async () => {
  const calls = [];
  const action = createOrderWebhookAction({
    admissionMode: () => "session_free",
    validate: async (request, rawBody) => {
      calls.push({ request, rawBody, stage: "validate" });
      return { topic: "ORDERS_UPDATED", valid: true };
    },
    forward: async (request, rawBody, options) => {
      calls.push({ request, rawBody, options, stage: "forward" });
      return { duplicate: false, status: "QUEUED", webhookId: "webhook-id" };
    },
  });
  const rawBody = "{\n  \"id\": 123, \"name\": \"unchanged\"\n}";
  const response = await action({
    request: new Request("https://app.invalid/webhooks/orders", { body: rawBody, method: "POST" }),
  });

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { duplicate: false, status: "QUEUED", webhookId: "webhook-id" });
  assert.equal(calls[0].rawBody, rawBody);
  assert.equal(calls[1].rawBody, rawBody);
  assert.equal(calls[1].options.normalizedTopic, "orders/updated");
});

test("retry fallback remains HMAC-first and does not acknowledge without durable authority", async () => {
  const stages = [];
  const action = createOrderWebhookAction({
    admissionMode: () => "retry",
    validate: async () => {
      stages.push("validated");
      return { topic: "orders/create", valid: true };
    },
    forward: async () => stages.push("forwarded"),
  });

  await assert.rejects(
    () => action({ request: new Request("https://app.invalid/webhooks/orders", { body: "{}", method: "POST" }) }),
    (error) => error instanceof Response && error.status === 503,
  );
  assert.deepEqual(stages, ["validated"]);
});

test("order webhook admission rejects non-POST requests before validation", async () => {
  let validated = false;
  const action = createOrderWebhookAction({
    validate: async () => {
      validated = true;
      return { topic: "orders/create", valid: true };
    },
  });
  await assert.rejects(
    () => action({ request: new Request("https://app.invalid/webhooks/orders", { method: "PUT" }) }),
    (error) => error instanceof Response && error.status === 405,
  );
  assert.equal(validated, false);
});

test("Shopify API webhook primitive receives the original request and raw body", async () => {
  const request = new Request("https://app.invalid/webhooks/orders", { body: "{ \"id\": 1 }", method: "POST" });
  let input;
  const result = await validateShopifyOrderWebhook(request, "{ \"id\": 1 }", {
    validate: async (value) => {
      input = value;
      return { topic: "orders/create", valid: true };
    },
  });
  assert.equal(input.rawBody, "{ \"id\": 1 }");
  assert.equal(input.rawRequest, request);
  assert.equal(result.valid, true);
});

test("supported Shopify HMAC validation passes at and under the body limit and rejects mutation", async () => {
  const previousSecret = process.env.SHOPIFY_API_SECRET;
  const previousKey = process.env.SHOPIFY_API_KEY;
  const previousUrl = process.env.SHOPIFY_APP_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.SHOPIFY_API_SECRET = "reviewed-webhook-secret";
  process.env.SHOPIFY_API_KEY = "reviewed-api-key";
  process.env.SHOPIFY_APP_URL = "https://app.invalid";
  process.env.DATABASE_URL = "file:/definitely-unavailable/session-storage.db";
  try {
    const rawBody = '{"id":123,"customer":{"email":"private@example.invalid"}}';
    const hmac = createHmac("sha256", process.env.SHOPIFY_API_SECRET).update(rawBody).digest("base64");
    const request = new Request("https://app.invalid/webhooks/orders", {
      body: rawBody,
      headers: {
        "content-type": "application/json",
        "x-shopify-api-version": "2026-07",
        "x-shopify-hmac-sha256": hmac,
        "x-shopify-shop-domain": "session-storage-down.myshopify.com",
        "x-shopify-topic": "orders/create",
        "x-shopify-webhook-id": "webhook-hmac-test",
      },
      method: "POST",
    });

    assert.equal((await validateShopifyOrderWebhook(request, rawBody)).valid, true);
    const sessionFreeAction = createOrderWebhookAction({
      forward: async () => ({ duplicate: false, status: "QUEUED", webhookId: "webhook-hmac-test" }),
      maxBodyBytes: Buffer.byteLength(rawBody),
    });
    const sessionFreeResponse = await sessionFreeAction({
      request: new Request(request.url, {
        body: rawBody,
        headers: request.headers,
        method: "POST",
      }),
    });
    assert.equal(sessionFreeResponse.status, 202);
    const underLimitResponse = await createOrderWebhookAction({
      forward: async () => ({ duplicate: false, status: "QUEUED", webhookId: "webhook-hmac-test" }),
      maxBodyBytes: Buffer.byteLength(rawBody) + 1,
    })({
      request: new Request(request.url, {
        body: rawBody,
        headers: request.headers,
        method: "POST",
      }),
    });
    assert.equal(underLimitResponse.status, 202);
    await assert.rejects(
      () => validateShopifyOrderWebhook(request, `${rawBody} `),
      (error) => error instanceof Response && error.status === 401,
    );
  } finally {
    if (previousSecret === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previousSecret;
    if (previousKey === undefined) delete process.env.SHOPIFY_API_KEY;
    else process.env.SHOPIFY_API_KEY = previousKey;
    if (previousUrl === undefined) delete process.env.SHOPIFY_APP_URL;
    else process.env.SHOPIFY_APP_URL = previousUrl;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("limit plus one returns 413 before validation or forwarding for declared and streamed sizes", async () => {
  let streamedBodyCancelled = false;
  const streamedBody = new ReadableStream({
    cancel() {
      streamedBodyCancelled = true;
    },
    start(controller) {
      controller.enqueue(new TextEncoder().encode("12345"));
    },
  });
  const cases = [
    new Request("https://app.invalid/webhooks/orders", {
      body: "12345",
      headers: { "content-length": "5" },
      method: "POST",
    }),
    new Request("https://app.invalid/webhooks/orders", {
      body: streamedBody,
      duplex: "half",
      method: "POST",
    }),
    new Request("https://app.invalid/webhooks/orders", {
      body: "12345",
      headers: { "content-length": "4" },
      method: "POST",
    }),
  ];

  for (const request of cases) {
    const stages = [];
    const action = createOrderWebhookAction({
      forward: async () => stages.push("forward"),
      maxBodyBytes: 4,
      validate: async () => stages.push("validate"),
    });
    await assert.rejects(
      () => action({ request }),
      (error) => error instanceof Response && error.status === 413,
    );
    assert.deepEqual(stages, []);
  }
  assert.equal(streamedBodyCancelled, true);
});

test("split multibyte UTF-8 chunks preserve the exact raw body for validation and forwarding", async () => {
  const expected = '{"city":"키치너🚚"}';
  const bytes = new TextEncoder().encode(expected);
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 11));
      controller.enqueue(bytes.slice(11, 14));
      controller.enqueue(bytes.slice(14, 18));
      controller.enqueue(bytes.slice(18));
      controller.close();
    },
  });
  const observed = [];
  const response = await createOrderWebhookAction({
    admissionMode: () => "session_free",
    forward: async (_request, rawBody) => {
      observed.push(rawBody);
      return { duplicate: false, status: "QUEUED", webhookId: "unicode-webhook" };
    },
    maxBodyBytes: bytes.byteLength,
    validate: async (_request, rawBody) => {
      observed.push(rawBody);
      return { topic: "orders/create", valid: true };
    },
  })({
    request: new Request("https://app.invalid/webhooks/orders", {
      body,
      duplex: "half",
      method: "POST",
    }),
  });

  assert.equal(response.status, 202);
  assert.deepEqual(observed, [expected, expected]);
});

test("invalid body-limit configuration fails closed without reading, validating, or forwarding", async () => {
  const previous = process.env.SHOPIFY_ORDER_WEBHOOK_MAX_BODY_BYTES;
  const stages = [];
  const previousError = console.error;
  console.error = () => {};
  try {
    for (const invalid of ["0", "-1", "1.5", " 5", "10485761", "104857601"]) {
      process.env.SHOPIFY_ORDER_WEBHOOK_MAX_BODY_BYTES = invalid;
      assert.throws(() => resolveOrderWebhookMaxBodyBytes(), /body limit|positive integer/i);
    }
    process.env.SHOPIFY_ORDER_WEBHOOK_MAX_BODY_BYTES = "0";
    const action = createOrderWebhookAction({
      forward: async () => stages.push("forward"),
      readRawBody: async () => stages.push("read"),
      validate: async () => stages.push("validate"),
    });
    await assert.rejects(
      () => action({ request: new Request("https://app.invalid/webhooks/orders", { body: "private", method: "POST" }) }),
      (error) => error instanceof Response && error.status === 503,
    );
    assert.deepEqual(stages, []);
  } finally {
    console.error = previousError;
    if (previous === undefined) delete process.env.SHOPIFY_ORDER_WEBHOOK_MAX_BODY_BYTES;
    else process.env.SHOPIFY_ORDER_WEBHOOK_MAX_BODY_BYTES = previous;
  }
});

test("bounded body reader rejects oversized private content without logging it", async () => {
  const logs = [];
  const previousWarn = console.warn;
  console.warn = (...args) => logs.push(args.join(" "));
  try {
    const action = createOrderWebhookAction({ maxBodyBytes: 4 });
    await assert.rejects(
      () => action({ request: new Request("https://app.invalid/webhooks/orders", { body: "secret", method: "POST" }) }),
      (error) => error instanceof Response && error.status === 413,
    );
    assert.match(logs.join("\n"), /BODY_TOO_LARGE/);
    assert.doesNotMatch(logs.join("\n"), /secret|private|customer|address/i);
  } finally {
    console.warn = previousWarn;
  }
});

test("bounded raw-body reader accepts exactly the configured byte count", async () => {
  const body = "12345";
  const request = new Request("https://app.invalid/webhooks/orders", { body, method: "POST" });
  assert.equal(await readBoundedOrderWebhookRawBody(request, 5), body);
});


test("normalizes Admin GraphQL order webhook topic enums before forwarding", async () => {
  assert.equal(normalizeOrderWebhookTopic("ORDERS_UPDATED"), "orders/updated");
  assert.equal(normalizeOrderWebhookTopic("orders/updated"), "orders/updated");
  assert.equal(normalizeOrderWebhookTopic("PRODUCTS_UPDATE"), null);

  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  try {
    const calls = [];
    const request = new Request("https://app.invalid/webhooks/orders", {
      headers: {
        "x-shopify-topic": "ORDERS_UPDATED",
        "x-shopify-webhook-id": "webhook-id",
      },
      method: "POST",
      body: "{}",
    });

    await forwardShopifyWebhookToDeliveryApi(request, "{}", {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({ data: { duplicate: true, status: "DUPLICATE", webhookId: "webhook-id" }, error: null }, { status: 200 });
      },
      normalizedTopic: "orders/updated",
    });

    assert.equal(calls[0].options.headers.get("x-shopify-topic"), "orders/updated");
  } finally {
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});

test("delivery webhook forwarding preserves raw body and Shopify webhook headers only", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid/";
  try {
    const calls = [];
    const rawBody = '{"id":123}';
    const request = new Request("https://app.invalid/webhooks/orders", {
      headers: {
        "content-type": "application/json",
        "x-extra-header": "skip-me",
        "x-shopify-hmac-sha256": "hmac",
        "x-shopify-shop-domain": "clever.myshopify.com",
        "x-shopify-topic": "orders/updated",
        "x-shopify-webhook-id": "webhook-id",
      },
      method: "POST",
      body: rawBody,
    });

    const receipt = await forwardShopifyWebhookToDeliveryApi(request, rawBody, {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({ data: { duplicate: false, status: "RECEIVED", webhookId: "webhook-id" }, error: null }, { status: 202 });
      },
      correlationId: "correlation-id",
    });

    assert.equal(calls[0].url, "https://delivery.invalid/shopify/webhooks");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.body, rawBody);
    assert.equal(calls[0].options.headers.get("content-type"), "application/json");
    assert.equal(calls[0].options.headers.get("x-shopify-hmac-sha256"), "hmac");
    assert.equal(calls[0].options.headers.get("x-shopify-shop-domain"), "clever.myshopify.com");
    assert.equal(calls[0].options.headers.get("x-shopify-topic"), "orders/updated");
    assert.equal(calls[0].options.headers.get("x-shopify-webhook-id"), "webhook-id");
    assert.equal(calls[0].options.headers.get("x-clever-client-request-id"), "correlation-id");
    assert.equal(calls[0].options.headers.get("x-extra-header"), null);
    assert.equal(getForwardedWebhookHeaders(request.headers).get("x-extra-header"), null);
    assert.deepEqual(receipt, { duplicate: false, status: "RECEIVED", webhookId: "webhook-id" });
  } finally {
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});

test("late order webhook accepts one durable ignored receipt without retry", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  try {
    let deliveryCalls = 0;
    const action = createOrderWebhookAction({
      admissionMode: () => "session_free",
      forward: (request, rawBody, options) => forwardShopifyWebhookToDeliveryApi(request, rawBody, {
        ...options,
        fetch: async () => {
          deliveryCalls += 1;
          return Response.json({
            data: { duplicate: true, status: "IGNORED", webhookId: "late-order-webhook" },
            error: null,
          }, { status: 200 });
        },
      }),
      validate: async () => ({ topic: "orders/create", valid: true }),
    });
    const response = await action({
      request: new Request("https://app.invalid/webhooks/orders", {
        body: "{}",
        headers: { "x-shopify-webhook-id": "late-order-webhook" },
        method: "POST",
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      duplicate: true,
      status: "IGNORED",
      webhookId: "late-order-webhook",
    });
    assert.equal(deliveryCalls, 1);
  } finally {
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});

test("delivery webhook forwarding returns retryable failure for outage, timeout, and malformed/non-durable 2xx", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  try {
    await assert.rejects(
      () =>
        forwardShopifyWebhookToDeliveryApi(
          new Request("https://app.invalid/webhooks/orders", { headers: { "x-shopify-webhook-id": "webhook-id" } }),
          "{}",
          { fetch: async () => new Response(null, { status: 500 }) },
        ),
      (error) => error instanceof Response && error.status === 503,
    );
    for (const fetch of [
      async () => { throw new TypeError("network down"); },
      async () => new Response("not-json", { status: 202 }),
      async () => Response.json({ data: { duplicate: false, status: "RECEIVED" } }, { status: 202 }),
      async () => Response.json({ data: { duplicate: true, status: "DUPLICATE", webhookId: "webhook-id" } }, { status: 202 }),
      async () => Response.json({ data: { duplicate: false, status: "RECEIVED", webhookId: "wrong-id" } }, { status: 202 }),
      async () => Response.json({ data: { duplicate: false, status: "IGNORED", webhookId: "webhook-id" } }, { status: 202 }),
      async () => Response.json({ data: { duplicate: true, status: "ARBITRARY", webhookId: "webhook-id" } }, { status: 200 }),
    ]) {
      await assert.rejects(
        () => forwardShopifyWebhookToDeliveryApi(new Request("https://app.invalid/webhooks/orders", { headers: { "x-shopify-webhook-id": "webhook-id" } }), "{}", { fetch }),
        (error) => error instanceof Response && error.status === 503,
      );
    }

    await assert.rejects(
      () => forwardShopifyWebhookToDeliveryApi(
        new Request("https://app.invalid/webhooks/orders", { headers: { "x-shopify-webhook-id": "webhook-id" } }),
        "{}",
        {
          timeoutMs: 5,
          fetch: async (_url, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
        },
      ),
      (error) => error instanceof Response && error.status === 503,
    );
  } finally {
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});

test("structured webhook failure logs exclude payload, shop, customer, address, and unsafe identifiers", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  const logs = [];
  const previousError = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const rawBody = '{"customer":{"email":"private@example.invalid","address":"secret"}}';
    const request = new Request("https://app.invalid/webhooks/orders", {
      body: rawBody,
      headers: {
        "x-shopify-shop-domain": "private-store.myshopify.com",
        "x-shopify-webhook-id": "unsafe customer@example.invalid",
      },
      method: "POST",
    });
    await assert.rejects(
      () => forwardShopifyWebhookToDeliveryApi(request, rawBody, {
        correlationId: "safe-correlation",
        fetch: async () => new Response(null, { status: 503 }),
      }),
      (error) => error instanceof Response && error.status === 503,
    );
    const output = logs.join("\n");
    assert.match(output, /shopify_webhook_admission/);
    assert.match(output, /safe-correlation/);
    assert.doesNotMatch(output, /private|customer|address|secret|myshopify|@/i);
  } finally {
    console.error = previousError;
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});

function restoreDeliveryApiBaseUrl(value) {
  if (value === undefined) {
    delete process.env.CLEVER_DELIVERY_API_URL;
    return;
  }

  process.env.CLEVER_DELIVERY_API_URL = value;
}
