import { authenticate } from "../shopify.server";
import { forwardShopifyWebhookToDeliveryApi } from "../features/delivery/webhook-forwarding.server";

const COMPLIANCE_WEBHOOK_TOPICS = new Set([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);

export const action = async ({ request }) => {
  const requestForAuth = request.clone();
  const rawBody = await request.text();
  const { shop, topic } = await authenticate.webhook(requestForAuth);

  if (!COMPLIANCE_WEBHOOK_TOPICS.has(topic)) {
    console.warn(`Received unexpected compliance webhook topic ${topic} for ${shop}`);
    return new Response(null, { status: 200 });
  }

  console.log(`Received ${topic} compliance webhook for ${shop}`);

  await forwardShopifyWebhookToDeliveryApi(request, rawBody, {
    webhookKind: "compliance",
  });

  return new Response(null, { status: 200 });
};
