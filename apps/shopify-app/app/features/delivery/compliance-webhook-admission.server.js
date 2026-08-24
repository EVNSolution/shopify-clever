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

const COMPLIANCE_WEBHOOK_TOPICS = new Set([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);
const SHOPIFY_ADMIN_COMPLIANCE_TOPICS = new Map([
  ["CUSTOMERS_DATA_REQUEST", "customers/data_request"],
  ["CUSTOMERS_REDACT", "customers/redact"],
  ["SHOP_REDACT", "shop/redact"],
]);

export function createComplianceWebhookAction({
  forward = forwardShopifyWebhookToDeliveryApi,
  maxBodyBytes = resolveOrderWebhookMaxBodyBytes,
  readRawBody = readBoundedOrderWebhookRawBody,
  validate = validateShopifyOrderWebhook,
} = {}) {
  return async ({ request }) => {
    const correlationId = createTelemetryRequestId();
    if (request.method !== "POST") {
      logComplianceRejection("warn", correlationId, "METHOD_NOT_ALLOWED", "validation");
      throw new Response(null, { status: 405, statusText: "Method not allowed" });
    }
    let resolvedMaxBodyBytes;
    try {
      resolvedMaxBodyBytes = typeof maxBodyBytes === "function" ? maxBodyBytes() : maxBodyBytes;
    } catch {
      logComplianceRejection("error", correlationId, "BODY_LIMIT_CONFIG_INVALID", "body_read");
      throw new Response(null, { status: 503, statusText: "Webhook body limit is unavailable" });
    }

    let rawBody;
    try {
      rawBody = await readRawBody(request, resolvedMaxBodyBytes);
    } catch (error) {
      const payloadTooLarge = error instanceof Response && error.status === 413;
      logComplianceRejection(
        payloadTooLarge ? "warn" : "error",
        correlationId,
        payloadTooLarge ? "BODY_TOO_LARGE" : "BODY_READ_FAILED",
        "body_read",
      );
      if (payloadTooLarge) throw error;
      throw new Response(null, { status: 503, statusText: "Webhook body could not be read" });
    }

    let validation;
    try {
      validation = await validate(request, rawBody);
    } catch (error) {
      logComplianceRejection(
        "warn",
        correlationId,
        error instanceof Response && error.status === 401 ? "HMAC_INVALID" : "VALIDATION_FAILED",
        "validation",
      );
      throw error;
    }
    const { domain: shop } = validation;
    const topic = normalizeComplianceWebhookTopic(validation.topic);
    const shopHash = hashShopIdentifier(shop);

    if (topic === null) {
      logSafeOperationalEvent("warn", "compliance_webhook_rejected", {
        correlationId,
        errorCode: "COMPLIANCE_TOPIC_UNEXPECTED",
        shopHash,
        stage: "topic_validation",
        topic,
      });
      throw new Response(null, { status: 400, statusText: "Unexpected webhook topic" });
    }

    logSafeOperationalEvent("info", "compliance_webhook_accepted", {
      correlationId,
      shopHash,
      stage: "validated",
      topic,
    });

    const receipt = await forward(request, rawBody, {
      correlationId,
      normalizedTopic: topic,
      webhookKind: "compliance",
    });

    return Response.json(receipt, { status: receipt.duplicate ? 200 : 202 });
  };
}

function normalizeComplianceWebhookTopic(topic) {
  if (COMPLIANCE_WEBHOOK_TOPICS.has(topic)) return topic;
  return SHOPIFY_ADMIN_COMPLIANCE_TOPICS.get(topic) ?? null;
}

function logComplianceRejection(level, correlationId, errorCode, stage) {
  logSafeOperationalEvent(level, "compliance_webhook_rejected", {
    correlationId,
    errorCode,
    stage,
  });
}
