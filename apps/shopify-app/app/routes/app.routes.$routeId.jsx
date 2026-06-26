import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useFetcher, useLoaderData, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { formatDeliveryScopeLabel } from "../features/delivery/delivery-labels";
import { fetchDeliveryDrivers } from "../features/delivery/drivers.server";
import {
  assignDeliveryRoutePlanDriver,
  fetchDeliveryRoutePlanDetail,
} from "../features/delivery/route-plans.server";
import { createDepartureMarkerElement, createDotMarkerElement, createNumberedMarkerElement, MAP_MARKER_PALETTE } from "../features/maps/map-markers";
import { installMissingMapImageFallback } from "../features/maps/maplibre-missing-images";
import { installPmtilesProtocol } from "../features/maps/pmtiles-protocol";
import { fetchShopifyDepartureLocation } from "../features/locations/shopify-locations.server";
import { MapPanel, MapToolbar, renderMapFitIcon, renderMapRefreshIcon, renderMapZoomInIcon, renderMapZoomOutIcon } from "../ui/map-panel";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: "/vendor/maplibre-gl.css" }];

const OPENFREEMAP_STYLE_URL = "/vendor/openfreemap-clever-lite.json";
const DEFAULT_CENTER = [-79.3832, 43.6532];
const MAP_RECOVERY_DELAY_MS = 2500;
const MAX_MAP_RECOVERY_ATTEMPTS = 3;
const ROUTE_DETAIL_ROUTE_SOURCE_ID = "route-detail-osrm-route";
const ROUTE_DETAIL_ROUTE_LAYER_ID = "route-detail-osrm-route-line";
const ROUTE_STOP_POINT_MIN_DISTANCE_METERS = 1;
const ROUTE_DETAIL_PERF_CAPTURE_ENABLED = import.meta.env.DEV;

function roundPerfDuration(duration) {
  return Number(duration.toFixed(2));
}

function getRouteDetailPerfNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function logRouteDetailPerformance(name, metric) {
  if (!ROUTE_DETAIL_PERF_CAPTURE_ENABLED) return;

  console.info(name, {
    measuredAt: new Date().toISOString(),
    ...metric,
  });
}

const routesDetailPageStyle = {
  padding: "8px 12px 12px",
};

const routesDetailContentStyle = {
  display: "grid",
  gap: "12px",
};

const routeOverviewHeaderStyle = {
  background: "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
  border: "1px solid #e3e3e3",
  borderRadius: "16px",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.045)",
  display: "grid",
  gap: "14px",
  padding: "16px",
};

const routeOverviewTopBarStyle = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
};

const routeOverviewTitleBlockStyle = {
  display: "grid",
  gap: "8px",
  minWidth: 0,
};

const routeOverviewTitleLineStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  minWidth: 0,
};

const routesDetailTitleStyle = {
  margin: 0,
  fontFamily: "inherit",
  fontSize: "24px",
  fontWeight: "700",
  lineHeight: "32px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routeDetailTitleMetricStyle = {
  alignItems: "baseline",
  display: "inline-flex",
  gap: "4px",
  maxWidth: "100%",
  minWidth: 0,
  textAlign: "left",
};

const routeDetailTitleMetricLabelStyle = {
  color: "#707070",
  fontSize: "12px",
  fontWeight: 600,
  lineHeight: 1.1,
};

const routeDetailTitleMetricValueStyle = {
  color: "#1f1f1f",
  fontSize: "13px",
  fontWeight: 700,
  lineHeight: 1.15,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routeDetailDriverLabelStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.15,
  whiteSpace: "nowrap",
};

const routeDetailDriverSelectStyle = {
  background: "#ffffff",
  border: "1px solid #c9c9c9",
  borderRadius: "8px",
  color: "#303030",
  fontFamily: "inherit",
  fontSize: "13px",
  minHeight: "28px",
  minWidth: 0,
  padding: "3px 8px",
  width: "100%",
};

const routeDetailDriverSaveButtonStyle = {
  background: "#4f2bd9",
  borderColor: "#4f2bd9",
  borderRadius: "8px",
  borderStyle: "solid",
  borderWidth: "1px",
  color: "#ffffff",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.2,
  minHeight: "28px",
  padding: "3px 10px",
  whiteSpace: "nowrap",
};

const routeDetailDriverDisabledSaveButtonStyle = {
  ...routeDetailDriverSaveButtonStyle,
  background: "#f1f1f1",
  borderColor: "#d6d6d6",
  color: "#8a8a8a",
  cursor: "not-allowed",
};

const routeOverviewDriverPanelStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  justifyContent: "flex-end",
  minWidth: 0,
  textAlign: "left",
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
  background: "transparent",
  border: 0,
  color: "#4b5563",
  cursor: "pointer",
  display: "inline-flex",
  flex: "0 0 auto",
  fontSize: "13px",
  fontWeight: 650,
  gap: "6px",
  lineHeight: 1.2,
  minHeight: "26px",
  padding: 0,
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

const routeDetailMapFrameStyle = {
  height: "440px",
};

const routeDetailMapCanvasStyle = {
  minHeight: "440px",
};

const routeMetaGridStyle = {
  borderBottom: "1px solid #ececec",
  display: "grid",
  gap: "8px 16px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  padding: "10px 12px",
};

const routeMetaItemStyle = {
  color: "#4b5563",
  fontSize: "13px",
  lineHeight: 1.35,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routePlanRowsTableStyle = {
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: "100%",
  tableLayout: "fixed",
  width: "100%",
};

const routePlanRowsColumnWidths = [
  "13%",
  "7%",
  "10%",
  "6%",
  "11%",
  "4%",
  "6%",
  "6%",
  "6%",
  "8%",
  "8%",
  "6%",
  "9%",
];

const routeLineNameStyle = {
  alignItems: "center",
  display: "inline-flex",
  gap: "6px",
  maxWidth: "100%",
  minWidth: 0,
};

const routeLineTitleStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routeStatusDotStyle = {
  background: "#0ea5e9",
  borderRadius: "999px",
  display: "inline-block",
  flex: "0 0 auto",
  height: "7px",
  width: "7px",
};

const routeDepartureStatusStyle = {
  background: "#fff7cc",
  border: "1px solid #eadf9b",
  borderRadius: "999px",
  color: "#5f4b00",
  display: "inline-flex",
  fontSize: "11px",
  fontWeight: 650,
  lineHeight: 1,
  padding: "2px 6px",
};

const routeEditableValueStyle = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  color: "#303030",
  cursor: "pointer",
  display: "inline-flex",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 600,
  gap: "3px",
  lineHeight: 1.1,
  maxWidth: "100%",
  minWidth: 0,
  overflow: "hidden",
  padding: 0,
  textAlign: "left",
  whiteSpace: "nowrap",
};

const routeEditableValueTextStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routeEditableArrowStyle = {
  alignItems: "center",
  color: "#616161",
  display: "inline-flex",
  flex: "0 0 auto",
  height: "12px",
  justifyContent: "center",
  width: "12px",
};

const routeEditableChevronSvgStyle = {
  display: "block",
};

const routeTimelineStyle = {
  borderTop: "1px solid #ececec",
  display: "grid",
  gap: "8px",
  overflowX: "auto",
  padding: "10px 8px",
};

const routeTimelineLaneStyle = {
  alignItems: "center",
  display: "inline-flex",
  minWidth: "max-content",
};

const routeTimelineLabelStyle = {
  color: "#303030",
  fontSize: "12px",
  fontWeight: 650,
  marginRight: "10px",
  minWidth: "96px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routeTimelineStartStyle = {
  alignItems: "center",
  background: "#0f8f72",
  borderRadius: "999px",
  color: "#ffffff",
  display: "inline-flex",
  flex: "0 0 auto",
  fontSize: "11px",
  fontWeight: 700,
  height: "22px",
  justifyContent: "center",
  width: "22px",
};

const routeTimelineSegmentStyle = {
  alignItems: "center",
  display: "inline-flex",
  flex: "0 0 auto",
};

const routeTimelineLineStyle = {
  background: "#0ea5e9",
  height: "2px",
  width: "34px",
};

const routeTimelineStopStyle = {
  alignItems: "center",
  background: "#0b84d8",
  borderRadius: "999px",
  color: "#ffffff",
  display: "inline-flex",
  fontSize: "10px",
  fontWeight: 700,
  height: "22px",
  justifyContent: "center",
  width: "22px",
};

const routesDetailTableFrameStyle = {
  overflowX: "hidden",
};

const routesDetailHeaderCellStyle = {
  background: "#f7f7f7",
  borderBottomColor: "#d6d6d6",
  borderBottomStyle: "solid",
  borderBottomWidth: "1px",
  color: "#616161",
  fontSize: "11px",
  fontWeight: 650,
  lineHeight: 1.15,
  overflow: "hidden",
  padding: "5px 6px",
  textAlign: "left",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routesDetailCellStyle = {
  borderBottomColor: "#ececec",
  borderBottomStyle: "solid",
  borderBottomWidth: "1px",
  color: "#303030",
  fontSize: "12px",
  lineHeight: 1.2,
  overflow: "hidden",
  padding: "5px 6px",
  textOverflow: "ellipsis",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
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
  const loaderStartedAt = getRouteDetailPerfNow();
  const { admin, session } = await authenticate.admin(request);
  const shopifyShopCacheKey = session?.shop;
  const primaryDataStartedAt = getRouteDetailPerfNow();
  const [routePlanData, departureLocationData, driverData] = await Promise.all([
    fetchDeliveryRoutePlanDetail(request, params.routeId, {
      cacheKey: shopifyShopCacheKey,
    }),
    fetchShopifyDepartureLocation(admin, { cacheKey: shopifyShopCacheKey }),
    fetchDeliveryDrivers(request, {}),
  ]);
  const primaryDataMs = roundPerfDuration(getRouteDetailPerfNow() - primaryDataStartedAt);

  logRouteDetailPerformance("routes.detail.loader", {
    totalMs: roundPerfDuration(getRouteDetailPerfNow() - loaderStartedAt),
    primaryDataMs,
    routeId: params.routeId,
    stopCount: routePlanData.stops?.length ?? 0,
    driverCount: driverData.drivers?.length ?? 0,
    errorCount:
      (routePlanData.errors?.length ?? 0) +
      (driverData.errors?.length ?? 0),
  });

  return {
    ...routePlanData,
    errors: [
      ...(routePlanData.errors ?? []),
      ...(driverData.errors ?? []),
    ],
    currentDepartureLocation: departureLocationData.departureLocation,
    drivers: driverData.drivers,
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

  return {
    routePlan: null,
    stops: [],
    errors: [{ message: "지원하지 않는 route 작업입니다." }],
  };
};

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

function buildRouteDetail(routePlan) {
  if (!routePlan) {
    return {
      route: "Route not found",
      status: "Unavailable",
      orders: 0,
      coordinates: "0/0",
      missingCoordinates: 0,
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
    deliveryDate: formatRouteDeliveryScope(routePlan),
  };
}

function getRouteDriverId(routePlan) {
  return textOrUndefined(routePlan?.driverId ?? routePlan?.driver?.id) ?? "";
}

function getRouteDepartureStatus(routePlan) {
  const status = String(routePlan?.departureStatus ?? routePlan?.dispatchStatus ?? "").toUpperCase();

  return status === "STARTED" || routePlan?.startedAt ? "Started" : "Unstarted";
}

function getRouteStartDateTimeValue(routePlan) {
  const value = textOrUndefined(
    routePlan?.scheduledStartAt ?? routePlan?.startTime ?? routePlan?.startedAt,
  );

  if (value?.includes("T")) return value.slice(0, 16);

  const date = textOrUndefined(routePlan?.routeScope?.deliveryDate ?? routePlan?.deliveryDate ?? routePlan?.planDate);
  return date ? `${date}T09:00` : "";
}

function getRouteStartTimeLabel(value) {
  if (!value) return "—";
  return value.replace("T", " ");
}

function getChildRouteTitle(routePlan) {
  return textOrUndefined(
    routePlan?.childRouteName ??
    routePlan?.routeLineName ??
    routePlan?.branchName ??
    routePlan?.branch?.label,
  ) ?? "Unassigned";
}

function getRouteCreatedLabel(routePlan) {
  return textOrUndefined(routePlan?.createdAt)?.replace("T", " ").slice(0, 16) ?? "—";
}

function getRouteVehicleLabel(routePlan) {
  return textOrUndefined(routePlan?.vehicle?.name ?? routePlan?.vehicleName) ?? "—";
}

function countRouteStopsByStatus(routeStops, statuses) {
  const statusSet = new Set(statuses);

  return routeStops.filter((stop) => statusSet.has(String(stop.status).toUpperCase())).length;
}

function getRouteTotalItems(routePlan, routeStops) {
  const explicitTotal = numberOrUndefined(routePlan?.totalItems ?? routePlan?.itemsCount ?? routePlan?.itemCount);
  const stopTotal = routeStops.reduce((total, stop) => total + (numberOrUndefined(stop.itemCount) ?? 0), 0);

  return explicitTotal ?? (stopTotal > 0 ? stopTotal : "—");
}

function getRouteMetricLabel(...values) {
  return values.map(textOrUndefined).find(Boolean) ?? "—";
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
      itemCount: numberOrUndefined(stop.itemCount ?? stop.itemsCount ?? stop.totalItems),
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

function createRouteStopMarkerElement(stop) {
  return createNumberedMarkerElement({
    ariaLabel: `Stop ${stop.stop}: ${stop.order}`,
    className: "route-detail-stop-marker",
    color: MAP_MARKER_PALETTE.routeStop.color,
    label: stop.stop,
    labelClassName: "route-detail-stop-marker__label",
    zIndex: "3200",
  });
}

function createRouteStopPointMarkerElement() {
  return createDotMarkerElement({
    className: "route-detail-snapped-stop-point",
    color: MAP_MARKER_PALETTE.snappedStop.color,
    zIndex: "3100",
  });
}

function createRouteDetailMapMarkers(map, maplibregl, departureLocation, routeStops, routeStopPoints) {
  const markers = [];

  if (departureLocation?.hasCoordinates) {
    const startMarker = new maplibregl.Marker({
      anchor: "bottom",
      element: createDepartureMarkerElement(departureLocation),
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

function renderRouteEditableChevron() {
  return (
    <span aria-hidden="true" style={routeEditableArrowStyle}>
      <svg fill="none" height="10" style={routeEditableChevronSvgStyle} viewBox="0 0 10 10" width="10">
        <path
          d="M2.25 3.75 5 6.25l2.75-2.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
      </svg>
    </span>
  );
}

export default function RouteDetailPage() {
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const routeDriverSaveFetcher = useFetcher();
  const {
    currentDepartureLocation = null,
    drivers = [],
    routePlan,
    routeGeometry = null,
    routeStopPoints = [],
    stops = [],
    errors = [],
  } = useLoaderData();
  const hasSuccessfulRouteDriverSave =
    routeDriverSaveFetcher.state === "idle" &&
    routeDriverSaveFetcher.data != null &&
    (routeDriverSaveFetcher.data.errors ?? []).length === 0;
  const effectiveRoutePlan = hasSuccessfulRouteDriverSave
    ? routeDriverSaveFetcher.data.routePlan ?? routePlan
    : routePlan;
  const routesListHref = "/app/routes";
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
  const routeDriverSummary = routeDriverId
    ? routeDriverOptions.find((driverOption) => driverOption.id === routeDriverId)?.label ?? "Assigned"
    : "Unassigned";
  const [selectedRouteDriverId, setSelectedRouteDriverId] = useState(routeDriverId);
  const orderedRouteStops = useMemo(() => buildRouteStops(stops), [stops]);
  const routeDepartureStatus = getRouteDepartureStatus(effectiveRoutePlan);
  const childRouteTitle = getChildRouteTitle(effectiveRoutePlan);
  const routeStartDateTimeValue = getRouteStartDateTimeValue(effectiveRoutePlan);
  const routeStartTimeLabel = getRouteStartTimeLabel(routeStartDateTimeValue);
  const routeDeliveredCount = countRouteStopsByStatus(orderedRouteStops, ["DELIVERED", "FULFILLED"]);
  const routeAttemptedCount = countRouteStopsByStatus(orderedRouteStops, ["ATTEMPTED", "FAILED"]);
  const routeTotalItems = getRouteTotalItems(effectiveRoutePlan, orderedRouteStops);
  const routeTotalDriveTime = getRouteMetricLabel(effectiveRoutePlan?.totalDriveTime, effectiveRoutePlan?.driveTime);
  const routeTotalDistance = getRouteMetricLabel(effectiveRoutePlan?.totalDistance, effectiveRoutePlan?.distance);
  const routeTotalWeight = getRouteMetricLabel(effectiveRoutePlan?.totalWeight, effectiveRoutePlan?.weight);
  const routeVehicleLabel = getRouteVehicleLabel(effectiveRoutePlan);
  const routeCreatedLabel = getRouteCreatedLabel(effectiveRoutePlan);
  const routeDriverSaveErrors = routeDriverSaveFetcher.data?.errors ?? [];
  const visibleErrors = [
    ...(errors ?? []),
    ...(routeDriverSaveErrors ?? []),
  ];
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
  const hasInitialRouteMapFitRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapStatus, setMapStatus] = useState("loading");
  const [mapRenderKey, setMapRenderKey] = useState(0);
  const savedRouteGeometry = routeGeometry;
  const savedRouteStopPoints = routeStopPoints;
  const routeDetailSaveAction = effectiveRoutePlan?.id
    ? createRouteDetailHref(effectiveRoutePlan.id)
    : routesListHref;
  const isSavingRouteDriver = routeDriverSaveFetcher.state !== "idle";

  useEffect(() => {
    setSelectedRouteDriverId(routeDriverId);
  }, [routeDriverId]);

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

  const handleZoomInMap = () => {
    mapRef.current?.zoomIn({ duration: 250 });
  };

  const handleZoomOutMap = () => {
    mapRef.current?.zoomOut({ duration: 250 });
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
      const mapInitStartedAt = performance.now();
      try {
        const importStartedAt = performance.now();
        const [{ default: maplibregl }, { Protocol }] = await Promise.all([
          import("maplibre-gl"),
          import("pmtiles"),
        ]);
        const importMs = roundPerfDuration(performance.now() - importStartedAt);

        if (!isMounted || !mapContainerRef.current || mapRef.current) return;

        installPmtilesProtocol(maplibregl, Protocol);
        mapLibraryRef.current = maplibregl;
        const constructStartedAt = performance.now();
        mapRef.current = new maplibregl.Map({
          attributionControl: { compact: true },
          center: routeMapCenterRef.current,
          container: mapContainerRef.current,
          fadeDuration: 0,
          style: OPENFREEMAP_STYLE_URL,
          zoom: 11,
        });
        const constructMs = roundPerfDuration(performance.now() - constructStartedAt);
        installMissingMapImageFallback(mapRef.current);
        mapRef.current.on("load", () => {
          logRouteDetailPerformance("routes.detail.map.load", {
            totalMs: roundPerfDuration(performance.now() - mapInitStartedAt),
            importMs,
            constructMs,
            loadWaitMs: roundPerfDuration(performance.now() - mapInitStartedAt - importMs - constructMs),
          });
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
      const syncStartedAt = performance.now();
      const routeLineStartedAt = performance.now();
      syncRouteDetailRouteLine(map, savedRouteGeometry);
      const routeLineMs = roundPerfDuration(performance.now() - routeLineStartedAt);
      const markerStartedAt = performance.now();
      const routeDetailMarkers = createRouteDetailMapMarkers(
        map,
        maplibregl,
        departureLocation,
        orderedRouteStops,
        savedRouteStopPoints,
      );
      const markerCreateMs = roundPerfDuration(performance.now() - markerStartedAt);
      const markerRemoveStartedAt = performance.now();
      markersRef.current.forEach((marker) => marker.remove());
      const markerRemoveMs = roundPerfDuration(performance.now() - markerRemoveStartedAt);
      markersRef.current = routeDetailMarkers;
      logRouteDetailPerformance("routes.detail.map.sync", {
        totalMs: roundPerfDuration(performance.now() - syncStartedAt),
        routeLineMs,
        markerCreateMs,
        markerRemoveMs,
        markerCount: routeDetailMarkers.length,
        stopCount: orderedRouteStops.length,
        stopPointCount: savedRouteStopPoints.length,
        hasRouteGeometry: Boolean(savedRouteGeometry),
      });
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
        <header className="route-overview-header" style={routeOverviewHeaderStyle}>
          <div style={routeOverviewTopBarStyle}>
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

          <div className="route-overview-main">
            <div style={routeOverviewTitleBlockStyle}>
              <div style={routeOverviewTitleLineStyle}>
                <h1 className="route-detail-title" style={routesDetailTitleStyle}>{routeDetail.route}</h1>
                <span style={routeStatusBadgeStyle}>{routeDetail.status}</span>
              </div>
              <div aria-label="Route summary" className="route-overview-summary">
                {renderRouteHeaderMetric("Orders", routeDetail.orders)}
                {renderRouteHeaderMetric("Delivery date", routeDetail.deliveryDate)}
                {renderRouteHeaderMetric("Driver", routeDriverSummary)}
              </div>
            </div>
            <div
              aria-label="Route driver assignment"
              style={routeOverviewDriverPanelStyle}
            >
              <label htmlFor="route-driver-select" style={routeDetailDriverLabelStyle}>Driver assignment</label>
              <div className="route-overview-driver-control">
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
        </header>

        {visibleErrors.length > 0 ? (
          <div style={routeDetailErrorStyle}>{visibleErrors[0].message ?? "Route data could not be fully loaded."}</div>
        ) : null}

        <section style={routesDetailCardStyle}>
          <MapPanel
            ariaLabel="Route stop location map"
            canvasKey={mapRenderKey}
            canvasRef={mapContainerRef}
            canvasStyle={routeDetailMapCanvasStyle}
            frameStyle={routeDetailMapFrameStyle}
            toolbar={
              <MapToolbar
                actions={[
                  {
                    ariaLabel: "Zoom map in",
                    icon: renderMapZoomInIcon(),
                    onClick: handleZoomInMap,
                  },
                  {
                    ariaLabel: "Zoom map out",
                    icon: renderMapZoomOutIcon(),
                    onClick: handleZoomOutMap,
                  },
                  {
                    ariaLabel: "Fit highlighted map markers",
                    disabled: routeMapLocations.length === 0,
                    icon: renderMapFitIcon(),
                    onClick: handleFitRouteMap,
                  },
                  {
                    ariaLabel: "Refresh route map",
                    icon: renderMapRefreshIcon(),
                    onClick: handleRefreshMap,
                  },
                ]}
                statusGlyph={mapStatus === "failed" ? "!" : "…"}
                statusLabel={
                  mapStatus !== "idle"
                    ? mapStatus === "recovering"
                      ? "Route map is refreshing"
                      : mapStatus === "failed"
                        ? "Route map refresh failed"
                        : "Route map is loading"
                    : null
                }
              />
            }
          />

          <section aria-label="Route timing" style={routeMetaGridStyle}>
            <div style={routeMetaItemStyle}>☆ Route start: {departureLocation.address}</div>
            <div style={routeMetaItemStyle}>⚑ Route end: Loop back to start</div>
            <div style={routeMetaItemStyle}>◴ Scheduled for: {routeDetail.deliveryDate}</div>
            <div style={routeMetaItemStyle}>ⓘ Driver assignment: {routeDriverSummary}</div>
          </section>

          <div style={routesDetailTableFrameStyle}>
            <table aria-label="Driver route rows" style={routePlanRowsTableStyle}>
              <colgroup>
                {routePlanRowsColumnWidths.map((width, index) => (
                  <col key={`${width}-${index}`} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th style={routesDetailHeaderCellStyle}>Name</th>
                  <th style={routesDetailHeaderCellStyle}>Status</th>
                  <th style={routesDetailHeaderCellStyle}>Driver</th>
                  <th style={routesDetailHeaderCellStyle}>Vehicle</th>
                  <th style={routesDetailHeaderCellStyle}>Start time</th>
                  <th style={routesDetailHeaderCellStyle}>Stops</th>
                  <th style={routesDetailHeaderCellStyle}>Delivered</th>
                  <th style={routesDetailHeaderCellStyle}>Attempted</th>
                  <th style={routesDetailHeaderCellStyle}>Total items</th>
                  <th style={routesDetailHeaderCellStyle}>Total drive time</th>
                  <th style={routesDetailHeaderCellStyle}>Total distance</th>
                  <th style={routesDetailHeaderCellStyle}>Total weight</th>
                  <th style={routesDetailHeaderCellStyle}>Created</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={routesDetailCellStyle}>
                    <span style={routeLineNameStyle}>
                      <span aria-hidden="true" style={routeStatusDotStyle}></span>
                      <span style={routeLineTitleStyle}>{childRouteTitle}</span>
                    </span>
                  </td>
                  <td style={routesDetailCellStyle}><span style={routeDepartureStatusStyle}>{routeDepartureStatus}</span></td>
                  <td style={routesDetailCellStyle}>
                    <button aria-label="Change route driver" style={routeEditableValueStyle} type="button">
                      <span style={routeEditableValueTextStyle}>{routeDriverSummary}</span>
                      {renderRouteEditableChevron()}
                    </button>
                  </td>
                  <td style={routesDetailCellStyle}>
                    <button aria-label="Change route vehicle" style={routeEditableValueStyle} type="button">
                      <span style={routeEditableValueTextStyle}>{routeVehicleLabel}</span>
                      {renderRouteEditableChevron()}
                    </button>
                  </td>
                  <td style={routesDetailCellStyle}>
                    <button aria-label="Change route start time" style={routeEditableValueStyle} type="button">
                      <span style={routeEditableValueTextStyle}>{routeStartTimeLabel}</span>
                      {renderRouteEditableChevron()}
                    </button>
                  </td>
                  <td style={routesDetailCellStyle}>{orderedRouteStops.length}</td>
                  <td style={routesDetailCellStyle}>{routeDeliveredCount}</td>
                  <td style={routesDetailCellStyle}>{routeAttemptedCount}</td>
                  <td style={routesDetailCellStyle}>{routeTotalItems}</td>
                  <td style={routesDetailCellStyle}>{routeTotalDriveTime}</td>
                  <td style={routesDetailCellStyle}>{routeTotalDistance}</td>
                  <td style={routesDetailCellStyle}>{routeTotalWeight}</td>
                  <td style={routesDetailCellStyle}>{routeCreatedLabel}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <section aria-label="Route stop timeline" style={routeTimelineStyle}>
            <div style={routeTimelineLaneStyle}>
              <div style={routeTimelineLabelStyle}>{childRouteTitle}</div>
              <span title="Start" style={routeTimelineStartStyle}>★</span>
              {orderedRouteStops.map((stop) => (
                <span key={stop.id} style={routeTimelineSegmentStyle} title={stop.order}>
                  <span style={routeTimelineLineStyle}></span>
                  <span style={routeTimelineStopStyle}>{stop.stop}</span>
                </span>
              ))}
            </div>
          </section>
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
