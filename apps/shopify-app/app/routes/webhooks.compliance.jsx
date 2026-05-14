import { authenticate } from "../shopify.server";

const COMPLIANCE_WEBHOOK_TOPICS = new Set([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  if (!COMPLIANCE_WEBHOOK_TOPICS.has(topic)) {
    console.warn(`Received unexpected compliance webhook topic ${topic} for ${shop}`);
    return new Response(null, { status: 200 });
  }

  console.log(`Received ${topic} compliance webhook for ${shop}`);

  return new Response(null, { status: 200 });
};
