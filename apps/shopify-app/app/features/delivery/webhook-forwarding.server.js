import { getDeliveryApiBaseUrl } from "./route-plans.server.js";

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

export async function forwardShopifyWebhookToDeliveryApi(
  request,
  rawBody,
  { fetch: fetchImpl = fetch, normalizedTopic, webhookKind = "Shopify" } = {},
) {
  const response = await fetchImpl(`${getDeliveryApiBaseUrl()}/shopify/webhooks`, {
    body: rawBody,
    headers: getForwardedWebhookHeaders(request.headers, { normalizedTopic }),
    method: "POST",
  });

  if (!response.ok) {
    console.error(
      `Unable to forward ${webhookKind} webhook to delivery API: ${response.status}`,
    );
    throw new Response(null, { status: 502 });
  }
}

export function getForwardedWebhookHeaders(sourceHeaders, { normalizedTopic } = {}) {
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

  return headers;
}
