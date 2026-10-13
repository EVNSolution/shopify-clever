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

const ADDRESS_CHECK_FIELDS = ["address1", "address2", "city", "province", "postalCode", "countryCode"];

// An address check needs the same two things a save needs: a street address and a two-letter country code.
export function isCustomStopAddressCheckReady(draft) {
  return Boolean(cleanText(draft?.address1)) && /^[A-Za-z]{2}$/.test(cleanText(draft?.countryCode));
}

// The check result belongs to exactly these address values; any edit makes it stale.
export function customStopAddressKey(draft) {
  return JSON.stringify(ADDRESS_CHECK_FIELDS.map((field) => (
    field === "countryCode" ? cleanText(draft?.[field]).toUpperCase() : cleanText(draft?.[field])
  )));
}

export function buildCustomStopAddressCheckPayload(draft) {
  return {
    address1: cleanText(draft?.address1),
    address2: cleanText(draft?.address2),
    city: cleanText(draft?.city),
    countryCode: cleanText(draft?.countryCode).toUpperCase(),
    postalCode: cleanText(draft?.postalCode),
    province: cleanText(draft?.province),
  };
}

// Fills the postal code from a check only when the office left it empty; typed values are never overwritten.
export function applyAddressCheckToDraft(draft, check) {
  const postalCode = cleanText(check?.postalCode);
  if (!postalCode || cleanText(draft?.postalCode)) return draft;
  return { ...draft, postalCode };
}

export function readCustomStopAddressCheck(data) {
  const latitude = Number(data?.latitude);
  const longitude = Number(data?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    addressLabel: cleanText(data?.addressLabel),
    latitude,
    longitude,
    postalCode: cleanText(data?.postalCode) || null,
  };
}

// A group with several child routes needs a target. Preselect the first enabled one; hide the choice when only one is enabled.
export function defaultStopTargetRoutePlanId(options = []) {
  const first = options.find((option) => !option.disabled);
  return first ? first.value : "";
}

export function shouldShowStopTargetRoutePicker(options = []) {
  return options.filter((option) => !option.disabled).length > 1;
}

// An empty group may use its unassigned option. Materialized groups require an enabled child.
export function isStopTargetRouteValid(options = [], routePlanId = "") {
  return options.length === 0 || options.some((option) => !option.disabled && option.value === routePlanId);
}
