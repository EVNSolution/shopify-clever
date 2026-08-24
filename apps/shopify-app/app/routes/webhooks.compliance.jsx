import { authenticate } from "../shopify.server";
import { forwardShopifyWebhookToDeliveryApi } from "../features/delivery/webhook-forwarding.server";
import {
  createTelemetryRequestId,
  hashShopIdentifier,
  logSafeOperationalEvent,
} from "../features/telemetry/structured-telemetry.server";

const COMPLIANCE_WEBHOOK_TOPICS = new Set([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);

export const action = async ({ request }) => {
  const correlationId = createTelemetryRequestId();
  const requestForAuth = request.clone();
  const rawBody = await request.text();
  const { shop, topic } = await authenticate.webhook(requestForAuth);
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

  await forwardShopifyWebhookToDeliveryApi(request, rawBody, {
    correlationId,
    webhookKind: "compliance",
  });

  return new Response(null, { status: 200 });
};
