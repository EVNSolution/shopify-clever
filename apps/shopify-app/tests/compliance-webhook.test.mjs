import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createComplianceWebhookAction } from "../app/features/delivery/compliance-webhook-admission.server.js";
import { forwardShopifyWebhookToDeliveryApi } from "../app/features/delivery/webhook-forwarding.server.js";

const complianceTopics = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
];

test("rejects declared, chunked, and lying-length oversized compliance bodies before validation", async () => {
  const streamedBodies = [
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("12345"));
        controller.close();
      },
    }),
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("12"));
        controller.enqueue(new TextEncoder().encode("345"));
        controller.close();
      },
    }),
  ];
  const requests = [
    new Request("https://app.invalid/webhooks/compliance", {
      body: "12345",
      headers: { "content-length": "5" },
      method: "POST",
    }),
    ...streamedBodies.map((body, index) => new Request("https://app.invalid/webhooks/compliance", {
      body,
      duplex: "half",
      headers: index === 1 ? { "content-length": "4" } : undefined,
      method: "POST",
    })),
  ];

  for (const request of requests) {
    const stages = [];
    const action = createComplianceWebhookAction({
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
});

test("validates and forwards exact boundary bytes for every compliance topic", async () => {
  for (const topic of complianceTopics) {
    const rawBody = "12345";
    const observed = [];
    const action = createComplianceWebhookAction({
      validate: async (request, body) => {
        observed.push(["validate", request, body]);
        return { domain: "private-shop.myshopify.com", topic, valid: true };
      },
      forward: async (_request, body, options) => {
        observed.push(["forward", body, options.webhookKind]);
        return { duplicate: false, status: "QUEUED", webhookId: "compliance-webhook" };
      },
      maxBodyBytes: 5,
    });
    const response = await action({
      request: new Request("https://app.invalid/webhooks/compliance", {
        body: rawBody,
        method: "POST",
      }),
    });

    assert.equal(response.status, 202);
    assert.equal(observed[0][0], "validate");
    assert.equal(observed[0][2], rawBody);
    assert.deepEqual(observed[1], ["forward", rawBody, "compliance"]);
  }
});

test("preserves split UTF-8 compliance bytes through validation and forwarding", async () => {
  const rawBody = '{"city":"키치너🚚"}';
  const bytes = new TextEncoder().encode(rawBody);

  for (const topic of complianceTopics) {
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
    const response = await createComplianceWebhookAction({
      validate: async (_request, boundedBody) => {
        observed.push(boundedBody);
        return { domain: "unicode-shop.myshopify.com", topic, valid: true };
      },
      forward: async (_request, boundedBody) => {
        observed.push(boundedBody);
        return { duplicate: false, status: "QUEUED", webhookId: "unicode-webhook" };
      },
      maxBodyBytes: bytes.byteLength,
    })({
      request: new Request("https://app.invalid/webhooks/compliance", {
        body,
        duplex: "half",
        method: "POST",
      }),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(observed, [rawBody, rawBody]);
  }
});

test("late compliance webhook accepts one durable ignored receipt without retry", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  try {
    let deliveryCalls = 0;
    const action = createComplianceWebhookAction({
      forward: (request, rawBody, options) => forwardShopifyWebhookToDeliveryApi(request, rawBody, {
        ...options,
        fetch: async () => {
          deliveryCalls += 1;
          return Response.json({
            data: { duplicate: true, status: "IGNORED", webhookId: "late-compliance-webhook" },
            error: null,
          }, { status: 200 });
        },
      }),
      maxBodyBytes: 100,
      validate: async () => ({
        domain: "redacted-shop.myshopify.com",
        topic: "shop/redact",
        valid: true,
      }),
    });
    const response = await action({
      request: new Request("https://app.invalid/webhooks/compliance", {
        body: "{}",
        headers: { "x-shopify-webhook-id": "late-compliance-webhook" },
        method: "POST",
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(deliveryCalls, 1);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
  }
});

test("valid compliance HMAC reaches Delivery while obsolete offline authentication throws or hangs", async () => {
  const previousSecret = process.env.SHOPIFY_API_SECRET;
  const previousKey = process.env.SHOPIFY_API_KEY;
  const previousUrl = process.env.SHOPIFY_APP_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.SHOPIFY_API_SECRET = "compliance-session-free-secret";
  process.env.SHOPIFY_API_KEY = "compliance-session-free-key";
  process.env.SHOPIFY_APP_URL = "https://app.invalid";
  process.env.DATABASE_URL = "file:/definitely-unavailable/offline-session.db";
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.invalid";
  try {
    for (const obsoleteAuthenticateWebhook of [
      async () => { throw new Error("offline refresh failed"); },
      async () => new Promise(() => {}),
    ]) {
      const rawBody = '{"shop_id":1,"shop_domain":"session-free.myshopify.com"}';
      const hmac = createHmac("sha256", process.env.SHOPIFY_API_SECRET)
        .update(rawBody)
        .digest("base64");
      let deliveryCalls = 0;
      const action = createComplianceWebhookAction({
        authenticateWebhook: obsoleteAuthenticateWebhook,
        forward: (request, forwardedBody, options) => forwardShopifyWebhookToDeliveryApi(
          request,
          forwardedBody,
          {
            ...options,
            fetch: async (_url, init) => {
              deliveryCalls += 1;
              assert.equal(init.body, rawBody);
              return Response.json({
                data: {
                  duplicate: false,
                  status: "QUEUED",
                  webhookId: "compliance-session-free",
                },
                error: null,
              }, { status: 202 });
            },
          },
        ),
      });
      const response = await Promise.race([
        action({
          request: complianceRequest(rawBody, hmac, {
            topic: "shop/redact",
            webhookId: "compliance-session-free",
          }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("offline path was awaited")), 100)),
      ]);

      assert.equal(response.status, 202);
      assert.equal(deliveryCalls, 1);
    }
  } finally {
    restoreEnvironment("SHOPIFY_API_SECRET", previousSecret);
    restoreEnvironment("SHOPIFY_API_KEY", previousKey);
    restoreEnvironment("SHOPIFY_APP_URL", previousUrl);
    restoreEnvironment("DATABASE_URL", previousDatabaseUrl);
    restoreEnvironment("CLEVER_DELIVERY_API_URL", previousBaseUrl);
  }
});

test("invalid compliance HMAC fails closed before Delivery forwarding", async () => {
  const previousSecret = process.env.SHOPIFY_API_SECRET;
  const previousKey = process.env.SHOPIFY_API_KEY;
  const previousUrl = process.env.SHOPIFY_APP_URL;
  process.env.SHOPIFY_API_SECRET = "compliance-invalid-secret";
  process.env.SHOPIFY_API_KEY = "compliance-invalid-key";
  process.env.SHOPIFY_APP_URL = "https://app.invalid";
  try {
    let deliveryCalls = 0;
    const action = createComplianceWebhookAction({
      forward: async () => { deliveryCalls += 1; },
    });
    await assert.rejects(
      () => action({
        request: complianceRequest("{}", "invalid-hmac", {
          topic: "customers/redact",
          webhookId: "invalid-compliance-hmac",
        }),
      }),
      (error) => error instanceof Response && error.status === 401,
    );
    assert.equal(deliveryCalls, 0);
  } finally {
    restoreEnvironment("SHOPIFY_API_SECRET", previousSecret);
    restoreEnvironment("SHOPIFY_API_KEY", previousKey);
    restoreEnvironment("SHOPIFY_APP_URL", previousUrl);
  }
});

function complianceRequest(rawBody, hmac, { topic, webhookId }) {
  return new Request("https://app.invalid/webhooks/compliance", {
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "x-shopify-api-version": "2026-07",
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-shop-domain": "session-free.myshopify.com",
      "x-shopify-topic": topic,
      "x-shopify-webhook-id": webhookId,
    },
    method: "POST",
  });
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
