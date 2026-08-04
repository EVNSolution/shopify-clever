import { deliveryApiRequest } from "./route-plans.server.js";

function normalizeResult(result, key) {
  return {
    [key]: result?.data?.[key] ?? null,
    errors: result?.errors ?? [],
  };
}

function isFormDataPayload(input) {
  return typeof FormData !== "undefined" && input instanceof FormData;
}

export async function fetchCustomerEmailSettings(request, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/customer-email/settings", options);
  return normalizeResult(result, "customerEmailSettings");
}

export async function saveCustomerEmailSettings(request, input, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/customer-email/settings", {
    ...options,
    body: JSON.stringify(input),
    method: "PATCH",
  });
  return normalizeResult(result, "customerEmailSettings");
}

export async function sendCustomerEmailTest(request, input, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/customer-email/test", {
    ...options,
    body: JSON.stringify(input),
    headers: {
      ...(options.headers ?? {}),
      "x-correlation-id": input.attemptId,
    },
    method: "POST",
  });
  return {
    ...normalizeResult(result, "test"),
    attemptId: input.attemptId,
  };
}

export async function uploadCustomerEmailLogo(request, formData, options = {}) {
  if (!isFormDataPayload(formData)) {
    return {
      logoAsset: null,
      errors: [{
        code: "CUSTOMER_EMAIL_LOGO_FORM_DATA_REQUIRED",
        message: "Logo upload requires multipart form data.",
      }],
    };
  }

  const result = await deliveryApiRequest(request, "/admin/customer-email/logo", {
    ...options,
    body: formData,
    method: "POST",
  });
  return normalizeResult(result, "logoAsset");
}

export async function previewRouteCustomerEmail(request, routePlanId, input, options = {}) {
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${encodeURIComponent(routePlanId)}/customer-email/preview`,
    { ...options, body: JSON.stringify(input), method: "POST" },
  );
  return normalizeResult(result, "preview");
}

export async function sendRouteCustomerEmail(request, routePlanId, input, options = {}) {
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${encodeURIComponent(routePlanId)}/customer-email/send`,
    { ...options, body: JSON.stringify(input), method: "POST" },
  );
  return normalizeResult(result, "dispatch");
}
