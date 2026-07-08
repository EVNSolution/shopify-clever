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
  { fetch: fetchImpl = fetch, webhookKind = "Shopify" } = {},
) {
  const response = await fetchImpl(`${getDeliveryApiBaseUrl()}/shopify/webhooks`, {
    body: rawBody,
    headers: getForwardedWebhookHeaders(request.headers),
    method: "POST",
  });

  if (!response.ok) {
    console.error(
      `Unable to forward ${webhookKind} webhook to delivery API: ${response.status}`,
    );
    throw new Response(null, { status: 502 });
  }
}

export function getForwardedWebhookHeaders(sourceHeaders) {
  const headers = new Headers();

  for (const name of FORWARDED_SHOPIFY_WEBHOOK_HEADERS) {
    const value = sourceHeaders.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  return headers;
}
