import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Outlet, redirect, useFetcher, useLoaderData, useNavigate, useParams, useRouteError, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { formatRouteStatus } from "../features/delivery/route-helpers";
import {
  buildRouteRows,
  getExpandedRouteDeleteKeys,
  getPrimaryRouteSelectionKeys,
  getRouteDeletePayloadKeys,
  toggleRouteSelection,
} from "../features/delivery/route-list-rows";
import { appendIdToken } from "../features/delivery/route-paths";
import { deleteDeliveryRoutePlan, fetchDeliveryRoutePlans } from "../features/delivery/route-plans.server";
import { deleteDeliveryRouteGroup, deleteDeliveryRouteGroupChildRoutes, fetchDeliveryRouteGroups } from "../features/delivery/route-groups.server";
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
    "14px",
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
  padding: "6px 8px",
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
  padding: "6px 3px",
  textAlign: "center",
  textOverflow: "clip",
};

const routeCheckboxHeaderCellStyle = {
  ...routeTableHeaderCellStyle,
  padding: "7px 3px",
  textAlign: "center",
};

const routeGroupMarkerHeaderCellStyle = {
  ...routeTableHeaderCellStyle,
  padding: 0,
};

const routeGroupMarkerCellStyle = {
  ...routeTableCellStyle,
  overflow: "visible",
  padding: 0,
  position: "relative",
  textOverflow: "clip",
};

const routeGroupMarkerStyle = {
  bottom: 0,
  display: "block",
  left: "50%",
  position: "absolute",
  top: 0,
  transform: "translateX(-50%)",
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

const routeCompletedBadgeStyle = {
  ...routeStatusBadgeStyle,
  background: "#e3f1df",
  color: "#205c20",
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
  console.info(name, {
    measuredAt: new Date().toISOString(),
    ...metric,
  });
}

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

function buildRoutesSummary(routeRows) {
  const activeRouteRows = routeRows.filter((route) => route.isClickable);
  const summaryRouteRows = activeRouteRows.filter((route) => route.isSummaryRoute ?? !route.isRouteGroup);

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

function getStatusBadgeStyle(status) {
  switch (formatRouteStatus(status)) {
    case "Ready":
      return routeReadyBadgeStyle;
    case "In progress":
      return routeInProgressBadgeStyle;
    case "Completed":
      return routeCompletedBadgeStyle;
    case "Cancelled":
      return routeCancelledBadgeStyle;
    default:
      return routeStatusBadgeStyle;
  }
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
  const [routeGroupMarkerTooltip, setRouteGroupMarkerTooltip] = useState(null);
  const allRouteRows = buildRouteRows(routePlans, routeGroups);
  const routesSummary = buildRoutesSummary(allRouteRows);
  const routeFilters = getRouteFilters(searchParams);
  const routeRows = filterRouteRows(allRouteRows, routeFilters);
  const routeColumnWidths = getRouteColumnWidths(routeRows);
  const selectableRouteRows = routeRows.filter((route) => route.isClickable && route.isDeletable !== false);
  const checkedRouteIdSet = new Set(getExpandedRouteDeleteKeys(routeRows, checkedRouteIds));
  const selectedRouteCount = selectableRouteRows.filter((route) => checkedRouteIdSet.has(route.deleteKey)).length;
  const routeDeleteTargetIds = getRouteDeletePayloadKeys(allRouteRows, checkedRouteIds);
  const allVisibleRoutesChecked =
    selectableRouteRows.length > 0 &&
    selectableRouteRows.every((route) => checkedRouteIdSet.has(route.deleteKey));
  const routeDeleteDisabled =
    routeDeleteTargetIds.length === 0 || routeDeleteFetcher.state !== "idle";
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

  function openRouteGroupMarkerTooltip(event, route) {
    if (!route.groupAccentColor || !route.groupSummary) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    setRouteGroupMarkerTooltip({
      left: bounds.left + bounds.width / 2,
      text: route.groupSummary,
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

  if (routeId || routeGroupId) return <Outlet />;

  return (
    <main style={routesTablePageStyle}>
      <div style={routesPageContentStyle}>
        <header className="tab-layout-header" style={routesHeaderStyle}>
          <div style={routesHeaderBarStyle}>
            <h1 style={routesTitleStyle}>Routes</h1>
            <div style={routesHeaderActionsStyle}>
              <span style={routeSelectionSummaryStyle}>
                {selectedRouteCount} selected
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
                  <th aria-hidden="true" style={routeGroupMarkerHeaderCellStyle}></th>
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
                          onChange={() => toggleRouteCheck(route)}
                        />
                      ) : null}
                    </td>
                    <td aria-hidden="true" style={routeGroupMarkerCellStyle}>
                      {route.groupAccentColor ? (
                        <span
                          onMouseEnter={(event) => openRouteGroupMarkerTooltip(event, route)}
                          onMouseLeave={closeRouteGroupMarkerTooltip}
                          style={{ ...routeGroupMarkerStyle, background: route.groupAccentColor }}
                        ></span>
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

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
