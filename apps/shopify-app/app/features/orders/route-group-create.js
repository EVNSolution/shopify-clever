import { DEFAULT_ROUTE_PLAN_TITLE, textOrUndefined } from "./orders-page.shared.js";

export function buildCreateRouteGroupPayload({ depot, plannedOrders, routeName, routeScope }) {
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
