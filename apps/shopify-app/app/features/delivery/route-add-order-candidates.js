import {
  getOrderDeliveryDateValue,
  getOrderDeliveryWeekday,
  isOrderCancelled,
  isOrderDeliveryComplete,
  isOrderRouteCreated,
} from "../orders/order-filters.js";

export function buildRouteAddOrderCandidates(orders, { routeGroup, routePlan } = {}) {
  const deliveryDate = getOrderDeliveryDateValue({
    deliveryDate:
      routePlan?.routeScope?.deliveryDate
      ?? routePlan?.deliveryDate
      ?? routePlan?.planDate
      ?? routeGroup?.routeScope?.deliveryDate
      ?? routeGroup?.deliveryDate
      ?? routeGroup?.planDate
      ?? routeGroup?.dateRangeStart,
  });
  const deliveryDay = getOrderDeliveryWeekday({
    deliveryDate,
    deliveryDay:
      routePlan?.routeScope?.deliveryDay
      ?? routePlan?.deliveryDay
      ?? routePlan?.deliveryWeekday
      ?? routeGroup?.routeScope?.deliveryDay
      ?? routeGroup?.deliveryDay
      ?? routeGroup?.deliveryWeekday,
  });
  if (!deliveryDate && !deliveryDay) return [];

  return (Array.isArray(orders) ? orders : [])
    .filter((order) => {
      if (!text(order?.orderId) || order?.hasCoordinates !== true) return false;
      if (isOrderRouteCreated(order) || isOrderCancelled(order) || isOrderDeliveryComplete(order)) return false;
      if (deliveryDate && getOrderDeliveryDateValue(order) !== deliveryDate) return false;
      return !deliveryDay || getOrderDeliveryWeekday(order) === deliveryDay;
    })
    .map((order) => ({
      address: getOrderAddress(order),
      customer: text(order?.customer ?? order?.recipientName) ?? "Unknown recipient",
      deliveryDate: getOrderDeliveryDateValue(order) ?? "–",
      deliveryDay: getOrderDeliveryWeekday(order) ?? "–",
      id: text(order?.id ?? order?.shopifyOrderGid ?? order?.orderId),
      itemCount: getOrderItemCount(order),
      name: text(order?.name) ?? text(order?.orderId),
      orderId: text(order?.orderId),
    }));
}

function getOrderAddress(order) {
  const explicit = text(order?.address);
  if (explicit) return explicit;

  const address = order?.shippingAddress ?? order?.rawPayload?.shippingAddress;
  const parts = [
    address?.address1,
    address?.address2,
    address?.city,
    address?.province,
    address?.postalCode,
    address?.countryCode,
  ].map(text).filter(Boolean);
  return parts.join(", ") || "–";
}

function getOrderItemCount(order) {
  const explicit = Number(order?.itemCount ?? order?.totalItems ?? order?.itemsCount);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;

  const items = order?.lineItems ?? order?.rawPayload?.lineItems;
  const rows = Array.isArray(items)
    ? items
    : Array.isArray(items?.nodes)
      ? items.nodes
      : Array.isArray(items?.edges)
        ? items.edges.map((edge) => edge?.node).filter(Boolean)
        : [];
  return rows.reduce((total, item) => total + (Number(item?.quantity) || 0), 0);
}

function text(value) {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}
