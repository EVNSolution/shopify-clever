/* eslint-disable react/prop-types */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Await, useFetcher, useLoaderData, useNavigate, useRevalidator, useSearchParams } from "react-router";
import { buildRouteScopeFromOrders } from "../delivery/route-scope";
import { appendIdToken, routeGroupPath, routePlanPath } from "../delivery/route-paths";
import { formatRouteDeliveryScope, getRouteGroupChildRouteName, getVisibleRouteGroupChildren } from "../delivery/route-helpers";
import { createDepartureMarkerElement } from "../maps/map-markers";
import { createMapLibreMap } from "../maps/maplibre-map";
import { installMissingMapImageFallback } from "../maps/maplibre-missing-images";
import { installPmtilesProtocol } from "../maps/pmtiles-protocol";
import { getOrderSyncSnapshots, mapCanonicalOrdersToOrderRows, mergeShopifyOrderRowsWithCanonicalRows } from "./canonical-orders";
import { getOrderAreaSuggestion } from "./order-area-suggestion";
import {
  DEFAULT_CENTER,
  INITIAL_HOME_ZOOM,
  MAP_RECOVERY_DELAY_MS,
  MAP_SOURCE_SYNC_RETRY_DELAY_MS,
  MARKER_CLICK_TARGET_ZOOM,
  MARKER_CLICK_ZOOM_OUT_THRESHOLD,
  MAX_MAP_SOURCE_SYNC_RETRY_ATTEMPTS,
  MAX_MAP_RECOVERY_ATTEMPTS,
  OPENFREEMAP_STYLE_URL,
  ORDERS_MAP_ORDER_LAYER_ID,
  ORDERS_MAP_SOURCE_ID,
  getOrderIdFromMapFeature,
  syncOrdersMapMarkerLayer,
} from "./orders-map";
import { getServiceErrorNotice } from "../service-errors";
import {
  DEFAULT_TABLE_COLUMN_WIDTHS,
  SORTABLE_ORDER_COLUMNS,
  getTableColumnFitWidth,
  getTableColumnMinWidth,
  getTableColumnPillMinWidths,
  getTableColumnPixelState,
} from "./orders-table-columns";
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
  ORDER_HISTORY_SCOPE,
  ORDER_PLANNING_SCOPE,
  ORDER_WEEKDAY_OPTIONS,
  updateOrderFilterSearchParams,
} from "./order-filters";
import { InfoPill } from "../../ui/info-pill";
import { MapPanel, MapToolbar, renderMapFitIcon, renderMapRefreshIcon, renderMapWidthIcon, renderMapZoomInIcon, renderMapZoomOutIcon } from "../../ui/map-panel";
import { TabLayout } from "../../ui/tab-layout";
import {
  buildOrderTimelineDetails,
  buildOrdersViewNavigationMetric,
  DEFAULT_ROUTE_PLAN_TITLE,
  getSafePerformanceNow,
  roundPerfDuration,
  shouldRequestOrdersData,
  textOrUndefined,
} from "./orders-page.shared";

const PERF_ENDPOINT = "/perf";
const PERF_CAPTURE_ENABLED = import.meta.env.DEV;
const SESSION_TOKEN_REFRESH_PARAM = "_shopify_session_refreshed";
const ORDER_DATA_FIX_ACTION = "fixData";
const ORDER_BULK_ACTION_OPTIONS = [
  { label: "State", value: "state" },
  { label: "Payment", value: "payment" },
  { label: "Fix data", value: ORDER_DATA_FIX_ACTION },
];
const ORDER_STATE_CHANGE_OPTIONS = [
  { label: "Pending", value: "PENDING" },
  { label: "Assigned", value: "ASSIGNED" },
  { label: "En route", value: "EN_ROUTE" },
  { label: "Arrived", value: "ARRIVED" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Failed", value: "FAILED" },
  { label: "Skipped", value: "SKIPPED" },
  { label: "Cancelled", value: "CANCELLED" },
];
const ORDER_PAYMENT_CHANGE_OPTIONS = [
  { label: "Paid", value: "PAID" },
  { label: "Cash", value: "CASH" },
  { label: "eTransfer", value: "ETRANSFER" },
  { label: "Pending", value: "PENDING" },
  { label: "Unknown", value: "UNKNOWN" },
];
const CALENDAR_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const ordersMapCanvasStyle = {
  minHeight: "420px",
};

const ordersLoadingPanelStyle = {
  minHeight: "420px",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  color: "#616161",
  background: "#f7f7f7",
};

const ordersLoadingPlanStyle = {
  display: "grid",
  alignContent: "start",
  gap: "14px",
  minHeight: "420px",
  padding: "16px",
};

const ordersLoadingTableStyle = {
  display: "grid",
  gap: "10px",
  padding: "12px",
};

const ordersLoadingControlsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(96px, 1fr))",
  gap: "8px",
};

const ordersLoadingTableHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "80px 120px 150px minmax(240px, 1fr) 80px",
  gap: "12px",
  padding: "8px 12px",
  color: "#616161",
  fontSize: "12px",
  fontWeight: 600,
};

const ordersLoadingTableRowStyle = {
  display: "grid",
  gridTemplateColumns: "80px 120px 150px minmax(240px, 1fr) 80px",
  gap: "12px",
  alignItems: "center",
  minHeight: "42px",
  padding: "0 12px",
  borderTop: "1px solid #ebebeb",
};

const ordersLoadingBlockStyle = {
  height: "12px",
  borderRadius: "6px",
  background: "#e5e5e5",
};

const ordersLoadingControlStyle = {
  ...ordersLoadingBlockStyle,
  height: "34px",
  borderRadius: "8px",
};

const ordersLoadingStatusStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "6px",
};

const ordersLoadingRetryButtonStyle = {
  appearance: "none",
  background: "#303030",
  border: 0,
  borderRadius: "8px",
  color: "#ffffff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 650,
  marginTop: "8px",
  padding: "8px 14px",
};

const ORDERS_AUTO_RETRY_DELAY_MS = 750;
let ordersLoadAutoRetryAttempted = false;

const routePlanPanelStyle = {
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  height: "420px",
  maxHeight: "420px",
  overflowX: "hidden",
  overflowY: "auto",
  padding: "10px",
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

const ordersViewTabsRowStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  justifyContent: "space-between",
};

const ordersViewTabBarStyle = {
  alignItems: "center",
  display: "flex",
  gap: "6px",
};

const ordersViewTabButtonStyle = {
  background: "#ffffff",
  borderColor: "#d4d4d4",
  borderRadius: "8px",
  borderStyle: "solid",
  borderWidth: "1px",
  color: "#303030",
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
  fontWeight: 600,
  lineHeight: "18px",
  padding: "4px 10px",
};

const activeOrdersViewTabButtonStyle = {
  ...ordersViewTabButtonStyle,
  background: "#303030",
  borderColor: "#303030",
  color: "#ffffff",
};

const inventoryListStyle = {
  display: "flex",
  flexDirection: "column",
  minHeight: "420px",
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
  maxHeight: "150px",
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

const routeAddPreviewStyle = {
  ...routeReadinessStyle,
  minHeight: 0,
};

const orderControlsTrailingStyle = {
  alignItems: "center",
  display: "flex",
  flex: "0 0 auto",
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
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#1f1f1f",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 650,
  letterSpacing: "-0.01em",
  lineHeight: 1.2,
  minHeight: "32px",
  padding: "5px 8px",
  width: "100%",
};

const routePlanDetailStyle = {
  background: "#f7f7f7",
  borderRadius: "8px",
  flex: "0 0 auto",
  padding: "8px",
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
  flexWrap: "nowrap",
  gap: "6px",
  overflowX: "auto",
  padding: "6px 10px 8px",
};

const tableWrapStyle = {
  boxSizing: "border-box",
  height: "calc(100vh - 150px)",
  minHeight: "320px",
  overflowX: "auto",
  overflowY: "auto",
  paddingBottom: "10px",
  paddingRight: "10px",
  scrollbarGutter: "stable",
};

const orderFilterControlStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#303030",
  flex: "0 1 122px",
  fontSize: "13px",
  height: "30px",
  minWidth: "104px",
  padding: "0 8px",
};

const orderFilterDateFieldStyle = {
  ...orderFilterControlStyle,
  alignItems: "center",
  display: "flex",
  flex: "0 1 176px",
  gap: "6px",
  minWidth: "148px",
  overflow: "hidden",
  position: "relative",
};

const orderFilterDateButtonStyle = {
  background: "transparent",
  border: 0,
  color: "#303030",
  cursor: "pointer",
  flex: "1 1 auto",
  font: "inherit",
  fontWeight: 650,
  height: "26px",
  minWidth: 0,
  overflow: "hidden",
  padding: "0 24px 0 0",
  textAlign: "left",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const orderFilterDatePlaceholderButtonStyle = {
  ...orderFilterDateButtonStyle,
  color: "#616161",
  fontWeight: 500,
};

const orderFilterSelectFieldStyle = {
  ...orderFilterControlStyle,
  display: "flex",
  padding: 0,
  position: "relative",
};

const orderFilterMenuButtonStyle = {
  background: "transparent",
  border: 0,
  boxSizing: "border-box",
  color: "#303030",
  cursor: "pointer",
  flex: "1 1 auto",
  font: "inherit",
  fontWeight: 650,
  height: "100%",
  minWidth: 0,
  overflow: "hidden",
  padding: "0 28px 0 8px",
  textAlign: "left",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const orderFilterMenuPlaceholderStyle = {
  ...orderFilterMenuButtonStyle,
  color: "#616161",
  fontWeight: 500,
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

const orderFilterMenuStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "10px",
  boxShadow: "0 10px 28px rgba(0, 0, 0, 0.14)",
  display: "grid",
  gap: "2px",
  maxHeight: "240px",
  overflowY: "auto",
  padding: "6px",
  position: "absolute",
  zIndex: 2147483647,
};

const orderFilterMenuOptionStyle = {
  background: "transparent",
  border: 0,
  borderRadius: "7px",
  color: "#303030",
  cursor: "pointer",
  font: "inherit",
  fontSize: "13px",
  lineHeight: 1.25,
  padding: "7px 8px",
  textAlign: "left",
};

const selectedOrderFilterMenuOptionStyle = {
  ...orderFilterMenuOptionStyle,
  background: "#f1f1f1",
  fontWeight: 700,
};

function renderOrderFilterChevron() {
  return (
    <span aria-hidden="true" style={orderFilterIndicatorStyle}>
      <span style={orderFilterChevronUpStyle} />
      <span style={orderFilterChevronDownStyle} />
    </span>
  );
}

function OrderFilterMenu({ ariaLabel, clearLabel, label, onChange, onClear, options, value }) {
  const fieldRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const selectedOption = options.find((option) => option.value === value);
  const displayLabel = selectedOption?.label ?? label;

  const positionMenu = useCallback(() => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = Math.max(rect.width, 168);
    const left = Math.max(
      window.scrollX + 8,
      Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - width - 8),
    );
    setMenuPosition({ left, top: rect.bottom + window.scrollY + 4, width });
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    positionMenu();
    const handleDocumentPointerDown = (event) => {
      if (fieldRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
      setMenuPosition(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setMenuPosition(null);
      }
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", positionMenu);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", positionMenu);
    };
  }, [open, positionMenu]);

  return (
    <div ref={fieldRef} style={orderFilterSelectFieldStyle}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        style={value ? orderFilterMenuButtonStyle : orderFilterMenuPlaceholderStyle}
        type="button"
        onClick={() => {
          if (!open) positionMenu();
          setOpen((isOpen) => !isOpen);
        }}
      >{displayLabel}</button>
      {value ? (
        <button
          type="button"
          aria-label={clearLabel}
          style={orderFilterClearButtonStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onClear()}
        >×</button>
      ) : (
        renderOrderFilterChevron()
      )}
      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              style={{
                ...orderFilterMenuStyle,
                left: `${menuPosition.left}px`,
                top: `${menuPosition.top}px`,
                width: `${menuPosition.width}px`,
              }}
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  aria-selected={option.value === value}
                  role="option"
                  style={option.value === value ? selectedOrderFilterMenuOptionStyle : orderFilterMenuOptionStyle}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setMenuPosition(null);
                  }}
                >{option.label}</button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
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
  position: "absolute",
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

const orderActionOverlayStyle = {
  alignItems: "center",
  background: "rgba(0, 0, 0, 0.34)",
  bottom: 0,
  display: "flex",
  justifyContent: "center",
  left: 0,
  position: "fixed",
  right: 0,
  top: 0,
  zIndex: 2147483647,
};

const orderActionDialogStyle = {
  background: "#ffffff",
  borderRadius: "14px",
  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.24)",
  display: "grid",
  gap: "12px",
  maxWidth: "min(420px, calc(100vw - 32px))",
  padding: "16px",
  width: "420px",
};

const routeAddDialogStyle = {
  ...orderActionDialogStyle,
  maxWidth: "min(880px, calc(100vw - 32px))",
  width: "min(880px, calc(100vw - 32px))",
};

const routeAddDialogGridStyle = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  minWidth: 0,
};

const routeAddDialogControlsStyle = {
  alignContent: "start",
  display: "grid",
  gap: "10px",
  minWidth: 0,
};

const routeAddSnapshotStyle = {
  ...routeAddPreviewStyle,
  alignContent: "start",
  maxHeight: "520px",
};

const routeAddSnapshotHeaderStyle = {
  alignItems: "baseline",
  display: "flex",
  gap: "8px",
  justifyContent: "space-between",
};

const routeAddSnapshotHintStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
};

const routeAddSnapshotMapStyle = {
  background: "#f7f7f7",
  border: "1px solid #e3e3e3",
  borderRadius: "8px",
  height: "190px",
  overflow: "hidden",
  pointerEvents: "none",
  position: "relative",
};

const routeAddSnapshotMapCanvasStyle = {
  height: "100%",
  width: "100%",
};

const routeAddSnapshotEmptyStyle = {
  color: "#616161",
  fontSize: "13px",
  left: "50%",
  position: "absolute",
  textAlign: "center",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "80%",
};

const routeAddSnapshotListStyle = {
  display: "grid",
  gap: "6px",
  listStyle: "none",
  margin: 0,
  maxHeight: "188px",
  overflowY: "auto",
  padding: 0,
};

const routeAddSnapshotOrderStyle = {
  background: "#f7f7f7",
  border: "1px solid #ebebeb",
  borderRadius: "8px",
  display: "grid",
  gap: "2px",
  minWidth: 0,
  padding: "7px 9px",
};

const routeAddSnapshotOrderMetaStyle = {
  color: "#616161",
  fontSize: "12px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const orderActionToggleStyle = {
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "repeat(3, 1fr)",
};

const orderActionSelectStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#303030",
  fontSize: "13px",
  height: "30px",
  padding: "0 8px",
  flex: "none",
  width: "100%",
};

const orderDataDialogStyle = {
  ...orderActionDialogStyle,
  maxWidth: "min(860px, calc(100vw - 32px))",
  width: "min(860px, calc(100vw - 32px))",
};

const orderDataDialogGridStyle = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "minmax(220px, 0.9fr) minmax(280px, 1.1fr)",
  minWidth: 0,
};

const orderDataListStyle = {
  border: "1px solid #ebebeb",
  borderRadius: "10px",
  display: "grid",
  gap: "4px",
  margin: 0,
  maxHeight: "330px",
  overflowY: "auto",
  padding: "6px",
};

const orderDataListButtonStyle = {
  background: "#ffffff",
  border: "1px solid transparent",
  borderRadius: "8px",
  color: "#303030",
  cursor: "pointer",
  display: "grid",
  font: "inherit",
  fontSize: "13px",
  gap: "2px",
  padding: "8px",
  textAlign: "left",
};

const activeOrderDataListButtonStyle = {
  ...orderDataListButtonStyle,
  background: "#f1f5ff",
  borderColor: "#2c6ecb",
};

const orderDataReasonStyle = {
  color: "#616161",
  fontSize: "12px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const orderDataPanelStyle = {
  display: "grid",
  gap: "10px",
  minWidth: 0,
};

const orderRawNoteStyle = {
  background: "#f7f7f7",
  border: "1px solid #ebebeb",
  borderRadius: "10px",
  color: "#303030",
  fontFamily: "inherit",
  fontSize: "13px",
  lineHeight: 1.45,
  margin: 0,
  maxHeight: "150px",
  overflow: "auto",
  padding: "10px",
  whiteSpace: "pre-wrap",
};

const orderDataFormStyle = {
  display: "grid",
  gap: "8px",
};

const tableStyle = {
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: "13px",
  minWidth: "1520px",
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

const INVENTORY_TABLE_COLUMN_WIDTHS = ["32px", "220px", "88px", "82px", "150px", "128px"];

const inventoryTableWrapStyle = {
  boxSizing: "border-box",
  maxHeight: "min(520px, 58vh)",
  overflowX: "auto",
  overflowY: "auto",
  paddingBottom: "10px",
  paddingRight: "10px",
  scrollbarGutter: "stable",
};

const inventoryTableStyle = {
  ...tableStyle,
  minWidth: "700px",
};

const inventoryHeaderCellStyle = tableHeaderCellStyle;
const inventoryCellStyle = tableCellStyle;
const inventoryCheckboxHeaderCellStyle = {
  ...checkboxHeaderCellStyle,
  padding: "6px 2px",
};
const inventoryCheckboxCellStyle = {
  ...tableCellStyle,
  padding: "6px 2px",
};
const inventoryCheckboxStyle = {
  margin: 0,
};

const inventoryDeleteButtonStyle = {
  ...removeFromPlanButtonStyle,
  borderColor: "#d72c0d",
  color: "#d72c0d",
};

const inventoryNameCellStyle = {
  ...tableCellStyle,
  fontWeight: 650,
  textAlign: "left",
};

const checkboxCellStyle = {
  ...tableCellStyle,
  padding: "6px 4px",
};

const deliveryInfoCellStyle = {
  ...tableCellStyle,
  color: "#303030",
  fontWeight: 650,
  overflow: "visible",
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

const addressCellStyle = {
  ...tableCellStyle,
  textAlign: "left",
};

const editablePillButtonStyle = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  font: "inherit",
  padding: 0,
};

const itemCellStyle = {
  ...tableCellStyle,
  overflow: "visible",
  position: "relative",
};

const noteCellStyle = {
  ...itemCellStyle,
  padding: "6px 2px",
  textAlign: "center",
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

const noteButtonStyle = {
  ...itemInfoButtonStyle,
  marginLeft: 0,
};

const itemPopoverStyle = {
  background: "#ffffff",
  border: "1px solid #d6dce5",
  borderRadius: "10px",
  boxSizing: "border-box",
  boxShadow: "0 10px 28px rgba(0, 0, 0, 0.16)",
  left: "50%",
  minWidth: "360px",
  padding: "8px 10px 10px",
  position: "absolute",
  top: "28px",
  transform: "translateX(-50%)",
  zIndex: 20,
};

const orderedItemsPopoverStyle = {
  ...itemPopoverStyle,
  width: "clamp(360px, 60vw, 640px)",
  maxWidth: "calc(100vw - 16px)",
  minWidth: 0,
  maxHeight: "calc(100vh - 16px)",
  overflowY: "auto",
  overscrollBehavior: "contain",
};

const notePopoverStyle = {
  ...itemPopoverStyle,
  minWidth: "240px",
  maxWidth: "320px",
  whiteSpace: "normal",
};

const noteCardStyle = {
  background: "#f6f6f7",
  border: "1px solid #e1e3e5",
  borderRadius: "8px",
  padding: "8px 10px",
};

const noteListStyle = {
  margin: 0,
  paddingLeft: "18px",
};

const noteListItemStyle = {
  color: "#303030",
  fontSize: "12px",
  lineHeight: 1.4,
  overflowWrap: "anywhere",
  textAlign: "left",
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
  overflowWrap: "anywhere",
  padding: "5px 6px",
  textAlign: "left",
  verticalAlign: "top",
  whiteSpace: "normal",
};

const itemPopoverCompactCellStyle = {
  ...itemPopoverCellStyle,
  whiteSpace: "nowrap",
  width: "1%",
};

const itemPopoverQtyCellStyle = {
  ...itemPopoverCompactCellStyle,
  fontWeight: 700,
  textAlign: "right",
};

const itemPopoverFooterStyle = {
  alignItems: "flex-start",
  borderTop: "1px solid #edf0f3",
  boxSizing: "border-box",
  display: "flex",
  fontSize: "11px",
  fontWeight: 700,
  gap: "12px",
  justifyContent: "space-between",
  padding: "7px 6px 0",
  width: "100%",
};

const itemPopoverFooterValueStyle = {
  minWidth: 0,
  overflowWrap: "anywhere",
  textAlign: "right",
  whiteSpace: "normal",
};

const detailPillRootStyle = {
  display: "inline-flex",
  justifyContent: "center",
  position: "relative",
};

const detailPopoverStyle = {
  ...itemPopoverStyle,
  maxWidth: "360px",
  minWidth: "280px",
  pointerEvents: "none",
  textAlign: "left",
  transform: "none",
  whiteSpace: "normal",
  zIndex: 30,
};

const detailPopoverListStyle = {
  display: "grid",
  gap: "5px",
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const detailPopoverItemStyle = {
  color: "#303030",
  fontSize: "11px",
  fontWeight: 650,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
  textAlign: "left",
  whiteSpace: "normal",
};

const DETAIL_POPOVER_GAP = 8;
const DETAIL_POPOVER_WIDTH = 280;
const DETAIL_POPOVER_HEIGHT = 96;
const ITEM_POPOVER_WIDTH = 360;
const ITEM_POPOVER_HEIGHT = 220;
const NOTE_POPOVER_WIDTH = 280;
const NOTE_POPOVER_HEIGHT = 140;

function clampPopoverPosition(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function getOrderDetailPopoverPosition(rect, popoverSize = {}) {
  const gap = DETAIL_POPOVER_GAP;
  const viewportLeft = window.scrollX;
  const viewportTop = window.scrollY;
  const width = Math.min(popoverSize.width ?? DETAIL_POPOVER_WIDTH, window.innerWidth - gap * 2);
  const height = Math.min(popoverSize.height ?? DETAIL_POPOVER_HEIGHT, window.innerHeight - gap * 2);
  const anchorX = rect.left + window.scrollX + rect.width / 2;
  const left = clampPopoverPosition(
    anchorX - width / 2,
    viewportLeft + gap,
    viewportLeft + window.innerWidth - width - gap,
  );
  const aboveTop = rect.top + window.scrollY - height - gap;
  const belowTop = rect.bottom + window.scrollY + gap;
  const top = aboveTop >= viewportTop + gap
    ? aboveTop
    : clampPopoverPosition(belowTop, viewportTop + gap, viewportTop + window.innerHeight - height - gap);

  return { left, top, width };
}

function getRightPopoverPosition(rect, popoverSize = {}) {
  const gap = DETAIL_POPOVER_GAP;
  const width = Math.min(popoverSize.width ?? NOTE_POPOVER_WIDTH, window.innerWidth - gap * 2);
  const height = Math.min(popoverSize.height ?? NOTE_POPOVER_HEIGHT, window.innerHeight - gap * 2);
  const rightLeft = rect.right + window.scrollX + gap;
  const viewportRight = window.scrollX + window.innerWidth;
  const left = rightLeft + width <= viewportRight - gap
    ? rightLeft
    : Math.max(window.scrollX + gap, rect.left + window.scrollX - width - gap);
  const top = clampPopoverPosition(
    rect.top + window.scrollY,
    window.scrollY + gap,
    window.scrollY + window.innerHeight - height - gap,
  );

  return { left, top, width };
}

function scheduleIdleTask(callback) {
  if (window.requestIdleCallback) {
    const idleTaskId = window.requestIdleCallback(callback, { timeout: 600 });

    return () => window.cancelIdleCallback(idleTaskId);
  }

  const timeoutId = window.setTimeout(callback, 0);

  return () => window.clearTimeout(timeoutId);
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
    durationMs: roundPerfDuration(navigationEntry.duration),
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

  if (columnKey === "payment") {
    return formatOrderPaymentState(order);
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

function formatInventoryChangedAt(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function formatInventoryDeltaSummary(inventory) {
  const lastChange = Array.isArray(inventory?.lastChange) ? inventory.lastChange : [];
  if (lastChange.length === 0) return "No changes";
  const delta = lastChange.slice(0, 3).reduce((total, item) => total + (Number(item.quantityDelta) || 0), 0);
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta} items · ${lastChange.length} changes`;
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

const DELIVERY_DATE_ATTRIBUTE_KEYS = ["Delivery Date", "Delivery date", "clever_delivery_date", "deliveryDate", "delivery_date", "tomatono_delivery_date"];
const DELIVERY_DAY_ATTRIBUTE_KEYS = ["Delivery Day", "Delivery day", "delivery_day"];
const DELIVERY_AREA_ATTRIBUTE_KEYS = ["Delivery Area", "Delivery area", "delivery_area"];
const NOTE_DATE_HINT_PATTERNS = [
  /(\d{1,2}\s*월\s*\d{1,2}\s*일)/u,
  /((?:월|화|수|목|금|토|일)요일)/u,
  /(?:^|[^\d])((?:20\d{2}[./-])?(?:0?[1-9]|1[0-2])[./-](?:0?[1-9]|[12]\d|3[01]))(?!\d)/u,
];
const PICKUP_HINT_PATTERN = /픽업|pickup/iu;
const LINE_ITEM_DATE_RANGE_PATTERN = /\b(\d{1,2}[./-]\d{1,2}\s*(?:-|~|–)\s*(?:\d{1,2}[./-])?\d{1,2})\b/u;

function formatAreaValue(order) {
  if (order?.serviceType === "PICKUP") return "Pickup";
  return textOrUndefined(order?.deliveryArea) ?? "Null";
}

function getUniqueInfoDetails(values) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map(textOrUndefined)
        .filter(Boolean),
    ),
  );
}

function formatInfoPillTitle(label, values) {
  const uniqueValues = getUniqueInfoDetails(values);

  return uniqueValues.length > 0 ? `${label}: ${uniqueValues.join(" · ")}` : label;
}

function formatInfoDetail(label, value) {
  const text = textOrUndefined(value);
  return text ? `${label}: ${text}` : undefined;
}

function getOrderAreaPillDetails(order) {
  const tone = getOrderAreaPillTone(order);
  if (!isAttentionPillTone(tone)) return [];

  const rawArea = getOrderRawAttributeValue(order, DELIVERY_AREA_ATTRIBUTE_KEYS);

  return getUniqueInfoDetails([
    "Delivery area is missing",
    rawArea ? formatInfoDetail("Raw Delivery Area", rawArea) : "Raw Delivery Area missing",
  ]);
}

function getOrderAreaPillTone(order) {
  if (order?.serviceType === "PICKUP") return "pickup";
  if (textOrUndefined(order?.deliveryArea)) return "neutral";
  return "warning";
}

function getOrderDeliveryPillDetails(order) {
  if (getOrderDeliveryPillTone(order) === "neutral") return [];

  const rawDate = getOrderRawAttributeValue(order, DELIVERY_DATE_ATTRIBUTE_KEYS);
  const rawDay = getOrderRawAttributeValue(order, DELIVERY_DAY_ATTRIBUTE_KEYS);
  const rawNote = getOrderNote(order);
  const noteHint = getOrderNoteDeliveryHint(order);
  const lineItemHint = getOrderLineItemDateRangeHint(order);

  return getUniqueInfoDetails([
    "Delivery date is missing",
    rawDate ? formatInfoDetail("Raw Delivery Date", rawDate) : "Raw Delivery Date missing",
    rawDay ? formatInfoDetail("Raw Delivery Day", rawDay) : undefined,
    rawNote ? formatInfoDetail("Raw note", rawNote) : undefined,
    noteHint,
    lineItemHint,
  ]);
}

function getOrderDeliveryPillTone(order) {
  if (getOrderDeliveryDateValue(order)) return "neutral";
  return getOrderRawAttributeValue(order, DELIVERY_DATE_ATTRIBUTE_KEYS) ||
    getOrderRawAttributeValue(order, DELIVERY_DAY_ATTRIBUTE_KEYS) ||
    getOrderNoteDeliveryHint(order) ||
    getOrderLineItemDateRangeHint(order)
    ? "warning"
    : "critical";
}

function isAttentionPillTone(tone) {
  return tone === "warning" || tone === "critical";
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

function getOrderRawAttributeValue(order, keys) {
  const attributes = [
    order?.rawPayload?.customAttributes,
    order?.shopifyOrderSnapshot?.customAttributes,
    order?.customAttributes,
    order?.attributeList,
  ].flatMap((candidate) => (Array.isArray(candidate) ? candidate : []));

  for (const key of keys) {
    const attribute = attributes.find((candidate) => textOrUndefined(candidate?.key) === key);
    const value = textOrUndefined(attribute?.value);
    if (value) return value;
  }

  return undefined;
}

function getOrderNote(order) {
  return textOrUndefined(order?.note ?? order?.rawPayload?.note ?? order?.shopifyOrderSnapshot?.note);
}

function getCustomerNote(order) {
  return textOrUndefined(
    order?.customerNote ?? order?.rawPayload?.customer?.note ?? order?.shopifyOrderSnapshot?.customer?.note,
  );
}

function getShopifyAdminOrderUrl(order) {
  const legacyResourceId = textOrUndefined(order?.legacyResourceId);
  const gidResourceId = textOrUndefined(order?.id)?.match(/^gid:\/\/shopify\/Order\/(\d+)$/)?.[1];
  const resourceId = legacyResourceId ?? gidResourceId;
  return resourceId ? `shopify://admin/orders/${encodeURIComponent(resourceId)}` : null;
}

function getOrderDataDraft(order) {
  return {
    deliveryArea: textOrUndefined(order?.deliveryArea) ?? "",
    deliveryDate: (getOrderDeliveryDateValue(order) ?? "").replaceAll("-", "."),
  };
}

function getOrderDataIssueReasons(order, plannedOrderIdSet) {
  const reasons = [];
  if (!isOrderRouteCreated(order) && !plannedOrderIdSet?.has(order?.id)) reasons.push("Unassigned");
  if (getOrderDeliveryPillTone(order) !== "neutral") reasons.push("Delivery date");
  if (isAttentionPillTone(getOrderAreaPillTone(order))) reasons.push("Area");
  return reasons;
}

function getOrderNoteDeliveryHint(order) {
  const note = getOrderNote(order);
  if (!note) return undefined;

  for (const pattern of NOTE_DATE_HINT_PATTERNS) {
    const match = note.match(pattern);
    const hint = match?.[1]?.trim();
    if (hint && (hasNoteDeliveryContext(note) || !/^\d{1,2}[./-]\d{1,2}$/u.test(hint))) return `Note hint: ${hint}`;
  }

  if (/배송|delivery/iu.test(note)) return "Note mentions delivery";
  if (PICKUP_HINT_PATTERN.test(note)) return "Note mentions pickup";

  return undefined;
}

function hasNoteDeliveryContext(note) {
  return /배송|배달|delivery|픽업|pickup|요망|날짜|date/iu.test(note);
}

function getOrderLineItemDateRangeHint(order) {
  for (const item of getOrderLineItems(order)) {
    const match = [item.name, item.options, item.sku].join(" ").match(LINE_ITEM_DATE_RANGE_PATTERN);
    if (match?.[1]) return `Item date range: ${match[1].trim()}`;
  }

  return undefined;
}

function getRouteGroupOrderCount(routeGroup) {
  const assignments = Array.isArray(routeGroup?.assignments) ? routeGroup.assignments : [];
  if (assignments.length > 0) return assignments.length;

  return getVisibleRouteGroupChildren(routeGroup).reduce(
    (total, child) => total + (Array.isArray(child?.orderIds) ? child.orderIds.length : 0),
    0,
  );
}

function getRouteAddOptionLabel(routeGroup) {
  const name = textOrUndefined(routeGroup?.name) ?? "Untitled route";
  const scope = formatRouteDeliveryScope(routeGroup, "");
  return [name, scope, `${getRouteGroupOrderCount(routeGroup)} orders`].filter(Boolean).join(" · ");
}

function getRouteAddTargetLabel(routeGroup) {
  const [firstChild] = getVisibleRouteGroupChildren(routeGroup);
  if (!firstChild) return "No child route";
  return getRouteGroupChildRouteName(routeGroup, firstChild, firstChild.routePlan, 0);
}

function getRouteAddSnapshotOrderIds(routeGroup) {
  const assignmentOrderIds = (Array.isArray(routeGroup?.assignments) ? routeGroup.assignments : [])
    .map((assignment) => textOrUndefined(assignment?.orderId ?? assignment?.sourceOrderId ?? assignment?.shopifyOrderGid));
  if (assignmentOrderIds.some(Boolean)) return assignmentOrderIds.filter(Boolean);

  return getVisibleRouteGroupChildren(routeGroup)
    .flatMap((child) => (Array.isArray(child?.orderIds) ? child.orderIds : []))
    .map(textOrUndefined)
    .filter(Boolean);
}

function getRouteAddSnapshotCoordinate(value) {
  const coordinates = Array.isArray(value?.coordinates) ? value.coordinates : null;
  const longitude = Number(coordinates?.[0] ?? value?.longitude ?? value?.coordinates?.longitude);
  const latitude = Number(coordinates?.[1] ?? value?.latitude ?? value?.coordinates?.latitude);

  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
}

function getRouteAddSnapshotAddress(value) {
  if (typeof value?.address === "string") return textOrUndefined(value.address);

  const address = value?.address ?? value?.shippingAddress;
  return [address?.address1, address?.address2, address?.city, address?.province, address?.postalCode, address?.countryCode]
    .map(textOrUndefined)
    .filter(Boolean)
    .join(", ") || undefined;
}

function buildRouteAddSnapshotOrders(routeGroup, orders) {
  const ordersByAnyId = new Map();
  for (const order of Array.isArray(orders) ? orders : []) {
    for (const key of [order?.orderId, order?.id, order?.name].map(textOrUndefined).filter(Boolean)) {
      ordersByAnyId.set(key, order);
    }
  }

  const assignments = Array.isArray(routeGroup?.assignments) ? routeGroup.assignments : [];
  const sources = assignments.length > 0
    ? assignments
    : getRouteAddSnapshotOrderIds(routeGroup).map((orderId) => ({ orderId }));

  return sources.map((source, index) => {
    const orderId = textOrUndefined(source?.orderId ?? source?.sourceOrderId ?? source?.shopifyOrderGid);
    const order = ordersByAnyId.get(orderId) ?? ordersByAnyId.get(textOrUndefined(source?.orderName)) ?? source?.order ?? null;
    const snapshotSource = order ?? source;
    const coordinates = getRouteAddSnapshotCoordinate(snapshotSource) ?? getRouteAddSnapshotCoordinate(source);
    const label = textOrUndefined(order?.name ?? source?.orderName ?? source?.sourceOrderId ?? orderId) ?? `Order ${index + 1}`;

    return {
      address: getRouteAddSnapshotAddress(snapshotSource) ?? getRouteAddSnapshotAddress(source) ?? "No address loaded",
      coordinates,
      customer: textOrUndefined(snapshotSource?.customer ?? snapshotSource?.recipientName ?? source?.recipientName) ?? "Unknown recipient",
      hasCoordinates: coordinates != null,
      id: orderId ?? textOrUndefined(order?.id) ?? `route-order-${index + 1}`,
      label,
      name: label,
    };
  });
}

function fitRouteAddSnapshotMap(map, maplibregl, locations) {
  const located = locations.filter((location) => location?.hasCoordinates && Array.isArray(location.coordinates));
  if (located.length === 0) return;

  if (located.length === 1) {
    map.jumpTo({ center: located[0].coordinates, zoom: 13 });
    return;
  }

  const bounds = new maplibregl.LngLatBounds(located[0].coordinates, located[0].coordinates);
  for (const location of located.slice(1)) bounds.extend(location.coordinates);
  map.fitBounds(bounds, { duration: 0, maxZoom: 13, padding: 36 });
}

function RouteAddSnapshotMap({ departureLocation, orders }) {
  const mapContainerRef = useRef(null);
  const departureMarkerRef = useRef(null);

  useEffect(() => {
    const mapContainer = mapContainerRef.current;
    if (!mapContainer) return undefined;

    let isMounted = true;
    let snapshotMap = null;
    const locatedOrders = orders.filter((order) => order.hasCoordinates);

    const initializeMap = async () => {
      const [{ default: maplibregl }, { Protocol }] = await Promise.all([
        import("maplibre-gl"),
        import("pmtiles"),
      ]);
      if (!isMounted || !mapContainerRef.current) return;

      installPmtilesProtocol(maplibregl, Protocol);
      snapshotMap = createMapLibreMap(maplibregl, {
        attributionControl: { compact: true },
        center: locatedOrders[0]?.coordinates ?? departureLocation?.coordinates ?? DEFAULT_CENTER,
        cooperativeGestures: false,
        fadeDuration: 0,
        interactive: false,
        scrollZoom: false,
        container: mapContainerRef.current,
        style: OPENFREEMAP_STYLE_URL,
        zoom: locatedOrders.length === 1 ? 13 : INITIAL_HOME_ZOOM,
      });
      installMissingMapImageFallback(snapshotMap);

      snapshotMap.on("load", () => {
        if (!isMounted || !snapshotMap) return;

        if (departureLocation?.hasCoordinates) {
          departureMarkerRef.current = new maplibregl.Marker({
            anchor: "bottom",
            element: createDepartureMarkerElement(departureLocation),
          })
            .setLngLat(departureLocation.coordinates)
            .addTo(snapshotMap);
        }

        syncOrdersMapMarkerLayer(snapshotMap, locatedOrders, locatedOrders.map((order) => order.id));
        fitRouteAddSnapshotMap(snapshotMap, maplibregl, [departureLocation, ...locatedOrders]);
        snapshotMap.resize();
      });
    };

    initializeMap();

    return () => {
      isMounted = false;
      departureMarkerRef.current?.remove();
      departureMarkerRef.current = null;
      snapshotMap?.remove();
    };
  }, [departureLocation, orders]);

  return (
    <div style={routeAddSnapshotMapStyle}>
      <div aria-label="Route group snapshot map" ref={mapContainerRef} style={routeAddSnapshotMapCanvasStyle} />
      {orders.some((order) => order.hasCoordinates) ? null : (
        <span style={routeAddSnapshotEmptyStyle}>No coordinates loaded for this group</span>
      )}
    </div>
  );
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

  if (stateValue === "past_due") return "Past due";

  const deliveryStopStatus = normalizePaymentStatus(order?.deliveryStopStatus);
  if (deliveryStopStatus === "EN_ROUTE") return "En route";
  if (deliveryStopStatus === "ARRIVED") return "Arrived";
  if (deliveryStopStatus === "FAILED") return "Failed";
  if (deliveryStopStatus === "SKIPPED") return "Skipped";
  if (deliveryStopStatus === "CANCELLED") return "Cancelled";

  if (stateValue === "delivered") return "Delivered";
  if (stateValue === "assigned_undelivered") return "Assigned · undelivered";
  if (stateValue === "planned") return "Planned";

  return "Unplanned";
}

function getFirstTextValue(values) {
  for (const value of values) {
    const text = textOrUndefined(value);
    if (text) return text;
  }

  return undefined;
}

function getOrderPaymentStatus(order) {
  return getFirstTextValue([
    order?.paymentStatus,
    order?.rawPayload?.displayFinancialStatus,
    order?.shopifyOrderSnapshot?.displayFinancialStatus,
    order?.financialStatus,
  ]);
}

function getOrderPaymentGatewayNames(order) {
  const gatewayNames =
    [order?.rawPayload?.paymentGatewayNames, order?.shopifyOrderSnapshot?.paymentGatewayNames, order?.paymentGatewayNames]
      .find(Array.isArray) ?? [];

  return gatewayNames.map(textOrUndefined).filter(Boolean);
}

function normalizePaymentStatus(value) {
  return textOrUndefined(value)?.replace(/\s+/g, "_").toUpperCase() ?? "";
}

function getPaymentGatewaySearchValue(value) {
  return String(value ?? "").toLowerCase();
}

function hasCashPaymentGateway(gatewayNames) {
  return gatewayNames.some((gatewayName) => {
    const searchValue = getPaymentGatewaySearchValue(gatewayName);
    return searchValue.includes("cash") || searchValue.includes("cod") || searchValue.includes("현금");
  });
}

function hasETransferPaymentGateway(gatewayNames) {
  return gatewayNames.some((gatewayName) => {
    const searchValue = getPaymentGatewaySearchValue(gatewayName).replace(/[\s_-]+/g, "");
    return searchValue.includes("etransfer") || searchValue.includes("emailtransfer");
  });
}

function formatOrderPaymentState(order) {
  const status = normalizePaymentStatus(getOrderPaymentStatus(order));
  const gatewayNames = getOrderPaymentGatewayNames(order);

  if (status === "PAID") return "Paid";
  if (status === "CASH") return "Cash";
  if (status === "ETRANSFER") return "eTransfer";
  if (hasCashPaymentGateway(gatewayNames)) return "Cash";
  if (hasETransferPaymentGateway(gatewayNames)) return "eTransfer";
  if (status === "PENDING") return "Pending";

  return "Unknown";
}

function getOrderPaymentPillTone(order) {
  const paymentState = formatOrderPaymentState(order);
  if (paymentState === "Paid") return "success";
  if (paymentState === "Cash" || paymentState === "eTransfer") return "warning";
  return "critical";
}

function getOrderPaymentPillDetails(order) {
  const paymentState = formatOrderPaymentState(order);
  if (paymentState === "Paid") return [];

  const gatewayNames = getOrderPaymentGatewayNames(order);
  const reason = paymentState === "Cash" || paymentState === "eTransfer"
    ? `${paymentState} payment needs collection`
    : paymentState === "Pending"
      ? "Payment is pending"
      : "Payment status or gateway is unknown";

  return getUniqueInfoDetails([
    reason,
    formatInfoDetail("Raw payment status", getOrderPaymentStatus(order)) ?? "Raw payment status missing",
    gatewayNames.length > 0 ? `Raw payment gateway: ${gatewayNames.join(", ")}` : "Raw payment gateway missing",
  ]);
}

function getOrderDeliveryStatePillTone(order, referenceDate) {
  const exceptionState = getOrderDeliveryExceptionState(order, referenceDate);

  if (exceptionState === "overdue_assigned") return "warning";
  if (exceptionState === "overdue_unassigned") return "critical";
  if (isShopifyFulfilledWithoutDriverStatus(order)) return "warning";
  if (isOrderDeliveryComplete(order)) return "success";
  if (isOrderRouteCreated(order)) return "success";

  return "neutral";
}

function getOrderDeliveryStateHint(order, referenceDate) {
  const exceptionState = getOrderDeliveryExceptionState(order, referenceDate);

  if (exceptionState === "overdue_assigned") return "Past due: assigned route is not delivered";
  if (exceptionState === "overdue_unassigned") return "Past due: no route assigned";
  if (isShopifyFulfilledWithoutDriverStatus(order)) return "Shopify shows fulfilled, but CLEVER driver status is missing";

  return null;
}

function getOrderDeliveryStatePillDetails(order, referenceDate) {
  const hint = getOrderDeliveryStateHint(order, referenceDate);
  if (!hint) return [];

  return getUniqueInfoDetails([
    hint,
    formatInfoDetail("Delivery date", getOrderDeliveryDateValue(order)),
    isShopifyFulfilledWithoutDriverStatus(order) ? formatInfoDetail("Shopify fulfillment", getOrderShopifyFulfillmentStatus(order)) : undefined,
    isShopifyFulfilledWithoutDriverStatus(order) ? "CLEVER driver status missing" : undefined,
  ]);
}

function getOrderShopifyFulfillmentStatus(order) {
  return textOrUndefined(
    order?.rawPayload?.displayFulfillmentStatus ??
      order?.shopifyOrderSnapshot?.displayFulfillmentStatus ??
      order?.displayFulfillmentStatus ??
      order?.fulfillmentStatus ??
      order?.status,
  );
}

function isShopifyFulfilledWithoutDriverStatus(order) {
  const shopifyStatus = normalizePaymentStatus(getOrderShopifyFulfillmentStatus(order));
  const driverStatus = normalizePaymentStatus(order?.deliveryStopStatus ?? order?.deliveryStatus);

  return shopifyStatus === "FULFILLED" && !driverStatus;
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

function OrdersPageLoading() {
  return (
    <TabLayout
      primary={
        <div aria-busy="true" style={ordersLoadingPanelStyle}>
          <div style={ordersLoadingStatusStyle}>
            <strong>Orders</strong>
            <span>Preparing the map…</span>
          </div>
        </div>
      }
      secondary={
        <div aria-hidden="true" style={ordersLoadingPlanStyle}>
          <div style={{ ...ordersLoadingBlockStyle, width: "70%" }} />
          <div style={{ ...ordersLoadingControlStyle, width: "100%" }} />
          <div style={{ ...ordersLoadingBlockStyle, width: "45%" }} />
          <div style={{ ...ordersLoadingControlStyle, width: "100%" }} />
          <div style={{ ...ordersLoadingControlStyle, width: "100%" }} />
        </div>
      }
      lower={
        <div
          aria-busy="true"
          aria-label="Orders are loading"
          aria-live="polite"
          role="status"
          style={ordersLoadingTableStyle}
        >
          <div aria-hidden="true" style={ordersLoadingControlsStyle}>
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} style={ordersLoadingControlStyle} />
            ))}
          </div>
          <div aria-hidden="true" style={ordersLoadingTableHeaderStyle}>
            <span>Order</span>
            <span>Ordered</span>
            <span>Recipient</span>
            <span>Address</span>
            <span>Items</span>
          </div>
          <div aria-hidden="true">
            {Array.from({ length: 5 }, (_, rowIndex) => (
              <div key={rowIndex} style={ordersLoadingTableRowStyle}>
                {Array.from({ length: 5 }, (_, cellIndex) => (
                  <div
                    key={cellIndex}
                    style={{
                      ...ordersLoadingBlockStyle,
                      width: cellIndex === 3 ? "92%" : `${58 + ((rowIndex + cellIndex) % 3) * 12}%`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          <span style={{ color: "#616161", fontSize: "13px" }}>
            Shopify and delivery data are loading asynchronously. Please wait.
          </span>
        </div>
      }
    />
  );
}

function OrdersPageLoadError() {
  const revalidator = useRevalidator();
  const [automaticRetryPending, setAutomaticRetryPending] = useState(
    () => !ordersLoadAutoRetryAttempted,
  );
  const retrying = automaticRetryPending || revalidator.state !== "idle";

  useEffect(() => {
    if (ordersLoadAutoRetryAttempted) return undefined;

    setAutomaticRetryPending(true);
    const timeoutId = window.setTimeout(() => {
      ordersLoadAutoRetryAttempted = true;
      revalidator.revalidate();
    }, ORDERS_AUTO_RETRY_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [revalidator]);

  return (
    <TabLayout
      primaryExpanded
      primary={
        <div aria-live="assertive" role="alert" style={ordersLoadingPanelStyle}>
          <div style={ordersLoadingStatusStyle}>
            <strong>{retrying ? "Orders are taking longer than usual" : "Orders loading stopped"}</strong>
            <span>
              {retrying
                ? "The first request exceeded 15 seconds. Retrying automatically…"
                : "The automatic retry also did not finish. Retry when ready."}
            </span>
            <button
              type="button"
              disabled={retrying}
              style={{
                ...ordersLoadingRetryButtonStyle,
                ...(retrying ? { cursor: "wait", opacity: 0.55 } : {}),
              }}
              onClick={() => revalidator.revalidate()}
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          </div>
        </div>
      }
    />
  );
}

function OrdersViewDataLoading() {
  return (
    <div aria-label="Shopify orders are loading" style={ordersLoadingPanelStyle}>
      <div style={ordersLoadingStatusStyle}>
        <strong>Shopify orders are loading asynchronously</strong>
        <span>The Inventory list remains available while Orders data is prepared.</span>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { ordersPageData } = useLoaderData();

  return (
    <Suspense fallback={<OrdersPageLoading />}>
      <Await resolve={ordersPageData} errorElement={<OrdersPageLoadError />}>
        {(loaderData) => <OrdersPageContent loaderData={loaderData} />}
      </Await>
    </Suspense>
  );
}

function OrdersPageContent({ loaderData }) {
  const routePlanFetcher = useFetcher();
  const inventoryFetcher = useFetcher();
  const inventoryDeleteFetcher = useFetcher();
  const orderBulkUpdateFetcher = useFetcher();
  const ordersSyncFetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  useEffect(() => {
    ordersLoadAutoRetryAttempted = false;
  }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeOrdersView = searchParams.get("view") === "inventory" ? "inventory" : "orders";
  const { orders, ordersLoaded, inventories, routeGroups, errors, departureLocation, needsSessionTokenRefresh, perf, shopLocalDate } = loaderData;
  const { deliveryCycle, shopTimeZone } = loaderData;
  const [optimisticOrderFilters, setOptimisticOrderFilters] = useState(null);
  const safeOrders = useMemo(
    () => (Array.isArray(orders) ? orders : []),
    [orders],
  );
  const safeInventories = useMemo(
    () => (Array.isArray(inventories) ? inventories : []),
    [inventories],
  );
  const safeRouteGroups = useMemo(
    () => (Array.isArray(routeGroups) ? routeGroups.filter((routeGroup) => routeGroup?.id) : []),
    [routeGroups],
  );
  const syncedOrders = useMemo(
    () => mapCanonicalOrdersToOrderRows(ordersSyncFetcher.data?.syncedOrders),
    [ordersSyncFetcher.data?.syncedOrders],
  );
  const bulkUpdatedOrders = useMemo(
    () => mapCanonicalOrdersToOrderRows(orderBulkUpdateFetcher.data?.updatedOrders),
    [orderBulkUpdateFetcher.data?.updatedOrders],
  );
  const displayOrders = useMemo(
    () => {
      const syncMergedOrders =
        syncedOrders.length > 0
          ? mergeShopifyOrderRowsWithCanonicalRows(safeOrders, syncedOrders)
          : safeOrders;

      return bulkUpdatedOrders.length > 0
        ? mergeShopifyOrderRowsWithCanonicalRows(syncMergedOrders, bulkUpdatedOrders)
        : syncMergedOrders;
    },
    [bulkUpdatedOrders, safeOrders, syncedOrders],
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
  const activeOrderFilters = useMemo(
    () => hasActiveOrderFilters(orderFilters),
    [orderFilters],
  );
  const effectiveOrderFilters = useMemo(
    () =>
      activeOrderFilters
        ? { ...orderFilters, scope: ORDER_HISTORY_SCOPE }
        : orderFilters,
    [activeOrderFilters, orderFilters],
  );
  const orderFilterOptionOrders = useMemo(
    () =>
      activeOrderFilters
        ? filterOrders(displayOrders, {
            ...effectiveOrderFilters,
            tab: "all",
            deliveryArea: "",
            deliveryState: "",
            deliveryWeekday: "",
            orderedDateFrom: "",
            orderedDateTo: "",
            serviceType: "",
            referenceDate: orderFilterReferenceDate,
          })
        : displayOrders,
    [activeOrderFilters, displayOrders, effectiveOrderFilters, orderFilterReferenceDate],
  );
  const orderFilterOptions = useMemo(
    () => ({
      deliveryAreas: getOrderFilterOptions(filterOrders(orderFilterOptionOrders, {
        ...effectiveOrderFilters,
        tab: "all",
        deliveryArea: "",
        referenceDate: orderFilterReferenceDate,
      })).deliveryAreas,
      deliveryWeekdays: getOrderFilterOptions(filterOrders(orderFilterOptionOrders, {
        ...effectiveOrderFilters,
        tab: "all",
        deliveryWeekday: "",
        referenceDate: orderFilterReferenceDate,
      })).deliveryWeekdays,
      deliveryStates: getOrderFilterOptions(filterOrders(orderFilterOptionOrders, {
        ...effectiveOrderFilters,
        tab: "all",
        deliveryState: "",
        referenceDate: orderFilterReferenceDate,
      })).deliveryStates,
      serviceTypes: getOrderFilterOptions(filterOrders(orderFilterOptionOrders, {
        ...effectiveOrderFilters,
        tab: "all",
        serviceType: "",
        referenceDate: orderFilterReferenceDate,
      })).serviceTypes,
    }),
    [orderFilterOptionOrders, effectiveOrderFilters, orderFilterReferenceDate],
  );
  const filteredOrders = useMemo(
    () =>
      activeOrderFilters
        ? filterOrders(displayOrders, {
            ...effectiveOrderFilters,
            tab: "all",
            referenceDate: orderFilterReferenceDate,
          })
        : displayOrders,
    [activeOrderFilters, displayOrders, effectiveOrderFilters, orderFilterReferenceDate],
  );

  useEffect(() => {
    setOptimisticOrderFilters(null);
  }, [searchParams]);

  useEffect(() => {
    if (
      orderBulkUpdateFetcher.state !== "idle" ||
      !orderBulkUpdateFetcher.data?.bulkUpdate ||
      (orderBulkUpdateFetcher.data?.errors ?? []).length > 0
    ) {
      return;
    }

    setOrderActionModalOpen(false);
    setBulkUpdateClientError(null);
    setCheckedOrderIds([]);
  }, [orderBulkUpdateFetcher.data, orderBulkUpdateFetcher.state]);

  const locatedOrders = useMemo(
    () => filteredOrders.filter((order) => order.hasCoordinates),
    [filteredOrders],
  );
  const [createRouteClientError, setCreateRouteClientError] = useState(null);
  const [createInventoryClientError, setCreateInventoryClientError] = useState(null);
  const [bulkUpdateClientError, setBulkUpdateClientError] = useState(null);
  const actionErrors = createRouteClientError
    ? [{ message: createRouteClientError }]
    : createInventoryClientError
      ? [{ message: createInventoryClientError }]
      : bulkUpdateClientError
        ? [{ message: bulkUpdateClientError }]
        : orderBulkUpdateFetcher.data?.errors?.length
          ? orderBulkUpdateFetcher.data
          : routePlanFetcher.data?.errors?.length
        ? routePlanFetcher.data
        : inventoryDeleteFetcher.data?.errors?.length
          ? inventoryDeleteFetcher.data
          : inventoryFetcher.data;
  const orderPageNoticeMessage = getServiceErrorNotice([
    actionErrors,
    { errors },
  ], { context: "orders_page" });
  const isCreatingRoute = routePlanFetcher.state !== "idle";
  const isCreatingInventory = inventoryFetcher.state !== "idle";
  const isDeletingInventory = inventoryDeleteFetcher.state !== "idle";
  const isBulkUpdatingOrders = orderBulkUpdateFetcher.state !== "idle";
  const [inventorySubmitAction, setInventorySubmitAction] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(
    filteredOrders[0]?.id ?? null,
  );
  const [hoveredItemPopoverOrderId, setHoveredItemPopoverOrderId] = useState(null);
  const [pinnedItemPopoverOrderId, setPinnedItemPopoverOrderId] = useState(null);
  const [hoveredNoteOrderId, setHoveredNoteOrderId] = useState(null);
  const [pinnedNoteOrderId, setPinnedNoteOrderId] = useState(null);
  const [itemPopoverPosition, setItemPopoverPosition] = useState(null);
  const [notePopoverPosition, setNotePopoverPosition] = useState(null);
  const [activeOrderDetailPopover, setActiveOrderDetailPopover] = useState(null);
  const [checkedInventoryIds, setCheckedInventoryIds] = useState([]);
  const [checkedOrderIds, setCheckedOrderIds] = useState([]);
  const [plannedOrderIds, setPlannedOrderIds] = useState([]);
  const [orderActionModalOpen, setOrderActionModalOpen] = useState(false);
  const [orderActionField, setOrderActionField] = useState("state");
  const [orderActionValue, setOrderActionValue] = useState(ORDER_STATE_CHANGE_OPTIONS[0].value);
  const [activeOrderDataOrderId, setActiveOrderDataOrderId] = useState(null);
  const [orderDataDraft, setOrderDataDraft] = useState(() => getOrderDataDraft(null));
  const [routePlanTitle, setRoutePlanTitle] = useState(DEFAULT_ROUTE_PLAN_TITLE);
  const [routeAssignActionsOpen, setRouteAssignActionsOpen] = useState(false);
  const [routeAddModalOpen, setRouteAddModalOpen] = useState(false);
  const [inventoryAssignActionsOpen, setInventoryAssignActionsOpen] = useState(false);
  const [selectedRouteGroupId, setSelectedRouteGroupId] = useState("");
  const [activeOrderPopupId, setActiveOrderPopupId] = useState(null);
  const [sortConfig, setSortConfig] = useState(null);
  const [tableColumnWidths, setTableColumnWidths] = useState(DEFAULT_TABLE_COLUMN_WIDTHS);
  const [lockedTableWidth, setLockedTableWidth] = useState(null);
  const tableRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapLibraryRef = useRef(null);
  const mapRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const markersRef = useRef([]);
  const mapRecoveryTimerRef = useRef(null);
  const mapRecoveryAttemptsRef = useRef(0);
  const mapSourceSyncRetryTimerRef = useRef(null);
  const mapSourceSyncRetryAttemptsRef = useRef(0);
  const mapSourceSyncPendingRef = useRef(false);
  const initialMapFitAppliedRef = useRef(false);
  const initialMapCenterRef = useRef(DEFAULT_CENTER);
  const initialPerfEmittedRef = useRef(false);
  const ordersLoadRequestedRef = useRef(false);
  const pendingOrdersViewNavigationRef = useRef(null);
  const initialRenderStartedAtRef = useRef(getSafePerformanceNow());
  const submittedRouteSessionTokenRef = useRef(null);
  const submittedInventorySessionTokenRef = useRef(null);
  const orderSyncSubmittedRef = useRef(false);
  const sessionTokenRefreshSubmittedRef = useRef(false);
  const orderedDateCalendarRef = useRef(null);
  const orderedDateFieldRef = useRef(null);
  const itemPopoverAnchorRef = useRef(null);
  const itemPopoverRef = useRef(null);
  const notePopoverAnchorRef = useRef(null);
  const notePopoverRef = useRef(null);
  const orderDetailAnchorRef = useRef(null);
  const orderDetailPopoverRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapRenderKey, setMapRenderKey] = useState(0);
  const [mapSourceSyncRequest, setMapSourceSyncRequest] = useState(0);
  const [mapStatus, setMapStatus] = useState("idle");
  const [isMapWide, setIsMapWide] = useState(false);
  const [planFitRequest, setPlanFitRequest] = useState(0);
  const [selectedOrderFocusRequest, setSelectedOrderFocusRequest] = useState(0);
  const [orderedDateCalendarOpen, setOrderedDateCalendarOpen] = useState(false);
  const [pendingOrderedDateStart, setPendingOrderedDateStart] = useState("");
  const [orderedDateCalendarMonth, setOrderedDateCalendarMonth] = useState(() =>
    getCalendarMonthValue(shopLocalDate),
  );
  const [orderedDateCalendarPosition, setOrderedDateCalendarPosition] = useState(null);
  const orderedDateLabel = formatOrderDateRangeLabel(
    orderFilters.orderedDateFrom,
    orderFilters.orderedDateTo,
  );
  const orderedDateFilterActive = Boolean(orderFilters.orderedDateFrom || orderFilters.orderedDateTo);
  const visibleItemPopoverOrderId = pinnedItemPopoverOrderId ?? hoveredItemPopoverOrderId;
  const visibleNoteOrderId = pinnedNoteOrderId ?? hoveredNoteOrderId;
  const syncItemPopover = useCallback(() => {
    const anchor = itemPopoverAnchorRef.current;
    if (!anchor) return;

    const popoverNode = itemPopoverRef.current;
    setItemPopoverPosition({
      ...getOrderDetailPopoverPosition(anchor.getBoundingClientRect(), {
        height: popoverNode?.offsetHeight ?? ITEM_POPOVER_HEIGHT,
        width: popoverNode?.offsetWidth ?? ITEM_POPOVER_WIDTH,
      }),
      measured: true,
    });
  }, []);
  const openItemPopover = useCallback((event, orderId) => {
    if (pinnedItemPopoverOrderId && pinnedItemPopoverOrderId !== orderId) return;

    itemPopoverAnchorRef.current = event.currentTarget;
    setHoveredItemPopoverOrderId(orderId);
    setItemPopoverPosition({
      ...getOrderDetailPopoverPosition(event.currentTarget.getBoundingClientRect(), {
        height: ITEM_POPOVER_HEIGHT,
        width: ITEM_POPOVER_WIDTH,
      }),
      measured: false,
    });
  }, [pinnedItemPopoverOrderId]);
  const closeHoveredItemPopover = useCallback((orderId) => {
    setHoveredItemPopoverOrderId((currentOrderId) => currentOrderId === orderId ? null : currentOrderId);
  }, []);
  const togglePinnedItemPopover = useCallback((event, orderId) => {
    itemPopoverAnchorRef.current = event.currentTarget;
    setItemPopoverPosition({
      ...getOrderDetailPopoverPosition(event.currentTarget.getBoundingClientRect(), {
        height: ITEM_POPOVER_HEIGHT,
        width: ITEM_POPOVER_WIDTH,
      }),
      measured: false,
    });
    setPinnedItemPopoverOrderId((currentOrderId) => currentOrderId === orderId ? null : orderId);
  }, []);
  const syncNotePopover = useCallback(() => {
    const anchor = notePopoverAnchorRef.current;
    if (!anchor) return;

    const popoverNode = notePopoverRef.current;
    setNotePopoverPosition(getRightPopoverPosition(anchor.getBoundingClientRect(), {
      height: popoverNode?.offsetHeight ?? NOTE_POPOVER_HEIGHT,
      width: popoverNode?.offsetWidth ?? NOTE_POPOVER_WIDTH,
    }));
  }, []);
  const openNotePopover = useCallback((event, orderId) => {
    if (pinnedNoteOrderId && pinnedNoteOrderId !== orderId) return;
    notePopoverAnchorRef.current = event.currentTarget;
    setHoveredNoteOrderId(orderId);
    setNotePopoverPosition(getRightPopoverPosition(event.currentTarget.getBoundingClientRect()));
  }, [pinnedNoteOrderId]);
  const closeHoveredNotePopover = useCallback((orderId) => {
    setHoveredNoteOrderId((currentOrderId) => currentOrderId === orderId ? null : currentOrderId);
  }, []);
  const togglePinnedNotePopover = useCallback((event, orderId) => {
    notePopoverAnchorRef.current = event.currentTarget;
    setNotePopoverPosition(getRightPopoverPosition(event.currentTarget.getBoundingClientRect()));
    setPinnedNoteOrderId((currentOrderId) => currentOrderId === orderId ? null : orderId);
  }, []);
  const activeOrderDetailKey = activeOrderDetailPopover?.detailKey;
  const syncOrderDetailPopover = useCallback(() => {
    const anchor = orderDetailAnchorRef.current;
    if (!anchor) return;

    const popoverNode = orderDetailPopoverRef.current;
    const position = getOrderDetailPopoverPosition(anchor.getBoundingClientRect(), {
      height: popoverNode?.offsetHeight,
      width: popoverNode?.offsetWidth,
    });
    setActiveOrderDetailPopover((current) => current ? {
      ...current,
      position: {
        ...position,
        measured: true,
      },
    } : current);
  }, []);
  const openOrderDetailPopover = useCallback((event, detail) => {
    orderDetailAnchorRef.current = event.currentTarget;
    setActiveOrderDetailPopover({
      ...detail,
      position: {
        ...getOrderDetailPopoverPosition(event.currentTarget.getBoundingClientRect()),
        measured: false,
      },
    });
  }, []);
  const closeOrderDetailPopover = useCallback((detailKey) => {
    setActiveOrderDetailPopover((current) => {
      if (current?.detailKey !== detailKey) return current;
      orderDetailAnchorRef.current = null;
      return null;
    });
  }, []);

  useEffect(() => {
    if (!activeOrderDetailKey) return undefined;

    syncOrderDetailPopover();
    const handleWindowLayoutChange = () => syncOrderDetailPopover();
    window.addEventListener("scroll", handleWindowLayoutChange, true);
    window.addEventListener("resize", handleWindowLayoutChange);
    return () => {
      window.removeEventListener("scroll", handleWindowLayoutChange, true);
      window.removeEventListener("resize", handleWindowLayoutChange);
    };
  }, [activeOrderDetailKey, syncOrderDetailPopover]);

  useEffect(() => {
    if (!visibleItemPopoverOrderId) return undefined;

    syncItemPopover();
    const handleWindowLayoutChange = () => syncItemPopover();
    window.addEventListener("scroll", handleWindowLayoutChange, true);
    window.addEventListener("resize", handleWindowLayoutChange);
    return () => {
      window.removeEventListener("scroll", handleWindowLayoutChange, true);
      window.removeEventListener("resize", handleWindowLayoutChange);
    };
  }, [syncItemPopover, visibleItemPopoverOrderId]);

  useEffect(() => {
    if (!visibleNoteOrderId) return undefined;

    syncNotePopover();
    const handleWindowLayoutChange = () => syncNotePopover();
    window.addEventListener("scroll", handleWindowLayoutChange, true);
    window.addEventListener("resize", handleWindowLayoutChange);
    return () => {
      window.removeEventListener("scroll", handleWindowLayoutChange, true);
      window.removeEventListener("resize", handleWindowLayoutChange);
    };
  }, [syncNotePopover, visibleNoteOrderId]);

  const renderDetailPill = ({ children, details, detailKey, interactive = false, label, tone }) => {
    const showDetails = details.length > 0 && (interactive || isAttentionPillTone(tone));
    if (!showDetails) {
      return <InfoPill title="" tone={tone}>{children}</InfoPill>;
    }

    const activeDetailPopover = activeOrderDetailPopover?.detailKey === detailKey ? activeOrderDetailPopover : null;

    return (
      <span
        aria-label={formatInfoPillTitle(label, details)}
        data-order-detail-popover-root="true"
        style={detailPillRootStyle}
        onMouseEnter={(event) => openOrderDetailPopover(event, { detailKey, details, label })}
        onMouseLeave={() => closeOrderDetailPopover(detailKey)}
      >
        <InfoPill title="" tone={tone}>
          {children}
        </InfoPill>
        {activeDetailPopover && typeof document !== "undefined" ? createPortal(
          <div
            ref={orderDetailPopoverRef}
            role="tooltip"
            style={{
              ...detailPopoverStyle,
              left: `${Math.round(activeDetailPopover.position.left)}px`,
              top: `${Math.round(activeDetailPopover.position.top)}px`,
              visibility: activeDetailPopover.position.measured ? "visible" : "hidden",
              width: `${Math.round(activeDetailPopover.position.width)}px`,
            }}
          >
            <div style={itemPopoverTitleStyle}>{activeDetailPopover.label}</div>
            <ul style={detailPopoverListStyle}>
              {activeDetailPopover.details.map((detail) => (
                <li key={detail} style={detailPopoverItemStyle}>{detail}</li>
              ))}
            </ul>
          </div>,
          document.body,
        ) : null}
      </span>
    );
  };
  const orderedDateCalendarDays = useMemo(
    () => getCalendarDays(orderedDateCalendarMonth),
    [orderedDateCalendarMonth],
  );
  const checkedInventoryIdSet = useMemo(
    () => new Set(checkedInventoryIds),
    [checkedInventoryIds],
  );
  const visibleInventoryIds = useMemo(
    () => safeInventories.map((inventory) => inventory.id).filter(Boolean),
    [safeInventories],
  );
  const allVisibleInventoriesChecked =
    visibleInventoryIds.length > 0 &&
    visibleInventoryIds.every((inventoryId) => checkedInventoryIdSet.has(inventoryId));
  const inventoryDeleteDisabled = checkedInventoryIds.length === 0 || isDeletingInventory;
  const handleOrdersViewChange = useCallback((nextView) => {
    if (nextView === activeOrdersView) return;

    pendingOrdersViewNavigationRef.current = {
      fromView: activeOrdersView,
      startedAt: getSafePerformanceNow(),
      toView: nextView,
    };
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextView === "inventory") {
      nextSearchParams.set("view", "inventory");
    } else {
      nextSearchParams.delete("view");
    }

    setSearchParams(nextSearchParams, { preventScrollReset: true, replace: true });
  }, [activeOrdersView, searchParams, setSearchParams]);

  useEffect(() => {
    const pendingNavigation = pendingOrdersViewNavigationRef.current;
    const navigationMetric = buildOrdersViewNavigationMetric({
      activeOrdersView,
      observedAt: getSafePerformanceNow(),
      pendingNavigation,
    });
    if (!navigationMetric) return;

    emitPerformanceMetric(navigationMetric);
    pendingOrdersViewNavigationRef.current = null;
  }, [activeOrdersView]);

  useEffect(() => {
    if (ordersLoaded) {
      ordersLoadRequestedRef.current = false;
      return;
    }
    const shouldRequestOrders = shouldRequestOrdersData({
      activeOrdersView,
      ordersLoaded,
      requestPending: ordersLoadRequestedRef.current,
      revalidationState: revalidator.state,
    });
    if (!shouldRequestOrders) return;

    ordersLoadRequestedRef.current = true;
    revalidator.revalidate();
  }, [activeOrdersView, ordersLoaded, revalidator]);
  const openInventoryDetail = useCallback((inventoryId) => {
    if (!inventoryId) return;
    navigate(`/app/orders/inventory?id=${encodeURIComponent(inventoryId)}`);
  }, [navigate]);
  const handleInventoryRowKeyDown = useCallback((event, inventory) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openInventoryDetail(inventory.id);
  }, [openInventoryDetail]);
  const toggleInventoryCheck = useCallback((inventoryId) => {
    if (!inventoryId) return;
    setCheckedInventoryIds((currentInventoryIds) =>
      currentInventoryIds.includes(inventoryId)
        ? currentInventoryIds.filter((currentInventoryId) => currentInventoryId !== inventoryId)
        : [...currentInventoryIds, inventoryId],
    );
  }, []);
  const toggleAllVisibleInventoryChecks = useCallback(() => {
    setCheckedInventoryIds((currentInventoryIds) => {
      const visibleInventoryIdSet = new Set(visibleInventoryIds);
      if (visibleInventoryIdSet.size === 0) return currentInventoryIds;

      const allChecked = visibleInventoryIds.every((inventoryId) => currentInventoryIds.includes(inventoryId));
      return allChecked
        ? currentInventoryIds.filter((inventoryId) => !visibleInventoryIdSet.has(inventoryId))
        : [...new Set([...currentInventoryIds, ...visibleInventoryIds])];
    });
  }, [visibleInventoryIds]);

  const handleDeleteSelectedInventories = useCallback(async () => {
    if (inventoryDeleteDisabled) return;

    const formData = new FormData();
    formData.set("_intent", "deleteInventory");
    formData.set("inventoryIds", JSON.stringify(checkedInventoryIds));

    try {
      formData.set("shopifySessionToken", await shopify.idToken());
    } catch {
      // The server action still returns an auth error when the token cannot be fetched.
    }

    inventoryDeleteFetcher.submit(formData, { method: "post" });
  }, [checkedInventoryIds, inventoryDeleteDisabled, inventoryDeleteFetcher, shopify]);

  const ordersViewTabs = (
    <div style={ordersViewTabsRowStyle}>
      <div aria-label="Orders view tabs" style={ordersViewTabBarStyle}>
        <button
          type="button"
          style={activeOrdersView === "orders" ? activeOrdersViewTabButtonStyle : ordersViewTabButtonStyle}
          onClick={() => handleOrdersViewChange("orders")}
        >Orders</button>
        <button
          type="button"
          style={activeOrdersView === "inventory" ? activeOrdersViewTabButtonStyle : ordersViewTabButtonStyle}
          onClick={() => handleOrdersViewChange("inventory")}
        >Inventory</button>
      </div>
      {activeOrdersView === "inventory" ? (
        <button
          type="button"
          style={inventoryDeleteDisabled ? disabledPlanButtonStyle : inventoryDeleteButtonStyle}
          disabled={inventoryDeleteDisabled}
          onClick={handleDeleteSelectedInventories}
        >Delete</button>
      ) : null}
    </div>
  );

  const ordersLayoutNotice = (
    <div style={{ display: "grid", gap: "8px" }}>
      {orderPageNoticeMessage ? (
        <div className="orders-error-filter" role="alert" style={orderPageNoticeStyle}>
          {orderPageNoticeMessage}
        </div>
      ) : null}
      {ordersViewTabs}
    </div>
  );

  const inventoryList = (
    <div style={inventoryListStyle}>
      <div style={inventoryTableWrapStyle}>
        <table aria-label="Inventory list" style={inventoryTableStyle}>
          <colgroup>
            {INVENTORY_TABLE_COLUMN_WIDTHS.map((width, columnIndex) => (
              <col key={columnIndex} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" style={inventoryCheckboxHeaderCellStyle}>
                <input
                  type="checkbox"
                  aria-label="Select all visible inventories"
                  checked={allVisibleInventoriesChecked}
                  disabled={visibleInventoryIds.length === 0}
                  style={inventoryCheckboxStyle}
                  onChange={toggleAllVisibleInventoryChecks}
                />
              </th>
              <th scope="col" style={inventoryHeaderCellStyle}>Inventory</th>
              <th scope="col" style={inventoryHeaderCellStyle}>Order count</th>
              <th scope="col" style={inventoryHeaderCellStyle}>Item count</th>
              <th scope="col" style={inventoryHeaderCellStyle}>Delta summary</th>
              <th scope="col" style={inventoryHeaderCellStyle}>Changed time</th>
            </tr>
          </thead>
          <tbody>
            {safeInventories.length === 0 ? (
              <tr>
                <td colSpan={INVENTORY_TABLE_COLUMN_WIDTHS.length} style={inventoryCellStyle}>Inventory가 없습니다.</td>
              </tr>
            ) : safeInventories.map((inventory) => (
              <tr
                key={inventory.id}
                aria-label={`Open ${inventory.name ?? "inventory"} detail`}
                className="route-table-row"
                onClick={() => openInventoryDetail(inventory.id)}
                onKeyDown={(event) => handleInventoryRowKeyDown(event, inventory)}
                role="link"
                tabIndex={0}
              >
                <td style={inventoryCheckboxCellStyle}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${inventory.name ?? "inventory"} for deletion`}
                    checked={Boolean(inventory.id && checkedInventoryIdSet.has(inventory.id))}
                    disabled={!inventory.id}
                    style={inventoryCheckboxStyle}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    onChange={() => toggleInventoryCheck(inventory.id)}
                  />
                </td>
                <td style={inventoryNameCellStyle}>{inventory.name}</td>
                <td style={inventoryCellStyle}>{inventory.ordersCount ?? inventory.orderIds?.length ?? inventory.orders?.length ?? 0}</td>
                <td style={inventoryCellStyle}>{inventory.itemSummary?.totalQuantity ?? 0}</td>
                <td style={inventoryCellStyle}>{formatInventoryDeltaSummary(inventory)}</td>
                <td style={inventoryCellStyle}>{formatInventoryChangedAt(inventory.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
  const tableWidth = lockedTableWidth ? `max(100%, ${lockedTableWidth}px)` : "100%";
  const checkedOrders = useMemo(
    () => checkedOrderIds.map((orderId) => displayOrderById.get(orderId)).filter(Boolean),
    [checkedOrderIds, displayOrderById],
  );
  const checkedServerOrderIds = useMemo(
    () => checkedOrders.map((order) => order.orderId).filter(Boolean),
    [checkedOrders],
  );
  const orderDataReviewRows = useMemo(
    () => checkedOrders
      .map((order) => ({ order, reasons: getOrderDataIssueReasons(order, plannedOrderIdSet) }))
      .filter((row) => row.reasons.length > 0),
    [checkedOrders, plannedOrderIdSet],
  );
  const pillOrderDataOrder = activeOrderDataOrderId && checkedOrders.length === 0
    ? displayOrderById.get(activeOrderDataOrderId) ?? null
    : null;
  const orderDataRows = orderDataReviewRows.length > 0
    ? orderDataReviewRows
    : checkedOrders.length > 0
      ? checkedOrders.map((order) => ({ order, reasons: ["Selected"] }))
      : pillOrderDataOrder
        ? [{ order: pillOrderDataOrder, reasons: getOrderDataIssueReasons(pillOrderDataOrder, plannedOrderIdSet) }]
        : [];
  const activeOrderDataOrder = activeOrderDataOrderId
    ? orderDataRows.find((row) => row.order.id === activeOrderDataOrderId)?.order ?? orderDataRows[0]?.order ?? null
    : orderDataRows[0]?.order ?? null;
  const activeOrderDataReasons = activeOrderDataOrder
    ? orderDataRows.find((row) => row.order.id === activeOrderDataOrder.id)?.reasons ?? []
    : [];
  const activeOrderRawNote = activeOrderDataOrder ? getOrderNote(activeOrderDataOrder) : undefined;
  const activeOrderNoteHint = activeOrderDataOrder ? getOrderNoteDeliveryHint(activeOrderDataOrder) : undefined;
  const activeOrderAreaSuggestion = useMemo(
    () => getOrderAreaSuggestion(activeOrderDataOrder, displayOrders),
    [activeOrderDataOrder, displayOrders],
  );
  const selectedRouteGroup = useMemo(
    () => safeRouteGroups.find((routeGroup) => routeGroup.id === selectedRouteGroupId) ?? safeRouteGroups[0] ?? null,
    [safeRouteGroups, selectedRouteGroupId],
  );
  const routeAddSnapshotOrders = useMemo(
    () => buildRouteAddSnapshotOrders(selectedRouteGroup, displayOrders),
    [displayOrders, selectedRouteGroup],
  );
  const orderActionValueOptions =
    orderActionField === "state" ? ORDER_STATE_CHANGE_OPTIONS : ORDER_PAYMENT_CHANGE_OPTIONS;
  const isOrderDataAction = orderActionField === ORDER_DATA_FIX_ACTION;

  const plannedOrders = useMemo(() => {
    return plannedOrderIds
      .map((orderId) => displayOrderById.get(orderId))
      .filter(Boolean);
  }, [displayOrderById, plannedOrderIds]);

  const activeOrderPopup = activeOrderPopupId
    ? displayOrderById.get(activeOrderPopupId) ?? null
    : null;
  const activeOrderPopupPlannedIndex = activeOrderPopup
    ? plannedOrderIds.indexOf(activeOrderPopup.id) + 1
    : 0;
  const activeOrderPopupItems = activeOrderPopup ? getOrderLineItems(activeOrderPopup) : [];
  const activeOrderPopupShopifyUrl = activeOrderPopup ? getShopifyAdminOrderUrl(activeOrderPopup) : null;
  const activeOrderPopupMetaValues = activeOrderPopup
    ? [activeOrderPopup.deliveryArea, formatOrderDeliveryLabel(activeOrderPopup)].filter(Boolean)
    : [];

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
  const addToRouteDisabled = createRouteDisabled || safeRouteGroups.length === 0;
  const createInventoryDisabled = plannedOrders.length === 0 || isCreatingInventory;

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

  const setActiveOrderPopup = useCallback((orderId) => {
    setActiveOrderPopupId(orderId);
    if (isMapReady && mapRef.current) {
      syncOrdersMapMarkerLayer(mapRef.current, locatedOrders, plannedOrderIds, orderId);
    }
  }, [isMapReady, locatedOrders, plannedOrderIds]);

  const handleSelectOrder = useCallback((orderId, options = {}) => {
    setSelectedOrderId(orderId);
    setActiveOrderPopup(orderId);

    if (options.focusMap !== false) {
      setSelectedOrderFocusRequest((requestCount) => requestCount + 1);
    }
  }, [setActiveOrderPopup]);

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
    const minDelta = getTableColumnMinWidth(tableElement, columnIndex) - leftStartWidth;
    const maxDelta = rightStartWidth - getTableColumnMinWidth(tableElement, rightColumnIndex);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent) => {
      const rawDelta = Math.round(moveEvent.clientX - startX);
      const delta = Math.min(Math.max(rawDelta, minDelta), maxDelta);

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
    const minDelta = getTableColumnMinWidth(tableElement, columnIndex) - leftStartWidth;
    const maxDelta = rightStartWidth - getTableColumnMinWidth(tableElement, rightColumnIndex);
    const delta = Math.min(Math.max(rawDelta, minDelta), maxDelta);

    setLockedTableWidth(measuredTableWidth);
    setTableColumnWidths(
      startWidths.map((width, widthIndex) => {
        if (widthIndex === columnIndex) return leftStartWidth + delta;
        if (widthIndex === rightColumnIndex) return rightStartWidth - delta;
        return width;
      }),
    );
  };

  useEffect(() => {
    const tableElement = tableRef.current;
    if (!tableElement) return;

    const { tableWidth: measuredTableWidth, widths } = getTableColumnPixelState(tableElement);
    const pillMinWidths = getTableColumnPillMinWidths(tableElement, widths.length);
    const nextWidths = widths.map((width, columnIndex) => {
      const pillMinWidth = pillMinWidths[columnIndex];
      return pillMinWidth == null ? width : Math.max(width, pillMinWidth);
    });
    const nextTableWidth = Math.max(
      measuredTableWidth,
      nextWidths.reduce((total, width) => total + width, 0),
    );

    if (
      nextTableWidth !== measuredTableWidth ||
      nextWidths.some((width, columnIndex) => width !== widths[columnIndex])
    ) {
      setLockedTableWidth(nextTableWidth);
      setTableColumnWidths(nextWidths);
    }
  }, [tableOrders]);

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
      setOrderedDateCalendarPosition(null);
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
    const rect = orderedDateFieldRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = 238;
    setOrderedDateCalendarPosition({
      left: Math.max(
        window.scrollX + 8,
        Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - width - 8),
      ),
      top: rect.bottom + window.scrollY + 4,
    });
  }, []);

  const handleOrderedDateCalendarOpen = () => {
    if (orderedDateCalendarOpen) {
      setOrderedDateCalendarOpen(false);
      setOrderedDateCalendarPosition(null);
      return;
    }

    positionOrderedDateCalendar();
    setOrderedDateCalendarMonth(
      getCalendarMonthValue(orderFilters.orderedDateFrom || shopLocalDate),
    );
    setOrderedDateCalendarOpen(true);
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
    setOrderedDateCalendarPosition(null);
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
    if (!pinnedNoteOrderId) return undefined;

    const handleDocumentPointerDown = (event) => {
      if (event.target?.closest?.('[data-order-notes-popover-root="true"]')) return;
      setPinnedNoteOrderId(null);
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, [pinnedNoteOrderId]);

  useEffect(() => {
    if (!orderedDateCalendarOpen) return undefined;

    const handleDocumentPointerDown = (event) => {
      if (orderedDateCalendarRef.current?.contains(event.target)) return;
      if (orderedDateFieldRef.current?.contains(event.target)) return;

      if (pendingOrderedDateStart) {
        applyOrderedDateRange(pendingOrderedDateStart, pendingOrderedDateStart);
      }

      setPendingOrderedDateStart("");
      setOrderedDateCalendarOpen(false);
      setOrderedDateCalendarPosition(null);
    };
    const handleWindowLayoutChange = () => positionOrderedDateCalendar();

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    window.addEventListener("resize", handleWindowLayoutChange);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      window.removeEventListener("resize", handleWindowLayoutChange);
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
    setOrderedDateCalendarPosition(null);

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

  const clearMapSourceSyncRetryTimer = useCallback(() => {
    if (!mapSourceSyncRetryTimerRef.current) return;

    window.clearTimeout(mapSourceSyncRetryTimerRef.current);
    mapSourceSyncRetryTimerRef.current = null;
  }, []);

  const requestMapSourceSync = useCallback((trigger) => {
    if (!mapSourceSyncPendingRef.current) return;
    if (mapSourceSyncRetryAttemptsRef.current >= MAX_MAP_SOURCE_SYNC_RETRY_ATTEMPTS) {
      mapSourceSyncPendingRef.current = false;
      return;
    }

    mapSourceSyncPendingRef.current = false;
    mapSourceSyncRetryAttemptsRef.current += 1;
    clearMapSourceSyncRetryTimer();

    const map = mapRef.current;
    let styleLoaded = null;
    try {
      styleLoaded = map?.isStyleLoaded?.() ?? null;
    } catch {
      styleLoaded = false;
    }

    emitPerformanceMetric({
      name: "orders.maplibre.source_retry",
      category: "maplibre-source-retry",
      trigger,
      retryAttemptCount: mapSourceSyncRetryAttemptsRef.current,
      mapLoaded: mapLoadedRef.current,
      styleLoaded,
    });
    setMapSourceSyncRequest((requestCount) => requestCount + 1);
  }, [clearMapSourceSyncRetryTimer]);

  const scheduleMapSourceSyncRetry = useCallback(() => {
    if (mapSourceSyncRetryTimerRef.current) return;

    if (mapSourceSyncRetryAttemptsRef.current >= MAX_MAP_SOURCE_SYNC_RETRY_ATTEMPTS) {
      return;
    }

    mapSourceSyncRetryTimerRef.current = window.setTimeout(() => {
      mapSourceSyncRetryTimerRef.current = null;
      requestMapSourceSync("timer");
    }, MAP_SOURCE_SYNC_RETRY_DELAY_MS);
  }, [requestMapSourceSync]);

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
    clearMapSourceSyncRetryTimer();
    mapRecoveryAttemptsRef.current = 0;
    mapSourceSyncRetryAttemptsRef.current = 0;
    mapSourceSyncPendingRef.current = false;
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


  const toggleOrderCheck = (orderId, checked) => {
    if (plannedOrderIdSet.has(orderId)) return;

    setCheckedOrderIds((currentOrderIds) => checked
      ? Array.from(new Set([...currentOrderIds, orderId]))
      : currentOrderIds.filter((selectedOrderId) => selectedOrderId !== orderId));
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
    setCreateInventoryClientError(null);
    setPlanFitRequest((requestCount) => requestCount + 1);
  };

  const selectOrderDataOrder = useCallback((order) => {
    if (!order) return;
    setActiveOrderDataOrderId(order.id);
    setOrderDataDraft(getOrderDataDraft(order));
  }, []);

  useEffect(() => {
    if (!isOrderDataAction) return;
    if (!activeOrderDataOrder) return;
    if (activeOrderDataOrder.id === activeOrderDataOrderId) return;
    selectOrderDataOrder(activeOrderDataOrder);
  }, [activeOrderDataOrder, activeOrderDataOrderId, isOrderDataAction, selectOrderDataOrder]);

  const handleOrderActionFieldChange = (field) => {
    setOrderActionField(field);
    if (field === ORDER_DATA_FIX_ACTION) {
      selectOrderDataOrder(orderDataRows[0]?.order);
      setOrderActionValue("");
      return;
    }

    setOrderActionValue(
      field === "state"
        ? ORDER_STATE_CHANGE_OPTIONS[0].value
        : ORDER_PAYMENT_CHANGE_OPTIONS[0].value,
    );
  };

  const handleOpenOrderAction = () => {
    if (checkedOrderIds.length === 0) return;
    setBulkUpdateClientError(null);
    setOrderActionModalOpen(true);
    if (orderActionField === ORDER_DATA_FIX_ACTION) selectOrderDataOrder(orderDataRows[0]?.order);
  };

  const handleOpenOrderDataAction = (order) => {
    setBulkUpdateClientError(null);
    setCheckedOrderIds([]);
    setOrderActionField(ORDER_DATA_FIX_ACTION);
    setOrderActionValue("");
    selectOrderDataOrder(order);
    setOrderActionModalOpen(true);
  };

  const handleOrderDataDraftChange = (field, value) => {
    setOrderDataDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const handleSaveOrderAction = async () => {
    if (isBulkUpdatingOrders) return;

    const formData = new FormData();
    const sessionToken = await shopify.idToken();

    if (orderActionField === ORDER_DATA_FIX_ACTION) {
      if (!activeOrderDataOrder?.orderId) {
        setBulkUpdateClientError("서버에 저장된 주문만 변경할 수 있습니다. 주문 동기화 후 다시 시도해주세요.");
        return;
      }

      formData.set("_intent", "patchOrderData");
      formData.set("orderId", activeOrderDataOrder.orderId);
      formData.set("deliveryDate", orderDataDraft.deliveryDate.replaceAll(".", "-"));
      formData.set("deliveryArea", orderDataDraft.deliveryArea);
      formData.set("shopifySessionToken", sessionToken);
      orderBulkUpdateFetcher.submit(formData, { method: "post" });
      return;
    }

    if (checkedServerOrderIds.length === 0) {
      setBulkUpdateClientError("서버에 저장된 주문만 변경할 수 있습니다. 주문 동기화 후 다시 시도해주세요.");
      return;
    }

    formData.set("_intent", "bulkUpdateOrders");
    formData.set("field", orderActionField);
    formData.set("value", orderActionValue);
    formData.set("orderIds", JSON.stringify(checkedServerOrderIds));
    formData.set("shopifySessionToken", sessionToken);
    orderBulkUpdateFetcher.submit(formData, { method: "post" });
  };

  const handleClearPlan = () => {
    setPlannedOrderIds([]);
    setRoutePlanTitle(DEFAULT_ROUTE_PLAN_TITLE);
    setRouteAssignActionsOpen(false);
    setRouteAddModalOpen(false);
    setInventoryAssignActionsOpen(false);
    setCreateInventoryClientError(null);
  };

  const handleZoomToPlanned = () => {
    fitMapToOrders(routeFitLocations);
  };

  const handleToggleRouteAssignActions = () => {
    if (createRouteDisabled) return;

    setRouteAssignActionsOpen((isOpen) => !isOpen);
  };

  const handleOpenAddRoutePreview = () => {
    if (addToRouteDisabled) return;

    if (!selectedRouteGroupId && safeRouteGroups[0]?.id) {
      setSelectedRouteGroupId(safeRouteGroups[0].id);
    }
    setCreateRouteClientError(null);
    setRouteAddModalOpen(true);
  };

  const handleToggleInventoryAssignActions = () => {
    if (createInventoryDisabled) return;

    setInventoryAssignActionsOpen((isOpen) => !isOpen);
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

  const handleAddToRoute = async () => {
    if (addToRouteDisabled || !selectedRouteGroup?.id) return;

    try {
      setCreateRouteClientError(null);
      const sessionToken = await shopify.idToken();
      submittedRouteSessionTokenRef.current = sessionToken;

      const formData = new FormData();
      formData.set("_intent", "addOrdersToRouteGroup");
      formData.set("plannedOrderIds", JSON.stringify(plannedOrders.map((order) => order.id)));
      formData.set("routeGroupId", selectedRouteGroup.id);
      if (selectedRouteGroup.updatedAt) formData.set("expectedUpdatedAt", selectedRouteGroup.updatedAt);
      formData.set("shopifySessionToken", sessionToken);
      setRouteAddModalOpen(false);
      routePlanFetcher.submit(formData, { method: "post" });
    } catch {
      submittedRouteSessionTokenRef.current = null;
      setCreateRouteClientError(
        "Shopify session token을 가져오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.",
      );
    }
  };

  const handleAddInventory = async (submitAction = "add") => {
    if (createInventoryDisabled) return;

    try {
      setCreateInventoryClientError(null);
      setInventorySubmitAction(submitAction);
      const sessionToken = await shopify.idToken();
      submittedInventorySessionTokenRef.current = sessionToken;

      const routeDraftScope = buildRouteScopeFromOrders(plannedOrders);
      const formData = new FormData();
      formData.set("_intent", "createInventory");
      formData.set("plannedOrderIds", JSON.stringify(plannedOrders.map((order) => order.id)));
      formData.set("routeScope", JSON.stringify(routeDraftScope));
      formData.set("routeName", routePlanTitle.trim() || DEFAULT_ROUTE_PLAN_TITLE);
      formData.set("shopifySessionToken", sessionToken);
      inventoryFetcher.submit(formData, { method: "post" });
    } catch {
      submittedInventorySessionTokenRef.current = null;
      setInventorySubmitAction(null);
      setCreateInventoryClientError(
        "Shopify session token을 가져오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.",
      );
    }
  };

  useEffect(() => {
    if (!needsSessionTokenRefresh || searchParams.get(SESSION_TOKEN_REFRESH_PARAM)) return;
    if (sessionTokenRefreshSubmittedRef.current) return;

    let cancelled = false;
    sessionTokenRefreshSubmittedRef.current = true;

    shopify
      .idToken()
      .then((sessionToken) => {
        if (cancelled || !sessionToken) return;

        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.set("id_token", sessionToken);
        nextSearchParams.set(SESSION_TOKEN_REFRESH_PARAM, "1");
        setSearchParams(nextSearchParams, {
          preventScrollReset: true,
          replace: true,
        });
      })
      .catch(() => {
        sessionTokenRefreshSubmittedRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [needsSessionTokenRefresh, searchParams, setSearchParams, shopify]);

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
    const createdRouteGroup = routePlanFetcher.data?.routeGroup;
    const createdRoutePlan = routePlanFetcher.data?.routePlan;
    const sessionToken = submittedRouteSessionTokenRef.current;

    if (!sessionToken) return;
    if ((routePlanFetcher.data?.errors ?? []).length > 0) return;

    if (createdRouteGroup?.id) {
      submittedRouteSessionTokenRef.current = null;
      navigate(appendIdToken(routeGroupPath(createdRouteGroup.id), sessionToken));
      return;
    }

    if (!createdRoutePlan?.id) return;

    submittedRouteSessionTokenRef.current = null;
    navigate(appendIdToken(routePlanPath(createdRoutePlan.id), sessionToken));
  }, [navigate, routePlanFetcher.data?.errors, routePlanFetcher.data?.routeGroup, routePlanFetcher.data?.routePlan]);

  useEffect(() => {
    const createdInventory = inventoryFetcher.data?.inventory;
    const sessionToken = submittedInventorySessionTokenRef.current;

    if (!sessionToken || !createdInventory?.id) return;

    submittedInventorySessionTokenRef.current = null;
    navigate(`/app/orders/inventory?id=${encodeURIComponent(createdInventory.id)}&id_token=${encodeURIComponent(sessionToken)}`);
  }, [inventoryFetcher.data?.inventory, navigate]);

  useEffect(() => {
    if (inventoryDeleteFetcher.state !== "idle" || !inventoryDeleteFetcher.data) return;
    if ((inventoryDeleteFetcher.data.errors ?? []).length > 0) return;

    setCheckedInventoryIds([]);
  }, [inventoryDeleteFetcher.data, inventoryDeleteFetcher.state]);

  useEffect(() => {
    if (initialPerfEmittedRef.current) return;

    initialPerfEmittedRef.current = true;
    const navigationTimingMetric = getNavigationTimingMetric();
    emitPerformanceMetric({
      name: "shopify.admin.iframe",
      category: "shopify-admin-iframe",
      durationMs: navigationTimingMetric?.durationMs ?? null,
      observedAtMs: roundPerfDuration(performance.now()),
      isEmbeddedIframe: getEmbeddedIframeState(),
      isShopifyAdminReferrer: document.referrer.includes("admin.shopify.com"),
    });

    if (navigationTimingMetric) {
      emitPerformanceMetric(navigationTimingMetric);
    }
  }, []);

  useEffect(() => {
    if (!perf?.loader) return;

    emitPerformanceMetric({
      name: "orders.loader",
      category: "orders-loader",
      ...perf.loader,
    });

    emitPerformanceMetric({
      name: "orders.render.commit",
      category: "orders-render",
      durationMs: roundPerfDuration(getSafePerformanceNow() - initialRenderStartedAtRef.current),
      activeOrdersView: perf.loader.activeOrdersView,
      inventoryCount: safeInventories.length,
      orderCount: safeOrders.length,
    });
  }, [perf?.loader, safeInventories.length, safeOrders.length]);

  useEffect(() => () => {
    clearMapRecoveryTimer();
    clearMapSourceSyncRetryTimer();
  }, [clearMapRecoveryTimer, clearMapSourceSyncRetryTimer]);

  useEffect(() => {
    const mapContainerElement = mapContainerRef.current;
    if (activeOrdersView !== "orders" || !mapContainerElement || mapRef.current) {
      return undefined;
    }

    let isMounted = true;
    setIsMapReady(false);

    const initializeMap = async () => {
      initialMapFitAppliedRef.current = false;
      mapLoadedRef.current = false;
      mapSourceSyncPendingRef.current = false;
      const mapInitStartedAt = performance.now();
      try {
        const mapLibreImportStartedAt = performance.now();
        const [{ default: maplibregl }, { Protocol }] = await Promise.all([
          import("maplibre-gl"),
          import("pmtiles"),
        ]);
        const mapLibreImportMs = roundPerfDuration(
          performance.now() - mapLibreImportStartedAt,
        );

        if (!isMounted || mapRef.current) return;

        installPmtilesProtocol(maplibregl, Protocol);
        mapLibraryRef.current = maplibregl;
        const mapConstructStartedAt = performance.now();
        const map = createMapLibreMap(maplibregl, {
          container: mapContainerElement,
          style: OPENFREEMAP_STYLE_URL,
          center: initialMapCenterRef.current,
          zoom: INITIAL_HOME_ZOOM,
          attributionControl: { compact: true },
          fadeDuration: 0,
        });
        mapRef.current = map;
        installMissingMapImageFallback(map);
        if (PERF_CAPTURE_ENABLED && typeof window !== "undefined") {
          window.__cleverOrdersMap = map;
        }

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

        const handleSourceSyncEvent = (event) => {
          requestMapSourceSync(event?.type ?? "map-event");
        };

        map.on("styledata", handleSourceSyncEvent);
        map.on("sourcedata", handleSourceSyncEvent);
        map.on("idle", handleSourceSyncEvent);

        map.on("load", () => {
          if (!isMounted || mapRef.current !== map) return;

          mapLoadedRef.current = true;
          mapRecoveryAttemptsRef.current = 0;
          mapSourceSyncRetryAttemptsRef.current = 0;
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

        map.on("error", (event) => {
          if (!isMounted || mapRef.current !== map) return;

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

          if (mapLoadedRef.current) return;

          setMapStatus("failed");
        });
      } catch {
        if (!isMounted) return;
        scheduleMapRecovery();
      }
    };

    const cancelMapInitialization = scheduleIdleTask(initializeMap);

    return () => {
      cancelMapInitialization();
      clearMapSourceSyncRetryTimer();
      isMounted = false;
      mapSourceSyncPendingRef.current = false;
      const mapRemoveStartedAt = performance.now();
      const markerCount = markersRef.current.length;
      const markersRemoveStartedAt = performance.now();
      markersRef.current.forEach((marker) => marker.remove());
      const markersRemoveMs = roundPerfDuration(
        performance.now() - markersRemoveStartedAt,
      );
      markersRef.current = [];
      const singleMapRemoveStartedAt = performance.now();
      if (
        PERF_CAPTURE_ENABLED &&
        typeof window !== "undefined" &&
        window.__cleverOrdersMap === mapRef.current
      ) {
        delete window.__cleverOrdersMap;
      }
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
      mapLoadedRef.current = false;
    };
  }, [activeOrdersView, clearMapSourceSyncRetryTimer, mapRenderKey, requestMapSourceSync, scheduleMapRecovery]);

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
    const ordersLayerSynced = syncOrdersMapMarkerLayer(map, locatedOrders, plannedOrderIds, activeOrderPopupId);
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

    if (!ordersLayerSynced) {
      mapSourceSyncPendingRef.current = true;
      scheduleMapSourceSyncRetry();
      return undefined;
    }

    mapSourceSyncPendingRef.current = false;
    clearMapSourceSyncRetryTimer();
    mapSourceSyncRetryAttemptsRef.current = 0;

    const handleOrderMarkerClick = (event) => {
      const orderId = getOrderIdFromMapFeature(event.features?.[0]);
      if (!orderId) return;

      const order = displayOrderById.get(orderId);
      if (!order?.hasCoordinates) return;

      handleSelectOrder(order.id, { focusMap: false });

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
    const handleUserMapMoveStart = (event) => {
      if (!event?.originalEvent) return;
      setActiveOrderPopup(null);
    };

    map.on("click", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerClick);
    map.on("mouseenter", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerMouseEnter);
    map.on("mouseleave", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerMouseLeave);
    map.on("movestart", handleUserMapMoveStart);

    return () => {
      map.off("click", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerClick);
      map.off("mouseenter", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerMouseEnter);
      map.off("mouseleave", ORDERS_MAP_ORDER_LAYER_ID, handleOrderMarkerMouseLeave);
      map.off("movestart", handleUserMapMoveStart);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [
    activeOrderPopupId,
    departureLocation,
    displayOrderById,
    handleSelectOrder,
    isMapReady,
    locatedOrders,
    mapSourceSyncRequest,
    plannedOrderIds,
    scheduleMapSourceSyncRetry,
    setActiveOrderPopup,
    clearMapSourceSyncRetryTimer,
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

    mapRef.current.jumpTo({
      center: selectedOrder.coordinates,
      zoom: 11,
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

  if (activeOrdersView === "orders" && !ordersLoaded) {
    return (
      <TabLayout
        primaryExpanded={true}
        notice={ordersLayoutNotice}
        primary={<OrdersViewDataLoading />}
      />
    );
  }

  if (activeOrdersView === "inventory") {
    return (
      <TabLayout
        primaryExpanded={true}
        notice={ordersLayoutNotice}
        primary={inventoryList}
      />
    );
  }

  return (
    <TabLayout
      primaryExpanded={isMapWide}
      notice={ordersLayoutNotice}
      primary={
        <MapPanel
            ariaLabel="Shopify delivery order map"
            canvasKey={mapRenderKey}
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
          >
            {activeOrderPopup ? (
              <div
                aria-label={`Map details for ${activeOrderPopup.name}`}
                className="order-marker-popup order-map-focus-popup"
                role="dialog"
              >
                <div className="order-marker-popup__header">
                  <strong className="order-marker-popup__title">
                    {activeOrderPopup.name} · {activeOrderPopup.customer}
                  </strong>
                  <button
                    aria-label="Close order map details"
                    className="order-marker-popup__close"
                    onClick={() => setActiveOrderPopup(null)}
                    type="button"
                  >×</button>
                </div>
                <div className="order-marker-popup__address">{activeOrderPopup.address}</div>
                <div className="order-marker-popup__meta">
                  {(activeOrderPopupMetaValues.length > 0 ? activeOrderPopupMetaValues : ["—"]).map((deliveryMetaValue, metaIndex) => (
                    <span className="order-marker-popup__meta-tab" key={`${deliveryMetaValue}-${metaIndex}`}>{deliveryMetaValue}</span>
                  ))}
                </div>
                <strong className="order-marker-popup__items-title">Items</strong>
                {activeOrderPopupItems.length > 0 ? (
                  <ul className="order-marker-popup__items">
                    {activeOrderPopupItems.map((item, itemIndex) => (
                      <li className="order-marker-popup__item" key={`${item.name}-${itemIndex}`}>
                        <span>
                          {item.name}
                          {item.options && item.options !== "—" ? <small>{item.options}</small> : null}
                          {item.sku && item.sku !== "—" ? <small>SKU {item.sku}</small> : null}
                        </span>
                        <strong>×{item.quantity}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="order-marker-popup__empty">
                    {getOrderItemCount(activeOrderPopup) > 0 ? `${getOrderItemCount(activeOrderPopup)} items` : "No item detail"}
                  </span>
                )}
                <div className="order-marker-popup__actions">
                  <button
                    className="order-marker-popup__action"
                    disabled={activeOrderPopupPlannedIndex > 0}
                    onClick={() => handleAddOrderToPlan(activeOrderPopup.id)}
                    type="button"
                  >{activeOrderPopupPlannedIndex > 0 ? "Added to map" : "Add to map"}</button>
                  {activeOrderPopupShopifyUrl ? (
                    <a
                      className="order-marker-popup__action order-marker-popup__action--secondary"
                      href={activeOrderPopupShopifyUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >View in Shopify</a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </MapPanel>
      }
      secondary={
        <div className="order-route-plan" style={routePlanPanelStyle}>
          <label style={routePlanTitleGroupStyle}>
            <span style={routePlanTitleLabelStyle}>Title</span>
            <input
              aria-label="Route plan title"
              value={routePlanTitle}
              onChange={(event) => setRoutePlanTitle(event.currentTarget.value)}
              placeholder="YYYY.MM.DD X요일"
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
                >Assign</button>
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
                style={
                  addToRouteDisabled
                    ? disabledRouteAssignActionButtonStyle
                    : routeAssignActionButtonStyle
                }
                disabled={addToRouteDisabled}
                onClick={handleOpenAddRoutePreview}
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
              <s-heading>Inventory</s-heading>
              <div style={routePlanHeaderActionsStyle}>
                <button
                  type="button"
                  style={
                    createInventoryDisabled
                      ? disabledCreateRouteButtonStyle
                      : createRouteButtonStyle
                  }
                  aria-expanded={inventoryAssignActionsOpen}
                  disabled={createInventoryDisabled}
                  onClick={handleToggleInventoryAssignActions}
                >Assign</button>
              </div>
            </div>
            <div
              style={{
                ...routeAssignActionsStyle,
                ...(inventoryAssignActionsOpen
                  ? routeAssignActionsOpenStyle
                  : routeAssignActionsClosedStyle),
              }}
            >
              <button
                type="button"
                style={
                  createInventoryDisabled
                    ? disabledRouteAssignActionButtonStyle
                    : routeAssignActionButtonStyle
                }
                disabled={createInventoryDisabled}
                onClick={() => handleAddInventory("add")}
              >{isCreatingInventory && inventorySubmitAction === "add" ? "Adding…" : "Add"}</button>
              <button
                type="button"
                style={
                  createInventoryDisabled
                    ? disabledRouteAssignActionButtonStyle
                    : routeAssignActionButtonStyle
                }
                disabled={createInventoryDisabled}
                onClick={() => handleAddInventory("create")}
              >{isCreatingInventory && inventorySubmitAction === "create" ? "Creating…" : "Create"}</button>
            </div>
          </div>

          <div style={routePlanScrollAreaStyle}>
            <div className="order-route-summary" style={routeReadinessStyle} aria-label="Order summary">
              <div style={routeReadinessHeaderStyle}>
                <s-heading>Order summary</s-heading>
                <button
                  type="button"
                  style={
                    plannedOrders.length === 0
                      ? disabledPlanButtonStyle
                      : removeFromPlanButtonStyle
                  }
                  disabled={plannedOrders.length === 0}
                  onClick={handleClearPlan}
                >Clear</button>
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
            <div ref={orderedDateFieldRef} style={orderFilterDateFieldStyle}>
              <button
                aria-label="Filter orders by ordered date"
                style={orderedDateFilterActive ? orderFilterDateButtonStyle : orderFilterDatePlaceholderButtonStyle}
                type="button"
                onClick={handleOrderedDateCalendarOpen}
              >{orderedDateFilterActive ? orderedDateLabel : "Order date"}</button>
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
              {orderedDateCalendarOpen && orderedDateCalendarPosition
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
            <OrderFilterMenu
              aria-label="Filter orders by delivery day"
              clearLabel="Clear delivery day filter"
              label="Delivery day"
              options={ORDER_WEEKDAY_OPTIONS}
              value={orderFilters.deliveryWeekday}
              onChange={(filterValue) => handleOrderFilterChange("deliveryWeekday", filterValue)}
              onClear={() => handleClearOrderFilter("deliveryWeekday")}
            />
            <OrderFilterMenu
              aria-label="Filter orders by service type"
              clearLabel="Clear service type filter"
              label="Type"
              options={[
                { label: "Delivery", value: "DELIVERY" },
                { label: "Pickup", value: "PICKUP" },
              ]}
              value={orderFilters.serviceType}
              onChange={(filterValue) => handleOrderFilterChange("serviceType", filterValue)}
              onClear={() => handleClearOrderFilter("serviceType")}
            />
            <OrderFilterMenu
              aria-label="Filter orders by delivery area"
              clearLabel="Clear delivery area filter"
              label="Area"
              options={orderFilterOptions.deliveryAreas.map((deliveryArea) => ({
                label: deliveryArea,
                value: deliveryArea,
              }))}
              value={orderFilters.deliveryArea}
              onChange={(filterValue) => handleOrderFilterChange("deliveryArea", filterValue)}
              onClear={() => handleClearOrderFilter("deliveryArea")}
            />
            <OrderFilterMenu
              aria-label="Filter orders by state"
              clearLabel="Clear state filter"
              label="State"
              options={ORDER_DELIVERY_STATE_OPTIONS}
              value={orderFilters.deliveryState}
              onChange={(filterValue) => handleOrderFilterChange("deliveryState", filterValue)}
              onClear={() => handleClearOrderFilter("deliveryState")}
            />
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
              <button
                type="button"
                style={
                  checkedOrderIds.length === 0 || isBulkUpdatingOrders
                    ? disabledCreateRouteButtonStyle
                    : addToPlanButtonStyle
                }
                disabled={checkedOrderIds.length === 0 || isBulkUpdatingOrders}
                onClick={handleOpenOrderAction}
              >Action</button>
            </div>
          </div>
          {orderActionModalOpen
            ? createPortal(
                <div
                  role="presentation"
                  style={orderActionOverlayStyle}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setOrderActionModalOpen(false);
                  }}
                >
                  <div aria-modal="true" role="dialog" style={isOrderDataAction ? orderDataDialogStyle : orderActionDialogStyle}>
                    <strong>Action</strong>
                    <span style={orderSelectionCountStyle}>Selected: {checkedOrderIds.length}</span>
                    <div style={orderActionToggleStyle}>
                      {ORDER_BULK_ACTION_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          style={orderActionField === option.value ? createRouteButtonStyle : addToPlanButtonStyle}
                          onClick={() => handleOrderActionFieldChange(option.value)}
                        >
                          {option.value === ORDER_DATA_FIX_ACTION ? option.label : `Change ${option.label}`}
                        </button>
                      ))}
                    </div>
                    {isOrderDataAction ? (
                      <div style={orderDataDialogGridStyle}>
                        <div>
                          <strong>Orders needing review</strong>
                          <div aria-label="Orders needing review" style={orderDataListStyle}>
                            {orderDataRows.map(({ order, reasons }) => (
                              <button
                                key={order.id}
                                type="button"
                                style={activeOrderDataOrder?.id === order.id ? activeOrderDataListButtonStyle : orderDataListButtonStyle}
                                onClick={() => selectOrderDataOrder(order)}
                              >
                                <strong>{order.name}</strong>
                                <span style={orderDataReasonStyle}>{reasons.join(" · ")}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div style={orderDataPanelStyle}>
                          <div>
                            <strong>Customer Note</strong>
                            <pre style={orderRawNoteStyle}>{activeOrderRawNote ?? "No raw note"}</pre>
                            {activeOrderNoteHint ? <span style={orderDataReasonStyle}>{activeOrderNoteHint}</span> : null}
                          </div>
                          <div style={orderDataFormStyle}>
                            <strong>Fix data</strong>
                            <span style={orderDataReasonStyle}>{activeOrderDataReasons.join(" · ")}</span>
                            <label style={routePlanTitleLabelStyle}>
                              Delivery date
                              <input
                                aria-label="Delivery date"
                                type="text"
                                inputMode="numeric"
                                maxLength={10}
                                placeholder="yyyy.mm.dd"
                                style={orderActionSelectStyle}
                                value={orderDataDraft.deliveryDate}
                                onChange={(event) => handleOrderDataDraftChange("deliveryDate", event.currentTarget.value)}
                              />
                            </label>
                            <label style={routePlanTitleLabelStyle}>
                              Area
                              <input
                                aria-label="Delivery area"
                                type="text"
                                style={orderActionSelectStyle}
                                value={orderDataDraft.deliveryArea}
                                onChange={(event) => handleOrderDataDraftChange("deliveryArea", event.currentTarget.value)}
                              />
                            </label>
                            {activeOrderAreaSuggestion ? (
                              <div style={routeAddSnapshotOrderStyle}>
                                <strong>Suggested area: {activeOrderAreaSuggestion.area}</strong>
                                <span style={orderDataReasonStyle}>
                                  Based on {activeOrderAreaSuggestion.matchedOrders} of {activeOrderAreaSuggestion.nearbyOrders} nearby orders
                                </span>
                                <button
                                  type="button"
                                  style={orderFilterButtonStyle}
                                  onClick={() => handleOrderDataDraftChange("deliveryArea", activeOrderAreaSuggestion.area)}
                                >Apply</button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <label style={routePlanTitleLabelStyle}>
                        Change to
                        <select
                          aria-label="Change selected orders to"
                          style={orderActionSelectStyle}
                          value={orderActionValue}
                          onChange={(event) => setOrderActionValue(event.currentTarget.value)}
                        >
                          {orderActionValueOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div style={orderControlsTrailingStyle}>
                      <button
                        type="button"
                        style={orderFilterButtonStyle}
                        onClick={() => setOrderActionModalOpen(false)}
                      >Cancel</button>
                      <button
                        type="button"
                        style={isBulkUpdatingOrders ? disabledCreateRouteButtonStyle : createRouteButtonStyle}
                        disabled={isBulkUpdatingOrders || (isOrderDataAction && !activeOrderDataOrder)}
                        onClick={handleSaveOrderAction}
                      >Save</button>
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}
          {routeAddModalOpen
            ? createPortal(
                <div
                  role="presentation"
                  style={orderActionOverlayStyle}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setRouteAddModalOpen(false);
                  }}
                >
                  <div aria-label="Add orders to route preview" aria-modal="true" role="dialog" style={routeAddDialogStyle}>
                    <strong>Add to route</strong>
                    <span style={orderSelectionCountStyle}>Selected: {plannedOrders.length} orders</span>
                    <div style={routeAddDialogGridStyle}>
                      <div style={routeAddDialogControlsStyle}>
                        <label style={routePlanTitleGroupStyle}>
                          <span style={routePlanTitleLabelStyle}>Route</span>
                          <select
                            aria-label="Route to add orders"
                            style={orderActionSelectStyle}
                            value={selectedRouteGroup?.id ?? ""}
                            onChange={(event) => setSelectedRouteGroupId(event.currentTarget.value)}
                          >
                            {safeRouteGroups.map((routeGroup) => (
                              <option key={routeGroup.id} value={routeGroup.id}>
                                {getRouteAddOptionLabel(routeGroup)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div style={routeAddPreviewStyle}>
                          <div style={routeReadinessGridStyle}>
                            <div style={routeReadinessItemStyle}>
                              Target first route
                              <span style={routeReadinessValueStyle}>{getRouteAddTargetLabel(selectedRouteGroup)}</span>
                            </div>
                            <div style={routeReadinessItemStyle}>
                              Existing route orders
                              <span style={routeReadinessValueStyle}>{getRouteGroupOrderCount(selectedRouteGroup)}</span>
                            </div>
                            <div style={routeReadinessItemStyle}>
                              Delivery scope
                              <span style={routeReadinessValueStyle}>{formatRouteDeliveryScope(selectedRouteGroup, "-")}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <aside aria-label="Selected route snapshot" style={routeAddSnapshotStyle}>
                        <div style={routeAddSnapshotHeaderStyle}>
                          <strong>Route snapshot</strong>
                          <span style={routeAddSnapshotHintStyle}>Read-only</span>
                        </div>
                        <RouteAddSnapshotMap departureLocation={departureLocation} orders={routeAddSnapshotOrders} />
                        <strong>Orders in group</strong>
                        {routeAddSnapshotOrders.length > 0 ? (
                          <ol style={routeAddSnapshotListStyle}>
                            {routeAddSnapshotOrders.slice(0, 12).map((order, index) => (
                              <li key={`${order.id}-${index}`} style={routeAddSnapshotOrderStyle}>
                                <span style={routeReadinessValueStyle}>{index + 1}. {order.label}</span>
                                <span style={routeAddSnapshotOrderMetaStyle}>{order.customer}</span>
                                <span style={routeAddSnapshotOrderMetaStyle}>{order.address}</span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <span style={routeAddSnapshotOrderMetaStyle}>No orders loaded for this group</span>
                        )}
                      </aside>
                    </div>
                    <div style={orderControlsTrailingStyle}>
                      <button
                        type="button"
                        style={orderFilterButtonStyle}
                        onClick={() => setRouteAddModalOpen(false)}
                      >Cancel</button>
                      <button
                        type="button"
                        style={isCreatingRoute ? disabledCreateRouteButtonStyle : createRouteButtonStyle}
                        disabled={isCreatingRoute || !selectedRouteGroup?.id}
                        onClick={handleAddToRoute}
                      >Add</button>
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}
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
                  {SORTABLE_ORDER_COLUMNS.flatMap((column, columnIndex) => [
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
                      {column.key !== "name" && columnIndex < SORTABLE_ORDER_COLUMNS.length - 1 ? (
                        <span
                          aria-hidden="true"
                          style={columnResizeHandleStyle}
                          onPointerDown={(event) => handleColumnResizeStart(columnIndex + 1 + (columnIndex > 0 ? 1 : 0), event)}
                          onDoubleClick={(event) => handleColumnAutoFit(columnIndex + 1 + (columnIndex > 0 ? 1 : 0), event)}
                        >
                          <span style={columnResizeHandleLineStyle} />
                        </span>
                      ) : null}
                    </th>,
                    column.key === "name" ? (
                      <th key="notes" scope="col" aria-label="Notes" style={checkboxHeaderCellStyle} />
                    ) : null,
                  ])}
                </tr>
              </thead>
              <tbody>
                {tableOrders.map((order) => {
                  const orderIsPlanned = plannedOrderIdSet.has(order.id);
                  const checkboxChecked = orderIsPlanned || checkedOrderIdSet.has(order.id);
                  const areaPillTone = getOrderAreaPillTone(order);
                  const areaPillDetails = getOrderAreaPillDetails(order);
                  const areaPill = renderDetailPill({
                    children: formatAreaValue(order),
                    details: areaPillDetails,
                    detailKey: `${order.id}:area`,
                    label: "Area details",
                    tone: areaPillTone,
                  });
                  const deliveryPillDetails = getOrderDeliveryPillDetails(order);
                  const deliveryLabel = formatOrderDeliveryLabel(order);
                  const deliveryPill = renderDetailPill({
                    children: deliveryLabel,
                    details: deliveryPillDetails,
                    detailKey: `${order.id}:delivery`,
                    label: "Delivery details",
                    tone: getOrderDeliveryPillTone(order),
                  });
                  const orderedPillDetails = buildOrderTimelineDetails({ deliveryCycle, order, shopTimeZone });
                  const statePillDetails = getOrderDeliveryStatePillDetails(order, orderFilterReferenceDate);
                  const paymentPillDetails = getOrderPaymentPillDetails(order);
                  const orderNote = getOrderNote(order);
                  const customerNote = getCustomerNote(order);

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
                          onChange={(event) => toggleOrderCheck(order.id, event.currentTarget.checked)}
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
                      <td style={noteCellStyle}>
                        {orderNote || customerNote ? (
                          <span data-order-notes-popover-root="true">
                            <button
                              type="button"
                              aria-expanded={visibleNoteOrderId === order.id}
                              aria-label={`${visibleNoteOrderId === order.id ? "Hide" : "Show"} notes for ${order.name}`}
                              style={noteButtonStyle}
                              onMouseEnter={(event) => openNotePopover(event, order.id)}
                              onMouseLeave={() => closeHoveredNotePopover(order.id)}
                              onClick={(event) => togglePinnedNotePopover(event, order.id)}
                            >
                              <s-icon type="note" size="base" color="subdued"></s-icon>
                            </button>
                            {visibleNoteOrderId === order.id && notePopoverPosition && typeof document !== "undefined" ? createPortal(
                              <div
                                ref={notePopoverRef}
                                data-order-notes-popover-root="true"
                                role="dialog"
                                aria-label={`Notes for ${order.name}`}
                                style={{
                                  ...notePopoverStyle,
                                  left: `${Math.round(notePopoverPosition.left)}px`,
                                  top: `${Math.round(notePopoverPosition.top)}px`,
                                  transform: "none",
                                  width: `${Math.round(notePopoverPosition.width)}px`,
                                }}
                              >
                                <div style={itemPopoverTitleStyle}>Order Note</div>
                                <div style={noteCardStyle}>
                                  <ul style={noteListStyle}>
                                    {orderNote ? <li style={noteListItemStyle}>{orderNote}</li> : null}
                                    {customerNote ? <li style={noteListItemStyle}>{customerNote}</li> : null}
                                  </ul>
                                </div>
                              </div>
                            , document.body) : null}
                          </span>
                        ) : null}
                      </td>
                      <td style={deliveryInfoCellStyle}>
                        {renderDetailPill({
                          children: formatDeliveryValue(order.orderedDate),
                          details: orderedPillDetails,
                          detailKey: `${order.id}:ordered`,
                          interactive: true,
                          label: "Ordered timeline",
                          tone: "neutral",
                        })}
                      </td>
                      <td style={tableCellStyle}>{order.customer}</td>
                      <td style={addressCellStyle}>{order.address}</td>
                      <td style={itemCellStyle}>
                        {getOrderItemCount(order)}
                        <span data-order-items-popover-root="true">
                          <button
                            type="button"
                            aria-label={`Show items for ${order.name}`}
                            style={itemInfoButtonStyle}
                            onMouseEnter={(event) => openItemPopover(event, order.id)}
                            onMouseLeave={() => closeHoveredItemPopover(order.id)}
                            onClick={(event) => togglePinnedItemPopover(event, order.id)}
                          >
                            <s-icon type="info" size="base" color="subdued"></s-icon>
                          </button>
                          {visibleItemPopoverOrderId === order.id && itemPopoverPosition && typeof document !== "undefined" ? createPortal(
                            <div
                              ref={itemPopoverRef}
                              data-order-items-popover-root="true"
                              style={{
                                ...orderedItemsPopoverStyle,
                                left: `${Math.round(itemPopoverPosition.left)}px`,
                                top: `${Math.round(itemPopoverPosition.top)}px`,
                                transform: "none",
                                visibility: itemPopoverPosition.measured ? "visible" : "hidden",
                              }}
                            >
                              <div style={itemPopoverTitleStyle}>Ordered items</div>
                              <table style={itemPopoverTableStyle}>
                                <thead>
                                  <tr>
                                    <th style={itemPopoverCellStyle}>Item</th>
                                    <th style={itemPopoverCompactCellStyle}>Options</th>
                                    <th style={itemPopoverCompactCellStyle}>SKU</th>
                                    <th style={itemPopoverQtyCellStyle}>Qty</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {getOrderLineItems(order).map((item, itemIndex) => (
                                    <tr key={`${item.name}-${itemIndex}`}>
                                      <td style={itemPopoverCellStyle}>{item.name}</td>
                                      <td style={itemPopoverCompactCellStyle}>{item.options}</td>
                                      <td style={itemPopoverCompactCellStyle}>{item.sku}</td>
                                      <td style={itemPopoverQtyCellStyle}>{item.quantity}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div style={itemPopoverFooterStyle}>
                                <span>Order total</span>
                                <span style={itemPopoverFooterValueStyle}>{formatOrderTotal(order)}</span>
                              </div>
                            </div>,
                            document.body,
                          ) : null}
                        </span>
                      </td>
                      <td style={deliveryInfoCellStyle}>
                        {isAttentionPillTone(areaPillTone) ? (
                          <button
                            type="button"
                            aria-label={`Edit delivery area for ${order.name}`}
                            style={editablePillButtonStyle}
                            onClick={() => handleOpenOrderDataAction(order)}
                          >
                            {areaPill}
                          </button>
                        ) : areaPill}
                      </td>
                      <td style={deliveryInfoCellStyle}>
                        {deliveryLabel === "Date pending" ? (
                          <button
                            type="button"
                            aria-label={`Edit delivery date for ${order.name}`}
                            style={editablePillButtonStyle}
                            onClick={() => handleOpenOrderDataAction(order)}
                          >
                            {deliveryPill}
                          </button>
                        ) : deliveryPill}
                      </td>
                      <td style={deliveryInfoCellStyle}>
                        {renderDetailPill({
                          children: formatOrderDeliveryState(order, orderFilterReferenceDate),
                          details: statePillDetails,
                          detailKey: `${order.id}:state`,
                          label: "State details",
                          tone: getOrderDeliveryStatePillTone(order, orderFilterReferenceDate),
                        })}
                      </td>
                      <td style={deliveryInfoCellStyle}>
                        {renderDetailPill({
                          children: formatOrderPaymentState(order),
                          details: paymentPillDetails,
                          detailKey: `${order.id}:payment`,
                          label: "Payment details",
                          tone: getOrderPaymentPillTone(order),
                        })}
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
