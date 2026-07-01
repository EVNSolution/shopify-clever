import { redirect } from "react-router";

import { fetchDeliveryDrivers } from "./drivers.server";
import { fetchDeliveryOrders } from "./orders.server";
import {
  deleteDeliveryRouteGroup,
  fetchDeliveryRouteGroupDetail,
  previewDeliveryRouteGroupOptimization,
  saveDeliveryRouteGroupDraft,
} from "./route-groups.server";
import {
  assignDeliveryRoutePlanDriver,
  deleteDeliveryRoutePlan,
  fetchDeliveryRoutePlanDetail,
} from "./route-plans.server";
import {
  firstArray,
  getRouteGroupChildRoutePlanId,
  getRouteGroupChildRouteName,
  numberOrUndefined,
  readRouteOptimizedSnapshot,
  textOrUndefined,
} from "./route-helpers";
import { routeGroupChildPath } from "./route-paths";
import { fetchShopifyDepartureLocation } from "../locations/shopify-locations.server";
import { authenticate } from "../../shopify.server";

function roundPerfDuration(duration) {
  return Number(duration.toFixed(2));
}

function getRouteDetailPerfNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function logRouteDetailPerformance(name, metric = {}) {
  if (typeof window !== "undefined") return;

  console.info(name, {
    measuredAt: new Date().toISOString(),
    ...metric,
  });
}

function isFiniteCoordinate(value) {
  return Number.isFinite(Number(value));
}

function hasLngLatPair(value) {
  return Array.isArray(value) && isFiniteCoordinate(value[0]) && isFiniteCoordinate(value[1]);
}

function countLngLatPairs(value) {
  if (!Array.isArray(value)) return 0;
  if (hasLngLatPair(value)) return 1;
  return value.reduce((total, entry) => total + countLngLatPairs(entry), 0);
}

function hasRouteStopCoordinates(stop) {
  if (hasLngLatPair(stop?.coordinates)) return true;

  return (
    isFiniteCoordinate(stop?.latitude ?? stop?.coordinates?.latitude) &&
    isFiniteCoordinate(stop?.longitude ?? stop?.coordinates?.longitude)
  );
}

function hasRouteStopPointCoordinates(routeStopPoint) {
  return hasLngLatPair(routeStopPoint?.inputCoordinates) || hasLngLatPair(routeStopPoint?.snappedCoordinates);
}

function findRouteStopPointForMarker(stop, routeStopPoints) {
  if (!Array.isArray(routeStopPoints)) return null;

  return routeStopPoints.find((point) => (
    (point.deliveryStopId && stop?.deliveryStopId && point.deliveryStopId === stop.deliveryStopId) ||
    point.shopifyOrderGid === stop?.shopifyOrderGid
  )) ?? null;
}

function countRouteGeometryCoordinates(routeGeometry) {
  const geometry = routeGeometry?.geometry ?? routeGeometry;
  return countLngLatPairs(geometry?.coordinates);
}

function summarizeRouteMarkerData(detail, currentRoutePlanId) {
  const routePlanId = textOrUndefined(detail?.routePlanId ?? detail?.routePlan?.id);
  const routeStopPoints = Array.isArray(detail?.routeStopPoints) ? detail.routeStopPoints : [];
  const stops = Array.isArray(detail?.stops) ? detail.stops : [];
  let markerCandidateStopCount = 0;
  let stopsMatchedToStopPoints = 0;
  let stopsWithCoordinates = 0;

  for (const stop of stops) {
    const hasStopCoordinates = hasRouteStopCoordinates(stop);
    const routeStopPoint = findRouteStopPointForMarker(stop, routeStopPoints);
    if (hasStopCoordinates) stopsWithCoordinates += 1;
    if (routeStopPoint) stopsMatchedToStopPoints += 1;
    if (hasStopCoordinates || hasRouteStopPointCoordinates(routeStopPoint)) {
      markerCandidateStopCount += 1;
    }
  }

  return {
    routePlanId,
    isCurrent: Boolean(routePlanId && routePlanId === currentRoutePlanId),
    stopCount: stops.length,
    stopsWithCoordinates,
    routeStopPointCount: routeStopPoints.length,
    routeStopPointsWithCoordinates: routeStopPoints.filter(hasRouteStopPointCoordinates).length,
    stopsMatchedToStopPoints,
    markerCandidateStopCount,
    hasRouteGeometry: Boolean(detail?.routeGeometry),
    routeGeometryCoordinateCount: countRouteGeometryCoordinates(detail?.routeGeometry),
    hasRouteMetrics: Boolean(detail?.routeMetrics),
  };
}

function logRouteMarkerDataDiagnostics({ routeChildDetails, routeGroupId, routeId }) {
  const childSummaries = routeChildDetails.map((detail) => summarizeRouteMarkerData(detail, routeId));
  logRouteDetailPerformance("routes.detail.loader.marker_data", {
    routeId,
    routeGroupId,
    childRouteCount: childSummaries.length,
    current: childSummaries.find((summary) => summary.isCurrent) ?? null,
    children: childSummaries,
  });
}

export function cleanRoutePathParam(value) {
  return textOrUndefined(value)?.split(/[?&]/)[0];
}

function getRouteGroupIdHint(request) {
  const url = new URL(request.url);
  return cleanRoutePathParam(url.searchParams.get("routeGroupId") ?? url.searchParams.get("groupId"));
}


function attachDeliveryOrderItemsToRouteDetails(routeDetails, orders) {
  const orderByKey = buildDeliveryOrderLookup(orders);
  if (orderByKey.size === 0) return routeDetails;

  return routeDetails.map((detail) => ({
    ...detail,
    stops: attachDeliveryOrderItemsToStops(detail.stops, orderByKey),
  }));
}

function attachDeliveryOrderItemsToStops(stops, orderByKey) {
  if (!Array.isArray(stops) || orderByKey.size === 0) return stops;

  return stops.map((stop) => {
    const order = getDeliveryOrderForStop(stop, orderByKey);
    const lineItems = getDeliveryOrderLineItems(order);
    return lineItems ? { ...stop, lineItems: stop?.lineItems ?? lineItems } : stop;
  });
}

function buildDeliveryOrderLookup(orders) {
  const orderByKey = new Map();
  for (const order of orders ?? []) {
    addOrderLookupKey(orderByKey, order?.id, order);
    addOrderLookupKey(orderByKey, order?.orderId, order);
    addOrderLookupKey(orderByKey, order?.name, order);
    addOrderLookupKey(orderByKey, order?.shopifyOrderGid, order);
    addOrderLookupKey(orderByKey, order?.shopifyOrderLegacyId, order);
    addOrderLookupKey(orderByKey, order?.legacyResourceId, order);
  }
  return orderByKey;
}

function addOrderLookupKey(orderByKey, value, order) {
  const key = textOrUndefined(value);
  if (!key) return;
  orderByKey.set(key, order);
  if (key.startsWith("#")) orderByKey.set(key.slice(1), order);
}

function getDeliveryOrderForStop(stop, orderByKey) {
  const keys = [
    stop?.orderId,
    stop?.orderName,
    stop?.sourceOrderId,
    stop?.shopifyOrderGid,
    stop?.shopifyOrderLegacyId,
    stop?.legacyResourceId,
  ];
  for (const key of keys) {
    const order = orderByKey.get(textOrUndefined(key)) ?? orderByKey.get(textOrUndefined(key)?.replace(/^#/, ""));
    if (order) return order;
  }
  return null;
}

function getDeliveryOrderLineItems(order) {
  const lineItems = order?.items ?? order?.lineItems ?? order?.shopifyOrderSnapshot?.lineItems ?? order?.rawPayload?.lineItems;
  if (Array.isArray(lineItems)) return lineItems;
  if (Array.isArray(lineItems?.nodes)) return lineItems.nodes;
  if (Array.isArray(lineItems?.edges)) return lineItems.edges.map((edge) => edge?.node).filter(Boolean);
  return null;
}

function getRouteGroupChildRoutePlan(routeGroup, child, routePlanId, index, stops) {
  const routePlan = child?.routePlan && typeof child.routePlan === "object" ? child.routePlan : {};
  return {
    ...routePlan,
    id: textOrUndefined(routePlan.id) ?? routePlanId,
    name: getRouteGroupChildRouteName(routeGroup, child, routePlan, index),
    status: textOrUndefined(routePlan.status ?? child?.status ?? child?.displayStatus) ?? "DRAFT",
    driverId: textOrUndefined(routePlan.driverId ?? child?.driverId) ?? null,
    driver: routePlan.driver ?? (child?.driverName ? { displayName: child.driverName } : null),
    stopsCount: numberOrUndefined(routePlan.stopsCount ?? child?.stopsCount) ?? stops.length,
    routeScope: routePlan.routeScope ?? child?.routeScope,
    deliveryDate: routePlan.deliveryDate ?? child?.deliveryDate,
    planDate: routePlan.planDate ?? child?.planDate,
    routeGroupingChild: {
      ...(routePlan.routeGroupingChild ?? {}),
      groupingId: textOrUndefined(routePlan.routeGroupingChild?.groupingId ?? child?.groupingId ?? child?.routeGroupId) ?? null,
    },
  };
}

export function buildRouteGroupChildDetails(routeGroup) {
  return (routeGroup?.children ?? [])
    .map((child, index) => {
      const routePlanId = getRouteGroupChildRoutePlanId(child);
      if (!routePlanId) return null;

      const routePlan = child?.routePlan ?? {};
      const stops = firstArray(child?.stops, child?.routeStops, child?.assignments, routePlan?.stops);
      const optimized = readRouteOptimizedSnapshot(child?.optimized ?? routePlan?.optimized);
      return {
        routeGeometry: child?.routeGeometry ?? routePlan?.routeGeometry ?? optimized?.routeGeometry ?? null,
        routeMetrics: child?.routeMetrics ?? routePlan?.routeMetrics ?? null,
        routePlan: getRouteGroupChildRoutePlan(routeGroup, child, routePlanId, index, stops),
        routePlanId,
        routeStopPoints: firstArray(child?.routeStopPoints, routePlan?.routeStopPoints, optimized?.routeStopPoints),
        stops,
      };
    })
    .filter(Boolean);
}

function mergeRouteGroupChildDetail(childDetails, currentDetail) {
  const routePlanId = getRouteGroupChildRoutePlanId(currentDetail);
  if (!routePlanId) return childDetails;

  let didReplace = false;
  const mergedDetails = childDetails.map((detail) => {
    if (getRouteGroupChildRoutePlanId(detail) !== routePlanId) return detail;
    didReplace = true;
    const routePlan = {
      ...(detail.routePlan ?? {}),
      ...(currentDetail.routePlan ?? {}),
      name: detail.routePlan?.name ?? currentDetail.routePlan?.name,
    };
    return {
      ...detail,
      ...currentDetail,
      routePlan,
      routePlanId,
    };
  });

  return didReplace ? mergedDetails : [currentDetail, ...mergedDetails];
}

function getRedirectSearch(request, deletedKeys = []) {
  const url = new URL(request.url);
  for (const key of deletedKeys) url.searchParams.delete(key);
  const search = url.searchParams.toString();
  return `${search ? `?${search}` : ""}${url.hash}`;
}

export const routeDetailLoader = async ({ params, request }) => {
  const routeId = cleanRoutePathParam(params.routeId);
  const routeGroupIdHint = getRouteGroupIdHint(request);
  if (routeGroupIdHint) {
    return redirect(`${routeGroupChildPath(routeGroupIdHint, routeId)}${getRedirectSearch(request, ["routeGroupId", "groupId"])}`);
  }

  return loadRoutePlanDetail(request, routeId);
};

export async function loadRoutePlanDetail(request, routeId, routeGroupIdHint = null) {
  const loaderStartedAt = getRouteDetailPerfNow();
  const { admin, session } = await authenticate.admin(request);
  const shopifyShopCacheKey = session?.shop;

  if (routeGroupIdHint) {
    const primaryDataStartedAt = getRouteDetailPerfNow();
    const [routeGroupData, departureLocationData, driverData, orderData] = await Promise.all([
      fetchDeliveryRouteGroupDetail(request, routeGroupIdHint, { cacheKey: shopifyShopCacheKey }),
      fetchShopifyDepartureLocation(admin, { cacheKey: shopifyShopCacheKey }),
      fetchDeliveryDrivers(request, {}),
      fetchDeliveryOrders(request, {}, { cacheKey: shopifyShopCacheKey }),
    ]);
    const primaryDataMs = roundPerfDuration(getRouteDetailPerfNow() - primaryDataStartedAt);
    const routeChildDetails = attachDeliveryOrderItemsToRouteDetails(
      buildRouteGroupChildDetails(routeGroupData.routeGroup),
      orderData.orders,
    );
    const currentChildDetail = routeChildDetails.find((detail) => textOrUndefined(detail.routePlanId) === routeId) ?? null;

    logRouteMarkerDataDiagnostics({
      routeChildDetails,
      routeGroupId: routeGroupIdHint,
      routeId,
    });

    logRouteDetailPerformance("routes.detail.loader", {
      totalMs: roundPerfDuration(getRouteDetailPerfNow() - loaderStartedAt),
      primaryDataMs,
      routeId,
      routeGroupId: routeGroupIdHint,
      routeGroupBranchCount: routeGroupData.routeGroup?.branches?.length ?? 0,
      routeGroupChildCount: routeGroupData.routeGroup?.children?.length ?? 0,
      stopCount: currentChildDetail?.stops?.length ?? 0,
      driverCount: driverData.drivers?.length ?? 0,
      errorCount: (routeGroupData.errors?.length ?? 0) + (driverData.errors?.length ?? 0),
    });

    return {
      routePlan: currentChildDetail?.routePlan ?? null,
      routeGeometry: currentChildDetail?.routeGeometry ?? null,
      routeMetrics: currentChildDetail?.routeMetrics ?? null,
      routeStopPoints: currentChildDetail?.routeStopPoints ?? [],
      stops: currentChildDetail?.stops ?? [],
      errors: [
        ...(routeGroupData.errors ?? []),
        ...(driverData.errors ?? []),
      ],
      childRouteDetails: routeChildDetails,
      currentDepartureLocation: departureLocationData.departureLocation,
      drivers: driverData.drivers,
      routeGroup: routeGroupData.routeGroup,
    };
  }

  const primaryDataStartedAt = getRouteDetailPerfNow();
  const [routePlanData, departureLocationData, driverData, orderData] = await Promise.all([
    fetchDeliveryRoutePlanDetail(request, routeId, {
      cacheKey: shopifyShopCacheKey,
    }),
    fetchShopifyDepartureLocation(admin, { cacheKey: shopifyShopCacheKey }),
    fetchDeliveryDrivers(request, {}),
    fetchDeliveryOrders(request, {}, { cacheKey: shopifyShopCacheKey }),
  ]);
  const primaryDataMs = roundPerfDuration(getRouteDetailPerfNow() - primaryDataStartedAt);
  const routeGroupId = textOrUndefined(routePlanData.routePlan?.routeGroupingChild?.groupingId);
  const routeGroupData = routeGroupId
    ? await fetchDeliveryRouteGroupDetail(request, routeGroupId, { cacheKey: shopifyShopCacheKey })
    : { errors: [], routeGroup: null };
  const currentRouteDetail = {
    routeGeometry: routePlanData.routeGeometry,
    routeMetrics: routePlanData.routeMetrics ?? null,
    routePlan: routePlanData.routePlan,
    routePlanId: routePlanData.routePlan?.id ?? routeId,
    routeStopPoints: routePlanData.routeStopPoints ?? [],
    stops: attachDeliveryOrderItemsToStops(routePlanData.stops ?? [], buildDeliveryOrderLookup(orderData.orders)),
  };
  const routeChildDetails = routeGroupData.routeGroup
    ? mergeRouteGroupChildDetail(
        attachDeliveryOrderItemsToRouteDetails(buildRouteGroupChildDetails(routeGroupData.routeGroup), orderData.orders),
        currentRouteDetail,
      )
    : [currentRouteDetail];
  const currentChildDetail = routeChildDetails.find((detail) => textOrUndefined(detail.routePlanId) === routeId) ?? null;

  logRouteMarkerDataDiagnostics({
    routeChildDetails,
    routeGroupId,
    routeId,
  });

  logRouteDetailPerformance("routes.detail.loader", {
    totalMs: roundPerfDuration(getRouteDetailPerfNow() - loaderStartedAt),
    primaryDataMs,
    routeId,
    routeGroupId,
    routeGroupBranchCount: routeGroupData.routeGroup?.branches?.length ?? 0,
    routeGroupChildCount: routeGroupData.routeGroup?.children?.length ?? 0,
    stopCount: routePlanData.stops?.length ?? 0,
    driverCount: driverData.drivers?.length ?? 0,
    errorCount:
      (routePlanData.errors?.length ?? 0) +
      (routeGroupData.errors?.length ?? 0) +
      (driverData.errors?.length ?? 0),
  });

  return {
    ...routePlanData,
    routePlan: currentChildDetail?.routePlan ?? routePlanData.routePlan,
    stops: currentChildDetail?.stops ?? routePlanData.stops ?? [],
    errors: [
      ...(routePlanData.errors ?? []),
      ...(routeGroupData.errors ?? []),
      ...(driverData.errors ?? []),
    ],
    childRouteDetails: routeChildDetails,
    currentDepartureLocation: departureLocationData.departureLocation,
    drivers: driverData.drivers,
    routeGroup: routeGroupData.routeGroup,
  };
}

export const routeDetailAction = async ({ params, request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const routeId = cleanRoutePathParam(params.routeId);
  const routeGroupIdFromParams = cleanRoutePathParam(params.routeGroupId);
  const intent = formData.get("_intent");
  const routeGroupId = textOrUndefined(formData.get("routeGroupId"));
  const shopifySessionToken = formData.get("shopifySessionToken");

  logRouteDetailPerformance("routes.detail.action", {
    intent,
    routeGroupId: routeGroupIdFromParams ?? routeGroupId,
    routeId,
  });

  if (intent === "deleteRoute") {
    if (routeGroupIdFromParams && !routeId) {
      return deleteDeliveryRouteGroup(request, routeGroupIdFromParams, { sessionToken: shopifySessionToken });
    }
    return deleteDeliveryRoutePlan(request, routeId, { sessionToken: shopifySessionToken });
  }

  if (intent === "saveRouteDriver") {
    const driverId = textOrUndefined(formData.get("driverId")) ?? null;

    return assignDeliveryRoutePlanDriver(
      request,
      routeId,
      { driverId },
      { sessionToken: shopifySessionToken },
    );
  }

  if (intent === "previewRouteOptimization") {
    const draft = readRouteDraftPayload(formData.get("draft"));
    const result = await previewDeliveryRouteGroupOptimization(
      request,
      routeGroupId,
      draft,
      { sessionToken: shopifySessionToken },
    );
    logRouteGroupActionResult("routes.detail.action.previewRouteOptimization", routeId, routeGroupId, result);
    return result;
  }

  if (intent === "saveRouteDraft") {
    const draft = readRouteDraftPayload(formData.get("draft"));
    logRouteDetailPerformance("routes.detail.action.saveRouteDraft.request", {
      routeGroupId,
      routeId,
      routeCount: draft.routes.length,
      existingRoutePlanCount: draft.routes.filter((route) => route.routePlanId).length,
      optimizedExistingRoutePlanCount: draft.routes.filter((route) => route.routePlanId && route.optimized !== undefined).length,
      optimizedRouteCount: draft.routes.filter((route) => route.optimized !== undefined).length,
      orderCounts: draft.routes.map((route) => route.orderIds.length),
      routeKeys: draft.routes.map((route) => route.routeKey).filter(Boolean),
      tempRouteCount: draft.routes.filter((route) => route.tempId).length,
    });
    const result = await saveDeliveryRouteGroupDraft(
      request,
      routeGroupId,
      draft,
      { sessionToken: shopifySessionToken },
    );
    logRouteGroupActionResult("routes.detail.action.saveRouteDraft", routeId, routeGroupId, result);
    return result;
  }

  return {
    routePlan: null,
    stops: [],
    errors: [{ message: "지원하지 않는 route 작업입니다." }],
  };
};

function logRouteGroupActionResult(name, routeId, routeGroupId, result) {
  const routeGroup = result?.routeGroup;
  logRouteDetailPerformance(name, {
    routeId,
    routeGroupId,
    branchCount: routeGroup?.branches?.length ?? 0,
    childCount: routeGroup?.children?.length ?? 0,
    childRoutePlanIds: (routeGroup?.children ?? []).map(getRouteGroupChildRoutePlanId).filter(Boolean),
    errorCount: result?.errors?.length ?? 0,
  });
}

function readRouteDraftPayload(value) {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    if (!Array.isArray(parsed?.routes)) return { routes: [] };
    return {
      routes: parsed.routes.map((route) => ({
        color: textOrUndefined(route?.color) ?? null,
        label: textOrUndefined(route?.label) ?? null,
        ...(route?.optimized === undefined ? {} : { optimized: route?.optimized && typeof route.optimized === "object" ? route.optimized : null }),
        orderIds: Array.isArray(route?.orderIds) ? route.orderIds.map(textOrUndefined).filter(Boolean) : [],
        routeIdx: Number.isFinite(Number(route?.routeIdx)) ? Number(route.routeIdx) : undefined,
        routeKey: textOrUndefined(route?.routeKey),
        routePlanId: textOrUndefined(route?.routePlanId) ?? null,
        sortOrder: Number.isFinite(Number(route?.sortOrder)) ? Number(route.sortOrder) : undefined,
        tempId: textOrUndefined(route?.tempId) ?? null,
      })),
      mode: textOrUndefined(parsed.mode),
    };
  } catch {
    return { routes: [] };
  }
}
