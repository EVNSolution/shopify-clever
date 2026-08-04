import { data } from "react-router";
import {
  bulkUpdateDeliveryOrders,
  createDeliveryOrdersSelectionSnapshot,
  fetchDeliveryOrderFacets,
  fetchDeliveryOrderMapPoints,
  fetchDeliveryOrders,
  fetchDeliveryOrdersPage,
  fetchDeliveryOrdersReconciliationStatus,
  patchDeliveryOrderMetadata,
  replaceDeliveryOrdersSelectionExclusions,
  startDeliveryOrdersReconciliation,
  syncDeliveryOrders,
} from "../delivery/orders.server";
import { createDeliveryInventory, deleteDeliveryInventory, fetchDeliveryInventories } from "../delivery/inventories.server";
import {
  buildCreateRoutePlanPayload,
  DELIVERY_API_ERROR_CODE,
  DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE,
  fetchDeliveryRoutePlans,
} from "../delivery/route-plans.server";
import {
  createDeliveryRouteGroup,
  fetchDeliveryRouteGroups,
  saveDeliveryRouteGroupDraft,
  updateDeliveryRouteGroupOrders,
} from "../delivery/route-groups.server";
import { getRouteGroupChildRoutePlanId, getVisibleRouteGroupChildren } from "../delivery/route-helpers";
import { refreshRouteOrders } from "../delivery/route-detail.server";
import { getBulkRefreshRoutePlanIds } from "../delivery/route-order-refresh";
import { fetchShopifyDepartureLocation } from "../locations/shopify-locations.server";
import { fetchShopifyAppPreferences } from "../settings/app-preferences.server";
import {
  getOrderSyncSnapshots,
  mapCanonicalOrdersToOrderRows,
  mergeShopifyOrderRowsWithCanonicalRows,
} from "./canonical-orders";
import { collectServiceErrors, normalizeCaughtServiceError } from "../service-errors";
import { clearShopifyOrdersCache, fetchShopifyOrders, fetchShopifyOrdersByIds } from "./shopify-orders.server";
import { authenticate } from "../../shopify.server";
import {
  buildServerTimingHeader,
  createTelemetryRequestId,
  hashShopIdentifier,
  logStructuredMetric,
  sanitizeRequestPath,
} from "../telemetry/structured-telemetry.server";
import {
  DEFAULT_ROUTE_PLAN_TITLE,
  getSafePerformanceNow,
  roundPerfDuration,
  textOrUndefined,
  withPromiseTimeout,
} from "./orders-page.shared";
import { getOrderFiltersFromSearchParams } from "./order-filters";
import { resolveOrdersResourceFeatureFlags } from "./orders-resource-flags";
import {
  fetchShopifyShopTimeZone,
  getShopLocalDate,
} from "../shopify/shop-timezone.server";

const PERF_CAPTURE_ENABLED = import.meta.env.DEV;
const INVALID_SHOPIFY_SESSION_TOKEN_MESSAGE = "Invalid Shopify session token";
const ORDERS_PAGE_LOAD_TIMEOUT_MS = 15_000;

function isFeatureFlagEnabled(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null || value === "") return defaultValue;
  return /^(1|true|yes|on)$/iu.test(value);
}

function shouldFetchShopifyOrders() {
  return process.env.CLEVER_ORDERS_SOURCE_MODE !== "delivery_only";
}

function shouldUseCanonicalFirstOrders() {
  return isFeatureFlagEnabled("CLEVER_ORDERS_CANONICAL_FIRST");
}

function shouldAutoSyncOrdersOnLoad() {
  return isFeatureFlagEnabled("CLEVER_ORDERS_AUTO_SYNC_ON_LOAD");
}

function shouldUseBackgroundReconciliation() {
  return isFeatureFlagEnabled("CLEVER_ORDERS_BACKGROUND_RECONCILIATION");
}

function getOrdersResourceFeatureFlags() {
  return resolveOrdersResourceFeatureFlags(process.env);
}

function getDeliveryOnlyDepartureLocationData() {
  const latitude = Number(process.env.CLEVER_DELIVERY_ONLY_DEPOT_LATITUDE);
  const longitude = Number(process.env.CLEVER_DELIVERY_ONLY_DEPOT_LONGITUDE);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  return {
    departureLocation: {
      id: "clever-delivery-only-depot",
      name: process.env.CLEVER_DELIVERY_ONLY_DEPOT_NAME || "CLEVER Depot",
      address: process.env.CLEVER_DELIVERY_ONLY_DEPOT_ADDRESS || "No location address",
      coordinates: hasCoordinates ? [longitude, latitude] : [undefined, undefined],
      hasCoordinates,
      source: "CLEVER Settings",
      isActive: true,
    },
    errors: [],
  };
}

function getDeliveryOnlyShopTimeZoneData() {
  return {
    ianaTimezone: process.env.CLEVER_DELIVERY_ONLY_TIME_ZONE || "Asia/Seoul",
    timezoneAbbreviation: "KST",
  };
}

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

  return { mode: "MANUAL_ORDER", routes };
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

    const preferencesData = await fetchShopifyAppPreferences(admin);
    if ((preferencesData.errors ?? []).length > 0) {
      return { syncedOrders: [], sync: null, errors: preferencesData.errors };
    }

    const syncedOrderData = await syncDeliveryOrders(
      request,
      {
        deliveryCycle: preferencesData.appPreferences.deliveryCycle,
        reason: "orders_page_open",
        orders: orderSnapshots,
      },
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

  if (intent === "refreshAllRoutes") {
    const refreshRequestId = textOrUndefined(formData.get("refreshRequestId"));
    const completeRefresh = (result) => ({
      ...result,
      refreshRequestId,
    });

    if (shouldUseBackgroundReconciliation()) {
      const reconciliationData = await startDeliveryOrdersReconciliation(
        request,
        { correlationId: refreshRequestId, mode: "FULL" },
        { sessionToken: shopifySessionToken },
      );

      return completeRefresh({
        errors: reconciliationData.errors,
        reconciliationJob: reconciliationData.job,
        reconciliationMode: "background",
        refreshedRoutes: 0,
        routePlanIds: [],
        skippedRoutes: [],
        syncedOrders: [],
        sync: null,
        updatedOrders: reconciliationData.job?.appliedCount ?? 0,
      });
    }

    const preferencesData = await fetchShopifyAppPreferences(admin);
    if ((preferencesData.errors ?? []).length > 0) {
      return completeRefresh({
        errors: preferencesData.errors,
        refreshedRoutes: 0,
        routePlanIds: [],
        skippedRoutes: [],
        syncedOrders: [],
        sync: null,
        updatedOrders: 0,
      });
    }

    clearShopifyOrdersCache(shopifyShopCacheKey);
    const orderData = shouldFetchShopifyOrders()
      ? await fetchShopifyOrders(admin, {
          cacheKey: shopifyShopCacheKey,
          deliveryCycle: preferencesData.appPreferences.deliveryCycle,
        })
      : { orders: [], errors: [] };
    const orderSnapshots = getOrderSyncSnapshots(orderData.orders);
    const syncedOrderData = orderSnapshots.length > 0
      ? await syncDeliveryOrders(
          request,
          {
            deliveryCycle: preferencesData.appPreferences.deliveryCycle,
            reason: "orders_page_open",
            orders: orderSnapshots,
          },
          {
            cacheKey: shopifyShopCacheKey,
            primeOrdersCache: true,
            sessionToken: shopifySessionToken,
          },
        )
      : { orders: [], errors: [], sync: null };
    const routePlanData = await fetchDeliveryRoutePlans(request, {
      cacheKey: shopifyShopCacheKey,
      sessionToken: shopifySessionToken,
    });
    const errors = [
      ...(orderData.errors ?? []),
      ...(syncedOrderData.errors ?? []),
      ...(routePlanData.errors ?? []),
    ];
    if (errors.length > 0) {
      return completeRefresh({
        errors,
        refreshedRoutes: 0,
        routePlanIds: [],
        skippedRoutes: [],
        syncedOrders: syncedOrderData.orders ?? [],
        sync: syncedOrderData.sync ?? null,
        updatedOrders: syncedOrderData.orders?.length ?? 0,
      });
    }

    const routePlans = routePlanData.routePlans ?? [];
    const routePlanIds = getBulkRefreshRoutePlanIds(routePlans);
    const initiallySkippedRoutes = routePlans
      .filter((routePlan) => !routePlanIds.includes(routePlan.id))
      .map((routePlan) => ({ routePlanId: routePlan.id, status: routePlan.status ?? "UNKNOWN" }));
    if (routePlanIds.length === 0) {
      return completeRefresh({
        errors: [],
        refreshedRoutes: 0,
        routePlanIds: [],
        skippedRoutes: initiallySkippedRoutes,
        syncedOrders: syncedOrderData.orders ?? [],
        sync: syncedOrderData.sync ?? null,
        updatedOrders: syncedOrderData.orders?.length ?? 0,
      });
    }

    const result = await refreshRouteOrders({
      allowInProgress: false,
      admin,
      request,
      routePlanIds,
      sessionToken: shopifySessionToken,
      shopifyShopCacheKey,
      syncedOrderData,
    });
    return completeRefresh({
      ...result,
      skippedRoutes: [...initiallySkippedRoutes, ...(result.skippedRoutes ?? [])],
      syncedOrders: syncedOrderData.orders ?? [],
    });
  }

  if (intent === "pollOrdersReconciliation") {
    const refreshRequestId = textOrUndefined(formData.get("refreshRequestId"));
    const jobId = textOrUndefined(formData.get("jobId"));
    const statusData = await fetchDeliveryOrdersReconciliationStatus(
      request,
      jobId,
      { sessionToken: shopifySessionToken },
    );

    return {
      errors: statusData.errors,
      reconciliationJob: statusData.job,
      reconciliationMode: "background",
      refreshRequestId,
    };
  }


  if (intent === "patchOrderData") {
    const orderId = textOrUndefined(formData.get("orderId"));
    if (!orderId) {
      return { updatedOrders: [], errors: [{ message: "수정할 주문을 선택해주세요." }] };
    }

    const patch = {};
    for (const field of ["deliveryDate", "deliveryArea"]) {
      if (formData.has(field)) patch[field] = textOrUndefined(formData.get(field)) ?? null;
    }

    if (Object.keys(patch).length === 0) {
      return { updatedOrders: [], errors: [{ message: "수정할 값을 입력해주세요." }] };
    }

    const patchData = await patchDeliveryOrderMetadata(
      request,
      orderId,
      patch,
      { sessionToken: shopifySessionToken },
    );

    return {
      updatedOrders: patchData.order ? [patchData.order] : [],
      errors: patchData.errors,
    };
  }

  if (intent === "bulkUpdateOrders") {
    const selectionToken = textOrUndefined(formData.get("selectionToken"));
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
    if ((!selectionToken && (!Array.isArray(orderIds) || orderIds.length === 0)) || !field || !value) {
      return {
        bulkUpdate: null,
        errors: [{ message: "변경할 주문과 값을 선택해주세요." }],
      };
    }

    const bulkUpdateData = await bulkUpdateDeliveryOrders(
      request,
      { field, orderIds, selectionToken, value },
      { sessionToken: shopifySessionToken },
    );

    return {
      bulkUpdate: {
        field,
        ...(bulkUpdateData.noOp != null ? { noOp: bulkUpdateData.noOp } : {}),
        ...(bulkUpdateData.resolved != null ? { resolved: bulkUpdateData.resolved } : {}),
        ...(bulkUpdateData.selected != null ? { selected: bulkUpdateData.selected } : {}),
        ...(bulkUpdateData.skipped != null ? { skipped: bulkUpdateData.skipped } : {}),
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
    if (!draftPayload) return { routeGroup: addResult.routeGroup, errors: [] };

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

  const routePlan = getFirstRouteGroupRoutePlan(routeGroup);
  const routePlanErrors = routeGroupErrors ?? [];
  createTimings.createRoutePlanMs = roundPerfDuration(getSafePerformanceNow() - createRoutePlanStartedAt);
  logDevPerformanceMetric("orders.create_route.action", {
    ...createTimings,
    totalMs: roundPerfDuration(getSafePerformanceNow() - createStartedAt),
    plannedOrderCount: plannedOrders.length,
    syncedOrderCount,
    canonicalOrderCount,
    routeGroupId: routeGroup?.id ?? null,
    routePlanId: routePlan?.id ?? null,
    errorCount: routePlanErrors.length,
  });

  if (routeGroup?.id) {
    return { routePlan, routeGroup, errors: [] };
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
  const preferencesData = await fetchShopifyAppPreferences(admin);
  const canonicalFirst = shouldUseCanonicalFirstOrders();
  const plannedOrderIdSet = new Set(plannedOrderIds);
  const [canonicalOrderData, departureLocationData] = await Promise.all([
    fetchDeliveryOrders(
      request,
      {},
      { cacheKey: shopifyShopCacheKey, sessionToken: shopifySessionToken },
    ),
    shouldFetchShopifyOrders()
      ? fetchShopifyDepartureLocation(admin, { cacheKey: shopifyShopCacheKey })
      : Promise.resolve(getDeliveryOnlyDepartureLocationData()),
  ]);
  const canonicalRows = mapCanonicalOrdersToOrderRows(canonicalOrderData.orders);
  timings.canonicalOrdersMs = roundPerfDuration(getSafePerformanceNow() - shopifyDataStartedAt);
  const canonicalOrderById = new Map(
    canonicalRows.map((order) => [textOrUndefined(order.id), order]).filter(([orderId]) => orderId),
  );
  const missingPlannedOrderIds = plannedOrderIds.filter((orderId) => !canonicalOrderById.has(orderId));
  const orderData = canonicalFirst
    ? (
        missingPlannedOrderIds.length > 0 && shouldFetchShopifyOrders()
          ? await fetchShopifyOrdersByIds(admin, missingPlannedOrderIds, {
              deliveryCycle: preferencesData.appPreferences.deliveryCycle,
            })
          : { orders: [], errors: [] }
      )
    : (
        shouldFetchShopifyOrders()
          ? await fetchShopifyOrders(admin, { deliveryCycle: preferencesData.appPreferences.deliveryCycle })
          : { orders: [], errors: [] }
      );
  timings.shopifyDataMs = roundPerfDuration(getSafePerformanceNow() - shopifyDataStartedAt);

  const plannedShopifyOrders = canonicalFirst
    ? orderData.orders
    : orderData.orders.filter((order) => plannedOrderIdSet.has(order.id));
  const plannedShopifyOrderSnapshots = getOrderSyncSnapshots(plannedShopifyOrders);
  const syncOrdersStartedAt = getSafePerformanceNow();
  const syncedOrderData =
    plannedShopifyOrderSnapshots.length > 0
      ? await syncDeliveryOrders(
          request,
          {
            deliveryCycle: preferencesData.appPreferences.deliveryCycle,
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
        ...(preferencesData.errors ?? []),
        ...(orderData.errors ?? []),
        ...(syncedOrderData.errors ?? []),
        ...(departureLocationData.errors ?? []),
      ],
    };
  }

  if ((canonicalOrderData.errors ?? []).length > 0) {
    return {
      errors: [
        ...(preferencesData.errors ?? []),
        ...(orderData.errors ?? []),
        ...(syncedOrderData.errors ?? []),
        ...(canonicalOrderData.errors ?? []),
        ...(departureLocationData.errors ?? []),
      ],
    };
  }

  const canonicalOrders = mergeShopifyOrderRowsWithCanonicalRows(
    canonicalRows,
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
  const requestId = createTelemetryRequestId();
  const shopHash = hashShopIdentifier(session?.shop);
  const path = sanitizeRequestPath(request.url);
  const ordersPageData = withPromiseTimeout(
    loadOrdersPageData({
      admin,
      loaderStartedAt,
      path,
      request,
      requestId,
      session,
      shopHash,
    }),
    ORDERS_PAGE_LOAD_TIMEOUT_MS,
    "Orders data loading timed out.",
  );
  const timingHeader = buildServerTimingHeader({
    "orders-loader-start": roundPerfDuration(getSafePerformanceNow() - loaderStartedAt),
  });

  return data(
    { ordersPageData },
    timingHeader ? { headers: { "Server-Timing": timingHeader } } : undefined,
  );
};

async function loadOrdersPageData({ admin, loaderStartedAt, path, request, requestId, session, shopHash }) {
  const shopifyShopCacheKey = session?.shop;
  const activeOrdersView = new URL(request.url).searchParams.get("view") === "inventory"
    ? "inventory"
    : "orders";
  const shouldLoadOrders = activeOrdersView !== "inventory";
  const canonicalFirst = shouldUseCanonicalFirstOrders();
  const autoSyncOrdersOnLoad = shouldAutoSyncOrdersOnLoad();
  const backgroundReconciliation = shouldUseBackgroundReconciliation();
  const resourceFlags = getOrdersResourceFeatureFlags();
  const shouldLoadShopifyMetadata =
    shouldLoadOrders && shouldFetchShopifyOrders();
  const shouldLoadShopifyOrders =
    shouldLoadShopifyMetadata && !canonicalFirst;

  const preferencesStartedAt = getSafePerformanceNow();
  const preferencesDataPromise = shouldLoadOrders
    ? fetchShopifyAppPreferences(admin).then((preferencesData) => ({
        data: preferencesData,
        durationMs: roundPerfDuration(getSafePerformanceNow() - preferencesStartedAt),
      }))
    : Promise.resolve({ data: { appPreferences: { deliveryCycle: undefined }, errors: [] }, durationMs: 0 });

  const ordersStartedAt = getSafePerformanceNow();
  const orderDataPromise = shouldLoadShopifyOrders
    ? preferencesDataPromise.then(({ data: preferencesData }) => fetchShopifyOrders(admin, {
        cacheKey: shopifyShopCacheKey,
        deliveryCycle: preferencesData.appPreferences.deliveryCycle,
      })).then((orderData) => ({
        data: orderData,
        durationMs: roundPerfDuration(getSafePerformanceNow() - ordersStartedAt),
      }))
    : Promise.resolve({ data: { orders: [], errors: [] }, durationMs: 0 });

  const departureLocationStartedAt = getSafePerformanceNow();
  const departureLocationDataPromise = shouldLoadOrders
    ? (shouldLoadShopifyMetadata
      ? fetchShopifyDepartureLocation(admin, { cacheKey: shopifyShopCacheKey })
      : Promise.resolve(getDeliveryOnlyDepartureLocationData())).then((departureLocationData) => ({
        data: departureLocationData,
        durationMs: roundPerfDuration(getSafePerformanceNow() - departureLocationStartedAt),
      }))
    : Promise.resolve({ data: { departureLocation: null, errors: [] }, durationMs: 0 });

  const serverOrdersStartedAt = getSafePerformanceNow();
  const inventoriesStartedAt = getSafePerformanceNow();
  const routeGroupsStartedAt = getSafePerformanceNow();
  const shopTimeZoneStartedAt = getSafePerformanceNow();
  const shopTimeZoneDataPromise = shouldLoadOrders
    ? (shouldLoadShopifyMetadata
      ? fetchShopifyShopTimeZone(admin, { cacheKey: shopifyShopCacheKey })
      : Promise.resolve(getDeliveryOnlyShopTimeZoneData())).then((shopTimeZoneData) => ({
        data: shopTimeZoneData,
        durationMs: roundPerfDuration(getSafePerformanceNow() - shopTimeZoneStartedAt),
      }))
    : Promise.resolve({
        data: { ianaTimezone: undefined, timezoneAbbreviation: undefined },
        durationMs: 0,
      });

  const serverOrdersRequestPromise = shouldLoadOrders
    ? (resourceFlags.pagination
      ? shopTimeZoneDataPromise.then(({ data: shopTimeZoneData }) => fetchDeliveryOrdersPage(
          request,
          {
            ...getOrderFiltersFromSearchParams(new URL(request.url).searchParams),
            routeOpsToday: getShopLocalDate(shopTimeZoneData),
          },
          { cacheKey: shopifyShopCacheKey },
        ).then((pageData) => ({ ...pageData, orders: pageData.rows })))
      : fetchDeliveryOrders(
          request,
          {},
          { cacheKey: shopifyShopCacheKey },
        ))
    : null;

  const serverOrderDataPromise = shouldLoadOrders
    ? serverOrdersRequestPromise.then(
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
    preferencesDataResult,
    orderDataResult,
    departureLocationDataResult,
    serverOrderDataResult,
    inventoryDataResult,
    shopTimeZoneDataResult,
    routeGroupDataResult,
  ] = await Promise.all([
    preferencesDataPromise,
    orderDataPromise,
    departureLocationDataPromise,
    serverOrderDataPromise,
    inventoryDataPromise,
    shopTimeZoneDataPromise,
    routeGroupDataPromise,
  ]);
  const preferencesData = preferencesDataResult.data;
  const orderData = orderDataResult.data;
  const departureLocationData = departureLocationDataResult.data;
  const serverOrderData = serverOrderDataResult.data;
  const inventoryData = inventoryDataResult.data;
  const shopTimeZoneData = shopTimeZoneDataResult.data;
  const routeGroupData = routeGroupDataResult.data;
  const shopLocalDate = getShopLocalDate(shopTimeZoneData);
  const serverOrderRows = mapCanonicalOrdersToOrderRows(serverOrderData.orders);
  const mergedOrders = canonicalFirst
    ? serverOrderRows
    : mergeShopifyOrderRowsWithCanonicalRows(
        orderData.orders,
        serverOrderRows,
        {
          includeCanonicalOnly:
            !shouldLoadShopifyOrders || orderData.complete !== true,
        },
      );
  const loaderTimings = {
    activeOrdersView,
    canonicalFirst,
    totalMs: roundPerfDuration(getSafePerformanceNow() - loaderStartedAt),
    shopifyOrdersCacheStatus: orderData.cacheStatus ?? (shouldLoadOrders ? "unknown" : "skipped"),
    preferencesMs: preferencesDataResult.durationMs,
    shopifyOrdersMs: orderDataResult.durationMs,
    departureLocationMs: departureLocationDataResult.durationMs,
    serverOrdersMs: serverOrderDataResult.durationMs,
    inventoriesMs: inventoryDataResult.durationMs,
    routeGroupsMs: routeGroupDataResult.durationMs,
    shopTimeZoneMs: shopTimeZoneDataResult.durationMs,
  };

  logStructuredMetric("orders.loader", {
    ...loaderTimings,
    canonicalOrderCount: serverOrderData.orders?.length ?? 0,
    correlationId: requestId,
    inventoryCount: inventoryData.inventories?.length ?? 0,
    loaderMode: canonicalFirst ? "canonical_first" : "shopify_merge",
    orderCount: mergedOrders.length,
    path,
    requestId,
    routeGroupCount: routeGroupData.routeGroups?.length ?? 0,
    shopHash,
    syncStatus: serverOrderData.freshness?.syncStatus ?? "unknown",
  });

  return {
    orders: mergedOrders,
    ordersCacheKey: shopifyShopCacheKey ?? null,
    ordersLoaded: shouldLoadOrders,
    inventories: inventoryData.inventories,
    routeGroups: routeGroupData.routeGroups,
    needsSessionTokenRefresh: hasSessionTokenRefreshError([serverOrderData, inventoryData]),
    errors: collectServiceErrors(
      [preferencesData, orderData, departureLocationData, serverOrderData, inventoryData, routeGroupData],
      { ignoredCodes: [DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE] },
    ),
    departureLocation: departureLocationData.departureLocation,
    deliveryCycle: preferencesData.appPreferences.deliveryCycle ?? null,
    featureFlags: {
      autoSyncOrdersOnLoad,
      backgroundReconciliation,
      canonicalFirst,
      ...resourceFlags,
    },
    pageInfo: serverOrderData.pageInfo ?? null,
    pageResult: serverOrderData.result ?? null,
    freshness: serverOrderData.freshness ?? {
      canonicalOrderCount: serverOrderData.orders?.length ?? 0,
      lastReconciliationAt: null,
      lastWebhookAt: null,
      oldestPendingReconciliationAt: null,
      oldestPendingWebhookAt: null,
      queueDepth: null,
      syncStatus: "unknown",
    },
    requestId,
    shopLocalDate,
    shopTimeZone: shopTimeZoneData.ianaTimezone ?? null,
    perf: {
      loader: loaderTimings,
    },
  };
}

export async function loadOrdersPageResource(request) {
  const payload = await readOrdersQueryResourcePayload(request);
  return measureOrdersResource(authenticatedResourceRequest(request, payload.shopifySessionToken), "orders.page.fetch", async () => {
    requireOrdersResourceFlag("pagination");
    const pageData = await fetchDeliveryOrdersPage(
      request,
      {
        ...payload.filters,
        after: payload.after,
        before: payload.before,
      },
      { sessionToken: payload.shopifySessionToken },
    );

    return {
      metric: {
        cursorVersion: 1,
        filterHash: pageData.result?.filterHash,
        rowCount: pageData.rows?.length ?? 0,
      },
      value: {
        ...pageData,
        _requestKey: payload._requestKey ?? null,
        rows: mapCanonicalOrdersToOrderRows(pageData.rows),
      },
    };
  });
}

export async function loadOrdersFacetsResource(request) {
  const payload = await readOrdersQueryResourcePayload(request);
  return measureOrdersResource(authenticatedResourceRequest(request, payload.shopifySessionToken), "orders.facets.fetch", async () => {
    requireOrdersResourceFlag("pagination");
    const result = await fetchDeliveryOrderFacets(
      request,
      payload.filters,
      { sessionToken: payload.shopifySessionToken },
    );
    return {
      metric: {
        countPrecision: result.countPrecision,
        filterHash: result.filterHash,
        totalCount: result.totalCount,
      },
      value: { ...result, _requestKey: payload._requestKey ?? null },
    };
  });
}

export async function loadOrdersMapPointsResource(request) {
  const payload = await readOrdersQueryResourcePayload(request);
  return measureOrdersResource(authenticatedResourceRequest(request, payload.shopifySessionToken), "orders.map_points.fetch", async () => {
    requireOrdersResourceFlag("compactMap");
    const result = await fetchDeliveryOrderMapPoints(
      request,
      {
        ...payload.filters,
        limit: payload.limit,
      },
      { sessionToken: payload.shopifySessionToken },
    );
    return {
      metric: {
        filterHash: result.filterHash,
        pointCount: result.points?.length ?? 0,
      },
      value: { ...result, _requestKey: payload._requestKey ?? null },
    };
  });
}

export async function handleOrdersSelectionSnapshotsResource(request) {
  const payload = await readResourcePayload(request);
  const sessionToken = textOrUndefined(payload.shopifySessionToken);
  if (!sessionToken) {
    throw new Response("Shopify session token required", { status: 401 });
  }
  return measureOrdersResource(authenticatedResourceRequest(request, sessionToken), "orders.selection.snapshot", async () => {
    requireOrdersResourceFlag("selectionSnapshots");

    if (request.method === "POST") {
      const result = await createDeliveryOrdersSelectionSnapshot(request, {
        excludeOrderIds: payload.excludeOrderIds,
        filters: payload.filters,
        sort: "id_desc",
      }, { sessionToken });
      return {
        metric: {
          selectedCount: result.selectedCount ?? result.totalCount,
          skippedCount: payload.excludeOrderIds?.length ?? 0,
        },
        value: {
          ...result,
          _requestKey: payload._requestKey ?? null,
          _selectionOperation: "create",
        },
      };
    }

    if (request.method === "PATCH") {
      const result = await replaceDeliveryOrdersSelectionExclusions(request, {
        excludeOrderIds: payload.excludeOrderIds,
        selectionToken: payload.selectionToken,
      }, { sessionToken });
      return {
        metric: { skippedCount: payload.excludeOrderIds?.length ?? 0 },
        value: {
          ...result,
          _requestKey: payload._requestKey ?? null,
          _selectionOperation: "replace",
        },
      };
    }

    throw new Response("Method not allowed", { status: 405 });
  });
}

async function measureOrdersResource(request, name, operation) {
  const startedAt = getSafePerformanceNow();
  const { session } = await authenticate.admin(request);
  const requestId = createTelemetryRequestId();
  const baseMetric = {
    correlationId: requestId,
    path: sanitizeRequestPath(request.url),
    requestId,
    shopHash: hashShopIdentifier(session?.shop),
  };

  try {
    const result = await operation();
    logStructuredMetric(name, {
      ...baseMetric,
      ...result.metric,
      durationMs: roundPerfDuration(getSafePerformanceNow() - startedAt),
      errorCount: 0,
      status: "success",
    });
    return result.value;
  } catch (error) {
    logStructuredMetric(name, {
      ...baseMetric,
      durationMs: roundPerfDuration(getSafePerformanceNow() - startedAt),
      errorCount: 1,
      status: error instanceof Response ? `http_${error.status}` : "error",
    });
    throw error;
  }
}

function requireOrdersResourceFlag(flag) {
  if (!getOrdersResourceFeatureFlags()[flag]) {
    throw new Response("Orders resource disabled", { status: 404 });
  }
}

async function readResourcePayload(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  const formData = await request.formData();
  return {
    after: textOrUndefined(formData.get("after")),
    before: textOrUndefined(formData.get("before")),
    excludeOrderIds: parseJsonArray(formData.get("excludeOrderIds")),
    filters: parseJsonObject(formData.get("filters")),
    limit: textOrUndefined(formData.get("limit")),
    _requestKey: textOrUndefined(formData.get("_requestKey")),
    selectionToken: textOrUndefined(formData.get("selectionToken")),
    shopifySessionToken: textOrUndefined(formData.get("shopifySessionToken")),
  };
}

async function readOrdersQueryResourcePayload(request) {
  if (request.method !== "POST") {
    throw new Response("Method not allowed", { status: 405 });
  }
  const payload = await readResourcePayload(request);
  const sessionToken = textOrUndefined(payload.shopifySessionToken);
  if (!sessionToken) {
    throw new Response("Shopify session token required", { status: 401 });
  }
  return {
    _requestKey: textOrUndefined(payload._requestKey),
    after: textOrUndefined(payload.after),
    before: textOrUndefined(payload.before),
    filters: payload.filters && typeof payload.filters === "object" && !Array.isArray(payload.filters)
      ? payload.filters
      : {},
    limit: textOrUndefined(payload.limit),
    shopifySessionToken: sessionToken,
  };
}

function authenticatedResourceRequest(request, sessionToken) {
  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${sessionToken}`);
  headers.delete("content-length");
  headers.delete("content-type");
  return new Request(request.url, { headers, method: "GET" });
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

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
