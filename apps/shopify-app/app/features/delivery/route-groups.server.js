import {
  clearDeliveryApiResponseCache,
  deleteDeliveryRoutePlan,
  deliveryApiRequest,
} from "./route-plans.server.js";
import {
  getRouteGroupChildRouteName,
  getRouteGroupChildRoutePlanId,
  getVisibleRouteGroupChildren,
  textOrUndefined,
} from "./route-helpers.js";
import { logStructuredMetric } from "../telemetry/structured-telemetry.server.js";

export const DELIVERY_ROUTE_GROUP_ID_MISSING_ERROR_CODE = "DELIVERY_ROUTE_GROUP_ID_MISSING";
const ROUTE_GROUP_COPY_MODES = new Set(["REFERENCE", "VIRTUAL"]);

export function buildRouteGroupAddOrdersDraft(routeGroup, addedOrderIds = [], targetRoutePlanId) {
  const children = getVisibleRouteGroupChildren(routeGroup);
  if (children.length === 0) return null;

  const assignmentOrderIds = Array.isArray(routeGroup?.assignments)
    ? routeGroup.assignments.map((assignment) => textOrUndefined(assignment?.orderId)).filter(Boolean)
    : [];
  const fallbackOrderIds = [
    ...children.flatMap((child) => Array.isArray(child?.orderIds) ? child.orderIds : []),
    ...addedOrderIds,
  ].map(textOrUndefined).filter(Boolean);
  const groupOrderIds = assignmentOrderIds.length > 0 ? assignmentOrderIds : [...new Set(fallbackOrderIds)];
  const groupOrderIdSet = new Set(groupOrderIds);
  const draftedOrderIds = new Set();

  const routes = children.map((child) => {
    const orderIds = (Array.isArray(child?.orderIds) ? child.orderIds : [])
      .map(textOrUndefined)
      .filter((orderId) => orderId && groupOrderIdSet.has(orderId) && !draftedOrderIds.has(orderId));
    orderIds.forEach((orderId) => draftedOrderIds.add(orderId));

    return {
      branchId: null,
      ...(child?.color ? { color: child.color } : {}),
      ...(child?.label ? { label: child.label } : {}),
      orderIds,
      ...(child?.routeIdx == null ? {} : { routeIdx: child.routeIdx }),
      routePlanId: getRouteGroupChildRoutePlanId(child),
      ...(child?.sortOrder == null ? {} : { sortOrder: child.sortOrder }),
    };
  });

  const targetRoute = targetRoutePlanId
    ? routes.find((route) => route.routePlanId === targetRoutePlanId)
    : routes[0];
  if (!targetRoute) return null;
  targetRoute.orderIds = [
    ...targetRoute.orderIds,
    ...groupOrderIds.filter((orderId) => !draftedOrderIds.has(orderId)),
  ];

  return { mode: "MANUAL_ORDER", routes };
}

function logRouteGroupLifecycle(name, metric = {}) {
  logStructuredMetric(name, metric);
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

export async function copyDeliveryRouteGroup(request, routeGroupId, options = {}) {
  const safeRouteGroupId = encodeURIComponent(routeGroupId ?? "");
  if (!safeRouteGroupId) return missingRouteGroupResult("복사할 route group ID가 없습니다.");

  const mode = textOrUndefined(options.mode)?.toUpperCase();
  if (!ROUTE_GROUP_COPY_MODES.has(mode)) {
    return {
      routeGroup: null,
      errors: [{ message: "복사 방식은 REFERENCE 또는 VIRTUAL이어야 합니다." }],
    };
  }

  const expectedUpdatedAt = textOrUndefined(options.expectedUpdatedAt);
  if (!expectedUpdatedAt) {
    return {
      routeGroup: null,
      errors: [{ message: "Route group revision이 없어 복사를 안전하게 시작할 수 없습니다." }],
    };
  }

  const result = await deliveryApiRequest(request, `/admin/route-groups/${safeRouteGroupId}/copies`, {
    body: JSON.stringify({ expectedUpdatedAt, mode }),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });

  return {
    routeGroup: normalizeRouteGroup(result.data?.routeGroup),
    errors: normalizeRouteGroupCopyErrors(result.errors),
  };
}

function normalizeRouteGroupCopyErrors(errors) {
  return (errors ?? []).map((error) => {
    const code = textOrUndefined(error?.code)?.toUpperCase() ?? "";
    const message = textOrUndefined(error?.message) ?? "Route group을 복사하지 못했습니다.";
    if (code === "CUSTOM_ORDER_REFERENCE_COPY_NOT_ALLOWED") {
      return {
        ...error,
        message: "CUSTOM 주문이 포함된 경로는 실제 주문 참조로 복사할 수 없습니다. 가상 주문으로 독립 복사를 선택해주세요.",
      };
    }
    if (Number(error?.status) === 409) {
      return {
        ...error,
        message: "경로가 변경되었거나 주문이 다른 진행 경로에 잠겨 복사할 수 없습니다. 최신 상태를 확인한 뒤 다시 시도해주세요.",
      };
    }
    return { ...error, message };
  });
}

export async function fetchDeliveryRouteGroups(request, query = {}, options = {}) {
  const result = await deliveryApiRequest(request, `/admin/route-groups${buildQueryString(query)}`, {
    cacheKey: options.cacheKey,
    correlationId: options.correlationId,
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

export async function createDeliveryRouteGroupCustomStop(request, routeGroupId, payload, options = {}) {
  return mutateRouteGroupCustomStop(request, routeGroupId, null, payload, {
    ...options,
    method: "POST",
  });
}

export async function updateDeliveryRouteGroupCustomStop(
  request,
  routeGroupId,
  deliveryStopId,
  payload,
  options = {},
) {
  return mutateRouteGroupCustomStop(request, routeGroupId, deliveryStopId, payload, {
    ...options,
    method: "PATCH",
  });
}

export async function deleteDeliveryRouteGroupCustomStop(
  request,
  routeGroupId,
  deliveryStopId,
  payload,
  options = {},
) {
  return mutateRouteGroupCustomStop(request, routeGroupId, deliveryStopId, payload, {
    ...options,
    method: "DELETE",
  });
}

export async function saveDeliveryRouteGroupDraft(request, routeGroupId, payload, options = {}) {
  return mutateRouteGroup(request, routeGroupId, "/draft", payload, options, "저장할 route group ID가 없습니다.");
}

export async function fetchNextDeliveryRouteGroupRouteIdx(request, routeGroupId, options = {}) {
  const safeRouteGroupId = encodeURIComponent(routeGroupId ?? "");
  if (!safeRouteGroupId) return { nextRouteIdx: null, errors: missingRouteGroupResult("조회할 route group ID가 없습니다.").errors };

  const result = await deliveryApiRequest(request, `/admin/route-groups/${safeRouteGroupId}/next-route-idx`, {
    cacheKey: `next-route-idx:${Date.now()}:${Math.random()}`,
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
  });

  return {
    nextRouteIdx: numberOrNull(
      result.data?.nextRouteIdx
        ?? result.data?.nextRouteIndex
        ?? result.data?.routeIdx,
    ),
    errors: result.errors,
  };
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

  return { draft: { mode: "MANUAL_ORDER", routes }, errors: [] };
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

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

async function mutateRouteGroupCustomStop(request, routeGroupId, deliveryStopId, payload, options) {
  const safeRouteGroupId = encodeURIComponent(routeGroupId ?? "");
  const safeDeliveryStopId = deliveryStopId == null ? null : encodeURIComponent(deliveryStopId);
  if (!safeRouteGroupId || (deliveryStopId != null && !safeDeliveryStopId)) {
    return missingRouteGroupResult("수정할 custom stop의 route group 또는 stop ID가 없습니다.");
  }

  let suffix = safeDeliveryStopId
    ? `/stops/${safeDeliveryStopId}/custom`
    : "/stops/custom";
  const expectedUpdatedAt = textOrUndefined(payload?.expectedUpdatedAt);
  if (options.method === "DELETE" && expectedUpdatedAt) {
    suffix += `?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`;
  }
  const result = await deliveryApiRequest(request, `/admin/route-groups/${safeRouteGroupId}${suffix}`, {
    ...(options.method === "DELETE" ? {} : { body: JSON.stringify(payload ?? {}) }),
    fetch: options.fetch,
    method: options.method,
    sessionToken: options.sessionToken,
  });

  if (result.errors.length === 0) clearDeliveryApiResponseCache();

  return {
    deletedStopId: result.data?.deletedStopId ?? result.data?.deliveryStopId ?? null,
    routeGroup: normalizeRouteGroup(result.data?.routeGroup),
    stop: result.data?.stop ?? result.data?.customStop ?? null,
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
