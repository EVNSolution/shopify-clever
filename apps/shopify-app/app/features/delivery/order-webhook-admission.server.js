import {
  forwardShopifyWebhookToDeliveryApi,
  normalizeOrderWebhookTopic,
  resolveOrderWebhookAdmissionMode,
} from "./webhook-forwarding.server.js";
import { validateShopifyOrderWebhook } from "./shopify-webhook-validation.server.js";
import { createTelemetryRequestId } from "../telemetry/structured-telemetry.server.js";

export const DEFAULT_ORDER_WEBHOOK_MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_ORDER_WEBHOOK_MAX_BODY_BYTES = 100 * 1024 * 1024;

export function createOrderWebhookAction({
  admissionMode = resolveOrderWebhookAdmissionMode,
  forward = forwardShopifyWebhookToDeliveryApi,
  maxBodyBytes = resolveOrderWebhookMaxBodyBytes,
  readRawBody = readBoundedOrderWebhookRawBody,
  validate = validateShopifyOrderWebhook,
} = {}) {
  return async ({ request }) => {
    const correlationId = createTelemetryRequestId();
    const webhookId = safeIdentifier(request.headers.get("x-shopify-webhook-id"));
    if (request.method !== "POST") {
      logAdmission("warn", {
        correlationId,
        errorCode: "METHOD_NOT_ALLOWED",
        requestId: correlationId,
        stage: "validation",
        webhookId,
      });
      throw new Response(null, { status: 405, statusText: "Method not allowed" });
    }
    let resolvedMaxBodyBytes;
    try {
      resolvedMaxBodyBytes = typeof maxBodyBytes === "function" ? maxBodyBytes() : maxBodyBytes;
      assertOrderWebhookMaxBodyBytes(resolvedMaxBodyBytes);
    } catch {
      logAdmission("error", {
        correlationId,
        errorCode: "BODY_LIMIT_CONFIG_INVALID",
        requestId: correlationId,
        stage: "body_read",
        webhookId,
      });
      throw new Response(null, { status: 503, statusText: "Webhook body limit is unavailable" });
    }

    let rawBody;
    try {
      rawBody = await readRawBody(request, resolvedMaxBodyBytes);
    } catch (error) {
      const payloadTooLarge = error instanceof Response && error.status === 413;
      logAdmission(payloadTooLarge ? "warn" : "error", {
        correlationId,
        errorCode: payloadTooLarge ? "BODY_TOO_LARGE" : "BODY_READ_FAILED",
        requestId: correlationId,
        stage: "body_read",
        webhookId,
      });
      if (payloadTooLarge) throw error;
      throw new Response(null, { status: 503, statusText: "Webhook body could not be read" });
    }
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

export function resolveOrderWebhookMaxBodyBytes(
  value = process.env.SHOPIFY_ORDER_WEBHOOK_MAX_BODY_BYTES,
) {
  if (value === undefined) return DEFAULT_ORDER_WEBHOOK_MAX_BODY_BYTES;
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) {
    throw new Error("SHOPIFY_ORDER_WEBHOOK_MAX_BODY_BYTES must be a positive integer");
  }
  const parsed = Number(value);
  assertOrderWebhookMaxBodyBytes(parsed);
  return parsed;
}

export async function readBoundedOrderWebhookRawBody(request, maxBodyBytes) {
  assertOrderWebhookMaxBodyBytes(maxBodyBytes);
  const contentLength = request.headers.get("content-length");
  if (/^\d+$/u.test(contentLength ?? "") && decimalExceedsLimit(contentLength, maxBodyBytes)) {
    throw payloadTooLargeResponse();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let rawBody = "";
  let receivedBytes = 0;
  try {
    let readResult = await reader.read();
    while (!readResult.done) {
      const { value } = readResult;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      receivedBytes += chunk.byteLength;
      if (receivedBytes > maxBodyBytes) {
        try {
          await reader.cancel();
        } catch {
          // The 413 response remains authoritative when stream cancellation itself fails.
        }
        throw payloadTooLargeResponse();
      }
      rawBody += decoder.decode(chunk, { stream: true });
      readResult = await reader.read();
    }
    return rawBody + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function decimalExceedsLimit(value, limit) {
  const normalized = value.replace(/^0+/u, "") || "0";
  const limitText = String(limit);
  return normalized.length > limitText.length
    || (normalized.length === limitText.length && normalized > limitText);
}

function assertOrderWebhookMaxBodyBytes(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_ORDER_WEBHOOK_MAX_BODY_BYTES) {
    throw new Error("Invalid Shopify order webhook body limit");
  }
}

function payloadTooLargeResponse() {
  return new Response(null, { status: 413, statusText: "Webhook body is too large" });
}

function logAdmission(level, fields) {
  console[level](JSON.stringify({ event: "shopify_webhook_admission", ...fields }));
}

function safeIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,120}$/u.test(value) ? value : undefined;
}
