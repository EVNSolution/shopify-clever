import { createHash } from "node:crypto";

import { buildRouteScopeFromOrders } from "./route-scope.js";

const DEFAULT_DELIVERY_API_URL = "https://clever-delivery.3-39-216-177.sslip.io";
const DEFAULT_CLEVER_APP_ID = "clever";
const DEFAULT_DELIVERY_API_GET_CACHE_TTL_MS = 15_000;
const MAX_DELIVERY_API_GET_CACHE_ENTRIES = 100;
export const DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE = "DELIVERY_SESSION_TOKEN_MISSING";
export const DELIVERY_API_ERROR_CODE = "DELIVERY_API_ERROR";
export const DELIVERY_API_DRIVER_ENDPOINT_NOT_FOUND_ERROR_CODE =
  "DELIVERY_API_DRIVER_ENDPOINT_NOT_FOUND";
export const DELIVERY_ROUTE_PLAN_ID_MISSING_ERROR_CODE = "DELIVERY_ROUTE_PLAN_ID_MISSING";
export { buildRouteScopeFromOrders } from "./route-scope.js";

const deliveryApiGetCache = new Map();
const customFetchCacheIds = new WeakMap();
let nextCustomFetchCacheId = 1;

export function getShopifySessionBearer(request) {
  const authorizationHeader = request.headers.get("authorization");

  if (/^Bearer\s+\S+/i.test(authorizationHeader ?? "")) {
    return authorizationHeader;
  }

  const requestUrl = new URL(request.url);
  const idToken = requestUrl.searchParams.get("id_token")?.trim();

  return idToken ? `Bearer ${idToken}` : null;
}

export function getCleverAppId() {
  const configuredAppId = process.env.CLEVER_APP_ID?.trim();

  return configuredAppId || DEFAULT_CLEVER_APP_ID;
}

export function getDeliveryApiBaseUrl() {
  const configuredBaseUrl = process.env.CLEVER_DELIVERY_API_URL?.trim();
  const baseUrl = configuredBaseUrl || DEFAULT_DELIVERY_API_URL;

  return baseUrl.replace(/\/+$/, "");
}

export function clearDeliveryApiResponseCache() {
  deliveryApiGetCache.clear();
}

export function primeDeliveryApiGetResponseCache(request, path, result, options = {}) {
  const authorization =
    normalizeShopifySessionBearer(options.sessionToken) ??
    getShopifySessionBearer(request);

  if (!authorization || !path || result?.errors?.length > 0) return false;

  const cacheTtlMs = getDeliveryApiGetCacheTtlMs();
  if (cacheTtlMs <= 0) return false;

  const fetchImpl = options.fetch ?? fetch;
  const appId = options.appId ?? getCleverAppId();
  const baseUrl = getDeliveryApiBaseUrl();
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
  routeScope,
}) {
  const routeDraftScope = buildRouteScopeFromOrders(plannedOrders) ?? routeScope;

  return {
    name: "CLEVER route draft",
    planDate: routeDraftScope?.deliveryDate ?? now.toISOString().slice(0, 10),
    ...(routeDraftScope ? { routeScope: routeDraftScope } : {}),
    depot: mapDepartureLocationToDepot(departureLocation),
    orders: plannedOrders.map(mapOrderToDeliveryRoutePlanOrder),
  };
}

export async function createDeliveryRoutePlan(request, payload, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/route-plans", {
    body: JSON.stringify(payload),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });

  return {
    routePlan: result.data?.routePlan ?? null,
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
    routeStopPoints: result.data?.routeStopPoints ?? [],
    stops: result.data?.stops ?? [],
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

  return {
    routePlanId: result.data?.routePlanId ?? result.data?.id ?? normalizedRoutePlanId,
    errors: result.errors,
  };
}

export async function deliveryApiRequest(request, path, options = {}) {
  const authorization =
    normalizeShopifySessionBearer(options.sessionToken) ??
    getShopifySessionBearer(request);

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
  const baseUrl = getDeliveryApiBaseUrl();
  const url = `${baseUrl}${path}`;
  const cacheTtlMs = getDeliveryApiGetCacheTtlMs();
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
      fetchImpl,
      method,
      path,
      url,
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
    fetchImpl,
    method,
    path,
    url,
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
  fetchImpl,
  method,
  path,
  url,
}) {
  const response = await fetchImpl(url, {
    body,
    headers: {
      authorization,
      "x-clever-app-id": appId,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    method,
  });
  const payload = await readJsonResponse(response);

  if (!response.ok || payload?.error) {
    return {
      data: payload?.data ?? null,
      errors: [normalizeDeliveryApiError(payload?.error, response.status, path, url)],
    };
  }

  return {
    data: payload?.data ?? null,
    errors: [],
  };
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
      status,
    };
  }

  if (typeof error === "string") {
    return {
      code: DELIVERY_API_ERROR_CODE,
      message: error,
      status,
    };
  }

  return {
    code: error?.code ?? DELIVERY_API_ERROR_CODE,
    message: error?.message ?? getDeliveryApiFailureMessage(path),
    status,
  };
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
