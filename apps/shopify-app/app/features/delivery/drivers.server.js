import { deliveryApiRequest } from "./route-plans.server.js";

const DELIVERY_DRIVER_INVITE_SOURCE = "clever-app-driver-invite";

export async function createPendingDeliveryDriver(request, payload = {}, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/drivers", {
    body: JSON.stringify(buildPendingDriverPayload(payload)),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });

  return {
    driver: result.data?.driver ?? null,
    errors: result.errors,
  };
}

export async function fetchDeliveryDrivers(request, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/drivers", {
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
  });

  return {
    drivers: result.data?.drivers ?? [],
    errors: result.errors,
  };
}

function buildPendingDriverPayload(payload) {
  return {
    source: DELIVERY_DRIVER_INVITE_SOURCE,
    displayName: textOrNull(payload.displayName),
    inviteLink: textOrNull(payload.inviteLink),
    phone: textOrNull(payload.phone),
  };
}

function textOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
