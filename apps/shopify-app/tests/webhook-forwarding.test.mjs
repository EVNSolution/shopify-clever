import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  forwardShopifyWebhookToDeliveryApi,
  getForwardedWebhookHeaders,
  normalizeOrderWebhookTopic,
  ORDER_WEBHOOK_TOPICS,
} from "../app/features/delivery/webhook-forwarding.server.js";

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

test("order webhook route authenticates before forwarding the raw webhook body", () => {
  const routePath = join(root, "app/routes/webhooks.orders.jsx");
  assert.equal(existsSync(routePath), true);

  const source = readFileSync(routePath, "utf8");
  assert.match(source, /request\.clone\(\)/);
  assert.match(source, /await request\.text\(\)/);
  assert.match(source, /authenticate\.webhook\(requestForAuth\)/);
  assert.match(source, /normalizeOrderWebhookTopic\(topic\)/);
  assert.match(source, /forwardShopifyWebhookToDeliveryApi\(request, rawBody/);
  assert.match(source, /webhookKind: "order"/);
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
      },
      method: "POST",
      body: "{}",
    });

    await forwardShopifyWebhookToDeliveryApi(request, "{}", {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return new Response(null, { status: 200 });
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

    await forwardShopifyWebhookToDeliveryApi(request, rawBody, {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return new Response(null, { status: 200 });
      },
    });

    assert.equal(calls[0].url, "https://delivery.invalid/shopify/webhooks");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.body, rawBody);
    assert.equal(calls[0].options.headers.get("content-type"), "application/json");
    assert.equal(calls[0].options.headers.get("x-shopify-hmac-sha256"), "hmac");
    assert.equal(calls[0].options.headers.get("x-shopify-shop-domain"), "clever.myshopify.com");
    assert.equal(calls[0].options.headers.get("x-shopify-topic"), "orders/updated");
    assert.equal(calls[0].options.headers.get("x-shopify-webhook-id"), "webhook-id");
    assert.equal(calls[0].options.headers.get("x-extra-header"), null);
    assert.equal(getForwardedWebhookHeaders(request.headers).get("x-extra-header"), null);
  } finally {
    restoreDeliveryApiBaseUrl(previousBaseUrl);
  }
});

test("delivery webhook forwarding surfaces delivery API failures as a bad gateway", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  try {
    await assert.rejects(
      () =>
        forwardShopifyWebhookToDeliveryApi(
          new Request("https://app.invalid/webhooks/orders"),
          "{}",
          { fetch: async () => new Response(null, { status: 500 }) },
        ),
      (error) => error instanceof Response && error.status === 502,
    );
  } finally {
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
