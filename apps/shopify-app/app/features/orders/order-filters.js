export const ORDER_FILTER_QUERY_KEYS = {
  deliveryArea: "deliveryArea",
  deliveryDate: "deliveryDate",
  orderedDate: "orderedDate",
  planned: "planned",
};

const LEGACY_ORDER_FILTER_QUERY_KEYS = ["q"];
const POST_PLANNING_STATUSES = new Set([
  "planned",
  "route_planned",
  "route_created",
  "routed",
  "assigned",
  "draft",
  "unstarted",
  "started",
  "in_progress",
  "out_for_delivery",
  "dispatched",
  "attempted",
  "completed",
  "delivered",
]);
const DELIVERY_COMPLETE_STATUSES = new Set([
  "complete",
  "completed",
  "delivered",
  "fulfilled",
]);
const ROUTE_ASSIGNED_STATUSES = new Set([
  "assigned",
  "unstarted",
  "started",
  "in_progress",
  "out_for_delivery",
  "dispatched",
  "attempted",
]);
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function filterOrders(orders, filters = {}) {
  if (!Array.isArray(orders)) return [];

  const normalizedFilters = normalizeOrderFilters(filters);
  const options = {
    referenceDate: filters.referenceDate,
  };

  return orders.filter((order) => orderMatchesFilters(order, normalizedFilters, options));
}

export function orderMatchesFilters(order, filters = {}, options = {}) {
  const normalizedFilters = normalizeOrderFilters(filters);
  const referenceDate = options.referenceDate ?? filters.referenceDate;

  if (
    normalizedFilters.deliveryArea &&
    normalizeComparableText(order?.deliveryArea) !==
      normalizeComparableText(normalizedFilters.deliveryArea)
  ) {
    return false;
  }

  const deliveryDateFilter = normalizeDateOnlyValue(normalizedFilters.deliveryDate);
  if (
    deliveryDateFilter &&
    getOrderDeliveryDateValue(order) !== deliveryDateFilter
  ) {
    return false;
  }

  if (
    normalizedFilters.orderedDate &&
    normalizeComparableText(order?.orderedDate) !==
      normalizeComparableText(normalizedFilters.orderedDate)
  ) {
    return false;
  }

  if (normalizedFilters.planned === "false") {
    if (isOrderRouteCreated(order)) return false;
    if (isOrderDeliveryDatePast(order, referenceDate)) return false;
  }

  return true;
}

export function getOrderFilterOptions(orders) {
  const safeOrders = Array.isArray(orders) ? orders : [];

  return {
    deliveryAreas: getSortedUniqueValues(safeOrders, "deliveryArea"),
    deliveryDates: getSortedUniqueValues(safeOrders, "deliveryDate"),
    orderedDates: getSortedUniqueValues(safeOrders, "orderedDate"),
  };
}

export function getOrderFiltersFromSearchParams(searchParams) {
  const params = toSearchParams(searchParams);
  const plannedQueryKey = ORDER_FILTER_QUERY_KEYS.planned;

  return normalizeOrderFilters({
    deliveryArea: params.get(ORDER_FILTER_QUERY_KEYS.deliveryArea),
    deliveryDate: params.get(ORDER_FILTER_QUERY_KEYS.deliveryDate),
    orderedDate: params.get(ORDER_FILTER_QUERY_KEYS.orderedDate),
    planned: params.has(plannedQueryKey) ? params.get(plannedQueryKey) : "false",
  });
}

export function updateOrderFilterSearchParams(currentSearchParams, filters = {}) {
  const nextSearchParams = new URLSearchParams(toSearchParams(currentSearchParams));
  const normalizedFilters = normalizeOrderFilters(filters);

  for (const queryKey of Object.values(ORDER_FILTER_QUERY_KEYS)) {
    nextSearchParams.delete(queryKey);
  }
  for (const queryKey of LEGACY_ORDER_FILTER_QUERY_KEYS) {
    nextSearchParams.delete(queryKey);
  }

  for (const [filterKey, filterValue] of Object.entries(normalizedFilters)) {
    if (!filterValue) continue;

    nextSearchParams.set(ORDER_FILTER_QUERY_KEYS[filterKey], filterValue);
  }

  return nextSearchParams;
}

export function normalizeOrderFilters(filters = {}) {
  return {
    deliveryArea: textOrEmpty(filters.deliveryArea),
    deliveryDate: textOrEmpty(filters.deliveryDate),
    orderedDate: textOrEmpty(filters.orderedDate),
    planned: normalizePlannedFilter(filters.planned),
  };
}

export function hasActiveOrderFilters(filters = {}) {
  const normalizedFilters = normalizeOrderFilters(filters);

  return Object.entries(normalizedFilters).some(
    ([filterKey, value]) =>
      value.length > 0 &&
      !(filterKey === "planned" && value === "false"),
  );
}

export function isOrderRouteCreated(order) {
  const statusValues = [
    order?.planningStatus,
    order?.routeStatus,
    order?.routePlanStatus,
  ].map(normalizeComparableText);

  if (statusValues.some((statusValue) => POST_PLANNING_STATUSES.has(statusValue))) {
    return true;
  }

  return [
    order?.routePlanId,
    order?.plannedRoutePlanId,
    order?.activeRoutePlanId,
    order?.deliveryRoutePlanId,
    order?.routeId,
  ].some((value) => textOrEmpty(value).length > 0);
}

export function isOrderRouteAssigned(order) {
  const statusValues = [
    order?.planningStatus,
    order?.routeStatus,
    order?.routePlanStatus,
  ].map(normalizeComparableText);

  if (statusValues.some((statusValue) => ROUTE_ASSIGNED_STATUSES.has(statusValue))) {
    return true;
  }

  return [
    order?.driverId,
    order?.assignedDriverId,
    order?.routeDriverId,
    order?.deliveryDriverId,
  ].some((value) => textOrEmpty(value).length > 0);
}

export function isOrderDeliveryComplete(order) {
  const statusValues = [
    order?.status,
    order?.fulfillmentStatus,
    order?.displayFulfillmentStatus,
    order?.deliveryStatus,
    order?.planningStatus,
    order?.routeStatus,
    order?.routePlanStatus,
  ].map(normalizeComparableText);

  return statusValues.some((statusValue) =>
    DELIVERY_COMPLETE_STATUSES.has(statusValue),
  );
}

export function getOrderDeliveryDateValue(order) {
  return normalizeDateOnlyValue(order?.deliveryDate);
}

export function isOrderDeliveryDatePast(order, referenceDate = new Date()) {
  const deliveryDateValue = getOrderDeliveryDateValue(order);
  const referenceDateValue = normalizeReferenceDateValue(referenceDate);

  if (!deliveryDateValue || !referenceDateValue) return false;

  return deliveryDateValue < referenceDateValue;
}

export function getOrderDeliveryExceptionState(order, referenceDate = new Date()) {
  if (
    isOrderDeliveryComplete(order) ||
    !isOrderDeliveryDatePast(order, referenceDate)
  ) {
    return "none";
  }

  return isOrderRouteCreated(order) ? "overdue_assigned" : "overdue_unassigned";
}

export function isOrderRoutePlanningLocked(order, referenceDate = new Date()) {
  return isOrderRouteCreated(order) || isOrderDeliveryDatePast(order, referenceDate);
}

function getSortedUniqueValues(orders, key) {
  return Array.from(
    new Set(
      orders
        .map((order) => textOrEmpty(order?.[key]))
        .filter(Boolean),
    ),
  ).sort((leftValue, rightValue) =>
    leftValue.localeCompare(rightValue, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function normalizeComparableText(value) {
  return textOrEmpty(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeDateOnlyValue(value) {
  const candidateValue = textOrEmpty(value).slice(0, 10);

  return DATE_ONLY_PATTERN.test(candidateValue) ? candidateValue : "";
}

function normalizeReferenceDateValue(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return normalizeDateOnlyValue(value);
}

function normalizePlannedFilter(value) {
  const normalizedValue = normalizeComparableText(value);

  if (normalizedValue === "false") return "false";
  if (normalizedValue === "all" || normalizedValue === "true") return "all";

  return "";
}

function textOrEmpty(value) {
  return value == null ? "" : String(value).trim();
}

function toSearchParams(value) {
  return value instanceof URLSearchParams
    ? value
    : new URLSearchParams(value ?? "");
}
