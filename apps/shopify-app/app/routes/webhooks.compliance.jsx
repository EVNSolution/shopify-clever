import { authenticate } from "../shopify.server";

const DEFAULT_DELIVERY_API_URL = "https://clever-route.cleversystem.ai";
const COMPLIANCE_WEBHOOK_TOPICS = new Set([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
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

export const action = async ({ request }) => {
  const requestForAuth = request.clone();
  const rawBody = await request.text();
  const { shop, topic } = await authenticate.webhook(requestForAuth);

  if (!COMPLIANCE_WEBHOOK_TOPICS.has(topic)) {
    console.warn(`Received unexpected compliance webhook topic ${topic} for ${shop}`);
    return new Response(null, { status: 200 });
  }

  console.log(`Received ${topic} compliance webhook for ${shop}`);

  await forwardComplianceWebhookToDeliveryApi(request, rawBody);

  return new Response(null, { status: 200 });
};

async function forwardComplianceWebhookToDeliveryApi(request, rawBody) {
  const response = await fetch(`${getDeliveryApiBaseUrl()}/shopify/webhooks`, {
    body: rawBody,
    headers: getForwardedWebhookHeaders(request.headers),
    method: "POST",
  });

  if (!response.ok) {
    console.error(`Unable to forward compliance webhook to delivery API: ${response.status}`);
    throw new Response(null, { status: 502 });
  }
}

function getForwardedWebhookHeaders(sourceHeaders) {
  const headers = new Headers();

  for (const name of FORWARDED_SHOPIFY_WEBHOOK_HEADERS) {
    const value = sourceHeaders.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  return headers;
}

function getDeliveryApiBaseUrl() {
  // eslint-disable-next-line no-undef
  const configuredBaseUrl = process.env.CLEVER_DELIVERY_API_URL?.trim();
  const baseUrl = configuredBaseUrl || DEFAULT_DELIVERY_API_URL;

  return baseUrl.replace(/\/+$/, "");
}
