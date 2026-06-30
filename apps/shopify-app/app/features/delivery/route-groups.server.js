import { deliveryApiRequest } from "./route-plans.server.js";
import { getRouteGroupChildRoutePlanId } from "./route-helpers.js";

export const DELIVERY_ROUTE_GROUP_ID_MISSING_ERROR_CODE = "DELIVERY_ROUTE_GROUP_ID_MISSING";

export async function createDeliveryRouteGroup(request, payload, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/route-groups", {
    body: JSON.stringify(payload ?? {}),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });

  return {
    routeGroup: normalizeRouteGroup(result.data?.routeGroup),
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
    routeGroups: normalizeRouteGroups(result.data?.routeGroups),
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
    routeGroup: normalizeRouteGroup(result.data?.routeGroup),
    errors: result.errors,
  };
}

export async function updateDeliveryRouteGroupOrders(request, routeGroupId, payload, options = {}) {
  return mutateRouteGroup(request, routeGroupId, "/orders", payload, options, "수정할 route group ID가 없습니다.");
}

export async function saveDeliveryRouteGroupDraft(request, routeGroupId, payload, options = {}) {
  return mutateRouteGroup(request, routeGroupId, "/draft", payload, options, "저장할 route group ID가 없습니다.");
}

export async function deleteDeliveryRouteGroup(request, routeGroupId, options = {}) {
  const safeRouteGroupId = encodeURIComponent(routeGroupId ?? "");
  if (!safeRouteGroupId) return missingRouteGroupResult("삭제할 route group ID가 없습니다.");

  const result = await deliveryApiRequest(request, `/admin/route-groups/${safeRouteGroupId}`, {
    fetch: options.fetch,
    method: "DELETE",
    sessionToken: options.sessionToken,
  });

  const routeGroup = normalizeRouteGroup(result.data?.routeGroup);

  return {
    routeGroup,
    routeGroupId: result.data?.routeGroupId ?? routeGroup?.id ?? result.data?.id ?? routeGroupId,
    errors: result.errors,
  };
}

export async function previewDeliveryRouteGroupOptimization(request, routeGroupId, payload = {}, options = {}) {
  const safeRouteGroupId = encodeURIComponent(routeGroupId ?? "");
  if (!safeRouteGroupId) return { preview: null, errors: missingRouteGroupResult("미리보기할 route group ID가 없습니다.").errors };

  const result = await deliveryApiRequest(request, `/admin/route-groups/${safeRouteGroupId}/optimize-preview`, {
    body: JSON.stringify(payload ?? {}),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });

  return {
    preview: result.data?.preview ?? null,
    errors: result.errors,
  };
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
    routeGroup: normalizeRouteGroup(result.data?.routeGroup),
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
    routeGroup: normalizeRouteGroup(result.data?.routeGroup),
    errors: result.errors,
  };
}

function normalizeRouteGroups(routeGroups) {
  return Array.isArray(routeGroups) ? routeGroups.map(normalizeRouteGroup) : [];
}

function normalizeRouteGroup(routeGroup) {
  if (!routeGroup || typeof routeGroup !== "object") return null;
  if (!Array.isArray(routeGroup.children)) return routeGroup;

  return {
    ...routeGroup,
    children: routeGroup.children.map(normalizeRouteGroupChild),
  };
}

function normalizeRouteGroupChild(child) {
  if (!child || typeof child !== "object") return child;
  const routePlanId = getRouteGroupChildRoutePlanId(child);
  return routePlanId && child.routePlanId !== routePlanId ? { ...child, routePlanId } : child;
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
