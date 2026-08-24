import {
  forwardShopifyWebhookToDeliveryApi,
  normalizeOrderWebhookTopic,
  resolveOrderWebhookAdmissionMode,
} from "./webhook-forwarding.server.js";
import { validateShopifyOrderWebhook } from "./shopify-webhook-validation.server.js";
import { createTelemetryRequestId } from "../telemetry/structured-telemetry.server.js";

export function createOrderWebhookAction({
  admissionMode = resolveOrderWebhookAdmissionMode,
  forward = forwardShopifyWebhookToDeliveryApi,
  validate = validateShopifyOrderWebhook,
} = {}) {
  return async ({ request }) => {
    const correlationId = createTelemetryRequestId();
    const webhookId = safeIdentifier(request.headers.get("x-shopify-webhook-id"));
    const rawBody = await request.text();
    let validation;
    try {
      validation = await validate(request, rawBody);
    } catch (error) {
      logAdmission("warn", {
        correlationId,
        errorCode: error instanceof Response && error.status === 401 ? "HMAC_INVALID" : "VALIDATION_FAILED",
        requestId: correlationId,
        stage: "validation",
        webhookId,
      });
      throw error;
    }
    const normalizedTopic = normalizeOrderWebhookTopic(validation.topic);

    if (normalizedTopic === null) {
      logAdmission("warn", {
        correlationId,
        errorCode: "TOPIC_UNEXPECTED",
        requestId: correlationId,
        stage: "validation",
        webhookId,
      });
      throw new Response(null, { status: 400, statusText: "Unexpected webhook topic" });
    }

    if (admissionMode() === "retry") {
      logAdmission("warn", {
        correlationId,
        errorCode: "ADMISSION_PAUSED",
        requestId: correlationId,
        stage: "fallback",
        webhookId,
      });
      throw new Response(JSON.stringify({ error: "WEBHOOK_ADMISSION_PAUSED" }), {
        headers: { "content-type": "application/json" },
        status: 503,
      });
    }

    const receipt = await forward(request, rawBody, {
      correlationId,
      normalizedTopic,
      webhookKind: "order",
    });
    return Response.json(receipt, { status: receipt.duplicate ? 200 : 202 });
  };
}

function logAdmission(level, fields) {
  console[level](JSON.stringify({ event: "shopify_webhook_admission", ...fields }));
}

function safeIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,120}$/u.test(value) ? value : undefined;
}
