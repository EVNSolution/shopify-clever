import {
  clearDeliveryApiResponseCache,
  deliveryApiRequest,
  primeDeliveryApiGetResponseCache,
} from "./route-plans.server.js";

const DELIVERY_ORDERS_SYNC_SOURCE = "clever-app-orders";
const DELIVERY_ORDERS_SYNC_REASON = "orders_page_open";

export async function syncDeliveryOrders(request, payload = {}, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/orders/sync", {
    body: JSON.stringify({
      source: DELIVERY_ORDERS_SYNC_SOURCE,
      reason: payload.reason ?? DELIVERY_ORDERS_SYNC_REASON,
      orders: Array.isArray(payload.orders) ? payload.orders : [],
    }),
    fetch: options.fetch,
    method: "PATCH",
    sessionToken: options.sessionToken,
  });

  if (options.primeOrdersCache === true) {
    primeDeliveryApiGetResponseCache(
      request,
      "/admin/orders",
      {
        data: { orders: result.data?.orders ?? [] },
        errors: result.errors,
      },
      {
        cacheKey: options.cacheKey,
        fetch: options.fetch,
        sessionToken: options.sessionToken,
      },
    );
  }

  return {
    orders: result.data?.orders ?? [],
    sync: result.data?.sync ?? null,
    errors: result.errors,
  };
}

export async function fetchDeliveryOrders(request, filters = {}, options = {}) {
  const result = await deliveryApiRequest(
    request,
    buildDeliveryOrdersPath(filters),
    {
      fetch: options.fetch,
      cacheKey: options.cacheKey,
      method: "GET",
      sessionToken: options.sessionToken,
    },
  );

  return {
    orders: result.data?.orders ?? [],
    errors: result.errors,
  };
}

export async function bulkUpdateDeliveryOrders(request, payload = {}, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/orders/bulk-update", {
    body: JSON.stringify({
      field: payload.field,
      orderIds: Array.isArray(payload.orderIds) ? payload.orderIds : [],
      value: payload.value,
    }),
    fetch: options.fetch,
    method: "PATCH",
    sessionToken: options.sessionToken,
  });
  clearDeliveryApiResponseCache();

  return {
    orders: result.data?.orders ?? [],
    updated: result.data?.updated ?? 0,
    errors: result.errors,
  };
}

function buildDeliveryOrdersPath(filters) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}
