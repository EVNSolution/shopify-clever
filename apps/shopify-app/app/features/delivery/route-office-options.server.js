import {
  deliveryApiRequest,
  invalidateDeliveryRouteResponseCache,
} from "./route-plans.server.js";

export async function fetchRouteCashSettlements(
  request,
  routePlanId,
  options = {},
) {
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${encodeURIComponent(routePlanId)}/cash-settlements`,
    {
      ...options,
      cacheTtlMs: 0,
      method: "GET",
    },
  );
  if (
    !result.errors.length &&
    (result.data?.routePlanId !== routePlanId ||
      !Array.isArray(result.data?.receipts))
  ) {
    return {
      routePlanId,
      receipts: [],
      errors: [
        {
          message:
            "The receipt response did not match this route. Refresh and try again.",
        },
      ],
    };
  }
  return {
    routePlanId,
    receipts: result.data?.receipts ?? [],
    errors: result.errors,
  };
}

export async function confirmRouteCashSettlement(
  request,
  routePlanId,
  payload,
  options = {},
) {
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${encodeURIComponent(routePlanId)}/cash-settlements`,
    {
      ...options,
      method: "POST",
      skipCacheInvalidation: true,
      body: JSON.stringify(payload),
    },
  );
  if (!result.errors.length)
    invalidateDeliveryRouteResponseCache(request, options);
  return { settlement: result.data?.settlement ?? null, errors: result.errors };
}

export async function saveRouteOptions(
  request,
  routePlanId,
  payload,
  options = {},
) {
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${encodeURIComponent(routePlanId)}/options`,
    {
      ...options,
      method: "PATCH",
      skipCacheInvalidation: true,
      body: JSON.stringify(payload),
    },
  );
  if (!result.errors.length)
    invalidateDeliveryRouteResponseCache(request, options);
  return { routePlan: result.data?.routePlan ?? null, errors: result.errors };
}

export function isKfoodOfficeEnabled(shop, env = process.env) {
  return (
    env.CLEVER_APP_ID?.trim() === "clever-route-kfood" &&
    shop?.trim().toLowerCase() === "7hrud1-xq.myshopify.com"
  );
}
export function requireKfoodOffice(session) {
  if (!isKfoodOfficeEnabled(session?.shop))
    throw new Response("Not found", { status: 404 });
}
