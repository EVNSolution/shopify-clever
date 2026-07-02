import { bulkUpdateDeliveryOrders, fetchDeliveryOrders, syncDeliveryOrders } from "../delivery/orders.server";
import { createDeliveryInventory, deleteDeliveryInventory, fetchDeliveryInventories } from "../delivery/inventories.server";
import {
  buildCreateRoutePlanPayload,
  DELIVERY_API_ERROR_CODE,
  DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE,
} from "../delivery/route-plans.server";
import {
  createDeliveryRouteGroup,
  fetchDeliveryRouteGroups,
  generateDeliveryRouteGroupChildRoutes,
  saveDeliveryRouteGroupDraft,
  updateDeliveryRouteGroupOrders,
} from "../delivery/route-groups.server";
import { getRouteGroupChildRoutePlanId, getVisibleRouteGroupChildren } from "../delivery/route-helpers";
import { fetchShopifyDepartureLocation } from "../locations/shopify-locations.server";
import {
  getOrderSyncSnapshots,
  mapCanonicalOrdersToOrderRows,
  mergeShopifyOrderRowsWithCanonicalRows,
} from "./canonical-orders";
import { collectServiceErrors, normalizeCaughtServiceError } from "../service-errors";
import { fetchShopifyOrders } from "./shopify-orders.server";
import { authenticate } from "../../shopify.server";
import {
  DEFAULT_ROUTE_PLAN_TITLE,
  getSafePerformanceNow,
  roundPerfDuration,
  textOrUndefined,
} from "./orders-page.shared";

const PERF_CAPTURE_ENABLED = import.meta.env.DEV;
const INVALID_SHOPIFY_SESSION_TOKEN_MESSAGE = "Invalid Shopify session token";
const SHOP_TIME_ZONE_QUERY = `#graphql
  query CleverShopTimeZone {
    shop {
      ianaTimezone
      timezoneAbbreviation
    }
  }
`;
const DEFAULT_SHOP_TIME_ZONE_CACHE_TTL_MS = 30_000;
const shopTimeZoneCache = new Map();

function logDevPerformanceMetric(name, metric) {
  if (!PERF_CAPTURE_ENABLED) return;

  console.info(name, {
    measuredAt: new Date().toISOString(),
    ...metric,
  });
}

function buildCreateRouteGroupPayload({ depot, plannedOrders, routeName, routeScope }) {
  const deliveryDates = plannedOrders
    .map((order) => textOrUndefined(order.deliveryDate))
    .filter(Boolean)
    .sort();
  const dateRangeStart = deliveryDates[0] ?? routeScope?.deliveryDate;
  const dateRangeEnd = deliveryDates.at(-1) ?? dateRangeStart;

  return {
    ...(dateRangeStart ? { dateRangeStart } : {}),
    ...(dateRangeEnd ? { dateRangeEnd } : {}),
    ...(dateRangeStart ? { planDate: dateRangeStart } : {}),
    ...(depot ? { depot } : {}),
    name: textOrUndefined(routeName) ?? DEFAULT_ROUTE_PLAN_TITLE,
    orderIds: plannedOrders.map((order) => order.orderId),
  };
}

function getFirstRouteGroupRoutePlan(routeGroup) {
  const firstChild = routeGroup?.children?.find(getRouteGroupChildRoutePlanId);
  if (!firstChild) return null;
  return firstChild.routePlan ?? { id: getRouteGroupChildRoutePlanId(firstChild) };
}

function buildFirstRouteDraftPayload(routeGroup, addedOrderIds = []) {
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

  routes[0].orderIds = [
    ...routes[0].orderIds,
    ...groupOrderIds.filter((orderId) => !draftedOrderIds.has(orderId)),
  ];

  return { routes };
}

async function fetchShopifyShopTimeZone(admin, options = {}) {
  const cacheKey = textOrUndefined(options.cacheKey);
  if (!cacheKey) return loadShopifyShopTimeZone(admin);

  const now = Date.now();
  const cached = shopTimeZoneCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise.then(cloneShopTimeZoneResult);
  }

  const cacheEntry = {
    expiresAt: now + DEFAULT_SHOP_TIME_ZONE_CACHE_TTL_MS,
    promise: loadShopifyShopTimeZone(admin).then((result) => {
      if (!result.ianaTimezone && !result.timezoneAbbreviation) {
        shopTimeZoneCache.delete(cacheKey);
      }

      return result;
    }),
  };
  shopTimeZoneCache.set(cacheKey, cacheEntry);

  return cloneShopTimeZoneResult(await cacheEntry.promise);
}

async function loadShopifyShopTimeZone(admin) {
  try {
    const response = await admin.graphql(SHOP_TIME_ZONE_QUERY);
    const payload = await response.json();
    const shop = payload?.data?.shop;

    return {
      ianaTimezone: textOrUndefined(shop?.ianaTimezone),
      timezoneAbbreviation: textOrUndefined(shop?.timezoneAbbreviation),
    };
  } catch {
    return {
      ianaTimezone: undefined,
      timezoneAbbreviation: undefined,
    };
  }
}

function cloneShopTimeZoneResult(result) {
  return { ...result };
}

function getLocalDateForTimeZone(date, timeZone) {
  if (!timeZone) return undefined;

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    }).formatToParts(date);
    const partMap = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );

    if (!partMap.year || !partMap.month || !partMap.day) return undefined;

    return `${partMap.year}-${partMap.month}-${partMap.day}`;
  } catch {
    return undefined;
  }
}

function getShopLocalDate(shopTimeZoneData, date = new Date()) {
  return (
    getLocalDateForTimeZone(date, shopTimeZoneData?.ianaTimezone) ??
    getLocalDateForTimeZone(date, "UTC") ??
    date.toISOString().slice(0, 10)
  );
}

export const action = async ({ request }) => {
  try {
    return await handleOrdersAction(request);
  } catch (error) {
    if (error instanceof Response) throw error;

    console.error("orders_action_failed", {
      message: error?.message,
      stack: error?.stack,
    });

    return {
      errors: normalizeCaughtServiceError(error, "Orders action failed."),
    };
  }
};

function parseInventoryIds(value) {
  try {
    const inventoryIds = JSON.parse(value ?? "[]");
    return Array.isArray(inventoryIds) ? inventoryIds.filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function handleOrdersAction(request) {
  const { admin, session } = await authenticate.admin(request);
  const shopifyShopCacheKey = session?.shop;
  const formData = await request.formData();
  const intent = formData.get("_intent") ?? "createRoutePlan";
  const shopifySessionToken = formData.get("shopifySessionToken");

  if (intent === "syncOrders") {
    let orderSnapshots = [];

    try {
      orderSnapshots = JSON.parse(formData.get("orders") ?? "[]");
    } catch {
      return {
        syncedOrders: [],
        sync: null,
        errors: [{ message: "Order sync payload가 올바르지 않습니다." }],
      };
    }

    if (!Array.isArray(orderSnapshots) || orderSnapshots.length === 0) {
      return { syncedOrders: [], sync: null, errors: [] };
    }

    const syncedOrderData = await syncDeliveryOrders(
      request,
      { reason: "orders_page_open", orders: orderSnapshots },
      {
        cacheKey: shopifyShopCacheKey,
        primeOrdersCache: true,
        sessionToken: shopifySessionToken,
      },
    );

    return {
      syncedOrders: syncedOrderData.orders,
      sync: syncedOrderData.sync,
      errors: syncedOrderData.errors,
    };
  }

  if (intent === "bulkUpdateOrders") {
    let orderIds = [];

    try {
      orderIds = JSON.parse(formData.get("orderIds") ?? "[]");
    } catch {
      return {
        bulkUpdate: null,
        errors: [{ message: "선택한 주문 정보가 올바르지 않습니다." }],
      };
    }

    const field = textOrUndefined(formData.get("field"));
    const value = textOrUndefined(formData.get("value"));
    if (!Array.isArray(orderIds) || orderIds.length === 0 || !field || !value) {
      return {
        bulkUpdate: null,
        errors: [{ message: "변경할 주문과 값을 선택해주세요." }],
      };
    }

    const bulkUpdateData = await bulkUpdateDeliveryOrders(
      request,
      { field, orderIds, value },
      { sessionToken: shopifySessionToken },
    );

    return {
      bulkUpdate: {
        field,
        value,
        updated: bulkUpdateData.updated,
      },
      updatedOrders: bulkUpdateData.orders,
      errors: bulkUpdateData.errors,
    };
  }

  if (intent === "deleteInventory") {
    const inventoryIds = parseInventoryIds(formData.get("inventoryIds"));

    if (inventoryIds.length === 0) {
      return { inventoryIds: [], errors: [{ message: "삭제할 inventory를 선택해주세요." }] };
    }

    const deleteResults = await Promise.all(
      inventoryIds.map((inventoryId) =>
        deleteDeliveryInventory(request, inventoryId, { sessionToken: shopifySessionToken }),
      ),
    );

    return {
      inventoryIds: deleteResults.map((result) => result.inventoryId).filter(Boolean),
      errors: deleteResults.flatMap((result) => result.errors ?? []),
    };
  }

  const createStartedAt = getSafePerformanceNow();
  const createTimings = {};
  const plannedOrderIds = JSON.parse(formData.get("plannedOrderIds") ?? "[]");
  const routeName = textOrUndefined(formData.get("routeName"));
  const routeScope = JSON.parse(formData.get("routeScope") ?? "null");

  if (!Array.isArray(plannedOrderIds) || plannedOrderIds.length === 0) {
    return { errors: [{ message: "Route plan에 추가된 주문이 없습니다." }] };
  }

  const plannedOrderData = await resolvePlannedOrdersForAction({
    admin,
    request,
    shopifySessionToken,
    shopifyShopCacheKey,
    plannedOrderIds,
    reason: intent === "addOrdersToRouteGroup" ? "route_add_preflight" : "route_create_preflight",
    timings: createTimings,
  });

  if (plannedOrderData.errors) {
    return { errors: plannedOrderData.errors };
  }

  const { canonicalOrderCount, departureLocationData, plannedOrders, syncedOrderCount } = plannedOrderData;

  if (intent === "addOrdersToRouteGroup") {
    const routeGroupId = textOrUndefined(formData.get("routeGroupId"));
    const expectedUpdatedAt = textOrUndefined(formData.get("expectedUpdatedAt"));

    if (!routeGroupId) {
      return { errors: [{ message: "추가할 route를 선택해주세요." }] };
    }

    const addOrderIds = plannedOrders.map((order) => order.orderId).filter(Boolean);
    const addResult = await updateDeliveryRouteGroupOrders(
      request,
      routeGroupId,
      {
        addOrderIds,
        ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
      },
      { sessionToken: shopifySessionToken },
    );

    if (!addResult.routeGroup?.id || (addResult.errors ?? []).length > 0) {
      return {
        routeGroup: addResult.routeGroup,
        errors: (addResult.errors ?? []).length > 0
          ? addResult.errors
          : [{ message: "Route에 주문을 추가하지 못했습니다." }],
      };
    }

    const draftPayload = buildFirstRouteDraftPayload(addResult.routeGroup, addOrderIds);
    if (!draftPayload) {
      return { routeGroup: addResult.routeGroup, errors: [{ message: "주문을 배정할 child route가 없습니다." }] };
    }

    const draftResult = await saveDeliveryRouteGroupDraft(
      request,
      routeGroupId,
      draftPayload,
      { sessionToken: shopifySessionToken },
    );

    return {
      routeGroup: draftResult.routeGroup ?? addResult.routeGroup,
      errors: draftResult.errors ?? [],
    };
  }

  const routePlanPayload = buildCreateRoutePlanPayload({
    departureLocation: departureLocationData.departureLocation,
    plannedOrders,
    routeName,
    routeScope,
  });

  if (intent === "createInventory") {
    const createInventoryStartedAt = getSafePerformanceNow();
    const { inventory, errors: inventoryErrors } = await createDeliveryInventory(
      request,
      {
        name: routePlanPayload.name,
        orderIds: plannedOrders.map((order) => order.orderId),
      },
      { sessionToken: shopifySessionToken },
    );
    const safeInventoryErrors = inventoryErrors ?? [];
    createTimings.createInventoryMs = roundPerfDuration(getSafePerformanceNow() - createInventoryStartedAt);
    logDevPerformanceMetric("orders.create_inventory.action", {
      ...createTimings,
      totalMs: roundPerfDuration(getSafePerformanceNow() - createStartedAt),
      plannedOrderCount: plannedOrders.length,
      syncedOrderCount,
      canonicalOrderCount,
      inventoryId: inventory?.id ?? null,
      errorCount: safeInventoryErrors.length,
    });

    if (inventory?.id && safeInventoryErrors.length === 0) {
      return { inventory, errors: [] };
    }

    return {
      errors: safeInventoryErrors.length > 0
        ? safeInventoryErrors
        : [{ message: "Inventory를 만들지 못했습니다." }],
    };
  }

  const createRoutePlanStartedAt = getSafePerformanceNow();
  const { routeGroup, errors: routeGroupErrors } = await createDeliveryRouteGroup(
    request,
    buildCreateRouteGroupPayload({
      depot: routePlanPayload.depot,
      plannedOrders,
      routeName: routePlanPayload.name,
      routeScope,
    }),
    { sessionToken: shopifySessionToken },
  );

  const generatedRouteGroupData = routeGroup?.id
    ? await generateDeliveryRouteGroupChildRoutes(
        request,
        routeGroup.id,
        { confirmRisk: false },
        { sessionToken: shopifySessionToken },
      )
    : { routeGroup: null, errors: [] };
  const generatedRouteGroup = generatedRouteGroupData.routeGroup ?? routeGroup;
  const routePlan = getFirstRouteGroupRoutePlan(generatedRouteGroup);
  const routePlanErrors = [
    ...(routeGroupErrors ?? []),
    ...(generatedRouteGroupData.errors ?? []),
  ];
  createTimings.createRoutePlanMs = roundPerfDuration(getSafePerformanceNow() - createRoutePlanStartedAt);
  logDevPerformanceMetric("orders.create_route.action", {
    ...createTimings,
    totalMs: roundPerfDuration(getSafePerformanceNow() - createStartedAt),
    plannedOrderCount: plannedOrders.length,
    syncedOrderCount,
    canonicalOrderCount,
    routeGroupId: generatedRouteGroup?.id ?? null,
    routePlanId: routePlan?.id ?? null,
    errorCount: routePlanErrors.length,
  });

  if (generatedRouteGroup?.id) {
    return { routePlan, routeGroup: generatedRouteGroup, errors: [] };
  }

  return {
    errors: routePlanErrors,
  };
}

async function resolvePlannedOrdersForAction({
  admin,
  request,
  shopifySessionToken,
  shopifyShopCacheKey,
  plannedOrderIds,
  reason,
  timings,
}) {
  const shopifyDataStartedAt = getSafePerformanceNow();
  const [orderData, departureLocationData] = await Promise.all([
    fetchShopifyOrders(admin),
    fetchShopifyDepartureLocation(admin, { cacheKey: shopifyShopCacheKey }),
  ]);
  timings.shopifyDataMs = roundPerfDuration(getSafePerformanceNow() - shopifyDataStartedAt);

  const plannedOrderIdSet = new Set(plannedOrderIds);
  const plannedShopifyOrders = orderData.orders.filter((order) =>
    plannedOrderIdSet.has(order.id),
  );
  const plannedShopifyOrderSnapshots = getOrderSyncSnapshots(plannedShopifyOrders);
  const syncOrdersStartedAt = getSafePerformanceNow();
  const syncedOrderData =
    plannedShopifyOrderSnapshots.length > 0
      ? await syncDeliveryOrders(
          request,
          {
            reason,
            orders: plannedShopifyOrderSnapshots,
          },
          { cacheKey: shopifyShopCacheKey, sessionToken: shopifySessionToken },
        )
      : { orders: [], errors: [] };
  timings.syncOrdersMs = roundPerfDuration(getSafePerformanceNow() - syncOrdersStartedAt);

  if ((syncedOrderData.errors ?? []).length > 0) {
    return {
      errors: [
        ...(orderData.errors ?? []),
        ...(syncedOrderData.errors ?? []),
        ...(departureLocationData.errors ?? []),
      ],
    };
  }

  const canonicalOrdersStartedAt = getSafePerformanceNow();
  const canonicalOrderData = await fetchDeliveryOrders(
    request,
    {},
    { cacheKey: shopifyShopCacheKey, sessionToken: shopifySessionToken },
  );
  timings.canonicalOrdersMs = roundPerfDuration(getSafePerformanceNow() - canonicalOrdersStartedAt);

  if ((canonicalOrderData.errors ?? []).length > 0) {
    return {
      errors: [
        ...(orderData.errors ?? []),
        ...(syncedOrderData.errors ?? []),
        ...(canonicalOrderData.errors ?? []),
        ...(departureLocationData.errors ?? []),
      ],
    };
  }

  const canonicalOrders = mergeShopifyOrderRowsWithCanonicalRows(
    mapCanonicalOrdersToOrderRows(canonicalOrderData.orders),
    mapCanonicalOrdersToOrderRows(syncedOrderData.orders),
  );
  const orderById = new Map(canonicalOrders.map((order) => [order.id, order]));
  const plannedOrders = plannedOrderIds
    .map((orderId) => orderById.get(orderId))
    .filter(Boolean);

  if (plannedOrders.length !== plannedOrderIds.length) {
    return {
      errors: [
        {
          message:
            "서버에서 route scope가 계산된 일부 주문을 찾지 못했습니다. 주문 동기화 후 다시 시도해주세요.",
        },
      ],
    };
  }

  if (plannedOrders.some((order) => !textOrUndefined(order.orderId))) {
    return {
      errors: [
        {
          message:
            "서버 주문 ID가 없는 주문이 있어 경로를 만들 수 없습니다. 주문 동기화 후 다시 시도해주세요.",
        },
      ],
    };
  }

  return {
    canonicalOrderCount: canonicalOrderData.orders?.length ?? 0,
    departureLocationData,
    plannedOrders,
    syncedOrderCount: syncedOrderData.orders?.length ?? 0,
  };
}

export const loader = async ({ request }) => {
  const loaderStartedAt = getSafePerformanceNow();
  const { admin, session } = await authenticate.admin(request);
  const shopifyShopCacheKey = session?.shop;
  const activeOrdersView = new URL(request.url).searchParams.get("view") === "inventory"
    ? "inventory"
    : "orders";
  const shouldLoadOrders = activeOrdersView !== "inventory";

  const ordersStartedAt = getSafePerformanceNow();
  const orderDataPromise = shouldLoadOrders
    ? fetchShopifyOrders(admin, {
        cacheKey: shopifyShopCacheKey,
      }).then((orderData) => ({
        data: orderData,
        durationMs: roundPerfDuration(getSafePerformanceNow() - ordersStartedAt),
      }))
    : Promise.resolve({ data: { orders: [], errors: [] }, durationMs: 0 });

  const departureLocationStartedAt = getSafePerformanceNow();
  const departureLocationDataPromise = shouldLoadOrders
    ? fetchShopifyDepartureLocation(
        admin,
        { cacheKey: shopifyShopCacheKey },
      ).then((departureLocationData) => ({
        data: departureLocationData,
        durationMs: roundPerfDuration(getSafePerformanceNow() - departureLocationStartedAt),
      }))
    : Promise.resolve({ data: { departureLocation: null, errors: [] }, durationMs: 0 });

  const serverOrdersStartedAt = getSafePerformanceNow();
  const inventoriesStartedAt = getSafePerformanceNow();
  const routeGroupsStartedAt = getSafePerformanceNow();
  const shopTimeZoneStartedAt = getSafePerformanceNow();
  const shopTimeZoneDataPromise = shouldLoadOrders
    ? fetchShopifyShopTimeZone(
        admin,
        { cacheKey: shopifyShopCacheKey },
      ).then((shopTimeZoneData) => ({
        data: shopTimeZoneData,
        durationMs: roundPerfDuration(getSafePerformanceNow() - shopTimeZoneStartedAt),
      }))
    : Promise.resolve({
        data: { ianaTimezone: undefined, timezoneAbbreviation: undefined },
        durationMs: 0,
      });

  const serverOrderDataPromise = shouldLoadOrders
    ? fetchDeliveryOrders(
        request,
        {},
        { cacheKey: shopifyShopCacheKey },
      ).then(
        (serverOrderData) => ({
          data: serverOrderData,
          durationMs: roundPerfDuration(getSafePerformanceNow() - serverOrdersStartedAt),
        }),
        () => ({
          data: {
            orders: [],
            errors: [
              {
                code: DELIVERY_API_ERROR_CODE,
                message: "Delivery orders API 호출에 실패해 Shopify 주문만 먼저 표시합니다.",
              },
            ],
          },
          durationMs: roundPerfDuration(getSafePerformanceNow() - serverOrdersStartedAt),
        }),
      )
    : Promise.resolve({ data: { orders: [], errors: [] }, durationMs: 0 });

  const inventoryDataPromise = fetchDeliveryInventories(
    request,
    {},
    { cacheKey: shopifyShopCacheKey },
  ).then(
    (inventoryData) => ({
      data: inventoryData,
      durationMs: roundPerfDuration(getSafePerformanceNow() - inventoriesStartedAt),
    }),
    () => ({
      data: { inventories: [], errors: [{ code: DELIVERY_API_ERROR_CODE, message: "Inventory API 호출에 실패했습니다." }] },
      durationMs: roundPerfDuration(getSafePerformanceNow() - inventoriesStartedAt),
    }),
  );

  const routeGroupDataPromise = shouldLoadOrders
    ? fetchDeliveryRouteGroups(
        request,
        {},
        { cacheKey: shopifyShopCacheKey },
      ).then(
        (routeGroupData) => ({
          data: routeGroupData,
          durationMs: roundPerfDuration(getSafePerformanceNow() - routeGroupsStartedAt),
        }),
        () => ({
          data: { routeGroups: [], errors: [{ code: DELIVERY_API_ERROR_CODE, message: "Route group API 호출에 실패했습니다." }] },
          durationMs: roundPerfDuration(getSafePerformanceNow() - routeGroupsStartedAt),
        }),
      )
    : Promise.resolve({ data: { routeGroups: [], errors: [] }, durationMs: 0 });

  const [
    orderDataResult,
    departureLocationDataResult,
    serverOrderDataResult,
    inventoryDataResult,
    shopTimeZoneDataResult,
    routeGroupDataResult,
  ] = await Promise.all([
    orderDataPromise,
    departureLocationDataPromise,
    serverOrderDataPromise,
    inventoryDataPromise,
    shopTimeZoneDataPromise,
    routeGroupDataPromise,
  ]);
  const orderData = orderDataResult.data;
  const departureLocationData = departureLocationDataResult.data;
  const serverOrderData = serverOrderDataResult.data;
  const inventoryData = inventoryDataResult.data;
  const shopTimeZoneData = shopTimeZoneDataResult.data;
  const routeGroupData = routeGroupDataResult.data;
  const shopLocalDate = getShopLocalDate(shopTimeZoneData);
  const serverOrderRows = mapCanonicalOrdersToOrderRows(serverOrderData.orders);
  const mergedOrders = mergeShopifyOrderRowsWithCanonicalRows(
    orderData.orders,
    serverOrderRows,
  );

  return {
    orders: mergedOrders,
    inventories: inventoryData.inventories,
    routeGroups: routeGroupData.routeGroups,
    needsSessionTokenRefresh: hasSessionTokenRefreshError([serverOrderData, inventoryData]),
    errors: collectServiceErrors(
      [orderData, departureLocationData, serverOrderData, inventoryData, routeGroupData],
      { ignoredCodes: [DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE] },
    ),
    departureLocation: departureLocationData.departureLocation,
    shopLocalDate,
    shopTimeZone: shopTimeZoneData.ianaTimezone ?? null,
    perf: {
      loader: {
        activeOrdersView,
        totalMs: roundPerfDuration(getSafePerformanceNow() - loaderStartedAt),
        shopifyOrdersCacheStatus: orderData.cacheStatus ?? (shouldLoadOrders ? "unknown" : "skipped"),
        shopifyOrdersMs: orderDataResult.durationMs,
        departureLocationMs: departureLocationDataResult.durationMs,
        serverOrdersMs: serverOrderDataResult.durationMs,
        inventoriesMs: inventoryDataResult.durationMs,
        routeGroupsMs: routeGroupDataResult.durationMs,
        shopTimeZoneMs: shopTimeZoneDataResult.durationMs,
      },
    },
  };
};

function hasSessionTokenRefreshError(results) {
  return results.some((result) =>
    (result?.errors ?? []).some((error) =>
      error?.code === DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE ||
      (
        error?.code === "UNAUTHORIZED" &&
        error?.message === INVALID_SHOPIFY_SESSION_TOKEN_MESSAGE
      ),
    ),
  );
}
