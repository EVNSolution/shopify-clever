import {
  getOrderDeliveryDateValue,
  getOrderDeliveryWeekday,
  isOrderCancelled,
  isOrderDeliveryComplete,
  isOrderRouteCreated,
} from "../orders/order-filters.js";

export function buildRouteAddOrderCandidates(orders) {
  return (Array.isArray(orders) ? orders : [])
    .filter((order) => {
      if (!text(order?.orderId) || order?.hasCoordinates !== true) return false;
      if (isOrderRouteCreated(order) || isOrderCancelled(order) || isOrderDeliveryComplete(order)) return false;
      return true;
    })
    .map((order) => ({
      address: getOrderAddress(order),
      customer: text(order?.customer ?? order?.recipientName) ?? "Unknown recipient",
      deliveryDate: getOrderDeliveryDateValue(order) ?? "–",
      deliveryDay: getOrderDeliveryWeekday(order) ?? "–",
      id: text(order?.id ?? order?.shopifyOrderGid ?? order?.orderId),
      itemCount: getOrderItemCount(order),
      name: text(order?.name) ?? text(order?.orderId),
      orderDate: normalizeDateOnly(order?.orderedDate) ?? "–",
      orderId: text(order?.orderId),
    }));
}

export function filterRouteAddOrderCandidatesByDate(candidates, filter = {}) {
  const orders = Array.isArray(candidates) ? candidates : [];
  const field = filter.field === "orderDate" ? "orderDate" : "deliveryDate";
  const mode = ["single", "range"].includes(filter.mode) ? filter.mode : "all";
  if (mode === "all") return orders;

  const startDate = normalizeDateOnly(filter.startDate);
  const endDate = normalizeDateOnly(filter.endDate);
  if (mode === "single") {
    return startDate ? orders.filter((order) => normalizeDateOnly(order?.[field]) === startDate) : orders;
  }
  if (!startDate && !endDate) return orders;

  const [lowerDate, upperDate] = startDate && endDate && startDate > endDate
    ? [endDate, startDate]
    : [startDate, endDate];
  return orders.filter((order) => {
    const orderDate = normalizeDateOnly(order?.[field]);
    if (!orderDate) return false;
    if (lowerDate && orderDate < lowerDate) return false;
    return !upperDate || orderDate <= upperDate;
  });
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

function normalizeDateOnly(value) {
  const normalized = text(value)?.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized ?? "") ? normalized : undefined;
}
