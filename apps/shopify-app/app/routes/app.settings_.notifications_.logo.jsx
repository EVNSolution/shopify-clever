import { uploadCustomerEmailLogo } from "../features/customer-notifications/customer-email.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const uploadFormData = new FormData();
  const logo = formData.get("logo");
  if (logo) uploadFormData.set("logo", logo);

  const result = await uploadCustomerEmailLogo(request, uploadFormData, {
    sessionToken: formText(formData.get("shopifySessionToken")),
  });

  return Response.json(result);
};

function formText(value) {
  return value == null ? "" : String(value).trim();
}
