import { createHash } from "node:crypto";

import { buildRouteScopeFromOrders } from "./route-scope.js";
import { isRouteDispatchConfirmed } from "./route-dispatch.js";
import {
  createTelemetryRequestId,
  logSafeOperationalEvent,
  logStructuredMetric,
  sanitizeRequestPath,
} from "../telemetry/structured-telemetry.server.js";

const DEFAULT_CLEVER_APP_ID = "clever";
const DEFAULT_DELIVERY_API_GET_CACHE_TTL_MS = 15_000;
const MAX_DELIVERY_API_GET_CACHE_ENTRIES = 100;
export const DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE = "DELIVERY_SESSION_TOKEN_MISSING";
export const DELIVERY_API_ERROR_CODE = "DELIVERY_API_ERROR";
export const DELIVERY_API_ENDPOINT_NOT_FOUND_ERROR_CODE =
  "DELIVERY_API_ENDPOINT_NOT_FOUND";
export const DELIVERY_API_DRIVER_ENDPOINT_NOT_FOUND_ERROR_CODE =
  "DELIVERY_API_DRIVER_ENDPOINT_NOT_FOUND";
export const DELIVERY_ROUTE_PLAN_ID_MISSING_ERROR_CODE = "DELIVERY_ROUTE_PLAN_ID_MISSING";
export const DELIVERY_ROUTE_STOP_ID_MISSING_ERROR_CODE = "DELIVERY_ROUTE_STOP_ID_MISSING";
export const DELIVERY_ROUTE_PLAN_REVISION_MISSING_ERROR_CODE = "DELIVERY_ROUTE_PLAN_REVISION_MISSING";
export const DELIVERY_ROUTE_PLAN_REVISION_CONFLICT_ERROR_CODE = "DELIVERY_ROUTE_PLAN_REVISION_CONFLICT";
export const DELIVERY_ROUTE_PLAN_ALREADY_GROUPED_ERROR_CODE = "DELIVERY_ROUTE_PLAN_ALREADY_GROUPED";
export const DELIVERY_ROUTE_PLAN_NOT_EDITABLE_ERROR_CODE = "DELIVERY_ROUTE_PLAN_NOT_EDITABLE";
export const DELIVERY_ROUTE_PLAN_INVALID_ALLOCATION_ERROR_CODE = "DELIVERY_ROUTE_PLAN_INVALID_ALLOCATION";
export const DELIVERY_ROUTE_PLAN_NOT_FOUND_ERROR_CODE = "DELIVERY_ROUTE_PLAN_NOT_FOUND";
export const DELIVERY_ROUTE_PLAN_MUTATION_OUTCOME_UNKNOWN_ERROR_CODE =
  "DELIVERY_ROUTE_PLAN_MUTATION_OUTCOME_UNKNOWN";
export { buildRouteScopeFromOrders } from "./route-scope.js";

const deliveryApiGetCache = new Map();
const customFetchCacheIds = new WeakMap();
let nextCustomFetchCacheId = 1;

function logRoutePlanLifecycle(name, metric = {}) {
  logStructuredMetric(name, metric);
}

export function getShopifySessionBearer(request) {
  return getShopifySessionHeaderBearer(request) ?? getShopifySessionUrlBearer(request);
}

function getShopifySessionHeaderBearer(request) {
  const authorizationHeader = request.headers.get("authorization");

  if (/^Bearer\s+\S+/i.test(authorizationHeader ?? "")) {
    return authorizationHeader;
  }

  return null;
}

function getShopifySessionUrlBearer(request) {
  const requestUrl = new URL(request.url);
  const idToken = requestUrl.searchParams.get("id_token")?.trim();

  return idToken ? `Bearer ${idToken}` : null;
}

export function getCleverAppId() {
  const configuredAppId = process.env.CLEVER_APP_ID?.trim();

  return configuredAppId || DEFAULT_CLEVER_APP_ID;
}

export function getDeliveryApiBaseUrl() {
  const baseUrl = process.env.CLEVER_DELIVERY_API_URL?.trim();

  if (!baseUrl) {
    throw new Error("CLEVER_DELIVERY_API_URL is required.");
  }

  return baseUrl.replace(/\/+$/, "");
}

export function clearDeliveryApiResponseCache() {
  deliveryApiGetCache.clear();
}

export function primeDeliveryApiGetResponseCache(request, path, result, options = {}) {
  const authorization =
    getShopifySessionHeaderBearer(request) ??
    normalizeShopifySessionBearer(options.sessionToken) ??
    getShopifySessionUrlBearer(request);

  if (!authorization || !path || result?.errors?.length > 0) return false;

  const cacheTtlMs = Number.isFinite(options.cacheTtlMs)
    ? Math.max(0, Number(options.cacheTtlMs))
    : getDeliveryApiGetCacheTtlMs();
  if (cacheTtlMs <= 0) return false;

  const fetchImpl = options.fetch ?? fetch;
  const appId = options.appId ?? getCleverAppId();
  let baseUrl;
  try {
    baseUrl = getDeliveryApiBaseUrl();
  } catch {
    return false;
  }
  const cacheScope = getDeliveryApiGetCacheScope({
    appId,
    authorization,
    cacheKey: options.cacheKey,
  });
  const cacheKey = buildDeliveryApiGetCacheKey({
    baseUrl,
    cacheScope,
    fetchImpl,
    path,
  });
  const now = Date.now();

  deliveryApiGetCache.set(cacheKey, {
    expiresAt: now + cacheTtlMs,
    promise: Promise.resolve(cloneDeliveryApiResult(result)),
  });
  pruneDeliveryApiGetCache(now);

  return true;
}

export function buildCreateRoutePlanPayload({
  departureLocation,
  now = new Date(),
  plannedOrders,
  routeName,
  routeScope,
}) {
  const routeDraftScope = buildRouteScopeFromOrders(plannedOrders) ?? routeScope;

  return {
    name: textOrNull(routeName) ?? "CLEVER route draft",
    planDate: routeDraftScope?.deliveryDate ?? now.toISOString().slice(0, 10),
    ...(routeDraftScope ? { routeScope: routeDraftScope } : {}),
    depot: mapDepartureLocationToDepot(departureLocation),
    orders: plannedOrders.map(mapOrderToDeliveryRoutePlanOrder),
  };
}

export function buildCreateRoutePlanBatchPayload({
  departureLocation,
  now = new Date(),
  plannedOrders,
  routeName,
  routeScope,
}) {
  const routeDraftScope = buildRouteScopeFromOrders(plannedOrders) ?? routeScope;

  return {
    name: textOrNull(routeName) ?? "CLEVER route draft",
    planDate: routeDraftScope?.deliveryDate ?? now.toISOString().slice(0, 10),
    depot: mapDepartureLocationToDepot(departureLocation),
    orderIds: plannedOrders.map((order) => order.orderId),
  };
}

export async function createDeliveryRoutePlan(request, payload, options = {}) {
  logRoutePlanLifecycle("delivery.route_plan.create.start", {
    orderCount: Array.isArray(payload?.orders) ? payload.orders.length : 0,
    planDate: payload?.planDate ?? null,
    routeName: payload?.name ?? null,
  });

  const result = await deliveryApiRequest(request, "/admin/route-plans", {
    body: JSON.stringify(payload),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });
  const routePlan = result.data?.routePlan ?? null;

  logRoutePlanLifecycle("delivery.route_plan.create.done", {
    errorCount: result.errors.length,
    routePlanId: routePlan?.id ?? null,
    routeName: routePlan?.name ?? null,
    status: routePlan?.status ?? null,
    stopCount: routePlan?.stopsCount ?? routePlan?.stops?.length ?? null,
  });

  return {
    routePlan,
    errors: result.errors,
  };
}

export async function createDeliveryRoutePlanBatch(request, payload, options = {}) {
  logRoutePlanLifecycle("delivery.route_plan.batch_create.start", {
    orderCount: Array.isArray(payload?.orderIds) ? payload.orderIds.length : 0,
    planDate: payload?.planDate ?? null,
    routeName: payload?.name ?? null,
  });

  const result = await deliveryApiRequest(request, "/admin/route-plans", {
    body: JSON.stringify(payload),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });
  const routePlan = result.data?.routePlan ?? null;

  logRoutePlanLifecycle("delivery.route_plan.batch_create.done", {
    errorCount: result.errors.length,
    routePlanId: routePlan?.id ?? null,
    stopCount: routePlan?.stopsCount ?? null,
  });

  return {
    routePlan,
    errors: result.errors,
  };
}

export async function fetchDeliveryRoutePlans(request, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/route-plans", {
    cacheKey: options.cacheKey,
    fetch: options.fetch,
    method: "GET",
    sessionToken: options.sessionToken,
  });

  return {
    routePlans: result.data?.routePlans ?? [],
    errors: result.errors,
  };
}

export async function fetchDeliveryRoutePlanDetail(request, routePlanId, options = {}) {
  const safeRoutePlanId = encodeURIComponent(routePlanId ?? "");
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}`,
    {
      cacheKey: options.cacheKey,
      fetch: options.fetch,
      method: "GET",
      sessionToken: options.sessionToken,
    },
  );

  return {
    routePlan: result.data?.routePlan ?? null,
    routeGeometry: result.data?.routeGeometry ?? null,
    routeMetrics: result.data?.routeMetrics ?? null,
    routeStopPoints: result.data?.routeStopPoints ?? [],
    stops: result.data?.stops ?? [],
    errors: result.errors,
  };
}

export async function copyDeliveryRoutePlan(request, routePlanId, payload, options = {}) {
  const normalizedRoutePlanId = textOrNull(routePlanId);
  const expectedRoutePlanUpdatedAt = textOrNull(payload?.expectedRoutePlanUpdatedAt);
  const localErrors = validateStandaloneRouteMutationInput({
    expectedRoutePlanUpdatedAt,
    routePlanId: normalizedRoutePlanId,
  });
  if (localErrors.length > 0) {
    return { routePlan: null, errors: localErrors };
  }

  const safeRoutePlanId = encodeURIComponent(normalizedRoutePlanId);
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}/copies`,
    {
      body: JSON.stringify({ expectedRoutePlanUpdatedAt }),
      fetch: options.fetch,
      method: "POST",
      sessionToken: options.sessionToken,
    },
  );
  clearDeliveryApiResponseCache();
  const routePlan = result.data?.routePlan ?? null;
  const errors = normalizeStandaloneRouteMutationErrors(result.errors, "copy");
  if (errors.length > 0) {
    return {
      routePlan: null,
      errors,
      ...(hasUnknownMutationOutcome(errors) ? { outcomeUnknown: true } : {}),
    };
  }
  if (!routePlan?.id) {
    return unknownStandaloneRouteMutationResult("copy", "복사 응답에서 새 Route ID를 확인하지 못했습니다.");
  }

  return { routePlan, errors: [] };
}

export async function splitDeliveryRoutePlan(request, routePlanId, draft, options = {}) {
  const normalizedRoutePlanId = textOrNull(routePlanId);
  const expectedRoutePlanUpdatedAt = textOrNull(options.expectedRoutePlanUpdatedAt);
  const localErrors = validateStandaloneRouteMutationInput({
    expectedRoutePlanUpdatedAt,
    routePlanId: normalizedRoutePlanId,
  });
  if (localErrors.length > 0) {
    return { routeGroup: null, errors: localErrors };
  }

  const payload = buildStandaloneRouteSplitPayload(draft, expectedRoutePlanUpdatedAt);
  const safeRoutePlanId = encodeURIComponent(normalizedRoutePlanId);
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}/route-group`,
    {
      body: JSON.stringify(payload),
      fetch: options.fetch,
      method: "POST",
      sessionToken: options.sessionToken,
    },
  );
  clearDeliveryApiResponseCache();
  const routeGroup = result.data?.routeGroup ?? null;
  const errors = normalizeStandaloneRouteMutationErrors(result.errors, "split");
  if (errors.length > 0) {
    return {
      routeGroup: null,
      errors,
      ...(hasUnknownMutationOutcome(errors) ? { outcomeUnknown: true } : {}),
    };
  }
  if (!routeGroup?.id) {
    return unknownStandaloneRouteMutationResult("split", "저장 응답에서 Route group ID를 확인하지 못했습니다.");
  }

  return { routeGroup, errors: [] };
}

export function buildStandaloneRouteSplitPayload(draft, expectedRoutePlanUpdatedAt) {
  const routes = Array.isArray(draft?.routes) ? draft.routes : [];
  return {
    expectedRoutePlanUpdatedAt,
    mode: "MANUAL_ORDER",
    routes: routes.map(toStandaloneRouteSplitRow),
  };
}

const STANDALONE_ROUTE_SPLIT_ROW_FIELDS = [
  "branchId",
  "color",
  "driverId",
  "expectedChildUpdatedAt",
  "expectedRoutePlanUpdatedAt",
  "label",
  "orderIds",
  "routeIdx",
  "routeKey",
  "routePlanId",
  "scheduledStartAt",
  "scheduledStartTimeZone",
  "sortOrder",
  "tempId",
];

function toStandaloneRouteSplitRow(route) {
  const source = route && typeof route === "object" && !Array.isArray(route) ? route : {};
  return Object.fromEntries(
    STANDALONE_ROUTE_SPLIT_ROW_FIELDS
      .filter((field) => Object.hasOwn(source, field) && source[field] !== undefined)
      .map((field) => [field, source[field]]),
  );
}

function validateStandaloneRouteMutationInput({ expectedRoutePlanUpdatedAt, routePlanId }) {
  if (!routePlanId) {
    return [{
      code: DELIVERY_ROUTE_PLAN_ID_MISSING_ERROR_CODE,
      message: "대상 Route ID가 없어 요청을 보내지 않았습니다.",
      status: null,
    }];
  }
  if (!expectedRoutePlanUpdatedAt) {
    return [{
      code: DELIVERY_ROUTE_PLAN_REVISION_MISSING_ERROR_CODE,
      message: "Route revision이 없어 요청을 보내지 않았습니다. 페이지를 새로고침해주세요.",
      status: null,
    }];
  }
  return [];
}

function normalizeStandaloneRouteMutationErrors(errors, operation) {
  return (errors ?? []).map((error) => {
    const status = Number.isInteger(error?.status) ? error.status : null;
    const serverCode = textOrNull(error?.code);
    const searchable = `${serverCode ?? ""} ${error?.message ?? ""}`.toLowerCase();
    let code = serverCode ?? DELIVERY_API_ERROR_CODE;
    let message = error?.message ?? getDeliveryApiFailureMessage(error?.path);

    if (status === 0 || (status !== null && status >= 500)) {
      code = DELIVERY_ROUTE_PLAN_MUTATION_OUTCOME_UNKNOWN_ERROR_CODE;
      message = operation === "copy"
        ? "네트워크 응답을 확인하지 못해 Route 복사 결과가 불명확합니다. 같은 요청을 다시 보내지 말고 Routes 목록에서 결과를 확인해주세요."
        : "네트워크 응답을 확인하지 못해 split 저장 결과가 불명확합니다. 같은 Save를 다시 보내지 말고 Routes 목록에서 결과를 확인해주세요.";
    } else if (status === 404) {
      code = DELIVERY_ROUTE_PLAN_NOT_FOUND_ERROR_CODE;
      message = "현재 shop에서 대상 Route를 찾지 못했습니다. 페이지를 새로고침해주세요.";
    } else if (status === 409 && /already[^a-z0-9]+group|already belongs to a group|grouped|standalone|current child/u.test(searchable)) {
      code = DELIVERY_ROUTE_PLAN_ALREADY_GROUPED_ERROR_CODE;
      message = "이 Route는 이미 group에 속해 있습니다. 페이지를 새로고침해주세요.";
    } else if (status === 409) {
      code = DELIVERY_ROUTE_PLAN_REVISION_CONFLICT_ERROR_CODE;
      message = "Route가 다른 작업에서 변경되었습니다. 현재 초안은 유지되며, 최신 상태를 확인해주세요.";
    } else if (status === 400 && /started|completed|in[_ -]?progress|not ready|only ready|must (?:still )?be ready|ready standalone|status/u.test(searchable)) {
      code = DELIVERY_ROUTE_PLAN_NOT_EDITABLE_ERROR_CODE;
      message = "시작되었거나 완료된 Route는 복사하거나 분할 저장할 수 없습니다.";
    } else if (status === 400) {
      code = DELIVERY_ROUTE_PLAN_INVALID_ALLOCATION_ERROR_CODE;
      message = "Route 주문 배분 또는 입력값이 올바르지 않아 저장하지 못했습니다. 현재 초안은 유지됩니다.";
    }

    return {
      ...error,
      code,
      message,
      ...(serverCode && serverCode !== code ? { serverCode } : {}),
      status,
    };
  });
}

function hasUnknownMutationOutcome(errors) {
  return errors.some((error) => error.code === DELIVERY_ROUTE_PLAN_MUTATION_OUTCOME_UNKNOWN_ERROR_CODE);
}

function unknownStandaloneRouteMutationResult(operation, detail) {
  return {
    ...(operation === "copy" ? { routePlan: null } : { routeGroup: null }),
    errors: [{
      code: DELIVERY_ROUTE_PLAN_MUTATION_OUTCOME_UNKNOWN_ERROR_CODE,
      message: `${detail} 같은 요청을 다시 보내지 말고 Routes 목록에서 결과를 확인해주세요.`,
      status: null,
    }],
    outcomeUnknown: true,
  };
}

export async function refreshDeliveryRoutePlanOrderData(request, routePlanId, options = {}) {
  const safeRoutePlanId = encodeURIComponent(routePlanId ?? "");
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}/refresh-order-data`,
    {
      fetch: options.fetch,
      method: "POST",
      sessionToken: options.sessionToken,
    },
  );
  clearDeliveryApiResponseCache();

  return {
    routePlan: result.data?.routePlan ?? null,
    routeGeometry: result.data?.routeGeometry ?? null,
    routeMetrics: result.data?.routeMetrics ?? null,
    routeStopPoints: result.data?.routeStopPoints ?? [],
    stops: result.data?.stops ?? [],
    errors: result.errors,
  };
}

export async function updateDeliveryRoutePlanStops(request, routePlanId, payload, options = {}) {
  const normalizedRoutePlanId = textOrNull(routePlanId);

  if (!normalizedRoutePlanId) {
    return {
      routePlan: null,
      routeStopPoints: [],
      stops: [],
      errors: [
        {
          code: DELIVERY_ROUTE_PLAN_ID_MISSING_ERROR_CODE,
          message: "수정할 route plan ID가 없어 route stop을 저장하지 못했습니다.",
        },
      ],
    };
  }

  const safeRoutePlanId = encodeURIComponent(normalizedRoutePlanId);
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}/stops`,
    {
      body: JSON.stringify({
        stops: Array.isArray(payload?.stops) ? payload.stops : [],
      }),
      fetch: options.fetch,
      method: "PATCH",
      sessionToken: options.sessionToken,
    },
  );

  return {
    routePlan: result.data?.routePlan ?? null,
    routeGeometry: result.data?.routeGeometry ?? null,
    routeMetrics: result.data?.routeMetrics ?? null,
    routeStopPoints: result.data?.routeStopPoints ?? [],
    stops: result.data?.stops ?? [],
    errors: result.errors,
  };
}

export async function transitionDeliveryRoutePlanStop(request, routePlanId, deliveryStopId, payload, options = {}) {
  const normalizedRoutePlanId = textOrNull(routePlanId);
  const normalizedDeliveryStopId = textOrNull(deliveryStopId);

  if (!normalizedRoutePlanId) {
    return {
      routePlan: null,
      stop: null,
      errors: [
        {
          code: DELIVERY_ROUTE_PLAN_ID_MISSING_ERROR_CODE,
          message: "수정할 route plan ID가 없어 route stop 상태를 저장하지 못했습니다.",
        },
      ],
    };
  }
  if (!normalizedDeliveryStopId) {
    return {
      routePlan: null,
      stop: null,
      errors: [
        {
          code: DELIVERY_ROUTE_STOP_ID_MISSING_ERROR_CODE,
          message: "수정할 delivery stop ID가 없어 route stop 상태를 저장하지 못했습니다.",
        },
      ],
    };
  }

  const safeRoutePlanId = encodeURIComponent(normalizedRoutePlanId);
  const safeDeliveryStopId = encodeURIComponent(normalizedDeliveryStopId);
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}/stops/${safeDeliveryStopId}/transition`,
    {
      body: JSON.stringify({
        status: textOrNull(payload?.status),
        idempotencyKey: textOrNull(payload?.idempotencyKey),
      }),
      fetch: options.fetch,
      method: "POST",
      sessionToken: options.sessionToken,
    },
  );

  return {
    routePlan: result.data?.routePlan ?? null,
    stop: result.data?.stop ?? result.data?.deliveryStop ?? null,
    errors: result.errors,
  };
}

export async function updateDeliveryRoutePlanStop(request, routePlanId, deliveryStopId, payload, options = {}) {
  const normalizedRoutePlanId = textOrNull(routePlanId);
  const normalizedDeliveryStopId = textOrNull(deliveryStopId);

  if (!normalizedRoutePlanId) {
    return {
      routePlan: null,
      stop: null,
      errors: [
        {
          code: DELIVERY_ROUTE_PLAN_ID_MISSING_ERROR_CODE,
          message: "수정할 route plan ID가 없어 route stop을 저장하지 못했습니다.",
        },
      ],
    };
  }
  if (!normalizedDeliveryStopId) {
    return {
      routePlan: null,
      stop: null,
      errors: [
        {
          code: DELIVERY_ROUTE_STOP_ID_MISSING_ERROR_CODE,
          message: "수정할 delivery stop ID가 없어 route stop을 저장하지 못했습니다.",
        },
      ],
    };
  }

  const safeRoutePlanId = encodeURIComponent(normalizedRoutePlanId);
  const safeDeliveryStopId = encodeURIComponent(normalizedDeliveryStopId);
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}/stops/${safeDeliveryStopId}/override`,
    {
      body: JSON.stringify(payload ?? {}),
      fetch: options.fetch,
      method: "PATCH",
      sessionToken: options.sessionToken,
    },
  );

  return {
    routePlan: result.data?.routePlan ?? null,
    stop: result.data?.stop ?? result.data?.deliveryStop ?? null,
    errors: result.errors,
  };
}

export async function updateDeliveryRoutePlanDepartureTime(request, routePlanId, payload, options = {}) {
  const normalizedRoutePlanId = textOrNull(routePlanId);

  if (!normalizedRoutePlanId) {
    return {
      routePlan: null,
      errors: [
        {
          code: DELIVERY_ROUTE_PLAN_ID_MISSING_ERROR_CODE,
          message: "수정할 route plan ID가 없어 출발 시간을 저장하지 못했습니다.",
        },
      ],
    };
  }

  const safeRoutePlanId = encodeURIComponent(normalizedRoutePlanId);
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}/departure-time`,
    {
      body: JSON.stringify({ departureTime: textOrNull(payload?.departureTime) }),
      fetch: options.fetch,
      method: "PATCH",
      sessionToken: options.sessionToken,
    },
  );

  return {
    routePlan: result.data?.routePlan ?? null,
    routeGeometry: result.data?.routeGeometry ?? null,
    routeMetrics: result.data?.routeMetrics ?? null,
    routeStopPoints: result.data?.routeStopPoints ?? [],
    stops: result.data?.stops ?? [],
    errors: result.errors,
  };
}

export async function updateDeliveryRoutePlanScheduledStart(request, routePlanId, payload, options = {}) {
  const normalizedRoutePlanId = textOrNull(routePlanId);

  if (!normalizedRoutePlanId) {
    return {
      routePlan: null,
      errors: [
        {
          code: DELIVERY_ROUTE_PLAN_ID_MISSING_ERROR_CODE,
          message: "수정할 route plan ID가 없어 출발 일시를 저장하지 못했습니다.",
        },
      ],
    };
  }

  const safeRoutePlanId = encodeURIComponent(normalizedRoutePlanId);
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}/start-time`,
    {
      body: JSON.stringify({ scheduledStartAt: textOrNull(payload?.scheduledStartAt) }),
      fetch: options.fetch,
      method: "PATCH",
      sessionToken: options.sessionToken,
    },
  );

  return {
    routePlan: result.data?.routePlan ?? null,
    routeGeometry: result.data?.routeGeometry ?? null,
    routeMetrics: result.data?.routeMetrics ?? null,
    routeStopPoints: result.data?.routeStopPoints ?? [],
    stops: result.data?.stops ?? [],
    errors: result.errors,
  };
}

export async function assignDeliveryRoutePlanDriver(request, routePlanId, payload, options = {}) {
  const normalizedRoutePlanId = textOrNull(routePlanId);

  if (!normalizedRoutePlanId) {
    return {
      routePlan: null,
      routeGeometry: null,
      routeStopPoints: [],
      stops: [],
      errors: [
        {
          code: DELIVERY_ROUTE_PLAN_ID_MISSING_ERROR_CODE,
          message: "수정할 route plan ID가 없어 배송원을 저장하지 못했습니다.",
        },
      ],
    };
  }

  const safeRoutePlanId = encodeURIComponent(normalizedRoutePlanId);
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}/driver`,
    {
      body: JSON.stringify({
        driverId: textOrNull(payload?.driverId),
      }),
      fetch: options.fetch,
      method: "PATCH",
      sessionToken: options.sessionToken,
    },
  );

  return {
    routePlan: result.data?.routePlan ?? null,
    routeGeometry: result.data?.routeGeometry ?? null,
    routeMetrics: result.data?.routeMetrics ?? null,
    routeStopPoints: result.data?.routeStopPoints ?? [],
    stops: result.data?.stops ?? [],
    errors: result.errors,
  };
}

export async function publishDeliveryRoutePlan(request, routePlanId, options = {}) {
  const normalizedRoutePlanId = textOrNull(routePlanId);
  if (!normalizedRoutePlanId) {
    return {
      dispatch: null,
      errors: [{
        code: DELIVERY_ROUTE_PLAN_ID_MISSING_ERROR_CODE,
        message: "Dispatch할 route plan ID가 없습니다.",
      }],
    };
  }

  const safeRoutePlanId = encodeURIComponent(normalizedRoutePlanId);
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}/publish`,
    {
      fetch: options.fetch,
      method: "POST",
      sessionToken: options.sessionToken,
    },
  );
  const outcomeUnknown = result.errors.some((error) => error.status === 0 || error.status >= 500)
    || (result.errors.length === 0 && !isRouteDispatchConfirmed(result.data, normalizedRoutePlanId));
  if (result.errors.length === 0 || outcomeUnknown) clearDeliveryApiResponseCache();
  if (outcomeUnknown) {
    return {
      dispatch: null,
      outcomeUnknown: true,
      errors: [{
        code: "DELIVERY_ROUTE_DISPATCH_OUTCOME_UNKNOWN",
        message: "Dispatch 응답을 확인하지 못했습니다. 경로 발행이나 기사 알림이 이미 처리되었을 수 있으니, 다시 누르기 전에 경로 상태와 기사 앱을 확인해주세요.",
      }],
    };
  }
  return {
    routePlan: result.errors.length === 0 ? result.data?.routePlan : null,
    dispatch: result.errors.length === 0 ? result.data?.dispatch : null,
    errors: result.errors,
  };
}

export async function deleteDeliveryRoutePlan(request, routePlanId, options = {}) {
  const normalizedRoutePlanId = textOrNull(routePlanId);

  if (!normalizedRoutePlanId) {
    return {
      routePlanId: null,
      errors: [
        {
          code: DELIVERY_ROUTE_PLAN_ID_MISSING_ERROR_CODE,
          message: "삭제할 route plan ID가 없어 route를 삭제하지 못했습니다.",
        },
      ],
    };
  }

  logRoutePlanLifecycle("delivery.route_plan.delete.start", {
    routePlanId: normalizedRoutePlanId,
  });

  const safeRoutePlanId = encodeURIComponent(normalizedRoutePlanId);
  const result = await deliveryApiRequest(
    request,
    `/admin/route-plans/${safeRoutePlanId}`,
    {
      fetch: options.fetch,
      method: "DELETE",
      sessionToken: options.sessionToken,
    },
  );
  const deletedRoutePlanId = result.data?.routePlanId ?? result.data?.id ?? normalizedRoutePlanId;

  logRoutePlanLifecycle("delivery.route_plan.delete.done", {
    deletedRoutePlanId,
    errorCount: result.errors.length,
    requestedRoutePlanId: normalizedRoutePlanId,
  });

  return {
    routePlanId: deletedRoutePlanId,
    errors: result.errors,
  };
}

export async function deliveryApiRequest(request, path, options = {}) {
  const authorization =
    getShopifySessionHeaderBearer(request) ??
    normalizeShopifySessionBearer(options.sessionToken) ??
    getShopifySessionUrlBearer(request);

  if (!authorization) {
    return {
      data: null,
      errors: [
        {
          code: DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE,
          message: "Shopify session token이 없어 delivery server를 호출하지 못했습니다.",
        },
      ],
    };
  }

  const fetchImpl = options.fetch ?? fetch;
  const method = (options.method ?? "GET").toUpperCase();
  const appId = options.appId ?? getCleverAppId();
  const correlationId = normalizeClientRequestId(options.correlationId) ?? createTelemetryRequestId();
  let baseUrl;
  try {
    baseUrl = getDeliveryApiBaseUrl();
  } catch (error) {
    return {
      data: null,
      errors: [
        {
          code: DELIVERY_API_ERROR_CODE,
          message: error?.message ?? "CLEVER_DELIVERY_API_URL is required.",
          path,
          status: 0,
        },
      ],
    };
  }
  const url = `${baseUrl}${path}`;
  const cacheTtlMs = Number.isFinite(options.cacheTtlMs)
    ? Math.max(0, Number(options.cacheTtlMs))
    : getDeliveryApiGetCacheTtlMs();
  const canUseCache = method === "GET" && !options.body && cacheTtlMs > 0;

  if (canUseCache) {
    const cacheScope = getDeliveryApiGetCacheScope({
      appId,
      authorization,
      cacheKey: options.cacheKey,
    });
    const cacheKey = buildDeliveryApiGetCacheKey({
      baseUrl,
      cacheScope,
      fetchImpl,
      path,
    });
    const now = Date.now();
    const cachedResult = readDeliveryApiGetCache(cacheKey, now);

    if (cachedResult) {
      return cachedResult;
    }

    const resultPromise = executeDeliveryApiRequest({
      appId,
      authorization,
      body: options.body,
      correlationId,
      fetchImpl,
      method,
      path,
      requestHeaders: options.headers,
      url,
      suppressErrorStatuses: options.suppressErrorStatuses,
    });
    const cacheEntry = {
      expiresAt: now + cacheTtlMs,
      promise: resultPromise.then(
        (result) => {
          if (result.errors.length > 0) {
            deliveryApiGetCache.delete(cacheKey);
          }

          return result;
        },
        (error) => {
          deliveryApiGetCache.delete(cacheKey);
          throw error;
        },
      ),
    };
    deliveryApiGetCache.set(cacheKey, cacheEntry);
    pruneDeliveryApiGetCache(now);

    return cloneDeliveryApiResult(await cacheEntry.promise);
  }

  const result = await executeDeliveryApiRequest({
    appId,
    authorization,
    body: options.body,
    correlationId,
    fetchImpl,
    method,
    path,
    requestHeaders: options.headers,
    url,
    suppressErrorStatuses: options.suppressErrorStatuses,
  });

  if (method !== "GET" && result.errors.length === 0) {
    clearDeliveryApiResponseCache();
  }

  return result;
}

async function executeDeliveryApiRequest({
  appId,
  authorization,
  body,
  correlationId,
  fetchImpl,
  method,
  path,
  requestHeaders,
  url,
  suppressErrorStatuses,
}) {
  const startedAt = Date.now();
  let response;
  const shouldSetJsonContentType = body && !isFormDataBody(body) && !hasContentTypeHeader(requestHeaders);

  try {
    response = await fetchImpl(url, {
      body,
      headers: {
        authorization,
        "x-clever-app-id": appId,
        "x-clever-client-request-id": correlationId,
        ...(shouldSetJsonContentType ? { "content-type": "application/json" } : {}),
        ...requestHeaders,
      },
      method,
    });
  } catch (error) {
    const normalizedError = normalizeDeliveryApiNetworkError(error, path);
    logDeliveryApiFailure({ appId, correlationId, error: normalizedError, method, path, status: 0 });
    logDeliveryApiTiming({
      appId,
      correlationId,
      durationMs: Date.now() - startedAt,
      errorCount: 1,
      method,
      path,
      status: 0,
    });

    return {
      data: null,
      errors: [normalizedError],
    };
  }

  const payload = await readJsonResponse(response);

  if (response.status === 401) {
    const normalizedError = normalizeDeliveryApiError(payload?.error, response.status, path, url);
    logDeliveryApiFailure({
      appId,
      correlationId,
      error: normalizedError,
      method,
      path,
      status: response.status,
    });
    logDeliveryApiTiming({
      appId,
      correlationId,
      durationMs: Date.now() - startedAt,
      errorCount: 1,
      method,
      path,
      status: response.status,
    });

    throw new Response("Shopify session expired", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "X-Shopify-Retry-Invalid-Session-Request": "1",
      },
      status: 401,
      statusText: "Unauthorized",
    });
  }

  if (!response.ok || payload?.error) {
    const normalizedError = normalizeDeliveryApiError(payload?.error, response.status, path, url);
    if (!shouldSuppressDeliveryApiError(response.status, suppressErrorStatuses)) {
      logDeliveryApiFailure({
        appId,
        correlationId,
        error: normalizedError,
        method,
        path,
        status: response.status,
      });
    }
    logDeliveryApiTiming({
      appId,
      correlationId,
      durationMs: Date.now() - startedAt,
      errorCount: 1,
      method,
      path,
      status: response.status,
    });

    return {
      data: payload?.data ?? null,
      errors: [normalizedError],
    };
  }

  logDeliveryApiTiming({
    appId,
    correlationId,
    durationMs: Date.now() - startedAt,
    errorCount: 0,
    method,
    path,
    status: response.status,
  });

  return {
    data: payload?.data ?? null,
    errors: [],
  };
}

function isFormDataBody(body) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function hasContentTypeHeader(headers) {
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has("content-type");

  return Object.keys(headers).some((header) => header.toLowerCase() === "content-type");
}

function normalizeDeliveryApiNetworkError(error, path) {
  const reason = error?.message ? ` (${error.message})` : "";

  return {
    code: DELIVERY_API_ERROR_CODE,
    message: `${getDeliveryApiFailureMessage(path)}${reason}`,
    path,
    status: 0,
  };
}

function shouldSuppressDeliveryApiError(status, suppressErrorStatuses) {
  return Array.isArray(suppressErrorStatuses) && suppressErrorStatuses.includes(status);
}

function logDeliveryApiFailure({ correlationId, error, status }) {
  logSafeOperationalEvent("warn", "delivery_api_request_failed", {
    correlationId,
    errorCode: stableDeliveryApiErrorCode(error?.code),
    httpStatus: Number.isInteger(status) && status > 0 ? status : undefined,
    stage: "delivery_api_request",
  });
}

function stableDeliveryApiErrorCode(value) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,119}$/u.test(value)
    ? value
    : DELIVERY_API_ERROR_CODE;
}

function logDeliveryApiTiming({ appId, correlationId, durationMs, errorCount, method, path, status }) {
  logStructuredMetric("delivery_api_request", {
    category: "delivery-api",
    count: 1,
    correlationId,
    durationMs,
    errorCount,
    httpStatus: status,
    path: sanitizeRequestPath(path),
    status: method,
    topic: appId,
  });
}

function normalizeClientRequestId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,120}$/u.test(normalized)) return null;
  return normalized;
}

function readDeliveryApiGetCache(cacheKey, now) {
  const cached = deliveryApiGetCache.get(cacheKey);

  if (!cached) return null;
  if (cached.expiresAt <= now) {
    deliveryApiGetCache.delete(cacheKey);
    return null;
  }

  return cached.promise.then(cloneDeliveryApiResult);
}

function pruneDeliveryApiGetCache(now) {
  for (const [cacheKey, cached] of deliveryApiGetCache) {
    if (
      cached.expiresAt <= now ||
      deliveryApiGetCache.size > MAX_DELIVERY_API_GET_CACHE_ENTRIES
    ) {
      deliveryApiGetCache.delete(cacheKey);
    }
  }
}

function buildDeliveryApiGetCacheKey({ baseUrl, cacheScope, fetchImpl, path }) {
  return [
    "GET",
    baseUrl,
    path,
    getFetchCacheIdentity(fetchImpl),
    cacheScope,
  ].join("\n");
}

function getDeliveryApiGetCacheScope({ appId, authorization, cacheKey }) {
  const explicitCacheKey = textOrNull(cacheKey);
  if (explicitCacheKey) {
    return `app:${appId}:cache-key:${hashCacheScope(explicitCacheKey)}`;
  }

  return `app:${appId}:authorization:${hashCacheScope(authorization)}`;
}

function hashCacheScope(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function getFetchCacheIdentity(fetchImpl) {
  if (fetchImpl === fetch) return "global";

  let cacheId = customFetchCacheIds.get(fetchImpl);
  if (!cacheId) {
    cacheId = `custom:${nextCustomFetchCacheId}`;
    nextCustomFetchCacheId += 1;
    customFetchCacheIds.set(fetchImpl, cacheId);
  }

  return cacheId;
}

function getDeliveryApiGetCacheTtlMs() {
  const configuredTtl = Number(process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS);

  if (process.env.CLEVER_DELIVERY_API_GET_CACHE_TTL_MS != null) {
    return Number.isFinite(configuredTtl) && configuredTtl >= 0
      ? configuredTtl
      : DEFAULT_DELIVERY_API_GET_CACHE_TTL_MS;
  }

  return DEFAULT_DELIVERY_API_GET_CACHE_TTL_MS;
}

function cloneDeliveryApiResult(result) {
  if (typeof structuredClone === "function") {
    return structuredClone(result);
  }

  return JSON.parse(JSON.stringify(result));
}

function getDeliveryApiFailureMessage(path) {
  if (path.startsWith("/admin/route-plans")) {
    return "Delivery route plan API 호출에 실패했습니다.";
  }

  if (path.startsWith("/admin/orders")) {
    return "Delivery orders API 호출에 실패했습니다.";
  }

  if (path.startsWith("/admin/drivers")) {
    return "Delivery drivers API 호출에 실패했습니다.";
  }

  return "Delivery Admin API 호출에 실패했습니다.";
}

function normalizeShopifySessionBearer(sessionToken) {
  if (typeof sessionToken !== "string") return null;

  const trimmedSessionToken = sessionToken.trim();
  if (!trimmedSessionToken) return null;

  return /^Bearer\s+\S+/i.test(trimmedSessionToken)
    ? trimmedSessionToken
    : `Bearer ${trimmedSessionToken}`;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeDeliveryApiError(error, status, path, url) {
  if (isMissingRouteDriverEndpointError(error, status, path)) {
    return {
      code: DELIVERY_API_DRIVER_ENDPOINT_NOT_FOUND_ERROR_CODE,
      message:
        `배송원 저장 API를 찾지 못했습니다. 현재 Shopify app dev가 ${url} 를 호출 중입니다. ` +
        "delivery-api를 최신 커밋으로 재시작하거나 CLEVER_DELIVERY_API_URL을 최신 delivery server로 지정해주세요.",
      path,
      status,
    };
  }

  if (isMissingDeliveryApiEndpointError(error, status)) {
    return {
      code: DELIVERY_API_ENDPOINT_NOT_FOUND_ERROR_CODE,
      message: "Delivery API endpoint를 찾지 못했습니다.",
      path,
      status,
    };
  }

  if (typeof error === "string") {
    return {
      code: DELIVERY_API_ERROR_CODE,
      message: error,
      path,
      status,
    };
  }

  return {
    code: error?.code ?? DELIVERY_API_ERROR_CODE,
    message: error?.message ?? getDeliveryApiFailureMessage(path),
    path,
    status,
  };
}

function isMissingDeliveryApiEndpointError(error, status) {
  if (status !== 404) return false;
  const errorMessage = typeof error === "string" ? error : error?.message;
  return errorMessage === undefined || errorMessage === "Not Found" || /^Route [A-Z]+:/u.test(errorMessage);
}

function isMissingRouteDriverEndpointError(error, status, path) {
  if (status !== 404) return false;
  if (!/^\/admin\/route-plans\/[^/]+\/driver$/u.test(path)) return false;

  const errorMessage = typeof error === "string" ? error : error?.message;
  return errorMessage === "Not Found" || /^Route [A-Z]+:[^ ]+ not found$/u.test(errorMessage ?? "");
}

function mapDepartureLocationToDepot(departureLocation) {
  const coordinates = Array.isArray(departureLocation?.coordinates)
    ? departureLocation.coordinates
    : [];

  return {
    address: textOrNull(departureLocation?.address),
    latitude: departureLocation?.hasCoordinates ? numberOrNull(coordinates[1]) : null,
    longitude: departureLocation?.hasCoordinates ? numberOrNull(coordinates[0]) : null,
  };
}

function mapOrderToDeliveryRoutePlanOrder(order) {
  const coordinates = Array.isArray(order.coordinates) ? order.coordinates : [];
  const deliveryArea = textOrNull(order.deliveryArea);
  const deliveryDay = textOrNull(order.deliveryDay);
  const deliveryDate = textOrNull(order.deliveryDate);
  const deliverySession = textOrNull(order.deliverySession);
  const serviceType = textOrNull(order.serviceType);
  const timeWindowStart = textOrNull(order.timeWindowStart);
  const timeWindowEnd = textOrNull(order.timeWindowEnd);
  const routeScopeKey = textOrNull(order.routeScopeKey);
  const planningGroupKey = textOrNull(order.planningGroupKey);

  return {
    shopifyOrderGid: order.id,
    name: order.name,
    email: textOrNull(order.email),
    phone: textOrNull(order.phone),
    financialStatus: textOrNull(order.paymentStatus),
    fulfillmentStatus: textOrNull(order.status),
    processedAt: textOrNull(order.processedAt),
    totalPriceAmount: textOrNull(order.totalPriceAmount),
    currencyCode: textOrNull(order.currencyCode),
    recipientName: textOrNull(order.customer),
    shippingAddress: normalizeShippingAddress(order.shippingAddress),
    latitude: order.hasCoordinates ? numberOrNull(coordinates[1]) : null,
    longitude: order.hasCoordinates ? numberOrNull(coordinates[0]) : null,
    deliveryArea,
    deliveryDay,
    deliveryDate,
    deliverySession,
    serviceType,
    timeWindowStart,
    timeWindowEnd,
    routeScopeKey,
    planningGroupKey,
    attributes: Array.isArray(order.attributeList) ? order.attributeList : [],
    rawPayload: {
      ...objectOrEmpty(order.rawPayload),
      deliveryArea,
      deliveryDay,
      deliveryDate,
      deliverySession,
      serviceType,
      timeWindowStart,
      timeWindowEnd,
      routeScopeKey,
      planningGroupKey,
    },
  };
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeShippingAddress(address = {}) {
  return {
    address1: textOrNull(address.address1),
    address2: textOrNull(address.address2),
    city: textOrNull(address.city),
    province: textOrNull(address.province),
    postalCode: textOrNull(address.postalCode),
    countryCode: textOrNull(address.countryCode),
  };
}

function textOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function numberOrNull(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
