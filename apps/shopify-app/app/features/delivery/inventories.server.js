import { deliveryApiRequest } from "./route-plans.server.js";

export const DELIVERY_INVENTORY_ID_MISSING_ERROR_CODE = "DELIVERY_INVENTORY_ID_MISSING";

export async function createDeliveryInventory(request, payload, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/inventories", {
    body: JSON.stringify(payload ?? {}),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });

  return {
    inventory: result.data?.inventory ?? null,
    errors: result.errors,
  };
}

export async function fetchDeliveryInventories(request, query = {}, options = {}) {
  const result = await deliveryApiRequest(request, `/admin/inventories${buildQueryString(query)}`, {
    cacheKey: options.cacheKey,
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
  });

  return {
    inventories: result.data?.inventories ?? [],
    errors: result.errors,
  };
}

export async function fetchDeliveryInventoryDetail(request, inventoryId, options = {}) {
  const safeInventoryId = encodeURIComponent(inventoryId ?? "");
  if (!safeInventoryId) {
    return { inventory: null, errors: [{ code: DELIVERY_INVENTORY_ID_MISSING_ERROR_CODE, message: "조회할 inventory ID가 없습니다." }] };
  }

  const result = await deliveryApiRequest(request, `/admin/inventories/${safeInventoryId}`, {
    cacheKey: options.cacheKey,
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
  });

  return {
    inventory: result.data?.inventory ?? null,
    errors: result.errors,
  };
}

export async function fetchDeliveryInventoryOrderView(request, inventoryId, options = {}) {
  const safeInventoryId = encodeURIComponent(inventoryId ?? "");
  if (!safeInventoryId) {
    return { inventory: null, errors: [{ code: DELIVERY_INVENTORY_ID_MISSING_ERROR_CODE, message: "조회할 inventory ID가 없습니다." }] };
  }

  const result = await deliveryApiRequest(request, `/admin/inventories/${safeInventoryId}/order-view`, {
    cacheKey: options.cacheKey,
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
  });

  return {
    inventory: result.data?.inventory ?? null,
    errors: result.errors,
  };
}

export async function deleteDeliveryInventory(request, inventoryId, options = {}) {
  const normalizedInventoryId = String(inventoryId ?? "").trim();
  if (!normalizedInventoryId) {
    return {
      inventoryId: null,
      errors: [{ code: DELIVERY_INVENTORY_ID_MISSING_ERROR_CODE, message: "삭제할 inventory ID가 없습니다." }],
    };
  }

  const result = await deliveryApiRequest(request, `/admin/inventories/${encodeURIComponent(normalizedInventoryId)}`, {
    fetch: options.fetch,
    method: "DELETE",
    sessionToken: options.sessionToken,
  });

  return {
    inventoryId: result.data?.inventoryId ?? result.data?.id ?? normalizedInventoryId,
    errors: result.errors,
  };
}

function buildQueryString(query) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null || value === "") continue;
    searchParams.set(key, String(value));
  }
  const text = searchParams.toString();
  return text ? `?${text}` : "";
}
