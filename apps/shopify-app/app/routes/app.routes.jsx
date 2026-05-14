import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Outlet, useFetcher, useLoaderData, useNavigate, useParams, useSearchParams } from "react-router";
import { formatDeliveryScopeLabel } from "../features/delivery/delivery-labels";
import { deleteDeliveryRoutePlan, fetchDeliveryRoutePlans } from "../features/delivery/route-plans.server";
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
  background: "#303030",
  border: "1px solid #303030",
  borderRadius: "8px",
  color: "#ffffff",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 650,
  minHeight: "30px",
  padding: "4px 12px",
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

const routeControlsStyle = {
  alignItems: "center",
  background: "#ffffff",
  borderBottom: "1px solid #ebebeb",
  display: "flex",
  flexWrap: "nowrap",
  gap: "6px",
  overflowX: "auto",
  overflowY: "hidden",
  padding: "6px 10px",
  whiteSpace: "nowrap",
};

const routeControlsTrailingStyle = {
  alignItems: "center",
  display: "flex",
  flex: "0 0 auto",
  gap: "6px",
  marginLeft: "auto",
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

const routeColumnWidths = [
  "44px",
  "180px",
  "108px",
  "96px",
  "70px",
  "128px",
  "90px",
  "168px",
  "156px",
];

const singleRouteTableStyle = {
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: "1040px",
  tableLayout: "fixed",
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

const routeNumberCellStyle = {
  ...routeTableCellStyle,
  textAlign: "right",
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
  background: "#ffffff",
  border: "1px solid #c9c9c9",
  borderRadius: "8px",
  color: "#303030",
  cursor: "pointer",
  flex: "0 0 auto",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.2,
  minHeight: "30px",
  padding: "4px 12px",
  whiteSpace: "nowrap",
};

const routeDisabledActionButtonStyle = {
  ...routeActionButtonStyle,
  background: "#f1f1f1",
  borderColor: "#d6d6d6",
  color: "#8a8a8a",
  cursor: "not-allowed",
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
  const { session } = await authenticate.admin(request);
  const shopifyShopCacheKey = session?.shop;
  return fetchDeliveryRoutePlans(request, { cacheKey: shopifyShopCacheKey });
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

  const routePlanIds = parseRoutePlanIds(formData.get("routePlanIds"));
  const shopifySessionToken = formData.get("shopifySessionToken");

  if (!Array.isArray(routePlanIds) || routePlanIds.length === 0) {
    return {
      routePlanIds: [],
      errors: [{ message: "삭제할 route를 선택해주세요." }],
    };
  }

  const deleteResults = await Promise.all(
    routePlanIds.map((routePlanId) =>
      deleteDeliveryRoutePlan(request, routePlanId, { sessionToken: shopifySessionToken }),
    ),
  );

  return {
    routePlanIds: deleteResults.map((result) => result.routePlanId).filter(Boolean),
    errors: deleteResults.flatMap((result) => result.errors ?? []),
  };
};

function parseRoutePlanIds(value) {
  try {
    const parsedRoutePlanIds = JSON.parse(value ?? "[]");

    return Array.isArray(parsedRoutePlanIds)
      ? parsedRoutePlanIds.map((routePlanId) => String(routePlanId).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function formatRouteValues(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "—";
}

function formatRouteDate(value) {
  if (!value) return "—";
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

function formatDriveTime(totalMinutes) {
  const minutes = numberOrNull(totalMinutes);
  if (minutes == null) return "—";

  const roundedMinutes = Math.max(Math.round(minutes), 0);
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;

  if (hours === 0) return `${remainingMinutes} min`;

  return `${hours} hr ${remainingMinutes} min`;
}

function formatDistanceMiles(totalDistanceMiles) {
  const distanceMiles = numberOrNull(totalDistanceMiles);
  if (distanceMiles == null) return "—";

  const roundedDistanceMiles = Math.round(distanceMiles * 10) / 10;
  return `${Number.isInteger(roundedDistanceMiles) ? roundedDistanceMiles : roundedDistanceMiles.toFixed(1)}mi`;
}

function formatRouteDeliveryScope(routePlan) {
  return formatDeliveryScopeLabel({
    deliveryDate: routePlan?.routeScope?.deliveryDate ?? routePlan?.deliveryDate ?? routePlan?.planDate,
    timeWindowEnd: routePlan?.routeScope?.timeWindowEnd ?? routePlan?.timeWindowEnd,
    timeWindowStart: routePlan?.routeScope?.timeWindowStart ?? routePlan?.timeWindowStart,
  }) ?? "—";
}

function formatRouteTableDate(routePlan) {
  const deliveryScope = formatRouteDeliveryScope(routePlan);
  return deliveryScope !== "—" ? deliveryScope : formatRouteDate(routePlan?.planDate);
}

function formatRouteDriver(driver) {
  const displayName = String(driver?.displayName ?? "").trim();
  const phone = String(driver?.phone ?? "").trim();

  return displayName || phone || "—";
}

function buildRouteRows(routePlans) {
  if (!Array.isArray(routePlans) || routePlans.length === 0) {
    return [
      {
        id: "empty-route-plans",
        isClickable: false,
        route: "No routes",
        status: "Waiting",
        orders: 0,
        date: "—",
        deliveryArea: "—",
        start: "Shopify departure location",
        end: "Loop back to start",
        driver: "—",
        driverId: null,
      },
    ];
  }

  return routePlans.map((routePlan) => {
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
      isClickable: true,
      route: routePlan.name ?? routePlan.id,
      status: routePlan.status ?? "DRAFT",
      orders: stopsCount,
      coordinates: `${locatedCount}/${stopsCount}`,
      delivered,
      attempted,
      missingCoordinates,
      date: formatRouteTableDate(routePlan),
      deliveryArea: formatRouteValues(routePlan.deliveryAreas),
      start: "Shopify departure location",
      end: "Loop back to start",
      driver: formatRouteDriver(routePlan.driver),
      driverId: routePlan.driverId ?? routePlan.driver?.id ?? null,
      driveTimeMinutes: firstNumber(
        routePlan.driveTimeMinutes,
        routePlan.totalDriveTimeMinutes,
        routePlan.durationMinutes,
        routePlan.metrics?.driveTimeMinutes,
        routePlan.metrics?.totalDriveTimeMinutes,
      ),
      distanceMiles: firstNumber(
        routePlan.distanceMiles,
        routePlan.totalDistanceMiles,
        routePlan.distanceMi,
        routePlan.metrics?.distanceMiles,
        routePlan.metrics?.totalDistanceMiles,
      ),
    };
  });
}

function buildRoutesSummary(routeRows) {
  const activeRouteRows = routeRows.filter((route) => route.isClickable);

  return [
    { label: "Routes", value: String(activeRouteRows.length) },
    { label: "Stops", value: String(sumNumbers(activeRouteRows.map((route) => route.orders))) },
    { label: "Delivered", value: String(sumNumbers(activeRouteRows.map((route) => route.delivered))) },
    { label: "Attempted", value: String(sumNumbers(activeRouteRows.map((route) => route.attempted))) },
    {
      label: "Drive time",
      value: formatDriveTime(sumOptionalNumbers(activeRouteRows.map((route) => route.driveTimeMinutes))),
    },
    {
      label: "Distance",
      value: formatDistanceMiles(sumOptionalNumbers(activeRouteRows.map((route) => route.distanceMiles))),
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
        route: "No matching routes",
        status: routeFilters.status ?? "Filtered",
        orders: 0,
        coordinates: "0/0",
        missingCoordinates: 0,
        deliveryArea: "—",
        deliveryDate: "—",
        start: "Shopify departure location",
        end: "Loop back to start",
        driver: routeFilters.driverId ?? "—",
        driverId: null,
        plannedFor: "—",
        created: "—",
      },
    ];
}

function getStatusBadgeStyle(status) {
  return status === "DRAFT" ? routeStatusBadgeStyle : routeWaitingBadgeStyle;
}

function createRouteDetailHref(routeId) {
  return `/app/routes/${routeId}`;
}

export default function RoutesPage() {
  const navigate = useNavigate();
  const { routeId } = useParams();
  const [searchParams] = useSearchParams();
  const { routePlans = [], errors = [] } = useLoaderData();
  const shopify = useAppBridge();
  const routeDeleteFetcher = useFetcher();
  const [checkedRouteIds, setCheckedRouteIds] = useState([]);
  const allRouteRows = buildRouteRows(routePlans);
  const routesSummary = buildRoutesSummary(allRouteRows);
  const routeFilters = getRouteFilters(searchParams);
  const routeRows = filterRouteRows(allRouteRows, routeFilters);
  const selectableRouteRows = routeRows.filter((route) => route.isClickable);
  const checkedRouteIdSet = new Set(checkedRouteIds);
  const allVisibleRoutesChecked =
    selectableRouteRows.length > 0 &&
    selectableRouteRows.every((route) => checkedRouteIdSet.has(route.id));
  const routeDeleteDisabled =
    checkedRouteIds.length === 0 || routeDeleteFetcher.state !== "idle";
  const actionErrors = routeDeleteFetcher.data?.errors ?? [];
  const visibleErrors = [...errors, ...actionErrors];

  useEffect(() => {
    if (routeDeleteFetcher.state !== "idle" || !routeDeleteFetcher.data) return;
    if ((routeDeleteFetcher.data.errors ?? []).length > 0) return;

    setCheckedRouteIds([]);
  }, [routeDeleteFetcher.data, routeDeleteFetcher.state]);

  function handleRouteRowClick(route) {
    if (!route.isClickable) return;

    navigate(createRouteDetailHref(route.id));
  }

  function handleRouteRowKeyDown(event, route) {
    if (!route.isClickable) return;
    if (event.target?.tagName === "INPUT") return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    navigate(createRouteDetailHref(route.id));
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
        const visibleRouteIds = new Set(selectableRouteRows.map((route) => route.id));
        return currentRouteIds.filter((routeId) => !visibleRouteIds.has(routeId));
      }

      return Array.from(
        new Set([
          ...currentRouteIds,
          ...selectableRouteRows.map((route) => route.id),
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

  if (routeId) return <Outlet />;

  return (
    <main style={routesTablePageStyle}>
      <div style={routesPageContentStyle}>
        <header className="tab-layout-header" style={routesHeaderStyle}>
          <div style={routesHeaderBarStyle}>
            <h1 style={routesTitleStyle}>Routes</h1>
            <button type="button" style={createRoutesButtonStyle} onClick={handleCreateRoutesClick}>Create routes</button>
          </div>
        </header>

        {visibleErrors.length > 0 ? (
          <div style={routesErrorStyle}>{visibleErrors[0].message ?? "Route plans could not be loaded."}</div>
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
          <div style={routeControlsStyle}>
            <div style={routeControlsTrailingStyle}>
              <button
                type="button"
                style={routeDeleteDisabled ? routeDisabledActionButtonStyle : routeActionButtonStyle}
                disabled={routeDeleteDisabled}
                onClick={handleDeleteSelectedRoutes}
              >Delete selected</button>
              <span style={routeSelectionSummaryStyle}>
                {checkedRouteIds.length} selected
              </span>
            </div>
          </div>
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
                  <th style={routeTableHeaderCellStyle}>Orders</th>
                  <th style={routeTableHeaderCellStyle}>Area</th>
                  <th style={routeTableHeaderCellStyle}>Driver</th>
                  <th style={routeTableHeaderCellStyle}>Start</th>
                  <th style={routeTableHeaderCellStyle}>End</th>
                </tr>
              </thead>
              <tbody>
                {routeRows.map((route) => (
                  <tr
                    key={route.id}
                    aria-label={route.isClickable ? `Open ${route.route} detail` : undefined}
                    className={route.isClickable ? "route-table-row" : undefined}
                    onClick={() => handleRouteRowClick(route)}
                    onKeyDown={(event) => handleRouteRowKeyDown(event, route)}
                    role={route.isClickable ? "link" : undefined}
                    tabIndex={route.isClickable ? 0 : undefined}
                  >
                    <td style={routeCheckboxCellStyle}>
                      {route.isClickable ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${route.route} for deletion`}
                          checked={checkedRouteIdSet.has(route.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleRouteCheck(route.id)}
                        />
                      ) : null}
                    </td>
                    <td style={routeNameCellStyle}>{route.route}</td>
                    <td style={routeTableCellStyle}>{route.date}</td>
                    <td style={routeTableCellStyle}>
                      {route.status === "DRAFT" ? (
                        <span style={getStatusBadgeStyle(route.status)}>DRAFT</span>
                      ) : (
                        <span style={getStatusBadgeStyle(route.status)}>{route.status}</span>
                      )}
                    </td>
                    <td style={routeNumberCellStyle}>{route.orders}</td>
                    <td style={routeTableCellStyle}>{route.deliveryArea}</td>
                    <td style={routeTableCellStyle}>{route.driver}</td>
                    <td style={routeTableCellStyle}>{route.start}</td>
                    <td style={routeTableCellStyle}>{route.end}</td>
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
