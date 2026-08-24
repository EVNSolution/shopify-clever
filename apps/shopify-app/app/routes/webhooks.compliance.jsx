import { authenticate } from "../shopify.server";
import { createComplianceWebhookAction } from "../features/delivery/compliance-webhook-admission.server";

export const action = createComplianceWebhookAction({
  authenticateWebhook: authenticate.webhook,
});
