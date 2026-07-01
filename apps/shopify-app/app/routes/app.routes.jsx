import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Outlet, redirect, useFetcher, useLoaderData, useNavigate, useParams, useRouteError, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  formatRouteDeliveryScope,
  formatRouteStatus,
  getRouteGroupChildRoutePlanId,
  getRouteGroupChildRouteName,
  getRouteGroupChildren,
  getVisibleRouteGroupChildren,
} from "../features/delivery/route-helpers";
import { appendIdToken, routeGroupChildPath, routeGroupPath, routePlanPath } from "../features/delivery/route-paths";
import { deleteDeliveryRoutePlan, fetchDeliveryRoutePlans } from "../features/delivery/route-plans.server";
import { deleteDeliveryRouteGroup, fetchDeliveryRouteGroups } from "../features/delivery/route-groups.server";
import { getServiceErrorNotice } from "../features/service-errors";
import { authenticate } from "../shopify.server";

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

const createRoutesButtonStyle = {
  alignItems: "center",
  background: "#303030",
  border: "1px solid #303030",
  borderRadius: "8px",
  color: "#ffffff",
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

function getRouteColumnWidths(routeRows) {
  return [
    "44px",
    getRouteNameColumnWidth(routeRows),
    "104px",
    "84px",
    "56px",
    "1%",
    "1%",
    "128px",
    "128px",
  ];
}

const singleRouteTableStyle = {
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: "996px",
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
  padding: "8px 8px",
  textOverflow: "ellipsis",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const routeNameCellStyle = {
  ...routeTableCellStyle,
  fontWeight: 650,
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
  padding: "8px 3px",
  textAlign: "center",
  textOverflow: "clip",
};

const routeCheckboxHeaderCellStyle = {
  ...routeTableHeaderCellStyle,
  padding: "7px 3px",
  textAlign: "center",
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
  background: "#eaf4ff",
  borderRadius: "999px",
  color: "#174a7c",
  display: "inline-flex",
  fontSize: "12px",
  fontWeight: 650,
  padding: "3px 8px",
};

const routeWaitingBadgeStyle = {
  ...routeStatusBadgeStyle,
  background: "#f1f1f1",
  color: "#616161",
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

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  if (url.pathname === "/app/routes/") {
    url.pathname = "/app/routes";
    return redirect(`${url.pathname}${url.search}${url.hash}`);
  }

  const { session } = await authenticate.admin(request);
  const shopifyShopCacheKey = session?.shop;
  const [routePlanData, routeGroupData] = await Promise.all([
    fetchDeliveryRoutePlans(request, { cacheKey: shopifyShopCacheKey }),
    fetchDeliveryRouteGroups(request, {}, { cacheKey: shopifyShopCacheKey }),
  ]);

  return {
    errors: [...(routePlanData.errors ?? []), ...(routeGroupData.errors ?? [])],
    routeGroups: routeGroupData.routeGroups ?? [],
    routePlans: routePlanData.routePlans ?? [],
  };
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_intent");

  if (intent !== "deleteRoutePlan") {
    return {
      routePlanId: null,
      errors: [{ message: "지원하지 않는 route 작업입니다." }],
    };
  }

  const routeDeleteTargets = parseRouteDeleteTargets(formData.get("routePlanIds"));
  const shopifySessionToken = formData.get("shopifySessionToken");

  if (routeDeleteTargets.length === 0) {
    return {
      routePlanIds: [],
      errors: [{ message: "삭제할 route를 선택해주세요." }],
    };
  }

  const deleteResults = await Promise.all(
    routeDeleteTargets.map((target) =>
      target.type === "routeGroup"
        ? deleteDeliveryRouteGroup(request, target.id, { sessionToken: shopifySessionToken })
        : deleteDeliveryRoutePlan(request, target.id, { sessionToken: shopifySessionToken }),
    ),
  );

  return {
    routePlanIds: deleteResults.map((result) => result.routePlanId ?? result.routeGroupId).filter(Boolean),
    errors: deleteResults.flatMap((result) => result.errors ?? []),
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
  if (text.startsWith("routePlan:")) return { type: "routePlan", id: text.slice("routePlan:".length) };
  return { type: "routePlan", id: text };
}

function getRouteDeleteKey(route) {
  const routeGroupId = route?.routeGroupingChild?.groupingId;
  if (routeGroupId) return `routeGroup:${routeGroupId}`;
  return route?.isRouteGroup ? `routeGroup:${route.id}` : `routePlan:${route.id}`;
}

function formatRouteValues(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "-";
}

function formatRouteDate(value) {
  if (!value) return "-";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toISOString().slice(0, 10);
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number != null) return number;
  }

  return null;
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

function readRouteMetrics(routePlan) {
  const routeMetrics = routePlan?.routeMetrics ?? null;
  return {
    distanceMeters: firstNumber(routeMetrics?.distanceMeters),
    durationSeconds: firstNumber(routeMetrics?.durationSeconds),
  };
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

function formatRouteTableDate(routePlan) {
  const deliveryScope = formatRouteDeliveryScope(routePlan);
  return deliveryScope !== "-" ? deliveryScope : formatRouteDate(routePlan?.planDate);
}

function formatRouteDriver(driver) {
  const displayName = String(driver?.displayName ?? "").trim();
  const phone = String(driver?.phone ?? "").trim();

  return displayName || phone || "-";
}

function getRouteGroupTotalOrders(routeGroup) {
  return Number(routeGroup?.totalOrders ?? routeGroup?.ordersCount ?? routeGroup?.assignments?.length ?? 0) || 0;
}

function buildRouteRows(routePlans, routeGroups = []) {
  const safeRouteGroups = Array.isArray(routeGroups) ? routeGroups : [];
  const childRoutePlanIds = new Set(
    safeRouteGroups.flatMap((routeGroup) =>
      getRouteGroupChildren(routeGroup).map(getRouteGroupChildRoutePlanId).filter(Boolean),
    ),
  );
  const standaloneRoutePlans = Array.isArray(routePlans)
    ? routePlans.filter((routePlan) => !childRoutePlanIds.has(routePlan.id))
    : [];
  const routeChildRows = safeRouteGroups.flatMap((routeGroup) =>
    getVisibleRouteGroupChildren(routeGroup)
      .map((child, index) => {
        const routePlanId = getRouteGroupChildRoutePlanId(child);
        const routePlan = child.routePlan ?? {};
        const routeMetrics = readRouteMetrics({ ...routePlan, routeMetrics: child.routeMetrics ?? routePlan.routeMetrics });
        const stopsCount = child.stopsCount ?? routePlan.stopsCount ?? 0;
        const missingCoordinates = routePlan.missingCoordinates ?? 0;
        const locatedCount = Math.max(stopsCount - missingCoordinates, 0);

        return {
          id: routePlanId,
          rowKey: `routePlan:${routePlanId}`,
          href: routeGroupChildPath(routeGroup.id, routePlanId),
          isClickable: true,
          isDeletable: true,
          deleteKey: `routePlan:${routePlanId}`,
          parentRouteGroupId: routeGroup.id,
          route: getRouteGroupChildRouteName(routeGroup, child, routePlan, index),
          status: child.displayStatus ?? routePlan.status ?? "DRAFT",
          orders: stopsCount,
          coordinates: `${locatedCount}/${stopsCount}`,
          delivered: 0,
          attempted: 0,
          missingCoordinates,
          date: formatRouteTableDate(routePlan),
          deliveryArea: formatRouteValues(routePlan.deliveryAreas),
          driver: formatRouteDriver({ displayName: child.driverName }),
          driverId: child.driverId ?? routePlan.driverId ?? null,
          driveTimeSeconds: routeMetrics.durationSeconds,
          distanceMeters: routeMetrics.distanceMeters,
        };
      }),
  );
  const routeGroupMetricsById = new Map(
    safeRouteGroups.map((routeGroup) => {
      const childRows = routeChildRows.filter((routeRow) => routeRow.parentRouteGroupId === routeGroup.id);
      return [
        routeGroup.id,
        {
          distanceMeters: sumOptionalNumbers(childRows.map((routeRow) => routeRow.distanceMeters)),
          durationSeconds: sumOptionalNumbers(childRows.map((routeRow) => routeRow.driveTimeSeconds)),
        },
      ];
    }),
  );
  const routeGroupRows = safeRouteGroups.map((routeGroup) => {
    const routeMetrics = routeGroupMetricsById.get(routeGroup.id) ?? {};
    return {
      id: routeGroup.id,
      rowKey: `routeGroup:${routeGroup.id}`,
      routeGroupId: routeGroup.id,
      href: routeGroupPath(routeGroup.id),
      isClickable: true,
      isDeletable: true,
      isRouteGroup: true,
      deleteKey: getRouteDeleteKey({ ...routeGroup, isRouteGroup: true }),
      route: routeGroup.name ?? routeGroup.id,
      status: routeGroup.displayStatus ?? routeGroup.status ?? "DRAFT",
      orders: getRouteGroupTotalOrders(routeGroup),
      coordinates: "-",
      delivered: 0,
      attempted: 0,
      missingCoordinates: 0,
      date: formatRouteGroupDate(routeGroup),
      deliveryArea: "-",
      driver: "-",
      driverId: null,
      driveTimeSeconds: routeMetrics.durationSeconds ?? null,
      distanceMeters: routeMetrics.distanceMeters ?? null,
    };
  });

  if (standaloneRoutePlans.length === 0 && routeGroupRows.length === 0 && routeChildRows.length === 0) {
    return [
      {
        id: "empty-route-plans",
        isClickable: false,
        isDeletable: false,
        route: "No routes",
        status: "Waiting",
        orders: 0,
        date: "-",
        deliveryArea: "-",
        driver: "-",
        driverId: null,
        driveTimeSeconds: null,
        distanceMeters: null,
      },
    ];
  }

  const routePlanRows = standaloneRoutePlans.map((routePlan) => {
    const routeMetrics = readRouteMetrics(routePlan);
    const stopsCount = routePlan.stopsCount ?? 0;
    const missingCoordinates = routePlan.missingCoordinates ?? 0;
    const locatedCount = Math.max(stopsCount - missingCoordinates, 0);
    const delivered = firstNumber(
      routePlan.deliveredCount,
      routePlan.deliveredStopsCount,
      routePlan.metrics?.deliveredCount,
      routePlan.metrics?.deliveredStopsCount,
    ) ?? 0;
    const attempted = firstNumber(
      routePlan.attemptedCount,
      routePlan.attemptedStopsCount,
      routePlan.metrics?.attemptedCount,
      routePlan.metrics?.attemptedStopsCount,
    ) ?? 0;

    return {
      id: routePlan.id,
      rowKey: `routePlan:${routePlan.id}`,
      href: routePlanPath(routePlan.id),
      isClickable: true,
      isDeletable: true,
      deleteKey: getRouteDeleteKey(routePlan),
      route: routePlan.name ?? routePlan.id,
      status: routePlan.status ?? "DRAFT",
      orders: stopsCount,
      coordinates: `${locatedCount}/${stopsCount}`,
      delivered,
      attempted,
      missingCoordinates,
      date: formatRouteTableDate(routePlan),
      deliveryArea: formatRouteValues(routePlan.deliveryAreas),
      driver: formatRouteDriver(routePlan.driver),
      driverId: routePlan.driverId ?? routePlan.driver?.id ?? null,
      driveTimeSeconds: routeMetrics.durationSeconds,
      distanceMeters: routeMetrics.distanceMeters,
    };
  });
  return [...routeGroupRows, ...routeChildRows, ...routePlanRows];
}

function formatRouteGroupDate(routeGroup) {
  const start = routeGroup?.dateRangeStart ?? routeGroup?.planDate;
  const end = routeGroup?.dateRangeEnd ?? start;
  if (!start) return "-";
  return start === end ? start : `${start} ~ ${end}`;
}

function buildRoutesSummary(routeRows) {
  const activeRouteRows = routeRows.filter((route) => route.isClickable);
  const summaryRouteRows = activeRouteRows.filter((route) => !route.isRouteGroup);

  return [
    { label: "Routes", value: String(summaryRouteRows.length) },
    { label: "Stops", value: String(sumNumbers(summaryRouteRows.map((route) => route.orders))) },
    { label: "Delivered", value: String(sumNumbers(summaryRouteRows.map((route) => route.delivered))) },
    { label: "Attempted", value: String(sumNumbers(summaryRouteRows.map((route) => route.attempted))) },
    {
      label: "Drive time",
      value: formatRouteDurationSeconds(sumOptionalNumbers(summaryRouteRows.map((route) => route.driveTimeSeconds))),
    },
    {
      label: "Distance",
      value: formatRouteDistanceMeters(sumOptionalNumbers(summaryRouteRows.map((route) => route.distanceMeters))),
    },
  ];
}

function getRouteFilters(searchParams) {
  return {
    driverId: searchParams.get("driverId"),
    status: searchParams.get("status"),
  };
}

function normalizeRouteStatus(status) {
  return String(status ?? "").trim().toUpperCase().replace(/\s+/g, "_");
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
        status: routeFilters.status ?? "Filtered",
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

function getStatusBadgeStyle(status) {
  return formatRouteStatus(status) === "DRAFT" ? routeStatusBadgeStyle : routeWaitingBadgeStyle;
}

function createRouteDetailHref(route, idToken) {
  return appendIdToken(route.href, idToken);
}

export default function RoutesPage() {
  const navigate = useNavigate();
  const { routeId, routeGroupId } = useParams();
  const [searchParams] = useSearchParams();
  const { routeGroups = [], routePlans = [], errors = [] } = useLoaderData();
  const shopify = useAppBridge();
  const routeDeleteFetcher = useFetcher();
  const [checkedRouteIds, setCheckedRouteIds] = useState([]);
  const allRouteRows = buildRouteRows(routePlans, routeGroups);
  const routesSummary = buildRoutesSummary(allRouteRows);
  const routeFilters = getRouteFilters(searchParams);
  const routeRows = filterRouteRows(allRouteRows, routeFilters);
  const routeColumnWidths = getRouteColumnWidths(routeRows);
  const selectableRouteRows = routeRows.filter((route) => route.isClickable && route.isDeletable !== false);
  const checkedRouteIdSet = new Set(checkedRouteIds);
  const allVisibleRoutesChecked =
    selectableRouteRows.length > 0 &&
    selectableRouteRows.every((route) => checkedRouteIdSet.has(route.deleteKey));
  const routeDeleteDisabled =
    checkedRouteIds.length === 0 || routeDeleteFetcher.state !== "idle";
  const actionErrors = routeDeleteFetcher.data?.errors ?? [];
  const visibleErrors = [...errors, ...actionErrors];
  const routesNoticeMessage = getServiceErrorNotice(
    [{ errors: visibleErrors }],
    { context: "routes_page" },
  );

  useEffect(() => {
    if (routeDeleteFetcher.state !== "idle" || !routeDeleteFetcher.data) return;
    if ((routeDeleteFetcher.data.errors ?? []).length > 0) return;

    setCheckedRouteIds([]);
  }, [routeDeleteFetcher.data, routeDeleteFetcher.state]);

  function navigateRouteDetail(route) {
    const fallbackIdToken = searchParams.get("id_token");

    shopify.idToken()
      .then((idToken) => navigate(createRouteDetailHref(route, idToken)))
      .catch(() => navigate(createRouteDetailHref(route, fallbackIdToken)));
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

  function handleCreateRoutesClick() {
    navigate("/app/orders");
  }

  function toggleRouteCheck(routeId) {
    setCheckedRouteIds((currentRouteIds) =>
      currentRouteIds.includes(routeId)
        ? currentRouteIds.filter((currentRouteId) => currentRouteId !== routeId)
        : [...currentRouteIds, routeId],
    );
  }

  function toggleAllVisibleRouteChecks() {
    setCheckedRouteIds((currentRouteIds) => {
      if (allVisibleRoutesChecked) {
        const visibleRouteIds = new Set(selectableRouteRows.map((route) => route.deleteKey));
        return currentRouteIds.filter((routeId) => !visibleRouteIds.has(routeId));
      }

      return Array.from(
        new Set([
          ...currentRouteIds,
          ...selectableRouteRows.map((route) => route.deleteKey),
        ]),
      );
    });
  }

  async function handleDeleteSelectedRoutes() {
    if (routeDeleteDisabled) return;

    const formData = new FormData();
    formData.set("_intent", "deleteRoutePlan");
    formData.set("routePlanIds", JSON.stringify(checkedRouteIds));

    try {
      const sessionToken = await shopify.idToken();
      formData.set("shopifySessionToken", sessionToken);
    } catch {
      // The server action still returns an actionable auth error when the token cannot be fetched.
    }

    routeDeleteFetcher.submit(formData, { method: "post" });
  }

  if (routeId || routeGroupId) return <Outlet />;

  return (
    <main style={routesTablePageStyle}>
      <div style={routesPageContentStyle}>
        <header className="tab-layout-header" style={routesHeaderStyle}>
          <div style={routesHeaderBarStyle}>
            <h1 style={routesTitleStyle}>Routes</h1>
            <div style={routesHeaderActionsStyle}>
              <span style={routeSelectionSummaryStyle}>
                {checkedRouteIds.length} selected
              </span>
              <button
                type="button"
                style={routeDeleteDisabled ? routeDisabledActionButtonStyle : routeActionButtonStyle}
                disabled={routeDeleteDisabled}
                onClick={handleDeleteSelectedRoutes}
              >Delete</button>
              <button type="button" style={createRoutesButtonStyle} onClick={handleCreateRoutesClick}>Create routes</button>
            </div>
          </div>
        </header>

        {routesNoticeMessage ? (
          <div style={routesErrorStyle}>{routesNoticeMessage}</div>
        ) : null}

        <section aria-label="Routes summary" style={routesSummaryCardsStyle}>
          {routesSummary.map((summaryItem) => (
            <div key={summaryItem.label} style={routesSummaryCardStyle}>
              <span style={routesSummaryLabelStyle}>{summaryItem.label}</span>
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
                  <th style={routeTableHeaderCellStyle}>Route</th>
                  <th style={routeTableHeaderCellStyle}>Date</th>
                  <th style={routeTableHeaderCellStyle}>Status</th>
                  <th style={routeNumberHeaderCellStyle}>Orders</th>
                  <th style={routeTableHeaderCellStyle}>Area</th>
                  <th style={routeTableHeaderCellStyle}>Driver</th>
                  <th style={routeTableHeaderCellStyle}>Total drive time</th>
                  <th style={routeTableHeaderCellStyle}>Total distance</th>
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
                          onChange={() => toggleRouteCheck(route.deleteKey)}
                        />
                      ) : null}
                    </td>
                    <td style={routeNameCellStyle}>{route.route}</td>
                    <td style={routeTableCellStyle}>{route.date}</td>
                    <td style={routeTableCellStyle}>
                      <span style={getStatusBadgeStyle(route.status)}>{formatRouteStatus(route.status)}</span>
                    </td>
                    <td style={routeNumberCellStyle}>{route.orders}</td>
                    <td style={routeTableCellStyle}>{route.deliveryArea}</td>
                    <td style={routeTableCellStyle}>{route.driver}</td>
                    <td style={routeTableCellStyle}>{formatRouteDurationSeconds(route.driveTimeSeconds)}</td>
                    <td style={routeTableCellStyle}>{formatRouteDistanceMeters(route.distanceMeters)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
