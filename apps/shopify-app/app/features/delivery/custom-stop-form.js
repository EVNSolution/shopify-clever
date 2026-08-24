const CUSTOM_STOP_DEFAULTS = Object.freeze({
  address1: "",
  address2: "",
  city: "",
  countryCode: "",
  email: "",
  instructions: "",
  latitude: "",
  longitude: "",
  phone: "",
  postalCode: "",
  priority: "0",
  province: "",
  recipientName: "",
  serviceMinutes: "5",
  stopName: "",
  timeWindowEnd: "",
  timeWindowStart: "",
});

export function createCustomStopDraft(values = {}) {
  return Object.fromEntries(
    Object.entries({ ...CUSTOM_STOP_DEFAULTS, ...values }).map(([key, value]) => [
      key,
      value == null ? "" : String(value),
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

export function validateCustomStopDraft(draft) {
  const errors = {};
  const stopName = cleanText(draft?.stopName);
  const address1 = cleanText(draft?.address1);
  const latitudeText = cleanText(draft?.latitude);
  const longitudeText = cleanText(draft?.longitude);
  const serviceMinutes = Number(draft?.serviceMinutes);
  const priority = Number(draft?.priority);
  const timeWindowStart = cleanText(draft?.timeWindowStart);
  const timeWindowEnd = cleanText(draft?.timeWindowEnd);

  if (!stopName) errors.stopName = "Enter a stop name.";
  else if (stopName.length > 80) errors.stopName = "Stop name must be 80 characters or fewer.";

  if (!address1) errors.address1 = "Enter an address.";

  if (latitudeText || longitudeText) {
    if (!latitudeText) errors.latitude = "Enter latitude when longitude is provided.";
    if (!longitudeText) errors.longitude = "Enter longitude when latitude is provided.";

    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    if (latitudeText && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      errors.latitude = "Latitude must be between -90 and 90.";
    }
    if (longitudeText && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      errors.longitude = "Longitude must be between -180 and 180.";
    }
    if (latitude === 0 && longitude === 0) {
      errors.latitude = "Zero coordinates cannot be used for a route stop.";
      errors.longitude = "Zero coordinates cannot be used for a route stop.";
    }
  }

  if (!Number.isInteger(serviceMinutes) || serviceMinutes < 0 || serviceMinutes > 1440) {
    errors.serviceMinutes = "Stop time must be a whole number from 0 to 1440 minutes.";
  }
  if (!Number.isInteger(priority) || priority < 0 || priority > 10) {
    errors.priority = "Priority must be a whole number from 0 to 10.";
  }

  if (timeWindowStart || timeWindowEnd) {
    if (!timeWindowStart) errors.timeWindowStart = "Enter a time window start.";
    if (!timeWindowEnd) errors.timeWindowEnd = "Enter a time window end.";
    if (
      timeWindowStart
      && timeWindowEnd
      && Date.parse(timeWindowEnd) <= Date.parse(timeWindowStart)
    ) {
      errors.timeWindowEnd = "Time window end must be after the start.";
    }
  }

  if (String(draft?.instructions ?? "").length > 500) {
    errors.instructions = "Driver instructions must be 500 characters or fewer.";
  }

  return errors;
}

export function buildCustomStopPayload(draft, context = {}) {
  return {
    address1: cleanText(draft?.address1),
    address2: cleanText(draft?.address2),
    city: cleanText(draft?.city),
    countryCode: cleanText(draft?.countryCode),
    email: cleanText(draft?.email),
    ...(cleanText(context.expectedUpdatedAt) ? { expectedUpdatedAt: cleanText(context.expectedUpdatedAt) } : {}),
    instructions: cleanText(draft?.instructions),
    latitude: finiteNumberOrNull(draft?.latitude),
    longitude: finiteNumberOrNull(draft?.longitude),
    phone: cleanText(draft?.phone),
    postalCode: cleanText(draft?.postalCode),
    priority: Number(draft?.priority),
    province: cleanText(draft?.province),
    recipientName: cleanText(draft?.recipientName),
    serviceMinutes: Number(draft?.serviceMinutes),
    stopName: cleanText(draft?.stopName),
    ...(cleanText(context.targetRoutePlanId) ? { targetRoutePlanId: cleanText(context.targetRoutePlanId) } : {}),
    timeWindowEnd: cleanText(draft?.timeWindowEnd),
    timeWindowStart: cleanText(draft?.timeWindowStart),
  };
}

export function isCustomRouteStop(stop) {
  return stop?.isCustomStop === true || cleanText(stop?.sourcePlatform)?.toUpperCase() === "CUSTOM";
}

function finiteNumberOrNull(value) {
  const text = cleanText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}
