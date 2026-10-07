import {
  readBoundedOrderWebhookRawBody,
  resolveOrderWebhookMaxBodyBytes,
} from "./order-webhook-admission.server.js";
import { validateShopifyOrderWebhook } from "./shopify-webhook-validation.server.js";
import { forwardShopifyWebhookToDeliveryApi } from "./webhook-forwarding.server.js";
import {
  createTelemetryRequestId,
  hashShopIdentifier,
  logSafeOperationalEvent,
} from "../telemetry/structured-telemetry.server.js";

const APP_UNINSTALLED_TOPICS = new Set(["app/uninstalled", "APP_UNINSTALLED"]);

export function createAppUninstalledWebhookAction({
  deleteSessions,
  forward = forwardShopifyWebhookToDeliveryApi,
  maxBodyBytes = resolveOrderWebhookMaxBodyBytes,
  readRawBody = readBoundedOrderWebhookRawBody,
  validate = validateShopifyOrderWebhook,
} = {}) {
  if (typeof deleteSessions !== "function") {
    throw new TypeError("deleteSessions is required");
  }

  return async ({ request }) => {
    const correlationId = createTelemetryRequestId();
    if (request.method !== "POST") {
      throw new Response(null, { status: 405, statusText: "Method not allowed" });
    }

    const resolvedMaxBodyBytes = typeof maxBodyBytes === "function" ? maxBodyBytes() : maxBodyBytes;
    const rawBody = await readRawBody(request, resolvedMaxBodyBytes);
    const validation = await validate(request, rawBody);
    const topic = APP_UNINSTALLED_TOPICS.has(validation.topic) ? "app/uninstalled" : null;
    if (topic === null) {
      throw new Response(null, { status: 400, statusText: "Unexpected webhook topic" });
    }

    const shop = normalizeShopDomain(validation.domain);
    const shopHash = hashShopIdentifier(shop);
    logSafeOperationalEvent("info", "shopify_uninstalled_received", {
      correlationId,
      shopHash,
      stage: "validated",
      topic,
    });

    const receipt = await forward(request, rawBody, {
      correlationId,
      normalizedTopic: topic,
      webhookKind: "app_uninstalled",
    });
    if (receipt.status !== "IGNORED") {
      await deleteSessions(shop);
    }

    logSafeOperationalEvent("info", "shopify_uninstalled_processed", {
      correlationId,
      shopHash,
      stage: receipt.status === "IGNORED" ? "stale_event_ignored" : "sessions_deleted",
      topic,
    });
    return Response.json(receipt, { status: receipt.duplicate ? 200 : 202 });
  };
}

function normalizeShopDomain(value) {
  if (typeof value !== "string") {
    throw new Response(null, { status: 400, statusText: "Invalid shop domain" });
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u.test(normalized)) {
    throw new Response(null, { status: 400, statusText: "Invalid shop domain" });
  }
  return normalized;
}
