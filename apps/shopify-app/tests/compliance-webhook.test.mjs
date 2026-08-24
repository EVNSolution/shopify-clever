import assert from "node:assert/strict";
import test from "node:test";

import { createComplianceWebhookAction } from "../app/features/delivery/compliance-webhook-admission.server.js";

const complianceTopics = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
];

test("rejects declared, chunked, and lying-length oversized compliance bodies before authentication", async () => {
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
      authenticateWebhook: async () => stages.push("authenticate"),
      forward: async () => stages.push("forward"),
      maxBodyBytes: 4,
    });
    await assert.rejects(
      () => action({ request }),
      (error) => error instanceof Response && error.status === 413,
    );
    assert.deepEqual(stages, []);
  }
});

test("authenticates and forwards exact boundary bytes for every compliance topic", async () => {
  for (const topic of complianceTopics) {
    const rawBody = "12345";
    const observed = [];
    const action = createComplianceWebhookAction({
      authenticateWebhook: async (request) => {
        observed.push(["authenticate", await request.text()]);
        return { shop: "private-shop.myshopify.com", topic };
      },
      forward: async (_request, body, options) => {
        observed.push(["forward", body, options.webhookKind]);
      },
      maxBodyBytes: 5,
    });
    const response = await action({
      request: new Request("https://app.invalid/webhooks/compliance", {
        body: rawBody,
        method: "POST",
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(observed, [
      ["authenticate", rawBody],
      ["forward", rawBody, "compliance"],
    ]);
  }
});

test("preserves split UTF-8 compliance bytes through authentication and forwarding", async () => {
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
      authenticateWebhook: async (request) => {
        observed.push(await request.text());
        return { shop: "unicode-shop.myshopify.com", topic };
      },
      forward: async (_request, boundedBody) => observed.push(boundedBody),
      maxBodyBytes: bytes.byteLength,
    })({
      request: new Request("https://app.invalid/webhooks/compliance", {
        body,
        duplex: "half",
        method: "POST",
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(observed, [rawBody, rawBody]);
  }
});
