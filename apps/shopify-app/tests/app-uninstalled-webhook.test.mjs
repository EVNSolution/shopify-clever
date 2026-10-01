/* eslint-env node */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createAppUninstalledWebhookAction } from "../app/features/delivery/app-uninstalled-webhook-admission.server.js";

test("app uninstall route never enters Shopify offline-session authentication", () => {
  const source = readFileSync(join(process.cwd(), "app/routes/webhooks.app.uninstalled.jsx"), "utf8");
  assert.match(source, /createAppUninstalledWebhookAction/);
  assert.doesNotMatch(source, /authenticate\.webhook|shopify\.server|ensureValidOfflineSession/);
});

test("app uninstall validates and durably forwards before deleting every cached shop session", async () => {
  const stages = [];
  const action = createAppUninstalledWebhookAction({
    deleteSessions: async (shop) => stages.push(["delete", shop]),
    forward: async (_request, rawBody, options) => {
      stages.push(["forward", rawBody, options.normalizedTopic]);
      return { duplicate: false, status: "PROCESSED", webhookId: "uninstall-1" };
    },
    maxBodyBytes: 100,
    validate: async (_request, rawBody) => {
      stages.push(["validate", rawBody]);
      return { domain: "tenant.myshopify.com", topic: "APP_UNINSTALLED", valid: true };
    },
  });

  const response = await action({
    request: new Request("https://app.invalid/webhooks/app/uninstalled", {
      body: '{"id":1}',
      method: "POST",
    }),
  });

  assert.equal(response.status, 202);
  assert.deepEqual(stages, [
    ["validate", '{"id":1}'],
    ["forward", '{"id":1}', "app/uninstalled"],
    ["delete", "tenant.myshopify.com"],
  ]);
});

test("invalid uninstall validation does not forward or delete cached sessions", async () => {
  const stages = [];
  const action = createAppUninstalledWebhookAction({
    deleteSessions: async () => stages.push("delete"),
    forward: async () => stages.push("forward"),
    maxBodyBytes: 100,
    validate: async () => {
      stages.push("validate");
      throw new Response(null, { status: 401 });
    },
  });

  await assert.rejects(
    () => action({
      request: new Request("https://app.invalid/webhooks/app/uninstalled", { body: "{}", method: "POST" }),
    }),
    (error) => error instanceof Response && error.status === 401,
  );
  assert.deepEqual(stages, ["validate"]);
});

test("validated uninstall without a canonical shop domain cannot forward or delete sessions", async () => {
  const stages = [];
  const action = createAppUninstalledWebhookAction({
    deleteSessions: async () => stages.push("delete"),
    forward: async () => stages.push("forward"),
    maxBodyBytes: 100,
    validate: async () => ({ domain: undefined, topic: "app/uninstalled", valid: true }),
  });

  await assert.rejects(
    () => action({
      request: new Request("https://app.invalid/webhooks/app/uninstalled", { body: "{}", method: "POST" }),
    }),
    (error) => error instanceof Response && error.status === 400,
  );
  assert.deepEqual(stages, []);
});

test("delivery admission failure leaves cached sessions for a Shopify retry", async () => {
  let deleted = false;
  const action = createAppUninstalledWebhookAction({
    deleteSessions: async () => { deleted = true; },
    forward: async () => { throw new Response(null, { status: 503 }); },
    maxBodyBytes: 100,
    validate: async () => ({ domain: "tenant.myshopify.com", topic: "app/uninstalled", valid: true }),
  });

  await assert.rejects(
    () => action({
      request: new Request("https://app.invalid/webhooks/app/uninstalled", { body: "{}", method: "POST" }),
    }),
    (error) => error instanceof Response && error.status === 503,
  );
  assert.equal(deleted, false);
});

test("duplicate durable receipt still deletes cached sessions and returns 200", async () => {
  let deletedShop;
  const action = createAppUninstalledWebhookAction({
    deleteSessions: async (shop) => { deletedShop = shop; },
    forward: async () => ({ duplicate: true, status: "PROCESSED", webhookId: "uninstall-1" }),
    maxBodyBytes: 100,
    validate: async () => ({ domain: "tenant.myshopify.com", topic: "app/uninstalled", valid: true }),
  });

  const response = await action({
    request: new Request("https://app.invalid/webhooks/app/uninstalled", { body: "{}", method: "POST" }),
  });
  assert.equal(response.status, 200);
  assert.equal(deletedShop, "tenant.myshopify.com");
});

test("stale ignored uninstall keeps sessions created by a newer reinstall", async () => {
  let deleted = false;
  const action = createAppUninstalledWebhookAction({
    deleteSessions: async () => { deleted = true; },
    forward: async () => ({ duplicate: true, status: "IGNORED", webhookId: "stale-uninstall" }),
    maxBodyBytes: 100,
    validate: async () => ({ domain: "tenant.myshopify.com", topic: "app/uninstalled", valid: true }),
  });

  const response = await action({
    request: new Request("https://app.invalid/webhooks/app/uninstalled", { body: "{}", method: "POST" }),
  });
  assert.equal(response.status, 200);
  assert.equal(deleted, false);
});

test("invalid Shopify HMAC fails before delivery forwarding or local session deletion", async () => {
  const previousSecret = process.env.SHOPIFY_API_SECRET;
  const previousKey = process.env.SHOPIFY_API_KEY;
  const previousUrl = process.env.SHOPIFY_APP_URL;
  process.env.SHOPIFY_API_SECRET = "app-uninstall-secret";
  process.env.SHOPIFY_API_KEY = "app-uninstall-key";
  process.env.SHOPIFY_APP_URL = "https://app.invalid";
  try {
    let forwarded = false;
    let deleted = false;
    const rawBody = '{"id":1}';
    const validHmac = createHmac("sha256", process.env.SHOPIFY_API_SECRET).update(rawBody).digest("base64");
    assert.notEqual(validHmac, "invalid-hmac");
    const action = createAppUninstalledWebhookAction({
      deleteSessions: async () => { deleted = true; },
      forward: async () => { forwarded = true; },
      maxBodyBytes: 100,
    });

    await assert.rejects(
      () => action({
        request: new Request("https://app.invalid/webhooks/app/uninstalled", {
          body: rawBody,
          headers: {
            "content-type": "application/json",
            "x-shopify-hmac-sha256": "invalid-hmac",
            "x-shopify-shop-domain": "tenant.myshopify.com",
            "x-shopify-topic": "app/uninstalled",
            "x-shopify-webhook-id": "uninstall-invalid-hmac",
          },
          method: "POST",
        }),
      }),
      (error) => error instanceof Response && error.status === 401,
    );
    assert.equal(forwarded, false);
    assert.equal(deleted, false);
  } finally {
    restoreEnvironment("SHOPIFY_API_SECRET", previousSecret);
    restoreEnvironment("SHOPIFY_API_KEY", previousKey);
    restoreEnvironment("SHOPIFY_APP_URL", previousUrl);
  }
});

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
