import { formatDeliveryScopeLabel } from "./delivery-labels.js";

export function textOrUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function numberOrUndefined(value) {
  const text = textOrUndefined(value);
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

export function firstArray(...values) {
  return values.find((value) => Array.isArray(value)) ?? [];
}

export function getRouteStopStatus(stop) {
  return (textOrUndefined(stop?.deliveryStopStatus)
    ?? textOrUndefined(stop?.deliveryStatus)
    ?? textOrUndefined(stop?.status)
    ?? "").toUpperCase();
}

export function countRouteStopsByStatus(routeStops, statuses) {
  const statusSet = new Set(statuses);
  return routeStops.filter((stop) => statusSet.has(getRouteStopStatus(stop))).length;
}

export function readRouteOptimizedSnapshot(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function getDefaultRouteGroupChildName(index, child) {
  const routeIdx = numberOrUndefined(child?.routeIdx);
  const sortOrder = numberOrUndefined(child?.sortOrder);
  return `#${routeIdx ?? sortOrder ?? index + 1}`;
}

export function getRouteGroupChildRouteName(routeGroup, child, routePlan, index) {
  const fallback = getDefaultRouteGroupChildName(index, child);
  const name = textOrUndefined(routePlan?.name ?? child?.routePlan?.name ?? child?.label);
  void routeGroup;
  return name ?? fallback;
}

export function getRouteGroupChildRoutePlanId(child) {
  return textOrUndefined(child?.routePlanId) ?? textOrUndefined(child?.routePlan?.id);
}

export function getRouteGroupChildren(routeGroup) {
  return (routeGroup?.children ?? []).filter((child) => getRouteGroupChildRoutePlanId(child));
}

export function getVisibleRouteGroupChildren(routeGroup) {
  const children = getRouteGroupChildren(routeGroup);
  return children
    .map((child, index) => ({ child, index }))
    .sort((left, right) => {
      const leftRouteIdx = numberOrUndefined(left.child?.routeIdx) ?? numberOrUndefined(left.child?.sortOrder) ?? left.index + 1;
      const rightRouteIdx = numberOrUndefined(right.child?.routeIdx) ?? numberOrUndefined(right.child?.sortOrder) ?? right.index + 1;
      return leftRouteIdx - rightRouteIdx || left.index - right.index;
    })
    .map(({ child }) => child);
}

export function formatRouteDeliveryScope(routePlan, emptyLabel = "-") {
  return formatDeliveryScopeLabel({
    deliveryDate: routePlan?.routeScope?.deliveryDate ?? routePlan?.deliveryDate ?? routePlan?.planDate,
    timeWindowEnd: routePlan?.routeScope?.timeWindowEnd ?? routePlan?.timeWindowEnd,
    timeWindowStart: routePlan?.routeScope?.timeWindowStart ?? routePlan?.timeWindowStart,
  }) ?? emptyLabel;
}

// These legacy values describe a route before execution. Missing and unsupported
// values have no known execution state and must not enable Ready controls.
const READY_ROUTE_STATUSES = new Set(["READY", "DRAFT", "PUBLISHED", "OPTIMIZED", "ASSIGNED", "UNSTARTED", "CHANGED"]);
const TERMINAL_ROUTE_STATUSES = new Set(["COMPLETED", "INCOMPLETE", "CANCELLED"]);

export function normalizeRouteExecutionStatus(status) {
  const value = textOrUndefined(status)?.toUpperCase().replace(/[\s-]+/g, "_");
  if (READY_ROUTE_STATUSES.has(value)) return "READY";
  if (value === "IN_PROGRESS" || TERMINAL_ROUTE_STATUSES.has(value)) return value;
  return "UNKNOWN";
}

export function isTerminalRouteExecutionStatus(status) {
  return TERMINAL_ROUTE_STATUSES.has(normalizeRouteExecutionStatus(status));
}

export function mergeRouteExecutionStatus(currentStatus, incomingStatus) {
  return isTerminalRouteExecutionStatus(currentStatus)
    ? normalizeRouteExecutionStatus(currentStatus)
    : normalizeRouteExecutionStatus(incomingStatus);
}

export function formatRouteStatus(status) {
  return {
    READY: "Ready",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    INCOMPLETE: "Incomplete",
    CANCELLED: "Cancelled",
    UNKNOWN: "Unknown",
  }[normalizeRouteExecutionStatus(status)];
}

export function getRouteStatusBadgeColors(status) {
  return {
    READY: { background: "#f1f1f1", color: "#616161" },
    IN_PROGRESS: { background: "#e0f0ff", color: "#00527c" },
    COMPLETED: { background: "#e3f1df", color: "#205c20" },
    INCOMPLETE: { background: "#fff1c7", color: "#5e4200" },
    CANCELLED: { background: "#fee9e8", color: "#8e1f0b" },
    UNKNOWN: { background: "#f1f1f1", color: "#616161" },
  }[normalizeRouteExecutionStatus(status)];
}

export function shouldRevalidateRoutesRoute({
  currentUrl,
  defaultShouldRevalidate,
  formMethod,
  nextUrl,
}) {
  if (formMethod && formMethod.toLowerCase() !== "get") {
    return defaultShouldRevalidate;
  }

  const isRoutesPath = (pathname) =>
    pathname === "/app/routes" || pathname.startsWith("/app/routes/");
  if (currentUrl && nextUrl?.pathname === "/app/routes/" && currentUrl.pathname !== nextUrl.pathname) {
    return true;
  }

  if (
    currentUrl &&
    nextUrl &&
    currentUrl.pathname !== nextUrl.pathname &&
    isRoutesPath(currentUrl.pathname) &&
    isRoutesPath(nextUrl.pathname)
  ) {
    return false;
  }

  return defaultShouldRevalidate;
}
