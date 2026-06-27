import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useFetcher, useLoaderData, useNavigate, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { formatDeliveryScopeLabel } from "../features/delivery/delivery-labels";
import { fetchDeliveryDrivers } from "../features/delivery/drivers.server";
import {
  createDeliveryRouteGroupBranch,
  fetchDeliveryRouteGroupDetail,
  reOptimizeDeliveryRouteGroup,
  saveDeliveryRouteGroupDraft,
  updateDeliveryRouteGroupBranchOrders,
} from "../features/delivery/route-groups.server";
import {
  assignDeliveryRoutePlanDriver,
  fetchDeliveryRoutePlanDetail,
} from "../features/delivery/route-plans.server";
import { createDepartureMarkerElement, createDotMarkerElement, MAP_MARKER_PALETTE, MAP_PIN_PATH } from "../features/maps/map-markers";
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
const ROUTE_DETAIL_POLYGON_SOURCE_ID = "route-detail-edit-polygon";
const ROUTE_DETAIL_POLYGON_FILL_LAYER_ID = "route-detail-edit-polygon-fill";
const ROUTE_DETAIL_POLYGON_LINE_LAYER_ID = "route-detail-edit-polygon-line";
const ROUTE_EMPTY_LABEL = "–";
const ROUTE_STOP_POINT_MIN_DISTANCE_METERS = 1;
const ROUTE_DETAIL_ORDER_MARKER_MIN_ZOOM = 7;
const ROUTE_POLYGON_CLICK_DELAY_MS = 220;
const ROUTE_DETAIL_PERF_CAPTURE_ENABLED = import.meta.env.DEV;
const ROUTE_COLOR_OPTIONS = ["#0b84d8", "#f97316", "#14b8a6", "#8b5cf6", "#ef4444"];

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
  gap: "10px",
  padding: "14px 16px",
};

const routeOverviewTopBarStyle = {
  alignItems: "center",
  display: "flex",
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
  "128px",
  "52px",
  "74px",
  "76px",
  "82px",
  "104px",
  "104px",
  "96px",
  "116px",
];

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

const routeDepartureStatusStyle = {
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
  padding: "8px 8px 0",
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

const routeTimelineStopSelectedStyle = {
  boxShadow: "0 0 0 2px #ffffff, 0 0 0 4px rgba(79, 124, 255, 0.95)",
  transform: "scale(1.08)",
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
  background: "rgba(79, 124, 255, 0.08)",
  border: "4px solid rgba(79, 124, 255, 0.95)",
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
  position: "fixed",
  right: "24px",
  top: "24px",
  zIndex: 9999,
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
  const routeGroupId = textOrUndefined(routePlanData.routePlan?.routeGroupingChild?.groupingId);
  const routeGroupData = routeGroupId
    ? await fetchDeliveryRouteGroupDetail(request, routeGroupId, { cacheKey: shopifyShopCacheKey })
    : { errors: [], routeGroup: null };

  logRouteDetailPerformance("routes.detail.loader", {
    totalMs: roundPerfDuration(getRouteDetailPerfNow() - loaderStartedAt),
    primaryDataMs,
    routeId: params.routeId,
    routeGroupId,
    routeGroupBranchCount: routeGroupData.routeGroup?.branches?.length ?? 0,
    routeGroupChildCount: routeGroupData.routeGroup?.children?.length ?? 0,
    stopCount: routePlanData.stops?.length ?? 0,
    driverCount: driverData.drivers?.length ?? 0,
    errorCount:
      (routePlanData.errors?.length ?? 0) +
      (routeGroupData.errors?.length ?? 0) +
      (driverData.errors?.length ?? 0),
  });

  return {
    ...routePlanData,
    errors: [
      ...(routePlanData.errors ?? []),
      ...(routeGroupData.errors ?? []),
      ...(driverData.errors ?? []),
    ],
    currentDepartureLocation: departureLocationData.departureLocation,
    drivers: driverData.drivers,
    routeGroup: routeGroupData.routeGroup,
  };
};

export const action = async ({ params, request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_intent");
  const routeGroupId = textOrUndefined(formData.get("routeGroupId"));
  const shopifySessionToken = formData.get("shopifySessionToken");

  logRouteDetailPerformance("routes.detail.action", {
    intent,
    routeGroupId,
    routeId: params.routeId,
  });

  if (intent === "saveRouteDriver") {
    const driverId = textOrUndefined(formData.get("driverId")) ?? null;

    return assignDeliveryRoutePlanDriver(
      request,
      params.routeId,
      { driverId },
      { sessionToken: shopifySessionToken },
    );
  }

  if (intent === "reOptimizeRouteGroup") {
    const result = await reOptimizeDeliveryRouteGroup(
      request,
      routeGroupId,
      { confirmRisk: false },
      { sessionToken: shopifySessionToken },
    );
    logRouteGroupActionResult("routes.detail.action.reOptimizeRouteGroup", params.routeId, routeGroupId, result);
    return result;
  }

  if (intent === "addEmptyRouteBranch") {
    const result = await createDeliveryRouteGroupBranch(
      request,
      routeGroupId,
      { label: textOrUndefined(formData.get("label")) ?? "Route", orderIds: [] },
      { sessionToken: shopifySessionToken },
    );
    logRouteGroupActionResult("routes.detail.action.addEmptyRouteBranch", params.routeId, routeGroupId, result);
    return result;
  }

  if (intent === "saveRouteDraft") {
    const result = await saveDeliveryRouteGroupDraft(
      request,
      routeGroupId,
      readRouteDraftPayload(formData.get("draft")),
      { sessionToken: shopifySessionToken },
    );
    logRouteGroupActionResult("routes.detail.action.saveRouteDraft", params.routeId, routeGroupId, result);
    return result;
  }

  if (intent === "assignPolygonToRoute") {
    const orderIds = readJsonStringArray(formData.get("orderIds"));
    const removeBranchIds = readJsonStringArray(formData.get("removeBranchIds"));
    const targetBranchId = textOrUndefined(formData.get("targetBranchId"));

    if (orderIds.length === 0) {
      return {
        routeGroup: null,
        errors: [{ message: "폴리곤 안에서 선택된 주문이 없습니다." }],
      };
    }

    let result = { routeGroup: null, errors: [] };
    for (const branchId of removeBranchIds.filter((branchId) => branchId !== targetBranchId)) {
      result = await updateDeliveryRouteGroupBranchOrders(
        request,
        routeGroupId,
        branchId,
        { removeOrderIds: orderIds },
        { sessionToken: shopifySessionToken },
      );
      if ((result.errors ?? []).length > 0) {
        logRouteGroupActionResult("routes.detail.action.assignPolygonToRoute", params.routeId, routeGroupId, result);
        return result;
      }
    }

    if (targetBranchId) {
      result = await updateDeliveryRouteGroupBranchOrders(
        request,
        routeGroupId,
        targetBranchId,
        { addOrderIds: orderIds },
        { sessionToken: shopifySessionToken },
      );
    }

    logRouteGroupActionResult("routes.detail.action.assignPolygonToRoute", params.routeId, routeGroupId, result);
    return result;
  }

  return {
    routePlan: null,
    stops: [],
    errors: [{ message: "지원하지 않는 route 작업입니다." }],
  };
};

function logRouteGroupActionResult(name, routeId, routeGroupId, result) {
  const routeGroup = result?.routeGroup;
  logRouteDetailPerformance(name, {
    routeId,
    routeGroupId,
    branchCount: routeGroup?.branches?.length ?? 0,
    childCount: routeGroup?.children?.length ?? 0,
    childRoutePlanIds: (routeGroup?.children ?? []).map((child) => child.routePlanId).filter(Boolean),
    errorCount: result?.errors?.length ?? 0,
  });
}

function readJsonStringArray(value) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(textOrUndefined).filter(Boolean);
  } catch {
    return [];
  }
}

function readRouteDraftPayload(value) {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    if (!Array.isArray(parsed?.routes)) return { routes: [] };
    return {
      routes: parsed.routes.map((route) => ({
        branchId: textOrUndefined(route?.branchId) ?? null,
        orderIds: Array.isArray(route?.orderIds) ? route.orderIds.map(textOrUndefined).filter(Boolean) : [],
      })),
    };
  } catch {
    return { routes: [] };
  }
}

function formatRouteDeliveryScope(routePlan) {
  return formatDeliveryScopeLabel({
    deliveryDate: routePlan?.routeScope?.deliveryDate ?? routePlan?.deliveryDate ?? routePlan?.planDate,
    timeWindowEnd: routePlan?.routeScope?.timeWindowEnd ?? routePlan?.timeWindowEnd,
    timeWindowStart: routePlan?.routeScope?.timeWindowStart ?? routePlan?.timeWindowStart,
  }) ?? ROUTE_EMPTY_LABEL;
}

function buildRouteDetail(routePlan) {
  if (!routePlan) {
    return {
      route: "Route not found",
      status: "Unavailable",
      orders: 0,
      coordinates: "0/0",
      missingCoordinates: 0,
      deliveryDate: ROUTE_EMPTY_LABEL,
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
  if (!value) return ROUTE_EMPTY_LABEL;
  return value.replace("T", " ");
}

function getRouteCandidateTitle() {
  return "Route 1";
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
  const explicitTotal = numberOrUndefined(routePlan?.totalItems ?? routePlan?.itemsCount ?? routePlan?.itemCount);
  const stopTotal = routeStops.reduce((total, stop) => total + (numberOrUndefined(stop.itemCount) ?? 0), 0);

  return explicitTotal ?? (stopTotal > 0 ? stopTotal : ROUTE_EMPTY_LABEL);
}

function getRouteMetricLabel(...values) {
  return values.map(textOrUndefined).find(Boolean) ?? ROUTE_EMPTY_LABEL;
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
      orderId: textOrUndefined(stop.orderId) ?? null,
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

function syncRouteDetailMarkerZoomVisibility(map, container) {
  if (!container || typeof map?.getZoom !== "function") return;

  container.classList.toggle(
    "route-detail-map--hide-order-markers",
    map.getZoom() < ROUTE_DETAIL_ORDER_MARKER_MIN_ZOOM,
  );
}

function softenRouteColor(routeColor) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(routeColor).trim());
  if (!match) return routeColor;

  const mix = (hex) => Math.round(Number.parseInt(hex, 16) * 0.66 + 255 * 0.34);
  const color = match[1];
  return `rgb(${mix(color.slice(0, 2))}, ${mix(color.slice(2, 4))}, ${mix(color.slice(4, 6))})`;
}

function syncRouteDetailRouteLine(map, routeGeometry, routeColor = "#e11900") {
  if (!isRouteDetailMapStyleReady(map)) return false;

  const routeLineFeature = buildRouteDetailRouteLineFeature(routeGeometry);
  if (!routeLineFeature) {
    removeRouteDetailRouteLine(map);
    return true;
  }

  const existingSource = map.getSource?.(ROUTE_DETAIL_ROUTE_SOURCE_ID);
  if (existingSource?.setData) {
    existingSource.setData(routeLineFeature);
    if (map.getLayer?.(ROUTE_DETAIL_ROUTE_LAYER_ID)) {
      map.setPaintProperty?.(ROUTE_DETAIL_ROUTE_LAYER_ID, "line-color", routeColor);
    }
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
      "line-color": routeColor,
      "line-opacity": 0.78,
      "line-width": 2.5,
    },
  });
  return true;
}

function removeRouteEditPolygon(map) {
  if (map.getLayer?.(ROUTE_DETAIL_POLYGON_LINE_LAYER_ID)) {
    map.removeLayer(ROUTE_DETAIL_POLYGON_LINE_LAYER_ID);
  }
  if (map.getLayer?.(ROUTE_DETAIL_POLYGON_FILL_LAYER_ID)) {
    map.removeLayer(ROUTE_DETAIL_POLYGON_FILL_LAYER_ID);
  }
  if (map.getSource?.(ROUTE_DETAIL_POLYGON_SOURCE_ID)) {
    map.removeSource(ROUTE_DETAIL_POLYGON_SOURCE_ID);
  }
}

function buildRouteEditPolygonData(points, isClosed) {
  const features = [];
  if (points.length >= 2) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: isClosed ? [...points, points[0]] : points,
      },
      properties: {},
    });
  }
  if (isClosed && points.length >= 3) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[...points, points[0]]],
      },
      properties: {},
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function syncRouteEditPolygon(map, points, isClosed) {
  if (!isRouteDetailMapStyleReady(map)) return false;
  if (points.length === 0) {
    removeRouteEditPolygon(map);
    return true;
  }

  const data = buildRouteEditPolygonData(points, isClosed);
  const existingSource = map.getSource?.(ROUTE_DETAIL_POLYGON_SOURCE_ID);
  if (existingSource?.setData) {
    existingSource.setData(data);
  } else {
    map.addSource(ROUTE_DETAIL_POLYGON_SOURCE_ID, {
      type: "geojson",
      data,
    });
  }

  if (!map.getLayer?.(ROUTE_DETAIL_POLYGON_FILL_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_DETAIL_POLYGON_FILL_LAYER_ID,
      type: "fill",
      source: ROUTE_DETAIL_POLYGON_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": "#d92d20",
        "fill-opacity": 0.12,
      },
    });
  }
  if (!map.getLayer?.(ROUTE_DETAIL_POLYGON_LINE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_DETAIL_POLYGON_LINE_LAYER_ID,
      type: "line",
      source: ROUTE_DETAIL_POLYGON_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#d92d20",
        "line-dasharray": isClosed ? [1, 0] : [1.5, 1],
        "line-opacity": 0.9,
        "line-width": 2,
      },
    });
  } else {
    map.setPaintProperty?.(ROUTE_DETAIL_POLYGON_LINE_LAYER_ID, "line-dasharray", isClosed ? [1, 0] : [1.5, 1]);
  }

  return true;
}

function createRoutePolygonCornerElement(index) {
  const markerElement = document.createElement("button");
  markerElement.type = "button";
  markerElement.setAttribute("aria-label", `Polygon corner ${index + 1}`);
  Object.assign(markerElement.style, {
    background: "#ffffff",
    border: "2px solid #d92d20",
    borderRadius: "999px",
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.24)",
    boxSizing: "border-box",
    cursor: "grab",
    height: "14px",
    padding: 0,
    width: "14px",
  });
  return markerElement;
}

function isLngLatInPolygon(point, polygon) {
  if (!Array.isArray(point) || polygon.length < 3) return false;

  let inside = false;
  const x = point[0];
  const y = point[1];
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previousIndex];
    const xi = currentPoint[0];
    const yi = currentPoint[1];
    const xj = previousPoint[0];
    const yj = previousPoint[1];
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
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

function createRouteStopMarkerElement(stop, routeColor) {
  const markerElement = document.createElement("button");
  const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const labelElement = document.createElement("span");

  markerElement.type = "button";
  markerElement.className = "order-map-marker order-map-marker--planned";
  markerElement.style.zIndex = stop.isPolygonSelected ? "3700" : "3200";
  if (stop.isPolygonSelected) {
    markerElement.style.filter = "drop-shadow(0 0 7px rgba(79, 124, 255, 0.95)) drop-shadow(0 0 2px #ffffff)";
  }
  markerElement.style.setProperty("--marker-color", routeColor);
  markerElement.setAttribute("aria-label", `Stop ${stop.stop}: ${stop.order}`);

  svgElement.classList.add("order-map-marker__svg");
  svgElement.setAttribute("viewBox", "0 0 40 52");
  svgElement.setAttribute("aria-hidden", "true");
  pathElement.classList.add("order-map-marker__shape");
  pathElement.setAttribute("d", MAP_PIN_PATH);
  svgElement.append(pathElement);

  labelElement.className = "order-map-marker__label";
  labelElement.textContent = String(stop.stop);
  markerElement.append(svgElement, labelElement);

  return markerElement;
}

function createRouteStopPointMarkerElement(routeColor) {
  return createDotMarkerElement({
    className: "route-detail-snapped-stop-point",
    color: routeColor,
    zIndex: "3100",
  });
}

function createRouteDetailMapMarkers(map, maplibregl, departureLocation, routeStops, routeStopPoints, routeColor) {
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
    const markerElement = createRouteStopMarkerElement(stop, stop.routeColor ?? routeColor);
    markerElement.addEventListener("dblclick", handleStopMarkerDoubleClick);

    const stopMarker = new maplibregl.Marker({
      anchor: "bottom",
      element: markerElement,
    })
      .setLngLat(markerCoordinates)
      .addTo(map);

    markers.push(stopMarker);

    const stopPointMarker = buildRouteStopPointMarker(stop, routeStopPoint);
    if (!stopPointMarker) continue;

    const snappedStopPointMarker = new maplibregl.Marker({
      anchor: "center",
      element: createRouteStopPointMarkerElement(routeColor),
    })
      .setLngLat(stopPointMarker.coordinates)
      .addTo(map);

    markers.push(snappedStopPointMarker);
  }

  return markers;
}

function buildRouteBranchRows(routeGroup, routeStops = []) {
  const branches = [...(routeGroup?.branches ?? [])].sort((first, second) => {
    return (numberOrUndefined(first.sortOrder) ?? 0) - (numberOrUndefined(second.sortOrder) ?? 0);
  });
  const stopByOrderId = new Map(routeStops.map((stop) => [stop.orderId, stop]));

  return branches.map((branch, index) => {
    const orderIds = Array.isArray(branch.orderIds) ? branch.orderIds.map(textOrUndefined).filter(Boolean) : [];
    const branchStops = orderIds.map((orderId) => stopByOrderId.get(orderId)).filter(Boolean);
    return {
      attemptedCount: 0,
      color: textOrUndefined(branch.color) ?? ROUTE_COLOR_OPTIONS[index % ROUTE_COLOR_OPTIONS.length] ?? MAP_MARKER_PALETTE.plannedOrder.color,
      createdLabel: textOrUndefined(branch.createdAt)?.replace("T", " ").slice(0, 16) ?? ROUTE_EMPTY_LABEL,
      deliveredCount: 0,
      driverLabel: textOrUndefined(branch.driverName) ?? "Unassigned",
      driveTimeLabel: ROUTE_EMPTY_LABEL,
      id: `branch-${branch.id ?? index}`,
      branchId: textOrUndefined(branch.id) ?? null,
      isCurrent: false,
      orderIds,
      stops: branchStops,
      stopsCount: branchStops.length,
      title: `Route ${index + 2}`,
      totalDistanceLabel: ROUTE_EMPTY_LABEL,
      totalItems: ROUTE_EMPTY_LABEL,
      totalWeightLabel: ROUTE_EMPTY_LABEL,
      vehicleLabel: ROUTE_EMPTY_LABEL,
    };
  });
}


function normalizeRouteColor(color) {
  const text = String(color ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(text) ? text : null;
}

function getUnusedRouteColor(preferredColor, usedColors, offset = 0) {
  const preferred = normalizeRouteColor(preferredColor);
  if (preferred && !usedColors.has(preferred)) return preferred;

  for (let index = 0; index < ROUTE_COLOR_OPTIONS.length; index += 1) {
    const color = normalizeRouteColor(ROUTE_COLOR_OPTIONS[(index + offset) % ROUTE_COLOR_OPTIONS.length]);
    if (color && !usedColors.has(color)) return color;
  }

  return preferred ?? normalizeRouteColor(ROUTE_COLOR_OPTIONS[offset % ROUTE_COLOR_OPTIONS.length]) ?? MAP_MARKER_PALETTE.plannedOrder.color;
}

function ensureUniqueRouteRowColors(routeRows) {
  const usedColors = new Set();
  return routeRows.map((routeRow, index) => {
    const color = getUnusedRouteColor(routeRow.color, usedColors, index);
    usedColors.add(color);
    return { ...routeRow, color };
  });
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

    return {
      ...routeRow,
      attemptedCount: countRouteStopsByStatus(displayedStops, ["ATTEMPTED", "FAILED", "NEEDS_REVIEW"]),
      deliveredCount: countRouteStopsByStatus(displayedStops, ["DELIVERED", "FULFILLED"]),
      stops: displayedStops,
      stopsCount: displayedStops.length,
      totalItems: displayedStops.length > 0 ? displayedTotalItems : 0,
    };
  });
}

function buildRouteDraftPayload(routeRows) {
  return {
    routes: routeRows.map((routeRow) => ({
      branchId: routeRow.branchId ?? null,
      orderIds: routeRow.stops.map((stop) => stop.orderId).filter(Boolean),
    })),
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

export default function RouteDetailPage() {
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const routeActionFetcher = useFetcher();
  const {
    currentDepartureLocation = null,
    drivers = [],
    routePlan,
    routeGeometry = null,
    routeGroup = null,
    routeStopPoints = [],
    stops = [],
    errors = [],
  } = useLoaderData();
  const effectiveRoutePlan = routePlan;
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
  const orderedRouteStops = useMemo(() => buildRouteStops(stops), [stops]);
  const routeBranchRows = useMemo(() => buildRouteBranchRows(routeGroup, orderedRouteStops), [orderedRouteStops, routeGroup]);
  const branchOrderIds = useMemo(() => new Set(routeBranchRows.flatMap((routeRow) => routeRow.orderIds)), [routeBranchRows]);
  const rootRouteStops = useMemo(
    () => orderedRouteStops.filter((stop) => !branchOrderIds.has(stop.orderId)),
    [branchOrderIds, orderedRouteStops],
  );
  const routeDepartureStatus = getRouteDepartureStatus(effectiveRoutePlan);
  const defaultRouteCandidateTitle = getRouteCandidateTitle(effectiveRoutePlan);
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
  const routeGroupId = textOrUndefined(effectiveRoutePlan?.routeGroupingChild?.groupingId);
  const routeGroupActionBusy = routeActionFetcher.state !== "idle";
  const routeGroupActionIntent = routeActionFetcher.formData?.get("_intent");
  const reOptimizeRouteGroupBusy = routeGroupActionBusy && routeGroupActionIntent === "reOptimizeRouteGroup";
  const addEmptyRouteBranchBusy = routeGroupActionBusy && routeGroupActionIntent === "addEmptyRouteBranch";
  const saveRouteDraftBusy = routeGroupActionBusy && routeGroupActionIntent === "saveRouteDraft";
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
  const routeTimelineStopRefs = useRef(new Map());
  const routeTimelineDragRef = useRef(null);
  const lastRouteActionIntentRef = useRef(null);
  const polygonCornerMarkersRef = useRef([]);
  const routePolygonClickTimerRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const mapRecoveryAttemptsRef = useRef(0);
  const mapRecoveryTimerRef = useRef(null);
  const hasInitialRouteMapFitRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapStatus, setMapStatus] = useState("loading");
  const [mapRenderKey, setMapRenderKey] = useState(0);
  const [routeCandidateTitle, setRouteCandidateTitle] = useState(defaultRouteCandidateTitle);
  const [routeLineColor, setRouteLineColor] = useState(MAP_MARKER_PALETTE.plannedOrder.color);
  const [routeLineDraftTitle, setRouteLineDraftTitle] = useState(defaultRouteCandidateTitle);
  const [routeLineDraftColor, setRouteLineDraftColor] = useState(MAP_MARKER_PALETTE.plannedOrder.color);
  const [activeRouteLineId, setActiveRouteLineId] = useState(null);
  const [routeLineEdits, setRouteLineEdits] = useState({});
  const [isRouteLineEditorOpen, setIsRouteLineEditorOpen] = useState(false);
  const [routeGroupClientError, setRouteGroupClientError] = useState(null);
  const [isRoutePolygonEditMode, setIsRoutePolygonEditMode] = useState(false);
  const [routeTimelineOrderByRouteId, setRouteTimelineOrderByRouteId] = useState({});
  const [routeTimelineDrag, setRouteTimelineDrag] = useState(null);
  const [routePolygonPoints, setRoutePolygonPoints] = useState([]);
  const [isRoutePolygonClosed, setIsRoutePolygonClosed] = useState(false);
  const [isPolygonTargetPickerOpen, setIsPolygonTargetPickerOpen] = useState(false);
  const [polygonSelectedOrderIds, setPolygonSelectedOrderIds] = useState([]);
  const currentRouteLineId = effectiveRoutePlan?.id ?? "current-route";
  const editedRouteRows = [
    {
      attemptedCount: routeAttemptedCount,
      branchId: null,
      color: routeLineColor,
      createdLabel: routeCreatedLabel,
      deliveredCount: routeDeliveredCount,
      driverLabel: routeDriverSummary,
      driveTimeLabel: routeTotalDriveTime,
      id: currentRouteLineId,
      isCurrent: true,
      orderIds: rootRouteStops.map((stop) => stop.orderId).filter(Boolean),
      stops: rootRouteStops,
      stopsCount: rootRouteStops.length,
      title: routeCandidateTitle,
      totalDistanceLabel: routeTotalDistance,
      totalItems: routeTotalItems,
      totalWeightLabel: routeTotalWeight,
      vehicleLabel: routeVehicleLabel,
    },
    ...routeBranchRows,
  ].map((routeRow) => ({
    ...routeRow,
    color: routeLineEdits[routeRow.id]?.color ?? routeRow.color,
    title: routeLineEdits[routeRow.id]?.title ?? routeRow.title,
  }));
  const routeRows = ensureUniqueRouteRowColors(editedRouteRows);
  const timelineRouteRows = buildTimelineRows(routeRows, routeTimelineOrderByRouteId);
  const routeTimelineRowsMinHeight = `${Math.max(1, timelineRouteRows.length) * 24}px`;
  const hasRouteAllocationDraft = Object.keys(routeTimelineOrderByRouteId).length > 0;
  const canSaveRouteDraft = hasRouteAllocationDraft && !routeGroupActionBusy && !isRoutePolygonEditMode && !isRouteLineEditorOpen;
  const polygonCandidateStops = isRoutePolygonClosed && routePolygonPoints.length >= 3
    ? timelineRouteRows.flatMap((routeRow) => routeRow.stops)
      .filter((stop) => stop.orderId && stop.hasCoordinates && isLngLatInPolygon(stop.coordinates, routePolygonPoints))
    : [];
  const polygonCandidateOrderIds = polygonCandidateStops.map((stop) => stop.orderId);
  const canSaveRoutePolygon = polygonCandidateOrderIds.length > 0;
  const polygonHighlightedOrderIds = new Set(
    isPolygonTargetPickerOpen ? polygonSelectedOrderIds : polygonCandidateOrderIds,
  );
  const routeMapStops = timelineRouteRows.flatMap((routeRow) =>
    routeRow.stops.map((stop) => ({
      ...stop,
      isPolygonSelected: polygonHighlightedOrderIds.has(stop.orderId),
      routeColor: routeRow.color,
    })),
  );
  const visibleErrors = [
    ...(routeGroupClientError ? [{ message: routeGroupClientError }] : []),
    ...(routeActionFetcher.data?.errors ?? []),
    ...(errors ?? []),
  ];
  const routePathColor = softenRouteColor(routeLineColor);
  const savedRouteGeometry = routeGeometry;
  const savedRouteStopPoints = routeStopPoints;
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

  const clearRoutePolygonClickTimer = () => {
    if (!routePolygonClickTimerRef.current) return;
    window.clearTimeout(routePolygonClickTimerRef.current);
    routePolygonClickTimerRef.current = null;
  };

  const resetRoutePolygonDraft = () => {
    clearRoutePolygonClickTimer();
    setRoutePolygonPoints([]);
    setIsRoutePolygonClosed(false);
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
    setRouteTimelineDrag(drag);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", stop.id);
    event.dataTransfer.setDragImage(event.currentTarget, 9, 9);
  };

  const handleRouteTimelineDragEnd = useCallback(() => {
    routeTimelineDragRef.current = null;
    flushSync(() => setRouteTimelineDrag(null));
  }, []);

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
    moveDraggedTimelineStop(routeRow.id);
    handleRouteTimelineDragEnd();
  };

  const handleRouteTimelineRemoveDrop = (event) => {
    event.preventDefault();
    const drag = routeTimelineDragRef.current;
    if (!drag) return;

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
      if (import.meta.env.DEV) {
        console.warn("routes.detail.action.submit.missing_route_group_id", { intent });
      }
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
      if (import.meta.env.DEV) {
        console.info("routes.detail.action.submit", { fields, intent, routeGroupId });
      }
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
    setRouteGroupClientError(null);
  }, []);

  const handleSaveRouteDraft = () => {
    if (!canSaveRouteDraft) return;
    submitRouteGroupAction("saveRouteDraft", {
      draft: JSON.stringify(buildRouteDraftPayload(timelineRouteRows)),
    });
  };

  useEffect(() => {
    if (routeGroupActionIntent) lastRouteActionIntentRef.current = routeGroupActionIntent;
  }, [routeGroupActionIntent]);

  useEffect(() => {
    if (routeActionFetcher.state !== "idle" || routeActionFetcher.data === undefined) return;
    if (lastRouteActionIntentRef.current !== "saveRouteDraft") return;
    lastRouteActionIntentRef.current = null;
    if ((routeActionFetcher.data?.errors ?? []).length === 0) resetRouteDraftChanges();
  }, [resetRouteDraftChanges, routeActionFetcher.data, routeActionFetcher.state]);

  useEffect(() => {
    setRouteCandidateTitle(defaultRouteCandidateTitle);
    setRouteLineDraftTitle(defaultRouteCandidateTitle);
  }, [defaultRouteCandidateTitle]);

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
        mapRef.current = new maplibregl.Map({
          attributionControl: { compact: true },
          center: routeMapCenterRef.current,
          container: mapContainerElement,
          fadeDuration: 0,
          style: OPENFREEMAP_STYLE_URL,
          zoom: 11,
        });
        const syncMarkerZoomVisibility = () => {
          syncRouteDetailMarkerZoomVisibility(mapRef.current, mapContainerElement);
        };
        syncMarkerZoomVisibility();
        const constructMs = roundPerfDuration(performance.now() - constructStartedAt);
        installMissingMapImageFallback(mapRef.current);
        mapRef.current.on("load", () => {
          syncMarkerZoomVisibility();
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
        mapRef.current.on("zoom", syncMarkerZoomVisibility);
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
      polygonCornerMarkersRef.current.forEach((marker) => marker.remove());
      polygonCornerMarkersRef.current = [];
      mapRef.current?.remove();
      mapContainerElement.classList.remove("route-detail-map--hide-order-markers");
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

    const scheduleRouteLineRetry = () => {
      if (routeLineRetryTimer != null) return;
      routeLineRetryTimer = window.setTimeout(() => {
        routeLineRetryTimer = null;
        syncRouteDetailRouteLine(map, savedRouteGeometry, routePathColor);
      }, 80);
    };

    const syncRouteDetailMap = () => {
      const syncStartedAt = performance.now();
      const routeLineStartedAt = performance.now();
      const didSyncRouteLine = syncRouteDetailRouteLine(map, savedRouteGeometry, routePathColor);
      if (!didSyncRouteLine) {
        scheduleRouteLineRetry();
      }
      const routeLineMs = roundPerfDuration(performance.now() - routeLineStartedAt);
      const markerStartedAt = performance.now();
      const routeDetailMarkers = createRouteDetailMapMarkers(
        map,
        maplibregl,
        departureLocation,
        routeMapStops,
        savedRouteStopPoints,
        routeLineColor,
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
        stopCount: routeMapStops.length,
        stopPointCount: savedRouteStopPoints.length,
        hasRouteGeometry: Boolean(savedRouteGeometry),
      });
    };
    const handleRouteDetailStyleData = () => {
      if (!syncRouteDetailRouteLine(map, savedRouteGeometry, routePathColor)) {
        scheduleRouteLineRetry();
      }
    };

    syncRouteDetailMap();
    map.on("styledata", handleRouteDetailStyleData);

    return () => {
      if (routeLineRetryTimer != null) {
        window.clearTimeout(routeLineRetryTimer);
      }
      map.off("styledata", handleRouteDetailStyleData);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [
    departureLocation,
    isMapReady,
    routeMapStops,
    routeLineColor,
    routePathColor,
    savedRouteGeometry,
    savedRouteStopPoints,
  ]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current) return undefined;

    const map = mapRef.current;
    if (!isRoutePolygonEditMode) {
      removeRouteEditPolygon(map);
      return undefined;
    }

    const canvas = map.getCanvas?.();
    const previousCursor = canvas?.style.cursor ?? "";

    if (canvas) canvas.style.cursor = "crosshair";
    map.doubleClickZoom?.disable?.();

    const handleMapClick = (event) => {
      if (isRoutePolygonClosed) return;
      clearRoutePolygonClickTimer();
      const lngLat = [event.lngLat.lng, event.lngLat.lat];
      routePolygonClickTimerRef.current = window.setTimeout(() => {
        routePolygonClickTimerRef.current = null;
        setRoutePolygonPoints((currentPoints) => [...currentPoints, lngLat]);
        setIsRoutePolygonClosed(false);
        setIsPolygonTargetPickerOpen(false);
      }, ROUTE_POLYGON_CLICK_DELAY_MS);
    };

    const handleMapDoubleClick = (event) => {
      event.preventDefault?.();
      event.originalEvent?.preventDefault?.();
      clearRoutePolygonClickTimer();
      if (routePolygonPoints.length >= 3) setIsRoutePolygonClosed(true);
    };

    map.on("click", handleMapClick);
    map.on("dblclick", handleMapDoubleClick);

    return () => {
      clearRoutePolygonClickTimer();
      map.off("click", handleMapClick);
      map.off("dblclick", handleMapDoubleClick);
      map.doubleClickZoom?.enable?.();
      if (canvas) canvas.style.cursor = previousCursor;
    };
  }, [isMapReady, isRoutePolygonClosed, isRoutePolygonEditMode, routePolygonPoints]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !mapLibraryRef.current) return undefined;

    const map = mapRef.current;
    const maplibregl = mapLibraryRef.current;
    polygonCornerMarkersRef.current.forEach((marker) => marker.remove());
    polygonCornerMarkersRef.current = [];

    if (!isRoutePolygonEditMode) {
      removeRouteEditPolygon(map);
      return undefined;
    }

    syncRouteEditPolygon(map, routePolygonPoints, isRoutePolygonClosed);
    polygonCornerMarkersRef.current = routePolygonPoints.map((point, pointIndex) => {
      const marker = new maplibregl.Marker({
        draggable: true,
        element: createRoutePolygonCornerElement(pointIndex),
      })
        .setLngLat(point)
        .addTo(map);

      marker.on("dragend", () => {
        const lngLat = marker.getLngLat();
        setRoutePolygonPoints((currentPoints) =>
          currentPoints.map((currentPoint, currentIndex) =>
            currentIndex === pointIndex ? [lngLat.lng, lngLat.lat] : currentPoint,
          ),
        );
        setIsPolygonTargetPickerOpen(false);
      });

      return marker;
    });

    return () => {
      polygonCornerMarkersRef.current.forEach((marker) => marker.remove());
      polygonCornerMarkersRef.current = [];
    };
  }, [isMapReady, isRoutePolygonClosed, isRoutePolygonEditMode, routePolygonPoints]);

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
                <div aria-label="Route summary" className="route-overview-summary">
                  {renderRouteHeaderMetric("Orders", routeDetail.orders)}
                  {renderRouteHeaderMetric("Delivery date", routeDetail.deliveryDate)}
                  {renderRouteHeaderMetric("Driver", routeDriverSummary)}
                </div>
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
                disabled={routeGroupActionBusy || hasRouteAllocationDraft}
                onClick={() => submitRouteGroupAction("reOptimizeRouteGroup")}
                style={routeActionButtonStyle}
                type="button"
              >{reOptimizeRouteGroupBusy ? "Working…" : "Re-optimize"}</button>
              <button
                disabled={routeGroupActionBusy || hasRouteAllocationDraft}
                onClick={() => submitRouteGroupAction("addEmptyRouteBranch", { label: "Route" })}
                style={routeActionButtonStyle}
                type="button"
              >{addEmptyRouteBranchBusy ? "Working…" : "Add Empty Route"}</button>
            </div>
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
                        <span style={routeLineTitleStyle}>{routeRow.title}</span>
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
                    <td style={routeStatusCellStyle}><span style={routeDepartureStatusStyle}>{routeDepartureStatus}</span></td>
                    <td style={routesDetailCellStyle}>
                      <button aria-label="Change route driver" style={routeEditableValueStyle} type="button">
                        <span style={routeEditableValueTextStyle}>{routeRow.driverLabel}</span>
                        {renderRouteEditableChevron()}
                      </button>
                    </td>
                    <td style={routesDetailCellStyle}>
                      <button aria-label="Change route vehicle" style={routeEditableValueStyle} type="button">
                        <span style={routeEditableValueTextStyle}>{routeRow.vehicleLabel}</span>
                        {renderRouteEditableChevron()}
                      </button>
                    </td>
                    <td style={routesDetailCellStyle}>
                      <button aria-label="Change route start time" style={routeEditableValueStyle} type="button">
                        <span style={routeEditableValueTextStyle}>{routeStartTimeLabel}</span>
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

          <section aria-label="Route stop timeline" style={routeTimelineStyle}>
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
                        ref={(node) => setRouteTimelineStopRef(stop.id, node)}
                        draggable
                        onDragEnd={handleRouteTimelineDragEnd}
                        onDragEnter={(event) => handleRouteTimelineStopDragEnter(event, routeRow, stop)}
                        onDragOver={(event) => handleRouteTimelineRouteDragOver(event, routeRow)}
                        onDragStart={(event) => handleRouteTimelineDragStart(event, routeRow, stop)}
                        style={{
                          ...routeTimelineStopStyle,
                          ...(polygonHighlightedOrderIds.has(stop.orderId) ? routeTimelineStopSelectedStyle : null),
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
          </section>
        </section>

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
