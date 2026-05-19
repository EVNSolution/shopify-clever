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

export async function deleteDeliveryDriver(request, driverId, options = {}) {
  const normalizedDriverId = textOrNull(driverId);

  if (!normalizedDriverId) {
    return {
      driverId: null,
      errors: [{ message: "삭제할 배송원 ID가 필요합니다." }],
    };
  }

  const result = await deliveryApiRequest(request, `/admin/drivers/${encodeURIComponent(normalizedDriverId)}`, {
    fetch: options.fetch,
    method: "DELETE",
    sessionToken: options.sessionToken,
  });

  return {
    driverId: result.data?.driverId ?? result.data?.id ?? normalizedDriverId,
    errors: result.errors,
  };
}

export async function regenerateDeliveryDriverInviteCode(request, driverId, options = {}) {
  const result = await deliveryApiRequest(request, `/admin/drivers/${driverId}/regenerate-invite-code`, {
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });

  return {
    driver: result.data?.driver ?? null,
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
