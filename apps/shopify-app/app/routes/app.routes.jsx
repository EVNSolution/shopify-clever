import { RouteCashSummary } from "../features/delivery/route-office-components";
import { formatStoreInstant } from "../features/shopify/store-date-time";
import { useStoreTimeZone } from "../ui/store-time-zone";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Outlet, redirect, useFetcher, useLoaderData, useNavigate, useParams, useRevalidator, useRouteLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  formatRouteStatus,
  getRouteStatusBadgeColors,
  getVisibleRouteGroupChildren,
  shouldRevalidateRoutesRoute,
} from "../features/delivery/route-helpers";
import {
  buildRouteRows,
  getExpandedRouteDeleteKeys,
  getPrimaryRouteSelectionKeys,
  getRouteDeletePayloadKeys,
  toggleRouteSelection,
} from "../features/delivery/route-list-rows";
import { fetchShopifyDepartureLocation } from "../features/locations/shopify-locations.server";
import { fetchRouteFallbackTimeZone, resolveRouteListTimeZones } from "../features/delivery/route-timezone.server";
import { deleteDeliveryRoutePlan, fetchDeliveryRoutePlans, getCleverAppId } from "../features/delivery/route-plans.server";
import {
  confirmRouteListRefresh,
  getConfirmedRouteListRefresh,
  getRouteListRefreshKey,
  isRouteListRefreshCleanup,
  readRouteListRefresh,
  readRouteListRefreshRequest,
  ROUTE_LIST_REFRESH_PARAM,
  routeListRefreshWasAttempted,
} from "../features/delivery/route-list-refresh";
import { deleteDeliveryRouteGroup, deleteDeliveryRouteGroupChildRoutes, fetchDeliveryRouteGroups } from "../features/delivery/route-groups.server";
import { getServiceErrorNotice } from "../features/service-errors";
import { authenticate } from "../shopify.server";
import { AdminRouteErrorBoundary } from "../ui/admin-route-error-boundary";
import { logStructuredMetric } from "../features/telemetry/structured-telemetry.server";
import { translate } from "../i18n/i18n";
import { withEmbeddedShopifyContext } from "../features/delivery/route-paths";

const routesTablePageStyle = {
  padding: "8px 12px 12px",
};

const routesPageContentStyle = {
  display: "grid",
  gap: "12px",
};

const routesHeaderStyle = {
  display: "grid",
  gap: "4px",
};

const routesHeaderBarStyle = {
  alignItems: "center",
  display: "flex",
  gap: "12px",
  justifyContent: "space-between",
};

const routesTitleStyle = {
  margin: 0,
  fontFamily: "inherit",
  fontSize: "20px",
  fontWeight: "600",
  lineHeight: "28px",
};

const routesSummaryCardsStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "10px",
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(150px, 1fr))",
  overflowX: "auto",
  overflowY: "hidden",
};

const routesSummaryCardStyle = {
  borderRight: "1px solid #ebebeb",
  display: "grid",
  gap: "8px",
  minHeight: "64px",
  padding: "12px 14px",
};

const routesSummaryLabelStyle = {
  color: "#303030",
  fontSize: "12px",
  lineHeight: 1.2,
};

const routesSummaryValueStyle = {
  color: "#111111",
  fontSize: "20px",
  fontWeight: 700,
  lineHeight: 1.2,
};

const routesTableFrameStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "10px",
  overflow: "hidden",
};

const routesHeaderActionsStyle = {
  alignItems: "center",
  alignSelf: "center",
  display: "flex",
  flex: "0 0 auto",
  gap: "8px",
};

const routeSelectionSummaryStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
  whiteSpace: "nowrap",
};

const routeTableScrollStyle = {
  overflow: "auto",
};

const ROUTE_NAME_COLUMN_MIN_WIDTH = 112;
const ROUTE_NAME_COLUMN_MAX_WIDTH = 220;

function getRouteNameColumnWidth(routeRows) {
  const longestRouteName = routeRows.reduce(
    (longest, route) => Math.max(longest, String(route.route ?? "").length),
    "Route".length,
  );

  return `${Math.min(ROUTE_NAME_COLUMN_MAX_WIDTH, Math.max(ROUTE_NAME_COLUMN_MIN_WIDTH, longestRouteName * 7 + 28))}px`;
}

function getRouteColumnWidths(routeRows, kfoodOfficeEnabled = false) {
  return [
    "44px",
    getRouteNameColumnWidth(routeRows),
    "84px",
    "112px",
    "148px",
    "68px",
    "84px",
    "128px",
    "128px",
    "112px",
    ...(kfoodOfficeEnabled ? ["220px"] : []),
    "148px",
    "148px",
  ];
}

const singleRouteTableStyle = {
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: "1320px",
  tableLayout: "auto",
  width: "100%",
};

const routeTableHeaderCellStyle = {
  background: "#f7f7f7",
  borderBottom: "1px solid #d6d6d6",
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.25,
  padding: "7px 8px",
  position: "sticky",
  textAlign: "left",
  top: 0,
  whiteSpace: "nowrap",
  zIndex: 1,
};

const routeTableCellStyle = {
  borderBottom: "1px solid #ececec",
  color: "#303030",
  fontSize: "13px",
  lineHeight: 1.35,
  overflow: "hidden",
  padding: "6px 8px",
  textOverflow: "ellipsis",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const routeNameCellStyle = {
  ...routeTableCellStyle,
  fontWeight: 650,
  position: "relative",
};

const routeNameContentStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  minWidth: 0,
};

// Leaves room for the group band (6 px) plus the usual gap, so the name keeps its place.
const routeNameContentWithBandStyle = {
  ...routeNameContentStyle,
  paddingLeft: "14px",
};

const routeNumberHeaderCellStyle = {
  ...routeTableHeaderCellStyle,
  textAlign: "center",
};

const routeNumberCellStyle = {
  ...routeTableCellStyle,
  textAlign: "center",
};

const routeCheckboxCellStyle = {
  ...routeTableCellStyle,
  overflow: "visible",
  padding: "6px 3px",
  textAlign: "center",
  textOverflow: "clip",
};

const routeCheckboxHeaderCellStyle = {
  ...routeTableHeaderCellStyle,
  padding: "7px 3px",
  textAlign: "center",
};

// The band fills the whole name cell, so the rows of one group read as one continuous band.
const routeGroupMarkerStyle = {
  bottom: 0,
  left: 0,
  position: "absolute",
  top: 0,
  width: "6px",
};

const routeGroupMarkerTooltipStyle = {
  background: "#ffffff",
  border: "1px solid #c9cccf",
  borderRadius: "6px",
  boxShadow: "0 3px 10px rgba(0, 0, 0, 0.18)",
  color: "#303030",
  fontSize: "13px",
  lineHeight: 1.2,
  padding: "7px 9px",
  pointerEvents: "none",
  position: "fixed",
  transform: "translate(-50%, -100%)",
  whiteSpace: "nowrap",
  zIndex: 2000,
};

const routeGroupMarkerTooltipArrowStyle = {
  background: "#ffffff",
  borderBottom: "1px solid #c9cccf",
  borderRight: "1px solid #c9cccf",
  bottom: "-5px",
  height: "8px",
  left: "50%",
  position: "absolute",
  transform: "translateX(-50%) rotate(45deg)",
  width: "8px",
};

const routeActionButtonStyle = {
  alignItems: "center",
  background: "#ffffff",
  border: "1px solid #c9c9c9",
  borderRadius: "8px",
  color: "#303030",
  cursor: "pointer",
  display: "inline-flex",
  flex: "0 0 auto",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 650,
  justifyContent: "center",
  lineHeight: 1.2,
  minHeight: "30px",
  padding: "4px 12px",
  whiteSpace: "nowrap",
};

const routeDisabledActionButtonStyle = {
  ...routeActionButtonStyle,
  cursor: "not-allowed",
  opacity: 0.55,
};

const routeStatusBadgeStyle = {
  background: "#f1f1f1",
  borderRadius: "999px",
  color: "#616161",
  display: "inline-flex",
  fontSize: "12px",
  fontWeight: 650,
  padding: "3px 8px",
};

const routeReadyBadgeStyle = {
  ...routeStatusBadgeStyle,
  background: "#f1f1f1",
  color: "#616161",
};

const routeInProgressBadgeStyle = {
  ...routeStatusBadgeStyle,
  background: "#e0f0ff",
  color: "#00527c",
};

// A Ready route that was sent to its driver; its own colour, since In progress already uses the blue.
const routeDispatchedBadgeStyle = {
  ...routeStatusBadgeStyle,
  background: "#ebe6ff",
  color: "#4a2fb3",
};

const routeCompletedBadgeStyle = {
  ...routeStatusBadgeStyle,
  background: "#e3f1df",
  color: "#205c20",
};

const routeIncompleteBadgeStyle = {
  ...routeStatusBadgeStyle,
  ...getRouteStatusBadgeColors("INCOMPLETE"),
};

const routeCancelledBadgeStyle = {
  ...routeStatusBadgeStyle,
  background: "#fee9e8",
  color: "#8e1f0b",
};

const routesErrorStyle = {
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

function logRouteDeleteAction(name, metric = {}) {
  logStructuredMetric(name, metric);
}

async function measureRouteLoaderStep(load) {
  const startedAt = Date.now();
  const data = await load();
  return { data, durationMs: Date.now() - startedAt };
}

function roundRoutePerformance(duration) {
  return Number(Math.max(0, duration).toFixed(2));
}

export const loader = async ({ request }) => {
  const loaderStartedAt = Date.now();
  const url = new URL(request.url);
  if (url.pathname === "/app/routes/") {
    url.pathname = "/app/routes";
    return redirect(`${url.pathname}${url.search}${url.hash}`);
  }

  const authenticationStartedAt = Date.now();
  const { admin, session } = await authenticate.admin(request);
  const authenticationMs = Date.now() - authenticationStartedAt;
  const shopifyShopCacheKey = session?.shop;
  const refreshKey = getRouteListRefreshKey(getCleverAppId(), shopifyShopCacheKey);
  const requestedRefresh = readRouteListRefreshRequest(refreshKey, url);
  const refreshCache = requestedRefresh.length > 0;
  const [routePlanResult, routeGroupResult, departureLocationData, fallbackTimeZoneData] = await Promise.all([
    measureRouteLoaderStep(() =>
      fetchDeliveryRoutePlans(request, { cacheKey: shopifyShopCacheKey, refreshCache }),
    ),
    measureRouteLoaderStep(() =>
      fetchDeliveryRouteGroups(
        request,
        { view: "routes-list" },
        { cacheKey: shopifyShopCacheKey, refreshCache },
      ),
    ),
    fetchShopifyDepartureLocation(admin, { cacheKey: shopifyShopCacheKey }),
    fetchRouteFallbackTimeZone(admin, shopifyShopCacheKey),
  ]);
  const routePlanData = routePlanResult.data;
  const routeGroupData = routeGroupResult.data;
  const routeTimeZones = await resolveRouteListTimeZones({
    departureLocation: departureLocationData.departureLocation,
    fallbackTimeZoneData,
    routeGroups: routeGroupData.routeGroups,
    routePlans: routePlanData.routePlans,
  });
  const loaderData = {
    routeTimeZones,
    errors: [
      ...(routePlanData.errors ?? []),
      ...(routeGroupData.errors ?? []),
      ...(departureLocationData.errors ?? []),
      ...(fallbackTimeZoneData.errors ?? []),
    ],
    routeGroups: routeGroupData.routeGroups ?? [],
    routePlans: routePlanData.routePlans ?? [],
  };
  const routesPerformance = {
    apiReadCount: 2,
    authenticationMs,
    responseBytes: new TextEncoder().encode(JSON.stringify(loaderData)).byteLength,
    routeGroupsMs: routeGroupResult.durationMs,
    routePlansMs: routePlanResult.durationMs,
    totalMs: Date.now() - loaderStartedAt,
  };

  logStructuredMetric("routes.list.loader", {
    ...routesPerformance,
    routeGroupCount: loaderData.routeGroups.length,
    routePlanCount: loaderData.routePlans.length,
  });

  return {
    ...loaderData,
    routesRefresh: {
      key: refreshKey,
      requested: requestedRefresh,
      confirmed: getConfirmedRouteListRefresh(
        requestedRefresh,
        buildRouteRows(loaderData.routePlans, loaderData.routeGroups),
        [...(routePlanData.errors ?? []), ...(routeGroupData.errors ?? [])],
      ),
    },
    routesPerformance,
  };
};

export function shouldRevalidate(args) {
  if (isRouteListRefreshCleanup(args)) return false;
  if ((!args.formMethod || args.formMethod.toLowerCase() === "get")
    && /^\/app\/routes\/?$/.test(args.nextUrl?.pathname ?? "")
    && args.nextUrl.searchParams.has(ROUTE_LIST_REFRESH_PARAM)
    && args.currentUrl?.searchParams.get(ROUTE_LIST_REFRESH_PARAM) !== args.nextUrl.searchParams.get(ROUTE_LIST_REFRESH_PARAM)) return true;
  return shouldRevalidateRoutesRoute(args);
}

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_intent");
  const shopifySessionToken = formData.get("shopifySessionToken");

  if (intent !== "deleteRoutePlan") {
    return {
      routePlanId: null,
      errors: [{ message: "지원하지 않는 route 작업입니다." }],
    };
  }

  const routeDeleteTargets = parseRouteDeleteTargets(formData.get("routePlanIds"));
  if (routeDeleteTargets.length === 0) {
    return {
      routePlanIds: [],
      errors: [{ message: "삭제할 route를 선택해주세요." }],
    };
  }

  const routeGroupIds = new Set(routeDeleteTargets.filter((target) => target.type === "routeGroup").map((target) => target.id));
  const childRoutePlanIdsByGroupId = new Map();

  for (const target of routeDeleteTargets) {
    if (target.type !== "routeGroupChild" || routeGroupIds.has(target.routeGroupId)) continue;
    childRoutePlanIdsByGroupId.set(target.routeGroupId, [
      ...(childRoutePlanIdsByGroupId.get(target.routeGroupId) ?? []),
      target.routePlanId,
    ]);
  }

  logRouteDeleteAction("routes.delete.action.start", {
    childRoutePlanIdsByGroupId: Object.fromEntries(childRoutePlanIdsByGroupId),
    routeGroupIds: Array.from(routeGroupIds),
    routePlanIds: routeDeleteTargets.filter((target) => target.type === "routePlan").map((target) => target.id),
    targetCount: routeDeleteTargets.length,
  });

  const deleteResults = await Promise.all([
    ...routeDeleteTargets
      .filter((target) => target.type === "routeGroup")
      .map((target) => deleteDeliveryRouteGroup(request, target.id, { sessionToken: shopifySessionToken })),
    ...Array.from(childRoutePlanIdsByGroupId)
      .map(([routeGroupId, routePlanIds]) =>
        deleteDeliveryRouteGroupChildRoutes(request, routeGroupId, routePlanIds, { sessionToken: shopifySessionToken }),
      ),
    ...routeDeleteTargets
      .filter((target) => target.type === "routePlan")
      .map((target) => deleteDeliveryRoutePlan(request, target.id, { sessionToken: shopifySessionToken })),
  ]);
  const routePlanIds = deleteResults.map((result) => result.routePlanId ?? result.routeGroupId).filter(Boolean);
  const errors = deleteResults.flatMap((result) => result.errors ?? []);

  logRouteDeleteAction("routes.delete.action.done", {
    deletedIds: routePlanIds,
    errorCount: errors.length,
    targetCount: routeDeleteTargets.length,
  });

  return {
    routePlanIds,
    errors,
  };
};

function parseRouteDeleteTargets(value) {
  try {
    const parsedRoutePlanIds = JSON.parse(value ?? "[]");

    return Array.isArray(parsedRoutePlanIds)
      ? parsedRoutePlanIds
          .map(parseRouteDeleteTarget)
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function parseRouteDeleteTarget(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.startsWith("routeGroup:")) return { type: "routeGroup", id: text.slice("routeGroup:".length) };
  if (text.startsWith("routeGroupChild:")) {
    const [routeGroupId, routePlanId] = text
      .slice("routeGroupChild:".length)
      .split(":")
      .map((part) => decodeURIComponent(part));
    return routeGroupId && routePlanId ? { type: "routeGroupChild", routeGroupId, routePlanId } : null;
  }
  if (text.startsWith("routePlan:")) return { type: "routePlan", id: text.slice("routePlan:".length) };
  return { type: "routePlan", id: text };
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sumNumbers(values) {
  return values.reduce((total, value) => total + (numberOrNull(value) ?? 0), 0);
}

function sumOptionalNumbers(values) {
  let hasValue = false;
  const total = values.reduce((sum, value) => {
    const number = numberOrNull(value);
    if (number == null) return sum;

    hasValue = true;
    return sum + number;
  }, 0);

  return hasValue ? total : null;
}

function formatRouteDurationSeconds(totalSeconds) {
  const seconds = numberOrNull(totalSeconds);
  if (seconds == null) return "-";

  const roundedMinutes = Math.max(Math.round(seconds / 60), 0);
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;

  if (hours === 0) return `${remainingMinutes} min`;

  return `${hours} hr ${remainingMinutes} min`;
}

function formatRouteDistanceMeters(totalDistanceMeters) {
  const distanceMeters = numberOrNull(totalDistanceMeters);
  if (distanceMeters == null) return "-";

  const kilometers = distanceMeters / 1000;
  const roundedKilometers = Math.round(kilometers * 10) / 10;
  return `${Number.isInteger(roundedKilometers) ? roundedKilometers : roundedKilometers.toFixed(1)} km`;
}

function formatRouteAmount(totalAmount, currencyCode) {
  const amount = numberOrNull(totalAmount);
  if (amount == null || !currencyCode) return "-";

  try {
    return new Intl.NumberFormat("en-CA", {
      currency: currencyCode,
      style: "currency",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode ?? ""}`.trim();
  }
}

function formatRouteInstant(value, timeZone = "UTC") {
  return formatStoreInstant(value, timeZone, { empty: "-" });
}

function buildRoutesSummary(routeRows) {
  const activeRouteRows = routeRows.filter((route) => route.isClickable);
  const summaryRouteRows = activeRouteRows.filter((route) => route.isSummaryRoute ?? !route.isRouteGroup);

  return [
    { labelKey: "routes.summary.routes", value: String(summaryRouteRows.length) },
    { labelKey: "routes.summary.stops", value: String(sumNumbers(summaryRouteRows.map((route) => route.orders))) },
    { labelKey: "routes.summary.delivered", value: String(sumNumbers(summaryRouteRows.map((route) => route.delivered))) },
    { labelKey: "routes.summary.attempted", value: String(sumNumbers(summaryRouteRows.map((route) => route.attempted))) },
    {
      labelKey: "routes.summary.driveTime",
      value: formatRouteDurationSeconds(sumOptionalNumbers(summaryRouteRows.map((route) => route.driveTimeSeconds))),
    },
    {
      labelKey: "routes.summary.distance",
      value: formatRouteDistanceMeters(sumOptionalNumbers(summaryRouteRows.map((route) => route.distanceMeters))),
    },
  ];
}

function formatLocalizedRouteGroupSummary(language, route, routeGroupById) {
  const routeGroup = routeGroupById.get(String(route?.routeGroupId));
  const routeCount = getVisibleRouteGroupChildren(routeGroup).length;

  return translate(
    language,
    routeCount === 1 ? "routes.group.summary.one" : "routes.group.summary.many",
    { routeCount, stopCount: route?.orders ?? 0 },
  );
}

function getRouteFilters(searchParams) {
  return {
    driverId: searchParams.get("driverId"),
    status: searchParams.get("status"),
  };
}

function normalizeRouteStatus(status) {
  return formatRouteStatus(status).toUpperCase().replace(/\s+/g, "_");
}

function filterRouteRows(routeRows, routeFilters) {
  if (!routeFilters.status && !routeFilters.driverId) return routeRows;

  const filteredRows = routeRows.filter((route) => {
    if (!route.isClickable) return false;
    if (
      routeFilters.status &&
      normalizeRouteStatus(route.status) !== normalizeRouteStatus(routeFilters.status)
    ) {
      return false;
    }

    if (routeFilters.driverId && route.driverId !== routeFilters.driverId) {
      return false;
    }

    return true;
  });

  return filteredRows.length > 0
    ? filteredRows
    : [
      {
        id: "empty-filtered-route-plans",
        isClickable: false,
        isDeletable: false,
        route: "No matching routes",
        status: routeFilters.status ? formatRouteStatus(routeFilters.status) : "Filtered",
        orders: 0,
        coordinates: "0/0",
        missingCoordinates: 0,
        deliveryArea: "-",
        deliveryDate: "-",
        start: "Shopify departure location",
        end: "Loop back to start",
        driver: routeFilters.driverId ?? "-",
        driverId: null,
        plannedFor: "-",
        created: "-",
      },
    ];
}

function isDispatchedReadyRoute(route) {
  return formatRouteStatus(route.status) === "Ready" && Boolean(route.publishedAt);
}

function getRouteStatusKey(route) {
  return isDispatchedReadyRoute(route) ? "dispatched" : formatRouteStatus(route.status).toLowerCase().replaceAll(" ", "_");
}

function getStatusBadgeStyle(route) {
  if (isDispatchedReadyRoute(route)) return routeDispatchedBadgeStyle;
  switch (formatRouteStatus(route.status)) {
    case "Ready":
      return routeReadyBadgeStyle;
    case "In progress":
      return routeInProgressBadgeStyle;
    case "Completed":
      return routeCompletedBadgeStyle;
    case "Incomplete":
      return routeIncompleteBadgeStyle;
    case "Cancelled":
      return routeCancelledBadgeStyle;
    default:
      return routeStatusBadgeStyle;
  }
}

export default function RoutesPage() {
  const storeTimeZone = useStoreTimeZone();
  const language = useRouteLoaderData("routes/app")?.language ?? "en";
  const kfoodOfficeEnabled = useRouteLoaderData("routes/app")?.kfoodOfficeEnabled === true;
  const navigate = useNavigate();
  const { routeId, routeGroupId } = useParams();
  const [searchParams] = useSearchParams();
  const {
    routeGroups = [],
    routePlans = [],
    routeTimeZones = {},
    errors = [],
    routesPerformance: serverRoutesPerformance,
    routesRefresh,
  } = useLoaderData();
  const revalidator = useRevalidator();
  const refreshAttemptRef = useRef(null);
  const [hasPendingListRefresh, setHasPendingListRefresh] = useState(false);
  const routeGroupById = new Map(routeGroups.map((routeGroup) => [String(routeGroup?.id), routeGroup]));
  const shopify = useAppBridge();
  const routeDeleteFetcher = useFetcher();
  const [checkedRouteIds, setCheckedRouteIds] = useState([]);
  const [routeGroupMarkerTooltip, setRouteGroupMarkerTooltip] = useState(null);
  const [routesPerformance, setRoutesPerformance] = useState(null);
  const allRouteRows = buildRouteRows(routePlans, routeGroups);
  const routesSummary = buildRoutesSummary(allRouteRows);
  const routeFilters = getRouteFilters(searchParams);
  const routeRows = filterRouteRows(allRouteRows, routeFilters);
  const routeColumnWidths = getRouteColumnWidths(routeRows, kfoodOfficeEnabled);
  const selectableRouteRows = routeRows.filter((route) => route.isClickable && route.isDeletable !== false);
  const checkedRouteIdSet = new Set(getExpandedRouteDeleteKeys(routeRows, checkedRouteIds));
  const selectedRouteCount = selectableRouteRows.filter((route) => checkedRouteIdSet.has(route.deleteKey)).length;
  const routeDeleteTargetIds = getRouteDeletePayloadKeys(allRouteRows, checkedRouteIds);
  const allVisibleRoutesChecked =
    selectableRouteRows.length > 0 &&
    selectableRouteRows.every((route) => checkedRouteIdSet.has(route.deleteKey));
  const routeDeleteDisabled =
    routeDeleteTargetIds.length === 0 || routeDeleteFetcher.state !== "idle";
  const actionErrors = [
    ...(routeDeleteFetcher.data?.errors ?? []),
  ];
  const visibleErrors = [...errors, ...actionErrors];
  const routesNoticeMessage = getServiceErrorNotice(
    [{ errors: visibleErrors }],
    { context: "routes_page" },
  );
  const isRoutesIndex = !routeId && !routeGroupId;

  useEffect(() => {
    if (!isRoutesIndex) {
      refreshAttemptRef.current = null;
      return;
    }
    confirmRouteListRefresh(routesRefresh?.key, routesRefresh?.confirmed);
    const pending = readRouteListRefresh(routesRefresh?.key);
    setHasPendingListRefresh(pending.length > 0);
    if (!pending.length && searchParams.has(ROUTE_LIST_REFRESH_PARAM)) {
      const cleanSearch = new URLSearchParams(searchParams);
      cleanSearch.delete(ROUTE_LIST_REFRESH_PARAM);
      navigate(withEmbeddedShopifyContext(`/app/routes?${cleanSearch}`, searchParams), { replace: true });
      return;
    }
    const signature = JSON.stringify(pending);
    if (pending.length && revalidator.state === "idle"
      && !routeListRefreshWasAttempted(pending, routesRefresh?.requested)
      && refreshAttemptRef.current !== signature) {
      refreshAttemptRef.current = signature;
      const refreshSearch = new URLSearchParams(searchParams);
      refreshSearch.set(ROUTE_LIST_REFRESH_PARAM, JSON.stringify({ key: routesRefresh.key, pending }));
      navigate(withEmbeddedShopifyContext(`/app/routes?${refreshSearch}`, searchParams), { replace: true });
    }
  }, [isRoutesIndex, navigate, revalidator.state, routesRefresh, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof performance === "undefined") return undefined;

    const markRoutesHistoryNavigation = () => {
      window.__cleverRoutesEntryStartedAt = performance.now();
    };
    window.addEventListener("popstate", markRoutesHistoryNavigation);
    return () => window.removeEventListener("popstate", markRoutesHistoryNavigation);
  }, []);

  useEffect(() => {
    if (!isRoutesIndex || typeof performance === "undefined") return undefined;

    const frame = requestAnimationFrame(() => {
      const usableAt = performance.now();
      const navigationEntry = performance.getEntriesByType("navigation")[0];
      const resourceEntries = performance.getEntriesByType("resource");
      const routeEntryStartedAt = window.__cleverRoutesEntryStartedAt;
      const routesDataEntry = resourceEntries
        .filter(
          (entry) =>
            entry.name.includes("/app/routes.data") &&
            (routeEntryStartedAt == null || entry.startTime >= routeEntryStartedAt),
        )
        .at(-1);
      const isRetainedNavigation = routeEntryStartedAt != null && !routesDataEntry;
      const startAt = routeEntryStartedAt ?? routesDataEntry?.startTime ?? navigationEntry?.startTime ?? 0;
      const responseEnd = routesDataEntry?.responseEnd ?? (isRetainedNavigation ? startAt : navigationEntry?.responseEnd) ?? usableAt;
      const measuredResources = resourceEntries.filter(
        (entry) => entry.startTime >= startAt && entry.startTime <= usableAt,
      );

      setRoutesPerformance(JSON.stringify({
        browser: {
          decodedResponseBytes: Math.round(
            routesDataEntry?.decodedBodySize ?? navigationEntry?.decodedBodySize ?? 0,
          ),
          renderMs: roundRoutePerformance(usableAt - responseEnd),
          requestCount: measuredResources.length + (routeEntryStartedAt == null && !routesDataEntry ? 1 : 0),
          responseBytes: Math.round(
            routesDataEntry?.transferSize ?? (isRetainedNavigation ? 0 : navigationEntry?.transferSize) ?? 0,
          ),
          tableUsableMs: roundRoutePerformance(usableAt - startAt),
        },
        server: isRetainedNavigation ? null : serverRoutesPerformance ?? null,
      }));
      delete window.__cleverRoutesEntryStartedAt;
    });

    return () => cancelAnimationFrame(frame);
  }, [isRoutesIndex, serverRoutesPerformance]);

  useEffect(() => {
    if (routeDeleteFetcher.state !== "idle" || !routeDeleteFetcher.data) return;
    if ((routeDeleteFetcher.data.errors ?? []).length > 0) return;

    setCheckedRouteIds([]);
  }, [routeDeleteFetcher.data, routeDeleteFetcher.state]);

  function navigateRouteDetail(route) {
    navigate(withEmbeddedShopifyContext(route.href, searchParams));
  }

  function handleRouteRowClick(route) {
    if (!route.isClickable) return;

    navigateRouteDetail(route);
  }

  function handleRouteRowKeyDown(event, route) {
    if (!route.isClickable) return;
    if (event.target?.tagName === "INPUT") return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    navigateRouteDetail(route);
  }

  function openRouteGroupMarkerTooltip(event, route) {
    if (!route.groupAccentColor || !route.groupSummary) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    setRouteGroupMarkerTooltip({
      left: bounds.left + bounds.width / 2,
      text: formatLocalizedRouteGroupSummary(language, route, routeGroupById),
      top: bounds.top - 8,
    });
  }

  function closeRouteGroupMarkerTooltip() {
    setRouteGroupMarkerTooltip(null);
  }

  function toggleRouteCheck(route) {
    setCheckedRouteIds((currentRouteIds) =>
      toggleRouteSelection(routeRows, currentRouteIds, route),
    );
  }

  function toggleAllVisibleRouteChecks() {
    setCheckedRouteIds((currentRouteIds) => {
      const visibleRouteIds = new Set(selectableRouteRows.map((route) => route.deleteKey));

      if (allVisibleRoutesChecked) {
        return currentRouteIds.filter((routeId) => !visibleRouteIds.has(routeId));
      }

      return Array.from(
        new Set([
          ...currentRouteIds.filter((routeId) => !visibleRouteIds.has(routeId)),
          ...getPrimaryRouteSelectionKeys(selectableRouteRows),
        ]),
      );
    });
  }

  async function handleDeleteSelectedRoutes() {
    if (routeDeleteDisabled) return;

    const formData = new FormData();
    formData.set("_intent", "deleteRoutePlan");
    formData.set("routePlanIds", JSON.stringify(routeDeleteTargetIds));

    try {
      const sessionToken = await shopify.idToken();
      formData.set("shopifySessionToken", sessionToken);
    } catch {
      // The server action still returns an actionable auth error when the token cannot be fetched.
    }

    routeDeleteFetcher.submit(formData, { method: "post" });
  }

  if (!isRoutesIndex) return <Outlet />;

  return (
    <main data-routes-performance={routesPerformance ?? undefined} style={routesTablePageStyle}>
      <div style={routesPageContentStyle}>
        <header className="tab-layout-header" style={routesHeaderStyle}>
          <div style={routesHeaderBarStyle}>
            <h1 style={routesTitleStyle}>{translate(language, "routes.list.title")}</h1>
            <div style={routesHeaderActionsStyle}>
              <span style={routeSelectionSummaryStyle}>
                {translate(language, "routes.list.selectedCount", { count: selectedRouteCount })}
              </span>
              <button
                type="button"
                style={routeDeleteDisabled ? routeDisabledActionButtonStyle : routeActionButtonStyle}
                disabled={routeDeleteDisabled}
                onClick={handleDeleteSelectedRoutes}
              >{translate(language, routeDeleteFetcher.state !== "idle" ? "routes.list.deleting" : "routes.list.delete")}</button>
            </div>
          </div>
        </header>

        {routesNoticeMessage ? (
          <div style={routesErrorStyle}>{routesNoticeMessage}</div>
        ) : null}
        {hasPendingListRefresh ? (
          <div role="status" style={routesErrorStyle}>
            {translate(language, "routes.list.refreshPending")}{" "}
            <button disabled={revalidator.state !== "idle"} onClick={() => revalidator.revalidate()} type="button">
              {translate(language, "routes.list.refreshRetry")}
            </button>
          </div>
        ) : null}

        <section aria-label="Routes summary" style={routesSummaryCardsStyle}>
          {routesSummary.map((summaryItem) => (
            <div key={summaryItem.labelKey} style={routesSummaryCardStyle}>
              <span style={routesSummaryLabelStyle}>{translate(language, summaryItem.labelKey)}</span>
              <strong style={routesSummaryValueStyle}>{summaryItem.value}</strong>
            </div>
          ))}
        </section>

        <div style={routesTableFrameStyle}>
          <div style={routeTableScrollStyle}>
            <table style={singleRouteTableStyle}>
              <colgroup>
                {routeColumnWidths.map((width, index) => (
                  <col key={`${width}-${index}`} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" style={routeCheckboxHeaderCellStyle}>
                    <input
                      type="checkbox"
                      aria-label="Select all visible routes"
                      checked={allVisibleRoutesChecked}
                      disabled={selectableRouteRows.length === 0}
                      onChange={toggleAllVisibleRouteChecks}
                    />
                  </th>
                  <th style={routeTableHeaderCellStyle}>{translate(language, "routes.table.name")}</th>
                  <th style={routeTableHeaderCellStyle}>{translate(language, "routes.table.status")}</th>
                  <th style={routeTableHeaderCellStyle}>{translate(language, "routes.table.driver")}</th>
                  <th style={routeTableHeaderCellStyle}>{translate(language, "routes.table.startTime")}</th>
                  <th style={routeNumberHeaderCellStyle}>{translate(language, "routes.table.stops")}</th>
                  <th style={routeNumberHeaderCellStyle}>{translate(language, "routes.table.totalItems")}</th>
                  <th style={routeTableHeaderCellStyle}>{translate(language, "routes.table.totalDriveTime")}</th>
                  <th style={routeTableHeaderCellStyle}>{translate(language, "routes.table.totalDistance")}</th>
                  <th style={routeTableHeaderCellStyle}>{translate(language, "routes.table.totalPrice")}</th>
                  {kfoodOfficeEnabled ? <th style={routeTableHeaderCellStyle}>Cash</th> : null}
                  <th style={routeTableHeaderCellStyle}>{translate(language, "routes.table.created")}</th>
                  <th style={routeTableHeaderCellStyle}>{translate(language, "routes.table.lastModified")}</th>
                </tr>
              </thead>
              <tbody>
                {routeRows.map((route) => (
                  <tr
                    key={route.rowKey ?? route.id}
                    aria-label={route.isClickable ? `Open ${route.route} detail` : undefined}
                    className={route.isClickable ? "route-table-row" : undefined}
                    onClick={() => handleRouteRowClick(route)}
                    onKeyDown={(event) => handleRouteRowKeyDown(event, route)}
                    role={route.isClickable ? "link" : undefined}
                    tabIndex={route.isClickable ? 0 : undefined}
                  >
                    <td style={routeCheckboxCellStyle}>
                      {route.isClickable && route.isDeletable !== false ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${route.route} for deletion`}
                          checked={checkedRouteIdSet.has(route.deleteKey)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleRouteCheck(route)}
                        />
                      ) : null}
                    </td>
                    <td style={routeNameCellStyle}>
                      <span style={route.groupAccentColor ? routeNameContentWithBandStyle : routeNameContentStyle}>
                        {route.groupAccentColor ? (
                          <span
                            aria-hidden="true"
                            onMouseEnter={(event) => openRouteGroupMarkerTooltip(event, route)}
                            onMouseLeave={closeRouteGroupMarkerTooltip}
                            style={{ ...routeGroupMarkerStyle, background: route.groupAccentColor }}
                          ></span>
                        ) : null}
                        <span>{route.isClickable ? route.route : translate(language, route.id === "empty-filtered-route-plans" ? "routes.empty.filtered" : "routes.empty.all")}</span>
                      </span>
                    </td>
                    <td style={routeTableCellStyle}>
                      <span style={getStatusBadgeStyle(route)}>{route.isClickable ? translate(language, `routes.status.${getRouteStatusKey(route)}`) : "-"}</span>
                    </td>
                    <td style={routeTableCellStyle}>{route.driver ?? "-"}</td>
                    <td style={routeTableCellStyle}>{formatRouteInstant(route.startTime, route.startTimeZone ?? routeTimeZones[route.id])}</td>
                    <td style={routeNumberCellStyle}>{route.orders ?? "-"}</td>
                    <td style={routeNumberCellStyle}>{route.totalItems ?? "-"}</td>
                    <td style={routeTableCellStyle}>{formatRouteDurationSeconds(route.driveTimeSeconds)}</td>
                    <td style={routeTableCellStyle}>{formatRouteDistanceMeters(route.distanceMeters)}</td>
                    <td style={routeTableCellStyle}>{formatRouteAmount(route.totalAmount, route.currencyCode)}</td>
                    {kfoodOfficeEnabled ? <td style={{ ...routeTableCellStyle, whiteSpace: "nowrap" }}><RouteCashSummary summary={route.cashSettlementSummary} /></td> : null}
                    <td style={routeTableCellStyle}>{formatRouteInstant(route.createdAt, storeTimeZone)}</td>
                    <td style={routeTableCellStyle}>{formatRouteInstant(route.updatedAt, storeTimeZone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {routeGroupMarkerTooltip && typeof document !== "undefined" ? createPortal(
        <div
          role="tooltip"
          style={{
            ...routeGroupMarkerTooltipStyle,
            left: `${Math.round(routeGroupMarkerTooltip.left)}px`,
            top: `${Math.round(routeGroupMarkerTooltip.top)}px`,
          }}
        >
          {routeGroupMarkerTooltip.text}
          <span aria-hidden="true" style={routeGroupMarkerTooltipArrowStyle}></span>
        </div>,
        document.body,
      ) : null}
    </main>
  );
}

export const ErrorBoundary = AdminRouteErrorBoundary;

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
