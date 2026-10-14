import { previewSampleCustomerNotification } from "../features/customer-notifications/customer-email.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const requestId = formText(formData.get("requestId"));
  const payload = parseJsonObject(formData.get("payload"));

  if (!payload) {
    return Response.json({
      errors: [{ code: "CUSTOMER_EMAIL_PREVIEW_PAYLOAD_INVALID", message: "The preview request is not valid.", status: 400 }],
      preview: null,
      requestId,
    }, { status: 400 });
  }

  const result = await previewSampleCustomerNotification(request, payload, {
    sessionToken: formText(formData.get("shopifySessionToken")),
  });

  return Response.json({ ...result, requestId });
};

function parseJsonObject(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formText(value) {
  return value == null ? "" : String(value).trim();
}
