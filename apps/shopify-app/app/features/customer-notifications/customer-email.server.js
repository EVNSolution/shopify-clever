import {
  deliveryApiRequest,
  getShopifySessionBearer,
} from "../delivery/route-plans.server.js";

export const CUSTOMER_NOTIFICATION_PAYLOAD_TOO_LARGE_ERROR_CODE =
  "CUSTOMER_NOTIFICATION_PAYLOAD_TOO_LARGE";
export const CUSTOMER_NOTIFICATION_ROUTE_ID_MISSING_ERROR_CODE =
  "CUSTOMER_NOTIFICATION_ROUTE_ID_MISSING";
export const CUSTOMER_NOTIFICATION_SETTINGS_PAYLOAD_INVALID_ERROR_CODE =
  "CUSTOMER_NOTIFICATION_SETTINGS_PAYLOAD_INVALID";
export const CUSTOMER_EMAIL_LOGO_FORM_DATA_REQUIRED_ERROR_CODE =
  "CUSTOMER_EMAIL_LOGO_FORM_DATA_REQUIRED";

const DEFAULT_SETTINGS_BODY_LIMIT_BYTES = 64 * 1024;
const DEFAULT_COMMAND_BODY_LIMIT_BYTES = 32 * 1024;
const DEFAULT_RECIPIENT_LIMIT = 500;

export function hasCustomerNotificationSessionToken(request, options = {}) {
  return Boolean(options.sessionToken || getShopifySessionBearer(request));
}

export async function fetchCustomerNotificationSettings(request, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/customer-email/settings", {
    cacheKey: options.cacheKey,
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
  });

  return {
    customerNotificationSettings:
      result.data?.customerNotificationSettings ?? result.data?.settings ?? null,
    errors: result.errors,
  };
}

export async function fetchCustomerEmailSettings(request, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/customer-email/settings", {
    cacheKey: options.cacheKey,
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
  });

  return normalizeResult(result, "customerEmailSettings");
}

export async function saveCustomerNotificationSettings(request, payload, options = {}) {
  const payloadResult = validateCustomerNotificationSettingsPayload(payload);
  if (payloadResult.errors.length > 0) {
    return {
      customerNotificationSettings: null,
      errors: payloadResult.errors,
    };
  }

  const result = await customerNotificationMutation(
    request,
    "/admin/customer-email/settings",
    payload,
    {
      ...options,
      method: "PATCH",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_SETTINGS_BODY_LIMIT_BYTES,
    },
  );

  return {
    customerNotificationSettings:
      result.data?.customerNotificationSettings ?? result.data?.settings ?? null,
    errors: result.errors,
  };
}

export async function saveCustomerEmailSettings(request, input, options = {}) {
  const payloadResult = validateCustomerNotificationSettingsPayload(input);
  if (payloadResult.errors.length > 0) {
    return {
      customerEmailSettings: null,
      errors: payloadResult.errors,
    };
  }

  const result = await customerNotificationMutation(
    request,
    "/admin/customer-email/settings",
    payloadResult.payload,
    {
      ...options,
      method: "PATCH",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_SETTINGS_BODY_LIMIT_BYTES,
    },
  );

  return normalizeResult(result, "customerEmailSettings");
}

export async function saveCustomerEmailGlobal(request, input, options = {}) {
  const payloadResult = validateCustomerNotificationSettingsPayload(input);
  if (payloadResult.errors.length > 0) {
    return {
      customerEmailGlobal: null,
      customerEmailSettings: null,
      errors: payloadResult.errors,
      globalVersion: null,
    };
  }

  const result = await customerNotificationMutation(
    request,
    "/admin/customer-email/settings/global",
    payloadResult.payload,
    {
      ...options,
      method: "PATCH",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_SETTINGS_BODY_LIMIT_BYTES,
    },
  );

  return normalizePartialSettingsResult(result, {
    partialKey: "customerEmailGlobal",
    versionKey: "globalVersion",
  });
}

export async function saveCustomerEmailTemplate(request, signal, input, options = {}) {
  const safeSignal = encodeTemplateSignal(signal);
  if (!safeSignal) {
    return {
      customerEmailSettings: null,
      customerEmailTemplate: null,
      errors: [{
        code: CUSTOMER_NOTIFICATION_SETTINGS_PAYLOAD_INVALID_ERROR_CODE,
        message: "Customer notification template signal is required.",
        status: 400,
      }],
      templateVersion: null,
    };
  }

  const payloadResult = validateCustomerNotificationSettingsPayload(input);
  if (payloadResult.errors.length > 0) {
    return {
      customerEmailSettings: null,
      customerEmailTemplate: null,
      errors: payloadResult.errors,
      templateVersion: null,
    };
  }

  const result = await customerNotificationMutation(
    request,
    `/admin/customer-email/settings/templates/${safeSignal}`,
    payloadResult.payload,
    {
      ...options,
      method: "PATCH",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_SETTINGS_BODY_LIMIT_BYTES,
    },
  );

  return normalizePartialSettingsResult(result, {
    partialKey: "customerEmailTemplate",
    versionKey: "templateVersion",
  });
}

export async function saveCustomerNotificationSettingsFromForm(request, formData, options = {}) {
  const payloadResult = readCustomerNotificationSettingsPayload(
    formData.get("customerNotificationSettings"),
  );

  if (payloadResult.errors.length > 0) {
    return {
      customerNotificationSettings: null,
      errors: payloadResult.errors,
    };
  }

  return saveCustomerNotificationSettings(request, payloadResult.payload, {
    ...options,
    sessionToken: options.sessionToken ?? formData.get("shopifySessionToken"),
  });
}

export async function fetchCustomerNotificationSenderReadiness(request, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/customer-email/sender-readiness", {
    cacheKey: options.cacheKey,
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
  });

  return {
    senderReadiness: result.data?.senderReadiness ?? result.data?.readiness ?? null,
    errors: result.errors,
  };
}

export async function previewSampleCustomerNotification(request, payload, options = {}) {
  const result = await customerNotificationMutation(
    request,
    "/admin/customer-email/sample-preview",
    payload,
    {
      ...options,
      method: "POST",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_SETTINGS_BODY_LIMIT_BYTES,
    },
  );

  return {
    preview: result.data?.preview ?? result.data?.renderedCustomerEmail ?? null,
    errors: result.errors,
  };
}

export async function previewRouteCustomerNotification(request, routePlanId, payload, options = {}) {
  const safeRoutePlanId = encodeRoutePlanId(routePlanId);
  if (!safeRoutePlanId) return missingRoutePlanIdResult("preview");

  const result = await customerNotificationMutation(
    request,
    `/admin/route-plans/${safeRoutePlanId}/customer-email/preview`,
    payload,
    {
      ...options,
      method: "POST",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_COMMAND_BODY_LIMIT_BYTES,
    },
  );

  return {
    preview: result.data?.preview ?? null,
    renderSnapshot: result.data?.renderSnapshot ?? null,
    recipients: result.data?.recipients ?? [],
    errors: result.errors,
  };
}

export async function sendTestCustomerNotification(request, payload, options = {}) {
  const result = await customerNotificationMutation(
    request,
    "/admin/customer-email/test",
    payload,
    {
      ...options,
      method: "POST",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_COMMAND_BODY_LIMIT_BYTES,
    },
  );

  return {
    testSend: result.data?.testSend ?? result.data?.result ?? null,
    errors: result.errors,
  };
}

export async function sendCustomerEmailTest(request, input, options = {}) {
  const result = await customerNotificationMutation(
    request,
    "/admin/customer-email/test",
    input,
    {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(input?.attemptId ? { "x-correlation-id": input.attemptId } : {}),
      },
      method: "POST",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_COMMAND_BODY_LIMIT_BYTES,
    },
  );

  return {
    ...normalizeResult(result, "test"),
    attemptId: input?.attemptId,
  };
}

export async function uploadCustomerEmailLogo(request, formData, options = {}) {
  if (!isFormDataPayload(formData)) {
    return {
      logoAsset: null,
      errors: [{
        code: CUSTOMER_EMAIL_LOGO_FORM_DATA_REQUIRED_ERROR_CODE,
        message: "Logo upload requires multipart form data.",
      }],
    };
  }

  const result = await deliveryApiRequest(request, "/admin/customer-email/logo", {
    fetch: options.fetch,
    body: formData,
    headers: options.headers,
    method: "POST",
    sessionToken: options.sessionToken,
    suppressErrorStatuses: options.suppressErrorStatuses,
  });

  return normalizeResult(result, "logoAsset");
}

export async function sendRouteCustomerNotification(request, routePlanId, payload, options = {}) {
  const safeRoutePlanId = encodeRoutePlanId(routePlanId);
  if (!safeRoutePlanId) return missingRoutePlanIdResult("send");

  const result = await customerNotificationMutation(
    request,
    `/admin/route-plans/${safeRoutePlanId}/customer-email/send`,
    payload,
    {
      ...options,
      method: "POST",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_COMMAND_BODY_LIMIT_BYTES,
    },
  );

  return {
    dispatch: result.data?.dispatch ?? result.data?.result ?? null,
    errors: result.errors,
  };
}

export async function previewRouteCustomerEmail(request, routePlanId, input, options = {}) {
  const result = await previewRouteCustomerNotification(request, routePlanId, input, options);

  return {
    preview: result.preview,
    errors: result.errors,
  };
}

export async function sendRouteCustomerEmail(request, routePlanId, input, options = {}) {
  const result = await sendRouteCustomerNotification(request, routePlanId, input, options);

  return {
    dispatch: result.dispatch,
    errors: result.errors,
  };
}

export async function retryFailedRouteCustomerNotification(request, routePlanId, payload, options = {}) {
  const safeRoutePlanId = encodeRoutePlanId(routePlanId);
  if (!safeRoutePlanId) return missingRoutePlanIdResult("retry");

  const result = await customerNotificationMutation(
    request,
    `/admin/route-plans/${safeRoutePlanId}/customer-email/retry-failed`,
    payload,
    {
      ...options,
      method: "POST",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_COMMAND_BODY_LIMIT_BYTES,
    },
  );

  return {
    retry: result.data?.retry ?? result.data?.result ?? null,
    errors: result.errors,
  };
}

export async function activateCustomerNotifications(request, payload, options = {}) {
  const result = await customerNotificationMutation(
    request,
    "/admin/customer-email/activation",
    payload,
    {
      ...options,
      method: "POST",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_COMMAND_BODY_LIMIT_BYTES,
    },
  );

  return {
    activation: result.data?.activation ?? result.data?.result ?? null,
    errors: result.errors,
  };
}

export async function deactivateCustomerNotifications(request, payload, options = {}) {
  const result = await customerNotificationMutation(
    request,
    "/admin/customer-email/activation",
    payload,
    {
      ...options,
      method: "DELETE",
      sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_COMMAND_BODY_LIMIT_BYTES,
    },
  );

  return {
    activation: result.data?.activation ?? result.data?.result ?? null,
    errors: result.errors,
  };
}

async function customerNotificationMutation(request, path, payload, options = {}) {
  const bodyResult = buildJsonBody(payload, {
    recipientLimit: options.recipientLimit ?? DEFAULT_RECIPIENT_LIMIT,
    sizeLimitBytes: options.sizeLimitBytes ?? DEFAULT_COMMAND_BODY_LIMIT_BYTES,
  });

  if (bodyResult.errors.length > 0) {
    return { data: null, errors: bodyResult.errors };
  }

  return deliveryApiRequest(request, path, {
    body: bodyResult.body,
    fetch: options.fetch,
    headers: options.headers,
    method: options.method ?? "POST",
    sessionToken: options.sessionToken,
    suppressErrorStatuses: options.suppressErrorStatuses,
  });
}

function buildJsonBody(payload, { recipientLimit, sizeLimitBytes }) {
  const recipientCount = countRecipients(payload);

  if (recipientCount > recipientLimit) {
    return {
      body: null,
      errors: [{
        code: CUSTOMER_NOTIFICATION_PAYLOAD_TOO_LARGE_ERROR_CODE,
        message: `Customer notification request has ${recipientCount} recipients; limit is ${recipientLimit}.`,
        status: 0,
      }],
    };
  }

  const body = JSON.stringify(payload ?? {});
  const byteLength = Buffer.byteLength(body, "utf8");

  if (byteLength > sizeLimitBytes) {
    return {
      body: null,
      errors: [{
        code: CUSTOMER_NOTIFICATION_PAYLOAD_TOO_LARGE_ERROR_CODE,
        message: `Customer notification request is ${byteLength} bytes; limit is ${sizeLimitBytes}.`,
        status: 0,
      }],
    };
  }

  return { body, errors: [] };
}

function readCustomerNotificationSettingsPayload(value) {
  if (typeof value !== "string" || !value.trim()) {
    return invalidSettingsPayloadResult("Customer notification settings payload is required.");
  }

  let payload;
  try {
    payload = JSON.parse(value);
  } catch {
    return invalidSettingsPayloadResult("Customer notification settings payload must be valid JSON.");
  }

  return validateCustomerNotificationSettingsPayload(payload);
}

function validateCustomerNotificationSettingsPayload(payload) {
  if (!isPlainObject(payload) || Object.keys(payload).length === 0) {
    return invalidSettingsPayloadResult("Customer notification settings payload must be a non-empty object.");
  }

  return { payload, errors: [] };
}

function invalidSettingsPayloadResult(message) {
  return {
    payload: null,
    errors: [{
      code: CUSTOMER_NOTIFICATION_SETTINGS_PAYLOAD_INVALID_ERROR_CODE,
      message,
      status: 400,
    }],
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeResult(result, key) {
  return {
    [key]: result?.data?.[key] ?? null,
    errors: result?.errors ?? [],
  };
}

function normalizePartialSettingsResult(result, { partialKey, versionKey }) {
  const data = result?.data ?? {};
  const partial = data[partialKey]
    ?? data.global
    ?? data.template
    ?? data.settingsPatch
    ?? null;

  return {
    customerEmailSettings:
      data.customerEmailSettings ?? data.customerNotificationSettings ?? data.settings ?? null,
    [partialKey]: partial,
    [versionKey]: data[versionKey] ?? partial?.version ?? null,
    errors: result?.errors ?? [],
  };
}

function isFormDataPayload(input) {
  return typeof FormData !== "undefined" && input instanceof FormData;
}

function countRecipients(payload) {
  const recipientIds = Array.isArray(payload?.recipientIds) ? payload.recipientIds : [];
  const recipients = Array.isArray(payload?.recipients) ? payload.recipients : [];
  const deliveryStopIds = Array.isArray(payload?.deliveryStopIds) ? payload.deliveryStopIds : [];
  const selectedStopIds = Array.isArray(payload?.selectedStopIds) ? payload.selectedStopIds : [];

  return Math.max(recipientIds.length, recipients.length, deliveryStopIds.length, selectedStopIds.length);
}

function encodeRoutePlanId(routePlanId) {
  const normalizedRoutePlanId = String(routePlanId ?? "").trim();
  return normalizedRoutePlanId ? encodeURIComponent(normalizedRoutePlanId) : null;
}

function encodeTemplateSignal(signal) {
  const normalizedSignal = String(signal ?? "").trim();
  return normalizedSignal ? encodeURIComponent(normalizedSignal) : null;
}

function missingRoutePlanIdResult(operation) {
  return {
    errors: [{
      code: CUSTOMER_NOTIFICATION_ROUTE_ID_MISSING_ERROR_CODE,
      message: `Customer notification ${operation} requires a route plan ID.`,
      status: 0,
    }],
  };
}
