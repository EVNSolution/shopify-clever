import { deleteDeliveryRoutePlan, deliveryApiRequest } from "./route-plans.server.js";
import {
  getRouteGroupChildRouteName,
  getRouteGroupChildRoutePlanId,
  getVisibleRouteGroupChildren,
  textOrUndefined,
} from "./route-helpers.js";

export const DELIVERY_ROUTE_GROUP_ID_MISSING_ERROR_CODE = "DELIVERY_ROUTE_GROUP_ID_MISSING";

function logRouteGroupLifecycle(name, metric = {}) {
  console.info(name, {
    measuredAt: new Date().toISOString(),
    ...metric,
  });
}

function summarizeRouteGroupForLog(routeGroup) {
  const children = getVisibleRouteGroupChildren(routeGroup);

  return {
    assignmentCount: Array.isArray(routeGroup?.assignments) ? routeGroup.assignments.length : 0,
    childCount: children.length,
    childRoutePlanIds: children.map(getRouteGroupChildRoutePlanId).filter(Boolean),
    routeGroupId: routeGroup?.id ?? null,
    routeName: routeGroup?.name ?? null,
    status: routeGroup?.displayStatus ?? routeGroup?.status ?? null,
  };
}

export async function createDeliveryRouteGroup(request, payload, options = {}) {
  logRouteGroupLifecycle("delivery.route_group.create.start", {
    dateRangeEnd: payload?.dateRangeEnd ?? null,
    dateRangeStart: payload?.dateRangeStart ?? null,
    orderCount: Array.isArray(payload?.orderIds) ? payload.orderIds.length : 0,
    routeName: payload?.name ?? null,
  });

  const result = await deliveryApiRequest(request, "/admin/route-groups", {
    body: JSON.stringify(payload ?? {}),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });
  const routeGroup = normalizeRouteGroup(result.data?.routeGroup);

  logRouteGroupLifecycle("delivery.route_group.create.done", {
    ...summarizeRouteGroupForLog(routeGroup),
    errorCount: result.errors.length,
  });

  return {
    routeGroup,
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

  logRouteGroupLifecycle("delivery.route_group.delete.start", { routeGroupId });

  const result = await deliveryApiRequest(request, `/admin/route-groups/${safeRouteGroupId}`, {
    fetch: options.fetch,
    method: "DELETE",
    sessionToken: options.sessionToken,
  });

  const routeGroup = normalizeRouteGroup(result.data?.routeGroup);
  const deletedRouteGroupId = result.data?.routeGroupId ?? routeGroup?.id ?? result.data?.id ?? routeGroupId;

  logRouteGroupLifecycle("delivery.route_group.delete.done", {
    ...(routeGroup ? summarizeRouteGroupForLog(routeGroup) : {}),
    deletedRouteGroupId,
    errorCount: result.errors.length,
    requestedRouteGroupId: routeGroupId,
  });

  return {
    routeGroup,
    routeGroupId: deletedRouteGroupId,
    errors: result.errors,
  };
}

export async function deleteDeliveryRouteGroupChildRoute(request, routeGroupId, routePlanId, options = {}) {
  return deleteDeliveryRouteGroupChildRoutes(request, routeGroupId, [routePlanId], options);
}

export async function deleteDeliveryRouteGroupChildRoutes(request, routeGroupId, routePlanIds, options = {}) {
  const normalizedRoutePlanIds = readOrderIds(routePlanIds);
  logRouteGroupLifecycle("delivery.route_group.child_delete.start", {
    routeGroupId,
    routePlanIds: normalizedRoutePlanIds,
  });

  const routeGroupData = await fetchDeliveryRouteGroupDetail(request, routeGroupId, options);
  if ((routeGroupData.errors ?? []).length > 0) {
    logRouteGroupLifecycle("delivery.route_group.child_delete.detail_failed", {
      errorCount: routeGroupData.errors.length,
      routeGroupId,
      routePlanIds: normalizedRoutePlanIds,
    });
    return { ...routeGroupData, routeGroupId, routePlanIds };
  }

  const draftResult = buildRouteGroupChildrenDeleteDraft(routeGroupData.routeGroup, routePlanIds);
  logRouteGroupLifecycle("delivery.route_group.child_delete.plan", {
    ...summarizeChildDeleteForLog(routeGroupData.routeGroup, normalizedRoutePlanIds, draftResult),
    routeGroupId,
  });
  if ((draftResult.errors ?? []).length > 0) {
    logRouteGroupLifecycle("delivery.route_group.child_delete.plan_failed", {
      errorCount: draftResult.errors.length,
      routeGroupId,
      routePlanIds: normalizedRoutePlanIds,
    });
    return {
      routeGroup: routeGroupData.routeGroup,
      routeGroupId,
      routePlanIds,
      errors: draftResult.errors,
    };
  }

  for (const routePlanId of normalizedRoutePlanIds) {
    logRouteGroupLifecycle("delivery.route_group.child_delete.route_plan_delete.start", {
      routeGroupId,
      routePlanId,
    });
    const deleteResult = await deleteDeliveryRoutePlan(request, routePlanId, options);
    logRouteGroupLifecycle("delivery.route_group.child_delete.route_plan_delete.done", {
      deletedRoutePlanId: deleteResult.routePlanId ?? null,
      errorCount: deleteResult.errors.length,
      routeGroupId,
      routePlanId,
    });
    if ((deleteResult.errors ?? []).length > 0) {
      return {
        routeGroup: routeGroupData.routeGroup,
        routeGroupId,
        routePlanId,
        routePlanIds: normalizedRoutePlanIds,
        errors: deleteResult.errors,
      };
    }
  }

  if (!draftResult.draft) {
    logRouteGroupLifecycle("delivery.route_group.child_delete.done", {
      collapsedSplit: true,
      deletedRoutePlanIds: normalizedRoutePlanIds,
      errorCount: 0,
      routeGroupId,
    });

    return {
      routeGroup: routeGroupData.routeGroup,
      routeGroupId,
      routePlanId: normalizedRoutePlanIds[0] ?? null,
      routePlanIds: normalizedRoutePlanIds,
      errors: [],
    };
  }

  logRouteGroupLifecycle("delivery.route_group.child_delete.draft_save.start", {
    routeCount: draftResult.draft.routes.length,
    routeGroupId,
    routes: draftResult.draft.routes.map((route) => ({
      orderCount: route.orderIds.length,
      routeIdx: route.routeIdx,
      routePlanId: route.routePlanId,
    })),
  });
  const saveResult = await saveDeliveryRouteGroupDraft(request, routeGroupId, draftResult.draft, options);
  logRouteGroupLifecycle("delivery.route_group.child_delete.draft_save.done", {
    ...summarizeRouteGroupForLog(saveResult.routeGroup),
    errorCount: saveResult.errors.length,
    routeGroupId,
  });

  return {
    routeGroup: saveResult.routeGroup,
    routeGroupId,
    routePlanId: normalizedRoutePlanIds[0] ?? null,
    routePlanIds: normalizedRoutePlanIds,
    errors: saveResult.errors,
  };
}

export function buildRouteGroupChildDeleteDraft(routeGroup, routePlanId) {
  return buildRouteGroupChildrenDeleteDraft(routeGroup, [routePlanId]);
}

export function buildRouteGroupChildrenDeleteDraft(routeGroup, routePlanIds) {
  const routeChildren = getVisibleRouteGroupChildren(routeGroup);
  const routePlanIdSet = new Set(readOrderIds(routePlanIds));
  const deletedChildren = routeChildren.filter((child) => routePlanIdSet.has(getRouteGroupChildRoutePlanId(child)));
  if (deletedChildren.length === 0) {
    return { draft: null, errors: [{ message: "삭제할 child route를 찾을 수 없습니다." }] };
  }

  const mergeTargetIndex = routeChildren.findIndex((child) => !routePlanIdSet.has(getRouteGroupChildRoutePlanId(child)));
  if (mergeTargetIndex < 0) return { draft: null, errors: [] };

  const deletedOrderIds = deletedChildren.flatMap(getRouteGroupChildOrderIds);
  const remainingChildCount = routeChildren.length - deletedChildren.length;
  if (remainingChildCount <= 1) return { draft: null, errors: [] };

  const routes = routeChildren.flatMap((child, index) => {
    const childRoutePlanId = getRouteGroupChildRoutePlanId(child);
    if (routePlanIdSet.has(childRoutePlanId)) return [];

    const childOrderIds = getRouteGroupChildOrderIds(child);
    const routeIndex = index + 1;
    const orderIds = index === mergeTargetIndex
      ? uniqueTexts([...childOrderIds, ...deletedOrderIds])
      : childOrderIds;

    return [{
      color: textOrUndefined(child?.color) ?? null,
      label: getRouteGroupChildRouteName(routeGroup, child, child?.routePlan ?? {}, index),
      orderIds,
      routeKey: `routePlan:${childRoutePlanId}`,
      routeIdx: routeIndex,
      routePlanId: childRoutePlanId,
      sortOrder: routeIndex,
      tempId: null,
    }];
  });

  return { draft: { mode: "OPTIMIZE_ORDER", routes }, errors: [] };
}

function summarizeChildDeleteForLog(routeGroup, routePlanIds, draftResult) {
  const routePlanIdSet = new Set(routePlanIds);
  const routeChildren = getVisibleRouteGroupChildren(routeGroup);
  const deletedChildren = routeChildren.filter((child) => routePlanIdSet.has(getRouteGroupChildRoutePlanId(child)));
  const remainingChildren = routeChildren.filter((child) => !routePlanIdSet.has(getRouteGroupChildRoutePlanId(child)));

  return {
    childCountBefore: routeChildren.length,
    childRoutePlanIdsBefore: routeChildren.map(getRouteGroupChildRoutePlanId).filter(Boolean),
    deletedChildCount: deletedChildren.length,
    deletedOrderCount: deletedChildren.flatMap(getRouteGroupChildOrderIds).length,
    draftRouteCount: draftResult.draft?.routes?.length ?? 0,
    remainingChildCount: remainingChildren.length,
    remainingRoutePlanIds: remainingChildren.map(getRouteGroupChildRoutePlanId).filter(Boolean),
    routePlanIds,
    willCollapseSplit: !draftResult.draft && deletedChildren.length > 0 && remainingChildren.length <= 1,
    willSaveDraft: Boolean(draftResult.draft),
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

function getRouteGroupChildOrderIds(child) {
  return uniqueTexts([
    ...readOrderIds(child?.orderIds),
    ...readOrderIdsFromObjects(child?.stops),
  ]);
}

function readOrderIds(values) {
  return Array.isArray(values) ? values.map(textOrUndefined).filter(Boolean) : [];
}

function readOrderIdsFromObjects(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => textOrUndefined(
      value?.orderId
        ?? value?.deliveryOrderId
        ?? value?.sourceOrderId
        ?? value?.id,
    ))
    .filter(Boolean);
}

function uniqueTexts(values) {
  return Array.from(new Set(values.map(textOrUndefined).filter(Boolean)));
}

export async function generateDeliveryRouteGroupChildRoutes(request, routeGroupId, payload = {}, options = {}) {
  const safeRouteGroupId = encodeURIComponent(routeGroupId ?? "");
  if (!safeRouteGroupId) return missingRouteGroupResult("생성할 route group ID가 없습니다.");

  logRouteGroupLifecycle("delivery.route_group.generate_children.start", {
    confirmRisk: Boolean(payload?.confirmRisk),
    routeGroupId,
  });

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
  const routeGroup = normalizeRouteGroup(result.data?.routeGroup);

  logRouteGroupLifecycle("delivery.route_group.generate_children.done", {
    ...summarizeRouteGroupForLog(routeGroup),
    errorCount: result.errors.length,
    requestedRouteGroupId: routeGroupId,
    warningCount: result.data?.warnings?.length ?? 0,
  });

  return {
    routeGroup,
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
