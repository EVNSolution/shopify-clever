import { formatDeliveryScopeLabel } from "./delivery-labels.js";

export function textOrUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function numberOrUndefined(value) {
  if (value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function firstArray(...values) {
  return values.find((value) => Array.isArray(value)) ?? [];
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
  const groupName = textOrUndefined(routeGroup?.name);
  if (name && groupName && name.startsWith(`${groupName} — `)) return fallback;
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

export function formatRouteStatus(status) {
  const value = textOrUndefined(status)?.toUpperCase();
  return value && value !== "UNAVAILABLE" && value !== "UNSTARTED" ? value : "DRAFT";
}
