import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useFetcher, useLoaderData, useNavigate, useRouteError, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { fetchDeliveryOrders, syncDeliveryOrders } from "../features/delivery/orders.server";
import {
  buildCreateRoutePlanPayload,
  DELIVERY_API_ERROR_CODE,
  DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE,
} from "../features/delivery/route-plans.server";
import {
  createDeliveryRouteGroup,
  generateDeliveryRouteGroupChildRoutes,
} from "../features/delivery/route-groups.server";
import { buildRouteScopeFromOrders } from "../features/delivery/route-scope";
import { createDepartureMarkerElement, createMapPinImageData, MAP_MARKER_PALETTE } from "../features/maps/map-markers";
import { installMissingMapImageFallback } from "../features/maps/maplibre-missing-images";
import { installPmtilesProtocol } from "../features/maps/pmtiles-protocol";
import { fetchShopifyDepartureLocation } from "../features/locations/shopify-locations.server";
import {
  getOrderSyncSnapshots,
  mapCanonicalOrdersToOrderRows,
  mergeShopifyOrderRowsWithCanonicalRows,
} from "../features/orders/canonical-orders";
import {
  collectServiceErrors,
  getServiceErrorNotice,
  normalizeCaughtServiceError,
} from "../features/service-errors";
import {
  filterOrders,
  getOrderFilterOptions,
  getOrderFiltersFromSearchParams,
  getOrderDeliveryDateValue,
  getOrderDeliveryExceptionState,
  getOrderDeliveryStateFilterValue,
  hasActiveOrderFilters,
  isOrderDeliveryComplete,
  isOrderRouteCreated,
  ORDER_DELIVERY_STATE_OPTIONS,
  ORDER_PLANNING_SCOPE,
  ORDER_WEEKDAY_OPTIONS,
  updateOrderFilterSearchParams,
} from "../features/orders/order-filters";
import { fetchShopifyOrders } from "../features/orders/shopify-orders.server";
import { authenticate } from "../shopify.server";
import { MapPanel, MapToolbar, renderMapFitIcon, renderMapRefreshIcon, renderMapWidthIcon, renderMapZoomInIcon, renderMapZoomOutIcon } from "../ui/map-panel";
import { TabLayout } from "../ui/tab-layout";

export const links = () => [{ rel: "stylesheet", href: "/vendor/maplibre-gl.css" }];

const OPENFREEMAP_STYLE_URL = "/vendor/openfreemap-clever-lite.json";
const DEFAULT_CENTER = [-79.4163, 43.787];
const INITIAL_HOME_ZOOM = 10;
const MAP_RECOVERY_DELAY_MS = 2500;
const MAX_MAP_RECOVERY_ATTEMPTS = 3;
const MARKER_CLICK_ZOOM_OUT_THRESHOLD = 8;
const MARKER_CLICK_TARGET_ZOOM = 10;
const ORDER_MARKER_MIN_ZOOM = 7;
const ORDERS_MAP_SOURCE_ID = "orders-map-orders";
const ORDERS_MAP_ORDER_LAYER_ID = "orders-map-order-pins";
const ORDER_PIN_IMAGE_ID = "orders-map-pin";
const ORDER_PIN_PLANNED_IMAGE_ID = "orders-map-pin-planned";
const ORDER_PIN_PIXEL_RATIO = 2;
const ORDER_PIN_ICON_SIZE = 0.54;
const PERF_ENDPOINT = "/perf";
const PERF_CAPTURE_ENABLED = import.meta.env.DEV;
const DEFAULT_ROUTE_PLAN_TITLE = "CLEVER route draft";
const SHOP_TIME_ZONE_QUERY = `#graphql
  query CleverShopTimeZone {
    shop {
      ianaTimezone
      timezoneAbbreviation
    }
  }
`;
const CALENDAR_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

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
  const firstChild = routeGroup?.children?.find((child) => child?.routePlan?.id || child?.routePlanId);
  if (!firstChild) return null;
  return firstChild.routePlan ?? { id: firstChild.routePlanId };
}

function getTableColumnPixelState(tableElement) {
  const widths = Array.from(
    tableElement.querySelectorAll("thead th"),
    (headerCell) => Math.round(headerCell.getBoundingClientRect().width),
  );
  const tableWidth = Math.round(tableElement.getBoundingClientRect().width);
  const roundingDiff = tableWidth - widths.reduce((total, width) => total + width, 0);

  if (widths.length > 0 && roundingDiff !== 0) {
    widths[widths.length - 1] += roundingDiff;
  }

  return { tableWidth, widths };
}

function getTableColumnFitWidth(tableElement, columnIndex) {
  const cells = tableElement.querySelectorAll(
    `thead th:nth-child(${columnIndex + 1}), tbody td:nth-child(${columnIndex + 1})`,
  );

  return Math.max(
    MIN_TABLE_COLUMN_WIDTH,
    ...Array.from(cells, (cell) => {
      const clone = cell.cloneNode(true);

      Object.assign(clone.style, {
        display: "inline-block",
        height: "auto",
        left: "-10000px",
        maxWidth: "none",
        minWidth: "0",
        overflow: "visible",
        pointerEvents: "none",
        position: "fixed",
        textOverflow: "clip",
        top: "-10000px",
        visibility: "hidden",
        whiteSpace: "nowrap",
        width: "max-content",
        zIndex: "-1",
      });

      clone.querySelectorAll("*").forEach((element) => {
        Object.assign(element.style, {
          maxWidth: "none",
          overflow: "visible",
          textOverflow: "clip",
          width: "auto",
        });
      });

      document.body.append(clone);
      const width = Math.ceil(clone.getBoundingClientRect().width);
      clone.remove();

      return width + 2;
    }),
  );
}

const ordersMapCanvasStyle = {
  minHeight: "420px",
};

const routePlanPanelStyle = {
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  height: "420px",
  maxHeight: "420px",
  overflowX: "hidden",
  overflowY: "auto",
  padding: "12px",
};

const routePlanScrollAreaStyle = {
  alignContent: "end",
  display: "grid",
  flex: "0 0 auto",
  gap: "10px",
  gridAutoRows: "max-content",
  marginTop: "auto",
  minHeight: 0,
  overflow: "visible",
  paddingRight: 0,
};

const routePlanHeaderStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  justifyContent: "space-between",
};

const routePlanHeaderActionsStyle = {
  display: "flex",
  gap: "6px",
  marginLeft: "auto",
};

const routeAssignActionsStyle = {
  display: "grid",
  gap: "6px",
  overflow: "hidden",
  transition: "max-height 180ms ease, opacity 140ms ease, margin-top 180ms ease",
};

const routeAssignActionsOpenStyle = {
  marginTop: "8px",
  maxHeight: "100px",
  opacity: 1,
};

const routeAssignActionsClosedStyle = {
  marginTop: 0,
  maxHeight: 0,
  opacity: 0,
};

const routeReadinessStyle = {
  background: "#ffffff",
  border: "1px solid #e3e3e3",
  borderRadius: "10px",
  containerName: "route-summary",
  containerType: "inline-size",
  display: "grid",
  gap: "8px",
  minWidth: 0,
  overflow: "hidden",
  padding: "10px",
};

const routeReadinessHeaderStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  justifyContent: "space-between",
  whiteSpace: "nowrap",
};

const routeReadinessGridStyle = {
  display: "grid",
  gap: "6px",
  minWidth: 0,
};

const routeReadinessItemStyle = {
  background: "#f7f7f7",
  border: "1px solid #ebebeb",
  borderRadius: "8px",
  color: "#616161",
  display: "grid",
  fontSize: "13px",
  gap: "2px",
  lineHeight: 1.35,
  minWidth: 0,
  padding: "8px 10px",
  whiteSpace: "nowrap",
};

const routeReadinessValueStyle = {
  color: "#303030",
  fontSize: "14px",
  fontWeight: 650,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const orderControlsTrailingStyle = {
  alignItems: "center",
  display: "flex",
  gap: "6px",
  marginLeft: "auto",
};

const orderSelectionCountStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
  whiteSpace: "nowrap",
};

const createRouteButtonStyle = {
  background: "#303030",
  borderColor: "#303030",
  borderRadius: "8px",
  borderStyle: "solid",
  borderWidth: "1px",
  color: "#ffffff",
  cursor: "pointer",
  flex: "0 0 auto",
  fontSize: "13px",
  fontWeight: 650,
  minHeight: "30px",
  padding: "4px 12px",
  whiteSpace: "nowrap",
};

const addToPlanButtonStyle = {
  ...createRouteButtonStyle,
  background: "#ffffff",
  borderColor: "#c9c9c9",
  color: "#303030",
};

const removeFromPlanButtonStyle = {
  ...addToPlanButtonStyle,
  minHeight: "26px",
  padding: "3px 10px",
};

const disabledCreateRouteButtonStyle = {
  ...createRouteButtonStyle,
  background: "#f1f1f1",
  borderColor: "#d6d6d6",
  color: "#8a8a8a",
  cursor: "not-allowed",
};

const disabledPlanButtonStyle = {
  ...removeFromPlanButtonStyle,
  background: "#f1f1f1",
  borderColor: "#d6d6d6",
  color: "#8a8a8a",
  cursor: "not-allowed",
};

const orderFilterButtonStyle = {
  ...removeFromPlanButtonStyle,
  cursor: "pointer",
};

const disabledOrderFilterButtonStyle = {
  ...disabledPlanButtonStyle,
};

const routePlanTitleGroupStyle = {
  display: "grid",
  gap: "4px",
};

const routePlanTitleLabelStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.2,
};

const routePlanTitleFieldStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "10px",
  boxSizing: "border-box",
  color: "#1f1f1f",
  fontFamily: "inherit",
  fontSize: "16px",
  fontWeight: 750,
  letterSpacing: "-0.01em",
  lineHeight: 1.2,
  minHeight: "40px",
  padding: "8px 10px",
  width: "100%",
};

const routePlanDetailStyle = {
  background: "#f7f7f7",
  borderRadius: "8px",
  flex: "0 0 auto",
  padding: "10px",
};

const routeAssignActionButtonStyle = {
  ...addToPlanButtonStyle,
  justifyContent: "center",
  width: "100%",
};

const disabledRouteAssignActionButtonStyle = {
  ...disabledPlanButtonStyle,
  width: "100%",
};

const orderPageNoticeStyle = {
  background: "#fff4f4",
  border: 0,
  borderRadius: 0,
  color: "#8e1f0b",
  fontSize: "12px",
  lineHeight: 1.35,
  padding: "6px 10px",
};

const orderTableLayoutStyle = {
  display: "flex",
  flexDirection: "column",
  minHeight: "160px",
};

const orderControlsStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  padding: "6px 10px 8px",
};

const tableWrapStyle = {
  maxHeight: "min(320px, 36vh)",
  overflowX: "auto",
  overflowY: "auto",
};

const orderFilterControlStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#303030",
  flex: "0 1 142px",
  fontSize: "13px",
  height: "30px",
  minWidth: "116px",
  padding: "0 8px",
};

const orderFilterDateFieldStyle = {
  ...orderFilterControlStyle,
  alignItems: "center",
  display: "flex",
  flex: "0 1 204px",
  gap: "6px",
  minWidth: "178px",
  overflow: "hidden",
  position: "relative",
};

const orderFilterLabelStyle = {
  color: "#616161",
  flex: "0 0 auto",
  fontSize: "12px",
  fontWeight: 650,
  whiteSpace: "nowrap",
};

const orderFilterDateButtonStyle = {
  background: "transparent",
  border: 0,
  color: "#303030",
  cursor: "pointer",
  flex: "1 1 auto",
  font: "inherit",
  height: "26px",
  minWidth: 0,
  overflow: "hidden",
  padding: "0 24px 0 0",
  textAlign: "left",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const orderFilterSelectFieldStyle = {
  ...orderFilterControlStyle,
  padding: 0,
  position: "relative",
};

const orderFilterSelectStyle = {
  appearance: "none",
  WebkitAppearance: "none",
  background: "transparent",
  border: 0,
  boxSizing: "border-box",
  color: "#303030",
  font: "inherit",
  height: "100%",
  padding: "0 28px 0 8px",
  width: "100%",
};



const orderFilterEmptySelectStyle = {
  ...orderFilterSelectStyle,
  opacity: 0,
};

const orderFilterPlaceholderStyle = {
  color: "#303030",
  left: "8px",
  lineHeight: 1,
  pointerEvents: "none",
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
};

const orderFilterIndicatorStyle = {
  display: "grid",
  gap: "2px",
  justifyItems: "center",
  lineHeight: 1,
  pointerEvents: "none",
  position: "absolute",
  right: "10px",
  top: "50%",
  transform: "translateY(-50%)",
};

const orderFilterChevronTriangleStyle = {
  height: 0,
  width: 0,
  borderLeft: "3px solid transparent",
  borderRight: "3px solid transparent",
};

const orderFilterChevronUpStyle = {
  ...orderFilterChevronTriangleStyle,
  borderBottom: "4px solid #8a8a8a",
};

const orderFilterChevronDownStyle = {
  ...orderFilterChevronTriangleStyle,
  borderTop: "4px solid #8a8a8a",
};

const orderFilterClearButtonStyle = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  borderRadius: "6px",
  color: "#616161",
  cursor: "pointer",
  display: "inline-flex",
  fontSize: "15px",
  height: "22px",
  justifyContent: "center",
  lineHeight: 1,
  padding: 0,
  position: "absolute",
  right: "4px",
  top: "50%",
  transform: "translateY(-50%)",
  width: "22px",
};

function renderOrderFilterChevron() {
  return (
    <span aria-hidden="true" style={orderFilterIndicatorStyle}>
      <span style={orderFilterChevronUpStyle} />
      <span style={orderFilterChevronDownStyle} />
    </span>
  );
}

const orderDateCalendarStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "10px",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.14)",
  display: "grid",
  gap: "8px",
  padding: "10px",
  position: "fixed",
  width: "238px",
  zIndex: 2147483647,
};

const orderDateCalendarHeaderStyle = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
};

const orderDateCalendarGridStyle = {
  display: "grid",
  gap: "3px",
  gridTemplateColumns: "repeat(7, 1fr)",
};

const orderDateCalendarWeekdayStyle = {
  color: "#8a8a8a",
  fontSize: "11px",
  textAlign: "center",
};

const orderDateCalendarDayStyle = {
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: "7px",
  color: "#303030",
  cursor: "pointer",
  fontSize: "12px",
  height: "26px",
  padding: 0,
};

const orderDateCalendarDayMutedStyle = {
  ...orderDateCalendarDayStyle,
  color: "#b5b5b5",
};

const orderDateCalendarDaySelectedStyle = {
  ...orderDateCalendarDayStyle,
  background: "#303030",
  borderColor: "#303030",
  color: "#ffffff",
};

const orderDateCalendarDayRangeStyle = {
  ...orderDateCalendarDayStyle,
  background: "#f1f1f1",
};

const DEFAULT_TABLE_COLUMN_WIDTHS = ["3%", "7%", "8%", "10%", "23%", "7%", "8%", "9%", "10%", "8%"];
const MIN_TABLE_COLUMN_WIDTH = 44;

const tableStyle = {
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: "13px",
  minWidth: "960px",
  tableLayout: "fixed",
  width: "100%",
};

const tableHeaderCellStyle = {
  background: "#ffffff",
  borderBottom: "1px solid #dcdfe4",
  boxShadow: "0 1px 0 rgba(0, 0, 0, 0.06)",
  fontWeight: 700,
  overflow: "hidden",
  padding: "6px 8px",
  position: "sticky",
  textAlign: "center",
  textOverflow: "ellipsis",
  top: 0,
  verticalAlign: "middle",
  whiteSpace: "nowrap",
  zIndex: 3,
};

const resizableHeaderCellStyle = {
  ...tableHeaderCellStyle,
  overflow: "visible",
  position: "sticky",
};

const columnResizeHandleStyle = {
  alignItems: "center",
  bottom: "6px",
  cursor: "col-resize",
  display: "flex",
  justifyContent: "center",
  position: "absolute",
  right: "0",
  top: "6px",
  touchAction: "none",
  width: "8px",
  zIndex: 5,
};

const columnResizeHandleLineStyle = {
  background: "#c9c9c9",
  borderRadius: "999px",
  display: "block",
  height: "100%",
  width: "1px",
};

const checkboxHeaderCellStyle = {
  ...tableHeaderCellStyle,
  textOverflow: "clip",
};

const tableHeaderButtonStyle = {
  background: "transparent",
  border: 0,
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  fontWeight: "inherit",
  overflow: "hidden",
  padding: 0,
  textAlign: "center",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  width: "100%",
};

const tableCellStyle = {
  borderBottom: "1px solid #ebebeb",
  overflow: "hidden",
  padding: "6px 8px",
  textAlign: "center",
  textOverflow: "ellipsis",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const checkboxCellStyle = {
  ...tableCellStyle,
  padding: "6px 4px",
};

const deliveryInfoCellStyle = {
  ...tableCellStyle,
  color: "#303030",
  fontWeight: 650,
};

const deliveryInfoTabStyle = {
  background: "rgba(0, 0, 0, 0.04)",
  borderRadius: "999px",
  boxSizing: "border-box",
  color: "#303030",
  display: "inline-flex",
  fontSize: "12px",
  fontWeight: 650,
  justifyContent: "center",
  lineHeight: 1.2,
  maxWidth: "100%",
  minWidth: 0,
  overflow: "hidden",
  padding: "3px 8px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routeCreatedTabStyle = {
  ...deliveryInfoTabStyle,
  background: "rgba(0, 128, 96, 0.1)",
  color: "#006c48",
};

const deliveryCompleteTabStyle = {
  ...deliveryInfoTabStyle,
  background: "rgba(0, 128, 96, 0.12)",
  color: "#006c48",
};

const deliveryOverdueAssignedTabStyle = {
  ...deliveryInfoTabStyle,
  background: "rgba(180, 83, 9, 0.14)",
  color: "#8a4b00",
};

const deliveryOverdueUnassignedTabStyle = {
  ...deliveryInfoTabStyle,
  background: "rgba(209, 24, 24, 0.12)",
  color: "#b42318",
};

const orderNumberButtonStyle = {
  alignItems: "center",
  border: 0,
  cursor: "pointer",
  display: "flex",
  font: "inherit",
  justifyContent: "center",
  minHeight: "26px",
  overflow: "hidden",
  padding: 0,
  textAlign: "center",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  width: "100%",
};

const itemCellStyle = {
  ...tableCellStyle,
  overflow: "visible",
  position: "relative",
};

const itemInfoButtonStyle = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  color: "#657080",
  cursor: "pointer",
  display: "inline-flex",
  height: "18px",
  justifyContent: "center",
  marginLeft: "4px",
  padding: 0,
  position: "relative",
  top: "-1px",
  verticalAlign: "middle",
  width: "18px",
};

const itemPopoverStyle = {
  background: "#ffffff",
  border: "1px solid #d6dce5",
  borderRadius: "10px",
  boxShadow: "0 10px 28px rgba(0, 0, 0, 0.16)",
  left: "50%",
  minWidth: "360px",
  padding: "8px 10px 10px",
  position: "absolute",
  top: "28px",
  transform: "translateX(-50%)",
  zIndex: 20,
};

const itemPopoverTitleStyle = {
  color: "#2f3b4c",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.08em",
  marginBottom: "6px",
  textAlign: "left",
  textTransform: "uppercase",
};

const itemPopoverTableStyle = {
  borderCollapse: "collapse",
  fontSize: "11px",
  width: "100%",
};

const itemPopoverCellStyle = {
  borderTop: "1px solid #edf0f3",
  padding: "5px 6px",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const itemPopoverQtyCellStyle = {
  ...itemPopoverCellStyle,
  fontWeight: 700,
  textAlign: "right",
};

const SORTABLE_ORDER_COLUMNS = [
  { key: "name", label: "Order" },
  { key: "orderedDate", label: "Ordered" },
  { key: "customer", label: "Recipient" },
  { key: "address", label: "Address" },
  { key: "itemCount", label: "Items" },
  { key: "deliveryArea", label: "Area" },
  { key: "deliveryLabel", label: "Delivery" },
  { key: "planningStatus", label: "State" },
  { key: "hasCoordinates", label: "Coordinates" },
];

function textOrUndefined(value) {
  if (value == null) return undefined;

  const text = String(value).trim();

  return text.length > 0 ? text : undefined;
}

async function fetchShopifyShopTimeZone(admin) {
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

function scheduleIdleTask(callback) {
  if (window.requestIdleCallback) {
    const idleTaskId = window.requestIdleCallback(callback, { timeout: 600 });

    return () => window.cancelIdleCallback(idleTaskId);
  }

  const timeoutId = window.setTimeout(callback, 0);

  return () => window.clearTimeout(timeoutId);
}

function roundPerfDuration(duration) {
  return Number(duration.toFixed(2));
}

function getSafePerformanceNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function logDevPerformanceMetric(name, metric) {
  if (!PERF_CAPTURE_ENABLED) return;

  console.info(name, {
    measuredAt: new Date().toISOString(),
    ...metric,
  });
}

function getEmbeddedIframeState() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function getNavigationTimingMetric() {
  const navigationEntry = performance.getEntriesByType("navigation")[0];

  if (!navigationEntry) return null;

  return {
    name: "app.document.navigation",
    category: "dev-tunnel-document",
    host: window.location.host,
    durationMs: roundPerfDuration(performance.now()),
    ttfbMs: roundPerfDuration(navigationEntry.responseStart - navigationEntry.requestStart),
    responseEndMs: roundPerfDuration(navigationEntry.responseEnd - navigationEntry.startTime),
    domContentLoadedMs: roundPerfDuration(
      navigationEntry.domContentLoadedEventEnd - navigationEntry.startTime,
    ),
    loadEventEndMs: roundPerfDuration(navigationEntry.loadEventEnd - navigationEntry.startTime),
    transferSize: navigationEntry.transferSize,
    encodedBodySize: navigationEntry.encodedBodySize,
  };
}

function getSanitizedUrl(url) {
  try {
    const sanitizedUrl = new URL(url);
    sanitizedUrl.search = "";
    sanitizedUrl.hash = "";
    return sanitizedUrl.toString();
  } catch {
    return "";
  }
}

function emitPerformanceMetric(metric) {
  if (!PERF_CAPTURE_ENABLED || typeof window === "undefined") return;

  const payload = {
    app: "clever-route-app",
    page: "orders",
    url: getSanitizedUrl(window.location.href),
    referrer: getSanitizedUrl(document.referrer),
    createdAt: new Date().toISOString(),
    measuredAtMs: roundPerfDuration(performance.now()),
    ...metric,
  };

  window.__cleverPerfEvents = window.__cleverPerfEvents ?? [];
  window.__cleverPerfEvents.push(payload);

  const serializedPayload = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      PERF_ENDPOINT,
      new Blob([serializedPayload], { type: "application/json" }),
    );
    return;
  }

  fetch(PERF_ENDPOINT, {
    body: serializedPayload,
    headers: { "content-type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => {});
}

function getOrderSortValue(order, columnKey, referenceDate) {
  if (columnKey === "hasCoordinates") {
    return order.hasCoordinates ? "Yes" : "No";
  }

  if (columnKey === "planningStatus") {
    return formatOrderDeliveryState(order, referenceDate);
  }

  if (columnKey === "deliveryLabel") {
    return getOrderDeliveryDateValue(order) || order.deliveryLabel || "";
  }

  if (columnKey === "itemCount") {
    return getOrderItemCount(order);
  }

  return order[columnKey] ?? "";
}

function compareOrderSortValues(leftValue, rightValue) {
  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getUniqueRouteDraftValues(orders, key) {
  return Array.from(
    new Set(
      orders
        .map((order) => order[key])
        .filter((value) => typeof value === "string" && value.trim().length > 0),
    ),
  );
}

function formatRouteDraftList(values) {
  return values.length > 0 ? values.join(", ") : "—";
}

function formatRouteDraftAreaSummary(values) {
  if (values.length === 0) return "—";
  if (values.length === 1) return values[0];

  return `${values[0]} +${values.length - 1}`;
}


function formatOrderDateValue(value) {
  return value ? value.replaceAll("-", ".") : "";
}

function formatOrderDateRangeLabel(startDate, endDate) {
  if (!startDate && !endDate) return "";
  if (!endDate || startDate === endDate) return formatOrderDateValue(startDate);

  return `${formatOrderDateValue(startDate)}~${formatOrderDateValue(endDate)}`;
}

function getCalendarMonthValue(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}/.test(value)) {
    return value.slice(0, 7);
  }

  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return `${safeDate.getUTCFullYear()}-${String(safeDate.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftCalendarMonth(monthValue, offset) {
  const [year, month] = monthValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));

  return getCalendarMonthValue(date);
}

function formatCalendarMonthLabel(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function getCalendarDays(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const gridStart = new Date(monthStart);
  gridStart.setUTCDate(monthStart.getUTCDate() - monthStart.getUTCDay());

  return Array.from({ length: 42 }, (_, dayOffset) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + dayOffset);
    const dateValue = date.toISOString().slice(0, 10);

    return {
      currentMonth: dateValue.startsWith(monthValue),
      dateValue,
      dayOfMonth: String(date.getUTCDate()),
    };
  });
}

function getCalendarDayStyle(day, filters, pendingDateStart) {
  const startDate = pendingDateStart || filters.orderedDateFrom;
  const endDate = pendingDateStart ? "" : filters.orderedDateTo;
  const isRangeBoundary = day.dateValue === startDate || day.dateValue === endDate;
  const isInRange = startDate && endDate && day.dateValue > startDate && day.dateValue < endDate;

  if (isRangeBoundary) return orderDateCalendarDaySelectedStyle;
  if (isInRange) return orderDateCalendarDayRangeStyle;

  return day.currentMonth ? orderDateCalendarDayStyle : orderDateCalendarDayMutedStyle;
}

function formatDeliveryValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : "—";
}

function getOrderLineItems(order) {
  const lineItems = order?.lineItems ?? order?.shopifyOrderSnapshot?.lineItems ?? order?.rawPayload?.lineItems;
  const nodes = Array.isArray(lineItems?.nodes)
    ? lineItems.nodes
    : Array.isArray(lineItems?.edges)
      ? lineItems.edges.map((edge) => edge?.node)
      : [];

  return nodes
    .map((item) => ({
      name: textOrUndefined(item?.title) ?? textOrUndefined(item?.name) ?? "Item",
      options: textOrUndefined(item?.variantTitle) ?? "—",
      quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1,
      sku: textOrUndefined(item?.sku) ?? "—",
    }))
    .filter((item) => item.name);
}

function getOrderItemCount(order) {
  const lineItems = getOrderLineItems(order);
  return lineItems.reduce((sum, item) => sum + item.quantity, 0);
}

function formatOrderTotal(order) {
  const amount = Number(order?.totalPriceAmount);
  if (!Number.isFinite(amount)) return "—";

  return `${amount.toFixed(2)} ${textOrUndefined(order?.currencyCode) ?? ""}`.trim();
}

function formatOrderDeliveryState(order, referenceDate) {
  const stateValue = getOrderDeliveryStateFilterValue(order, referenceDate);

  if (stateValue === "assigned_overdue") return "Assigned · overdue";
  if (stateValue === "past_due") return "Past due";
  if (stateValue === "delivered") return "Delivered";
  if (stateValue === "assigned_undelivered") return "Assigned · undelivered";
  if (stateValue === "planned") return "Planned";

  return "Unplanned";
}

function getOrderDeliveryStateTabStyle(order, referenceDate) {
  const exceptionState = getOrderDeliveryExceptionState(order, referenceDate);

  if (exceptionState === "overdue_assigned") return deliveryOverdueAssignedTabStyle;
  if (exceptionState === "overdue_unassigned") return deliveryOverdueUnassignedTabStyle;
  if (isOrderDeliveryComplete(order)) return deliveryCompleteTabStyle;
  if (isOrderRouteCreated(order)) return routeCreatedTabStyle;

  return deliveryInfoTabStyle;
}

function formatOrderDeliveryLabel(order) {
  if (!order) return "—";

  return typeof order.deliveryLabel === "string" &&
    order.deliveryLabel.trim().length > 0
    ? order.deliveryLabel
    : "Date pending";
}

function formatRouteDraftScopeLabel(orders) {
  const datedOrders = orders
    .map((order) => ({
      date: getOrderDeliveryDateValue(order),
      label: formatOrderDeliveryLabel(order),
    }))
    .filter((order) => order.date)
    .sort((leftOrder, rightOrder) => leftOrder.date.localeCompare(rightOrder.date));

  if (datedOrders.length === 0) return formatOrderDeliveryLabel(orders[0]);

  const firstOrder = datedOrders[0];
  const lastOrder = datedOrders[datedOrders.length - 1];

  return firstOrder.date === lastOrder.date
    ? firstOrder.label
    : `${firstOrder.label}–${lastOrder.label}`;
}

function buildRoutePlanTitleFromOrders(orders) {
  const scopeLabel = formatRouteDraftScopeLabel(orders);

  return scopeLabel && scopeLabel !== "Date pending"
    ? `${scopeLabel} orders`
    : DEFAULT_ROUTE_PLAN_TITLE;
}

function createOrderMarkerPopupElement(order, plannedIndex, onAddToPlan) {
  const popupElement = document.createElement("div");
  const popupTitleElement = document.createElement("strong");
  const popupAddressElement = document.createElement("div");
  const popupMetaElement = document.createElement("div");
  const popupActionButton = document.createElement("button");
  const deliveryMetaValues = [order.deliveryArea, formatOrderDeliveryLabel(order)].filter(Boolean);

  popupElement.className = "order-marker-popup";
  popupTitleElement.className = "order-marker-popup__title";
  popupTitleElement.textContent = `${order.name} · ${order.customer}`;
  popupAddressElement.className = "order-marker-popup__address";
  popupAddressElement.textContent = order.address;
  popupMetaElement.className = "order-marker-popup__meta";
  for (const deliveryMetaValue of deliveryMetaValues.length > 0 ? deliveryMetaValues : ["—"]) {
    const metaTabElement = document.createElement("span");
    metaTabElement.className = "order-marker-popup__meta-tab";
    metaTabElement.textContent = deliveryMetaValue;
    popupMetaElement.append(metaTabElement);
  }
  popupActionButton.type = "button";
  popupActionButton.className = "order-marker-popup__action";
  popupActionButton.textContent = plannedIndex > 0 ? "Added to map" : "Add to map";
  popupActionButton.disabled = plannedIndex > 0;
  popupActionButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onAddToPlan(order.id);
  });

  popupElement.append(
    popupTitleElement,
    popupAddressElement,
    popupMetaElement,
    popupActionButton,
  );

  return popupElement;
}

function isOrdersMapStyleReady(map) {
  if (typeof map?.isStyleLoaded !== "function") return true;

  try {
    return map.isStyleLoaded();
  } catch {
    return false;
  }
}

function getPlannedOrderPinImageId(plannedIndex) {
  return `${ORDER_PIN_PLANNED_IMAGE_ID}-${plannedIndex}`;
}

function ensureOrdersMapPinImages(map, plannedOrderIds = []) {
  if (typeof map?.hasImage !== "function" || typeof map?.addImage !== "function") {
    return false;
  }

  const images = [
    {
      id: ORDER_PIN_IMAGE_ID,
      imageData: createMapPinImageData(MAP_MARKER_PALETTE.order.color, {
        pixelRatio: ORDER_PIN_PIXEL_RATIO,
        shadowColor: MAP_MARKER_PALETTE.order.shadowColor,
      }),
    },
    ...plannedOrderIds.map((_, index) => {
      const plannedIndex = index + 1;
      return {
        id: getPlannedOrderPinImageId(plannedIndex),
        imageData: createMapPinImageData(MAP_MARKER_PALETTE.plannedOrder.color, {
          label: plannedIndex,
          pixelRatio: ORDER_PIN_PIXEL_RATIO,
          shadowColor: MAP_MARKER_PALETTE.plannedOrder.shadowColor,
        }),
      };
    }),
  ];

  for (const image of images) {
    if (!image.imageData) return false;
    if (map.hasImage(image.id)) continue;

    map.addImage(image.id, image.imageData, { pixelRatio: ORDER_PIN_PIXEL_RATIO });
  }

  return true;
}

function buildOrdersMapFeatureCollection(orders, plannedOrderIds) {
  const plannedIndexByOrderId = new Map(
    plannedOrderIds.map((orderId, index) => [orderId, index + 1]),
  );

  return {
    type: "FeatureCollection",
    features: orders
      .filter((order) => order.hasCoordinates && plannedIndexByOrderId.has(order.id))
      .map((order) => {
        const plannedIndex = plannedIndexByOrderId.get(order.id) ?? 0;
        const isPlanned = true;

        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: order.coordinates,
          },
          properties: {
            isPlanned,
            orderId: order.id,
            orderName: order.name,
            pinImage: isPlanned ? getPlannedOrderPinImageId(plannedIndex) : ORDER_PIN_IMAGE_ID,
            plannedIndex,
            sortKey: isPlanned ? 1000 - plannedIndex : 1,
          },
        };
      }),
  };
}

function syncOrdersMapMarkerLayer(map, orders, plannedOrderIds) {
  if (!isOrdersMapStyleReady(map)) return false;
  if (!ensureOrdersMapPinImages(map, plannedOrderIds)) return false;

  const featureCollection = buildOrdersMapFeatureCollection(orders, plannedOrderIds);
  const existingSource = map.getSource?.(ORDERS_MAP_SOURCE_ID);
  if (existingSource?.setData) {
    existingSource.setData(featureCollection);
  } else {
    map.addSource(ORDERS_MAP_SOURCE_ID, {
      type: "geojson",
      data: featureCollection,
    });
  }

  if (!map.getLayer?.(ORDERS_MAP_ORDER_LAYER_ID)) {
    map.addLayer({
      id: ORDERS_MAP_ORDER_LAYER_ID,
      minzoom: ORDER_MARKER_MIN_ZOOM,
      type: "symbol",
      source: ORDERS_MAP_SOURCE_ID,
      layout: {
        "icon-allow-overlap": true,
        "icon-anchor": "bottom",
        "icon-ignore-placement": true,
        "icon-image": ["get", "pinImage"],
        "icon-size": ORDER_PIN_ICON_SIZE,
        "symbol-sort-key": ["get", "sortKey"],
      },
    });
  }

  return true;
}

function getOrderIdFromMapFeature(feature) {
  const orderId = feature?.properties?.orderId;
  return typeof orderId === "string" && orderId.length > 0 ? orderId : null;
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

  const routeCreateStartedAt = getSafePerformanceNow();
  const routeCreateTimings = {};
  const plannedOrderIds = JSON.parse(formData.get("plannedOrderIds") ?? "[]");
  const routeName = textOrUndefined(formData.get("routeName"));
  const routeScope = JSON.parse(formData.get("routeScope") ?? "null");

  if (!Array.isArray(plannedOrderIds) || plannedOrderIds.length === 0) {
    return { errors: [{ message: "Route plan에 추가된 주문이 없습니다." }] };
  }

  const shopifyDataStartedAt = getSafePerformanceNow();
  const [orderData, departureLocationData] = await Promise.all([
    fetchShopifyOrders(admin),
    fetchShopifyDepartureLocation(admin, { cacheKey: shopifyShopCacheKey }),
  ]);
  routeCreateTimings.shopifyDataMs = roundPerfDuration(getSafePerformanceNow() - shopifyDataStartedAt);
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
            reason: "route_create_preflight",
            orders: plannedShopifyOrderSnapshots,
          },
          { cacheKey: shopifyShopCacheKey, sessionToken: shopifySessionToken },
        )
      : { orders: [], errors: [] };
  routeCreateTimings.syncOrdersMs = roundPerfDuration(getSafePerformanceNow() - syncOrdersStartedAt);

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
  routeCreateTimings.canonicalOrdersMs = roundPerfDuration(getSafePerformanceNow() - canonicalOrdersStartedAt);

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

  const routePlanPayload = buildCreateRoutePlanPayload({
    departureLocation: departureLocationData.departureLocation,
    plannedOrders,
    routeName,
    routeScope,
  });
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
  routeCreateTimings.createRoutePlanMs = roundPerfDuration(getSafePerformanceNow() - createRoutePlanStartedAt);
  logDevPerformanceMetric("orders.create_route.action", {
    ...routeCreateTimings,
    totalMs: roundPerfDuration(getSafePerformanceNow() - routeCreateStartedAt),
    plannedOrderCount: plannedOrders.length,
    syncedOrderCount: syncedOrderData.orders?.length ?? 0,
    canonicalOrderCount: canonicalOrderData.orders?.length ?? 0,
    routeGroupId: generatedRouteGroup?.id ?? null,
    routePlanId: routePlan?.id ?? null,
    errorCount: routePlanErrors.length,
  });

  if (routePlan?.id) {
    return { routePlan, routeGroup: generatedRouteGroup, errors: [] };
  }

  return {
    errors: [
      ...(orderData.errors ?? []),
      ...(syncedOrderData.errors ?? []),
      ...(departureLocationData.errors ?? []),
      ...routePlanErrors,
    ],
  };
}

export const loader = async ({ request }) => {
  const loaderStartedAt = getSafePerformanceNow();
  const { admin, session } = await authenticate.admin(request);
  const shopifyShopCacheKey = session?.shop;

  const ordersStartedAt = getSafePerformanceNow();
  const orderDataPromise = fetchShopifyOrders(admin, {
    cacheKey: shopifyShopCacheKey,
  }).then((orderData) => ({
    data: orderData,
    durationMs: roundPerfDuration(getSafePerformanceNow() - ordersStartedAt),
  }));

  const departureLocationStartedAt = getSafePerformanceNow();
  const departureLocationDataPromise = fetchShopifyDepartureLocation(
    admin,
    { cacheKey: shopifyShopCacheKey },
  ).then((departureLocationData) => ({
    data: departureLocationData,
    durationMs: roundPerfDuration(getSafePerformanceNow() - departureLocationStartedAt),
  }));

  const serverOrdersStartedAt = getSafePerformanceNow();
  const shopTimeZoneStartedAt = getSafePerformanceNow();
  const shopTimeZoneDataPromise = fetchShopifyShopTimeZone(admin).then((shopTimeZoneData) => ({
    data: shopTimeZoneData,
    durationMs: roundPerfDuration(getSafePerformanceNow() - shopTimeZoneStartedAt),
  }));

  const serverOrderDataPromise = fetchDeliveryOrders(
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
  );

  const [
    orderDataResult,
    departureLocationDataResult,
    serverOrderDataResult,
    shopTimeZoneDataResult,
  ] = await Promise.all([
    orderDataPromise,
    departureLocationDataPromise,
    serverOrderDataPromise,
    shopTimeZoneDataPromise,
  ]);
  const orderData = orderDataResult.data;
  const departureLocationData = departureLocationDataResult.data;
  const serverOrderData = serverOrderDataResult.data;
  const shopTimeZoneData = shopTimeZoneDataResult.data;
  const shopLocalDate = getShopLocalDate(shopTimeZoneData);
  const serverOrderRows = mapCanonicalOrdersToOrderRows(serverOrderData.orders);
  const mergedOrders = mergeShopifyOrderRowsWithCanonicalRows(
    orderData.orders,
    serverOrderRows,
  );

  return {
    orders: mergedOrders,
    errors: collectServiceErrors(
      [orderData, departureLocationData, serverOrderData],
      { ignoredCodes: [DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE] },
    ),
    departureLocation: departureLocationData.departureLocation,
    shopLocalDate,
    shopTimeZone: shopTimeZoneData.ianaTimezone ?? null,
    perf: {
      loader: {
        totalMs: roundPerfDuration(getSafePerformanceNow() - loaderStartedAt),
        shopifyOrdersMs: orderDataResult.durationMs,
        departureLocationMs: departureLocationDataResult.durationMs,
        serverOrdersMs: serverOrderDataResult.durationMs,
        shopTimeZoneMs: shopTimeZoneDataResult.durationMs,
      },
    },
  };
};

export default function OrdersPage() {
  const routePlanFetcher = useFetcher();
  const ordersSyncFetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, errors, departureLocation, perf, shopLocalDate } = useLoaderData();
  const [optimisticOrderFilters, setOptimisticOrderFilters] = useState(null);
  const safeOrders = useMemo(
    () => (Array.isArray(orders) ? orders : []),
    [orders],
  );
  const syncedOrders = useMemo(
    () => mapCanonicalOrdersToOrderRows(ordersSyncFetcher.data?.syncedOrders),
    [ordersSyncFetcher.data?.syncedOrders],
  );
  const displayOrders = useMemo(
    () =>
      syncedOrders.length > 0
        ? mergeShopifyOrderRowsWithCanonicalRows(safeOrders, syncedOrders)
        : safeOrders,
    [safeOrders, syncedOrders],
  );
  const urlOrderFilters = useMemo(
    () => getOrderFiltersFromSearchParams(searchParams),
    [searchParams],
  );
  const orderFilters = optimisticOrderFilters ?? urlOrderFilters;
  const orderFilterReferenceDate = useMemo(
    () => shopLocalDate ?? new Date(),
    [shopLocalDate],
  );
  const orderFilterOptionOrders = useMemo(
    () => filterOrders(displayOrders, {
      ...orderFilters,
      tab: "all",
      deliveryArea: "",
      deliveryState: "",
      deliveryWeekday: "",
      orderedDateFrom: "",
      orderedDateTo: "",
      serviceType: "",
      referenceDate: orderFilterReferenceDate,
    }),
    [displayOrders, orderFilters, orderFilterReferenceDate],
  );
  const orderFilterOptions = useMemo(
    () => ({
      deliveryAreas: getOrderFilterOptions(filterOrders(orderFilterOptionOrders, {
        ...orderFilters,
        tab: "all",
        deliveryArea: "",
        referenceDate: orderFilterReferenceDate,
      })).deliveryAreas,
      deliveryWeekdays: getOrderFilterOptions(filterOrders(orderFilterOptionOrders, {
        ...orderFilters,
        tab: "all",
        deliveryWeekday: "",
        referenceDate: orderFilterReferenceDate,
      })).deliveryWeekdays,
      deliveryStates: getOrderFilterOptions(filterOrders(orderFilterOptionOrders, {
        ...orderFilters,
        tab: "all",
        deliveryState: "",
        referenceDate: orderFilterReferenceDate,
      })).deliveryStates,
      serviceTypes: getOrderFilterOptions(filterOrders(orderFilterOptionOrders, {
        ...orderFilters,
        tab: "all",
        serviceType: "",
        referenceDate: orderFilterReferenceDate,
      })).serviceTypes,
    }),
    [orderFilterOptionOrders, orderFilters, orderFilterReferenceDate],
  );
  const filteredOrders = useMemo(
    () => filterOrders(displayOrders, {
      ...orderFilters,
      tab: "all",
      referenceDate: orderFilterReferenceDate,
    }),
    [displayOrders, orderFilters, orderFilterReferenceDate],
  );
  const activeOrderFilters = useMemo(
    () => hasActiveOrderFilters(orderFilters),
    [orderFilters],
  );

  useEffect(() => {
    setOptimisticOrderFilters(null);
  }, [searchParams]);
  const locatedOrders = useMemo(
    () => filteredOrders.filter((order) => order.hasCoordinates),
    [filteredOrders],
  );
  const [createRouteClientError, setCreateRouteClientError] = useState(null);
  const actionErrors = createRouteClientError
    ? [{ message: createRouteClientError }]
    : routePlanFetcher.data;
  const orderPageNoticeMessage = getServiceErrorNotice([
    actionErrors,
    { errors },
  ], { context: "orders_page" });
  const isCreatingRoute = routePlanFetcher.state !== "idle";
  const [selectedOrderId, setSelectedOrderId] = useState(
    filteredOrders[0]?.id ?? null,
  );
  const [hoveredItemPopoverOrderId, setHoveredItemPopoverOrderId] = useState(null);
  const [pinnedItemPopoverOrderId, setPinnedItemPopoverOrderId] = useState(null);
  const [checkedOrderIds, setCheckedOrderIds] = useState([]);
  const [plannedOrderIds, setPlannedOrderIds] = useState([]);
  const [routePlanTitle, setRoutePlanTitle] = useState(DEFAULT_ROUTE_PLAN_TITLE);
  const [routeAssignActionsOpen, setRouteAssignActionsOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState(null);
  const [tableColumnWidths, setTableColumnWidths] = useState(DEFAULT_TABLE_COLUMN_WIDTHS);
  const [lockedTableWidth, setLockedTableWidth] = useState(null);
  const tableRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapLibraryRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const mapRecoveryTimerRef = useRef(null);
  const mapRecoveryAttemptsRef = useRef(0);
  const initialMapFitAppliedRef = useRef(false);
  const initialMapCenterRef = useRef(DEFAULT_CENTER);
  const initialPerfEmittedRef = useRef(false);
  const submittedRouteSessionTokenRef = useRef(null);
  const orderSyncSubmittedRef = useRef(false);
  const orderedDateCalendarRef = useRef(null);
  const orderedDateButtonRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapRenderKey, setMapRenderKey] = useState(0);
  const [mapStatus, setMapStatus] = useState("idle");
  const [isMapWide, setIsMapWide] = useState(false);
  const [planFitRequest, setPlanFitRequest] = useState(0);
  const [selectedOrderFocusRequest, setSelectedOrderFocusRequest] = useState(0);
  const [orderedDateCalendarOpen, setOrderedDateCalendarOpen] = useState(false);
  const [pendingOrderedDateStart, setPendingOrderedDateStart] = useState("");
  const [orderedDateCalendarMonth, setOrderedDateCalendarMonth] = useState(() =>
    getCalendarMonthValue(shopLocalDate),
  );
  const [orderedDateCalendarPosition, setOrderedDateCalendarPosition] = useState({ left: 0, top: 0 });
  const orderedDateLabel = formatOrderDateRangeLabel(
    orderFilters.orderedDateFrom,
    orderFilters.orderedDateTo,
  );
  const orderedDateFilterActive = Boolean(orderFilters.orderedDateFrom || orderFilters.orderedDateTo);
  const visibleItemPopoverOrderId = pinnedItemPopoverOrderId ?? hoveredItemPopoverOrderId;
  const orderedDateCalendarDays = useMemo(
    () => getCalendarDays(orderedDateCalendarMonth),
    [orderedDateCalendarMonth],
  );

  const sortedOrders = useMemo(() => {
    if (!sortConfig) return filteredOrders;

    return [...filteredOrders].sort((leftOrder, rightOrder) => {
      const comparison = compareOrderSortValues(
        getOrderSortValue(leftOrder, sortConfig.key, orderFilterReferenceDate),
        getOrderSortValue(rightOrder, sortConfig.key, orderFilterReferenceDate),
      );

      return sortConfig.direction === "ascending" ? comparison : -comparison;
    });
  }, [filteredOrders, sortConfig, orderFilterReferenceDate]);

  const displayOrderById = useMemo(
    () => new Map(displayOrders.map((order) => [order.id, order])),
    [displayOrders],
  );

  const checkedOrderIdSet = useMemo(
    () => new Set(checkedOrderIds),
    [checkedOrderIds],
  );

  const plannedOrderIdSet = useMemo(
    () => new Set(plannedOrderIds),
    [plannedOrderIds],
  );

  const tableOrders = sortedOrders;
  const tableWidth = lockedTableWidth ? `${lockedTableWidth}px` : "100%";

  const plannedOrders = useMemo(() => {
    return plannedOrderIds
      .map((orderId) => displayOrderById.get(orderId))
      .filter(Boolean);
  }, [displayOrderById, plannedOrderIds]);

  const selectableTableOrders = useMemo(
    () => tableOrders.filter((order) => !plannedOrderIdSet.has(order.id)),
    [plannedOrderIdSet, tableOrders],
  );
  const plannedLocatedOrders = useMemo(() => plannedOrders.filter((order) => order.hasCoordinates), [plannedOrders]);
  const initialMapCenter = useMemo(
    () => departureLocation?.hasCoordinates ? departureLocation.coordinates : DEFAULT_CENTER,
    [departureLocation],
  );

  useEffect(() => {
    initialMapCenterRef.current = initialMapCenter;
  }, [initialMapCenter]);

  const routeFitLocations = useMemo(
    () => [
      ...(departureLocation?.hasCoordinates ? [departureLocation] : []),
      ...plannedLocatedOrders,
    ],
    [departureLocation, plannedLocatedOrders],
  );

  const routeDraftSummary = useMemo(() => {
    const deliveryAreas = getUniqueRouteDraftValues(
      plannedOrders,
      "deliveryArea",
    );

    return {
      orderCount: plannedOrders.length,
      itemCount: plannedOrders.reduce((total, order) => total + getOrderItemCount(order), 0),
      scopeLabel: formatRouteDraftScopeLabel(plannedOrders),
      deliveryAreas,
    };
  }, [plannedOrders]);

  const allVisibleOrdersChecked =
    selectableTableOrders.length > 0 &&
    selectableTableOrders.every((order) => checkedOrderIdSet.has(order.id));
  const createRouteDisabled = plannedOrders.length === 0 || routePlanFetcher.state !== "idle";

  useEffect(() => {
    if (filteredOrders.length === 0) {
      setSelectedOrderId(null);
      return;
    }

    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0].id);
    }
  }, [filteredOrders, selectedOrderId]);

  useEffect(() => {
    const displayOrderIds = new Set(displayOrders.map((order) => order.id));
    const selectableOrderIds = new Set(
      filteredOrders
        .filter((order) => !plannedOrderIdSet.has(order.id))
        .map((order) => order.id),
    );

    setCheckedOrderIds((currentOrderIds) => {
      const nextOrderIds = currentOrderIds.filter((orderId) =>
        selectableOrderIds.has(orderId),
      );

      return nextOrderIds.length === currentOrderIds.length
        ? currentOrderIds
        : nextOrderIds;
    });

    setPlannedOrderIds((currentOrderIds) => {
      const nextOrderIds = currentOrderIds.filter((orderId) =>
        displayOrderIds.has(orderId),
      );

      return nextOrderIds.length === currentOrderIds.length
        ? currentOrderIds
        : nextOrderIds;
    });
  }, [displayOrders, filteredOrders, plannedOrderIdSet]);

  const selectedOrder =
    displayOrders.find((order) => order.id === selectedOrderId) ?? filteredOrders[0];

  const handleSelectOrder = useCallback((orderId, options = {}) => {
    setSelectedOrderId(orderId);

    if (options.focusMap !== false) {
      setSelectedOrderFocusRequest((requestCount) => requestCount + 1);
    }
  }, []);

  const handleSort = (columnKey) => {
    setSortConfig((currentSortConfig) => {
      if (currentSortConfig?.key !== columnKey) {
        return { key: columnKey, direction: "ascending" };
      }

      if (currentSortConfig.direction === "ascending") {
        return { key: columnKey, direction: "descending" };
      }

      return null;
    });
  };

  const getHeaderAriaSort = (columnKey) =>
    sortConfig?.key === columnKey ? sortConfig.direction : "none";

  const getSortIndicator = (columnKey) => {
    if (sortConfig?.key !== columnKey) return "";
    return sortConfig.direction === "ascending" ? " ▲" : " ▼";
  };

  const handleColumnResizeStart = (columnIndex, event) => {
    event.preventDefault();
    event.stopPropagation();

    const tableElement = tableRef.current;
    if (!tableElement) return;

    const rightColumnIndex = columnIndex + 1;
    const { tableWidth: measuredTableWidth, widths: startWidths } =
      getTableColumnPixelState(tableElement);
    const leftStartWidth = startWidths[columnIndex];
    const rightStartWidth = startWidths[rightColumnIndex];

    if (
      rightColumnIndex >= startWidths.length ||
      !Number.isFinite(leftStartWidth) ||
      !Number.isFinite(rightStartWidth)
    ) {
      return;
    }

    setLockedTableWidth(measuredTableWidth);
    setTableColumnWidths(startWidths);

    const startX = event.clientX;
    const minDelta = MIN_TABLE_COLUMN_WIDTH - leftStartWidth;
    const maxDelta = rightStartWidth - MIN_TABLE_COLUMN_WIDTH;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent) => {
      const rawDelta = Math.round(moveEvent.clientX - startX);
      const delta = Math.max(minDelta, Math.min(rawDelta, maxDelta));

      setTableColumnWidths(
        startWidths.map((width, widthIndex) => {
          if (widthIndex === columnIndex) return leftStartWidth + delta;
          if (widthIndex === rightColumnIndex) return rightStartWidth - delta;
          return width;
        }),
      );
    };

    const stopResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  };

  const handleColumnAutoFit = (columnIndex, event) => {
    event.preventDefault();
    event.stopPropagation();

    const tableElement = tableRef.current;
    if (!tableElement) return;

    const rightColumnIndex = columnIndex + 1;
    const { tableWidth: measuredTableWidth, widths: startWidths } =
      getTableColumnPixelState(tableElement);
    const leftStartWidth = startWidths[columnIndex];
    const rightStartWidth = startWidths[rightColumnIndex];

    if (
      rightColumnIndex >= startWidths.length ||
      !Number.isFinite(leftStartWidth) ||
      !Number.isFinite(rightStartWidth)
    ) {
      return;
    }

    const rawDelta = getTableColumnFitWidth(tableElement, columnIndex) - leftStartWidth;
    const minDelta = MIN_TABLE_COLUMN_WIDTH - leftStartWidth;
    const maxDelta = rightStartWidth - MIN_TABLE_COLUMN_WIDTH;
    const delta = Math.max(minDelta, Math.min(rawDelta, maxDelta));

    setLockedTableWidth(measuredTableWidth);
    setTableColumnWidths(
      startWidths.map((width, widthIndex) => {
        if (widthIndex === columnIndex) return leftStartWidth + delta;
        if (widthIndex === rightColumnIndex) return rightStartWidth - delta;
        return width;
      }),
    );
  };

  const handleOrderFilterChange = (filterKey, filterValue) => {
    const nextFilters = {
      ...orderFilters,
      [filterKey]: filterValue,
    };

    setOptimisticOrderFilters(nextFilters);

    setSearchParams(
      updateOrderFilterSearchParams(searchParams, nextFilters),
      {
        preventScrollReset: true,
        replace: true,
      },
    );
  };

  const handleClearOrderFilter = (filterKey) => {
    const nextFilters = { ...orderFilters };

    if (filterKey === "orderedDate") {
      nextFilters.orderedDateFrom = "";
      nextFilters.orderedDateTo = "";
      setPendingOrderedDateStart("");
      setOrderedDateCalendarOpen(false);
    } else {
      nextFilters[filterKey] = "";
    }

    setOptimisticOrderFilters(nextFilters);

    setSearchParams(
      updateOrderFilterSearchParams(searchParams, nextFilters),
      {
        preventScrollReset: true,
        replace: true,
      },
    );
  };

  const applyOrderedDateRange = useCallback((startDate, endDate) => {
    const nextFilters = {
      ...orderFilters,
      orderedDateFrom: startDate,
      orderedDateTo: endDate,
    };

    setOptimisticOrderFilters(nextFilters);

    setSearchParams(
      updateOrderFilterSearchParams(searchParams, nextFilters),
      {
        preventScrollReset: true,
        replace: true,
      },
    );
  }, [orderFilters, searchParams, setSearchParams]);

  const positionOrderedDateCalendar = useCallback(() => {
    const rect = orderedDateButtonRef.current?.getBoundingClientRect();
    if (!rect) return;

    setOrderedDateCalendarPosition({
      left: Math.max(8, rect.left),
      top: rect.bottom + 8,
    });
  }, []);

  const handleOrderedDateCalendarOpen = () => {
    positionOrderedDateCalendar();
    setOrderedDateCalendarMonth(
      getCalendarMonthValue(orderFilters.orderedDateFrom || shopLocalDate),
    );
    setOrderedDateCalendarOpen((isOpen) => !isOpen);
  };

  const handleOrderedDatePick = (dateValue) => {
    if (!pendingOrderedDateStart) {
      setPendingOrderedDateStart(dateValue);
      return;
    }

    const [startDate, endDate] = [pendingOrderedDateStart, dateValue].sort();
    applyOrderedDateRange(startDate, endDate);
    setPendingOrderedDateStart("");
    setOrderedDateCalendarOpen(false);
  };

  useEffect(() => {
    if (!pinnedItemPopoverOrderId) return undefined;

    const handleDocumentPointerDown = (event) => {
      if (event.target?.closest?.('[data-order-items-popover-root="true"]')) return;
      setPinnedItemPopoverOrderId(null);
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, [pinnedItemPopoverOrderId]);

  useEffect(() => {
    if (!orderedDateCalendarOpen) return undefined;

    const handleDocumentPointerDown = (event) => {
      if (orderedDateCalendarRef.current?.contains(event.target)) return;
      if (orderedDateButtonRef.current?.contains(event.target)) return;

      if (pendingOrderedDateStart) {
        applyOrderedDateRange(pendingOrderedDateStart, pendingOrderedDateStart);
      }

      setPendingOrderedDateStart("");
      setOrderedDateCalendarOpen(false);
    };
    const handleWindowLayoutChange = () => positionOrderedDateCalendar();

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    window.addEventListener("resize", handleWindowLayoutChange);
    window.addEventListener("scroll", handleWindowLayoutChange, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      window.removeEventListener("resize", handleWindowLayoutChange);
      window.removeEventListener("scroll", handleWindowLayoutChange, true);
    };
  }, [
    applyOrderedDateRange,
    orderedDateCalendarOpen,
    pendingOrderedDateStart,
    positionOrderedDateCalendar,
  ]);

  const handleClearOrderFilters = () => {
    const nextFilters = {
      deliveryArea: "",
      deliveryDate: "",
      deliveryState: "",
      deliveryWeekday: "",
      orderedDate: "",
      orderedDateFrom: "",
      orderedDateTo: "",
      scope: ORDER_PLANNING_SCOPE,
      search: "",
      serviceType: "",
      tab: "unplanned",
    };

    setOptimisticOrderFilters(nextFilters);
    setPendingOrderedDateStart("");
    setOrderedDateCalendarOpen(false);

    setSearchParams(
      updateOrderFilterSearchParams(searchParams, nextFilters),
      {
        preventScrollReset: true,
        replace: true,
      },
    );
  };

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
      setIsMapReady(false);
      setMapRenderKey((currentRenderKey) => currentRenderKey + 1);
    }, MAP_RECOVERY_DELAY_MS);
  }, []);

  const handleRefreshMap = () => {
    clearMapRecoveryTimer();
    mapRecoveryAttemptsRef.current = 0;
    setIsMapReady(false);
    setMapStatus("idle");
    setMapRenderKey((currentRenderKey) => currentRenderKey + 1);
  };

  const handleToggleMapWide = () => {
    setIsMapWide((currentIsMapWide) => !currentIsMapWide);
  };

  const handleZoomInMap = () => {
    mapRef.current?.zoomIn({ duration: 250 });
  };

  const handleZoomOutMap = () => {
    mapRef.current?.zoomOut({ duration: 250 });
  };

  const fitMapToOrders = useCallback((ordersToFit) => {
    if (
      !isMapReady ||
      !mapRef.current ||
      !mapLibraryRef.current ||
      ordersToFit.length === 0
    ) {
      return;
    }

    if (ordersToFit.length === 1) {
      mapRef.current.flyTo({
        center: ordersToFit[0].coordinates,
        zoom: 13,
        essential: true,
      });
      return;
    }

    const maplibregl = mapLibraryRef.current;
    const bounds = new maplibregl.LngLatBounds(
      ordersToFit[0].coordinates,
      ordersToFit[0].coordinates,
    );

    for (const order of ordersToFit.slice(1)) {
      bounds.extend(order.coordinates);
    }

    mapRef.current.fitBounds(bounds, {
      duration: 700,
      essential: true,
      maxZoom: 13,
      padding: 72,
    });
  }, [isMapReady]);

  const toggleOrderCheck = (orderId) => {
    if (plannedOrderIdSet.has(orderId)) return;

    setCheckedOrderIds((currentOrderIds) =>
      checkedOrderIdSet.has(orderId)
        ? currentOrderIds.filter((selectedOrderId) => selectedOrderId !== orderId)
        : [...currentOrderIds, orderId],
    );
    setCreateRouteClientError(null);
  };

  const toggleAllVisibleOrderChecks = () => {
    if (!allVisibleOrdersChecked) {
      setCheckedOrderIds((currentOrderIds) =>
        Array.from(
          new Set([
            ...currentOrderIds,
            ...selectableTableOrders.map((order) => order.id),
          ]),
        ),
      );
      setCreateRouteClientError(null);
      return;
    }

    setCheckedOrderIds((currentOrderIds) => {
      const visibleOrderIds = new Set(selectableTableOrders.map((order) => order.id));
      return currentOrderIds.filter((orderId) => !visibleOrderIds.has(orderId));
    });
  };

  const handleAddOrderToPlan = useCallback((orderId) => {
    if (plannedOrderIdSet.has(orderId)) return;

    const nextOrderIds = Array.from(new Set([...plannedOrderIds, orderId]));
    const nextOrders = nextOrderIds
      .map((nextOrderId) => displayOrderById.get(nextOrderId))
      .filter(Boolean);

    setPlannedOrderIds(nextOrderIds);
    setRoutePlanTitle(buildRoutePlanTitleFromOrders(nextOrders));
    setCheckedOrderIds((currentOrderIds) =>
      currentOrderIds.filter((checkedOrderId) => checkedOrderId !== orderId),
    );
    setCreateRouteClientError(null);
    setSelectedOrderId(orderId);
  }, [displayOrderById, plannedOrderIdSet, plannedOrderIds]);

  const handleAddToPlan = () => {
    if (checkedOrderIds.length === 0) return;

    const selectedOrderIds = checkedOrderIds.filter((orderId) =>
      displayOrderById.has(orderId) && !plannedOrderIdSet.has(orderId),
    );

    if (selectedOrderIds.length === 0) return;

    const nextOrderIds = Array.from(new Set([...plannedOrderIds, ...selectedOrderIds]));
    const nextOrders = nextOrderIds
      .map((orderId) => displayOrderById.get(orderId))
      .filter(Boolean);

    setPlannedOrderIds(nextOrderIds);
    setRoutePlanTitle(buildRoutePlanTitleFromOrders(nextOrders));
    setCheckedOrderIds([]);
    setCreateRouteClientError(null);
    setPlanFitRequest((requestCount) => requestCount + 1);
  };

  const handleClearPlan = () => {
    setPlannedOrderIds([]);
    setRoutePlanTitle(DEFAULT_ROUTE_PLAN_TITLE);
    setRouteAssignActionsOpen(false);
  };

  const handleZoomToPlanned = () => {
    fitMapToOrders(routeFitLocations);
  };

  const handleToggleRouteAssignActions = () => {
    if (createRouteDisabled) return;

    setRouteAssignActionsOpen((isOpen) => !isOpen);
  };


  const handleCreateRoute = async () => {
    if (plannedOrderIds.length === 0 || isCreatingRoute) return;

    try {
      setCreateRouteClientError(null);
      const sessionToken = await shopify.idToken();
      submittedRouteSessionTokenRef.current = sessionToken;

      const routeDraftScope = buildRouteScopeFromOrders(plannedOrders);
      const formData = new FormData();
      formData.set("_intent", "createRoutePlan");
      formData.set("plannedOrderIds", JSON.stringify(plannedOrders.map((order) => order.id)));
      formData.set("routeScope", JSON.stringify(routeDraftScope));
      formData.set("routeName", routePlanTitle.trim() || DEFAULT_ROUTE_PLAN_TITLE);
      formData.set("orderScope", orderFilters.scope);
      formData.set("shopifySessionToken", sessionToken);
      routePlanFetcher.submit(formData, { method: "post" });
    } catch {
      submittedRouteSessionTokenRef.current = null;
      setCreateRouteClientError(
        "Shopify session token을 가져오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.",
      );
    }
  };

  useEffect(() => {
    if (orderSyncSubmittedRef.current) return;

    const orderSnapshots = getOrderSyncSnapshots(safeOrders);
    if (orderSnapshots.length === 0) return;

    let cancelled = false;
    orderSyncSubmittedRef.current = true;

    shopify
      .idToken()
      .then((sessionToken) => {
        if (cancelled) return;

        const formData = new FormData();
        formData.set("_intent", "syncOrders");
        formData.set("shopifySessionToken", sessionToken);
        formData.set("orders", JSON.stringify(orderSnapshots));
        ordersSyncFetcher.submit(formData, { method: "post" });
      })
      .catch(() => {
        orderSyncSubmittedRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [ordersSyncFetcher, safeOrders, shopify]);

  useEffect(() => {
    const createdRoutePlan = routePlanFetcher.data?.routePlan;
    const sessionToken = submittedRouteSessionTokenRef.current;

    if (!sessionToken) return;

    if (!createdRoutePlan?.id) return;

    submittedRouteSessionTokenRef.current = null;
    navigate(`/app/routes/${createdRoutePlan.id}?id_token=${encodeURIComponent(sessionToken)}`);
  }, [navigate, routePlanFetcher.data?.routePlan]);

  useEffect(() => {
    if (initialPerfEmittedRef.current) return;

    initialPerfEmittedRef.current = true;
    emitPerformanceMetric({
      name: "shopify.admin.iframe",
      category: "shopify-admin-iframe",
      durationMs: roundPerfDuration(performance.now()),
      isEmbeddedIframe: getEmbeddedIframeState(),
      isShopifyAdminReferrer: document.referrer.includes("admin.shopify.com"),
    });

    const navigationTimingMetric = getNavigationTimingMetric();
    if (navigationTimingMetric) {
      emitPerformanceMetric(navigationTimingMetric);
    }

    if (perf?.loader) {
      emitPerformanceMetric({
        name: "orders.loader",
        category: "orders-loader",
        ...perf.loader,
      });
    }
  }, [perf]);

  useEffect(() => () => clearMapRecoveryTimer(), [clearMapRecoveryTimer]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return undefined;
    }

    let isMounted = true;

    const initializeMap = async () => {
      initialMapFitAppliedRef.current = false;
      const mapInitStartedAt = performance.now();
      const mapLibreImportStartedAt = performance.now();
      const [{ default: maplibregl }, { Protocol }] = await Promise.all([
        import("maplibre-gl"),
        import("pmtiles"),
      ]);
      const mapLibreImportMs = roundPerfDuration(
        performance.now() - mapLibreImportStartedAt,
      );

      if (!isMounted || !mapContainerRef.current || mapRef.current) return;

      installPmtilesProtocol(maplibregl, Protocol);
      mapLibraryRef.current = maplibregl;
      const mapConstructStartedAt = performance.now();
      mapRef.current = new maplibregl.Map({
        container: mapContainerRef.current,
        style: OPENFREEMAP_STYLE_URL,
        center: initialMapCenterRef.current,
        zoom: INITIAL_HOME_ZOOM,
        attributionControl: { compact: true },
        fadeDuration: 0,
      });
      installMissingMapImageFallback(mapRef.current);

      const mapConstructMs = roundPerfDuration(
        performance.now() - mapConstructStartedAt,
      );
      emitPerformanceMetric({
        name: "orders.maplibre.init",
        category: "maplibre-init",
        durationMs: roundPerfDuration(performance.now() - mapInitStartedAt),
        mapLibreImportMs,
        mapConstructMs,
      });

      mapRef.current.on("load", () => {
        mapRecoveryAttemptsRef.current = 0;
        setMapStatus("idle");
        setIsMapReady(true);
        emitPerformanceMetric({
          name: "orders.maplibre.load",
          category: "maplibre-load",
          durationMs: roundPerfDuration(performance.now() - mapInitStartedAt),
          mapLoadWaitMs: roundPerfDuration(
            performance.now() - mapInitStartedAt - mapLibreImportMs - mapConstructMs,
          ),
        });
      });

      mapRef.current.on("error", (event) => {
        const errorMessage = event?.error?.message ?? "";

        if (
          errorMessage.includes("tiles.openfreemap.org") ||
          errorMessage.includes("overturemaps-tiles-us-west-2-beta.s3.amazonaws.com") ||
          errorMessage.includes("pmtiles") ||
          errorMessage.includes("AJAXError")
        ) {
          scheduleMapRecovery();
          return;
        }

        setMapStatus("failed");
      });
    };

    const cancelMapInitialization = scheduleIdleTask(initializeMap);

    return () => {
      cancelMapInitialization();
      isMounted = false;
      const mapRemoveStartedAt = performance.now();
      const markerCount = markersRef.current.length;
      const markersRemoveStartedAt = performance.now();
      markersRef.current.forEach((marker) => marker.remove());
      const markersRemoveMs = roundPerfDuration(
        performance.now() - markersRemoveStartedAt,
      );
      markersRef.current = [];
      const singleMapRemoveStartedAt = performance.now();
      mapRef.current?.remove();
      const mapRemoveMs = roundPerfDuration(
        performance.now() - singleMapRemoveStartedAt,
      );
      emitPerformanceMetric({
        name: "orders.maplibre.remove",
        category: "maplibre-remove",
        durationMs: roundPerfDuration(performance.now() - mapRemoveStartedAt),
        markerCount,
        markersRemoveMs,
        mapRemoveMs,
      });
      mapRef.current = null;
      mapLibraryRef.current = null;
    };
  }, [mapRenderKey, scheduleMapRecovery]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !mapLibraryRef.current) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const maplibregl = mapLibraryRef.current;
    const map = mapRef.current;

    if (departureLocation?.hasCoordinates) {
      const departureMarkerElement = createDepartureMarkerElement(departureLocation);
      const departureMarker = new maplibregl.Marker({ element: departureMarkerElement, anchor: "bottom" })
        .setLngLat(departureLocation.coordinates)
        .addTo(map);

      markersRef.current.push(departureMarker);
    }

    const sourceUpdateStartedAt = performance.now();
    const hadExistingOrderSource = Boolean(map.getSource?.(ORDERS_MAP_SOURCE_ID));
    const ordersLayerSynced = syncOrdersMapMarkerLayer(map, locatedOrders, plannedOrderIds);
    const sourceUpdateMs = roundPerfDuration(performance.now() - sourceUpdateStartedAt);

    emitPerformanceMetric({
      name: "orders.maplibre.source_update",
      category: "maplibre-source-update",
      durationMs: sourceUpdateMs,
      sourceUpdateMs,
      orderCount: locatedOrders.length,
      plannedOrderCount: plannedOrderIds.length,
      sourceCreated: ordersLayerSynced && !hadExistingOrderSource,
      sourceSynced: ordersLayerSynced,
    });

    if (!ordersLayerSynced) return undefined;

    const handleOrderMarkerClick = (event) => {
      const orderId = getOrderIdFromMapFeature(event.features?.[0]);
      if (!orderId) return;

      const order = displayOrderById.get(orderId);
      if (!order?.hasCoordinates) return;

      const plannedIndex = plannedOrderIds.indexOf(order.id) + 1;
      handleSelectOrder(order.id, { focusMap: false });
      new maplibregl.Popup({ offset: 24 })
        .setLngLat(order.coordinates)
        .setDOMContent(
          createOrderMarkerPopupElement(
            order,
            plannedIndex,
            handleAddOrderToPlan,
          ),
        )
        .addTo(map);

      const markerClickZoom = map.getZoom?.();
      if (
        typeof markerClickZoom === "number" &&
        markerClickZoom < MARKER_CLICK_ZOOM_OUT_THRESHOLD
      ) {
        map.flyTo({
          center: order.coordinates,
          zoom: MARKER_CLICK_TARGET_ZOOM,
          essential: true,
        });
      }
    };

    const handleOrderMarkerMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleOrderMarkerMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerClick);
    map.on("mouseenter", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerMouseEnter);
    map.on("mouseleave", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerMouseLeave);

    return () => {
      map.off("click", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerClick);
      map.off("mouseenter", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerMouseEnter);
      map.off("mouseleave", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerMouseLeave);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [
    departureLocation,
    displayOrderById,
    handleAddOrderToPlan,
    handleSelectOrder,
    isMapReady,
    locatedOrders,
    plannedOrderIds,
  ]);

  useEffect(() => {
    if (
      selectedOrderFocusRequest === 0 ||
      !isMapReady ||
      !mapRef.current ||
      !selectedOrder?.hasCoordinates
    ) {
      return;
    }

    mapRef.current.flyTo({
      center: selectedOrder.coordinates,
      zoom: 13,
      essential: true,
    });
  }, [isMapReady, selectedOrder, selectedOrderFocusRequest]);

  useEffect(() => {
    if (initialMapFitAppliedRef.current || !isMapReady || !mapRef.current) {
      return;
    }

    initialMapFitAppliedRef.current = true;
    mapRef.current.flyTo({
      center: initialMapCenter,
      zoom: INITIAL_HOME_ZOOM,
      essential: true,
    });
  }, [initialMapCenter, isMapReady]);

  useEffect(() => {
    if (planFitRequest === 0) return;

    fitMapToOrders(routeFitLocations);
  }, [fitMapToOrders, planFitRequest, routeFitLocations]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current) return undefined;

    let secondResizeFrame;
    const firstResizeFrame = window.requestAnimationFrame(() => {
      secondResizeFrame = window.requestAnimationFrame(() => {
        mapRef.current?.resize();
      });
    });

    return () => {
      window.cancelAnimationFrame(firstResizeFrame);
      window.cancelAnimationFrame(secondResizeFrame);
    };
  }, [isMapReady, isMapWide]);

  return (
    <TabLayout
      primaryExpanded={isMapWide}
      notice={
        orderPageNoticeMessage ? (
          <div className="orders-error-filter" role="alert" style={orderPageNoticeStyle}>
            {orderPageNoticeMessage}
          </div>
        ) : null
      }
      primary={
        <MapPanel
          ariaLabel="Shopify delivery order map"
          canvasRef={mapContainerRef}
          canvasStyle={ordersMapCanvasStyle}
          id="orders-map"
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
                  ariaLabel: isMapWide ? "Restore map width" : "Expand map width",
                  icon: renderMapWidthIcon(isMapWide),
                  onClick: handleToggleMapWide,
                },
                {
                  ariaLabel: "Fit highlighted map markers",
                  disabled: routeFitLocations.length === 0,
                  icon: renderMapFitIcon(),
                  onClick: handleZoomToPlanned,
                },
                {
                  ariaLabel: "Refresh map",
                  icon: renderMapRefreshIcon(),
                  onClick: handleRefreshMap,
                },
              ]}
              statusGlyph={mapStatus === "recovering" ? "…" : "!"}
              statusLabel={
                mapStatus !== "idle"
                  ? mapStatus === "recovering"
                    ? "Map is refreshing"
                    : "Map refresh failed"
                  : null
              }
            />
          }
        />
      }
      secondary={
        <div className="order-route-plan" style={routePlanPanelStyle}>
          <label style={routePlanTitleGroupStyle}>
            <span style={routePlanTitleLabelStyle}>Title</span>
            <input
              aria-label="Route plan title"
              value={routePlanTitle}
              onChange={(event) => setRoutePlanTitle(event.currentTarget.value)}
              placeholder={DEFAULT_ROUTE_PLAN_TITLE}
              style={routePlanTitleFieldStyle}
            />
          </label>
          <div style={routePlanDetailStyle}>
            <div style={routePlanHeaderStyle}>
              <s-heading>Route plan</s-heading>
              <div style={routePlanHeaderActionsStyle}>
                <button
                  type="button"
                  style={
                    createRouteDisabled
                      ? disabledCreateRouteButtonStyle
                      : createRouteButtonStyle
                  }
                  aria-expanded={routeAssignActionsOpen}
                  disabled={createRouteDisabled}
                  onClick={handleToggleRouteAssignActions}
                >Assign to route</button>
                <button
                  type="button"
                  style={
                    plannedOrders.length === 0
                      ? disabledPlanButtonStyle
                      : removeFromPlanButtonStyle
                  }
                  disabled={plannedOrders.length === 0}
                  onClick={handleClearPlan}
                >Clear plan</button>
              </div>
            </div>
            <div
              style={{
                ...routeAssignActionsStyle,
                ...(routeAssignActionsOpen
                  ? routeAssignActionsOpenStyle
                  : routeAssignActionsClosedStyle),
              }}
            >
              <button
                type="button"
                style={disabledRouteAssignActionButtonStyle}
                disabled={true}
              >Add to route</button>
              <button
                type="button"
                style={
                  createRouteDisabled
                    ? disabledRouteAssignActionButtonStyle
                    : routeAssignActionButtonStyle
                }
                disabled={createRouteDisabled}
                onClick={handleCreateRoute}
              >Create route</button>
            </div>
          </div>

          <div style={routePlanDetailStyle}>
            <div style={routePlanHeaderStyle}>
              <s-heading>Inventory plan</s-heading>
              <div style={routePlanHeaderActionsStyle}>
                <button
                  type="button"
                  style={disabledPlanButtonStyle}
                  disabled={true}
                >Add</button>
                <button
                  type="button"
                  style={disabledPlanButtonStyle}
                  disabled={true}
                >Create</button>
              </div>
            </div>
          </div>

          <div style={routePlanScrollAreaStyle}>
            <div className="order-route-summary" style={routeReadinessStyle} aria-label="Order summary">
              <div style={routeReadinessHeaderStyle}>
                <s-heading>Order summary</s-heading>
                <button
                  type="button"
                  style={
                    plannedLocatedOrders.length === 0
                      ? disabledPlanButtonStyle
                      : removeFromPlanButtonStyle
                  }
                  disabled={plannedLocatedOrders.length === 0}
                  aria-label="Zoom to planned route"
                  onClick={handleZoomToPlanned}
                >Zoom to planned</button>
              </div>
              <div className="order-route-summary-grid" style={routeReadinessGridStyle}>
                <div style={routeReadinessItemStyle}>
                  <span>Scope</span>
                  <span style={routeReadinessValueStyle} title={routeDraftSummary.scopeLabel}>
                    {routeDraftSummary.scopeLabel}
                  </span>
                </div>
                <div style={routeReadinessItemStyle}>
                  <span>Orders</span>
                  <span style={routeReadinessValueStyle}>{routeDraftSummary.orderCount}</span>
                </div>
                <div style={routeReadinessItemStyle}>
                  <span>Areas</span>
                  <span
                    style={routeReadinessValueStyle}
                    title={formatRouteDraftList(routeDraftSummary.deliveryAreas)}
                  >
                    {formatRouteDraftAreaSummary(routeDraftSummary.deliveryAreas)}
                  </span>
                </div>
                <div style={routeReadinessItemStyle}>
                  <span>Items</span>
                  <span style={routeReadinessValueStyle}>{routeDraftSummary.itemCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      }
      lower={
        <div style={orderTableLayoutStyle}>
          <div style={orderControlsStyle}>
            <div style={orderFilterDateFieldStyle}>
              {!orderedDateFilterActive ? <span style={orderFilterLabelStyle}>Order date</span> : null}
              <button
                ref={orderedDateButtonRef}
                aria-label="Filter orders by ordered date"
                style={orderFilterDateButtonStyle}
                type="button"
                onClick={handleOrderedDateCalendarOpen}
              >{orderedDateLabel}</button>
              {orderedDateFilterActive ? (
                <button
                  type="button"
                  aria-label="Clear ordered date filter"
                  style={orderFilterClearButtonStyle}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => handleClearOrderFilter("orderedDate")}
                >×</button>
              ) : (
                renderOrderFilterChevron()
              )}
              {orderedDateCalendarOpen
                ? createPortal(
                    <div
                      ref={orderedDateCalendarRef}
                      style={{
                        ...orderDateCalendarStyle,
                        left: `${orderedDateCalendarPosition.left}px`,
                        top: `${orderedDateCalendarPosition.top}px`,
                      }}
                    >
                      <div style={orderDateCalendarHeaderStyle}>
                        <button
                          type="button"
                          style={orderFilterButtonStyle}
                          onClick={() => setOrderedDateCalendarMonth(shiftCalendarMonth(orderedDateCalendarMonth, -1))}
                        >‹</button>
                        <strong>{formatCalendarMonthLabel(orderedDateCalendarMonth)}</strong>
                        <button
                          type="button"
                          style={orderFilterButtonStyle}
                          onClick={() => setOrderedDateCalendarMonth(shiftCalendarMonth(orderedDateCalendarMonth, 1))}
                        >›</button>
                      </div>
                      <div style={orderDateCalendarGridStyle}>
                        {CALENDAR_WEEKDAYS.map((weekday) => (
                          <span key={weekday} style={orderDateCalendarWeekdayStyle}>{weekday}</span>
                        ))}
                        {orderedDateCalendarDays.map((day) => (
                          <button
                            key={day.dateValue}
                            type="button"
                            style={getCalendarDayStyle(day, orderFilters, pendingOrderedDateStart)}
                            onClick={() => handleOrderedDatePick(day.dateValue)}
                          >{day.dayOfMonth}</button>
                        ))}
                      </div>
                    </div>,
                    document.body,
                  )
                : null}
            </div>
            <div style={orderFilterSelectFieldStyle}>
              <select
                aria-label="Filter orders by delivery day"
                style={orderFilters.deliveryWeekday ? orderFilterSelectStyle : orderFilterEmptySelectStyle}
                value={orderFilters.deliveryWeekday}
                onChange={(event) => handleOrderFilterChange("deliveryWeekday", event.currentTarget.value)}
              >
                {ORDER_WEEKDAY_OPTIONS.map((weekday) => (
                  <option key={weekday.value} value={weekday.value}>
                    {weekday.label}
                  </option>
                ))}
              </select>
              {!orderFilters.deliveryWeekday ? (
                <span style={orderFilterPlaceholderStyle}>Delivery day</span>
              ) : null}
              {orderFilters.deliveryWeekday ? (
                <button
                  type="button"
                  aria-label="Clear delivery day filter"
                  style={orderFilterClearButtonStyle}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => handleClearOrderFilter("deliveryWeekday")}
                >×</button>
              ) : (
                renderOrderFilterChevron()
              )}
            </div>
            <div style={orderFilterSelectFieldStyle}>
              <select
                aria-label="Filter orders by service type"
                style={orderFilters.serviceType ? orderFilterSelectStyle : orderFilterEmptySelectStyle}
                value={orderFilters.serviceType}
                onChange={(event) => handleOrderFilterChange("serviceType", event.currentTarget.value)}
              >
                <option value="DELIVERY">Delivery</option>
                <option value="PICKUP">Pickup</option>
              </select>
              {!orderFilters.serviceType ? (
                <span style={orderFilterPlaceholderStyle}>Type</span>
              ) : null}
              {orderFilters.serviceType ? (
                <button
                  type="button"
                  aria-label="Clear service type filter"
                  style={orderFilterClearButtonStyle}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => handleClearOrderFilter("serviceType")}
                >×</button>
              ) : (
                renderOrderFilterChevron()
              )}
            </div>
            <div style={orderFilterSelectFieldStyle}>
              <select
                aria-label="Filter orders by delivery area"
                style={orderFilters.deliveryArea ? orderFilterSelectStyle : orderFilterEmptySelectStyle}
                value={orderFilters.deliveryArea}
                onChange={(event) => handleOrderFilterChange("deliveryArea", event.currentTarget.value)}
              >
                {orderFilterOptions.deliveryAreas.map((deliveryArea) => (
                  <option key={deliveryArea} value={deliveryArea}>
                    {deliveryArea}
                  </option>
                ))}
              </select>
              {!orderFilters.deliveryArea ? (
                <span style={orderFilterPlaceholderStyle}>Area</span>
              ) : null}
              {orderFilters.deliveryArea ? (
                <button
                  type="button"
                  aria-label="Clear delivery area filter"
                  style={orderFilterClearButtonStyle}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => handleClearOrderFilter("deliveryArea")}
                >×</button>
              ) : (
                renderOrderFilterChevron()
              )}
            </div>
            <div style={orderFilterSelectFieldStyle}>
              <select
                aria-label="Filter orders by state"
                style={orderFilters.deliveryState ? orderFilterSelectStyle : orderFilterEmptySelectStyle}
                value={orderFilters.deliveryState}
                onChange={(event) => handleOrderFilterChange("deliveryState", event.currentTarget.value)}
              >
                {ORDER_DELIVERY_STATE_OPTIONS.map((stateOption) => (
                  <option key={stateOption.value} value={stateOption.value}>
                    {stateOption.label}
                  </option>
                ))}
              </select>
              {!orderFilters.deliveryState ? (
                <span style={orderFilterPlaceholderStyle}>State</span>
              ) : null}
              {orderFilters.deliveryState ? (
                <button
                  type="button"
                  aria-label="Clear state filter"
                  style={orderFilterClearButtonStyle}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => handleClearOrderFilter("deliveryState")}
                >×</button>
              ) : (
                renderOrderFilterChevron()
              )}
            </div>
            <div style={orderControlsTrailingStyle}>
              <span aria-label="Selected orders" style={orderSelectionCountStyle}>Selected: {checkedOrderIds.length}</span>
              <button
                type="button"
                title="Return to the planning Unplanned view"
                style={activeOrderFilters ? orderFilterButtonStyle : disabledOrderFilterButtonStyle}
                disabled={!activeOrderFilters}
                onClick={handleClearOrderFilters}
              >Clear filters</button>
              <button
                type="button"
                style={
                  checkedOrderIds.length === 0
                    ? disabledCreateRouteButtonStyle
                    : addToPlanButtonStyle
                }
                disabled={checkedOrderIds.length === 0}
                onClick={handleAddToPlan}
              >Add to map</button>
            </div>
          </div>
          <div style={tableWrapStyle}>
            <table
              ref={tableRef}
              aria-label="Shopify orders"
              style={{ ...tableStyle, width: tableWidth }}
            >
              <colgroup>
                {tableColumnWidths.map((width, columnIndex) => (
                  <col
                    key={columnIndex}
                    style={{ width: typeof width === "number" ? `${width}px` : width }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" style={checkboxHeaderCellStyle}>
                    <input
                      type="checkbox"
                      aria-label="Select all visible orders for plan"
                      checked={allVisibleOrdersChecked}
                      disabled={selectableTableOrders.length === 0}
                      onChange={toggleAllVisibleOrderChecks}
                    />
                  </th>
                  {SORTABLE_ORDER_COLUMNS.map((column, columnIndex) => (
                    <th
                      key={column.key}
                      scope="col"
                      style={resizableHeaderCellStyle}
                      aria-sort={getHeaderAriaSort(column.key)}
                    >
                      <button
                        type="button"
                        style={tableHeaderButtonStyle}
                        onClick={() => handleSort(column.key)}
                      >
                        {column.label}
                        <span aria-hidden="true">
                          {getSortIndicator(column.key)}
                        </span>
                      </button>
                      {columnIndex < SORTABLE_ORDER_COLUMNS.length - 1 ? (
                        <span
                          aria-hidden="true"
                          style={columnResizeHandleStyle}
                          onPointerDown={(event) => handleColumnResizeStart(columnIndex + 1, event)}
                          onDoubleClick={(event) => handleColumnAutoFit(columnIndex + 1, event)}
                        >
                          <span style={columnResizeHandleLineStyle} />
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableOrders.map((order) => {
                  const orderIsPlanned = plannedOrderIdSet.has(order.id);
                  const checkboxChecked = orderIsPlanned || checkedOrderIdSet.has(order.id);

                  return (
                    <tr key={order.id}>
                      <td style={checkboxCellStyle}>
                        <input
                          type="checkbox"
                          aria-label={
                            orderIsPlanned
                              ? `${order.name} already added to map`
                              : `Select ${order.name} for plan`
                          }
                          title={orderIsPlanned ? "Already added to map" : ""}
                          checked={checkboxChecked}
                          disabled={orderIsPlanned}
                          onChange={() => toggleOrderCheck(order.id)}
                        />
                      </td>
                      <td style={tableCellStyle}>
                        <button
                          type="button"
                          className="order-number-button"
                          aria-label={`View ${order.name}`}
                          style={orderNumberButtonStyle}
                          onClick={() => handleSelectOrder(order.id)}
                        >
                          {order.name}
                        </button>
                      </td>
                      <td style={deliveryInfoCellStyle}>
                        <span style={deliveryInfoTabStyle}>
                          {formatDeliveryValue(order.orderedDate)}
                        </span>
                      </td>
                      <td style={tableCellStyle}>{order.customer}</td>
                      <td style={tableCellStyle}>{order.address}</td>
                      <td style={itemCellStyle}>
                        {getOrderItemCount(order)}
                        <span data-order-items-popover-root="true">
                          <button
                            type="button"
                            aria-label={`Show items for ${order.name}`}
                            style={itemInfoButtonStyle}
                            onMouseEnter={() => setHoveredItemPopoverOrderId(order.id)}
                            onMouseLeave={() => setHoveredItemPopoverOrderId((currentOrderId) => currentOrderId === order.id ? null : currentOrderId)}
                            onClick={() => setPinnedItemPopoverOrderId((currentOrderId) => currentOrderId === order.id ? null : order.id)}
                          >
                            <s-icon type="info" size="base" color="subdued"></s-icon>
                          </button>
                          {visibleItemPopoverOrderId === order.id ? (
                            <div style={itemPopoverStyle}>
                            <div style={itemPopoverTitleStyle}>Ordered items</div>
                            <table style={itemPopoverTableStyle}>
                              <thead>
                                <tr>
                                  <th style={itemPopoverCellStyle}>Item</th>
                                  <th style={itemPopoverCellStyle}>Options</th>
                                  <th style={itemPopoverCellStyle}>SKU</th>
                                  <th style={itemPopoverQtyCellStyle}>Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {getOrderLineItems(order).map((item, itemIndex) => (
                                  <tr key={`${item.name}-${itemIndex}`}>
                                    <td style={itemPopoverCellStyle}>{item.name}</td>
                                    <td style={itemPopoverCellStyle}>{item.options}</td>
                                    <td style={itemPopoverCellStyle}>{item.sku}</td>
                                    <td style={itemPopoverQtyCellStyle}>{item.quantity}</td>
                                  </tr>
                                ))}
                                <tr>
                                  <td style={itemPopoverCellStyle} colSpan={3}>Order total</td>
                                  <td style={itemPopoverQtyCellStyle}>{formatOrderTotal(order)}</td>
                                </tr>
                              </tbody>
                            </table>
                            </div>
                          ) : null}
                        </span>
                      </td>
                      <td style={deliveryInfoCellStyle}>
                        <span style={deliveryInfoTabStyle}>
                          {formatDeliveryValue(order.deliveryArea)}
                        </span>
                      </td>
                      <td style={deliveryInfoCellStyle}>
                        <span style={deliveryInfoTabStyle}>
                          {formatOrderDeliveryLabel(order)}
                        </span>
                      </td>
                      <td style={deliveryInfoCellStyle}>
                        <span style={getOrderDeliveryStateTabStyle(order, orderFilterReferenceDate)}>
                          {formatOrderDeliveryState(order, orderFilterReferenceDate)}
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        {order.hasCoordinates ? "Yes" : "No"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      }
    />
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
