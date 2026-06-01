import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useFetcher, useLoaderData, useNavigate, useRouteError, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { fetchDeliveryOrders, syncDeliveryOrders } from "../features/delivery/orders.server";
import {
  buildCreateRoutePlanPayload,
  createDeliveryRoutePlan,
  DELIVERY_API_ERROR_CODE,
  DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE,
} from "../features/delivery/route-plans.server";
import { buildRouteScopeFromOrders } from "../features/delivery/route-scope";
import { installMissingMapImageFallback } from "../features/maps/maplibre-missing-images";
import { installPmtilesProtocol } from "../features/maps/pmtiles-protocol";
import { fetchShopifyDepartureLocation } from "../features/locations/shopify-locations.server";
import {
  getOrderSyncSnapshots,
  isOrderReadyToPlan,
  mapCanonicalOrdersToOrderRows,
  mergeShopifyOrderRowsWithCanonicalRows,
} from "../features/orders/canonical-orders";
import {
  filterOrders,
  formatServiceTypeLabel,
  formatUnavailableReason,
  getBulkOrderSelectionState,
  getOrderFilterOptions,
  getOrderFiltersFromSearchParams,
  getOrderDeliveryDateValue,
  getOrderDeliveryExceptionState,
  getOrderUnavailableReasons,
  hasActiveOrderFilters,
  isOrderDeliveryComplete,
  isOrderInPlanningScope,
  isOrderRouteCreated,
  isOrderRouteAssigned,
  isOrderRoutePlanningLocked,
  isOrderSelectableForCurrentWorkset,
  ORDER_HISTORY_SCOPE,
  ORDER_PLANNING_SCOPE,
  ORDER_SERVICE_TYPE_OPTIONS,
  ORDER_STATUS_TABS,
  updateOrderFilterSearchParams,
} from "../features/orders/order-filters";
import { fetchShopifyOrders } from "../features/orders/shopify-orders.server";
import { authenticate } from "../shopify.server";
import { TabLayout } from "../ui/tab-layout";

export const links = () => [{ rel: "stylesheet", href: "/vendor/maplibre-gl.css" }];

const OPENFREEMAP_STYLE_URL = "/vendor/openfreemap-clever-lite.json";
const DEFAULT_CENTER = [-79.4163, 43.787];
const INITIAL_HOME_ZOOM = 10;
const MAP_RECOVERY_DELAY_MS = 2500;
const MAX_MAP_RECOVERY_ATTEMPTS = 3;
const MARKER_CLICK_ZOOM_OUT_THRESHOLD = 8;
const MARKER_CLICK_TARGET_ZOOM = 10;
const ORDERS_MAP_SOURCE_ID = "orders-map-orders";
const ORDERS_MAP_ORDER_LAYER_ID = "orders-map-order-pins";
const ORDER_PIN_IMAGE_ID = "orders-map-pin";
const ORDER_PIN_PLANNED_IMAGE_ID = "orders-map-pin-planned";
const ORDER_PIN_PIXEL_RATIO = 2;
const ORDER_PIN_ICON_SIZE = 0.62;
const ORDER_PIN_LABEL_OFFSET = [0, -1.92];
const ORDER_PIN_PATH =
  "M20 50C20 50 4 31.5 4 18C4 9.16 11.16 2 20 2s16 7.16 16 16c0 13.5-16 32-16 32Z";
const PERF_ENDPOINT = "/perf";
const PERF_CAPTURE_ENABLED = import.meta.env.DEV;
const ROUTE_PLAN_DELIVERY_DATE_REQUIRED_ERROR =
  "배송일이 있는 주문만 route plan에 추가할 수 있습니다.";
const ROUTE_PLAN_DELIVERY_DATE_MISMATCH_ERROR =
  "같은 배송일 주문만 route plan에 추가할 수 있습니다.";
const ROUTE_PLAN_DELIVERY_DATE_PARTIAL_ADD_ERROR =
  "같은 배송일 주문만 route plan에 추가했습니다.";
const ROUTE_PLAN_DELIVERY_DATE_FILTER_LOCKED_ERROR =
  "선택된 주문과 같은 배송일만 표시합니다. 선택 또는 plan을 비우면 날짜 필터를 해제할 수 있습니다.";
const SHOP_TIME_ZONE_QUERY = `#graphql
  query CleverShopTimeZone {
    shop {
      ianaTimezone
      timezoneAbbreviation
    }
  }
`;

const mapFrameStyle = {
  position: "relative",
};

const mapCanvasStyle = {
  height: "100%",
  minHeight: "420px",
  width: "100%",
};

const mapToolbarStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  left: "12px",
  position: "absolute",
  top: "12px",
  zIndex: 2,
};

const mapToolbarButtonStyle = {
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

const mapToolbarIconStyle = {
  display: "block",
  height: "16px",
  width: "16px",
};

const mapStatusStyle = {
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

const routePlanPanelStyle = {
  boxSizing: "border-box",
  display: "grid",
  gap: "10px",
  gridTemplateRows: "auto minmax(0, 1fr)",
  height: "420px",
  maxHeight: "420px",
  overflow: "hidden",
  padding: "12px",
};

const routePlanScrollAreaStyle = {
  alignContent: "start",
  display: "grid",
  gap: "10px",
  gridAutoRows: "max-content",
  minHeight: 0,
  overflowY: "auto",
  paddingRight: "2px",
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

const routePlanListStyle = {
  alignContent: "start",
  alignSelf: "start",
  display: "grid",
  gap: "8px",
};

const routePlanItemStyle = {
  alignSelf: "start",
  border: "1px solid #e3e3e3",
  borderRadius: "10px",
  display: "grid",
  gap: "8px",
  padding: "10px",
};

const routePlanDraggingItemStyle = {
  ...routePlanItemStyle,
  opacity: 0.55,
};

const routePlanItemHeaderStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  justifyContent: "space-between",
};

const routePlanDragHandleStyle = {
  alignItems: "center",
  alignSelf: "stretch",
  background: "transparent",
  border: 0,
  color: "#8a8a8a",
  cursor: "grab",
  display: "inline-flex",
  flex: "0 0 auto",
  fontSize: "16px",
  fontWeight: 700,
  justifyContent: "center",
  lineHeight: 1,
  minHeight: "28px",
  padding: "0 1px 0 0",
};

const routePlanOrderButtonStyle = {
  background: "transparent",
  border: 0,
  color: "#303030",
  cursor: "pointer",
  flex: "1 1 auto",
  fontSize: "12px",
  lineHeight: 1.35,
  minWidth: 0,
  padding: 0,
  textAlign: "left",
};

const routePlanEmptyStyle = {
  background: "#f7f7f7",
  border: "1px solid #e3e3e3",
  borderRadius: "10px",
  color: "#616161",
  fontSize: "13px",
  padding: "10px",
};

const routeReadinessStyle = {
  background: "#ffffff",
  border: "1px solid #e3e3e3",
  borderRadius: "10px",
  display: "grid",
  gap: "8px",
  overflowX: "auto",
  overflowY: "hidden",
  padding: "10px",
};

const routeReadinessHeaderStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "nowrap",
  gap: "8px",
  justifyContent: "space-between",
  whiteSpace: "nowrap",
};

const routeReadinessGridStyle = {
  display: "grid",
  gap: "6px",
  gridTemplateColumns: "repeat(2, minmax(140px, 1fr))",
};

const routeReadinessItemStyle = {
  color: "#303030",
  fontSize: "13px",
  lineHeight: 1.35,
  whiteSpace: "nowrap",
};

const planSummaryTextStyle = {
  color: "#4a4a4a",
  fontSize: "13px",
  whiteSpace: "nowrap",
};

const orderControlsTrailingStyle = {
  alignItems: "center",
  display: "flex",
  flex: "1 1 260px",
  flexWrap: "wrap",
  gap: "6px",
  marginLeft: "auto",
  minWidth: 0,
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

const activeOrderFilterButtonStyle = {
  ...orderFilterButtonStyle,
  background: "#303030",
  borderColor: "#303030",
  color: "#ffffff",
};

const disabledOrderFilterButtonStyle = {
  ...disabledPlanButtonStyle,
};

const routePlanDetailStyle = {
  background: "#f7f7f7",
  borderRadius: "8px",
  padding: "10px",
};

const compactAlertStyle = {
  background: "#fff4f4",
  borderBottom: "1px solid #fed3d1",
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
  background: "#ffffff",
  borderBottom: "1px solid #ebebeb",
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  maxWidth: "100%",
  overflowX: "visible",
  overflowY: "visible",
  padding: "6px 10px",
  whiteSpace: "normal",
};

const tableWrapStyle = {
  maxHeight: "min(320px, 36vh)",
  overflowX: "auto",
  overflowY: "auto",
};

const orderFilterSelectStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#303030",
  flex: "1 1 150px",
  fontSize: "13px",
  minHeight: "30px",
  minWidth: "120px",
  padding: "3px 8px",
};

const orderFilterSearchStyle = {
  ...orderFilterSelectStyle,
  flex: "2 1 220px",
  minWidth: "180px",
  maxWidth: "100%",
};

const orderStatusTabsStyle = {
  alignItems: "center",
  display: "flex",
  flex: "1 1 100%",
  flexWrap: "wrap",
  gap: "6px",
  minWidth: 0,
};

const orderFilterSummaryStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
  whiteSpace: "nowrap",
};

const unavailableSummaryStyle = {
  color: "#8a4b00",
  fontSize: "12px",
  fontWeight: 600,
  whiteSpace: "normal",
};

const tableColumnWidths = ["4%", "8%", "9%", "13%", "27%", "11%", "12%", "8%", "8%"];

const tableStyle = {
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: "13px",
  minWidth: "1040px",
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
  color: "#303030",
  display: "inline-flex",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.2,
  maxWidth: "100%",
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

const PROTECTED_ORDER_ACCESS_ERROR_CODE = "PROTECTED_ORDER_ACCESS";

const SORTABLE_ORDER_COLUMNS = [
  { key: "name", label: "Order" },
  { key: "orderedDate", label: "Ordered" },
  { key: "customer", label: "Recipient" },
  { key: "address", label: "Address" },
  { key: "deliveryArea", label: "Area" },
  { key: "deliveryLabel", label: "Delivery" },
  { key: "planningStatus", label: "Delivery state" },
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

function formatOrderNames(orders) {
  const orderNames = Array.isArray(orders)
    ? orders.map((order) => order?.name).filter(Boolean)
    : [];

  return orderNames.length > 0 ? orderNames.join(", ") : "selected orders";
}

function getFirstErrorMessage(errors) {
  const firstError = Array.isArray(errors)
    ? errors.find((error) => error?.message)
    : null;

  return firstError?.message ?? null;
}

function getFirstOrderDeliveryDateByIds(orderIds, orderById) {
  if (!Array.isArray(orderIds) || !(orderById instanceof Map)) return "";

  for (const orderId of orderIds) {
    const deliveryDate = getOrderDeliveryDateValue(orderById.get(orderId));
    if (deliveryDate) return deliveryDate;
  }

  return "";
}

function getOrdersForDeliveryDate(orders, deliveryDate) {
  const normalizedDeliveryDate = getOrderDeliveryDateValue({ deliveryDate });
  if (!normalizedDeliveryDate) return [];

  return (Array.isArray(orders) ? orders : []).filter(
    (order) => getOrderDeliveryDateValue(order) === normalizedDeliveryDate,
  );
}

function getVisibleDeliveryOrderLoaderErrors(errors) {
  return (Array.isArray(errors) ? errors : []).filter(
    (error) => error?.code !== DELIVERY_SESSION_TOKEN_MISSING_ERROR_CODE,
  );
}

function formatDeliveryValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : "—";
}

function formatOrderDeliveryState(order, referenceDate) {
  const exceptionState = getOrderDeliveryExceptionState(order, referenceDate);

  if (exceptionState === "overdue_assigned") return "Assigned · overdue";
  if (exceptionState === "overdue_unassigned") return "Past due";
  if (isOrderDeliveryComplete(order)) return "Delivered";
  if (isOrderRouteAssigned(order)) return "Assigned · undelivered";
  if (isOrderRouteCreated(order)) return "Planned";

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

function formatFilterDateLabel(value) {
  if (typeof value !== "string" || value.trim().length === 0) return "—";

  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(date);

  return `${weekday} ${value.slice(5, 7)}/${value.slice(8, 10)}`;
}

function formatUnavailableSummary(unavailableReasonCounts) {
  const entries = Object.entries(unavailableReasonCounts ?? {}).filter(
    ([, count]) => count > 0,
  );

  if (entries.length === 0) return "";

  return entries
    .map(([reason, count]) => `${formatUnavailableReason(reason)} ${count}`)
    .join(" · ");
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

function createDepartureMarkerElement(departureLocation) {
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

function createOrderMarkerPopupElement(order, plannedIndex, onAddToPlan, availabilityContext) {
  const popupElement = document.createElement("div");
  const popupTitleElement = document.createElement("strong");
  const popupAddressElement = document.createElement("div");
  const popupMetaElement = document.createElement("div");
  const popupActionButton = document.createElement("button");
  const deliveryMetaValues = [order.deliveryArea, formatOrderDeliveryLabel(order)].filter(Boolean);
  const referenceDate = availabilityContext?.referenceDate ?? new Date();
  const unavailableReasons = getOrderUnavailableReasons(order, availabilityContext);
  const routePlanningLocked = isOrderRoutePlanningLocked(order, referenceDate);
  const routePlanningUnavailable = unavailableReasons.length > 0;

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
  popupActionButton.textContent =
    plannedIndex > 0
      ? "Added to plan"
      : routePlanningLocked
        ? formatOrderDeliveryState(order, referenceDate)
        : routePlanningUnavailable
          ? formatUnavailableReason(unavailableReasons[0])
          : "Add to plan";
  if (routePlanningUnavailable) {
    popupActionButton.title = unavailableReasons.map(formatUnavailableReason).join(", ");
  }
  popupActionButton.disabled = plannedIndex > 0 || routePlanningUnavailable;
  popupActionButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (routePlanningUnavailable) return;
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

function createOrderPinImageData(color, options = {}) {
  const pixelRatio = options.pixelRatio ?? ORDER_PIN_PIXEL_RATIO;
  const width = (options.width ?? 40) * pixelRatio;
  const height = (options.height ?? 52) * pixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.scale(pixelRatio, pixelRatio);
  const pinPath = new Path2D(ORDER_PIN_PATH);
  context.fillStyle = color;
  context.strokeStyle = "#ffffff";
  context.lineJoin = "round";
  context.lineWidth = options.borderWidth ?? 3.2;
  context.shadowBlur = options.shadowBlur ?? 4;
  context.shadowColor = options.shadowColor ?? "rgba(0, 0, 0, 0.32)";
  context.shadowOffsetY = options.shadowOffsetY ?? 2;
  context.fill(pinPath);
  context.shadowColor = "transparent";
  context.stroke(pinPath);

  return context.getImageData(0, 0, width, height);
}

function ensureOrdersMapPinImages(map) {
  if (typeof map?.hasImage !== "function" || typeof map?.addImage !== "function") {
    return false;
  }

  const images = [
    {
      id: ORDER_PIN_IMAGE_ID,
      imageData: createOrderPinImageData("#006fbb", {
        shadowColor: "rgba(0, 111, 187, 0.36)",
      }),
    },
    {
      id: ORDER_PIN_PLANNED_IMAGE_ID,
      imageData: createOrderPinImageData("#e11900", {
        shadowColor: "rgba(225, 25, 0, 0.4)",
      }),
    },
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
      .filter((order) => order.hasCoordinates)
      .map((order) => {
        const plannedIndex = plannedIndexByOrderId.get(order.id) ?? 0;
        const isPlanned = plannedIndex > 0;

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
            pinImage: isPlanned ? ORDER_PIN_PLANNED_IMAGE_ID : ORDER_PIN_IMAGE_ID,
            plannedIndex,
            plannedLabel: isPlanned ? String(plannedIndex) : "",
            sortKey: isPlanned ? 1000 + plannedIndex : 1,
          },
        };
      }),
  };
}

function reorderOrderIds(orderIds, sourceOrderId, targetOrderId) {
  if (!sourceOrderId || !targetOrderId || sourceOrderId === targetOrderId) {
    return orderIds;
  }

  const sourceIndex = orderIds.indexOf(sourceOrderId);
  const targetIndex = orderIds.indexOf(targetOrderId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return orderIds;
  }

  const nextOrderIds = [...orderIds];
  const [movedOrderId] = nextOrderIds.splice(sourceIndex, 1);
  nextOrderIds.splice(targetIndex, 0, movedOrderId);
  return nextOrderIds;
}

function syncOrdersMapMarkerLayer(map, orders, plannedOrderIds) {
  if (!isOrdersMapStyleReady(map)) return false;
  if (!ensureOrdersMapPinImages(map)) return false;

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
      type: "symbol",
      source: ORDERS_MAP_SOURCE_ID,
      layout: {
        "icon-allow-overlap": true,
        "icon-anchor": "bottom",
        "icon-ignore-placement": true,
        "icon-image": ["get", "pinImage"],
        "icon-size": ORDER_PIN_ICON_SIZE,
        "symbol-sort-key": ["get", "sortKey"],
        "text-allow-overlap": true,
        "text-field": ["get", "plannedLabel"],
        "text-ignore-placement": true,
        "text-offset": ORDER_PIN_LABEL_OFFSET,
        "text-size": 11,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0, 0, 0, 0.22)",
        "text-halo-width": 0.5,
      },
    });
  }

  return true;
}

function getOrderIdFromMapFeature(feature) {
  const orderId = feature?.properties?.orderId;
  return typeof orderId === "string" && orderId.length > 0 ? orderId : null;
}

function renderToolbarIcon(children) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={mapToolbarIconStyle}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {children}
    </svg>
  );
}

function renderRefreshIcon() {
  return renderToolbarIcon(
    <>
      <path d="M16 7a6 6 0 1 0 1 5" />
      <path d="M16 3v4h-4" />
    </>,
  );
}

function renderExpandWidthIcon() {
  return renderToolbarIcon(
    <>
      <path d="m7 6-4 4 4 4" />
      <path d="m13 6 4 4-4 4" />
    </>,
  );
}

function renderRestoreWidthIcon() {
  return renderToolbarIcon(
    <>
      <path d="m3 6 4 4-4 4" />
      <path d="m17 6-4 4 4 4" />
    </>,
  );
}

function renderWidthIcon(isMapWide) {
  return isMapWide ? renderRestoreWidthIcon() : renderExpandWidthIcon();
}

export const action = async ({ request }) => {
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

  const plannedOrderIds = JSON.parse(formData.get("plannedOrderIds") ?? "[]");
  const routeScope = JSON.parse(formData.get("routeScope") ?? "null");
  const submittedOrderScope = String(
    formData.get("orderScope") ?? ORDER_PLANNING_SCOPE,
  );

  if (submittedOrderScope === ORDER_HISTORY_SCOPE) {
    return {
      errors: [
        {
          message:
            "History / All Orders scope는 조회 전용입니다. route를 만들려면 Planning Scope로 전환해주세요.",
        },
      ],
    };
  }

  if (!Array.isArray(plannedOrderIds) || plannedOrderIds.length === 0) {
    return { errors: [{ message: "Route plan에 추가된 주문이 없습니다." }] };
  }

  const [orderData, departureLocationData, shopTimeZoneData] = await Promise.all([
    fetchShopifyOrders(admin),
    fetchShopifyDepartureLocation(admin, { cacheKey: shopifyShopCacheKey }),
    fetchShopifyShopTimeZone(admin),
  ]);
  const shopLocalDate = getShopLocalDate(shopTimeZoneData);
  const plannedOrderIdSet = new Set(plannedOrderIds);
  const plannedShopifyOrders = orderData.orders.filter((order) =>
    plannedOrderIdSet.has(order.id),
  );
  const plannedShopifyOrderSnapshots = getOrderSyncSnapshots(plannedShopifyOrders);
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

  if ((syncedOrderData.errors ?? []).length > 0) {
    return {
      errors: [
        ...(orderData.errors ?? []),
        ...(syncedOrderData.errors ?? []),
        ...(departureLocationData.errors ?? []),
      ],
    };
  }

  const canonicalOrderData = await fetchDeliveryOrders(
    request,
    {},
    { cacheKey: shopifyShopCacheKey, sessionToken: shopifySessionToken },
  );

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

  const alreadyPlannedOrders = plannedOrders.filter(isOrderRouteCreated);

  if (alreadyPlannedOrders.length > 0) {
    return {
      errors: [
        {
          message:
            `이미 계획 이후 단계인 주문이 포함되어 route를 만들지 않았습니다: ${formatOrderNames(alreadyPlannedOrders)}. Orders의 기본 Unplanned view에서 아직 계획되지 않은 주문만 선택해주세요.`,
        },
      ],
    };
  }

  const expiredDeliveryDateOrders = plannedOrders.filter((order) =>
    !isOrderRouteCreated(order) &&
    isOrderRoutePlanningLocked(order, shopLocalDate),
  );

  if (expiredDeliveryDateOrders.length > 0) {
    return {
      errors: [
        {
          message:
            `Delivery 날짜가 지난 주문은 새 route plan에 추가하지 않았습니다: ${formatOrderNames(expiredDeliveryDateOrders)}. All view에서는 상태 확인만 하고, route 생성은 오늘 이후 주문으로 진행해주세요.`,
        },
      ],
    };
  }

  const nonPlanningScopeOrders = plannedOrders.filter(
    (order) => !isOrderInPlanningScope(order, shopLocalDate),
  );

  if (nonPlanningScopeOrders.length > 0) {
    return {
      errors: [
        {
          message:
            `Planning scope에 없는 주문은 route를 만들 수 없습니다: ${formatOrderNames(nonPlanningScopeOrders)}. History / All Orders에서는 조회만 하고, 현재/미래 미완료 주문으로 진행해주세요.`,
        },
      ],
    };
  }

  const unreadyPlannedOrders = plannedOrders.filter((order) => !isOrderReadyToPlan(order));

  if (unreadyPlannedOrders.length > 0) {
    return {
      errors: [
        {
          message:
            `Route plan에는 ready 상태의 주문만 보낼 수 있습니다: ${formatOrderNames(unreadyPlannedOrders)}.`,
        },
      ],
    };
  }

  const routePlanPayload = buildCreateRoutePlanPayload({
    departureLocation: departureLocationData.departureLocation,
    plannedOrders,
    routeScope,
  });
  const { routePlan, errors: routePlanErrors } = await createDeliveryRoutePlan(
    request,
    routePlanPayload,
    {
      sessionToken: shopifySessionToken,
    },
  );

  if (routePlan?.id) {
    return { routePlan, errors: [] };
  }

  return {
    errors: [
      ...(orderData.errors ?? []),
      ...(syncedOrderData.errors ?? []),
      ...(departureLocationData.errors ?? []),
      ...(routePlanErrors ?? []),
    ],
  };
};

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
    errors: [
      ...(orderData.errors ?? []),
      ...(departureLocationData.errors ?? []),
      ...getVisibleDeliveryOrderLoaderErrors(serverOrderData.errors),
    ],
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
  const orderFilters = useMemo(
    () => getOrderFiltersFromSearchParams(searchParams),
    [searchParams],
  );
  const orderFilterReferenceDate = useMemo(
    () => shopLocalDate ?? new Date(),
    [shopLocalDate],
  );
  const orderFilterOptionOrders = useMemo(
    () => filterOrders(displayOrders, {
      scope: orderFilters.scope,
      tab: orderFilters.tab,
      referenceDate: orderFilterReferenceDate,
    }),
    [displayOrders, orderFilters.scope, orderFilters.tab, orderFilterReferenceDate],
  );
  const orderFilterOptions = useMemo(
    () => getOrderFilterOptions(orderFilterOptionOrders),
    [orderFilterOptionOrders],
  );
  const serviceTypeFilterOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...ORDER_SERVICE_TYPE_OPTIONS.map((option) => option.value),
          ...(orderFilterOptions.serviceTypes ?? []),
        ]),
      ),
    [orderFilterOptions.serviceTypes],
  );
  const filteredOrders = useMemo(
    () => filterOrders(displayOrders, {
      ...orderFilters,
      referenceDate: orderFilterReferenceDate,
    }),
    [displayOrders, orderFilters, orderFilterReferenceDate],
  );
  const activeOrderFilters = useMemo(
    () => hasActiveOrderFilters(orderFilters),
    [orderFilters],
  );
  const locatedOrders = useMemo(
    () => filteredOrders.filter((order) => order.hasCoordinates),
    [filteredOrders],
  );
  const protectedOrderAccessError = errors?.some(
    (error) => error?.code === PROTECTED_ORDER_ACCESS_ERROR_CODE,
  );
  const [createRouteClientError, setCreateRouteClientError] = useState(null);
  const actionErrors = createRouteClientError
    ? [{ message: createRouteClientError }]
    : [
        ...(routePlanFetcher.data?.errors ?? []),
      ];
  const visibleOrderErrorMessage = getFirstErrorMessage([
    ...actionErrors,
    ...(errors ?? []),
  ]);
  const isCreatingRoute = routePlanFetcher.state !== "idle";
  const [selectedOrderId, setSelectedOrderId] = useState(
    filteredOrders[0]?.id ?? null,
  );
  const [checkedOrderIds, setCheckedOrderIds] = useState([]);
  const [plannedOrderIds, setPlannedOrderIds] = useState([]);
  const [autoAppliedDeliveryDateFilter, setAutoAppliedDeliveryDateFilter] =
    useState(null);
  const [activeDraggedPlanOrderId, setActiveDraggedPlanOrderId] = useState(null);
  const [sortConfig, setSortConfig] = useState(null);
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
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapRenderKey, setMapRenderKey] = useState(0);
  const [mapStatus, setMapStatus] = useState("idle");
  const [isMapWide, setIsMapWide] = useState(false);
  const [planFitRequest, setPlanFitRequest] = useState(0);
  const [selectedOrderFocusRequest, setSelectedOrderFocusRequest] = useState(0);

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

  const tableOrders = useMemo(
    () => sortedOrders.filter((order) => !plannedOrderIdSet.has(order.id)),
    [plannedOrderIdSet, sortedOrders],
  );

  const plannedOrders = useMemo(() => {
    return plannedOrderIds
      .map((orderId) => displayOrderById.get(orderId))
      .filter(Boolean);
  }, [displayOrderById, plannedOrderIds]);

  const checkedDeliveryDateLock = useMemo(
    () => getFirstOrderDeliveryDateByIds(checkedOrderIds, displayOrderById),
    [checkedOrderIds, displayOrderById],
  );
  const plannedDeliveryDateLock = useMemo(
    () => getOrderDeliveryDateValue(plannedOrders[0]),
    [plannedOrders],
  );
  const routePlanDeliveryDateLock =
    plannedDeliveryDateLock || checkedDeliveryDateLock;
  const filteredDeliveryDateLock = useMemo(
    () => getOrderDeliveryDateValue({ deliveryDate: orderFilters.deliveryDate }),
    [orderFilters.deliveryDate],
  );

  const readyPlannedOrders = useMemo(() => plannedOrders.filter(isOrderReadyToPlan), [plannedOrders]);
  const plannedRouteScope = useMemo(() => buildRouteScopeFromOrders(plannedOrders), [plannedOrders]);
  const worksetAvailabilityContext = useMemo(
    () => ({
      deliveryDateLock: routePlanDeliveryDateLock || filteredDeliveryDateLock,
      referenceDate: orderFilterReferenceDate,
      routeScopeKey: plannedRouteScope?.routeScopeKey ?? "",
      scope: orderFilters.scope,
    }),
    [
      filteredDeliveryDateLock,
      orderFilterReferenceDate,
      orderFilters.scope,
      plannedRouteScope?.routeScopeKey,
      routePlanDeliveryDateLock,
    ],
  );
  const selectableTableOrders = useMemo(
    () => tableOrders.filter((order) =>
      isOrderSelectableForCurrentWorkset(order, worksetAvailabilityContext),
    ),
    [tableOrders, worksetAvailabilityContext],
  );
  const tableSelectionState = useMemo(
    () => getBulkOrderSelectionState(tableOrders, worksetAvailabilityContext),
    [tableOrders, worksetAvailabilityContext],
  );
  const unavailableSummary = useMemo(
    () => formatUnavailableSummary(tableSelectionState.unavailableReasonCounts),
    [tableSelectionState.unavailableReasonCounts],
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
      locatedCount: plannedLocatedOrders.length,
      scopeLabel: formatOrderDeliveryLabel(plannedOrders[0]),
      deliveryAreas,
    };
  }, [plannedLocatedOrders.length, plannedOrders]);

  const allVisibleOrdersChecked =
    selectableTableOrders.length > 0 &&
    selectableTableOrders.every((order) => checkedOrderIdSet.has(order.id));
  const historyScopeActive = orderFilters.scope === ORDER_HISTORY_SCOPE;
  const createRouteDisabled =
    historyScopeActive ||
    readyPlannedOrders.length === 0 ||
    routePlanFetcher.state !== "idle";

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
    const routeCandidateOrderIds = new Set(
      filteredOrders
        .filter((order) => isOrderSelectableForCurrentWorkset(order, worksetAvailabilityContext))
        .map((order) => order.id),
    );

    setCheckedOrderIds((currentOrderIds) => {
      const nextOrderIds = currentOrderIds.filter((orderId) =>
        routeCandidateOrderIds.has(orderId),
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
  }, [displayOrders, filteredOrders, worksetAvailabilityContext]);

  useEffect(() => {
    if (!routePlanDeliveryDateLock) {
      return;
    }

    if (filteredDeliveryDateLock === routePlanDeliveryDateLock) {
      return;
    }

    setAutoAppliedDeliveryDateFilter(routePlanDeliveryDateLock);

    setSearchParams(
      updateOrderFilterSearchParams(searchParams, {
        ...orderFilters,
        deliveryDate: routePlanDeliveryDateLock,
      }),
      {
        preventScrollReset: true,
        replace: true,
      },
    );
  }, [
    orderFilters,
    filteredDeliveryDateLock,
    routePlanDeliveryDateLock,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    if (
      routePlanDeliveryDateLock ||
      !autoAppliedDeliveryDateFilter ||
      filteredDeliveryDateLock !== autoAppliedDeliveryDateFilter
    ) {
      return;
    }

    setAutoAppliedDeliveryDateFilter(null);
    setSearchParams(
      updateOrderFilterSearchParams(searchParams, {
        ...orderFilters,
        deliveryDate: "",
      }),
      {
        preventScrollReset: true,
        replace: true,
      },
    );
  }, [
    autoAppliedDeliveryDateFilter,
    filteredDeliveryDateLock,
    orderFilters,
    routePlanDeliveryDateLock,
    searchParams,
    setSearchParams,
  ]);

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

      return {
        key: columnKey,
        direction:
          currentSortConfig.direction === "ascending"
            ? "descending"
            : "ascending",
      };
    });
  };

  const getHeaderAriaSort = (columnKey) =>
    sortConfig?.key === columnKey ? sortConfig.direction : "none";

  const getSortIndicator = (columnKey) => {
    if (sortConfig?.key !== columnKey) return "";
    return sortConfig.direction === "ascending" ? " ▲" : " ▼";
  };

  const applyDeliveryDateFilterLock = useCallback((deliveryDate) => {
    const normalizedDeliveryDate = getOrderDeliveryDateValue({ deliveryDate });

    if (!normalizedDeliveryDate) {
      return;
    }

    if (filteredDeliveryDateLock === normalizedDeliveryDate) {
      return;
    }

    setAutoAppliedDeliveryDateFilter(normalizedDeliveryDate);

    setSearchParams(
      updateOrderFilterSearchParams(searchParams, {
        ...orderFilters,
        deliveryDate: normalizedDeliveryDate,
      }),
      {
        preventScrollReset: true,
        replace: true,
      },
    );
  }, [filteredDeliveryDateLock, orderFilters, searchParams, setSearchParams]);

  const applyOrderDeliveryDateSelectionLock = useCallback((order) => {
    const orderDeliveryDate = getOrderDeliveryDateValue(order);

    if (!orderDeliveryDate) {
      setCreateRouteClientError(ROUTE_PLAN_DELIVERY_DATE_REQUIRED_ERROR);
      return null;
    }

    const currentDeliveryDateLock =
      routePlanDeliveryDateLock || filteredDeliveryDateLock;

    if (
      currentDeliveryDateLock &&
      orderDeliveryDate !== currentDeliveryDateLock
    ) {
      applyDeliveryDateFilterLock(currentDeliveryDateLock);
      setCreateRouteClientError(ROUTE_PLAN_DELIVERY_DATE_MISMATCH_ERROR);
      return null;
    }

    applyDeliveryDateFilterLock(orderDeliveryDate);
    return orderDeliveryDate;
  }, [
    applyDeliveryDateFilterLock,
    filteredDeliveryDateLock,
    routePlanDeliveryDateLock,
  ]);

  const handleOrderFilterChange = (filterKey, filterValue) => {
    const nextFilterValue =
      filterKey === "deliveryDate" &&
      routePlanDeliveryDateLock &&
      filterValue !== routePlanDeliveryDateLock
        ? routePlanDeliveryDateLock
        : filterValue;

    if (filterKey === "deliveryDate" && filterValue !== nextFilterValue) {
      setCreateRouteClientError(ROUTE_PLAN_DELIVERY_DATE_FILTER_LOCKED_ERROR);
    }

    if (filterKey === "deliveryDate") {
      setAutoAppliedDeliveryDateFilter(
        routePlanDeliveryDateLock && nextFilterValue === routePlanDeliveryDateLock
          ? routePlanDeliveryDateLock
          : null,
      );
    }

    const nextFilters = {
      ...orderFilters,
      [filterKey]: nextFilterValue,
    };

    setSearchParams(
      updateOrderFilterSearchParams(searchParams, nextFilters),
      {
        preventScrollReset: true,
        replace: true,
      },
    );
  };

  const handleClearOrderFilters = () => {
    if (routePlanDeliveryDateLock) {
      setCreateRouteClientError(ROUTE_PLAN_DELIVERY_DATE_FILTER_LOCKED_ERROR);
    }

    setAutoAppliedDeliveryDateFilter(routePlanDeliveryDateLock || null);

    setSearchParams(
      updateOrderFilterSearchParams(searchParams, {
        deliveryArea: "",
        deliveryDate: routePlanDeliveryDateLock,
        orderedDate: "",
        scope: ORDER_PLANNING_SCOPE,
        search: "",
        serviceType: "",
        tab: "unplanned",
      }),
      {
        preventScrollReset: true,
        replace: true,
      },
    );
  };

  const handleClearSelection = () => {
    setCheckedOrderIds([]);
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
    const order = displayOrderById.get(orderId);
    const isAlreadyChecked = checkedOrderIdSet.has(orderId);

    if (
      !isAlreadyChecked &&
      !isOrderSelectableForCurrentWorkset(order, worksetAvailabilityContext)
    ) {
      const reasons = getOrderUnavailableReasons(order, worksetAvailabilityContext);
      setCreateRouteClientError(
        reasons.length > 0
          ? `This order is unavailable: ${reasons.map(formatUnavailableReason).join(", ")}.`
          : "This order is unavailable.",
      );
      return;
    }

    if (!isAlreadyChecked && !applyOrderDeliveryDateSelectionLock(order)) {
      return;
    }

    setCheckedOrderIds((currentOrderIds) =>
      isAlreadyChecked
        ? currentOrderIds.filter((selectedOrderId) => selectedOrderId !== orderId)
        : [...currentOrderIds, orderId],
    );
  };

  const toggleAllVisibleOrderChecks = () => {
    if (!allVisibleOrdersChecked) {
      const targetDeliveryDate =
        routePlanDeliveryDateLock ||
        filteredDeliveryDateLock ||
        getOrderDeliveryDateValue(selectableTableOrders[0]);
      const sameDateSelectableOrders = getOrdersForDeliveryDate(
        selectableTableOrders,
        targetDeliveryDate,
      );

      if (sameDateSelectableOrders.length === 0) {
        setCreateRouteClientError(ROUTE_PLAN_DELIVERY_DATE_REQUIRED_ERROR);
        return;
      }

      if (!routePlanDeliveryDateLock) {
        applyDeliveryDateFilterLock(targetDeliveryDate);
      }

      setCheckedOrderIds((currentOrderIds) =>
        Array.from(
          new Set([
            ...currentOrderIds,
            ...sameDateSelectableOrders.map((order) => order.id),
          ]),
        ),
      );
      return;
    }

    setCheckedOrderIds((currentOrderIds) => {
      const visibleOrderIds = new Set(selectableTableOrders.map((order) => order.id));
      return currentOrderIds.filter((orderId) => !visibleOrderIds.has(orderId));
    });
  };

  const handleAddOrderToPlan = useCallback((orderId) => {
    const order = displayOrderById.get(orderId);
    const targetRouteScopeKey = plannedRouteScope?.routeScopeKey ?? order?.routeScopeKey;
    const availabilityContext = {
      ...worksetAvailabilityContext,
      routeScopeKey: targetRouteScopeKey,
    };
    const unavailableReasons = getOrderUnavailableReasons(order, availabilityContext);

    if (unavailableReasons.length > 0) {
      setCreateRouteClientError(
        `This order is unavailable: ${unavailableReasons.map(formatUnavailableReason).join(", ")}.`,
      );
      return;
    }

    if (isOrderRouteCreated(order)) {
      setCreateRouteClientError("이미 route가 생성된 주문은 route plan에 다시 추가할 수 없습니다.");
      return;
    }

    if (isOrderRoutePlanningLocked(order, orderFilterReferenceDate)) {
      setCreateRouteClientError("Delivery 날짜가 지난 주문은 새 route plan에 추가할 수 없습니다.");
      return;
    }

    if (!isOrderReadyToPlan(order)) {
      setCreateRouteClientError("ready 상태 주문만 route plan에 추가할 수 있습니다.");
      return;
    }

    if (!applyOrderDeliveryDateSelectionLock(order)) {
      return;
    }

    if (!order?.routeScopeKey || order.routeScopeKey !== targetRouteScopeKey) {
      setCreateRouteClientError("같은 배송일/세션 주문만 route plan에 추가할 수 있습니다.");
      return;
    }

    setPlannedOrderIds((currentOrderIds) =>
      currentOrderIds.includes(orderId)
        ? currentOrderIds
        : [...currentOrderIds, orderId],
    );
    setCheckedOrderIds((currentOrderIds) =>
      currentOrderIds.filter((checkedOrderId) => checkedOrderId !== orderId),
    );
    setCreateRouteClientError(null);
    setSelectedOrderId(orderId);
  }, [
    applyOrderDeliveryDateSelectionLock,
    displayOrderById,
    orderFilterReferenceDate,
    plannedRouteScope,
    worksetAvailabilityContext,
  ]);

  const handleAddToPlan = () => {
    if (checkedOrderIds.length === 0) return;

    const checkedOrders = checkedOrderIds
      .map((orderId) => displayOrderById.get(orderId))
      .filter(Boolean);
    const selectedOrders = checkedOrders.filter((order) =>
      isOrderSelectableForCurrentWorkset(order, worksetAvailabilityContext),
    );

    if (selectedOrders.length === 0) {
      const blockedState = getBulkOrderSelectionState(checkedOrders, worksetAvailabilityContext);
      setCreateRouteClientError(
        blockedState.unavailableCount > 0
          ? `No selected orders are available. ${formatUnavailableSummary(blockedState.unavailableReasonCounts)}.`
          : "ready 상태 주문만 route plan에 추가할 수 있습니다.",
      );
      return;
    }

    const targetDeliveryDate =
      routePlanDeliveryDateLock || getOrderDeliveryDateValue(selectedOrders[0]);
    const sameDateSelectedOrders = getOrdersForDeliveryDate(
      selectedOrders,
      targetDeliveryDate,
    );

    if (!targetDeliveryDate || sameDateSelectedOrders.length === 0) {
      setCreateRouteClientError(ROUTE_PLAN_DELIVERY_DATE_REQUIRED_ERROR);
      return;
    }

    applyDeliveryDateFilterLock(targetDeliveryDate);

    const targetRouteScopeKey = plannedRouteScope?.routeScopeKey ?? sameDateSelectedOrders.find((order) => order.routeScopeKey)?.routeScopeKey;
    const scopedSelectedOrders = sameDateSelectedOrders.filter((order) => order.routeScopeKey === targetRouteScopeKey);

    if (!targetRouteScopeKey || scopedSelectedOrders.length === 0) {
      setCreateRouteClientError("같은 배송일/세션 주문만 route plan에 추가할 수 있습니다.");
      return;
    }

    if (sameDateSelectedOrders.length !== selectedOrders.length) {
      setCreateRouteClientError(ROUTE_PLAN_DELIVERY_DATE_PARTIAL_ADD_ERROR);
    } else if (scopedSelectedOrders.length !== sameDateSelectedOrders.length) {
      setCreateRouteClientError("같은 배송일/세션 주문만 route plan에 추가했습니다.");
    } else {
      setCreateRouteClientError(null);
    }

    const scopedOrderIds = scopedSelectedOrders.map((order) => order.id);

    setPlannedOrderIds((currentOrderIds) =>
      Array.from(new Set([...currentOrderIds, ...scopedOrderIds])),
    );
    setCheckedOrderIds([]);
    setPlanFitRequest((requestCount) => requestCount + 1);
  };

  const handleRemoveFromPlan = (orderId) => {
    setPlannedOrderIds((currentOrderIds) =>
      currentOrderIds.filter((plannedOrderId) => plannedOrderId !== orderId),
    );
    setActiveDraggedPlanOrderId((currentOrderId) =>
      currentOrderId === orderId ? null : currentOrderId,
    );
  };

  const handleClearPlan = () => {
    setPlannedOrderIds([]);
    setActiveDraggedPlanOrderId(null);
  };

  const handlePlanOrderDragStart = useCallback((event, orderId) => {
    setActiveDraggedPlanOrderId(orderId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", orderId);
  }, []);

  const handlePlanOrderDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handlePlanOrderDrop = useCallback((event, targetOrderId) => {
    event.preventDefault();
    const sourceOrderId = activeDraggedPlanOrderId ?? event.dataTransfer.getData("text/plain");

    setPlannedOrderIds((currentOrderIds) =>
      reorderOrderIds(currentOrderIds, sourceOrderId, targetOrderId),
    );
    setActiveDraggedPlanOrderId(null);
  }, [activeDraggedPlanOrderId]);

  const handlePlanOrderDragEnd = useCallback(() => {
    setActiveDraggedPlanOrderId(null);
  }, []);

  const handleZoomToPlanned = () => {
    fitMapToOrders(routeFitLocations);
  };

  const handleCreateRoute = async () => {
    if (plannedOrderIds.length === 0 || isCreatingRoute) return;

    if (historyScopeActive) {
      setCreateRouteClientError(
        "History / All Orders scope는 조회 전용입니다. route를 만들려면 Planning Scope로 전환해주세요.",
      );
      return;
    }

    if (readyPlannedOrders.length === 0) {
      setCreateRouteClientError("Route plan에는 ready 상태의 주문만 보낼 수 있습니다.");
      return;
    }

    if (plannedOrders.some((order) => isOrderRoutePlanningLocked(order, orderFilterReferenceDate))) {
      setCreateRouteClientError("이미 route가 있거나 Delivery 날짜가 지난 주문은 route plan을 생성할 수 없습니다.");
      return;
    }

    const routeDraftScope = buildRouteScopeFromOrders(readyPlannedOrders);

    if (!routeDraftScope) {
      setCreateRouteClientError("같은 배송일/세션 주문만 route plan을 생성할 수 있습니다.");
      return;
    }

    try {
      setCreateRouteClientError(null);
      const sessionToken = await shopify.idToken();
      submittedRouteSessionTokenRef.current = sessionToken;

      const formData = new FormData();
      formData.set("_intent", "createRoutePlan");
      formData.set("plannedOrderIds", JSON.stringify(readyPlannedOrders.map((order) => order.id)));
      formData.set("routeScope", JSON.stringify(routeDraftScope));
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

    if (!createdRoutePlan?.id || !sessionToken) return;

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

      mapRef.current.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
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
            worksetAvailabilityContext,
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
    worksetAvailabilityContext,
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
      title="Orders"
      primaryExpanded={isMapWide}
      primary={
        <div style={mapFrameStyle}>
          <div style={mapToolbarStyle}>
            <button
              type="button"
              style={mapToolbarButtonStyle}
              aria-label={isMapWide ? "Restore map width" : "Expand map width"}
              onClick={handleToggleMapWide}
            >
              {renderWidthIcon(isMapWide)}
            </button>
            <button
              type="button"
              style={mapToolbarButtonStyle}
              aria-label="Refresh map"
              onClick={handleRefreshMap}
            >
              {renderRefreshIcon()}
            </button>
            {mapStatus !== "idle" ? (
              <span
                style={mapStatusStyle}
                role="status"
                aria-label={
                  mapStatus === "recovering" ? "Map is refreshing" : "Map refresh failed"
                }
              >
                <span aria-hidden="true">
                  {mapStatus === "recovering" ? "…" : "!"}
                </span>
              </span>
            ) : null}
          </div>
          <div
            id="orders-map"
            ref={mapContainerRef}
            style={mapCanvasStyle}
            aria-label="Shopify delivery order map"
          />
        </div>
      }
      secondary={
        <div className="order-route-plan" style={routePlanPanelStyle}>
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
                  disabled={createRouteDisabled}
                  onClick={handleCreateRoute}
                >Create route</button>
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
          </div>

          <div style={routePlanScrollAreaStyle}>
            <div style={routeReadinessStyle} aria-label="Route readiness">
              <div style={routeReadinessHeaderStyle}>
                <s-heading>Route readiness</s-heading>
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
              <div style={routeReadinessGridStyle}>
                <div style={routeReadinessItemStyle}>
                  Scope: {routeDraftSummary.scopeLabel}
                </div>
                <div style={routeReadinessItemStyle}>
                  Orders: {routeDraftSummary.orderCount}
                </div>
                <div style={routeReadinessItemStyle}>
                  Coords: {routeDraftSummary.locatedCount}/{routeDraftSummary.orderCount}
                </div>
                <div style={routeReadinessItemStyle}>
                  Areas: {formatRouteDraftList(routeDraftSummary.deliveryAreas)}
                </div>
              </div>
            </div>

            {plannedOrders.length === 0 ? (
              <div style={routePlanEmptyStyle}>
                Plan이 비어있습니다.
              </div>
            ) : (
              <div style={routePlanListStyle} aria-label="Route plan orders">
                {plannedOrders.map((order, orderIndex) => (
                  <div
                    draggable={true}
                    key={order.id}
                    onDragEnd={handlePlanOrderDragEnd}
                    onDragOver={handlePlanOrderDragOver}
                    onDragStart={(event) => handlePlanOrderDragStart(event, order.id)}
                    onDrop={(event) => handlePlanOrderDrop(event, order.id)}
                    style={
                      activeDraggedPlanOrderId === order.id
                        ? routePlanDraggingItemStyle
                        : routePlanItemStyle
                    }
                  >
                    <div style={routePlanItemHeaderStyle}>
                      <span
                        aria-label={`Drag route plan order ${orderIndex + 1}`}
                        role="img"
                        style={routePlanDragHandleStyle}
                      >⋮</span>
                      <button
                        type="button"
                        className="route-plan-address-button"
                        style={routePlanOrderButtonStyle}
                        onClick={() => handleSelectOrder(order.id)}
                      >
                        {orderIndex + 1}. {order.address}
                      </button>
                      <button
                        type="button"
                        style={removeFromPlanButtonStyle}
                        aria-label={`Remove ${order.name} from route plan`}
                        onClick={() => handleRemoveFromPlan(order.id)}
                      >Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      }
      lower={
        <div style={orderTableLayoutStyle}>
            {protectedOrderAccessError ? (
              <div role="alert" style={compactAlertStyle}>
                Shopify Order 보호 고객 데이터 접근이 아직 활성화되지 않았습니다.
                Dev Dashboard의 Protected customer data access에서 Protected
                customer data와 필요한 고객 필드(Name, Address, Phone)를 저장한 뒤
                앱을 다시 열어주세요.
              </div>
            ) : visibleOrderErrorMessage ? (
              <div role="alert" style={compactAlertStyle}>
                {visibleOrderErrorMessage}
              </div>
            ) : null}
          <div style={orderControlsStyle}>
            <div aria-label="Order planning tabs" role="tablist" style={orderStatusTabsStyle}>
              {ORDER_STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={orderFilters.tab === tab.value}
                  style={
                    orderFilters.tab === tab.value
                      ? activeOrderFilterButtonStyle
                      : orderFilterButtonStyle
                  }
                  onClick={() => handleOrderFilterChange("tab", tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <select
              aria-label="Choose order scope"
              style={orderFilterSelectStyle}
              value={orderFilters.scope}
              onChange={(event) => handleOrderFilterChange("scope", event.currentTarget.value)}
            >
              <option value={ORDER_PLANNING_SCOPE}>Planning Scope</option>
              <option value={ORDER_HISTORY_SCOPE}>History / All Orders</option>
            </select>
            <select
              aria-label="Filter orders by delivery area"
              style={orderFilterSelectStyle}
              value={orderFilters.deliveryArea}
              onChange={(event) => handleOrderFilterChange("deliveryArea", event.currentTarget.value)}
            >
              <option value="">All areas</option>
              {orderFilterOptions.deliveryAreas.map((deliveryArea) => (
                <option key={deliveryArea} value={deliveryArea}>
                  {deliveryArea}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter orders by delivery date"
              style={orderFilterSelectStyle}
              value={orderFilters.deliveryDate}
              onChange={(event) => handleOrderFilterChange("deliveryDate", event.currentTarget.value)}
            >
              <option value="">All delivery dates</option>
              {orderFilterOptions.deliveryDates.map((deliveryDate) => (
                <option key={deliveryDate} value={deliveryDate}>
                  {formatFilterDateLabel(deliveryDate)}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter orders by service type"
              style={orderFilterSelectStyle}
              value={orderFilters.serviceType}
              onChange={(event) => handleOrderFilterChange("serviceType", event.currentTarget.value)}
            >
              <option value="">All service types</option>
              {serviceTypeFilterOptions.map((serviceType) => (
                <option key={serviceType} value={serviceType}>
                  {formatServiceTypeLabel(serviceType)}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter orders by ordered date"
              style={orderFilterSelectStyle}
              value={orderFilters.orderedDate}
              onChange={(event) => handleOrderFilterChange("orderedDate", event.currentTarget.value)}
            >
              <option value="">All order dates</option>
              {orderFilterOptions.orderedDates.map((orderedDate) => (
                <option key={orderedDate} value={orderedDate}>
                  {orderedDate}
                </option>
              ))}
            </select>
            <input
              aria-label="Search orders"
              placeholder="Search orders"
              style={orderFilterSearchStyle}
              type="search"
              value={orderFilters.search}
              onChange={(event) => handleOrderFilterChange("search", event.currentTarget.value)}
            />
            <button
              type="button"
              title="Return to the planning Unplanned view"
              style={activeOrderFilters ? orderFilterButtonStyle : disabledOrderFilterButtonStyle}
              disabled={!activeOrderFilters}
              onClick={handleClearOrderFilters}
            >Clear filters</button>
            <div style={orderControlsTrailingStyle}>
              <button
                type="button"
                style={
                  checkedOrderIds.length === 0
                    ? disabledOrderFilterButtonStyle
                    : orderFilterButtonStyle
                }
                disabled={checkedOrderIds.length === 0}
                onClick={handleClearSelection}
              >Clear selection</button>
              <button
                type="button"
                style={
                  checkedOrderIds.length === 0 || historyScopeActive
                    ? disabledCreateRouteButtonStyle
                    : addToPlanButtonStyle
                }
                disabled={checkedOrderIds.length === 0 || historyScopeActive}
                onClick={handleAddToPlan}
              >Add to plan</button>
              <span style={orderFilterSummaryStyle}>
                {filteredOrders.length} shown · {selectableTableOrders.length} selectable · {tableSelectionState.unavailableCount} unavailable
              </span>
              {unavailableSummary ? (
                <span style={unavailableSummaryStyle}>{unavailableSummary}</span>
              ) : null}
              <span style={planSummaryTextStyle}>
                {checkedOrderIds.length > 0
                  ? `${checkedOrderIds.length} selected.`
                  : `${plannedOrderIds.length} added to plan.`}
              </span>
            </div>
          </div>
          <div style={tableWrapStyle}>
            <table aria-label="Shopify orders" style={tableStyle}>
              <colgroup>
                {tableColumnWidths.map((width, columnIndex) => (
                  <col key={`${width}-${columnIndex}`} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" style={tableHeaderCellStyle}>
                    <input
                      type="checkbox"
                      aria-label="Select all visible orders for plan"
                      checked={allVisibleOrdersChecked}
                      disabled={selectableTableOrders.length === 0}
                      onChange={toggleAllVisibleOrderChecks}
                    />
                  </th>
                  {SORTABLE_ORDER_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      style={tableHeaderCellStyle}
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
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableOrders.map((order) => {
                  const unavailableReasons = getOrderUnavailableReasons(order, worksetAvailabilityContext);
                  const routePlanningUnavailable = unavailableReasons.length > 0;
                  const unavailableLabel = unavailableReasons.map(formatUnavailableReason).join(", ");

                  return (
                    <tr key={order.id}>
                      <td style={checkboxCellStyle}>
                        <input
                          type="checkbox"
                          aria-label={
                            routePlanningUnavailable
                              ? `${order.name} unavailable for plan: ${unavailableLabel}`
                              : `Select ${order.name} for plan`
                          }
                          title={unavailableLabel}
                          checked={!routePlanningUnavailable && checkedOrderIdSet.has(order.id)}
                          disabled={routePlanningUnavailable}
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
