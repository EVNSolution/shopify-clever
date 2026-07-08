import { authenticate } from "../shopify.server";
import {
  ORDER_WEBHOOK_TOPICS,
  forwardShopifyWebhookToDeliveryApi,
} from "../features/delivery/webhook-forwarding.server";

export const action = async ({ request }) => {
  const requestForAuth = request.clone();
  const rawBody = await request.text();
  const { shop, topic } = await authenticate.webhook(requestForAuth);

  if (!ORDER_WEBHOOK_TOPICS.has(topic)) {
    console.warn(`Received unexpected order webhook topic ${topic} for ${shop}`);
    return new Response(null, { status: 200 });
  }

  console.log(`Received ${topic} order webhook for ${shop}`);

  await forwardShopifyWebhookToDeliveryApi(request, rawBody, {
    webhookKind: "order",
  });

  return new Response(null, { status: 200 });
};
