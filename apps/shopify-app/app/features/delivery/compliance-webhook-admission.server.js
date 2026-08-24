import {
  readBoundedOrderWebhookRawBody,
  resolveOrderWebhookMaxBodyBytes,
} from "./order-webhook-admission.server.js";
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

export function createComplianceWebhookAction({
  authenticateWebhook,
  forward = forwardShopifyWebhookToDeliveryApi,
  maxBodyBytes = resolveOrderWebhookMaxBodyBytes,
  readRawBody = readBoundedOrderWebhookRawBody,
} = {}) {
  if (typeof authenticateWebhook !== "function") {
    throw new TypeError("authenticateWebhook is required");
  }

  return async ({ request }) => {
    const correlationId = createTelemetryRequestId();
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

    const requestForAuth = new Request(request.url, {
      body: rawBody,
      headers: request.headers,
      method: request.method,
    });
    const { shop, topic } = await authenticateWebhook(requestForAuth);
    const shopHash = hashShopIdentifier(shop);

    if (!COMPLIANCE_WEBHOOK_TOPICS.has(topic)) {
      logSafeOperationalEvent("warn", "compliance_webhook_rejected", {
        correlationId,
        errorCode: "COMPLIANCE_TOPIC_UNEXPECTED",
        shopHash,
        stage: "topic_validation",
        topic,
      });
      return new Response(null, { status: 200 });
    }

    logSafeOperationalEvent("info", "compliance_webhook_accepted", {
      correlationId,
      shopHash,
      stage: "authenticated",
      topic,
    });

    await forward(request, rawBody, {
      correlationId,
      webhookKind: "compliance",
    });

    return new Response(null, { status: 200 });
  };
}

function logComplianceRejection(level, correlationId, errorCode, stage) {
  logSafeOperationalEvent(level, "compliance_webhook_rejected", {
    correlationId,
    errorCode,
    stage,
  });
}
