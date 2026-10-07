import {
  getOrderDeliveryDateValue,
  getOrderDeliveryWeekday,
  isOrderCancelled,
  isOrderDeliveryComplete,
} from "../orders/order-filters.js";
import { getRouteGroupChildren } from "./route-helpers.js";

const DISPLAY_ORDER_COLLATOR = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function buildRouteAddOrderCandidates(orders, context = {}) {
  return (Array.isArray(orders) ? orders : [])
    .filter((order) => text(order?.orderId))
    .map((order) => {
      const addBlockedReason = getRouteAddOrderBlockedReason(order, context);
      return {
        addable: addBlockedReason == null,
        addBlockedReason,
        address: getOrderAddress(order),
        customer: text(order?.customer ?? order?.recipientName) ?? "Unknown recipient",
        deliveryDate: text(getOrderDeliveryDateValue(order)) ?? "Date Pending",
        deliveryDay: getOrderDeliveryWeekday(order) ?? "–",
        id: text(order?.id ?? order?.shopifyOrderGid ?? order?.orderId),
        itemCount: getOrderItemCount(order),
        name: text(order?.name) ?? text(order?.orderId),
        orderDate: normalizeDateOnly(order?.orderedDate) ?? "No date",
        orderId: text(order?.orderId),
      };
    });
}

export function getRouteAddOrderBlockedReason(order, { routeGroup } = {}) {
  const stopStatus = text(order?.deliveryStopStatus ?? order?.deliveryStatus)?.toUpperCase().replace(/[\s-]+/g, "_");
  if (isOrderCancelled(order) || stopStatus === "CANCELLED") return "Cancelled";
  if (isOrderDeliveryComplete(order)) return "Delivery completed";
  if (stopStatus === "FAILED") return "Delivery failed";
  if (stopStatus === "SKIPPED") return "Delivery skipped";
  // Separate saved groups may plan the same order. Each group's current
  // children still partition its orders; global route pointers are not blockers.
  if (getRouteGroupChildren(routeGroup).some((child) => (
    Array.isArray(child.orderIds) && child.orderIds.some((orderId) => text(orderId) === text(order?.orderId))
  ))) return "Already assigned within this route group";
  if (order?.hasCoordinates !== true) return "Missing coordinates";
  return null;
}

export function filterRouteAddOrderCandidatesByDate(candidates, filter = {}) {
  const orders = Array.isArray(candidates) ? candidates : [];
  const field = filter.field === "orderDate" ? "orderDate" : "deliveryDate";
  const mode = ["single", "range", "missing"].includes(filter.mode) ? filter.mode : "all";
  if (mode === "all") return orders;
  if (mode === "missing") {
    return orders.filter((order) => !normalizeDateOnly(order?.[field]));
  }

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

export function filterAndSortRouteAddOrderCandidates(candidates, filter = {}) {
  const query = normalizeOrderSearchQuery(filter.query);
  const dateFilteredCandidates = query
    ? (Array.isArray(candidates) ? candidates : [])
    : filterRouteAddOrderCandidatesByDate(candidates, filter);
  return dateFilteredCandidates
    .map((order, index) => ({ index, order }))
    .filter(({ order }) => !query || normalizeOrderSearchQuery(order?.name).includes(query))
    .sort((left, right) => (
      DISPLAY_ORDER_COLLATOR.compare(text(right.order?.name) ?? "", text(left.order?.name) ?? "")
      || left.index - right.index
    ))
    .map(({ order }) => order);
}

export function updateRouteAddOrderSelection(selectedOrderIds, visibleCandidates, checked) {
  const selectedIds = Array.isArray(selectedOrderIds) ? selectedOrderIds : [];
  const visibleOrderIds = new Set(
    (Array.isArray(visibleCandidates) ? visibleCandidates : [])
      .filter((order) => order?.addable !== false)
      .map((order) => text(order?.orderId))
      .filter(Boolean),
  );
  return checked
    ? [...new Set([...selectedIds, ...visibleOrderIds])]
    : selectedIds.filter((orderId) => !visibleOrderIds.has(orderId));
}

function normalizeOrderSearchQuery(value) {
  return (text(value) ?? "").toLocaleLowerCase("en").replace(/^#/, "");
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
