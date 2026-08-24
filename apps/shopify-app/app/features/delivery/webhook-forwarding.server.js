import { getDeliveryApiBaseUrl } from "./route-plans.server.js";
import { createTelemetryRequestId } from "../telemetry/structured-telemetry.server.js";

export const ORDER_WEBHOOK_TOPICS = new Set([
  "orders/create",
  "orders/updated",
  "orders/edited",
  "orders/cancelled",
  "orders/delete",
  "orders/fulfilled",
  "orders/partially_fulfilled",
]);

const SHOPIFY_ADMIN_ORDER_TOPICS = new Map([
  ["ORDERS_CREATE", "orders/create"],
  ["ORDERS_UPDATED", "orders/updated"],
  ["ORDERS_EDITED", "orders/edited"],
  ["ORDERS_CANCELLED", "orders/cancelled"],
  ["ORDERS_DELETE", "orders/delete"],
  ["ORDERS_FULFILLED", "orders/fulfilled"],
  ["ORDERS_PARTIALLY_FULFILLED", "orders/partially_fulfilled"],
]);

export function normalizeOrderWebhookTopic(topic) {
  if (ORDER_WEBHOOK_TOPICS.has(topic)) return topic;
  return SHOPIFY_ADMIN_ORDER_TOPICS.get(topic) ?? null;
}

const FORWARDED_SHOPIFY_WEBHOOK_HEADERS = [
  "content-type",
  "x-shopify-api-version",
  "x-shopify-event-id",
  "x-shopify-hmac-sha256",
  "x-shopify-shop-domain",
  "x-shopify-topic",
  "x-shopify-triggered-at",
  "x-shopify-webhook-id",
];

const DURABLE_ACCEPTANCE_STATUSES = new Set(["DUPLICATE", "IGNORED", "PROCESSED", "QUEUED", "RECEIVED"]);
const DURABLE_SUPPRESSED_STATUSES = new Set(["IGNORED"]);

export function resolveOrderWebhookAdmissionMode(env = process.env) {
  return env.CLEVER_ORDER_WEBHOOK_ADMISSION_MODE === "retry" ? "retry" : "session_free";
}

export async function forwardShopifyWebhookToDeliveryApi(
  request,
  rawBody,
  {
    correlationId = createTelemetryRequestId(),
    fetch: fetchImpl = fetch,
    normalizedTopic,
    timeoutMs = 8_000,
    webhookKind = "Shopify",
  } = {},
) {
  const webhookId = request.headers.get("x-shopify-webhook-id");
  let response;

  try {
    response = await fetchImpl(`${getDeliveryApiBaseUrl()}/shopify/webhooks`, {
      body: rawBody,
      headers: getForwardedWebhookHeaders(request.headers, { correlationId, normalizedTopic }),
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    logWebhookStage("error", {
      correlationId,
      errorCode: error?.name === "TimeoutError" ? "DELIVERY_TIMEOUT" : "DELIVERY_UNAVAILABLE",
      requestId: correlationId,
      stage: "delivery_admission",
      webhookId,
      webhookKind,
    });
    throw retryableWebhookResponse();
  }

  const receipt = await readDurableReceipt(response, webhookId);
  if (!receipt) {
    logWebhookStage("error", {
      correlationId,
      errorCode: "DELIVERY_NOT_DURABLE",
      httpStatus: response.status,
      requestId: correlationId,
      stage: "delivery_admission",
      webhookId,
      webhookKind,
    });
    throw retryableWebhookResponse();
  }

  logWebhookStage("info", {
    correlationId,
    duplicate: receipt.duplicate,
    httpStatus: response.status,
    requestId: correlationId,
    stage: "durable",
    status: receipt.status,
    suppressed: DURABLE_SUPPRESSED_STATUSES.has(receipt.status),
    webhookId: receipt.webhookId,
    webhookKind,
  });
  return receipt;
}

export function getForwardedWebhookHeaders(sourceHeaders, { correlationId, normalizedTopic } = {}) {
  const headers = new Headers();

  for (const name of FORWARDED_SHOPIFY_WEBHOOK_HEADERS) {
    const value = sourceHeaders.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  if (normalizedTopic) {
    headers.set("x-shopify-topic", normalizedTopic);
  }
  if (correlationId) {
    headers.set("x-clever-client-request-id", correlationId);
  }

  return headers;
}

async function readDurableReceipt(response, expectedWebhookId) {
  if (response.status !== 200 && response.status !== 202) return null;
  let payload;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const receipt = payload?.data;
  if (
    typeof receipt?.webhookId !== "string" ||
    receipt.webhookId.length === 0 ||
    receipt.webhookId !== expectedWebhookId ||
    typeof receipt?.duplicate !== "boolean" ||
    (response.status === 200) !== receipt.duplicate ||
    !DURABLE_ACCEPTANCE_STATUSES.has(receipt?.status) ||
    (DURABLE_SUPPRESSED_STATUSES.has(receipt.status) && receipt.duplicate !== true)
  ) return null;

  return {
    duplicate: receipt.duplicate,
    status: receipt.status,
    webhookId: receipt.webhookId,
  };
}

function retryableWebhookResponse() {
  return new Response(JSON.stringify({ error: "WEBHOOK_ADMISSION_RETRY" }), {
    headers: { "content-type": "application/json" },
    status: 503,
  });
}

function logWebhookStage(level, fields) {
  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(([, value]) =>
      typeof value === "boolean" || typeof value === "number" || isSafeLogValue(value),
    ),
  );
  console[level](JSON.stringify({ event: "shopify_webhook_admission", ...safeFields }));
}

function isSafeLogValue(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,120}$/u.test(value);
}
