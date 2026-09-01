const CUSTOM_STOP_DEFAULTS = Object.freeze({
  address1: "",
  address2: "",
  city: "",
  countryCode: "",
  email: "",
  phone: "",
  postalCode: "",
  province: "",
  recipientName: "",
});

export function createCustomStopDraft(values = {}) {
  return Object.fromEntries(
    Object.entries(CUSTOM_STOP_DEFAULTS).map(([key, defaultValue]) => [
      key,
      values[key] == null ? defaultValue : String(values[key]),
    ]),
  );
}

export function buildCustomStopAddress(draft) {
  return [
    draft?.address1,
    draft?.address2,
    draft?.city,
    draft?.province,
    draft?.postalCode,
    draft?.countryCode,
  ].map(cleanText).filter(Boolean).join(", ");
}

export function updateCustomStopDraftField(draft, field, value) {
  return { ...draft, [field]: value };
}

export function validateCustomStopDraft(draft) {
  const errors = {};
  const address1 = cleanText(draft?.address1);
  const countryCode = cleanText(draft?.countryCode).toUpperCase();

  if (!address1) errors.address1 = "Enter an address.";
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    errors.countryCode = "Enter a two-letter country code, such as CA.";
  }

  return errors;
}

export function buildCustomStopPayload(draft, context = {}) {
  return {
    address1: cleanText(draft?.address1),
    address2: cleanText(draft?.address2),
    city: cleanText(draft?.city),
    countryCode: cleanText(draft?.countryCode).toUpperCase(),
    email: cleanText(draft?.email),
    ...(cleanText(context.expectedUpdatedAt) ? { expectedUpdatedAt: cleanText(context.expectedUpdatedAt) } : {}),
    phone: cleanText(draft?.phone),
    postalCode: cleanText(draft?.postalCode),
    province: cleanText(draft?.province),
    recipientName: cleanText(draft?.recipientName),
    ...(cleanText(context.targetRoutePlanId) ? { targetRoutePlanId: cleanText(context.targetRoutePlanId) } : {}),
  };
}

export function isCustomRouteStop(stop) {
  return stop?.isCustomStop === true || cleanText(stop?.sourcePlatform)?.toUpperCase() === "CUSTOM";
}

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}
