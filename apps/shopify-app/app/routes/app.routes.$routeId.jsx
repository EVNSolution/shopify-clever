import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useFetcher, useLoaderData, useNavigate, useRevalidator, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  CHILD_ROUTE_ORDER_COLUMNS,
  buildChildRouteOrderRows,
  formatStoreLocalDateTimeInput,
  formatStoreLocalOrderDate,
  isMaterializedChildRouteDetail as getIsMaterializedChildRouteDetail,
  storeLocalDateTimeToIso,
} from "../features/delivery/child-route-detail-presentation";
import {
  firstArray,
  formatRouteDeliveryScope,
  formatRouteStatus,
  getRouteGroupChildRoutePlanId,
  getRouteGroupChildRouteName,
  getVisibleRouteGroupChildren,
  numberOrUndefined,
  readRouteOptimizedSnapshot,
  textOrUndefined,
} from "../features/delivery/route-helpers";
import { routeDetailAction, routeDetailLoader } from "../features/delivery/route-detail.server";
import { ROUTES_ROOT_PATH, routeGroupChildPath } from "../features/delivery/route-paths";
import {
  DEFAULT_CENTER,
  ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID,
  ROUTE_DETAIL_STOP_LAYER_ID,
  findRouteStopPoint,
  fitRouteDetailMap,
  fitRouteStopAndSnappedPoint,
  getRouteMapCenter,
  getRouteMapLocations,
  getRouteStopFromMapFeature,
  isLngLatInPolygon,
  normalizeLngLat,
  removeRouteEditPolygon,
  softenRouteColor,
  syncRouteDetailMapMarkerLayers,
  syncRouteDetailRouteLine,
  syncRouteEditPolygon,
} from "../features/delivery/route-detail-map";
import { MAP_MARKER_PALETTE } from "../features/maps/map-markers";
import { createMapLibreMap } from "../features/maps/maplibre-map";
import { installMissingMapImageFallback } from "../features/maps/maplibre-missing-images";
import { installPmtilesProtocol } from "../features/maps/pmtiles-protocol";
import { MapPanel, MapToolbar, renderMapFitIcon, renderMapRefreshIcon, renderMapZoomInIcon, renderMapZoomOutIcon } from "../ui/map-panel";

export const links = () => [{ rel: "stylesheet", href: "/vendor/maplibre-gl.css" }];

const OPENFREEMAP_STYLE_URL = "/vendor/openfreemap-clever-lite.json";
const MAP_RECOVERY_DELAY_MS = 2500;
const MAX_MAP_RECOVERY_ATTEMPTS = 3;
const ROUTE_EMPTY_LABEL = "–";
const ROUTE_DEFAULT_COLORS = [MAP_MARKER_PALETTE.plannedOrder.color, "#7c3aed", "#0f766e", "#b45309", "#be123c", "#334155"];
const ROUTE_COLOR_OPTIONS = ["#0b84d8", "#f97316", "#14b8a6", "#8b5cf6", "#ef4444"];
const ROUTE_TIMELINE_STOP_POPOVER_GAP = 4;
const ROUTE_TIMELINE_STOP_POPOVER_HEIGHT = 260;
const ROUTE_TIMELINE_STOP_POPOVER_WIDTH = 320;
const ROUTE_TIMELINE_STOP_POPOVER_EDGE_INSET = 12;
const CHILD_ROUTE_TIMELINE_UNIT_MIN_WIDTH = 73;
const CHILD_ORDER_DISCLOSURE_EDGE_INSET = 12;
const CHILD_ORDER_DISCLOSURE_GAP = 2;
const CHILD_ORDER_DISCLOSURE_HEIGHT = 260;
const CHILD_ORDER_DISCLOSURE_WIDTH = 300;

function roundPerfDuration(duration) {
  return Number(duration.toFixed(2));
}


function logRouteDetailPerformance(name, metric = {}) {
  if (typeof window !== "undefined") return;

  console.info(name, {
    measuredAt: new Date().toISOString(),
    ...metric,
  });
}

const ROUTE_DETAIL_MAP_DIAGNOSTIC_ENDPOINT = "/perf";

function logRouteDetailMapClientDiagnostic(metric = {}) {
  if (typeof window === "undefined") return;

  const payload = {
    measuredAt: new Date().toISOString(),
    name: "routes.detail.map.marker_diagnostics",
    url: window.location.href,
    ...metric,
  };
  console.info(payload.name, payload);

  window.fetch?.(ROUTE_DETAIL_MAP_DIAGNOSTIC_ENDPOINT, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    keepalive: true,
    method: "POST",
  })?.catch?.(() => {});
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
  gap: "10px",
  padding: "14px 16px",
};

const routeOverviewTopBarStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  justifyContent: "space-between",
};

const routeOverviewTitleBlockStyle = {
  display: "grid",
  gap: "4px",
  minWidth: 0,
};

const routeOverviewTitleLineStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
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

const routeDetailNavigationStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
};

const routeHeaderRightStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  justifyContent: "flex-end",
};

const siblingRouteNavigatorStyle = {
  alignItems: "stretch",
  display: "inline-flex",
  position: "relative",
};

const siblingRouteNavigatorButtonStyle = {
  alignItems: "center",
  background: "#ffffff",
  border: "1px solid #c9cccf",
  color: "#303030",
  cursor: "pointer",
  display: "inline-flex",
  fontSize: "13px",
  fontWeight: 650,
  gap: "5px",
  justifyContent: "center",
  minHeight: "34px",
  padding: "4px 9px",
};

const siblingRoutePreviousButtonStyle = {
  ...siblingRouteNavigatorButtonStyle,
  borderRadius: "8px 0 0 8px",
};

const siblingRouteMenuButtonStyle = {
  ...siblingRouteNavigatorButtonStyle,
  borderLeft: 0,
  borderRadius: 0,
  borderRight: 0,
  minWidth: "52px",
  padding: "4px 7px",
};

const siblingRouteNextButtonStyle = {
  ...siblingRouteNavigatorButtonStyle,
  borderRadius: "0 8px 8px 0",
};

const siblingRouteNavigatorDisabledStyle = {
  background: "#f7f7f7",
  color: "#a3a3a3",
  cursor: "not-allowed",
};

const siblingRouteNavigatorIconStyle = {
  display: "block",
  height: "16px",
  width: "16px",
};

const siblingRouteMenuStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "12px",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.16)",
  display: "grid",
  gap: "4px",
  minWidth: "240px",
  padding: "8px",
  position: "absolute",
  right: 0,
  top: "calc(100% + 6px)",
  zIndex: 30,
};

const siblingRouteMenuHeadingStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 700,
  padding: "4px 8px 6px",
};

const siblingRouteMenuItemStyle = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  borderRadius: "8px",
  color: "#303030",
  cursor: "pointer",
  display: "flex",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  gap: "9px",
  minHeight: "36px",
  padding: "7px 9px",
  textAlign: "left",
  width: "100%",
};

const siblingRouteMenuCurrentItemStyle = {
  background: "#f1f1f1",
  fontWeight: 750,
};

const siblingRouteMenuDotStyle = {
  borderRadius: "999px",
  flex: "0 0 auto",
  height: "10px",
  width: "10px",
};

const siblingRouteMenuLabelStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
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
  minHeight: "490px",
};

const routeMetaActionsStyle = {
  borderBottom: "1px solid #ececec",
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  padding: "6px 8px",
};

const routeMetaGridStyle = {
  display: "grid",
  gap: "2px",
  gridTemplateColumns: "minmax(0, 1fr)",
};

const routeMetaItemStyle = {
  color: "#4b5563",
  fontSize: "14px",
  lineHeight: 1.35,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routeActionColumnStyle = {
  display: "grid",
  gap: "4px",
  width: "128px",
};

const routeActionButtonStyle = {
  background: "#ffffff",
  borderColor: "#c9c9c9",
  borderRadius: "8px",
  borderStyle: "solid",
  borderWidth: "1px",
  color: "#303030",
  cursor: "pointer",
  flex: "0 0 auto",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 650,
  minHeight: "26px",
  padding: "3px 10px",
  whiteSpace: "nowrap",
};

const routeHeaderActionsStyle = {
  alignItems: "center",
  display: "flex",
  gap: "6px",
};

const routeDisabledActionButtonStyle = {
  ...routeActionButtonStyle,
  background: "#f7f7f7",
  borderColor: "#d6d6d6",
  color: "#8a8a8a",
  cursor: "not-allowed",
};

const routeDangerActionButtonStyle = {
  ...routeActionButtonStyle,
  borderColor: "#d72c0d",
  color: "#d72c0d",
};

const routePlanRowsTableStyle = {
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: "1216px",
  tableLayout: "fixed",
  width: "100%",
};

const routePlanRowsColumnWidths = [
  "112px",
  "82px",
  "116px",
  "74px",
  "160px",
  "52px",
  "74px",
  "76px",
  "82px",
  "104px",
  "104px",
  "96px",
  "116px",
];

const childRouteHeaderSummaryStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
};

const childRouteHeaderDriverButtonStyle = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  color: "#1f1f1f",
  cursor: "pointer",
  display: "inline-flex",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 700,
  gap: "2px",
  lineHeight: 1.15,
  maxWidth: "100%",
  minWidth: 0,
  overflow: "hidden",
  padding: 0,
  textAlign: "left",
  whiteSpace: "nowrap",
};

const childRouteDepartureControlStyle = {
  alignItems: "center",
  display: "inline-flex",
  gap: "4px",
};

const childRouteDepartureInputStyle = {
  background: "#ffffff",
  border: "1px solid #c9cccf",
  borderRadius: "6px",
  color: "#1f1f1f",
  font: "inherit",
  fontSize: "13px",
  height: "26px",
  padding: "2px 5px",
  width: "176px",
};

const childRouteDepartureSaveButtonStyle = {
  background: "#ffffff",
  border: "1px solid #c9cccf",
  borderRadius: "6px",
  color: "#303030",
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
  fontWeight: 650,
  height: "26px",
  padding: "2px 7px",
};

const childRouteOrderTableStyle = {
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: "1320px",
  tableLayout: "fixed",
  width: "100%",
};

const childRouteOrderColumnWidths = [
  "56px",
  "104px",
  "104px",
  "112px",
  "190px",
  "104px",
  "104px",
  "82px",
  "142px",
  "96px",
  "132px",
  "94px",
];

const childRouteOrderRowStyle = {
  height: "40px",
};

const childRouteTableStopMarkerStyle = {
  alignItems: "center",
  background: "var(--route-marker-color, #0b84d8)",
  borderRadius: "999px",
  boxSizing: "border-box",
  color: "#ffffff",
  display: "flex",
  height: "20px",
  justifyContent: "center",
  margin: "0 auto",
  padding: 0,
  width: "20px",
};

const routeNumberMarkerGlyphStyle = {
  display: "block",
  lineHeight: 1,
  transform: "translateY(0.1em)",
};

const childRouteTableStopMarkerTextStyle = {
  ...routeNumberMarkerGlyphStyle,
  fontSize: "11px",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
};

const childRouteDisclosureCellStyle = {
  borderBottomColor: "#ececec",
  borderBottomStyle: "solid",
  borderBottomWidth: "1px",
  color: "#303030",
  fontSize: "14px",
  lineHeight: 1.2,
  overflow: "hidden",
  padding: "8px 4px",
  position: "relative",
  textAlign: "center",
  textOverflow: "ellipsis",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const childRouteDisclosureButtonStyle = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  borderRadius: "5px",
  color: "#303030",
  cursor: "pointer",
  display: "inline-flex",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  gap: "5px",
  justifyContent: "center",
  lineHeight: 1.2,
  margin: "0 auto",
  maxWidth: "100%",
  minWidth: 0,
  overflow: "hidden",
  padding: "2px 3px",
  textAlign: "center",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const childRouteDisclosureInfoIconStyle = {
  color: "#6d7175",
  display: "block",
  flex: "0 0 auto",
  height: "14px",
  width: "14px",
};

const childRouteDisclosurePopoverStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "10px",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.16)",
  color: "#303030",
  display: "grid",
  fontSize: "13px",
  gap: "8px",
  left: 0,
  lineHeight: 1.35,
  maxHeight: `${CHILD_ORDER_DISCLOSURE_HEIGHT}px`,
  overflowY: "auto",
  padding: "12px",
  position: "fixed",
  top: 0,
  width: `${CHILD_ORDER_DISCLOSURE_WIDTH}px`,
  zIndex: 100020,
};

const childRouteDisclosurePopoverHeaderStyle = {
  alignItems: "center",
  display: "flex",
  fontSize: "13px",
  fontWeight: 750,
  justifyContent: "space-between",
};

const childRouteDisclosureListStyle = {
  display: "grid",
  gap: "6px",
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const childRouteDisclosureListItemStyle = {
  alignItems: "start",
  borderTop: "1px solid #f1f1f1",
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  paddingTop: "6px",
};

const childRouteDisclosureAttributeStyle = {
  borderTop: "1px solid #f1f1f1",
  display: "grid",
  gap: "3px",
  gridTemplateColumns: "minmax(72px, auto) minmax(0, 1fr)",
  margin: 0,
  paddingTop: "6px",
};

const childRouteDisclosureAttributeKeyStyle = {
  color: "#6d7175",
  fontWeight: 650,
};

const childRouteDisclosureEmptyStyle = {
  color: "#6d7175",
};

const childRouteTimelineRowsStyle = {
  display: "grid",
  gap: "6px",
  maxWidth: "100%",
  minWidth: 0,
  overflowX: "auto",
  overflowY: "hidden",
  width: "100%",
};

const childRouteTimelineTrackStyle = {
  alignItems: "stretch",
  display: "grid",
  width: "100%",
};

function getChildRouteTimelineTrackStyle(stopCount) {
  const unitCount = Math.max(2, Number(stopCount) + 2);
  return {
    ...childRouteTimelineTrackStyle,
    gridTemplateColumns: `repeat(${unitCount}, minmax(${CHILD_ROUTE_TIMELINE_UNIT_MIN_WIDTH}px, 1fr))`,
    minWidth: `${unitCount * CHILD_ROUTE_TIMELINE_UNIT_MIN_WIDTH}px`,
  };
}

function getChildOrderDisclosurePopoverPosition(rect, popoverSize = {}) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(
    popoverSize.width ?? CHILD_ORDER_DISCLOSURE_WIDTH,
    viewportWidth - CHILD_ORDER_DISCLOSURE_EDGE_INSET * 2,
  );
  const height = Math.min(
    popoverSize.height ?? CHILD_ORDER_DISCLOSURE_HEIGHT,
    viewportHeight - CHILD_ORDER_DISCLOSURE_EDGE_INSET * 2,
  );
  const left = Math.min(
    Math.max(CHILD_ORDER_DISCLOSURE_EDGE_INSET, rect.left),
    viewportWidth - width - CHILD_ORDER_DISCLOSURE_EDGE_INSET,
  );
  const top = Math.max(
    CHILD_ORDER_DISCLOSURE_EDGE_INSET,
    rect.top - height - CHILD_ORDER_DISCLOSURE_GAP,
  );

  return { left, top, width };
}

const childRouteTimelineStopUnitStyle = {
  alignContent: "center",
  alignItems: "center",
  boxSizing: "border-box",
  display: "grid",
  gap: "2px",
  gridTemplateRows: "14px 20px",
  isolation: "isolate",
  justifyItems: "center",
  minHeight: "48px",
  minWidth: "73px",
  padding: "3px 4px",
  position: "relative",
  textAlign: "center",
  width: "100%",
};

const childRouteTimelineStopMarkerStyle = {
  display: "grid",
  fontVariantNumeric: "tabular-nums",
  justifySelf: "center",
  lineHeight: 1,
  placeItems: "center",
};

const childRouteTimelineConnectorStyle = {
  background: "var(--route-line-color, #0b84d8)",
  height: "2px",
  left: "50%",
  pointerEvents: "none",
  position: "absolute",
  top: "31px",
  width: "100%",
  zIndex: 0,
};

const childRouteTimelineEndpointStyle = {
  ...childRouteTimelineStopUnitStyle,
  color: "#4b5563",
  fontSize: "11px",
  fontWeight: 700,
};

const childRouteTimelineEndpointMarkerStyle = {
  alignItems: "center",
  borderRadius: "999px",
  boxSizing: "border-box",
  display: "inline-flex",
  flex: "0 0 auto",
  height: "20px",
  justifyContent: "center",
  position: "relative",
  width: "20px",
  zIndex: 1,
};

const childRouteTimelineStartMarkerStyle = {
  ...childRouteTimelineEndpointMarkerStyle,
  background: "#0f8f72",
  color: "#ffffff",
};

const childRouteTimelineEndStyle = {
  ...childRouteTimelineEndpointStyle,
};

const childRouteTimelineEndMarkerStyle = {
  ...childRouteTimelineEndpointMarkerStyle,
  backgroundColor: "#ffffff",
  backgroundImage: "conic-gradient(#202223 25%, #ffffff 0 50%, #202223 0 75%, #ffffff 0)",
  backgroundSize: "6px 6px",
  border: "1px solid #202223",
};

const childRouteTimelineOrderLabelStyle = {
  color: "#4b5563",
  display: "block",
  fontSize: "11px",
  fontWeight: 650,
  lineHeight: 1.1,
  maxWidth: "65px",
  overflow: "hidden",
  position: "relative",
  textAlign: "center",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  width: "100%",
  zIndex: 1,
};

const routeLineNameStyle = {
  alignItems: "center",
  display: "inline-flex",
  gap: "4px",
  maxWidth: "100%",
  minWidth: 0,
};

const routeLineTitleStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routeLineTitleButtonStyle = {
  ...routeLineTitleStyle,
  background: "transparent",
  border: 0,
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  padding: 0,
  textAlign: "left",
};

const routeStatusDotStyle = {
  borderRadius: "999px",
  display: "inline-block",
  flex: "0 0 auto",
  height: "7px",
  width: "7px",
};

const routeLineEditButtonStyle = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  color: "#8a8a8a",
  cursor: "pointer",
  display: "inline-flex",
  flex: "0 0 auto",
  fontSize: "13px",
  height: "16px",
  justifyContent: "center",
  lineHeight: 1,
  padding: 0,
  width: "16px",
};

const routeLineEditIconStyle = {
  display: "block",
  height: "12px",
  width: "12px",
};

const routePolygonEditIconStyle = {
  display: "block",
  height: "18px",
  width: "18px",
};

const routeRowStatusStyle = {
  alignItems: "center",
  background: "#fff7cc",
  border: "1px solid #eadf9b",
  borderRadius: "6px",
  boxSizing: "border-box",
  color: "#5f4b00",
  display: "inline-flex",
  fontSize: "12px",
  fontWeight: 650,
  justifyContent: "center",
  lineHeight: 1,
  minHeight: "17px",
  padding: "0 5px",
};

const routeEditableValueStyle = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  color: "#303030",
  cursor: "pointer",
  display: "inline-flex",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  gap: "2px",
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
  gap: "6px",
  maxWidth: "100%",
  minWidth: 0,
  padding: "8px 8px 0",
};

const childRouteTimelineStyle = {
  ...routeTimelineStyle,
  padding: "8px 8px 16px",
};

const routeTimelineRowsStyle = {
  display: "grid",
  gap: "6px",
  overflowX: "auto",
};

const routeTimelineLaneStyle = {
  alignItems: "center",
  display: "inline-flex",
  minWidth: "max-content",
};

const routeTimelineLabelStyle = {
  borderRight: "1px solid #d6d6d6",
  color: "#303030",
  fontSize: "13px",
  fontWeight: 650,
  marginRight: "6px",
  maxWidth: "72px",
  minWidth: "64px",
  overflow: "hidden",
  paddingRight: "6px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const routeTimelineBottomSpacerStyle = {
  borderTop: "1px solid #d6d6d6",
  height: "56px",
};

const routeTimelineDropHintStyle = {
  alignItems: "center",
  color: "#6d7175",
  display: "flex",
  fontSize: "13px",
  height: "100%",
  justifyContent: "center",
  textAlign: "center",
};

const routeTimelineStartStyle = {
  alignItems: "center",
  background: "#0f8f72",
  borderRadius: "999px",
  color: "#ffffff",
  display: "inline-flex",
  flex: "0 0 auto",
  fontSize: "10px",
  fontWeight: 700,
  height: "18px",
  justifyContent: "center",
  width: "18px",
};

const routeTimelineStartIconStyle = {
  display: "block",
  fill: "currentColor",
  height: "10px",
  width: "10px",
};

const routeTimelineSegmentStyle = {
  alignItems: "center",
  display: "inline-flex",
  flex: "0 0 auto",
};

const routeTimelineLineStyle = {
  background: "var(--route-line-color, #0b84d8)",
  height: "2px",
  pointerEvents: "none",
  width: "28px",
};

const routeTimelineStopStyle = {
  alignItems: "center",
  background: "var(--route-marker-color, #0b84d8)",
  border: 0,
  borderRadius: "999px",
  color: "#ffffff",
  cursor: "grab",
  display: "inline-flex",
  flex: "0 0 auto",
  fontSize: "10px",
  fontWeight: 700,
  height: "18px",
  justifyContent: "center",
  padding: 0,
  transition: "opacity 140ms ease, transform 180ms ease",
  width: "18px",
};

const routeTimelineStopDraggingStyle = {
  cursor: "grabbing",
  opacity: 0.55,
  transform: "scale(1.12)",
};

const routeTimelineStopPopoverStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "10px",
  boxSizing: "border-box",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.18)",
  color: "#202223",
  display: "grid",
  fontSize: "12px",
  gap: "8px",
  left: 0,
  maxWidth: `${ROUTE_TIMELINE_STOP_POPOVER_WIDTH}px`,
  minWidth: "280px",
  padding: "10px",
  position: "fixed",
  top: 0,
  width: `min(${ROUTE_TIMELINE_STOP_POPOVER_WIDTH}px, calc(100vw - 16px))`,
  zIndex: 100010,
};

const routeTimelineStopPopoverHeaderStyle = {
  alignItems: "start",
  display: "flex",
  fontSize: "14px",
  fontWeight: 700,
  gap: "8px",
  justifyContent: "space-between",
};

const routeTimelineStopPopoverCloseStyle = {
  background: "transparent",
  border: 0,
  color: "#6d7175",
  cursor: "pointer",
  fontSize: "16px",
  lineHeight: 1,
  padding: 0,
};

const routeTimelineStopPopoverMetaStyle = {
  color: "#616161",
  display: "grid",
  gap: "3px",
  lineHeight: 1.35,
};

const routeTimelineStopItemListStyle = {
  display: "grid",
  gap: "5px",
  listStyle: "none",
  margin: 0,
  maxHeight: "180px",
  overflowY: "auto",
  padding: 0,
};

const routeTimelineStopItemStyle = {
  alignItems: "start",
  borderTop: "1px solid #f1f1f1",
  display: "grid",
  gap: "2px",
  gridTemplateColumns: "1fr auto",
  paddingTop: "5px",
};

const routeLineEditorOverlayStyle = {
  alignItems: "center",
  background: "rgba(0, 0, 0, 0.18)",
  boxSizing: "border-box",
  display: "grid",
  inset: 0,
  justifyItems: "center",
  padding: "24px",
  position: "fixed",
  zIndex: 2147483647,
};

const routeLineEditorBackdropButtonStyle = {
  background: "transparent",
  border: 0,
  cursor: "default",
  inset: 0,
  padding: 0,
  position: "absolute",
};

const routeLineEditorDialogStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "12px",
  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.24)",
  boxSizing: "border-box",
  display: "grid",
  gap: "12px",
  maxWidth: "calc(100vw - 48px)",
  padding: "16px",
  position: "relative",
  width: "320px",
  zIndex: 1,
};

const routeLineEditorTitleStyle = {
  color: "#303030",
  fontSize: "15px",
  fontWeight: 750,
  margin: 0,
};

const routeLineEditorFieldStyle = {
  display: "grid",
  gap: "4px",
};

const routeLineEditorLabelStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
};

const routeLineEditorInputStyle = {
  border: "1px solid #d0d0d0",
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#303030",
  fontFamily: "inherit",
  fontSize: "13px",
  lineHeight: 1.2,
  minHeight: "32px",
  padding: "4px 8px",
  width: "100%",
};

const routeSelectorListStyle = {
  border: "1px solid #eeeeee",
  borderRadius: "8px",
  display: "grid",
  maxHeight: "220px",
  overflowY: "auto",
};

const routeSelectorOptionStyle = {
  background: "#ffffff",
  border: 0,
  borderBottom: "1px solid #eeeeee",
  color: "#303030",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  minHeight: "34px",
  padding: "8px 10px",
  textAlign: "left",
};

const routeSelectorEmptyStyle = {
  color: "#616161",
  fontSize: "13px",
  padding: "16px 10px",
  textAlign: "center",
};

const routeLineColorGridStyle = {
  display: "flex",
  gap: "6px",
};

const routeLineColorButtonStyle = {
  border: "1px solid #bdbdbd",
  borderRadius: "999px",
  cursor: "pointer",
  height: "22px",
  padding: 0,
  width: "22px",
};

const routeLineEditorActionsStyle = {
  display: "flex",
  gap: "6px",
  justifyContent: "flex-end",
};

const routeLineEditorPrimaryButtonStyle = {
  ...routeActionButtonStyle,
  background: "#303030",
  borderColor: "#303030",
  color: "#ffffff",
};

const routePolygonSaveButtonStyle = {
  ...routeActionButtonStyle,
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
  minHeight: "30px",
  position: "absolute",
  right: "58px",
  top: "12px",
  zIndex: 3,
};

const routePolygonEditOverlayStyle = {
  border: "2px solid rgba(37, 99, 235, 0.85)",
  boxSizing: "border-box",
  inset: 0,
  pointerEvents: "none",
  position: "absolute",
  zIndex: 1,
};


const routePolygonSaveButtonActiveStyle = {
  background: "#d92d20",
  borderColor: "#b42318",
  color: "#ffffff",
};

const routePolygonSaveButtonDisabledStyle = {
  background: "#f2f2f2",
  borderColor: "#d6d6d6",
  color: "#8a8a8a",
  cursor: "not-allowed",
};

const routePolygonTargetPanelStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "10px",
  boxShadow: "0 10px 28px rgba(0, 0, 0, 0.18)",
  display: "grid",
  gap: "6px",
  padding: "8px",
  position: "absolute",
  right: "58px",
  top: "50px",
  width: "220px",
  zIndex: 3,
};

const routePolygonTargetTitleStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.25,
};

const routePolygonTargetButtonStyle = {
  ...routeActionButtonStyle,
  justifyContent: "flex-start",
  overflow: "hidden",
  textAlign: "left",
  textOverflow: "ellipsis",
  width: "100%",
};

const routeDraftBarStyle = {
  alignItems: "center",
  background: "#1f1f1f",
  border: "1px solid #303030",
  borderRadius: "12px",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.25)",
  color: "#ffffff",
  display: "flex",
  gap: "8px",
  padding: "8px 10px",
  left: "50%",
  position: "fixed",
  top: "12px",
  transform: "translateX(-50%)",
  zIndex: 2147483647,
};

const routeDraftBarTextStyle = {
  fontSize: "13px",
  fontWeight: 650,
  whiteSpace: "nowrap",
};

const routeDraftBarButtonStyle = {
  ...routeActionButtonStyle,
  background: "#ffffff",
  borderColor: "#ffffff",
  color: "#303030",
  minHeight: "30px",
};

const routeDraftBarGhostButtonStyle = {
  ...routeActionButtonStyle,
  background: "#303030",
  borderColor: "#555555",
  color: "#ffffff",
  minHeight: "30px",
};

const routesDetailTableFrameStyle = {
  overflowX: "auto",
};

const routesDetailHeaderCellStyle = {
  background: "#f7f7f7",
  borderBottomColor: "#d6d6d6",
  borderBottomStyle: "solid",
  borderBottomWidth: "1px",
  color: "#616161",
  fontSize: "13px",
  fontWeight: 650,
  lineHeight: 1.15,
  overflow: "hidden",
  padding: "4px",
  textAlign: "left",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const childRouteOrderHeaderCellStyle = {
  ...routesDetailHeaderCellStyle,
  textAlign: "center",
  verticalAlign: "middle",
};

const routeStatusHeaderCellStyle = {
  ...routesDetailHeaderCellStyle,
  textAlign: "center",
};

const routeNameHeaderCellStyle = {
  ...routesDetailHeaderCellStyle,
  paddingLeft: "8px",
};

const routesDetailCellStyle = {
  borderBottomColor: "#ececec",
  borderBottomStyle: "solid",
  borderBottomWidth: "1px",
  color: "#303030",
  fontSize: "14px",
  lineHeight: 1.2,
  overflow: "hidden",
  padding: "4px",
  textOverflow: "ellipsis",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const childRouteOrderCellStyle = {
  ...routesDetailCellStyle,
  padding: "8px 4px",
  textAlign: "center",
};

const childRouteStopCellStyle = {
  ...childRouteOrderCellStyle,
  padding: "8px 0",
  textAlign: "center",
};

const routeStatusCellStyle = {
  ...routesDetailCellStyle,
  padding: "4px 2px",
  textAlign: "center",
};

const routeNameCellStyle = {
  ...routesDetailCellStyle,
  paddingLeft: "8px",
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


export const loader = routeDetailLoader;
export const action = routeDetailAction;

function buildRouteDetail(routePlan, routeGroup = null) {
  if (!routePlan) {
    const orderCount = numberOrUndefined(routeGroup?.totalOrders ?? routeGroup?.ordersCount)
      ?? firstArray(routeGroup?.assignments).length;

    return {
      route: textOrUndefined(routeGroup?.name) ?? "Route not found",
      status: formatRouteStatus(routeGroup?.displayStatus ?? routeGroup?.status),
      orders: orderCount,
      coordinates: "0/0",
      missingCoordinates: 0,
      deliveryDate: formatRouteDeliveryScope(routeGroup, ROUTE_EMPTY_LABEL),
    };
  }

  const stopsCount = routePlan.stopsCount ?? 0;
  const missingCoordinates = routePlan.missingCoordinates ?? 0;
  const locatedCount = Math.max(stopsCount - missingCoordinates, 0);

  return {
    route: routePlan.name ?? routePlan.id,
    status: formatRouteStatus(routePlan.status),
    orders: stopsCount,
    coordinates: `${locatedCount}/${stopsCount}`,
    missingCoordinates,
    deliveryDate: formatRouteDeliveryScope(routePlan, ROUTE_EMPTY_LABEL),
  };
}

function getLinkedInventoryId(routePlan, routeGroup, routeGroupChild, isRouteGroupDetail) {
  void isRouteGroupDetail;
  const childInventoryId = textOrUndefined(
    routePlan?.linkedInventoryId
      ?? routePlan?.inventoryId
      ?? routeGroupChild?.linkedInventoryId
      ?? routeGroupChild?.inventoryId,
  );

  return childInventoryId ?? textOrUndefined(routeGroup?.linkedInventoryId ?? routeGroup?.inventoryId);
}

function getRouteDriverId(routePlan) {
  return textOrUndefined(routePlan?.driverId ?? routePlan?.driver?.id) ?? "";
}

function getRouteStartDateTimeValue(routePlan, ianaTimezone) {
  return formatStoreLocalDateTimeInput(routePlan?.scheduledStartAt, ianaTimezone);
}

function getRouteStartTimeLabel(value) {
  if (!value) return ROUTE_EMPTY_LABEL;
  return value.replace("T", " ");
}


function getRouteCreatedLabel(routePlan) {
  return textOrUndefined(routePlan?.createdAt)?.replace("T", " ").slice(0, 16) ?? ROUTE_EMPTY_LABEL;
}

function getRouteVehicleLabel(routePlan) {
  return textOrUndefined(routePlan?.vehicle?.name ?? routePlan?.vehicleName) ?? ROUTE_EMPTY_LABEL;
}

function countRouteStopsByStatus(routeStops, statuses) {
  const statusSet = new Set(statuses);

  return routeStops.filter((stop) => statusSet.has(String(stop.status).toUpperCase())).length;
}

function getRouteTotalItems(routePlan, routeStops) {
  const explicitTotal = numberOrUndefined(routePlan?.itemSummary?.totalQuantity ?? routePlan?.totalItems ?? routePlan?.itemsCount ?? routePlan?.itemCount);
  const stopTotal = routeStops.reduce((total, stop) => total + (numberOrUndefined(stop.itemCount) ?? 0), 0);

  return explicitTotal ?? (stopTotal > 0 ? stopTotal : ROUTE_EMPTY_LABEL);
}

function getRouteMetricLabel(...values) {
  return values.map(textOrUndefined).find(Boolean) ?? ROUTE_EMPTY_LABEL;
}

function formatRouteDurationSeconds(value) {
  const seconds = numberOrUndefined(value);
  if (seconds === undefined) return undefined;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function formatRouteDistanceMeters(value) {
  const meters = numberOrUndefined(value);
  if (meters === undefined) return undefined;

  if (meters < 1000) return `${Math.round(meters)} m`;

  const kilometers = meters / 1000;
  return `${kilometers >= 10 ? Math.round(kilometers) : kilometers.toFixed(1)} km`;
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

function filterRouteSelectorOptions(options, query) {
  const normalizedQuery = textOrUndefined(query)?.toLowerCase();
  if (!normalizedQuery) return options;

  return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
}

function getRouteSelectorEmptyMessage(selectorType, query, options) {
  if (selectorType === "driver") {
    if (textOrUndefined(query) && Array.isArray(options) && options.length > 0) {
      return "No matching driver";
    }

    return "No driver found";
  }

  return "No vehicle found";
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

function formatRouteStopItemOptions(options) {
  if (!Array.isArray(options)) return textOrUndefined(options);
  return options
    .map((option) => {
      const key = textOrUndefined(option?.key ?? option?.name);
      const value = textOrUndefined(option?.value);
      return key && value ? `${key}: ${value}` : value ?? key;
    })
    .filter(Boolean)
    .join(", ");
}

function getLineItemList(lineItems) {
  if (Array.isArray(lineItems)) return lineItems;
  if (Array.isArray(lineItems?.nodes)) return lineItems.nodes;
  if (Array.isArray(lineItems?.edges)) return lineItems.edges.map((edge) => edge?.node).filter(Boolean);
  return [];
}

function getRouteStopLineItems(stop) {
  const candidates = [
    stop?.items,
    stop?.lineItems,
    stop?.shopifyOrderSnapshot?.lineItems,
    stop?.rawPayload?.lineItems,
    stop?.order?.lineItems,
    stop?.order?.shopifyOrderSnapshot?.lineItems,
    stop?.order?.rawPayload?.lineItems,
  ];
  for (const candidate of candidates) {
    const items = getLineItemList(candidate);
    if (items.length > 0) return items;
  }
  return [];
}

function normalizeRouteStopItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      name: textOrUndefined(item?.name ?? item?.title) ?? "Item",
      options: formatRouteStopItemOptions(item?.options) ?? textOrUndefined(item?.variantTitle),
      quantity: numberOrUndefined(item?.quantity) ?? 1,
      sku: textOrUndefined(item?.sku),
    }))
    .filter((item) => item.name);
}

function sumRouteStopItemQuantities(items) {
  return items.reduce((total, item) => total + (numberOrUndefined(item.quantity) ?? 0), 0);
}

function getRouteTimelineStopPopoverPosition(rect, popoverSize = {}) {
  const gap = ROUTE_TIMELINE_STOP_POPOVER_GAP;
  const width = Math.min(popoverSize.width ?? ROUTE_TIMELINE_STOP_POPOVER_WIDTH, window.innerWidth - gap * 2);
  const height = Math.min(popoverSize.height ?? ROUTE_TIMELINE_STOP_POPOVER_HEIGHT, window.innerHeight - gap * 2);
  const anchorX = rect.left + rect.width / 2;
  const rawLeft = anchorX <= window.innerWidth / 2
    ? anchorX - ROUTE_TIMELINE_STOP_POPOVER_EDGE_INSET
    : anchorX - width + ROUTE_TIMELINE_STOP_POPOVER_EDGE_INSET;
  const left = Math.max(gap, Math.min(rawLeft, window.innerWidth - width - gap));
  const aboveTop = rect.top - height - gap;
  const belowTop = rect.bottom + gap;
  const top = aboveTop >= gap
    ? aboveTop
    : Math.max(gap, Math.min(belowTop, window.innerHeight - height - gap));

  return { left, top };
}

function buildRouteStops(stops) {
  return resequenceRouteStops(stops.map((stop, index) => {
    const coordinates = normalizeRouteStopCoordinates(stop);
    const sequence = numberOrUndefined(stop.sequence ?? stop.sortOrder ?? stop.sourceSequence);
    const stopNumber = Number.isInteger(sequence) && sequence > 0
      ? sequence
      : index + 1;
    const items = normalizeRouteStopItems(getRouteStopLineItems(stop));
    const itemCount = numberOrUndefined(stop.itemCount ?? stop.itemsCount ?? stop.totalItems) ?? sumRouteStopItemQuantities(items);

    return {
      id: stop.deliveryStopId ?? stop.shopifyOrderGid ?? `route-stop-${index + 1}`,
      deliveryStopId: textOrUndefined(stop.deliveryStopId) ?? null,
      orderId: textOrUndefined(stop.orderId) ?? null,
      routePlanId: textOrUndefined(stop.routePlanId ?? stop.routePlan?.id ?? stop.routeGroupingChild?.routePlanId) ?? null,
      shopifyOrderGid: textOrUndefined(stop.shopifyOrderGid),
      originalIndex: index,
      sequence: numberOrUndefined(stop.sequence),
      sourceSequence: numberOrUndefined(stop.sourceSequence),
      sortOrder: stopNumber,
      stop: stopNumber,
      order: stop.orderName ?? stop.sourceOrderId ?? stop.shopifyOrderGid,
      recipient: stop.recipientName ?? stop.recipient ?? stop.customerName ?? "Unknown recipient",
      address: textOrUndefined(stop.addressLabel) ?? formatStopAddress(stop.address),
      status: stop.fulfillmentStatus ?? stop.status ?? stop.assignmentStatus ?? "PENDING",
      deliveryStatus: textOrUndefined(stop.deliveryStatus),
      deliveryStopStatus: textOrUndefined(stop.deliveryStopStatus),
      readiness: textOrUndefined(stop.readiness),
      planningStatus: textOrUndefined(stop.planningStatus),
      payment: stop.paymentStatus ?? stop.financialStatus ?? "—",
      attributes: stop.attributes,
      attributesLabel: formatStopAttributes(stop.attributes),
      orderCreatedAt: textOrUndefined(stop.orderCreatedAt ?? stop.createdAt ?? stop.processedAt),
      estimatedArrivalAt: textOrUndefined(stop.estimatedArrivalAt ?? stop.eta ?? stop.arrivalAt),
      durationFromPreviousSeconds: numberOrUndefined(stop.durationFromPreviousSeconds),
      distanceFromPreviousMeters: numberOrUndefined(stop.distanceFromPreviousMeters),
      serviceMinutes: numberOrUndefined(stop.serviceMinutes),
      serviceType: textOrUndefined(stop.serviceType ?? stop.method),
      itemCount,
      items,
      canonicalLineItems: stop.canonicalLineItems,
      lineItems: stop.lineItems,
      coordinatesLabel: coordinates != null ? "Yes" : "No",
      coordinates,
      hasCoordinates: coordinates != null,
    };
  }).sort((firstStop, secondStop) => (
    firstStop.sortOrder - secondStop.sortOrder || firstStop.originalIndex - secondStop.originalIndex
  )));
}

function buildRouteGroupStops(routeGroup, childRouteDetails, currentRouteStops) {
  const stopsByOrderId = new Map();
  const repairStopsByOrderId = new Map(
    childRouteDetails
      .flatMap((detail) => buildRouteStops(detail?.stops ?? []))
      .filter((stop) => stop.orderId && stop.hasCoordinates)
      .map((stop) => [stop.orderId, stop]),
  );
  const assignmentStops = buildRouteStops(routeGroup?.assignments ?? []);
  const baseStops = assignmentStops.length > 0 ? assignmentStops : currentRouteStops;

  for (const stop of baseStops) {
    const orderId = textOrUndefined(stop.orderId);
    if (!orderId || stopsByOrderId.has(orderId)) continue;

    const repairStop = repairStopsByOrderId.get(orderId);
    stopsByOrderId.set(orderId, stop.hasCoordinates || !repairStop
      ? stop
      : {
        ...stop,
        coordinates: repairStop.coordinates,
        coordinatesLabel: "Yes",
        hasCoordinates: true,
      });
  }

  if (stopsByOrderId.size === 0) {
    for (const stop of repairStopsByOrderId.values()) {
      if (stop.orderId && !stopsByOrderId.has(stop.orderId)) stopsByOrderId.set(stop.orderId, stop);
    }
  }

  return [...stopsByOrderId.values()];
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

function getRouteGroupChildOrderIds(child, detailStops, routeStops) {
  const explicitOrderIds = firstArray(
    child?.orderIds,
    child?.routePlan?.orderIds,
    child?.assignmentOrderIds,
    child?.orders?.map?.((order) => order.orderId ?? order.id),
  ).map(textOrUndefined).filter(Boolean);
  if (explicitOrderIds.length > 0) return explicitOrderIds;

  const routePlanId = getRouteGroupChildRoutePlanId(child);
  const assignedOrderIds = routePlanId
    ? routeStops
      .filter((stop) => textOrUndefined(stop.routePlanId) === routePlanId)
      .map((stop) => stop.orderId)
      .filter(Boolean)
    : [];

  return assignedOrderIds.length > 0
    ? assignedOrderIds
    : detailStops.map((stop) => stop.orderId).filter(Boolean);
}

function mapRouteChildDetailsByRoutePlanId(childRouteDetails = []) {
  const detailsByRoutePlanId = new Map();
  for (const detail of childRouteDetails) {
    const routePlanId = getRouteGroupChildRoutePlanId(detail);
    if (!routePlanId) continue;
    const stops = buildRouteStops(detail?.stops ?? []);
    detailsByRoutePlanId.set(routePlanId, {
      routeGeometry: detail.routeGeometry ?? null,
      routeMetrics: detail.routeMetrics ?? null,
      routePlan: detail.routePlan ?? null,
      routePlanId,
      routeStopPoints: Array.isArray(detail.routeStopPoints) ? detail.routeStopPoints : [],
      stops,
    });
  }
  return detailsByRoutePlanId;
}

function buildUnsplitRouteGroupRow(routeGroup, routeStops = []) {
  if (!routeGroup || routeStops.length === 0) return null;

  return {
    attemptedCount: countRouteStopsByStatus(routeStops, ["ATTEMPTED", "FAILED", "NEEDS_REVIEW"]),
    color: MAP_MARKER_PALETTE.plannedOrder.color,
    createdLabel: getRouteCreatedLabel(routeGroup),
    startDateTime: "",
    deliveredCount: countRouteStopsByStatus(routeStops, ["DELIVERED", "FULFILLED"]),
    driverLabel: "Unassigned",
    driveTimeLabel: ROUTE_EMPTY_LABEL,
    id: `routeGroup:${routeGroup.id}:routeIdx:1`,
    isCurrent: false,
    optimized: null,
    orderIds: routeStops.map((stop) => stop.orderId).filter(Boolean),
    routeIdx: 1,
    routeIndex: 1,
    routeKey: "routeIdx:1",
    routePlanId: null,
    startTimeLabel: ROUTE_EMPTY_LABEL,
    status: formatRouteStatus(routeGroup.displayStatus ?? routeGroup.status),
    stops: routeStops,
    stopsCount: routeStops.length,
    title: "#1",
    totalDistanceLabel: ROUTE_EMPTY_LABEL,
    totalItems: getRouteTotalItems(null, routeStops),
    totalWeightLabel: ROUTE_EMPTY_LABEL,
    vehicleLabel: ROUTE_EMPTY_LABEL,
  };
}

function buildRouteGroupChildRows(routeGroup, childDetailsByRoutePlanId = new Map(), routeStops = [], ianaTimezone) {
  const routeGroupChildRows = getVisibleRouteGroupChildren(routeGroup).map((child, index) => {
    const routeIdx = numberOrUndefined(child?.routeIdx);
    const routeIndex = routeIdx ?? numberOrUndefined(child?.sortOrder) ?? index + 1;
    const routePlanId = getRouteGroupChildRoutePlanId(child);
    const detail = childDetailsByRoutePlanId.get(routePlanId);
    const detailStops = detail?.stops ?? [];
    const childRoutePlan = detail?.routePlan ?? child?.routePlan ?? null;
    const childRouteMetrics = detail?.routeMetrics ?? child?.routeMetrics ?? childRoutePlan?.routeMetrics ?? null;
    const orderIds = getRouteGroupChildOrderIds(child, detailStops, routeStops);
    const stopByOrderId = new Map(routeStops.map((stop) => [stop.orderId, stop]));
    const stops = orderIds.length > 0
      ? orderIds.map((orderId) => detailStops.find((stop) => stop.orderId === orderId) ?? stopByOrderId.get(orderId)).filter(Boolean)
      : detailStops;
    const optimized = {
      metrics: childRouteMetrics,
      routeGeometry: detail?.routeGeometry ?? null,
      routeStopPoints: detail?.routeStopPoints ?? [],
    };

    return {
      attemptedCount: countRouteStopsByStatus(stops, ["ATTEMPTED", "FAILED", "NEEDS_REVIEW"]),
      color: textOrUndefined(child?.color) ?? ROUTE_DEFAULT_COLORS[index % ROUTE_DEFAULT_COLORS.length] ?? MAP_MARKER_PALETTE.plannedOrder.color,
      createdLabel: getRouteCreatedLabel(childRoutePlan),
      startDateTime: getRouteStartDateTimeValue(childRoutePlan, ianaTimezone),
      deliveredCount: countRouteStopsByStatus(stops, ["DELIVERED", "FULFILLED"]),
      driverLabel: textOrUndefined(child?.driverName ?? childRoutePlan?.driver?.displayName) ?? "Unassigned",
      driveTimeLabel: getRouteMetricLabel(formatRouteDurationSeconds(childRouteMetrics?.durationSeconds)),
      id: routePlanId ?? `group-route-${index}`,
      isCurrent: false,
      optimized,
      orderIds: orderIds.length > 0 ? orderIds : stops.map((stop) => stop.orderId).filter(Boolean),
      routeIdx: routeIdx ?? null,
      routeKey: routePlanId ? `routePlan:${routePlanId}` : `routeIdx:${routeIndex}`,
      routeIndex,
      routePlanId: routePlanId ?? null,
      startTimeLabel: getRouteStartTimeLabel(getRouteStartDateTimeValue(childRoutePlan, ianaTimezone)),
      status: formatRouteStatus(childRoutePlan?.status ?? child?.displayStatus ?? child?.status),
      stops,
      stopsCount: stops.length || orderIds.length,
      title: getRouteGroupChildRouteName(routeGroup, child, childRoutePlan, index),
      totalDistanceLabel: getRouteMetricLabel(formatRouteDistanceMeters(childRouteMetrics?.distanceMeters)),
      totalItems: getRouteTotalItems(childRoutePlan, stops),
      totalWeightLabel: getRouteMetricLabel(childRoutePlan?.totalWeight, childRoutePlan?.weight),
      vehicleLabel: getRouteVehicleLabel(childRoutePlan),
    };
  }).filter((routeRow) => routeRow.routePlanId);
  routeGroupChildRows.sort((first, second) => (
    (numberOrUndefined(first.routeIdx) ?? numberOrUndefined(first.routeIndex) ?? 0)
    - (numberOrUndefined(second.routeIdx) ?? numberOrUndefined(second.routeIndex) ?? 0)
  ));
  return routeGroupChildRows.length > 0 ? routeGroupChildRows : [buildUnsplitRouteGroupRow(routeGroup, routeStops)].filter(Boolean);
}

function applyRouteRowDraftState(routeRows, routeLineEdits, routePreviewByKey) {
  return routeRows.map((routeRow) => ({
    ...routeRow,
    color: routeLineEdits[routeRow.id]?.color ?? routeRow.color,
    optimized: routePreviewByKey[getRouteRowDraftKey(routeRow)] ?? routeRow.optimized ?? null,
    title: routeLineEdits[routeRow.id]?.title ?? routeRow.title,
  }));
}

function mergeCurrentRouteRow(routeRows, currentRouteRow) {
  if (!currentRouteRow) return routeRows;
  let didReplace = false;
  const mergedRows = routeRows.map((routeRow) => {
    const sameRoutePlan = routeRow.routePlanId && currentRouteRow.routePlanId && routeRow.routePlanId === currentRouteRow.routePlanId;
    const sameRouteKey = routeRow.routeKey && currentRouteRow.routeKey && routeRow.routeKey === currentRouteRow.routeKey;
    if (!sameRoutePlan && !sameRouteKey) return routeRow;
    didReplace = true;
    return { ...routeRow, ...currentRouteRow, isCurrent: routeRow.isCurrent };
  });
  return didReplace ? mergedRows : [currentRouteRow, ...mergedRows];
}


function normalizeRouteColor(color) {
  const text = String(color ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(text) ? text : null;
}

function getUnusedRouteColor(preferredColor, usedColors, offset = 0) {
  const preferred = normalizeRouteColor(preferredColor);
  if (preferred && !usedColors.has(preferred)) return preferred;

  for (let index = 0; index < ROUTE_DEFAULT_COLORS.length; index += 1) {
    const color = normalizeRouteColor(ROUTE_DEFAULT_COLORS[(index + offset) % ROUTE_DEFAULT_COLORS.length]);
    if (color && !usedColors.has(color)) return color;
  }

  return preferred ?? normalizeRouteColor(ROUTE_DEFAULT_COLORS[offset % ROUTE_DEFAULT_COLORS.length]) ?? MAP_MARKER_PALETTE.plannedOrder.color;
}

function ensureUniqueRouteRowColors(routeRows) {
  const usedColors = new Set();
  return routeRows.map((routeRow, index) => {
    const color = getUnusedRouteColor(routeRow.color, usedColors, index);
    usedColors.add(color);
    return { ...routeRow, color };
  });
}

function getNextChildRouteDraft(routeRows) {
  const usedColors = new Set(routeRows.map((routeRow) => normalizeRouteColor(routeRow.color)).filter(Boolean));
  const maxRouteIdx = routeRows.reduce((max, routeRow) => Math.max(max, numberOrUndefined(routeRow.routeIdx) ?? numberOrUndefined(routeRow.routeIndex) ?? 0), 0);
  const routeNumber = (maxRouteIdx || routeRows.length) + 1;
  return {
    color: getUnusedRouteColor(null, usedColors, routeNumber - 1),
    label: `#${routeNumber}`,
    routeIdx: routeNumber,
    routeIndex: routeNumber,
  };
}

function getTimelineRouteStopIds(routeRows, orderByRouteId, routeId) {
  const savedOrder = orderByRouteId[routeId];
  if (Array.isArray(savedOrder)) return savedOrder;

  return routeRows.find((routeRow) => routeRow.id === routeId)?.stops.map((stop) => stop.id) ?? [];
}

function moveTimelineStop(routeRows, orderByRouteId, drag, targetRouteId, afterStopId = null) {
  if (!drag?.stopId || !targetRouteId) return orderByRouteId;

  const currentOrder = Object.fromEntries(routeRows.map((routeRow) => [
    routeRow.id,
    getTimelineRouteStopIds(routeRows, orderByRouteId, routeRow.id),
  ]));
  const nextOrder = Object.fromEntries(Object.entries(currentOrder).map(([routeId, stopIds]) => [
    routeId,
    stopIds.filter((stopId) => stopId !== drag.stopId),
  ]));
  const targetOrder = nextOrder[targetRouteId] ?? [];
  const targetIndex = afterStopId === "__start__"
    ? 0
    : afterStopId
      ? targetOrder.indexOf(afterStopId) + 1
      : targetOrder.length;
  targetOrder.splice(Math.max(0, targetIndex), 0, drag.stopId);
  nextOrder[targetRouteId] = targetOrder;

  const didChange = Object.keys(nextOrder).some((routeId) => {
    return (currentOrder[routeId] ?? []).join("|") !== (nextOrder[routeId] ?? []).join("|");
  });

  return didChange ? nextOrder : orderByRouteId;
}

function removeTimelineStop(routeRows, orderByRouteId, drag) {
  if (!drag?.stopId) return orderByRouteId;

  return Object.fromEntries(routeRows.map((routeRow) => [
    routeRow.id,
    getTimelineRouteStopIds(routeRows, orderByRouteId, routeRow.id).filter((stopId) => stopId !== drag.stopId),
  ]));
}

function buildTimelineRows(routeRows, orderByRouteId) {
  const stopById = new Map(routeRows.flatMap((routeRow) => routeRow.stops.map((stop) => [stop.id, stop])));

  return routeRows.map((routeRow) => {
    const stops = getTimelineRouteStopIds(routeRows, orderByRouteId, routeRow.id)
      .map((stopId) => stopById.get(stopId))
      .filter(Boolean);
    const displayedStops = resequenceRouteStops(stops);

    const displayedTotalItems = displayedStops.reduce((total, stop) => (
      total + (numberOrUndefined(stop.itemCount) ?? 0)
    ), 0);

    const optimized = readRouteOptimizedSnapshot(routeRow.optimized);

    return {
      ...routeRow,
      attemptedCount: countRouteStopsByStatus(displayedStops, ["ATTEMPTED", "FAILED", "NEEDS_REVIEW"]),
      deliveredCount: countRouteStopsByStatus(displayedStops, ["DELIVERED", "FULFILLED"]),
      stops: displayedStops,
      stopsCount: displayedStops.length,
      driveTimeLabel: getRouteMetricLabel(formatRouteDurationSeconds(optimized?.metrics?.durationSeconds), routeRow.driveTimeLabel),
      totalDistanceLabel: getRouteMetricLabel(formatRouteDistanceMeters(optimized?.metrics?.distanceMeters), routeRow.totalDistanceLabel),
      totalItems: displayedStops.length > 0 ? displayedTotalItems : 0,
    };
  });
}

function buildRouteGeometryRows(routeRows, childDetailsByRoutePlanId, fallbackRouteGeometry, fallbackRouteStopPoints) {
  const hasBranchRoutes = routeRows.some((routeRow) => !routeRow.isCurrent && routeRow.stops.length > 0);

  return routeRows.map((routeRow) => {
    const childDetail = childDetailsByRoutePlanId.get(textOrUndefined(routeRow.routePlanId));
    const canUseFallback = !hasBranchRoutes && routeRow.isCurrent;
    return {
      routeColor: softenRouteColor(routeRow.color),
      routeGeometry: routeRow.optimized?.routeGeometry ?? childDetail?.routeGeometry ?? (canUseFallback ? fallbackRouteGeometry : null),
      routeId: routeRow.id,
      routeStopPoints: routeRow.optimized?.routeStopPoints ?? childDetail?.routeStopPoints ?? (canUseFallback ? fallbackRouteStopPoints : []),
    };
  });
}

function getRouteRowDraftKey(routeRow) {
  if (routeRow.routeKey) return routeRow.routeKey;
  if (routeRow.routePlanId) return `routePlan:${routeRow.routePlanId}`;
  if (routeRow.tempId) return routeRow.tempId;
  if (numberOrUndefined(routeRow.routeIdx) !== undefined) return `routeIdx:${routeRow.routeIdx}`;
  return routeRow.id;
}

function getRouteDraftOptimized(routeRow, includeExistingOptimized) {
  if (routeRow.routePlanId && !includeExistingOptimized) return undefined;
  return routeRow.optimized ?? null;
}

function shouldIncludeRouteDraftRow(routeRow, includeEmptyTempRoutes) {
  if (includeEmptyTempRoutes) return true;
  return !(routeRow.tempId && !routeRow.routePlanId && routeRow.stops.length === 0);
}

function buildRouteDraftPayload(routeRows, { includeEmptyTempRoutes = true, includeExistingOptimized = true } = {}) {
  return {
    mode: "OPTIMIZE_ORDER",
    routes: routeRows.filter((routeRow) => shouldIncludeRouteDraftRow(routeRow, includeEmptyTempRoutes)).map((routeRow, index) => {
      const optimized = getRouteDraftOptimized(routeRow, includeExistingOptimized);
      return {
        color: routeRow.color,
        label: routeRow.title,
        ...(optimized === undefined ? {} : { optimized }),
        orderIds: routeRow.stops.map((stop) => stop.orderId).filter(Boolean),
        routeKey: getRouteRowDraftKey(routeRow),
        routeIdx: numberOrUndefined(routeRow.routeIdx) ?? numberOrUndefined(routeRow.routeIndex) ?? index + 1,
        routePlanId: routeRow.routePlanId ?? null,
        sortOrder: numberOrUndefined(routeRow.routeIndex) ?? index + 1,
        tempId: routeRow.tempId ?? null,
      };
    }),
  };
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

function renderRouteLineEditIcon() {
  return (
    <img alt="" aria-hidden="true" src="/icons/route-edit.png" style={routeLineEditIconStyle} />
  );
}

function renderRoutePolygonEditIcon() {
  return (
    <img alt="" aria-hidden="true" src="/icons/route-polygon-edit.png" style={routePolygonEditIconStyle} />
  );
}

function renderRouteTimelineStartIcon() {
  return (
    <svg aria-hidden="true" style={routeTimelineStartIconStyle} viewBox="0 0 20 20">
      <path d="M10 3.2 3.5 8.4v8.1h4v-5h5v5h4V8.4L10 3.2Z" />
    </svg>
  );
}

function renderChildRouteTimelineStartMarker() {
  return (
    <span aria-label="Route start" role="img" style={childRouteTimelineStartMarkerStyle}>
      <svg aria-hidden="true" style={routeTimelineStartIconStyle} viewBox="0 0 20 20">
        <path d="m10 2.8 2.2 4.45 4.9.72-3.55 3.46.84 4.88L10 14l-4.39 2.31.84-4.88L2.9 7.97l4.9-.72L10 2.8Z" />
      </svg>
    </span>
  );
}

function renderChildRouteTimelineEndMarker() {
  return <span aria-label="Route end" role="img" style={childRouteTimelineEndMarkerStyle} />;
}

function renderChildRouteInfoIcon() {
  return (
    <svg aria-hidden="true" fill="none" style={childRouteDisclosureInfoIconStyle} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.25v3.5M8 5.1h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

export default function RouteDetailPage() {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const routeActionFetcher = useFetcher();
  const {
    childRouteDetails = [],
    currentDepartureLocation = null,
    drivers = [],
    routePlan,
    routeGeometry = null,
    routeGroup = null,
    routeDetailTitleOverride = null,
    routeMetrics = null,
    routeStopPoints = [],
    stops = [],
    errors = [],
    ianaTimezone,
    timezoneAbbreviation,
  } = useLoaderData();
  const effectiveRoutePlan = routePlan;
  const routesListHref = ROUTES_ROOT_PATH;
  const isRouteGroupDetail = !effectiveRoutePlan && routeGroup != null;
  const isMaterializedChildRouteDetail = getIsMaterializedChildRouteDetail({
    routeGroup,
    routePlan: effectiveRoutePlan,
  });
  const routeDetail = useMemo(() => buildRouteDetail(effectiveRoutePlan, routeGroup), [effectiveRoutePlan, routeGroup]);
  const routeDetailTitle = textOrUndefined(routeDetailTitleOverride) ?? (isRouteGroupDetail ? textOrUndefined(routeGroup?.name) : textOrUndefined(routeDetail.route)) ?? "Route";
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
  const orderedRouteStops = useMemo(() => buildRouteStops(stops), [stops]);
  const routeChildDetailsByRoutePlanId = useMemo(() => mapRouteChildDetailsByRoutePlanId(childRouteDetails), [childRouteDetails]);
  const allRouteGroupStops = useMemo(
    () => buildRouteGroupStops(routeGroup, childRouteDetails, orderedRouteStops),
    [childRouteDetails, orderedRouteStops, routeGroup],
  );
  const routeGroupStopsSource = routeGroup ? allRouteGroupStops : orderedRouteStops;
  const routeGroupChildRows = useMemo(
    () => buildRouteGroupChildRows(routeGroup, routeChildDetailsByRoutePlanId, routeGroupStopsSource, ianaTimezone),
    [ianaTimezone, routeChildDetailsByRoutePlanId, routeGroup, routeGroupStopsSource],
  );
  const siblingRouteRows = routeGroupChildRows.filter((routeRow) => routeRow.routePlanId);
  const defaultRouteCandidateTitle = isRouteGroupDetail ? "#1" : routeDetailTitle;
  const routeStartDateTimeValue = getRouteStartDateTimeValue(effectiveRoutePlan, ianaTimezone);
  const routeStartTimeLabel = getRouteStartTimeLabel(routeStartDateTimeValue);
  const routeDeliveredCount = countRouteStopsByStatus(orderedRouteStops, ["DELIVERED", "FULFILLED"]);
  const routeAttemptedCount = countRouteStopsByStatus(orderedRouteStops, ["ATTEMPTED", "FAILED"]);
  const routeTotalItems = getRouteTotalItems(effectiveRoutePlan, orderedRouteStops);
  const routeTotalDriveTime = getRouteMetricLabel(formatRouteDurationSeconds(routeMetrics?.durationSeconds));
  const routeTotalDistance = getRouteMetricLabel(formatRouteDistanceMeters(routeMetrics?.distanceMeters));
  const routeTotalWeight = getRouteMetricLabel(effectiveRoutePlan?.totalWeight, effectiveRoutePlan?.weight);
  const routeVehicleLabel = getRouteVehicleLabel(effectiveRoutePlan);
  const routeCreatedLabel = getRouteCreatedLabel(effectiveRoutePlan);
  const routeUpdatedLabel = formatStoreLocalOrderDate(
    effectiveRoutePlan?.updatedAt ?? effectiveRoutePlan?.modifiedAt ?? effectiveRoutePlan?.createdAt,
    ianaTimezone,
  );
  const routeGroupId = textOrUndefined(effectiveRoutePlan?.routeGroupingChild?.groupingId) ?? textOrUndefined(routeGroup?.id);
  const currentSiblingRouteIndex = siblingRouteRows.findIndex((routeRow) => routeRow.routePlanId === effectiveRoutePlan?.id);
  const previousSiblingRoute = siblingRouteRows[currentSiblingRouteIndex - 1] ?? null;
  const nextSiblingRoute = siblingRouteRows[currentSiblingRouteIndex + 1] ?? null;
  const currentRouteGroupChild = useMemo(() => {
    const routePlanId = textOrUndefined(effectiveRoutePlan?.id);
    return (routeGroup?.children ?? []).find((child) => getRouteGroupChildRoutePlanId(child) === routePlanId) ?? null;
  }, [effectiveRoutePlan?.id, routeGroup]);
  const linkedInventoryId = getLinkedInventoryId(effectiveRoutePlan, routeGroup, currentRouteGroupChild, isRouteGroupDetail);
  const inventoryDetailHref = linkedInventoryId ? `/app/orders/inventory?id=${encodeURIComponent(linkedInventoryId)}` : null;
  const defaultRouteLineColor = normalizeRouteColor(currentRouteGroupChild?.color) ?? MAP_MARKER_PALETTE.plannedOrder.color;
  const routeGroupActionBusy = routeActionFetcher.state !== "idle";
  const routeGroupActionIntent = routeActionFetcher.formData?.get("_intent");
  const reOptimizeRouteGroupBusy = routeGroupActionBusy && routeGroupActionIntent === "previewRouteOptimization";
  const addEmptyRouteBranchBusy = false;
  const saveRouteDraftBusy = routeGroupActionBusy && routeGroupActionIntent === "saveRouteDraft";
  const deleteRouteBusy = routeGroupActionBusy && routeGroupActionIntent === "deleteRoute";
  const saveRouteStartTimeBusy = routeGroupActionBusy && routeGroupActionIntent === "saveRouteStartTime";
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLibraryRef = useRef(null);
  const routeMapCenterRef = useRef(DEFAULT_CENTER);
  const markersRef = useRef([]);
  const routeTimelineStopRefs = useRef(new Map());
  const routeTimelineStopPopoverRef = useRef(null);
  const childOrderDisclosureCloseTimerRef = useRef(null);
  const childOrderDisclosureCloseButtonRef = useRef(null);
  const childOrderDisclosurePopoverRef = useRef(null);
  const childOrderDisclosureTriggerRef = useRef(null);
  const routeTimelineDragRef = useRef(null);
  const routeTimelineDragSnapshotRef = useRef(null);
  const routeTimelineDropCommittedRef = useRef(false);
  const lastRouteActionIntentRef = useRef(null);
  const navigateAfterRouteDraftSaveRef = useRef(false);
  const routePolygonCornerDragIndexRef = useRef(null);
  const routePolygonSkipNextMapClickRef = useRef(false);
  const routePolygonSkipNextMapClickTimerRef = useRef(null);
  const routePolygonPointsRef = useRef([]);
  const routePolygonClosedRef = useRef(false);
  const mapLoadedRef = useRef(false);
  const mapRecoveryAttemptsRef = useRef(0);
  const mapRecoveryTimerRef = useRef(null);
  const markerDiagnosticCountRef = useRef(0);
  const hasInitialRouteMapFitRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapStatus, setMapStatus] = useState("loading");
  const [mapRenderKey, setMapRenderKey] = useState(0);
  const [routeCandidateTitle, setRouteCandidateTitle] = useState(defaultRouteCandidateTitle);
  const [routeLineColor, setRouteLineColor] = useState(defaultRouteLineColor);
  const [routeLineDraftTitle, setRouteLineDraftTitle] = useState(defaultRouteCandidateTitle);
  const [routeLineDraftColor, setRouteLineDraftColor] = useState(defaultRouteLineColor);
  const [activeRouteLineId, setActiveRouteLineId] = useState(null);
  const [routeLineEdits, setRouteLineEdits] = useState({});
  const [isRouteLineEditorOpen, setIsRouteLineEditorOpen] = useState(false);
  const [isRouteDraftExitDialogOpen, setIsRouteDraftExitDialogOpen] = useState(false);
  const [isSiblingRouteMenuOpen, setIsSiblingRouteMenuOpen] = useState(false);
  const [routeGroupClientError, setRouteGroupClientError] = useState(null);
  const [isRoutePolygonEditMode, setIsRoutePolygonEditMode] = useState(false);
  const [routeTimelineOrderByRouteId, setRouteTimelineOrderByRouteId] = useState({});
  const [clientRouteRows, setClientRouteRows] = useState([]);
  const [routePreviewByKey, setRoutePreviewByKey] = useState({});
  const [routeTimelineDrag, setRouteTimelineDrag] = useState(null);
  const [activeRouteTimelineStopPopover, setActiveRouteTimelineStopPopover] = useState(null);
  const [activeChildOrderDisclosure, setActiveChildOrderDisclosure] = useState(null);
  const [activeRouteSelector, setActiveRouteSelector] = useState(null);
  const [routeSelectorQuery, setRouteSelectorQuery] = useState("");
  const [routeStartDateTimeDraft, setRouteStartDateTimeDraft] = useState(routeStartDateTimeValue);
  const [routePolygonPoints, setRoutePolygonPoints] = useState([]);
  const [isRoutePolygonClosed, setIsRoutePolygonClosed] = useState(false);
  const [isPolygonTargetPickerOpen, setIsPolygonTargetPickerOpen] = useState(false);
  const [polygonSelectedOrderIds, setPolygonSelectedOrderIds] = useState([]);
  useEffect(() => {
    setRouteStartDateTimeDraft(routeStartDateTimeValue);
  }, [effectiveRoutePlan?.id, routeStartDateTimeValue]);
  const currentRouteLineId = effectiveRoutePlan?.id ?? null;
  const currentRouteRowsSource = isRouteGroupDetail || !currentRouteLineId
    ? []
    : [
      {
        attemptedCount: routeAttemptedCount,
        color: routeLineColor,
        createdLabel: routeCreatedLabel,
        startDateTime: routeStartDateTimeValue,
        deliveredCount: routeDeliveredCount,
        driverLabel: routeDriverSummary,
        driveTimeLabel: routeTotalDriveTime,
        id: currentRouteLineId,
        isCurrent: true,
        optimized: routeMetrics ? { metrics: routeMetrics, routeGeometry, routeStopPoints } : null,
        orderIds: orderedRouteStops.map((stop) => stop.orderId).filter(Boolean),
        routeIdx: numberOrUndefined(currentRouteGroupChild?.routeIdx) ?? 1,
        routeIndex: numberOrUndefined(currentRouteGroupChild?.routeIdx) ?? 1,
        routeKey: `routePlan:${textOrUndefined(effectiveRoutePlan?.id) ?? currentRouteLineId}`,
        routePlanId: textOrUndefined(effectiveRoutePlan?.id) ?? null,
        startTimeLabel: routeStartTimeLabel,
        status: formatRouteStatus(effectiveRoutePlan?.status),
        stops: orderedRouteStops,
        stopsCount: orderedRouteStops.length,
        title: routeCandidateTitle,
        totalDistanceLabel: routeTotalDistance,
        totalItems: routeTotalItems,
        totalWeightLabel: routeTotalWeight,
        vehicleLabel: routeVehicleLabel,
      },
    ];
  const groupRouteRowsSource = routeGroupChildRows;
  const displayRouteRowsSource = isRouteGroupDetail ? groupRouteRowsSource : currentRouteRowsSource;
  const contextRouteRowsSource = isRouteGroupDetail
    ? groupRouteRowsSource
    : mergeCurrentRouteRow(groupRouteRowsSource, currentRouteRowsSource[0]);
  const routeRows = ensureUniqueRouteRowColors(applyRouteRowDraftState([...displayRouteRowsSource, ...clientRouteRows], routeLineEdits, routePreviewByKey));
  const contextRouteRows = ensureUniqueRouteRowColors(applyRouteRowDraftState([...contextRouteRowsSource, ...clientRouteRows], routeLineEdits, routePreviewByKey));
  const timelineRouteRows = buildTimelineRows(routeRows, routeTimelineOrderByRouteId);
  const contextTimelineRouteRows = buildTimelineRows(contextRouteRows, routeTimelineOrderByRouteId);
  const currentTimelineRouteRow = timelineRouteRows.find((routeRow) => routeRow.routePlanId === effectiveRoutePlan?.id) ?? timelineRouteRows[0] ?? null;
  const childRouteOrderRows = isMaterializedChildRouteDetail
    ? buildChildRouteOrderRows(currentTimelineRouteRow?.stops ?? [], { ianaTimezone, timezoneAbbreviation })
    : [];
  const activeChildOrderDisclosureRow = activeChildOrderDisclosure
    ? childRouteOrderRows.find((row) => row.id === activeChildOrderDisclosure.rowId) ?? null
    : null;
  const activeRouteTimelineStop = activeRouteTimelineStopPopover
    ? timelineRouteRows.flatMap((routeRow) => routeRow.stops).find((stop) => stop.id === activeRouteTimelineStopPopover.stopId)
    : null;
  const routeSelectorBaseOptions = activeRouteSelector?.type === "driver" ? routeDriverOptions : [];
  const routeSelectorOptions = filterRouteSelectorOptions(routeSelectorBaseOptions, routeSelectorQuery);
  const routeSelectorEmptyMessage = activeRouteSelector
    ? getRouteSelectorEmptyMessage(activeRouteSelector.type, routeSelectorQuery, routeSelectorBaseOptions)
    : "";
  const routeTimelineRowsMinHeight = `${Math.max(1, timelineRouteRows.length) * 24}px`;
  const hasRouteAllocationDraft = Object.keys(routeTimelineOrderByRouteId).length > 0
    || clientRouteRows.length > 0
    || Object.keys(routeLineEdits).length > 0
    || Object.keys(routePreviewByKey).length > 0;
  const canSaveRouteDraft = hasRouteAllocationDraft && !routeGroupActionBusy && !isRoutePolygonEditMode && !isRouteLineEditorOpen;
  const routePolygonSourceStops = timelineRouteRows.length > 0
    ? timelineRouteRows.flatMap((routeRow) => routeRow.stops)
    : isRouteGroupDetail ? routeGroupStopsSource : [];
  const polygonCandidateStops = isRoutePolygonClosed && routePolygonPoints.length >= 3
    ? routePolygonSourceStops.filter((stop) => stop.orderId && stop.hasCoordinates && isLngLatInPolygon(stop.coordinates, routePolygonPoints))
    : [];
  const polygonCandidateOrderIds = polygonCandidateStops.map((stop) => stop.orderId);
  const canSaveRoutePolygon = polygonCandidateOrderIds.length > 0;
  const polygonHighlightedOrderIds = useMemo(
    () => new Set(isPolygonTargetPickerOpen ? polygonSelectedOrderIds : polygonCandidateOrderIds),
    [isPolygonTargetPickerOpen, polygonCandidateOrderIds, polygonSelectedOrderIds],
  );
  const routeStopColorById = useMemo(() => new Map(timelineRouteRows.flatMap((routeRow) => (
    routeRow.stops.flatMap((stop) => [
      [stop.id, routeRow.color],
      ...(stop.deliveryStopId ? [[stop.deliveryStopId, routeRow.color]] : []),
      ...(stop.orderId ? [[stop.orderId, routeRow.color]] : []),
    ])
  ))), [timelineRouteRows]);
  const routeMapStops = useMemo(() => {
    if (timelineRouteRows.length > 0) {
      return timelineRouteRows.flatMap((routeRow) =>
        routeRow.stops.map((stop) => ({
          ...stop,
          isPolygonSelected: polygonHighlightedOrderIds.has(stop.orderId),
          routeColor: routeStopColorById.get(stop.id) ?? routeRow.color,
        })),
      );
    }

    return isRouteGroupDetail
      ? routeGroupStopsSource.map((stop) => ({
        ...stop,
        isPolygonSelected: polygonHighlightedOrderIds.has(stop.orderId),
        routeColor: routeLineColor,
      }))
      : [];
  }, [isRouteGroupDetail, polygonHighlightedOrderIds, routeGroupStopsSource, routeLineColor, routeStopColorById, timelineRouteRows]);
  const routeMapLocationsSource = routeMapStops.length > 0 ? routeMapStops : orderedRouteStops;
  const routeMapCenter = useMemo(
    () => getRouteMapCenter(departureLocation, routeMapLocationsSource),
    [departureLocation, routeMapLocationsSource],
  );
  const routeMapLocations = useMemo(
    () => getRouteMapLocations(departureLocation, routeMapLocationsSource),
    [departureLocation, routeMapLocationsSource],
  );
  const routeGeometryRows = useMemo(
    () => buildRouteGeometryRows(timelineRouteRows, routeChildDetailsByRoutePlanId, routeGeometry, routeStopPoints),
    [routeChildDetailsByRoutePlanId, routeGeometry, routeStopPoints, timelineRouteRows],
  );
  const routeGeometryStopPoints = routeGeometryRows.flatMap((routeRow) => routeRow.routeStopPoints);
  const visibleErrors = [
    ...(routeGroupClientError ? [{ message: routeGroupClientError }] : []),
    ...(routeActionFetcher.data?.errors ?? []),
    ...(errors ?? []),
  ];
  const routePathColor = softenRouteColor(routeLineColor);
  const savedRouteGeometryRows = routeGeometryRows;
  const savedRouteStopPoints = routeGeometryStopPoints;
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

  const clearRoutePolygonMapClickSuppression = () => {
    routePolygonSkipNextMapClickRef.current = false;
    if (routePolygonSkipNextMapClickTimerRef.current) {
      window.clearTimeout(routePolygonSkipNextMapClickTimerRef.current);
      routePolygonSkipNextMapClickTimerRef.current = null;
    }
  };

  const suppressNextRoutePolygonMapClick = () => {
    routePolygonSkipNextMapClickRef.current = true;
    if (routePolygonSkipNextMapClickTimerRef.current) {
      window.clearTimeout(routePolygonSkipNextMapClickTimerRef.current);
    }
    routePolygonSkipNextMapClickTimerRef.current = window.setTimeout(() => {
      routePolygonSkipNextMapClickRef.current = false;
      routePolygonSkipNextMapClickTimerRef.current = null;
    }, 250);
  };

  const setRoutePolygonDraftPoints = (nextPoints) => {
    routePolygonPointsRef.current = nextPoints;
    setRoutePolygonPoints(nextPoints);
  };

  const setRoutePolygonClosed = (nextIsClosed) => {
    routePolygonClosedRef.current = nextIsClosed;
    setIsRoutePolygonClosed(nextIsClosed);
  };

  const resetRoutePolygonDraft = () => {
    setRoutePolygonDraftPoints([]);
    setRoutePolygonClosed(false);
    setIsPolygonTargetPickerOpen(false);
    setPolygonSelectedOrderIds([]);
  };

  const handleToggleRoutePolygonEditMode = () => {
    setIsRoutePolygonEditMode((currentMode) => {
      if (currentMode) resetRoutePolygonDraft();
      return !currentMode;
    });
  };

  const handlePrepareSavePolygon = () => {
    if (!canSaveRoutePolygon) return;

    if (polygonCandidateOrderIds.length === 0) {
      setRouteGroupClientError("폴리곤 안에 들어온 주문이 없습니다.");
      setIsPolygonTargetPickerOpen(false);
      return;
    }

    setRouteGroupClientError(null);
    setPolygonSelectedOrderIds(Array.from(new Set(polygonCandidateOrderIds)));
    setIsPolygonTargetPickerOpen(true);
  };

  const handleAssignPolygonToRoute = (targetRouteRow) => {
    if (polygonSelectedOrderIds.length === 0) return;

    const selectedOrderIdSet = new Set(polygonSelectedOrderIds);
    const selectedStopIds = timelineRouteRows
      .flatMap((routeRow) => routeRow.stops)
      .filter((stop) => selectedOrderIdSet.has(stop.orderId))
      .map((stop) => stop.id);

    setRoutePreviewByKey({});
    setRouteTimelineOrderByRouteId((currentOrderByRouteId) => {
      return selectedStopIds.reduce((nextOrderByRouteId, stopId) => (
        moveTimelineStop(routeRows, nextOrderByRouteId, { stopId }, targetRouteRow.id)
      ), currentOrderByRouteId);
    });
    resetRoutePolygonDraft();
    setIsRoutePolygonEditMode(false);
  };

  const handleOpenRouteLineEditor = (routeRow) => {
    setActiveRouteLineId(routeRow.id);
    setRouteLineDraftTitle(routeRow.title);
    setRouteLineDraftColor(routeRow.color);
    setIsRouteLineEditorOpen(true);
  };

  const handleOpenRouteSelector = (selectorType, routeRow) => {
    setActiveRouteSelector({
      startDateTime: routeRow.startDateTime ?? "",
      routePlanId: routeRow.routePlanId,
      routeTitle: routeRow.title,
      title: selectorType === "vehicle" ? "Vehicle" : selectorType === "startTime" ? "Start time" : "Driver",
      type: selectorType,
    });
    if (selectorType === "startTime") setRouteStartDateTimeDraft(routeRow.startDateTime ?? "");
    setRouteSelectorQuery("");
  };

  const handleSelectRouteDriver = async (driverId) => {
    if (activeRouteSelector?.type !== "driver" || !activeRouteSelector.routePlanId || routeGroupActionBusy) return;

    try {
      setRouteGroupClientError(null);
      const sessionToken = await shopify.idToken();
      const formData = new FormData();
      formData.set("_intent", "saveRouteDriver");
      formData.set("driverId", driverId);
      formData.set("routePlanId", activeRouteSelector.routePlanId);
      formData.set("shopifySessionToken", sessionToken);
      routeActionFetcher.submit(formData, { method: "post" });
      setActiveRouteSelector(null);
    } catch {
      setRouteGroupClientError(
        "Shopify session token을 가져오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.",
      );
    }
  };

  const handleSaveRouteStartTime = async () => {
    const targetRoutePlanId = activeRouteSelector?.type === "startTime"
      ? activeRouteSelector.routePlanId
      : effectiveRoutePlan?.id;
    if (!targetRoutePlanId || routeGroupActionBusy) return;
    const scheduledStartAt = routeStartDateTimeDraft === ""
      ? null
      : storeLocalDateTimeToIso(routeStartDateTimeDraft, ianaTimezone);
    if (routeStartDateTimeDraft !== "" && scheduledStartAt === null) {
      setRouteGroupClientError("출발 날짜와 시간을 모두 선택해주세요.");
      return;
    }

    try {
      setRouteGroupClientError(null);
      const sessionToken = await shopify.idToken();
      const formData = new FormData();
      formData.set("_intent", "saveRouteStartTime");
      formData.set("scheduledStartAt", scheduledStartAt ?? "");
      formData.set("routePlanId", targetRoutePlanId);
      formData.set("shopifySessionToken", sessionToken);
      routeActionFetcher.submit(formData, { method: "post" });
      if (activeRouteSelector?.type === "startTime") setActiveRouteSelector(null);
    } catch {
      setRouteGroupClientError(
        "Shopify session token을 가져오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.",
      );
    }
  };

  const handleSaveRouteLineEditor = () => {
    const title = routeLineDraftTitle.trim() || defaultRouteCandidateTitle;
    const usedColors = new Set(routeRows
      .filter((routeRow) => routeRow.id !== activeRouteLineId)
      .map((routeRow) => normalizeRouteColor(routeRow.color))
      .filter(Boolean));
    const color = getUnusedRouteColor(routeLineDraftColor, usedColors, routeRows.findIndex((routeRow) => routeRow.id === activeRouteLineId));
    if (activeRouteLineId === currentRouteLineId) {
      setRouteCandidateTitle(title);
      setRouteLineColor(color);
    }
    if (activeRouteLineId) {
      setRouteLineEdits((currentEdits) => ({
        ...currentEdits,
        [activeRouteLineId]: { color, title },
      }));
    }
    setIsRouteLineEditorOpen(false);
  };

  const setRouteTimelineStopRef = useCallback((stopId, node) => {
    if (node) {
      routeTimelineStopRefs.current.set(stopId, node);
      return;
    }

    routeTimelineStopRefs.current.delete(stopId);
  }, []);

  const getRouteTimelineStopPopoverState = useCallback((stopId, mode = "pinned") => {
    const node = routeTimelineStopRefs.current.get(stopId);
    if (!node) return null;
    return {
      ...getRouteTimelineStopPopoverPosition(node.getBoundingClientRect()),
      mode,
      stopId,
    };
  }, []);

  const positionRouteTimelineStopPopover = useCallback((stopId = activeRouteTimelineStopPopover?.stopId) => {
    const stopNode = stopId ? routeTimelineStopRefs.current.get(stopId) : null;
    const popoverNode = routeTimelineStopPopoverRef.current;
    if (!stopNode || !popoverNode) return;

    const nextPosition = getRouteTimelineStopPopoverPosition(stopNode.getBoundingClientRect(), {
      height: popoverNode.offsetHeight,
      width: popoverNode.offsetWidth,
    });
    popoverNode.style.transform = `translate3d(${Math.round(nextPosition.left)}px, ${Math.round(nextPosition.top)}px, 0)`;
  }, [activeRouteTimelineStopPopover?.stopId]);

  const readRouteTimelineStopRects = useCallback(() => {
    return new Map([...routeTimelineStopRefs.current.entries()].map(([stopId, node]) => [
      stopId,
      node.getBoundingClientRect(),
    ]));
  }, []);

  const animateRouteTimelineChange = useCallback((applyChange) => {
    const previousRects = readRouteTimelineStopRects();

    flushSync(applyChange);
    window.requestAnimationFrame(() => {
      for (const [stopId, node] of routeTimelineStopRefs.current.entries()) {
        const previousRect = previousRects.get(stopId);
        if (!previousRect) continue;

        const nextRect = node.getBoundingClientRect();
        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;
        if (Math.abs(deltaX) < 1 || Math.abs(deltaY) > 4) continue;

        node.style.transition = "none";
        node.style.transform = `translateX(${deltaX}px)`;
        node.getBoundingClientRect();
        node.style.transition = "transform 180ms ease";
        node.style.transform = "";
      }
    });
  }, [readRouteTimelineStopRects]);

  const moveDraggedTimelineStop = useCallback((targetRouteId, afterStopId = null) => {
    const drag = routeTimelineDragRef.current;
    if (!drag) return;

    setRoutePreviewByKey({});
    animateRouteTimelineChange(() => {
      setRouteTimelineOrderByRouteId((currentOrderByRouteId) => moveTimelineStop(
        routeRows,
        currentOrderByRouteId,
        drag,
        targetRouteId,
        afterStopId,
      ));
    });
  }, [animateRouteTimelineChange, routeRows]);

  const handleRouteTimelineDragStart = (event, routeRow, stop) => {
    const drag = { routeId: routeRow.id, stopId: stop.id };
    routeTimelineDragRef.current = drag;
    routeTimelineDragSnapshotRef.current = {
      orderByRouteId: routeTimelineOrderByRouteId,
      previewByKey: routePreviewByKey,
    };
    routeTimelineDropCommittedRef.current = false;
    setActiveRouteTimelineStopPopover(null);
    setRouteTimelineDrag(drag);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", stop.id);
    event.dataTransfer.setDragImage(event.currentTarget, 9, 9);
  };

  const handleRouteTimelineStopClick = (event, stop) => {
    event.stopPropagation();
    if (isMapReady && mapRef.current && mapLibraryRef.current) {
      fitRouteStopAndSnappedPoint(
        mapRef.current,
        mapLibraryRef.current,
        stop,
        findRouteStopPoint(stop, savedRouteStopPoints),
      );
    }
    setActiveRouteTimelineStopPopover((current) => current?.mode === "pinned" && current.stopId === stop.id
      ? null
      : getRouteTimelineStopPopoverState(stop.id, "pinned"));
  };

  const handleRouteTimelineStopMouseEnter = (stop) => {
    setActiveRouteTimelineStopPopover((current) => current?.mode === "pinned"
      ? current
      : getRouteTimelineStopPopoverState(stop.id, "hover"));
  };

  const handleRouteTimelineStopMouseLeave = (stop) => {
    setActiveRouteTimelineStopPopover((current) => (
      current?.mode === "hover" && current.stopId === stop.id ? null : current
    ));
  };

  const cancelChildOrderDisclosureClose = () => {
    if (childOrderDisclosureCloseTimerRef.current == null) return;
    window.clearTimeout(childOrderDisclosureCloseTimerRef.current);
    childOrderDisclosureCloseTimerRef.current = null;
  };

  const getChildOrderDisclosureState = (event, rowId, type, mode) => {
    childOrderDisclosureTriggerRef.current = event.currentTarget;
    return {
      ...getChildOrderDisclosurePopoverPosition(event.currentTarget.getBoundingClientRect()),
      mode,
      rowId,
      type,
    };
  };

  const handleChildOrderDisclosureMouseEnter = (event, rowId, type) => {
    cancelChildOrderDisclosureClose();
    const next = getChildOrderDisclosureState(event, rowId, type, "hover");
    setActiveChildOrderDisclosure((current) => current?.mode === "pinned" ? current : next);
  };

  const handleChildOrderDisclosureMouseLeave = () => {
    cancelChildOrderDisclosureClose();
    childOrderDisclosureCloseTimerRef.current = window.setTimeout(() => {
      childOrderDisclosureCloseTimerRef.current = null;
      setActiveChildOrderDisclosure((current) => current?.mode === "hover" ? null : current);
    }, 40);
  };

  const handleToggleChildOrderDisclosure = (event, rowId, type) => {
    event.stopPropagation();
    cancelChildOrderDisclosureClose();
    const next = getChildOrderDisclosureState(event, rowId, type, "pinned");
    setActiveChildOrderDisclosure((current) => (
      current?.mode === "pinned" && current.rowId === rowId && current.type === type ? null : next
    ));
  };

  const positionChildOrderDisclosurePopover = useCallback(() => {
    const triggerNode = childOrderDisclosureTriggerRef.current;
    const popoverNode = childOrderDisclosurePopoverRef.current;
    if (!triggerNode || !popoverNode) return;

    const nextPosition = getChildOrderDisclosurePopoverPosition(triggerNode.getBoundingClientRect(), {
      height: popoverNode.offsetHeight,
      width: popoverNode.offsetWidth,
    });
    popoverNode.style.transform = `translate3d(${Math.round(nextPosition.left)}px, ${Math.round(nextPosition.top)}px, 0)`;
  }, []);

  const activeRouteTimelineStopPopoverId = activeRouteTimelineStopPopover?.stopId;

  useEffect(() => {
    if (!activeRouteTimelineStopPopoverId) return undefined;

    const syncRouteTimelineStopPopover = () => positionRouteTimelineStopPopover(activeRouteTimelineStopPopoverId);
    positionRouteTimelineStopPopover(activeRouteTimelineStopPopoverId);
    window.addEventListener("scroll", syncRouteTimelineStopPopover, true);
    window.addEventListener("resize", syncRouteTimelineStopPopover);
    return () => {
      window.removeEventListener("scroll", syncRouteTimelineStopPopover, true);
      window.removeEventListener("resize", syncRouteTimelineStopPopover);
    };
  }, [activeRouteTimelineStopPopoverId, positionRouteTimelineStopPopover]);

  useEffect(() => {
    if (activeRouteTimelineStopPopover?.mode !== "pinned") return undefined;

    const handleDocumentPointerDown = (event) => {
      if (event.target?.closest?.('[data-route-timeline-stop-popover-root="true"]')) return;
      if (event.target?.closest?.('[data-route-timeline-stop-button="true"]')) return;
      setActiveRouteTimelineStopPopover(null);
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, [activeRouteTimelineStopPopover?.mode]);

  useEffect(() => {
    if (activeChildOrderDisclosure?.mode !== "pinned") return undefined;

    const focusFrame = window.requestAnimationFrame(() => childOrderDisclosureCloseButtonRef.current?.focus());
    const closeAndRestoreFocus = () => {
      const trigger = childOrderDisclosureTriggerRef.current;
      setActiveChildOrderDisclosure(null);
      window.requestAnimationFrame(() => trigger?.focus());
    };
    const handleDocumentPointerDown = (event) => {
      if (event.target?.closest?.('[data-child-order-disclosure-trigger="true"]')) return;
      if (event.target?.closest?.('[data-child-order-disclosure-popover="true"]')) return;
      setActiveChildOrderDisclosure(null);
    };
    const handleDocumentKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndRestoreFocus();
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [activeChildOrderDisclosure?.mode]);

  useEffect(() => {
    if (!activeChildOrderDisclosure) return undefined;

    const syncChildOrderDisclosurePopover = () => positionChildOrderDisclosurePopover();
    positionChildOrderDisclosurePopover();
    window.addEventListener("resize", syncChildOrderDisclosurePopover);
    window.addEventListener("scroll", syncChildOrderDisclosurePopover, true);
    return () => {
      window.removeEventListener("resize", syncChildOrderDisclosurePopover);
      window.removeEventListener("scroll", syncChildOrderDisclosurePopover, true);
    };
  }, [activeChildOrderDisclosure, positionChildOrderDisclosurePopover]);

  useEffect(() => () => {
    if (childOrderDisclosureCloseTimerRef.current != null) {
      window.clearTimeout(childOrderDisclosureCloseTimerRef.current);
    }
  }, []);

  const restoreRouteTimelineDragPreview = useCallback(() => {
    const snapshot = routeTimelineDragSnapshotRef.current;
    if (!routeTimelineDragRef.current || !snapshot) return;

    flushSync(() => {
      setRouteTimelineOrderByRouteId(snapshot.orderByRouteId);
      setRoutePreviewByKey(snapshot.previewByKey);
    });
  }, []);

  const handleRouteTimelineDragEnd = useCallback(() => {
    const shouldRestorePreview = routeTimelineDragRef.current && !routeTimelineDropCommittedRef.current;
    if (shouldRestorePreview) restoreRouteTimelineDragPreview();

    routeTimelineDragRef.current = null;
    routeTimelineDragSnapshotRef.current = null;
    routeTimelineDropCommittedRef.current = false;
    flushSync(() => setRouteTimelineDrag(null));
  }, [restoreRouteTimelineDragPreview]);

  const handleRouteTimelineDragLeave = useCallback((event) => {
    if (!routeTimelineDragRef.current) return;
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const isOutside = event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom;
    if (isOutside) restoreRouteTimelineDragPreview();
  }, [restoreRouteTimelineDragPreview]);

  const handleRouteTimelineDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleRouteTimelineStopDragEnter = (event, routeRow, stop) => {
    event.preventDefault();
    event.stopPropagation();
    if (routeTimelineDragRef.current?.stopId === stop.id) return;
    moveDraggedTimelineStop(routeRow.id, stop.id);
  };

  const handleRouteTimelineEmptyRouteDragEnter = (event, routeRow) => {
    event.preventDefault();
    if (routeRow.stops.length > 0) return;
    moveDraggedTimelineStop(routeRow.id);
  };

  const handleRouteTimelineRouteDragOver = (event, routeRow) => {
    handleRouteTimelineDragOver(event);
    if (!routeTimelineDragRef.current || routeRow.stops.length === 0) return;

    const firstStopRect = routeTimelineStopRefs.current.get(routeRow.stops[0]?.id)?.getBoundingClientRect();
    const lastStopRect = routeTimelineStopRefs.current.get(routeRow.stops.at(-1)?.id)?.getBoundingClientRect();
    if (firstStopRect && event.clientX <= firstStopRect.left + 42) {
      moveDraggedTimelineStop(routeRow.id, "__start__");
    } else if (lastStopRect && event.clientX >= lastStopRect.right - 42) {
      moveDraggedTimelineStop(routeRow.id);
    }
  };

  const handleRouteTimelineRouteDrop = (event, routeRow) => {
    event.preventDefault();
    routeTimelineDropCommittedRef.current = true;
    moveDraggedTimelineStop(routeRow.id);
    handleRouteTimelineDragEnd();
  };

  const handleRouteTimelineRemoveDrop = (event) => {
    event.preventDefault();
    const drag = routeTimelineDragRef.current;
    if (!drag) return;

    routeTimelineDropCommittedRef.current = true;
    setRoutePreviewByKey({});
    animateRouteTimelineChange(() => {
      setRouteTimelineOrderByRouteId((currentOrderByRouteId) => removeTimelineStop(
        routeRows,
        currentOrderByRouteId,
        drag,
      ));
    });
    handleRouteTimelineDragEnd();
  };

  const submitRouteGroupAction = async (intent, fields = {}) => {
    if (!routeGroupId) {
      setRouteGroupClientError("Route group id가 없어 작업을 실행할 수 없습니다.");
      return;
    }

    try {
      setRouteGroupClientError(null);
      const sessionToken = await shopify.idToken();
      const formData = new FormData();
      formData.set("_intent", intent);
      formData.set("routeGroupId", routeGroupId);
      formData.set("shopifySessionToken", sessionToken);
      for (const [key, value] of Object.entries(fields)) formData.set(key, value);
      routeActionFetcher.submit(formData, { method: "post" });
    } catch {
      setRouteGroupClientError(
        "Shopify session token을 가져오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.",
      );
    }
  };

  const resetRouteDraftChanges = useCallback(() => {
    routeTimelineDragRef.current = null;
    setRouteTimelineDrag(null);
    setRouteTimelineOrderByRouteId({});
    setClientRouteRows([]);
    setRouteLineEdits({});
    setRoutePreviewByKey({});
    setRouteGroupClientError(null);
  }, []);

  const handleAddEmptyRoute = () => {
    const draft = getNextChildRouteDraft(contextRouteRows);
    const tempId = `temp:${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setClientRouteRows((rows) => [
      ...rows,
      {
        attemptedCount: 0,
        color: draft.color,
        createdLabel: ROUTE_EMPTY_LABEL,
        startDateTime: "",
        deliveredCount: 0,
        driverLabel: "Unassigned",
        driveTimeLabel: ROUTE_EMPTY_LABEL,
        id: tempId,
        isCurrent: false,
        orderIds: [],
        routeKey: tempId,
        routeIdx: draft.routeIdx,
        routeIndex: draft.routeIndex,
        routePlanId: null,
        startTimeLabel: ROUTE_EMPTY_LABEL,
        stops: [],
        stopsCount: 0,
        tempId,
        title: draft.label,
        totalDistanceLabel: ROUTE_EMPTY_LABEL,
        totalItems: 0,
        totalWeightLabel: ROUTE_EMPTY_LABEL,
        vehicleLabel: ROUTE_EMPTY_LABEL,
      },
    ]);
  };

  const handlePreviewRouteOptimization = () => {
    submitRouteGroupAction("previewRouteOptimization", {
      draft: JSON.stringify(buildRouteDraftPayload(contextTimelineRouteRows, { includeExistingOptimized: true })),
    });
  };

  const handleSaveRouteDraft = () => {
    if (!canSaveRouteDraft) return;
    submitRouteGroupAction("saveRouteDraft", {
      draft: JSON.stringify(buildRouteDraftPayload(contextTimelineRouteRows, { includeExistingOptimized: false })),
    });
  };

  const handleSaveRouteDraftAndLeave = () => {
    if (!canSaveRouteDraft) return;
    navigateAfterRouteDraftSaveRef.current = true;
    setIsRouteDraftExitDialogOpen(false);
    handleSaveRouteDraft();
  };

  const handleDiscardRouteDraftAndLeave = () => {
    navigateAfterRouteDraftSaveRef.current = false;
    resetRouteDraftChanges();
    setIsRouteDraftExitDialogOpen(false);
    navigate(routesListHref);
  };

  const handleBackToRoutes = () => {
    if (hasRouteAllocationDraft) {
      setIsRouteDraftExitDialogOpen(true);
      return;
    }
    navigate(routesListHref);
  };

  const handleSiblingRouteChange = (routePlanId) => {
    if (!routeGroupId || !routePlanId) return;
    setIsSiblingRouteMenuOpen(false);
    if (routePlanId === effectiveRoutePlan?.id) return;
    navigate(routeGroupChildPath(routeGroupId, routePlanId));
  };

  const handleViewInventory = () => {
    if (inventoryDetailHref) navigate(inventoryDetailHref);
  };

  const handleDeleteRoute = async () => {
    if (routeGroupActionBusy || !window.confirm(`Delete ${routeDetailTitle}?`)) return;

    try {
      setRouteGroupClientError(null);
      const sessionToken = await shopify.idToken();
      const formData = new FormData();
      formData.set("_intent", "deleteRoute");
      formData.set("shopifySessionToken", sessionToken);
      routeActionFetcher.submit(formData, { method: "post" });
    } catch {
      setRouteGroupClientError(
        "Shopify session token을 가져오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.",
      );
    }
  };

  useEffect(() => {
    if (routeGroupActionIntent) lastRouteActionIntentRef.current = routeGroupActionIntent;
  }, [routeGroupActionIntent]);

  useEffect(() => {
    if (routeActionFetcher.state !== "idle" || routeActionFetcher.data === undefined) return;
    if (lastRouteActionIntentRef.current !== "previewRouteOptimization") return;
    if ((routeActionFetcher.data?.errors ?? []).length > 0) return;

    const previewRoutes = routeActionFetcher.data?.preview?.routes ?? [];
    const stopIdByOrderId = new Map(contextTimelineRouteRows.flatMap((routeRow) => (
      routeRow.stops.map((stop) => [stop.orderId, stop.id])
    )));
    const routeIdByKey = new Map(contextTimelineRouteRows.map((routeRow) => [getRouteRowDraftKey(routeRow), routeRow.id]));
    const nextOrderByRouteId = {};
    const nextPreviewByKey = {};

    for (const previewRoute of previewRoutes) {
      const key = previewRoute.routeKey;
      const routeId = routeIdByKey.get(key);
      if (!key || !routeId) continue;
      nextOrderByRouteId[routeId] = (previewRoute.orderIds ?? [])
        .map((orderId) => stopIdByOrderId.get(orderId))
        .filter(Boolean);
      nextPreviewByKey[key] = {
        metrics: previewRoute.metrics ?? null,
        orderIds: previewRoute.orderIds ?? [],
        routeGeometry: previewRoute.routeGeometry ?? null,
        routeStopPoints: previewRoute.routeStopPoints ?? [],
      };
    }

    lastRouteActionIntentRef.current = null;
    setRouteTimelineOrderByRouteId(nextOrderByRouteId);
    setRoutePreviewByKey(nextPreviewByKey);
  }, [contextTimelineRouteRows, routeActionFetcher.data, routeActionFetcher.state]);

  useEffect(() => {
    if (routeActionFetcher.state !== "idle" || routeActionFetcher.data === undefined) return;
    if (lastRouteActionIntentRef.current !== "deleteRoute") return;
    lastRouteActionIntentRef.current = null;
    if ((routeActionFetcher.data?.errors ?? []).length === 0) navigate(ROUTES_ROOT_PATH);
  }, [navigate, routeActionFetcher.data, routeActionFetcher.state]);

  useEffect(() => {
    if (routeActionFetcher.state !== "idle" || routeActionFetcher.data === undefined) return;
    if (!["saveRouteDriver", "saveRouteStartTime"].includes(lastRouteActionIntentRef.current)) return;
    lastRouteActionIntentRef.current = null;
    if ((routeActionFetcher.data?.errors ?? []).length === 0) revalidator.revalidate();
  }, [revalidator, routeActionFetcher.data, routeActionFetcher.state]);

  useEffect(() => {
    if (routeActionFetcher.state !== "idle" || routeActionFetcher.data === undefined) return;
    if (lastRouteActionIntentRef.current !== "saveRouteDraft") {
      lastRouteActionIntentRef.current = null;
      navigateAfterRouteDraftSaveRef.current = false;
      return;
    }
    lastRouteActionIntentRef.current = null;
    const navigateAfterSave = navigateAfterRouteDraftSaveRef.current;
    navigateAfterRouteDraftSaveRef.current = false;
    if ((routeActionFetcher.data?.errors ?? []).length === 0) {
      resetRouteDraftChanges();
      revalidator.revalidate();
      if (navigateAfterSave) navigate(routesListHref);
    }
  }, [navigate, resetRouteDraftChanges, revalidator, routeActionFetcher.data, routeActionFetcher.state, routesListHref]);

  useEffect(() => {
    setRouteCandidateTitle(defaultRouteCandidateTitle);
    setRouteLineDraftTitle(defaultRouteCandidateTitle);
  }, [defaultRouteCandidateTitle]);

  useEffect(() => {
    setRouteLineColor(defaultRouteLineColor);
    setRouteLineDraftColor(defaultRouteLineColor);
  }, [defaultRouteLineColor]);

  useEffect(() => {
    routeMapCenterRef.current = routeMapCenter;
  }, [routeMapCenter]);

  useEffect(() => {
    hasInitialRouteMapFitRef.current = false;
  }, [mapRenderKey]);

  useEffect(() => () => clearMapRecoveryTimer(), [clearMapRecoveryTimer]);

  useEffect(() => {
    const mapContainerElement = mapContainerRef.current;
    if (!mapContainerElement || mapRef.current) return undefined;

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

        if (!isMounted || mapRef.current) return;

        installPmtilesProtocol(maplibregl, Protocol);
        mapLibraryRef.current = maplibregl;
        const constructStartedAt = performance.now();
        mapRef.current = createMapLibreMap(maplibregl, {
          attributionControl: { compact: true },
          center: routeMapCenterRef.current,
          container: mapContainerElement,
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
      clearRoutePolygonMapClickSuppression();
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
    let routeLineRetryTimer = null;
    let didBindStopLayerHandlers = false;

    const scheduleRouteLineRetry = () => {
      if (routeLineRetryTimer != null) return;
      routeLineRetryTimer = window.setTimeout(() => {
        routeLineRetryTimer = null;
        syncRouteDetailRouteLine(map, savedRouteGeometryRows, routePathColor);
      }, 80);
    };

    const handleRouteStopLayerDoubleClick = (event) => {
      event.preventDefault?.();
      event.originalEvent?.preventDefault?.();
      event.originalEvent?.stopPropagation?.();
      const stop = getRouteStopFromMapFeature(event.features?.[0], routeMapStops);
      if (!stop) return;

      fitRouteStopAndSnappedPoint(
        map,
        maplibregl,
        stop,
        findRouteStopPoint(stop, savedRouteStopPoints),
      );
    };
    const handleRouteStopLayerMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleRouteStopLayerMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    const bindStopLayerHandlers = () => {
      if (didBindStopLayerHandlers || !map.getLayer?.(ROUTE_DETAIL_STOP_LAYER_ID)) return;
      map.on("dblclick", ROUTE_DETAIL_STOP_LAYER_ID, handleRouteStopLayerDoubleClick);
      map.on("mouseenter", ROUTE_DETAIL_STOP_LAYER_ID, handleRouteStopLayerMouseEnter);
      map.on("mouseleave", ROUTE_DETAIL_STOP_LAYER_ID, handleRouteStopLayerMouseLeave);
      didBindStopLayerHandlers = true;
    };

    const emitMarkerDiagnostics = (metric) => {
      if (markerDiagnosticCountRef.current >= 12) return;
      markerDiagnosticCountRef.current += 1;
      logRouteDetailMapClientDiagnostic({
        routeGroupId,
        routePlanId: textOrUndefined(effectiveRoutePlan?.id),
        routeTitle: routeDetailTitle,
        ...metric,
      });
    };

    const syncRouteDetailMap = () => {
      const syncStartedAt = performance.now();
      const routeLineStartedAt = performance.now();
      const didSyncRouteLine = syncRouteDetailRouteLine(map, savedRouteGeometryRows, routePathColor);
      if (!didSyncRouteLine) {
        scheduleRouteLineRetry();
      }
      const routeLineMs = roundPerfDuration(performance.now() - routeLineStartedAt);
      const markerStartedAt = performance.now();
      const didSyncMarkerLayers = syncRouteDetailMapMarkerLayers(
        map,
        departureLocation,
        routeMapStops,
        savedRouteStopPoints,
        routeLineColor,
        routeStopColorById,
        (metric) => emitMarkerDiagnostics({ ...metric, trigger: "initial-sync" }),
      );
      bindStopLayerHandlers();
      const markerCreateMs = roundPerfDuration(performance.now() - markerStartedAt);
      logRouteDetailPerformance("routes.detail.map.sync", {
        totalMs: roundPerfDuration(performance.now() - syncStartedAt),
        routeLineMs,
        markerCreateMs,
        markerCount: (departureLocation?.hasCoordinates ? 1 : 0) + routeMapStops.length + savedRouteStopPoints.length,
        markerLayersSynced: didSyncMarkerLayers,
        stopCount: routeMapStops.length,
        stopPointCount: savedRouteStopPoints.length,
        hasRouteGeometry: savedRouteGeometryRows.some((routeRow) => Boolean(routeRow.routeGeometry)),
      });
    };
    const handleRouteDetailStyleData = () => {
      if (!syncRouteDetailRouteLine(map, savedRouteGeometryRows, routePathColor)) {
        scheduleRouteLineRetry();
      }
      if (syncRouteDetailMapMarkerLayers(map, departureLocation, routeMapStops, savedRouteStopPoints, routeLineColor, routeStopColorById, (metric) => emitMarkerDiagnostics({ ...metric, trigger: "styledata" }))) {
        bindStopLayerHandlers();
      }
    };

    syncRouteDetailMap();
    map.on("styledata", handleRouteDetailStyleData);

    return () => {
      if (routeLineRetryTimer != null) {
        window.clearTimeout(routeLineRetryTimer);
      }
      map.off("styledata", handleRouteDetailStyleData);
      if (didBindStopLayerHandlers) {
        map.off("dblclick", ROUTE_DETAIL_STOP_LAYER_ID, handleRouteStopLayerDoubleClick);
        map.off("mouseenter", ROUTE_DETAIL_STOP_LAYER_ID, handleRouteStopLayerMouseEnter);
        map.off("mouseleave", ROUTE_DETAIL_STOP_LAYER_ID, handleRouteStopLayerMouseLeave);
      }
    };
  }, [
    departureLocation,
    isMapReady,
    routeMapStops,
    routeLineColor,
    routeStopColorById,
    routePathColor,
    routeGroupId,
    routeDetailTitle,
    effectiveRoutePlan?.id,
    timelineRouteRows,
    savedRouteGeometryRows,
    savedRouteStopPoints,
  ]);


  useEffect(() => {
    if (!isMapReady || !mapRef.current) return undefined;

    const map = mapRef.current;
    const syncPolygon = () => {
      if (!isRoutePolygonEditMode) {
        removeRouteEditPolygon(map);
        return;
      }
      syncRouteEditPolygon(map, routePolygonPoints, isRoutePolygonClosed);
    };

    syncPolygon();
    map.on("styledata", syncPolygon);

    return () => {
      map.off("styledata", syncPolygon);
    };
  }, [isMapReady, isRoutePolygonClosed, isRoutePolygonEditMode, routePolygonPoints]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current) return undefined;

    const map = mapRef.current;
    if (!isRoutePolygonEditMode) return undefined;

    const canvas = map.getCanvas?.();
    const previousCursor = canvas?.style.cursor ?? "";

    if (canvas) canvas.style.cursor = "crosshair";
    map.doubleClickZoom?.disable?.();

    const handleMapClick = (event) => {
      if (routePolygonSkipNextMapClickRef.current) {
        clearRoutePolygonMapClickSuppression();
        return;
      }
      if (routePolygonClosedRef.current) return;
      if ((event.originalEvent?.detail ?? 1) > 1) return;
      const lngLat = [event.lngLat.lng, event.lngLat.lat];
      const nextPoints = [...routePolygonPointsRef.current, lngLat];
      setRoutePolygonDraftPoints(nextPoints);
      setRoutePolygonClosed(false);
      setIsPolygonTargetPickerOpen(false);
      syncRouteEditPolygon(map, nextPoints, false);
    };

    const handleMapDoubleClick = (event) => {
      event.preventDefault?.();
      event.originalEvent?.preventDefault?.();
      if (routePolygonClosedRef.current) return;

      const lngLat = [event.lngLat.lng, event.lngLat.lat];
      const currentPoints = routePolygonPointsRef.current;
      const nextPoints = currentPoints.length >= 3 ? currentPoints : [...currentPoints, lngLat];
      const nextIsClosed = nextPoints.length >= 3;
      setRoutePolygonDraftPoints(nextPoints);
      setRoutePolygonClosed(nextIsClosed);
      setIsPolygonTargetPickerOpen(false);
      syncRouteEditPolygon(map, nextPoints, nextIsClosed);
    };

    map.on("click", handleMapClick);
    map.on("dblclick", handleMapDoubleClick);

    return () => {
      map.off("click", handleMapClick);
      map.off("dblclick", handleMapDoubleClick);
      map.doubleClickZoom?.enable?.();
      if (canvas) canvas.style.cursor = previousCursor;
    };
  }, [isMapReady, isRoutePolygonClosed, isRoutePolygonEditMode, routePolygonPoints]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current) return undefined;

    const map = mapRef.current;
    if (!isRoutePolygonEditMode || routePolygonPoints.length === 0) return undefined;
    if (!map.getLayer?.(ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID)) return undefined;

    const canvas = map.getCanvas?.();
    let wasDragPanEnabled = null;

    const getFeaturePointIndex = (feature) => {
      const pointIndex = numberOrUndefined(feature?.properties?.pointIndex);
      return Number.isInteger(pointIndex) ? pointIndex : null;
    };

    const preventMapGesture = (event) => {
      event.preventDefault?.();
      event.originalEvent?.preventDefault?.();
      event.originalEvent?.stopPropagation?.();
    };

    const syncDraggedPolygonPoint = (event) => {
      const pointIndex = routePolygonCornerDragIndexRef.current;
      if (!Number.isInteger(pointIndex) || !event.lngLat) return null;

      const draggedPoint = [event.lngLat.lng, event.lngLat.lat];
      const nextPoints = routePolygonPointsRef.current.map((point, currentIndex) =>
        currentIndex === pointIndex ? draggedPoint : point,
      );
      routePolygonPointsRef.current = nextPoints;
      syncRouteEditPolygon(map, nextPoints, routePolygonClosedRef.current);
      return nextPoints;
    };

    const restoreDragPan = () => {
      if (wasDragPanEnabled !== false) {
        map.dragPan?.enable?.();
      }
      wasDragPanEnabled = null;
    };

    const handlePolygonCornerMouseEnter = () => {
      if (canvas && routePolygonCornerDragIndexRef.current == null) {
        canvas.style.cursor = "grab";
      }
    };

    const handlePolygonCornerMouseLeave = () => {
      if (canvas && routePolygonCornerDragIndexRef.current == null) {
        canvas.style.cursor = "crosshair";
      }
    };

    const handlePolygonCornerDragStart = (event) => {
      const pointIndex = getFeaturePointIndex(event.features?.[0]);
      if (pointIndex == null) return;

      preventMapGesture(event);
      routePolygonCornerDragIndexRef.current = pointIndex;
      suppressNextRoutePolygonMapClick();
      wasDragPanEnabled = typeof map.dragPan?.isEnabled === "function" ? map.dragPan.isEnabled() : true;
      map.dragPan?.disable?.();
      if (canvas) canvas.style.cursor = "grabbing";
    };

    const handlePolygonCornerDragMove = (event) => {
      if (routePolygonCornerDragIndexRef.current == null) return;

      preventMapGesture(event);
      syncDraggedPolygonPoint(event);
    };

    const handlePolygonCornerDragEnd = (event) => {
      if (routePolygonCornerDragIndexRef.current == null) return;

      preventMapGesture(event);
      const nextPoints = syncDraggedPolygonPoint(event) ?? routePolygonPointsRef.current;
      routePolygonCornerDragIndexRef.current = null;
      restoreDragPan();
      if (canvas) canvas.style.cursor = "crosshair";
      setRoutePolygonDraftPoints(nextPoints);
      setIsPolygonTargetPickerOpen(false);
      syncRouteEditPolygon(map, nextPoints, routePolygonClosedRef.current);
    };

    map.on("mouseenter", ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID, handlePolygonCornerMouseEnter);
    map.on("mouseleave", ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID, handlePolygonCornerMouseLeave);
    map.on("mousedown", ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID, handlePolygonCornerDragStart);
    map.on("touchstart", ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID, handlePolygonCornerDragStart);
    map.on("mousemove", handlePolygonCornerDragMove);
    map.on("touchmove", handlePolygonCornerDragMove);
    map.on("mouseup", handlePolygonCornerDragEnd);
    map.on("touchend", handlePolygonCornerDragEnd);

    return () => {
      map.off("mouseenter", ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID, handlePolygonCornerMouseEnter);
      map.off("mouseleave", ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID, handlePolygonCornerMouseLeave);
      map.off("mousedown", ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID, handlePolygonCornerDragStart);
      map.off("touchstart", ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID, handlePolygonCornerDragStart);
      map.off("mousemove", handlePolygonCornerDragMove);
      map.off("touchmove", handlePolygonCornerDragMove);
      map.off("mouseup", handlePolygonCornerDragEnd);
      map.off("touchend", handlePolygonCornerDragEnd);
      routePolygonCornerDragIndexRef.current = null;
      restoreDragPan();
      if (canvas) canvas.style.cursor = "crosshair";
    };
  }, [isMapReady, isRoutePolygonClosed, isRoutePolygonEditMode, routePolygonPoints.length]);

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
      {hasRouteAllocationDraft ? (
        <div aria-label="Unsaved route draft" role="status" style={routeDraftBarStyle}>
          <span style={routeDraftBarTextStyle}>{saveRouteDraftBusy ? "Saving route changes…" : "Unsaved route changes"}</span>
          <button
            disabled={!canSaveRouteDraft}
            onClick={handleSaveRouteDraft}
            style={{
              ...routeDraftBarButtonStyle,
              ...(!canSaveRouteDraft ? { opacity: 0.55 } : {}),
            }}
            type="button"
          >
            Save
          </button>
          <button
            disabled={routeGroupActionBusy}
            onClick={resetRouteDraftChanges}
            style={{
              ...routeDraftBarGhostButtonStyle,
              ...(routeGroupActionBusy ? { opacity: 0.55 } : {}),
            }}
            type="button"
          >
            Revert
          </button>
        </div>
      ) : null}
      <div style={routesDetailContentStyle}>
        <header className="route-overview-header" style={routeOverviewHeaderStyle}>
          <div style={routeOverviewTopBarStyle}>
            <div style={routeDetailNavigationStyle}>
              <button
                aria-label="Back to routes list"
                onClick={handleBackToRoutes}
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
            <div style={routeHeaderRightStyle}>
              {routeGroupId && currentSiblingRouteIndex >= 0 && siblingRouteRows.length > 1 ? (
                <div
                  aria-label="Routes in this group"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setIsSiblingRouteMenuOpen(false);
                  }}
                  style={siblingRouteNavigatorStyle}
                >
                  <button
                    aria-label="Previous route in group"
                    disabled={hasRouteAllocationDraft || !previousSiblingRoute}
                    onClick={() => handleSiblingRouteChange(previousSiblingRoute?.routePlanId)}
                    style={{
                      ...siblingRoutePreviousButtonStyle,
                      ...(hasRouteAllocationDraft || !previousSiblingRoute ? siblingRouteNavigatorDisabledStyle : {}),
                    }}
                    title={hasRouteAllocationDraft ? "Save or revert route changes before switching routes" : previousSiblingRoute?.title}
                    type="button"
                  >
                    <svg aria-hidden="true" fill="none" style={siblingRouteNavigatorIconStyle} viewBox="0 0 20 20">
                      <path d="m12 5-5 5 5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                    </svg>
                  </button>
                  <button
                    aria-expanded={isSiblingRouteMenuOpen}
                    aria-haspopup="menu"
                    aria-label="All routes in group"
                    disabled={hasRouteAllocationDraft}
                    onClick={() => setIsSiblingRouteMenuOpen((isOpen) => !isOpen)}
                    style={{
                      ...siblingRouteMenuButtonStyle,
                      ...(hasRouteAllocationDraft ? siblingRouteNavigatorDisabledStyle : {}),
                    }}
                    title={hasRouteAllocationDraft ? "Save or revert route changes before switching routes" : "All routes in this group"}
                    type="button"
                  >
                    <span>{currentSiblingRouteIndex + 1} / {siblingRouteRows.length}</span>
                  </button>
                  <button
                    aria-label="Next route in group"
                    disabled={hasRouteAllocationDraft || !nextSiblingRoute}
                    onClick={() => handleSiblingRouteChange(nextSiblingRoute?.routePlanId)}
                    style={{
                      ...siblingRouteNextButtonStyle,
                      ...(hasRouteAllocationDraft || !nextSiblingRoute ? siblingRouteNavigatorDisabledStyle : {}),
                    }}
                    title={hasRouteAllocationDraft ? "Save or revert route changes before switching routes" : nextSiblingRoute?.title}
                    type="button"
                  >
                    <svg aria-hidden="true" fill="none" style={siblingRouteNavigatorIconStyle} viewBox="0 0 20 20">
                      <path d="m8 5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                    </svg>
                  </button>
                  {isSiblingRouteMenuOpen ? (
                    <div aria-label="All routes" role="menu" style={siblingRouteMenuStyle}>
                      <div style={siblingRouteMenuHeadingStyle}>All routes</div>
                      {siblingRouteRows.map((routeRow) => (
                        <button
                          aria-current={routeRow.routePlanId === effectiveRoutePlan?.id ? "page" : undefined}
                          key={routeRow.routePlanId}
                          onClick={() => handleSiblingRouteChange(routeRow.routePlanId)}
                          role="menuitem"
                          style={{
                            ...siblingRouteMenuItemStyle,
                            ...(routeRow.routePlanId === effectiveRoutePlan?.id ? siblingRouteMenuCurrentItemStyle : {}),
                          }}
                          type="button"
                        >
                          <span aria-hidden="true" style={{ ...siblingRouteMenuDotStyle, background: routeRow.color }} />
                          <span style={siblingRouteMenuLabelStyle}>{routeRow.title}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div aria-label="Route detail actions" style={routeHeaderActionsStyle}>
                <button
                  disabled={!inventoryDetailHref}
                  onClick={handleViewInventory}
                  style={inventoryDetailHref ? routeActionButtonStyle : routeDisabledActionButtonStyle}
                  title={inventoryDetailHref ? undefined : "Linked inventory is not available yet"}
                  type="button"
                >
                  View inventory
                </button>
                <button
                  disabled={routeGroupActionBusy}
                  onClick={handleDeleteRoute}
                  style={routeGroupActionBusy ? routeDisabledActionButtonStyle : routeDangerActionButtonStyle}
                  type="button"
                >
                  {deleteRouteBusy ? "Deleting…" : "Delete route"}
                </button>
              </div>
            </div>
          </div>

          <div className="route-overview-main">
            <div style={routeOverviewTitleBlockStyle}>
              <div style={routeOverviewTitleLineStyle}>
                <h1 className="route-detail-title" style={routesDetailTitleStyle}>{routeDetailTitle}</h1>
                <span style={routeStatusBadgeStyle}>{routeDetail.status}</span>
                {isMaterializedChildRouteDetail ? (
                  <div aria-label="Child route summary" className="route-overview-summary" style={childRouteHeaderSummaryStyle}>
                    {renderRouteHeaderMetric("Route Name", routeDetailTitle)}
                    <div style={routeDetailTitleMetricStyle}>
                      <span style={routeDetailTitleMetricLabelStyle}>Driver</span>
                      <button
                        aria-label="Change route driver"
                        onClick={() => handleOpenRouteSelector("driver", currentTimelineRouteRow ?? {
                          routePlanId: effectiveRoutePlan?.id,
                          title: routeDetailTitle,
                        })}
                        style={childRouteHeaderDriverButtonStyle}
                        type="button"
                      >
                        <span style={routeEditableValueTextStyle}>{routeDriverSummary}</span>
                        {renderRouteEditableChevron()}
                      </button>
                    </div>
                    <div style={routeDetailTitleMetricStyle}>
                      <span style={routeDetailTitleMetricLabelStyle}>Start</span>
                      <span style={childRouteDepartureControlStyle}>
                        <input
                          aria-label="Route start date and time"
                          disabled={routeGroupActionBusy}
                          onChange={(event) => setRouteStartDateTimeDraft(event.currentTarget.value)}
                          style={childRouteDepartureInputStyle}
                          type="datetime-local"
                          value={routeStartDateTimeDraft}
                        />
                        <button
                          disabled={routeGroupActionBusy || routeStartDateTimeDraft === routeStartDateTimeValue}
                          onClick={handleSaveRouteStartTime}
                          style={{
                            ...childRouteDepartureSaveButtonStyle,
                            ...(routeGroupActionBusy || routeStartDateTimeDraft === routeStartDateTimeValue
                              ? { cursor: "not-allowed", opacity: 0.55 }
                              : {}),
                          }}
                          type="button"
                        >
                          {saveRouteStartTimeBusy ? "Saving…" : "Save"}
                        </button>
                      </span>
                    </div>
                    {renderRouteHeaderMetric("Updated", routeUpdatedLabel)}
                  </div>
                ) : (
                  <div aria-label="Route summary" className="route-overview-summary">
                    {renderRouteHeaderMetric("Orders", routeDetail.orders)}
                    {renderRouteHeaderMetric("Delivery date", routeDetail.deliveryDate)}
                    {renderRouteHeaderMetric("Driver", routeDriverSummary)}
                  </div>
                )}
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
            wheelHintEnabled={!isRoutePolygonEditMode}
            toolbar={
              <>
                {isRoutePolygonEditMode ? (
                  <>
                    <div aria-hidden="true" style={routePolygonEditOverlayStyle}></div>
                    <button
                      disabled={!canSaveRoutePolygon}
                      onClick={handlePrepareSavePolygon}
                      style={{
                        ...routePolygonSaveButtonStyle,
                        ...(canSaveRoutePolygon ? routePolygonSaveButtonActiveStyle : routePolygonSaveButtonDisabledStyle),
                      }}
                      type="button"
                    >
                      Save polygon
                    </button>
                    {isPolygonTargetPickerOpen ? (
                      <div aria-label="Polygon route target" style={routePolygonTargetPanelStyle}>
                        <div style={routePolygonTargetTitleStyle}>
                          {polygonSelectedOrderIds.length} orders → route
                        </div>
                        {timelineRouteRows.map((routeRow) => (
                          <button
                            key={routeRow.id}
                            onClick={() => handleAssignPolygonToRoute(routeRow)}
                            style={routePolygonTargetButtonStyle}
                            type="button"
                          >
                            {routeRow.title}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
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
                    {
                      ariaLabel: isRoutePolygonEditMode ? "Stop editing route polygon" : "Edit route polygon",
                      icon: renderRoutePolygonEditIcon(),
                      onClick: handleToggleRoutePolygonEditMode,
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
              </>
            }
          />

          <section style={routeMetaActionsStyle}>
            <section aria-label="Route timing" style={routeMetaGridStyle}>
              <div style={routeMetaItemStyle}>Route start: {departureLocation.address}</div>
              <div style={routeMetaItemStyle}>⚑ Route end: Loop back to start</div>
              <div style={routeMetaItemStyle}>◴ Scheduled for: {routeDetail.deliveryDate}</div>
            </section>
            <div aria-label="Route actions" style={routeActionColumnStyle}>
              <button
                disabled={routeGroupActionBusy}
                onClick={handlePreviewRouteOptimization}
                style={routeActionButtonStyle}
                type="button"
              >{reOptimizeRouteGroupBusy ? "Working…" : "Re-optimize"}</button>
              <button
                disabled={routeGroupActionBusy}
                onClick={handleAddEmptyRoute}
                style={routeActionButtonStyle}
                type="button"
              >{addEmptyRouteBranchBusy ? "Working…" : "Add Empty Route"}</button>
            </div>
          </section>

          {isMaterializedChildRouteDetail ? (
            <section aria-label="Child route stop timeline" onDragLeave={handleRouteTimelineDragLeave} style={childRouteTimelineStyle}>
              <div style={{ ...childRouteTimelineRowsStyle, minHeight: "48px" }}>
                {timelineRouteRows.map((routeRow) => (
                  <div
                    key={routeRow.id}
                    onDragEnter={(event) => handleRouteTimelineEmptyRouteDragEnter(event, routeRow)}
                    onDragOver={(event) => handleRouteTimelineRouteDragOver(event, routeRow)}
                    onDrop={(event) => handleRouteTimelineRouteDrop(event, routeRow)}
                    style={{
                      ...getChildRouteTimelineTrackStyle(routeRow.stops.length),
                      "--route-line-color": softenRouteColor(routeRow.color),
                      "--route-marker-color": routeRow.color,
                    }}
                  >
                    <span style={childRouteTimelineEndpointStyle}>
                      <span>Start</span>
                      <span aria-hidden="true" style={childRouteTimelineConnectorStyle} />
                      {renderChildRouteTimelineStartMarker()}
                    </span>
                    {routeRow.stops.map((stop) => (
                      <span
                        key={stop.id}
                        style={childRouteTimelineStopUnitStyle}
                        title={stop.order}
                      >
                        <span style={childRouteTimelineOrderLabelStyle}>{stop.order}</span>
                        <span aria-hidden="true" style={childRouteTimelineConnectorStyle} />
                        <button
                          data-route-timeline-stop-button="true"
                          ref={(node) => setRouteTimelineStopRef(stop.id, node)}
                          draggable
                          onDragEnd={handleRouteTimelineDragEnd}
                          onDragEnter={(event) => handleRouteTimelineStopDragEnter(event, routeRow, stop)}
                          onDragOver={(event) => handleRouteTimelineRouteDragOver(event, routeRow)}
                          onDragStart={(event) => handleRouteTimelineDragStart(event, routeRow, stop)}
                          onClick={(event) => handleRouteTimelineStopClick(event, stop)}
                          onMouseEnter={() => handleRouteTimelineStopMouseEnter(stop)}
                          onMouseLeave={() => handleRouteTimelineStopMouseLeave(stop)}
                          aria-expanded={activeRouteTimelineStopPopover?.stopId === stop.id}
                          aria-label={`Show ${stop.order} stop details`}
                          style={{
                            ...routeTimelineStopStyle,
                            ...childRouteTimelineStopMarkerStyle,
                            position: "relative",
                            zIndex: 1,
                            ...(routeTimelineDrag?.stopId === stop.id ? routeTimelineStopDraggingStyle : null),
                          }}
                          type="button"
                        ><span style={routeNumberMarkerGlyphStyle}>{stop.stop}</span></button>
                      </span>
                    ))}
                    <span style={childRouteTimelineEndStyle}>
                      <span>End</span>
                      {renderChildRouteTimelineEndMarker()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {isMaterializedChildRouteDetail ? (
            <div
              style={{
                ...routesDetailTableFrameStyle,
                "--route-marker-color": currentTimelineRouteRow?.color ?? routeLineColor,
              }}
            >
              <table aria-label="Child route order stops" style={childRouteOrderTableStyle}>
                <colgroup>
                  {childRouteOrderColumnWidths.map((width, index) => (
                    <col key={`${width}-${index}`} style={{ width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {CHILD_ROUTE_ORDER_COLUMNS.map((column) => (
                      <th key={column.key} style={childRouteOrderHeaderCellStyle}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {childRouteOrderRows.map((row) => (
                    <tr key={row.id} style={childRouteOrderRowStyle}>
                      <td style={childRouteStopCellStyle}><span style={childRouteTableStopMarkerStyle}><span style={childRouteTableStopMarkerTextStyle}>{row.stop}</span></span></td>
                      <td style={childRouteOrderCellStyle}>{row.order}</td>
                      <td style={childRouteOrderCellStyle}>{row.status}</td>
                      <td style={childRouteOrderCellStyle}>{row.orderDate}</td>
                      <td style={childRouteOrderCellStyle}>{row.address}</td>
                      <td style={childRouteOrderCellStyle}>{row.eta}</td>
                      <td style={childRouteOrderCellStyle}>{row.driveTime}</td>
                      <td style={childRouteOrderCellStyle}>{row.stopTime}</td>
                      <td style={childRouteOrderCellStyle}>{row.customer}</td>
                      <td style={childRouteDisclosureCellStyle}>
                        <button
                          aria-expanded={activeChildOrderDisclosure?.rowId === row.id && activeChildOrderDisclosure?.type === "items"}
                          aria-haspopup="dialog"
                          aria-label={`Show ${row.order} item details`}
                          data-child-order-disclosure-trigger="true"
                          onClick={(event) => handleToggleChildOrderDisclosure(event, row.id, "items")}
                          onBlur={handleChildOrderDisclosureMouseLeave}
                          onFocus={(event) => handleChildOrderDisclosureMouseEnter(event, row.id, "items")}
                          onMouseEnter={(event) => handleChildOrderDisclosureMouseEnter(event, row.id, "items")}
                          onMouseLeave={handleChildOrderDisclosureMouseLeave}
                          style={childRouteDisclosureButtonStyle}
                          type="button"
                        >
                          <span>{row.itemsSummary}</span>
                          {renderChildRouteInfoIcon()}
                        </button>
                      </td>
                      <td style={childRouteOrderCellStyle}>{row.method}</td>
                      <td style={childRouteDisclosureCellStyle}>
                        <button
                          aria-expanded={activeChildOrderDisclosure?.rowId === row.id && activeChildOrderDisclosure?.type === "attributes"}
                          aria-haspopup="dialog"
                          aria-label={`Show ${row.order} attributes`}
                          data-child-order-disclosure-trigger="true"
                          onClick={(event) => handleToggleChildOrderDisclosure(event, row.id, "attributes")}
                          onBlur={handleChildOrderDisclosureMouseLeave}
                          onFocus={(event) => handleChildOrderDisclosureMouseEnter(event, row.id, "attributes")}
                          onMouseEnter={(event) => handleChildOrderDisclosureMouseEnter(event, row.id, "attributes")}
                          onMouseLeave={handleChildOrderDisclosureMouseLeave}
                          style={childRouteDisclosureButtonStyle}
                          type="button"
                        >
                          <span>{row.attributesSummary}</span>
                          {renderChildRouteInfoIcon()}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={routesDetailTableFrameStyle}>
              <table aria-label="Driver route rows" style={routePlanRowsTableStyle}>
                <colgroup>
                  {routePlanRowsColumnWidths.map((width, index) => (
                    <col key={`${width}-${index}`} style={{ width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th style={routeNameHeaderCellStyle}>Name</th>
                    <th style={routeStatusHeaderCellStyle}>Status</th>
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
                  {timelineRouteRows.map((routeRow) => (
                    <tr key={routeRow.id}>
                      <td style={routeNameCellStyle}>
                        <span style={routeLineNameStyle}>
                          <span aria-hidden="true" style={{ ...routeStatusDotStyle, background: routeRow.color }}></span>
                          <button
                            aria-label={`Open ${routeRow.title} route detail`}
                            onClick={() => navigate(routeGroupChildPath(routeGroupId, routeRow.routePlanId))}
                            style={routeLineTitleButtonStyle}
                            type="button"
                          >
                            {routeRow.title}
                          </button>
                          <button
                            aria-label={`Edit ${routeRow.title} name`}
                            onClick={() => handleOpenRouteLineEditor(routeRow)}
                            style={routeLineEditButtonStyle}
                            type="button"
                          >
                            {renderRouteLineEditIcon()}
                          </button>
                        </span>
                      </td>
                      <td style={routeStatusCellStyle}><span style={routeRowStatusStyle}>{formatRouteStatus(routeRow.status)}</span></td>
                      <td style={routesDetailCellStyle}>
                        <button
                          aria-label="Change route driver"
                          onClick={() => handleOpenRouteSelector("driver", routeRow)}
                          style={routeEditableValueStyle}
                          type="button"
                        >
                          <span style={routeEditableValueTextStyle}>{routeRow.driverLabel}</span>
                          {renderRouteEditableChevron()}
                        </button>
                      </td>
                      <td style={routesDetailCellStyle}>
                        <button
                          aria-label="Change route vehicle"
                          onClick={() => handleOpenRouteSelector("vehicle", routeRow)}
                          style={routeEditableValueStyle}
                          type="button"
                        >
                          <span style={routeEditableValueTextStyle}>{routeRow.vehicleLabel}</span>
                          {renderRouteEditableChevron()}
                        </button>
                      </td>
                      <td style={routesDetailCellStyle}>
                        <button
                          aria-label="Change route start time"
                          disabled={!routeRow.routePlanId || routeGroupActionBusy}
                          onClick={() => handleOpenRouteSelector("startTime", routeRow)}
                          style={{
                            ...routeEditableValueStyle,
                            ...(!routeRow.routePlanId || routeGroupActionBusy ? { cursor: "not-allowed", opacity: 0.55 } : null),
                          }}
                          type="button"
                        >
                          <span style={routeEditableValueTextStyle}>{routeRow.startTimeLabel ?? routeStartTimeLabel}</span>
                          {renderRouteEditableChevron()}
                        </button>
                      </td>
                      <td style={routesDetailCellStyle}>{routeRow.stopsCount}</td>
                      <td style={routesDetailCellStyle}>{routeRow.deliveredCount}</td>
                      <td style={routesDetailCellStyle}>{routeRow.attemptedCount}</td>
                      <td style={routesDetailCellStyle}>{routeRow.totalItems}</td>
                      <td style={routesDetailCellStyle}>{routeRow.driveTimeLabel}</td>
                      <td style={routesDetailCellStyle}>{routeRow.totalDistanceLabel}</td>
                      <td style={routesDetailCellStyle}>{routeRow.totalWeightLabel}</td>
                      <td style={routesDetailCellStyle}>{routeRow.createdLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isMaterializedChildRouteDetail ? (
            <section aria-label="Route stop timeline" onDragLeave={handleRouteTimelineDragLeave} style={routeTimelineStyle}>
              <>
                <div style={{ ...routeTimelineRowsStyle, minHeight: routeTimelineRowsMinHeight }}>
                  {timelineRouteRows.map((routeRow) => (
                    <div
                      key={routeRow.id}
                      onDragEnter={(event) => handleRouteTimelineEmptyRouteDragEnter(event, routeRow)}
                      onDragOver={(event) => handleRouteTimelineRouteDragOver(event, routeRow)}
                      onDrop={(event) => handleRouteTimelineRouteDrop(event, routeRow)}
                      style={{
                        ...routeTimelineLaneStyle,
                        "--route-line-color": softenRouteColor(routeRow.color),
                        "--route-marker-color": routeRow.color,
                      }}
                    >
                      <div style={routeTimelineLabelStyle}>{routeRow.title}</div>
                      <span title="Start" style={routeTimelineStartStyle}>{renderRouteTimelineStartIcon()}</span>
                      {routeRow.stops.map((stop) => (
                        <span
                          key={stop.id}
                          style={routeTimelineSegmentStyle}
                          title={stop.order}
                        >
                          <span style={routeTimelineLineStyle}></span>
                          <button
                            data-route-timeline-stop-button="true"
                            ref={(node) => setRouteTimelineStopRef(stop.id, node)}
                            draggable
                            onDragEnd={handleRouteTimelineDragEnd}
                            onDragEnter={(event) => handleRouteTimelineStopDragEnter(event, routeRow, stop)}
                            onDragOver={(event) => handleRouteTimelineRouteDragOver(event, routeRow)}
                            onDragStart={(event) => handleRouteTimelineDragStart(event, routeRow, stop)}
                            onClick={(event) => handleRouteTimelineStopClick(event, stop)}
                            onMouseEnter={() => handleRouteTimelineStopMouseEnter(stop)}
                            onMouseLeave={() => handleRouteTimelineStopMouseLeave(stop)}
                            aria-expanded={activeRouteTimelineStopPopover?.stopId === stop.id}
                            aria-label={`Show ${stop.order} stop details`}
                            style={{
                              ...routeTimelineStopStyle,
                              ...(routeTimelineDrag?.stopId === stop.id ? routeTimelineStopDraggingStyle : null),
                            }}
                            type="button"
                          >{stop.stop}</button>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
                <div
                  onDragOver={handleRouteTimelineDragOver}
                  onDrop={handleRouteTimelineRemoveDrop}
                  style={routeTimelineBottomSpacerStyle}
                >
                  <div style={routeTimelineDropHintStyle}>Drop orders here to remove them from the route</div>
                </div>
              </>
            </section>
          ) : null}
            {activeRouteTimelineStop && activeRouteTimelineStopPopover ? (
              <>
                <div
                  data-route-timeline-stop-popover-root="true"
                  ref={routeTimelineStopPopoverRef}
                  role="tooltip"
                  style={{
                    ...routeTimelineStopPopoverStyle,
                    transform: `translate3d(${Math.round(activeRouteTimelineStopPopover.left)}px, ${Math.round(activeRouteTimelineStopPopover.top)}px, 0)`,
                  }}
                >
                  <div style={routeTimelineStopPopoverHeaderStyle}>
                    <span>{activeRouteTimelineStop.order}</span>
                    <button
                      aria-label="Close route stop details"
                      onClick={() => setActiveRouteTimelineStopPopover(null)}
                      style={routeTimelineStopPopoverCloseStyle}
                      type="button"
                    >×</button>
                  </div>
                  <div style={routeTimelineStopPopoverMetaStyle}>
                    <span>Customer: {activeRouteTimelineStop.recipient}</span>
                    <span>Address: {activeRouteTimelineStop.address}</span>
                  </div>
                  <strong>Items</strong>
                  {(activeRouteTimelineStop.items ?? []).length > 0 ? (
                    <ul style={routeTimelineStopItemListStyle}>
                      {(activeRouteTimelineStop.items ?? []).map((item, itemIndex) => (
                        <li key={`${item.name}-${itemIndex}`} style={routeTimelineStopItemStyle}>
                          <span>
                            {item.name}
                            {item.options ? <small style={{ color: "#6d7175", display: "block" }}>{item.options}</small> : null}
                            {item.sku ? <small style={{ color: "#6d7175", display: "block" }}>SKU {item.sku}</small> : null}
                          </span>
                          <strong>×{item.quantity}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: "#6d7175" }}>
                      {activeRouteTimelineStop.itemCount > 0 ? `${activeRouteTimelineStop.itemCount} items` : "No item detail"}
                    </span>
                  )}
                </div>
              </>
            ) : null}
          {activeChildOrderDisclosure && activeChildOrderDisclosureRow && typeof document !== "undefined" ? createPortal(
            <div
              data-child-order-disclosure-popover="true"
              onMouseEnter={cancelChildOrderDisclosureClose}
              onMouseLeave={handleChildOrderDisclosureMouseLeave}
              ref={childOrderDisclosurePopoverRef}
              role={activeChildOrderDisclosure.mode === "pinned" ? "dialog" : "tooltip"}
              aria-label={`${activeChildOrderDisclosure.type === "items" ? "Items" : "Attributes"} for ${activeChildOrderDisclosureRow.order}`}
              style={{
                ...childRouteDisclosurePopoverStyle,
                transform: `translate3d(${Math.round(activeChildOrderDisclosure.left)}px, ${Math.round(activeChildOrderDisclosure.top)}px, 0)`,
                width: `${Math.round(activeChildOrderDisclosure.width)}px`,
              }}
            >
              <div style={childRouteDisclosurePopoverHeaderStyle}>
                <span>{activeChildOrderDisclosure.type === "items" ? "Items" : "Attributes"} · {activeChildOrderDisclosureRow.order}</span>
                {activeChildOrderDisclosure.mode === "pinned" ? (
                  <button
                    aria-label="Close order detail"
                    onClick={() => {
                      const trigger = childOrderDisclosureTriggerRef.current;
                      setActiveChildOrderDisclosure(null);
                      window.requestAnimationFrame(() => trigger?.focus());
                    }}
                    ref={childOrderDisclosureCloseButtonRef}
                    style={routeTimelineStopPopoverCloseStyle}
                    type="button"
                  >×</button>
                ) : null}
              </div>
              {activeChildOrderDisclosure.type === "items" ? (
                activeChildOrderDisclosureRow.items.length > 0 ? (
                  <ul style={childRouteDisclosureListStyle}>
                    {activeChildOrderDisclosureRow.items.map((item, itemIndex) => (
                      <li key={`${item.name}-${itemIndex}`} style={childRouteDisclosureListItemStyle}>
                        <span>
                          {item.name}
                          {item.sku ? <small style={{ color: "#6d7175", display: "block" }}>SKU {item.sku}</small> : null}
                        </span>
                        <strong>×{item.quantity}</strong>
                      </li>
                    ))}
                  </ul>
                ) : <span style={childRouteDisclosureEmptyStyle}>{activeChildOrderDisclosureRow.itemsDetail}</span>
              ) : (
                activeChildOrderDisclosureRow.attributes.length > 0 ? (
                  <div style={childRouteDisclosureListStyle}>
                    {activeChildOrderDisclosureRow.attributes.map((attribute, attributeIndex) => (
                      <div key={`${attribute.label}-${attributeIndex}`} style={childRouteDisclosureAttributeStyle}>
                        <span style={childRouteDisclosureAttributeKeyStyle}>{attribute.key ?? "Attribute"}</span>
                        <span>{attribute.value}</span>
                      </div>
                    ))}
                  </div>
                ) : <span style={childRouteDisclosureEmptyStyle}>No attributes</span>
              )}
            </div>,
            document.body,
          ) : null}
        </section>

        {isRouteDraftExitDialogOpen ? (
          <div style={routeLineEditorOverlayStyle}>
            <button
              aria-label="Cancel unsaved route dialog"
              onClick={() => setIsRouteDraftExitDialogOpen(false)}
              style={routeLineEditorBackdropButtonStyle}
              type="button"
            />
            <div
              aria-label="Unsaved route changes"
              role="dialog"
              style={routeLineEditorDialogStyle}
            >
              <h2 style={routeLineEditorTitleStyle}>아직 남은 변경이 있습니다</h2>
              <div style={routeLineEditorLabelStyle}>저장하지 않은 route 변경이 남아 있습니다.</div>
              <div style={routeLineEditorActionsStyle}>
                <button
                  disabled={!canSaveRouteDraft}
                  onClick={handleSaveRouteDraftAndLeave}
                  style={{
                    ...routeLineEditorPrimaryButtonStyle,
                    ...(!canSaveRouteDraft ? { opacity: 0.55 } : {}),
                  }}
                  type="button"
                >
                  Save
                </button>
                <button
                  disabled={routeGroupActionBusy}
                  onClick={handleDiscardRouteDraftAndLeave}
                  style={{
                    ...routeActionButtonStyle,
                    ...(routeGroupActionBusy ? { opacity: 0.55 } : {}),
                  }}
                  type="button"
                >
                  Discard
                </button>
                <button
                  onClick={() => setIsRouteDraftExitDialogOpen(false)}
                  style={routeActionButtonStyle}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activeRouteSelector ? (
          <div style={routeLineEditorOverlayStyle}>
            <button
              aria-label="Close route selector"
              onClick={() => setActiveRouteSelector(null)}
              style={routeLineEditorBackdropButtonStyle}
              type="button"
            />
            <div
              aria-label={`${activeRouteSelector.title} selector`}
              role="dialog"
              style={routeLineEditorDialogStyle}
            >
              <h2 style={routeLineEditorTitleStyle}>Change {activeRouteSelector.title}</h2>
              <div style={routeLineEditorLabelStyle}>{activeRouteSelector.routeTitle}</div>
              {activeRouteSelector.type === "startTime" ? (
                <input
                  aria-label="Route start date and time"
                  disabled={routeGroupActionBusy}
                  onChange={(event) => setRouteStartDateTimeDraft(event.currentTarget.value)}
                  style={routeLineEditorInputStyle}
                  type="datetime-local"
                  value={routeStartDateTimeDraft}
                />
              ) : (
                <>
                  <input
                    aria-label={`Search ${activeRouteSelector.title.toLowerCase()}`}
                    onChange={(event) => setRouteSelectorQuery(event.target.value)}
                    placeholder={`Search ${activeRouteSelector.title.toLowerCase()}`}
                    style={routeLineEditorInputStyle}
                    type="search"
                    value={routeSelectorQuery}
                  />
                  <div role="listbox" style={routeSelectorListStyle}>
                    {routeSelectorOptions.length > 0 ? (
                      routeSelectorOptions.map((option) => (
                        <button
                          disabled={activeRouteSelector.type !== "driver" || !activeRouteSelector.routePlanId || routeGroupActionBusy}
                          key={option.id}
                          onClick={() => handleSelectRouteDriver(option.id)}
                          aria-selected="false"
                          role="option"
                          style={{
                            ...routeSelectorOptionStyle,
                            ...(activeRouteSelector.type !== "driver" || !activeRouteSelector.routePlanId || routeGroupActionBusy
                              ? { cursor: "not-allowed", opacity: 0.55 }
                              : null),
                          }}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))
                    ) : (
                      <div style={routeSelectorEmptyStyle}>{routeSelectorEmptyMessage}</div>
                    )}
                  </div>
                </>
              )}
              <div style={routeLineEditorActionsStyle}>
                <button onClick={() => setActiveRouteSelector(null)} style={routeActionButtonStyle} type="button">Close</button>
                {activeRouteSelector.type === "startTime" ? (
                  <button
                    disabled={
                      routeGroupActionBusy ||
                      routeStartDateTimeDraft === activeRouteSelector.startDateTime ||
                      (routeStartDateTimeDraft !== "" && storeLocalDateTimeToIso(routeStartDateTimeDraft, ianaTimezone) === null)
                    }
                    onClick={handleSaveRouteStartTime}
                    style={routeLineEditorPrimaryButtonStyle}
                    type="button"
                  >
                    {saveRouteStartTimeBusy ? "Saving…" : "Save"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {isRouteLineEditorOpen ? (
          <div style={routeLineEditorOverlayStyle}>
          <button
            aria-label="Close route editor"
            onClick={() => setIsRouteLineEditorOpen(false)}
            style={routeLineEditorBackdropButtonStyle}
            type="button"
          />
          <div
            aria-label="Edit route line"
            role="dialog"
            style={routeLineEditorDialogStyle}
          >
            <h2 style={routeLineEditorTitleStyle}>Edit route</h2>
            <div style={routeLineEditorFieldStyle}>
              <label htmlFor="route-line-title" style={routeLineEditorLabelStyle}>Name</label>
              <input
                id="route-line-title"
                onChange={(event) => setRouteLineDraftTitle(event.target.value)}
                style={routeLineEditorInputStyle}
                type="text"
                value={routeLineDraftTitle}
              />
            </div>
            <div style={routeLineEditorFieldStyle}>
              <span style={routeLineEditorLabelStyle}>Color</span>
              <div style={routeLineColorGridStyle}>
                {ROUTE_COLOR_OPTIONS.map((color) => (
                  <button
                    aria-label={`Use route color ${color}`}
                    key={color}
                    onClick={() => setRouteLineDraftColor(color)}
                    style={{
                      ...routeLineColorButtonStyle,
                      background: color,
                      boxShadow: color === routeLineDraftColor ? "0 0 0 2px #303030" : "none",
                    }}
                    type="button"
                  />
                ))}
              </div>
              <input
                aria-label="Route color picker"
                onChange={(event) => setRouteLineDraftColor(event.target.value)}
                style={routeLineEditorInputStyle}
                type="color"
                value={normalizeRouteColor(routeLineDraftColor) ?? MAP_MARKER_PALETTE.plannedOrder.color}
              />
              <input
                aria-label="Route color code"
                onChange={(event) => setRouteLineDraftColor(event.target.value)}
                style={routeLineEditorInputStyle}
                type="text"
                value={routeLineDraftColor}
              />
            </div>
            <div style={routeLineEditorActionsStyle}>
              <button onClick={() => setIsRouteLineEditorOpen(false)} style={routeActionButtonStyle} type="button">Cancel</button>
              <button onClick={handleSaveRouteLineEditor} style={routeLineEditorPrimaryButtonStyle} type="button">Save</button>
            </div>
          </div>
          </div>
        ) : null}
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
