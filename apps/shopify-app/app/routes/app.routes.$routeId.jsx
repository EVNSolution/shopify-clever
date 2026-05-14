import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useFetcher, useLoaderData, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { formatDeliveryScopeLabel } from "../features/delivery/delivery-labels";
import { fetchDeliveryDrivers } from "../features/delivery/drivers.server";
import { fetchDeliveryOrders } from "../features/delivery/orders.server";
import {
  assignDeliveryRoutePlanDriver,
  fetchDeliveryRoutePlanDetail,
  updateDeliveryRoutePlanStops,
} from "../features/delivery/route-plans.server";
import { installMissingMapImageFallback } from "../features/maps/maplibre-missing-images";
import { installPmtilesProtocol } from "../features/maps/pmtiles-protocol";
import { fetchShopifyDepartureLocation } from "../features/locations/shopify-locations.server";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: "/vendor/maplibre-gl.css" }];

const OPENFREEMAP_STYLE_URL = "/vendor/openfreemap-tomatono-lite.json";
const DEFAULT_CENTER = [-79.3832, 43.6532];
const MAP_RECOVERY_DELAY_MS = 2500;
const MAX_MAP_RECOVERY_ATTEMPTS = 3;
const ROUTE_DETAIL_ROUTE_SOURCE_ID = "route-detail-osrm-route";
const ROUTE_DETAIL_ROUTE_LAYER_ID = "route-detail-osrm-route-line";
const ROUTE_STOP_POINT_MIN_DISTANCE_METERS = 1;

const routesDetailPageStyle = {
  padding: "8px 12px 12px",
};

const routesDetailContentStyle = {
  display: "grid",
  gap: "12px",
};

const routesDetailHeaderStyle = {
  display: "grid",
  gap: "4px",
};

const routeDetailPageNavStyle = {
  alignItems: "center",
  display: "flex",
  justifyContent: "flex-start",
};

const routeDetailTitleRowStyle = {
  alignItems: "flex-start",
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  justifyContent: "space-between",
  overflowX: "visible",
  overflowY: "visible",
  width: "100%",
};

const routeDetailTitleIdentityStyle = {
  alignItems: "center",
  display: "flex",
  flex: "1 1 260px",
  flexWrap: "nowrap",
  gap: "8px",
  maxWidth: "100%",
  minWidth: 0,
};

const routesDetailTitleStyle = {
  margin: 0,
  fontFamily: "inherit",
  fontSize: "20px",
  fontWeight: "600",
  lineHeight: "28px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routeDetailSummaryMetricsStyle = {
  alignItems: "center",
  display: "flex",
  flex: "0 0 auto",
  flexWrap: "nowrap",
  gap: "12px",
  justifyContent: "flex-start",
  minWidth: 0,
  whiteSpace: "nowrap",
};

const routeDetailTitleMetricStyle = {
  display: "grid",
  gap: "1px",
  maxWidth: "220px",
  minWidth: "72px",
  textAlign: "left",
};

const routeDetailTitleMetricLabelStyle = {
  color: "#616161",
  fontSize: "11px",
  fontWeight: 550,
  lineHeight: 1.2,
};

const routeDetailTitleMetricValueStyle = {
  color: "#303030",
  fontSize: "13px",
  fontWeight: 650,
  lineHeight: 1.25,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routeDetailDriverControlStyle = {
  alignItems: "center",
  display: "flex",
  flex: "0 0 auto",
  flexWrap: "nowrap",
  gap: "8px",
  justifyContent: "flex-start",
};

const routeDetailDriverLabelStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
  whiteSpace: "nowrap",
};

const routeDetailDriverSelectStyle = {
  background: "#ffffff",
  border: "1px solid #c9c9c9",
  borderRadius: "8px",
  color: "#303030",
  fontFamily: "inherit",
  fontSize: "13px",
  minHeight: "30px",
  minWidth: "220px",
  padding: "4px 9px",
};

const routeDetailDriverSaveButtonStyle = {
  background: "#303030",
  borderColor: "#303030",
  borderRadius: "8px",
  borderStyle: "solid",
  borderWidth: "1px",
  color: "#ffffff",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.2,
  minHeight: "30px",
  padding: "4px 10px",
  whiteSpace: "nowrap",
};

const routeDetailDriverDisabledSaveButtonStyle = {
  ...routeDetailDriverSaveButtonStyle,
  background: "#f1f1f1",
  borderColor: "#d6d6d6",
  color: "#8a8a8a",
  cursor: "not-allowed",
};

const routesDetailDescriptionStyle = {
  margin: 0,
  color: "#616161",
  fontSize: "13px",
  lineHeight: "20px",
};

const routeStatusBadgeStyle = {
  background: "#fff1b8",
  borderRadius: "999px",
  color: "#4f3f00",
  display: "inline-flex",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.2,
  padding: "4px 9px",
};

const routeDetailBackButtonStyle = {
  alignItems: "center",
  background: "#ffffff",
  borderColor: "#c9c9c9",
  borderRadius: "8px",
  borderStyle: "solid",
  borderWidth: "1px",
  color: "#303030",
  cursor: "pointer",
  display: "inline-flex",
  flex: "0 0 auto",
  fontSize: "13px",
  fontWeight: 650,
  gap: "6px",
  lineHeight: 1.2,
  minHeight: "30px",
  padding: "5px 10px 5px 8px",
};

const routeDetailBackIconStyle = {
  display: "inline-flex",
  height: "16px",
  width: "16px",
};

const routesDetailCardStyle = {
  background: "#ffffff",
  borderColor: "#d6d6d6",
  borderRadius: "12px",
  borderStyle: "solid",
  borderWidth: "1px",
  overflow: "hidden",
};

const routeDetailHeaderInfoWrapStyle = {
  display: "flex",
  flex: "1 1 520px",
  justifyContent: "flex-end",
  minWidth: "min(520px, 100%)",
  width: "100%",
};

const routeDetailMapFrameStyle = {
  height: "440px",
  overflow: "hidden",
  position: "relative",
};

const routeDetailHeaderInfoCardStyle = {
  alignItems: "center",
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "12px",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
  display: "flex",
  flexWrap: "nowrap",
  gap: "18px",
  maxWidth: "780px",
  minHeight: "44px",
  minWidth: 0,
  overflowX: "auto",
  padding: "6px 0 6px 14px",
  textAlign: "left",
  whiteSpace: "nowrap",
  width: "100%",
};

const routeDetailMapCanvasStyle = {
  height: "100%",
  minHeight: "440px",
  width: "100%",
};

const routeDetailMapToolbarStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  left: "12px",
  position: "absolute",
  top: "12px",
  zIndex: 2,
};

const routeDetailMapToolbarButtonStyle = {
  alignItems: "center",
  background: "rgba(255, 255, 255, 0.94)",
  border: "1px solid #c9c9c9",
  borderRadius: "8px",
  color: "#303030",
  cursor: "pointer",
  display: "flex",
  height: "34px",
  justifyContent: "center",
  padding: 0,
  width: "34px",
};

const routeDetailMapToolbarIconStyle = {
  display: "block",
  height: "16px",
  width: "16px",
};

const routeDetailMapStatusStyle = {
  alignItems: "center",
  background: "rgba(255, 255, 255, 0.94)",
  border: "1px solid #d6d6d6",
  borderRadius: "999px",
  color: "#303030",
  display: "flex",
  fontSize: "12px",
  fontWeight: 700,
  height: "24px",
  justifyContent: "center",
  width: "24px",
};

const routeDetailStopsHeaderStyle = {
  alignItems: "center",
  borderBottomColor: "#ececec",
  borderBottomStyle: "solid",
  borderBottomWidth: "1px",
  display: "flex",
  gap: "6px",
  justifyContent: "space-between",
  padding: "6px 10px",
};

const routeDetailStopsHeaderActionsStyle = {
  alignItems: "center",
  display: "flex",
  gap: "6px",
};

const routeDetailStopsTitleStyle = {
  color: "#303030",
  fontSize: "14px",
  fontWeight: 650,
};

const routesDetailTableFrameStyle = {
  overflowX: "auto",
};

const routesDetailTableStyle = {
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: "1040px",
  tableLayout: "fixed",
  width: "100%",
};

const routeDetailColumnWidths = [
  "64px",
  "96px",
  "128px",
  "420px",
  "112px",
  "112px",
  "196px",
  "104px",
];

const routesDetailHeaderCellStyle = {
  background: "#f7f7f7",
  borderBottomColor: "#d6d6d6",
  borderBottomStyle: "solid",
  borderBottomWidth: "1px",
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.25,
  padding: "9px 10px",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const routesDetailCellStyle = {
  borderBottomColor: "#ececec",
  borderBottomStyle: "solid",
  borderBottomWidth: "1px",
  color: "#303030",
  fontSize: "13px",
  lineHeight: 1.35,
  overflow: "hidden",
  padding: "10px",
  textOverflow: "ellipsis",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const routeStopSequenceCellStyle = {
  ...routesDetailCellStyle,
  alignItems: "center",
  display: "flex",
  gap: "8px",
  justifyContent: "flex-start",
  overflow: "visible",
  textOverflow: "clip",
};

const routeStopDragHandleStyle = {
  alignItems: "center",
  color: "#8a8a8a",
  cursor: "grab",
  display: "inline-flex",
  fontSize: "14px",
  fontWeight: 650,
  height: "20px",
  justifyContent: "center",
  lineHeight: 1,
  width: "18px",
};

const routeStopSequenceActionButtonStyle = {
  background: "#ffffff",
  borderColor: "#c9c9c9",
  borderRadius: "8px",
  borderStyle: "solid",
  borderWidth: "1px",
  color: "#303030",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.2,
  minHeight: "28px",
  padding: "3px 9px",
};

const routeStopSequencePrimaryButtonStyle = {
  ...routeStopSequenceActionButtonStyle,
  background: "#303030",
  borderColor: "#303030",
  color: "#ffffff",
};

const routeStopDraggingRowStyle = {
  opacity: 0.55,
};

const routeDetailCandidatePanelStyle = {
  borderTop: "1px solid #ececec",
  display: "grid",
  gap: "8px",
  padding: "10px 12px",
};

const routeDetailCandidateListStyle = {
  display: "grid",
  gap: "6px",
};

const routeDetailCandidateItemStyle = {
  alignItems: "center",
  background: "#fafafa",
  border: "1px solid #e3e3e3",
  borderRadius: "8px",
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "minmax(0, 96px) minmax(0, 128px) minmax(0, 1fr) auto",
  padding: "8px",
};

const routeDetailCandidateTextStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routesDetailEmptyCellStyle = {
  ...routesDetailCellStyle,
  color: "#616161",
  padding: "18px 12px",
  textAlign: "center",
};

const routeDetailErrorStyle = {
  background: "#fff4f4",
  borderColor: "#ffd6d6",
  borderRadius: "10px",
  borderStyle: "solid",
  borderWidth: "1px",
  color: "#8e1f0b",
  fontSize: "13px",
  lineHeight: 1.4,
  padding: "10px 12px",
};


export const loader = async ({ params, request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopifyShopCacheKey = session?.shop;
  const [routePlanData, departureLocationData, driverData] = await Promise.all([
    fetchDeliveryRoutePlanDetail(request, params.routeId, {
      cacheKey: shopifyShopCacheKey,
    }),
    fetchShopifyDepartureLocation(admin, { cacheKey: shopifyShopCacheKey }),
    fetchDeliveryDrivers(request, {}),
  ]);
  const routeDeliveryDate = getRouteDeliveryDate(routePlanData.routePlan);
  const sameDateOrderData = routeDeliveryDate
    ? await fetchDeliveryOrders(
        request,
        { deliveryDate: routeDeliveryDate },
        { cacheKey: shopifyShopCacheKey },
      )
    : { orders: [], errors: [] };

  return {
    ...routePlanData,
    errors: [
      ...(routePlanData.errors ?? []),
      ...(driverData.errors ?? []),
      ...(sameDateOrderData.errors ?? []),
    ],
    currentDepartureLocation: departureLocationData.departureLocation,
    drivers: driverData.drivers,
    sameDateOrders: sameDateOrderData.orders,
  };
};

export const action = async ({ params, request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_intent");
  const shopifySessionToken = formData.get("shopifySessionToken");

  if (intent === "saveRouteDriver") {
    const driverId = textOrUndefined(formData.get("driverId")) ?? null;

    return assignDeliveryRoutePlanDriver(
      request,
      params.routeId,
      { driverId },
      { sessionToken: shopifySessionToken },
    );
  }

  if (intent !== "saveRouteStops") {
    return {
      routePlan: null,
      stops: [],
      errors: [{ message: "지원하지 않는 route stop 작업입니다." }],
    };
  }

  const stopsPayload = parseRouteStopsPayload(formData.get("stops"));

  if (stopsPayload.length === 0) {
    return {
      routePlan: null,
      stops: [],
      errors: [{ message: "저장할 route stop이 없습니다." }],
    };
  }

  const result = await updateDeliveryRoutePlanStops(
    request,
    params.routeId,
    { stops: stopsPayload },
    { sessionToken: shopifySessionToken },
  );

  return result;
};

function parseRouteStopsPayload(value) {
  try {
    const parsedStops = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsedStops)) return [];

    return parsedStops.flatMap((stop, index) => {
      const shopifyOrderGid = textOrUndefined(stop?.shopifyOrderGid);
      if (!shopifyOrderGid) return [];

      return [{
        deliveryStopId: textOrUndefined(stop?.deliveryStopId) ?? null,
        shopifyOrderGid,
        sequence: numberOrUndefined(stop?.sequence) ?? index + 1,
      }];
    });
  } catch {
    return [];
  }
}

function formatRouteValues(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "—";
}

function formatRouteDeliveryScope(routePlan) {
  return formatDeliveryScopeLabel({
    deliveryDate: routePlan?.routeScope?.deliveryDate ?? routePlan?.deliveryDate ?? routePlan?.planDate,
    timeWindowEnd: routePlan?.routeScope?.timeWindowEnd ?? routePlan?.timeWindowEnd,
    timeWindowStart: routePlan?.routeScope?.timeWindowStart ?? routePlan?.timeWindowStart,
  }) ?? "—";
}

function createRouteDetailHref(routeId) {
  return `/app/routes/${routeId}`;
}

function getRouteDeliveryDate(routePlan) {
  return textOrUndefined(
    routePlan?.routeScope?.deliveryDate ?? routePlan?.deliveryDate ?? routePlan?.planDate,
  );
}

function buildRouteDetail(routePlan) {
  if (!routePlan) {
    return {
      route: "Route not found",
      status: "Unavailable",
      orders: 0,
      coordinates: "0/0",
      missingCoordinates: 0,
      deliveryArea: "—",
      deliveryDate: "—",
    };
  }

  const stopsCount = routePlan.stopsCount ?? 0;
  const missingCoordinates = routePlan.missingCoordinates ?? 0;
  const locatedCount = Math.max(stopsCount - missingCoordinates, 0);

  return {
    route: routePlan.name ?? routePlan.id,
    status: routePlan.status ?? "DRAFT",
    orders: stopsCount,
    coordinates: `${locatedCount}/${stopsCount}`,
    missingCoordinates,
    deliveryArea: formatRouteValues(routePlan.deliveryAreas),
    deliveryDate: formatRouteDeliveryScope(routePlan),
  };
}

function getRouteDriverId(routePlan) {
  return textOrUndefined(routePlan?.driverId ?? routePlan?.driver?.id) ?? "";
}

function buildRouteDriverOptions(drivers, currentDriver) {
  const seenDriverIds = new Set();
  const allDrivers = [];

  for (const driver of [currentDriver, ...(Array.isArray(drivers) ? drivers : [])]) {
    const driverId = textOrUndefined(driver?.id);
    if (!driverId || seenDriverIds.has(driverId)) continue;

    seenDriverIds.add(driverId);
    allDrivers.push(driver);
  }

  return allDrivers.map((driver) => {
    const displayName = textOrUndefined(driver?.displayName);
    const phone = textOrUndefined(driver?.phone);
    const authStatus = String(driver?.authStatus ?? "").toUpperCase();
    const status = String(driver?.status ?? "").toUpperCase();
    const isInvitePending = authStatus === "INVITE_PENDING" || status === "PENDING" || !driver?.authSubject;
    const label = [displayName ?? phone ?? "Unnamed driver", isInvitePending ? "Invite pending" : null]
      .filter(Boolean)
      .join(" · ");

    return {
      id: textOrUndefined(driver?.id) ?? "",
      label,
    };
  });
}

function buildDepartureLocation(routePlan, currentDepartureLocation) {
  const depotCoordinates = normalizeLngLat(
    routePlan?.depot?.latitude,
    routePlan?.depot?.longitude,
  );
  const currentCoordinates =
    currentDepartureLocation?.hasCoordinates &&
    Array.isArray(currentDepartureLocation.coordinates)
      ? normalizeLngLat(
        currentDepartureLocation.coordinates[1],
        currentDepartureLocation.coordinates[0],
      )
      : null;
  const coordinates = depotCoordinates ?? currentCoordinates;
  const name =
    textOrUndefined(routePlan?.depot?.name) ??
    textOrUndefined(currentDepartureLocation?.name) ??
    "Company location";
  const address =
    textOrUndefined(routePlan?.depot?.address) ??
    textOrUndefined(currentDepartureLocation?.address) ??
    "Company location";

  return {
    id: `${routePlan?.id ?? "route"}:departure`,
    name,
    address,
    coordinates,
    hasCoordinates: coordinates != null,
  };
}

function normalizeRouteStopCoordinates(stop) {
  if (Array.isArray(stop?.coordinates)) {
    return normalizeLngLat(stop.coordinates[1], stop.coordinates[0]);
  }

  return normalizeLngLat(
    stop?.latitude ?? stop?.coordinates?.latitude,
    stop?.longitude ?? stop?.coordinates?.longitude,
  );
}

function buildRouteStops(stops) {
  return resequenceRouteStops(stops.map((stop, index) => {
    const coordinates = normalizeRouteStopCoordinates(stop);
    const sequence = numberOrUndefined(stop.sequence);
    const stopNumber = Number.isInteger(sequence) && sequence > 0
      ? sequence
      : index + 1;

    return {
      id: stop.deliveryStopId ?? stop.shopifyOrderGid ?? `route-stop-${index + 1}`,
      deliveryStopId: textOrUndefined(stop.deliveryStopId) ?? null,
      shopifyOrderGid: textOrUndefined(stop.shopifyOrderGid),
      originalIndex: index,
      sortOrder: stopNumber,
      stop: stopNumber,
      order: stop.orderName ?? stop.shopifyOrderGid,
      recipient: stop.recipientName ?? "Unknown recipient",
      address: formatStopAddress(stop.address),
      status: stop.fulfillmentStatus ?? stop.status ?? "PENDING",
      payment: stop.paymentStatus ?? stop.financialStatus ?? "—",
      attributes: formatStopAttributes(stop.attributes),
      coordinatesLabel: coordinates != null ? "Yes" : "No",
      coordinates,
      hasCoordinates: coordinates != null,
    };
  }).sort((firstStop, secondStop) => (
    firstStop.sortOrder - secondStop.sortOrder || firstStop.originalIndex - secondStop.originalIndex
  )));
}

function resequenceRouteStops(routeStops) {
  return routeStops.map((stop, index) => ({
    ...stop,
    stop: index + 1,
  }));
}

function buildSameDateCandidateStops(sameDateOrders, routeStops, routeDeliveryDate) {
  if (!routeDeliveryDate) return [];

  const existingOrderIds = new Set(
    routeStops
      .map((stop) => textOrUndefined(stop.shopifyOrderGid))
      .filter(Boolean),
  );

  return (Array.isArray(sameDateOrders) ? sameDateOrders : [])
    .flatMap((order, index) => {
      const shopifyOrderGid = getSameDateOrderIdentity(order);
      const orderDeliveryDate = textOrUndefined(order?.deliveryDate);

      if (!shopifyOrderGid || orderDeliveryDate !== routeDeliveryDate) return [];
      if (existingOrderIds.has(shopifyOrderGid)) return [];

      return [buildRouteStopFromSameDateOrder(order, shopifyOrderGid, index)];
    });
}

function getSameDateOrderIdentity(order) {
  return textOrUndefined(order?.shopifyOrderGid) ?? textOrUndefined(order?.id);
}

function buildRouteStopFromSameDateOrder(order, shopifyOrderGid, index) {
  const coordinates = normalizeOrderCoordinates(order);

  return {
    id: `candidate:${shopifyOrderGid}`,
    deliveryStopId: null,
    shopifyOrderGid,
    originalIndex: index,
    sortOrder: Number.MAX_SAFE_INTEGER,
    stop: index + 1,
    order: textOrUndefined(order?.name) ?? shopifyOrderGid,
    recipient: textOrUndefined(order?.recipientName) ?? textOrUndefined(order?.customer) ?? "Unknown recipient",
    address: formatCandidateStopAddress(order),
    status: textOrUndefined(order?.fulfillmentStatus) ?? textOrUndefined(order?.status) ?? "PENDING",
    payment: textOrUndefined(order?.financialStatus) ?? textOrUndefined(order?.paymentStatus) ?? "—",
    attributes: formatStopAttributes(order?.attributes ?? order?.attributeList),
    coordinatesLabel: coordinates != null ? "Yes" : "No",
    coordinates,
    hasCoordinates: coordinates != null,
  };
}

function normalizeOrderCoordinates(order) {
  if (Array.isArray(order?.coordinates)) {
    return normalizeLngLat(order.coordinates[1], order.coordinates[0]);
  }

  return normalizeLngLat(
    order?.latitude ?? order?.coordinates?.latitude,
    order?.longitude ?? order?.coordinates?.longitude,
  );
}

function formatCandidateStopAddress(order) {
  if (typeof order?.address === "string" && order.address.trim()) {
    return order.address;
  }

  return formatStopAddress(order?.shippingAddress ?? order?.address);
}

function orderRouteStops(routeStops, routeStopOrderIds) {
  if (!Array.isArray(routeStopOrderIds) || routeStopOrderIds.length === 0) {
    return resequenceRouteStops(routeStops);
  }

  const orderRankById = new Map(routeStopOrderIds.map((stopId, index) => [stopId, index]));

  return resequenceRouteStops([...routeStops].sort((firstStop, secondStop) => {
    const firstRank = orderRankById.has(firstStop.id) ? orderRankById.get(firstStop.id) : Number.MAX_SAFE_INTEGER;
    const secondRank = orderRankById.has(secondStop.id) ? orderRankById.get(secondStop.id) : Number.MAX_SAFE_INTEGER;

    return firstRank - secondRank || firstStop.stop - secondStop.stop;
  }));
}

function reorderRouteStopIds(routeStopOrderIds, sourceStopId, targetStopId) {
  if (sourceStopId === targetStopId) return routeStopOrderIds;

  const nextRouteStopOrderIds = [...routeStopOrderIds];
  const sourceIndex = nextRouteStopOrderIds.indexOf(sourceStopId);
  const targetIndex = nextRouteStopOrderIds.indexOf(targetStopId);

  if (sourceIndex === -1 || targetIndex === -1) return routeStopOrderIds;

  const [sourceRouteStopId] = nextRouteStopOrderIds.splice(sourceIndex, 1);
  nextRouteStopOrderIds.splice(targetIndex, 0, sourceRouteStopId);

  return nextRouteStopOrderIds;
}

function formatStopAddress(address) {
  const parts = [
    address?.address1,
    address?.address2,
    address?.city,
    address?.province,
    address?.postalCode,
    address?.countryCode,
  ]
    .map(textOrUndefined)
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "No shipping address";
}

function formatStopAttributes(attributes) {
  if (typeof attributes === "string" && attributes.trim()) {
    return attributes;
  }

  if (!Array.isArray(attributes) || attributes.length === 0) return "—";

  return attributes
    .map((attribute) => {
      const key = textOrUndefined(attribute?.key);
      const value = textOrUndefined(attribute?.value);
      return key && value ? `${key}: ${value}` : null;
    })
    .filter(Boolean)
    .join(", ") || "—";
}

function textOrUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function numberOrUndefined(value) {
  if (value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isValidLatitude(latitude) {
  return typeof latitude === "number" && latitude >= -90 && latitude <= 90;
}

function isValidLongitude(longitude) {
  return typeof longitude === "number" && longitude >= -180 && longitude <= 180;
}

function normalizeLngLat(latitudeValue, longitudeValue) {
  const latitude = numberOrUndefined(latitudeValue);
  const longitude = numberOrUndefined(longitudeValue);

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }

  return [longitude, latitude];
}

function normalizeLngLatPair(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const longitude = numberOrUndefined(coordinates[0]);
  const latitude = numberOrUndefined(coordinates[1]);

  if (!isValidLongitude(longitude) || !isValidLatitude(latitude)) {
    return null;
  }

  return [longitude, latitude];
}

function areLngLatPairsEqual(firstCoordinates, secondCoordinates) {
  if (!firstCoordinates || !secondCoordinates) return false;

  return (
    Math.abs(firstCoordinates[0] - secondCoordinates[0]) < 0.000001 &&
    Math.abs(firstCoordinates[1] - secondCoordinates[1]) < 0.000001
  );
}

function calculateLngLatDistanceMeters(firstCoordinates, secondCoordinates) {
  if (!firstCoordinates || !secondCoordinates) return null;

  const earthRadiusMeters = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const firstLatitude = toRadians(firstCoordinates[1]);
  const secondLatitude = toRadians(secondCoordinates[1]);
  const deltaLatitude = toRadians(secondCoordinates[1] - firstCoordinates[1]);
  const deltaLongitude = toRadians(secondCoordinates[0] - firstCoordinates[0]);
  const halfChord =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(deltaLongitude / 2) ** 2;
  const distanceMeters = 2 * earthRadiusMeters * Math.asin(Math.sqrt(halfChord));

  return Math.round(distanceMeters * 100) / 100;
}

function getRouteMapLocations(departureLocation, routeStops) {
  return [
    ...(departureLocation?.hasCoordinates ? [departureLocation] : []),
    ...routeStops.filter((stop) => stop.hasCoordinates),
  ];
}

function getRouteMapCenter(departureLocation, routeStops) {
  return getRouteMapLocations(departureLocation, routeStops)[0]?.coordinates ?? DEFAULT_CENTER;
}

function buildRouteDetailRouteLineFeature(routeGeometry) {
  if (routeGeometry?.type !== "LineString" || !Array.isArray(routeGeometry.coordinates)) {
    return null;
  }

  const coordinates = routeGeometry.coordinates.filter((coordinate) => (
    Array.isArray(coordinate) &&
    isValidLongitude(Number(coordinate[0])) &&
    isValidLatitude(Number(coordinate[1]))
  ));
  if (coordinates.length < 2) return null;

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates,
    },
    properties: {},
  };
}

function removeRouteDetailRouteLine(map) {
  if (map.getLayer?.(ROUTE_DETAIL_ROUTE_LAYER_ID)) {
    map.removeLayer(ROUTE_DETAIL_ROUTE_LAYER_ID);
  }
  if (map.getSource?.(ROUTE_DETAIL_ROUTE_SOURCE_ID)) {
    map.removeSource(ROUTE_DETAIL_ROUTE_SOURCE_ID);
  }
}

function isRouteDetailMapStyleReady(map) {
  if (typeof map?.isStyleLoaded !== "function") return true;

  try {
    return map.isStyleLoaded();
  } catch {
    return false;
  }
}

function syncRouteDetailRouteLine(map, routeGeometry) {
  if (!isRouteDetailMapStyleReady(map)) return false;

  const routeLineFeature = buildRouteDetailRouteLineFeature(routeGeometry);
  if (!routeLineFeature) {
    removeRouteDetailRouteLine(map);
    return true;
  }

  const existingSource = map.getSource?.(ROUTE_DETAIL_ROUTE_SOURCE_ID);
  if (existingSource?.setData) {
    existingSource.setData(routeLineFeature);
    return true;
  }

  map.addSource(ROUTE_DETAIL_ROUTE_SOURCE_ID, {
    type: "geojson",
    data: routeLineFeature,
  });
  map.addLayer({
    id: ROUTE_DETAIL_ROUTE_LAYER_ID,
    type: "line",
    source: ROUTE_DETAIL_ROUTE_SOURCE_ID,
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#e11900",
      "line-opacity": 0.78,
      "line-width": 4,
    },
  });
  return true;
}

function fitRouteDetailMap(map, maplibregl, locations, options = {}) {
  if (locations.length === 0) return;

  const duration = options.duration ?? 250;
  const maxZoom = options.maxZoom ?? 13;
  const singleZoom = options.singleZoom ?? 12;
  const padding = options.padding ?? {
    bottom: 104,
    left: 80,
    right: 80,
    top: 80,
  };

  if (locations.length === 1) {
    map.flyTo({ center: locations[0].coordinates, duration, essential: true, zoom: singleZoom });
    return;
  }

  const bounds = new maplibregl.LngLatBounds(
    locations[0].coordinates,
    locations[0].coordinates,
  );

  for (const location of locations.slice(1)) {
    bounds.extend(location.coordinates);
  }

  map.fitBounds(bounds, {
    duration,
    essential: true,
    maxZoom,
    padding,
  });
}

function findRouteStopPoint(stop, routeStopPoints) {
  if (!Array.isArray(routeStopPoints)) return null;

  return routeStopPoints.find((point) => (
    (point.deliveryStopId && stop.deliveryStopId && point.deliveryStopId === stop.deliveryStopId) ||
    point.shopifyOrderGid === stop.shopifyOrderGid
  )) ?? null;
}

function getRouteStopPointerCoordinates(stop, routeStopPoint) {
  if (stop.hasCoordinates) return stop.coordinates;

  return (
    normalizeLngLatPair(routeStopPoint?.inputCoordinates) ??
    normalizeLngLatPair(routeStopPoint?.snappedCoordinates)
  );
}

function buildRouteStopPointFitLocations(stop, routeStopPoint) {
  const locations = stop.hasCoordinates ? [{ coordinates: stop.coordinates }] : [];
  const snappedCoordinates = normalizeLngLatPair(routeStopPoint?.snappedCoordinates);

  if (
    snappedCoordinates &&
    !locations.some((location) => areLngLatPairsEqual(location.coordinates, snappedCoordinates))
  ) {
    locations.push({ coordinates: snappedCoordinates });
  }

  return locations;
}

function buildRouteStopPointMarker(stop, routeStopPoint) {
  const snappedCoordinates = normalizeLngLatPair(routeStopPoint?.snappedCoordinates);
  if (!snappedCoordinates) return null;

  if (stop.hasCoordinates) {
    const distanceMeters = calculateLngLatDistanceMeters(stop.coordinates, snappedCoordinates);
    if (distanceMeters != null && distanceMeters < ROUTE_STOP_POINT_MIN_DISTANCE_METERS) {
      return null;
    }
  }

  return {
    coordinates: snappedCoordinates,
    stop,
  };
}

function fitRouteStopAndSnappedPoint(map, maplibregl, stop, routeStopPoint) {
  if (!map || !maplibregl) return;

  const locations = buildRouteStopPointFitLocations(stop, routeStopPoint);
  fitRouteDetailMap(map, maplibregl, locations, {
    maxZoom: 17,
    singleZoom: 17,
  });
}

function createDepartureMarkerIconElement() {
  const iconElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const iconPathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");

  iconElement.classList.add("departure-map-marker__icon");
  iconElement.setAttribute("viewBox", "0 0 20 20");
  iconElement.setAttribute("aria-hidden", "true");
  iconPathElement.setAttribute(
    "d",
    "M10 3.2 3.5 8.4v8.1h4v-5h5v5h4V8.4L10 3.2Z",
  );
  iconElement.append(iconPathElement);

  return iconElement;
}

function createRouteStartMarkerElement(departureLocation) {
  const markerElement = document.createElement("button");
  const markerPinElement = document.createElement("span");

  markerElement.type = "button";
  markerElement.className = "departure-map-marker";
  markerElement.style.zIndex = "3000";
  markerElement.setAttribute("aria-label", `Route start: ${departureLocation.name}`);
  markerPinElement.className = "departure-map-marker__pin";
  markerPinElement.append(createDepartureMarkerIconElement());
  markerElement.append(markerPinElement);

  return markerElement;
}

function createRouteStopMarkerElement(stop) {
  const markerElement = document.createElement("button");
  const labelElement = document.createElement("span");

  markerElement.type = "button";
  markerElement.className = "route-detail-stop-marker";
  markerElement.style.zIndex = "3200";
  markerElement.setAttribute("aria-label", `Stop ${stop.stop}: ${stop.order}`);
  labelElement.className = "route-detail-stop-marker__label";
  labelElement.textContent = String(stop.stop);
  markerElement.append(labelElement);

  return markerElement;
}

function createRouteStopPointMarkerElement() {
  const markerElement = document.createElement("span");

  markerElement.className = "route-detail-snapped-stop-point";
  markerElement.style.zIndex = "3100";
  markerElement.setAttribute("aria-hidden", "true");

  return markerElement;
}

function createRouteDetailMapMarkers(map, maplibregl, departureLocation, routeStops, routeStopPoints) {
  const markers = [];

  if (departureLocation?.hasCoordinates) {
    const startMarker = new maplibregl.Marker({
      anchor: "bottom",
      element: createRouteStartMarkerElement(departureLocation),
    })
      .setLngLat(departureLocation.coordinates)
      .addTo(map);

    markers.push(startMarker);
  }

  for (const stop of routeStops) {
    const routeStopPoint = findRouteStopPoint(stop, routeStopPoints);
    const markerCoordinates = getRouteStopPointerCoordinates(stop, routeStopPoint);
    if (!markerCoordinates) continue;

    const handleStopMarkerDoubleClick = (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      fitRouteStopAndSnappedPoint(
        map,
        maplibregl,
        stop,
        routeStopPoint,
      );
    };
    const markerElement = createRouteStopMarkerElement(stop);
    markerElement.addEventListener("dblclick", handleStopMarkerDoubleClick);

    const stopMarker = new maplibregl.Marker({
      anchor: "center",
      element: markerElement,
    })
      .setLngLat(markerCoordinates)
      .addTo(map);

    markers.push(stopMarker);

    const stopPointMarker = buildRouteStopPointMarker(stop, routeStopPoint);
    if (!stopPointMarker) continue;

    const snappedStopPointMarker = new maplibregl.Marker({
      anchor: "center",
      element: createRouteStopPointMarkerElement(),
    })
      .setLngLat(stopPointMarker.coordinates)
      .addTo(map);

    markers.push(snappedStopPointMarker);
  }

  return markers;
}

function renderRouteHeaderMetric(label, value) {
  return (
    <div style={routeDetailTitleMetricStyle}>
      <span style={routeDetailTitleMetricLabelStyle}>{label}</span>
      <strong style={routeDetailTitleMetricValueStyle}>{value}</strong>
    </div>
  );
}

function renderRouteDetailToolbarIcon(children) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      style={routeDetailMapToolbarIconStyle}
      viewBox="0 0 20 20"
    >
      {children}
    </svg>
  );
}

function renderRouteDetailRefreshIcon() {
  return renderRouteDetailToolbarIcon(
    <>
      <path d="M16 7a6 6 0 1 0 1 5" />
      <path d="M16 3v4h-4" />
    </>,
  );
}

function renderRouteDetailFitIcon() {
  return renderRouteDetailToolbarIcon(
    <>
      <path d="M4.5 8V4.5H8" />
      <path d="M12 4.5h3.5V8" />
      <path d="M15.5 12v3.5H12" />
      <path d="M8 15.5H4.5V12" />
    </>,
  );
}

export default function RouteDetailPage() {
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const routeStopSaveFetcher = useFetcher();
  const routeDriverSaveFetcher = useFetcher();
  const {
    currentDepartureLocation = null,
    drivers = [],
    routePlan,
    routeGeometry = null,
    routeStopPoints = [],
    stops = [],
    sameDateOrders = [],
    errors = [],
  } = useLoaderData();
  const hasSuccessfulRouteStopSave =
    routeStopSaveFetcher.state === "idle" &&
    routeStopSaveFetcher.data != null &&
    (routeStopSaveFetcher.data.errors ?? []).length === 0;
  const hasSuccessfulRouteDriverSave =
    routeDriverSaveFetcher.state === "idle" &&
    routeDriverSaveFetcher.data != null &&
    (routeDriverSaveFetcher.data.errors ?? []).length === 0;
  const effectiveRoutePlan = hasSuccessfulRouteDriverSave
    ? routeDriverSaveFetcher.data.routePlan ?? routePlan
    : hasSuccessfulRouteStopSave
      ? routeStopSaveFetcher.data.routePlan ?? routePlan
      : routePlan;
  const routesListHref = "/app/routes";
  const routeDeliveryDate = getRouteDeliveryDate(effectiveRoutePlan);
  const routeDetail = useMemo(() => buildRouteDetail(effectiveRoutePlan), [effectiveRoutePlan]);
  const departureLocation = useMemo(
    () => buildDepartureLocation(effectiveRoutePlan, currentDepartureLocation),
    [currentDepartureLocation, effectiveRoutePlan],
  );
  const routeDriverOptions = useMemo(
    () => buildRouteDriverOptions(drivers, effectiveRoutePlan?.driver),
    [drivers, effectiveRoutePlan?.driver],
  );
  const routeDriverId = getRouteDriverId(effectiveRoutePlan);
  const [selectedRouteDriverId, setSelectedRouteDriverId] = useState(routeDriverId);
  const routeStops = useMemo(() => buildRouteStops(stops), [stops]);
  const [isEditingRouteSequence, setIsEditingRouteSequence] = useState(false);
  const [committedRouteStops, setCommittedRouteStops] = useState([]);
  const [draftRouteStops, setDraftRouteStops] = useState([]);
  const [committedRouteStopOrderIds, setCommittedRouteStopOrderIds] = useState([]);
  const [draftRouteStopOrderIds, setDraftRouteStopOrderIds] = useState([]);
  const [draftRemovedRouteStopIds, setDraftRemovedRouteStopIds] = useState([]);
  const [activeDraggedRouteStopId, setActiveDraggedRouteStopId] = useState(null);
  const [routeStopSaveClientError, setRouteStopSaveClientError] = useState(null);
  const isSavingRouteStops = routeStopSaveFetcher.state !== "idle";
  const editableRouteStops = isEditingRouteSequence ? draftRouteStops : committedRouteStops;
  const visibleRouteStopOrderIds = isEditingRouteSequence ? draftRouteStopOrderIds : committedRouteStopOrderIds;
  const orderedRouteStops = useMemo(() => orderRouteStops(editableRouteStops, visibleRouteStopOrderIds), [editableRouteStops, visibleRouteStopOrderIds]);
  const addableSameDateStops = useMemo(
    () => buildSameDateCandidateStops(sameDateOrders, editableRouteStops, routeDeliveryDate),
    [editableRouteStops, routeDeliveryDate, sameDateOrders],
  );
  const routeStopSaveErrors = routeStopSaveClientError
    ? [{ message: routeStopSaveClientError }]
    : routeStopSaveFetcher.data?.errors ?? [];
  const routeDriverSaveErrors = routeDriverSaveFetcher.data?.errors ?? [];
  const visibleErrors = [
    ...(errors ?? []),
    ...(routeStopSaveErrors ?? []),
    ...(routeDriverSaveErrors ?? []),
  ];
  const visibleRouteDetailColumnWidths = isEditingRouteSequence
    ? [...routeDetailColumnWidths, "96px"]
    : routeDetailColumnWidths;
  const routeMapCenter = useMemo(
    () => getRouteMapCenter(departureLocation, orderedRouteStops),
    [departureLocation, orderedRouteStops],
  );
  const routeMapLocations = useMemo(
    () => getRouteMapLocations(departureLocation, orderedRouteStops),
    [departureLocation, orderedRouteStops],
  );
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLibraryRef = useRef(null);
  const routeMapCenterRef = useRef(routeMapCenter);
  const markersRef = useRef([]);
  const mapLoadedRef = useRef(false);
  const mapRecoveryAttemptsRef = useRef(0);
  const mapRecoveryTimerRef = useRef(null);
  const appliedRouteStopSaveDataRef = useRef(null);
  const hasInitialRouteMapFitRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapStatus, setMapStatus] = useState("loading");
  const [mapRenderKey, setMapRenderKey] = useState(0);
  const savedRouteGeometry = hasSuccessfulRouteStopSave
    ? routeStopSaveFetcher.data.routeGeometry ?? null
    : routeGeometry;
  const savedRouteStopPoints = useMemo(() => (
    hasSuccessfulRouteStopSave
      ? routeStopSaveFetcher.data.routeStopPoints ?? []
      : routeStopPoints
  ), [hasSuccessfulRouteStopSave, routeStopSaveFetcher.data, routeStopPoints]);
  const routeDetailSaveAction = effectiveRoutePlan?.id
    ? createRouteDetailHref(effectiveRoutePlan.id)
    : routesListHref;
  const isSavingRouteDriver = routeDriverSaveFetcher.state !== "idle";

  useEffect(() => {
    const routeStopIds = routeStops.map((stop) => stop.id);
    setCommittedRouteStops(routeStops);
    setDraftRouteStops(routeStops);
    setCommittedRouteStopOrderIds(routeStopIds);
    setDraftRouteStopOrderIds(routeStopIds);
    setDraftRemovedRouteStopIds([]);
    setIsEditingRouteSequence(false);
    setActiveDraggedRouteStopId(null);
  }, [routeStops]);

  useEffect(() => {
    setSelectedRouteDriverId(routeDriverId);
  }, [routeDriverId]);

  useEffect(() => {
    if (routeStopSaveFetcher.state !== "idle" || !routeStopSaveFetcher.data) return;
    if ((routeStopSaveFetcher.data.errors ?? []).length > 0) return;
    if (appliedRouteStopSaveDataRef.current === routeStopSaveFetcher.data) return;

    appliedRouteStopSaveDataRef.current = routeStopSaveFetcher.data;

    const savedRouteStops = Array.isArray(routeStopSaveFetcher.data.stops)
      ? buildRouteStops(routeStopSaveFetcher.data.stops)
      : [];
    const nextRouteStops = savedRouteStops.length > 0 || draftRouteStops.length === 0
      ? savedRouteStops
      : draftRouteStops;
    const nextRouteStopOrderIds = nextRouteStops.map((stop) => stop.id);

    setCommittedRouteStops(nextRouteStops);
    setCommittedRouteStopOrderIds(nextRouteStopOrderIds);
    setDraftRouteStops(nextRouteStops);
    setDraftRouteStopOrderIds(nextRouteStopOrderIds);
    setDraftRemovedRouteStopIds([]);
    setIsEditingRouteSequence(false);
    setActiveDraggedRouteStopId(null);
  }, [draftRouteStops, routeStopSaveFetcher.data, routeStopSaveFetcher.state]);

  const startRouteSequenceEdit = useCallback(() => {
    setRouteStopSaveClientError(null);
    setDraftRouteStops(committedRouteStops);
    setDraftRouteStopOrderIds(committedRouteStopOrderIds);
    setDraftRemovedRouteStopIds([]);
    setIsEditingRouteSequence(true);
  }, [committedRouteStopOrderIds, committedRouteStops]);

  const saveRouteDriver = useCallback(async () => {
    if (isSavingRouteDriver) return;

    const formData = new FormData();
    formData.set("_intent", "saveRouteDriver");
    formData.set("driverId", selectedRouteDriverId);

    try {
      const sessionToken = await shopify.idToken();
      formData.set("shopifySessionToken", sessionToken);
    } catch {
      // The server action returns an actionable auth error if the token cannot be fetched.
    }

    routeDriverSaveFetcher.submit(formData, { action: routeDetailSaveAction, method: "post" });
  }, [
    isSavingRouteDriver,
    routeDetailSaveAction,
    routeDriverSaveFetcher,
    selectedRouteDriverId,
    shopify,
  ]);

  const saveRouteSequenceEdit = useCallback(async () => {
    if (isSavingRouteStops) return;

    const stopsPayload = orderedRouteStops.map((stop, index) => ({
      deliveryStopId: stop.deliveryStopId ?? null,
      shopifyOrderGid: stop.shopifyOrderGid,
      sequence: index + 1,
    }));

    if (stopsPayload.some((stop) => !stop.shopifyOrderGid)) {
      setRouteStopSaveClientError("저장할 수 없는 주문이 포함되어 있습니다.");
      return;
    }

    const formData = new FormData();
    formData.set("_intent", "saveRouteStops");
    formData.set("stops", JSON.stringify(stopsPayload));

    try {
      const sessionToken = await shopify.idToken();
      formData.set("shopifySessionToken", sessionToken);
    } catch {
      // The server action returns an actionable auth error if the token cannot be fetched.
    }

    setRouteStopSaveClientError(null);
    routeStopSaveFetcher.submit(formData, { action: routeDetailSaveAction, method: "post" });
  }, [isSavingRouteStops, orderedRouteStops, routeDetailSaveAction, routeStopSaveFetcher, shopify]);

  const cancelRouteSequenceEdit = useCallback(() => {
    setDraftRouteStops(committedRouteStops);
    setDraftRouteStopOrderIds(committedRouteStopOrderIds);
    setDraftRemovedRouteStopIds([]);
    setRouteStopSaveClientError(null);
    setIsEditingRouteSequence(false);
    setActiveDraggedRouteStopId(null);
  }, [committedRouteStopOrderIds, committedRouteStops]);

  const removeDraftRouteStop = useCallback((stopId) => {
    setDraftRouteStops((currentRouteStops) => currentRouteStops.filter((stop) => stop.id !== stopId));
    setDraftRouteStopOrderIds((currentOrderIds) => currentOrderIds.filter((currentStopId) => currentStopId !== stopId));
    setDraftRemovedRouteStopIds((currentRemovedIds) => (
      currentRemovedIds.includes(stopId) ? currentRemovedIds : [...currentRemovedIds, stopId]
    ));
  }, []);

  const addDraftRouteStop = useCallback((stop) => {
    setDraftRouteStops((currentRouteStops) => resequenceRouteStops([...currentRouteStops, stop]));
    setDraftRouteStopOrderIds((currentOrderIds) => [...currentOrderIds, stop.id]);
    setDraftRemovedRouteStopIds((currentRemovedIds) => (
      currentRemovedIds.filter((removedStopId) => removedStopId !== stop.id)
    ));
  }, []);

  const handleRouteStopDragStart = useCallback((event, stopId) => {
    if (!isEditingRouteSequence) return;

    setActiveDraggedRouteStopId(stopId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", stopId);
  }, [isEditingRouteSequence]);

  const handleRouteStopDragOver = useCallback((event) => {
    if (!isEditingRouteSequence) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, [isEditingRouteSequence]);

  const handleRouteStopDrop = useCallback((event, targetStopId) => {
    if (!isEditingRouteSequence) return;

    event.preventDefault();
    const sourceStopId = activeDraggedRouteStopId ?? event.dataTransfer.getData("text/plain");
    setDraftRouteStopOrderIds((currentOrderIds) => (
      reorderRouteStopIds(currentOrderIds, sourceStopId, targetStopId)
    ));
    setActiveDraggedRouteStopId(null);
  }, [activeDraggedRouteStopId, isEditingRouteSequence]);

  const handleRouteStopDragEnd = useCallback(() => {
    setActiveDraggedRouteStopId(null);
  }, []);

  const clearMapRecoveryTimer = useCallback(() => {
    if (!mapRecoveryTimerRef.current) return;

    window.clearTimeout(mapRecoveryTimerRef.current);
    mapRecoveryTimerRef.current = null;
  }, []);

  const scheduleMapRecovery = useCallback(() => {
    if (mapRecoveryTimerRef.current) return;

    if (mapRecoveryAttemptsRef.current >= MAX_MAP_RECOVERY_ATTEMPTS) {
      setMapStatus("failed");
      return;
    }

    setMapStatus("recovering");
    mapRecoveryTimerRef.current = window.setTimeout(() => {
      mapRecoveryTimerRef.current = null;
      mapRecoveryAttemptsRef.current += 1;
      mapLoadedRef.current = false;
      setIsMapReady(false);
      setMapRenderKey((currentRenderKey) => currentRenderKey + 1);
    }, MAP_RECOVERY_DELAY_MS);
  }, []);

  const handleRefreshMap = () => {
    clearMapRecoveryTimer();
    mapRecoveryAttemptsRef.current = 0;
    mapLoadedRef.current = false;
    setIsMapReady(false);
    setMapStatus("loading");
    setMapRenderKey((currentRenderKey) => currentRenderKey + 1);
  };

  const handleFitRouteMap = () => {
    if (!isMapReady || !mapRef.current || !mapLibraryRef.current) return;

    fitRouteDetailMap(mapRef.current, mapLibraryRef.current, routeMapLocations);
  };

  useEffect(() => {
    routeMapCenterRef.current = routeMapCenter;
  }, [routeMapCenter]);

  useEffect(() => {
    hasInitialRouteMapFitRef.current = false;
  }, [mapRenderKey]);

  useEffect(() => () => clearMapRecoveryTimer(), [clearMapRecoveryTimer]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    let isMounted = true;

    const initializeRouteDetailMap = async () => {
      try {
        const [{ default: maplibregl }, { Protocol }] = await Promise.all([
          import("maplibre-gl"),
          import("pmtiles"),
        ]);

        if (!isMounted || !mapContainerRef.current || mapRef.current) return;

        installPmtilesProtocol(maplibregl, Protocol);
        mapLibraryRef.current = maplibregl;
        mapRef.current = new maplibregl.Map({
          attributionControl: { compact: true },
          center: routeMapCenterRef.current,
          container: mapContainerRef.current,
          fadeDuration: 0,
          style: OPENFREEMAP_STYLE_URL,
          zoom: 11,
        });
        installMissingMapImageFallback(mapRef.current);
        mapRef.current.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "top-right",
        );
        mapRef.current.on("load", () => {
          mapLoadedRef.current = true;
          mapRecoveryAttemptsRef.current = 0;
          setIsMapReady(true);
          setMapStatus("idle");
        });
        mapRef.current.on("error", (event) => {
          const message = event?.error?.message ?? "";
          const isOpenFreeMapTileError =
            message.includes("tiles.openfreemap.org") ||
            message.includes("overturemaps-tiles-us-west-2-beta.s3.amazonaws.com") ||
            message.includes("pmtiles") ||
            message.includes("AJAXError");

          if (isOpenFreeMapTileError) {
            scheduleMapRecovery();
            return;
          }

          if (mapLoadedRef.current) {
            return;
          }

          setMapStatus("failed");
        });
      } catch {
        if (!isMounted) return;
        setMapStatus("failed");
      }
    };

    initializeRouteDetailMap();

    return () => {
      isMounted = false;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      mapLibraryRef.current = null;
      mapLoadedRef.current = false;
    };
  }, [mapRenderKey, scheduleMapRecovery]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !mapLibraryRef.current) return undefined;

    const map = mapRef.current;
    const maplibregl = mapLibraryRef.current;

    const syncRouteDetailMap = () => {
      syncRouteDetailRouteLine(map, savedRouteGeometry);
      const routeDetailMarkers = createRouteDetailMapMarkers(
        map,
        maplibregl,
        departureLocation,
        orderedRouteStops,
        savedRouteStopPoints,
      );
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = routeDetailMarkers;
    };
    const handleRouteDetailStyleData = () => {
      syncRouteDetailRouteLine(map, savedRouteGeometry);
    };

    syncRouteDetailMap();
    map.on("styledata", handleRouteDetailStyleData);

    return () => {
      map.off("styledata", handleRouteDetailStyleData);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [
    departureLocation,
    isMapReady,
    orderedRouteStops,
    savedRouteGeometry,
    savedRouteStopPoints,
  ]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !mapLibraryRef.current) return;
    if (hasInitialRouteMapFitRef.current) return;

    const maplibregl = mapLibraryRef.current;
    hasInitialRouteMapFitRef.current = true;
    mapRef.current.resize();
    fitRouteDetailMap(mapRef.current, maplibregl, routeMapLocations);
  }, [isMapReady, routeMapLocations]);

  return (
    <main style={routesDetailPageStyle}>
      <div style={routesDetailContentStyle}>
        <div style={routeDetailPageNavStyle}>
          <button
            aria-label="Back to routes list"
            onClick={() => navigate(routesListHref)}
            style={routeDetailBackButtonStyle}
            type="button"
          >
            <span aria-hidden="true" style={routeDetailBackIconStyle}>
              <svg fill="none" viewBox="0 0 20 20">
                <path
                  d="M12.5 4.5 7 10l5.5 5.5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            </span>
            <span>Back to routes</span>
          </button>
        </div>
        <header className="tab-layout-header" style={routesDetailHeaderStyle}>
          <div style={routeDetailTitleRowStyle}>
            <div style={routeDetailTitleIdentityStyle}>
              <h1 style={routesDetailTitleStyle}>{routeDetail.route}</h1>
              <span style={routeStatusBadgeStyle}>{routeDetail.status}</span>
            </div>
            <div style={routeDetailHeaderInfoWrapStyle}>
              <div style={routeDetailHeaderInfoCardStyle}>
                <div aria-label="Route summary" style={routeDetailSummaryMetricsStyle}>
                  {renderRouteHeaderMetric("Orders", routeDetail.orders)}
                  {renderRouteHeaderMetric("Delivery area", routeDetail.deliveryArea)}
                  {renderRouteHeaderMetric("Delivery date", routeDetail.deliveryDate)}
                </div>
                <div aria-label="Route driver" style={routeDetailDriverControlStyle}>
                  <label htmlFor="route-driver-select" style={routeDetailDriverLabelStyle}>Driver</label>
                  <select
                    disabled={isSavingRouteDriver}
                    id="route-driver-select"
                    onChange={(event) => setSelectedRouteDriverId(event.target.value)}
                    style={routeDetailDriverSelectStyle}
                    value={selectedRouteDriverId}
                  >
                    <option value="">No driver</option>
                    {routeDriverOptions.map((driverOption) => (
                      <option key={driverOption.id} value={driverOption.id}>
                        {driverOption.label}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={isSavingRouteDriver || selectedRouteDriverId === routeDriverId}
                    onClick={saveRouteDriver}
                    style={
                      isSavingRouteDriver || selectedRouteDriverId === routeDriverId
                        ? routeDetailDriverDisabledSaveButtonStyle
                        : routeDetailDriverSaveButtonStyle
                    }
                    type="button"
                  >
                    {isSavingRouteDriver ? "Saving…" : "Save driver"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {visibleErrors.length > 0 ? (
          <div style={routeDetailErrorStyle}>{visibleErrors[0].message ?? "Route data could not be fully loaded."}</div>
        ) : null}

        <section style={routesDetailCardStyle}>
          <div style={routeDetailMapFrameStyle}>
            <div style={routeDetailMapToolbarStyle}>
              <button
                aria-label="Zoom route map to fit"
                disabled={routeMapLocations.length === 0}
                onClick={handleFitRouteMap}
                style={routeDetailMapToolbarButtonStyle}
                type="button"
              >
                {renderRouteDetailFitIcon()}
              </button>
              <button
                aria-label="Refresh route map"
                onClick={handleRefreshMap}
                style={routeDetailMapToolbarButtonStyle}
                type="button"
              >
                {renderRouteDetailRefreshIcon()}
              </button>
              {mapStatus !== "idle" ? (
                <span
                  aria-label={
                    mapStatus === "recovering"
                      ? "Route map is refreshing"
                      : mapStatus === "failed"
                        ? "Route map refresh failed"
                        : "Route map is loading"
                  }
                  role="status"
                  style={routeDetailMapStatusStyle}
                >
                  <span aria-hidden="true">
                    {mapStatus === "failed" ? "!" : "…"}
                  </span>
                </span>
              ) : null}
            </div>
            <div
              aria-label="Route stop location map"
              key={mapRenderKey}
              ref={mapContainerRef}
              style={routeDetailMapCanvasStyle}
            />
          </div>

          <div style={routeDetailStopsHeaderStyle}>
            <div style={routeDetailStopsTitleStyle}>stop sequence list</div>
            <div style={routeDetailStopsHeaderActionsStyle}>
              <div style={routesDetailDescriptionStyle}>{orderedRouteStops.length} selected orders</div>
              {isEditingRouteSequence ? (
                <>
                  <button
                    disabled={isSavingRouteStops}
                    onClick={saveRouteSequenceEdit}
                    style={routeStopSequencePrimaryButtonStyle}
                    type="button"
                  >{isSavingRouteStops ? "Saving…" : "Save order"}</button>
                  <button
                    disabled={isSavingRouteStops}
                    onClick={cancelRouteSequenceEdit}
                    style={routeStopSequenceActionButtonStyle}
                    type="button"
                  >Cancel</button>
                </>
              ) : (
                <button
                  onClick={startRouteSequenceEdit}
                  style={routeStopSequenceActionButtonStyle}
                  type="button"
                >Edit</button>
              )}
            </div>
          </div>

          <div style={routesDetailTableFrameStyle}>
            <table style={routesDetailTableStyle}>
              <colgroup>
                {visibleRouteDetailColumnWidths.map((width, index) => (
                  <col key={`${width}-${index}`} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th style={routesDetailHeaderCellStyle}>Stop</th>
                  <th style={routesDetailHeaderCellStyle}>Order</th>
                  <th style={routesDetailHeaderCellStyle}>Recipient</th>
                  <th style={routesDetailHeaderCellStyle}>Address</th>
                  <th style={routesDetailHeaderCellStyle}>Status</th>
                  <th style={routesDetailHeaderCellStyle}>Payment</th>
                  <th style={routesDetailHeaderCellStyle}>Attributes</th>
                  <th style={routesDetailHeaderCellStyle}>Coordinates</th>
                  {isEditingRouteSequence ? (
                    <th style={routesDetailHeaderCellStyle}>Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {orderedRouteStops.length === 0 ? (
                  <tr>
                    <td colSpan={isEditingRouteSequence ? 9 : 8} style={routesDetailEmptyCellStyle}>No route stops selected.</td>
                  </tr>
                ) : (
                  orderedRouteStops.map((stop, stopIndex) => (
                    <tr
                      data-route-stop-index={stopIndex}
                      draggable={isEditingRouteSequence}
                      key={stop.id}
                      onDragEnd={handleRouteStopDragEnd}
                      onDragOver={handleRouteStopDragOver}
                      onDragStart={(event) => handleRouteStopDragStart(event, stop.id)}
                      onDrop={(event) => handleRouteStopDrop(event, stop.id)}
                      style={activeDraggedRouteStopId === stop.id ? routeStopDraggingRowStyle : undefined}
                    >
                      <td style={routeStopSequenceCellStyle}>
                        {isEditingRouteSequence ? (
                          <span
                            aria-label={`Drag stop ${stop.stop}`}
                            role="img"
                            style={routeStopDragHandleStyle}
                          >⋮⋮</span>
                        ) : null}
                        <span>{stop.stop}</span>
                      </td>
                      <td style={routesDetailCellStyle}>{stop.order}</td>
                      <td style={routesDetailCellStyle}>{stop.recipient}</td>
                      <td style={routesDetailCellStyle}>{stop.address}</td>
                      <td style={routesDetailCellStyle}>{stop.status}</td>
                      <td style={routesDetailCellStyle}>{stop.payment}</td>
                      <td style={routesDetailCellStyle}>{stop.attributes}</td>
                      <td style={routesDetailCellStyle}>{stop.coordinatesLabel}</td>
                      {isEditingRouteSequence ? (
                        <td style={routesDetailCellStyle}>
                          <button
                            aria-label={`Remove stop ${stop.stop}`}
                            onClick={() => removeDraftRouteStop(stop.id)}
                            style={routeStopSequenceActionButtonStyle}
                            type="button"
                          >Remove</button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {isEditingRouteSequence ? (
            <div style={routeDetailCandidatePanelStyle}>
              <div style={routeDetailStopsTitleStyle}>Same-date orders</div>
              <div style={routesDetailDescriptionStyle}>
                {addableSameDateStops.length} available orders for {routeDeliveryDate ?? "this route"}
                {draftRemovedRouteStopIds.length > 0 ? ` · ${draftRemovedRouteStopIds.length} removed from draft` : ""}
              </div>
              <div style={routeDetailCandidateListStyle}>
                {addableSameDateStops.length === 0 ? (
                  <div style={routesDetailDescriptionStyle}>No same-date orders to add.</div>
                ) : (
                  addableSameDateStops.map((stop) => (
                    <div key={stop.id} style={routeDetailCandidateItemStyle}>
                      <span style={routeDetailCandidateTextStyle}>{stop.order}</span>
                      <span style={routeDetailCandidateTextStyle}>{stop.recipient}</span>
                      <span style={routeDetailCandidateTextStyle}>{stop.address}</span>
                      <button
                        onClick={() => addDraftRouteStop(stop)}
                        style={routeStopSequenceActionButtonStyle}
                        type="button"
                      >Add</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
