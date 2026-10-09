import { DEFAULT_ROUTE_PLAN_TITLE, textOrUndefined } from "./orders-page.shared.js";

export function buildCreateRouteGroupPayload({ depot, initialRouteRequestId, plannedOrders, routeName, routeScope, routeOptions }) {
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
    ...(initialRouteRequestId ? { initialRoute: { requestId: initialRouteRequestId, ...(routeOptions ?? {}) } } : {}),
    name: textOrUndefined(routeName) ?? DEFAULT_ROUTE_PLAN_TITLE,
    orderIds: plannedOrders.map((order) => order.orderId),
  };
}

export function hasNamedInitialRoute(routeGroup, routeName, orderIds) {
  const children = (routeGroup?.children ?? []).filter((child) => child?.routePlanId ?? child?.routePlan?.id);
  if (!routeGroup?.id || routeGroup.name !== routeName || children.length !== 1) return false;
  const child = children[0];
  const savedOrderIds = child.orderIds ?? [];
  return child.routePlan?.name === routeName && child.routePlan?.status === "READY"
    && savedOrderIds.length === orderIds.length
    && new Set(savedOrderIds).size === orderIds.length
    && orderIds.every((orderId) => savedOrderIds.includes(orderId));
}
