import { deliveryApiRequest } from "./route-plans.server.js";

export const DELIVERY_ROUTE_GROUP_ID_MISSING_ERROR_CODE = "DELIVERY_ROUTE_GROUP_ID_MISSING";

export async function createDeliveryRouteGroup(request, payload, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/route-groups", {
    body: JSON.stringify(payload ?? {}),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });

  return {
    routeGroup: result.data?.routeGroup ?? null,
    errors: result.errors,
  };
}

export async function fetchDeliveryRouteGroups(request, query = {}, options = {}) {
  const result = await deliveryApiRequest(request, `/admin/route-groups${buildQueryString(query)}`, {
    cacheKey: options.cacheKey,
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
    suppressErrorStatuses: [404],
  });

  const errors = (result.errors ?? []).filter((error) => error?.status !== 404);

  return {
    routeGroups: result.data?.routeGroups ?? [],
    errors,
  };
}

export async function fetchDeliveryRouteGroupDetail(request, routeGroupId, options = {}) {
  const safeRouteGroupId = encodeURIComponent(routeGroupId ?? "");
  if (!safeRouteGroupId) return missingRouteGroupResult("조회할 route group ID가 없습니다.");

  const result = await deliveryApiRequest(request, `/admin/route-groups/${safeRouteGroupId}`, {
    cacheKey: options.cacheKey,
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
  });

  return {
    routeGroup: result.data?.routeGroup ?? null,
    errors: result.errors,
  };
}

export async function updateDeliveryRouteGroupOrders(request, routeGroupId, payload, options = {}) {
  return mutateRouteGroup(request, routeGroupId, "/orders", payload, options, "수정할 route group ID가 없습니다.");
}

export async function createDeliveryRouteGroupBranch(request, routeGroupId, payload, options = {}) {
  return mutateRouteGroup(request, routeGroupId, "/branches", payload, { ...options, method: "POST" }, "branch를 만들 route group ID가 없습니다.");
}

export async function updateDeliveryRouteGroupBranchOrders(request, routeGroupId, branchId, payload, options = {}) {
  const safeBranchId = encodeURIComponent(branchId ?? "");
  if (!safeBranchId) return missingRouteGroupResult("수정할 branch ID가 없습니다.");
  return mutateRouteGroup(request, routeGroupId, `/branches/${safeBranchId}/orders`, payload, options, "수정할 route group ID가 없습니다.");
}

export async function deleteDeliveryRouteGroupBranch(request, routeGroupId, branchId, options = {}) {
  const safeBranchId = encodeURIComponent(branchId ?? "");
  if (!safeBranchId) return missingRouteGroupResult("삭제할 branch ID가 없습니다.");
  return mutateRouteGroup(request, routeGroupId, `/branches/${safeBranchId}`, {}, { ...options, method: "DELETE" }, "삭제할 route group ID가 없습니다.");
}

export async function saveDeliveryRouteGroupPolygons(request, routeGroupId, payload, options = {}) {
  return mutateRouteGroup(request, routeGroupId, "/polygons", payload, options, "수정할 route group ID가 없습니다.");
}

export async function resolveDeliveryRouteGroupAssignments(request, routeGroupId, payload, options = {}) {
  return mutateRouteGroup(request, routeGroupId, "/assignments", payload, options, "수정할 route group ID가 없습니다.");
}

export async function generateDeliveryRouteGroupChildRoutes(request, routeGroupId, payload = {}, options = {}) {
  const safeRouteGroupId = encodeURIComponent(routeGroupId ?? "");
  if (!safeRouteGroupId) return missingRouteGroupResult("생성할 route group ID가 없습니다.");

  const result = await deliveryApiRequest(
    request,
    `/admin/route-groups/${safeRouteGroupId}/generate-child-routes`,
    {
      body: JSON.stringify(payload ?? {}),
      fetch: options.fetch,
      method: "POST",
      sessionToken: options.sessionToken,
    },
  );

  return {
    routeGroup: result.data?.routeGroup ?? null,
    warnings: result.data?.warnings ?? [],
    errors: result.errors,
  };
}

async function mutateRouteGroup(request, routeGroupId, suffix, payload, options, missingMessage) {
  const safeRouteGroupId = encodeURIComponent(routeGroupId ?? "");
  if (!safeRouteGroupId) return missingRouteGroupResult(missingMessage);

  const result = await deliveryApiRequest(request, `/admin/route-groups/${safeRouteGroupId}${suffix}`, {
    ...(options.method === "DELETE" ? {} : { body: JSON.stringify(payload ?? {}) }),
    fetch: options.fetch,
    method: options.method ?? "PATCH",
    sessionToken: options.sessionToken,
  });

  return {
    routeGroup: result.data?.routeGroup ?? null,
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

function missingRouteGroupResult(message) {
  return {
    routeGroup: null,
    errors: [
      {
        code: DELIVERY_ROUTE_GROUP_ID_MISSING_ERROR_CODE,
        message,
      },
    ],
  };
}
