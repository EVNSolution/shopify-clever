import "@shopify/shopify-api/adapters/web-api";
import {
  ApiVersion,
  LogSeverity,
  shopifyApi,
  WebhookValidationErrorReason,
} from "@shopify/shopify-api";

let webhookValidator;

export async function validateShopifyOrderWebhook(
  request,
  rawBody,
  { validate = getWebhookValidator() } = {},
) {
  const result = await validate({ rawBody, rawRequest: request });
  if (result.valid) return result;

  const status = result.reason === WebhookValidationErrorReason.InvalidHmac ? 401 : 400;
  throw new Response(null, {
    status,
    statusText: status === 401 ? "Unauthorized" : "Bad Request",
  });
}

function getWebhookValidator() {
  webhookValidator ??= createWebhookValidator();
  return webhookValidator;
}

function createWebhookValidator() {
  const appUrl = new URL(process.env.SHOPIFY_APP_URL || "http://localhost");
  const api = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY || "missing-api-key",
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
    apiVersion: ApiVersion.July26,
    hostName: appUrl.host,
    hostScheme: appUrl.protocol === "http:" ? "http" : "https",
    isEmbeddedApp: true,
    logger: { level: LogSeverity.Error, log: () => {} },
  });
  return api.webhooks.validate;
}
