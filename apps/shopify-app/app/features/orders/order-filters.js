export const ORDER_FILTER_QUERY_KEYS = {
  deliveryArea: "deliveryArea",
  deliveryDate: "deliveryDate",
  deliveryState: "deliveryState",
  deliveryWeekday: "deliveryWeekday",
  orderedDate: "orderedDate",
  orderedDateFrom: "orderedDateFrom",
  orderedDateTo: "orderedDateTo",
  planned: "planned",
  scope: "scope",
  search: "search",
  serviceType: "serviceType",
  tab: "tab",
};

const LEGACY_ORDER_FILTER_QUERY_KEYS = ["q"];
export const ORDER_PLANNING_SCOPE = "planning";
export const ORDER_HISTORY_SCOPE = "history";
export const ORDER_DEFAULT_TAB = "unplanned";
export const ORDER_STATUS_TABS = [
  { label: "All", value: "all" },
  { label: "Unplanned", value: "unplanned" },
  { label: "Planned", value: "planned" },
  { label: "Needs Review", value: "needs_review" },
];
export const ORDER_SERVICE_TYPE_OPTIONS = [
  { label: "Delivery", value: "DELIVERY" },
  { label: "Evening Delivery", value: "EVENING_DELIVERY" },
  { label: "Pickup", value: "PICKUP" },
];
export const ORDER_WEEKDAY_OPTIONS = [
  { label: "Sunday", value: "SUNDAY" },
  { label: "Monday", value: "MONDAY" },
  { label: "Tuesday", value: "TUESDAY" },
  { label: "Wednesday", value: "WEDNESDAY" },
  { label: "Thursday", value: "THURSDAY" },
  { label: "Friday", value: "FRIDAY" },
  { label: "Saturday", value: "SATURDAY" },
];
export const ORDER_DELIVERY_STATE_OPTIONS = [
  { label: "Unplanned", value: "unplanned" },
  { label: "Planned", value: "planned" },
  { label: "Assigned", value: "assigned_undelivered" },
  { label: "Assigned overdue", value: "assigned_overdue" },
  { label: "Past due", value: "past_due" },
  { label: "Delivered", value: "delivered" },
];
export const ORDER_UNAVAILABLE_REASON_LABELS = {
  already_planned: "Already planned",
  date_lock_mismatch: "Different delivery date",
  history_read_only: "History is read-only",
  missing_coordinates: "Missing coordinates",
  missing_delivery_date: "Missing delivery date",
  missing_route_scope: "Missing route scope",
  needs_review: "Needs review",
  past_delivery_date: "Past delivery date",
  route_scope_mismatch: "Different route scope",
};
const POST_PLANNING_STATUSES = new Set([
  "planned",
  "route_planned",
  "route_created",
  "routed",
  "draft",
  "published",
]);
const DELIVERY_COMPLETE_STATUSES = new Set([
  "complete",
  "completed",
  "delivered",
  "fulfilled",
]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "voided"]);
const ROUTE_ASSIGNED_STATUSES = new Set(["published"]);
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
    normalizedFilters.scope === ORDER_PLANNING_SCOPE &&
    !isOrderInPlanningScope(order, referenceDate)
  ) {
    return false;
  }

  if (
    normalizedFilters.scope === ORDER_PLANNING_SCOPE &&
    normalizedFilters.tab !== "all" &&
    getOrderTabState(order, referenceDate) !== normalizedFilters.tab
  ) {
    return false;
  }

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
    normalizedFilters.deliveryWeekday &&
    getOrderDeliveryWeekday(order) !== normalizedFilters.deliveryWeekday
  ) {
    return false;
  }

  if (
    normalizedFilters.deliveryState &&
    getOrderDeliveryStateFilterValue(order, referenceDate) !== normalizedFilters.deliveryState
  ) {
    return false;
  }

  const orderedDateValue = normalizeDateOnlyValue(order?.orderedDate);
  if (
    normalizedFilters.orderedDateFrom &&
    (!orderedDateValue || orderedDateValue < normalizedFilters.orderedDateFrom)
  ) {
    return false;
  }

  if (
    normalizedFilters.orderedDateTo &&
    (!orderedDateValue || orderedDateValue > normalizedFilters.orderedDateTo)
  ) {
    return false;
  }

  if (normalizedFilters.serviceType && !orderMatchesServiceType(order, normalizedFilters.serviceType)) {
    return false;
  }

  if (
    normalizedFilters.search &&
    !orderMatchesSearch(order, normalizedFilters.search)
  ) {
    return false;
  }

  return true;
}

export function getOrderFilterOptions(orders) {
  const safeOrders = Array.isArray(orders) ? orders : [];

  return {
    deliveryAreas: getSortedUniqueValues(safeOrders, "deliveryArea"),
    deliveryDates: getSortedUniqueValues(safeOrders, "deliveryDate"),
    deliveryStates: getSortedDeliveryStates(safeOrders),
    deliveryWeekdays: getSortedDeliveryWeekdays(safeOrders),
    orderedDates: getSortedUniqueValues(safeOrders, "orderedDate"),
    serviceTypes: getSortedServiceTypes(safeOrders),
  };
}

export function getOrderFiltersFromSearchParams(searchParams) {
  const params = toSearchParams(searchParams);
  const plannedQueryKey = ORDER_FILTER_QUERY_KEYS.planned;

  return normalizeOrderFilters({
    deliveryArea: params.get(ORDER_FILTER_QUERY_KEYS.deliveryArea),
    deliveryDate: params.get(ORDER_FILTER_QUERY_KEYS.deliveryDate),
    deliveryState: params.get(ORDER_FILTER_QUERY_KEYS.deliveryState),
    deliveryWeekday: params.get(ORDER_FILTER_QUERY_KEYS.deliveryWeekday),
    orderedDate: params.get(ORDER_FILTER_QUERY_KEYS.orderedDate),
    orderedDateFrom: params.get(ORDER_FILTER_QUERY_KEYS.orderedDateFrom),
    orderedDateTo: params.get(ORDER_FILTER_QUERY_KEYS.orderedDateTo),
    planned: params.has(plannedQueryKey) ? params.get(plannedQueryKey) : "false",
    scope: params.get(ORDER_FILTER_QUERY_KEYS.scope),
    search:
      params.get(ORDER_FILTER_QUERY_KEYS.search) ??
      params.get(LEGACY_ORDER_FILTER_QUERY_KEYS[0]),
    serviceType: params.get(ORDER_FILTER_QUERY_KEYS.serviceType),
    tab: params.get(ORDER_FILTER_QUERY_KEYS.tab),
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
  const legacyOrderedDate = normalizeDateOnlyValue(filters.orderedDate);
  const orderedDateFrom = normalizeDateOnlyValue(filters.orderedDateFrom) || legacyOrderedDate;
  const orderedDateTo = normalizeDateOnlyValue(filters.orderedDateTo) || legacyOrderedDate;

  return {
    deliveryArea: textOrEmpty(filters.deliveryArea),
    deliveryDate: textOrEmpty(filters.deliveryDate),
    deliveryState: normalizeDeliveryState(filters.deliveryState),
    deliveryWeekday: normalizeDeliveryWeekday(filters.deliveryWeekday),
    orderedDate: "",
    orderedDateFrom: orderedDateFrom && orderedDateTo && orderedDateFrom > orderedDateTo ? orderedDateTo : orderedDateFrom,
    orderedDateTo: orderedDateFrom && orderedDateTo && orderedDateFrom > orderedDateTo ? orderedDateFrom : orderedDateTo,
    planned: "",
    scope: normalizeScope(filters.scope),
    search: textOrEmpty(filters.search),
    serviceType: normalizeServiceType(filters.serviceType),
    tab: normalizeTab(filters.tab, filters.planned),
  };
}

export function hasActiveOrderFilters(filters = {}) {
  const normalizedFilters = normalizeOrderFilters(filters);

  return Object.entries(normalizedFilters).some(
    ([filterKey, value]) =>
      value.length > 0 &&
      !(filterKey === "tab" && value === ORDER_DEFAULT_TAB) &&
      !(filterKey === "scope" && value === ORDER_PLANNING_SCOPE),
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
  ].map(normalizeComparableText);

  return statusValues.some((statusValue) =>
    DELIVERY_COMPLETE_STATUSES.has(statusValue),
  );
}

export function isOrderCancelled(order) {
  const statusValues = [
    order?.cancelledAt ? "cancelled" : "",
    order?.status,
    order?.displayFulfillmentStatus,
    order?.fulfillmentStatus,
    order?.financialStatus,
  ].map(normalizeComparableText);

  return statusValues.some((statusValue) => CANCELLED_STATUSES.has(statusValue));
}

export function getOrderDeliveryDateValue(order) {
  return normalizeDateOnlyValue(order?.deliveryDate);
}

export function getOrderDeliveryWeekday(order) {
  const explicitWeekday = normalizeDeliveryWeekday(order?.deliveryWeekday);
  if (explicitWeekday) return explicitWeekday;

  return getWeekdayFromDate(getOrderDeliveryDateValue(order));
}

export function getOrderDeliveryStateFilterValue(order, referenceDate = new Date()) {
  const exceptionState = getOrderDeliveryExceptionState(order, referenceDate);

  if (exceptionState === "overdue_assigned") return "assigned_overdue";
  if (exceptionState === "overdue_unassigned") return "past_due";
  if (isOrderDeliveryComplete(order)) return "delivered";
  if (isOrderRouteAssigned(order)) return "assigned_undelivered";
  if (isOrderRouteCreated(order)) return "planned";

  return "unplanned";
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

export function isOrderInPlanningScope(order, referenceDate = new Date()) {
  return (
    !isOrderCancelled(order) &&
    !isOrderDeliveryComplete(order) &&
    !isOrderDeliveryDatePast(order, referenceDate)
  );
}

export function getOrderTabState(order, referenceDate = new Date()) {
  if (isOrderRouteCreated(order)) return "planned";
  if (isOrderNeedsReview(order, referenceDate)) return "needs_review";
  return "unplanned";
}

export function getOrderUnavailableReasons(order, context = {}) {
  const referenceDate = context.referenceDate ?? new Date();
  const reasons = [];

  if (context.scope === ORDER_HISTORY_SCOPE) reasons.push("history_read_only");
  if (isOrderRouteCreated(order)) reasons.push("already_planned");
  if (isOrderDeliveryDatePast(order, referenceDate)) reasons.push("past_delivery_date");
  if (!getOrderDeliveryDateValue(order)) reasons.push("missing_delivery_date");
  if (!order?.hasCoordinates) reasons.push("missing_coordinates");
  if (!textOrEmpty(order?.routeScopeKey)) reasons.push("missing_route_scope");
  if (isOrderNeedsReview(order, referenceDate)) reasons.push("needs_review");

  const deliveryDateLock = normalizeDateOnlyValue(context.deliveryDateLock);
  const orderDeliveryDate = getOrderDeliveryDateValue(order);
  if (deliveryDateLock && orderDeliveryDate && orderDeliveryDate !== deliveryDateLock) {
    reasons.push("date_lock_mismatch");
  }

  const routeScopeKey = textOrEmpty(context.routeScopeKey);
  const orderRouteScopeKey = textOrEmpty(order?.routeScopeKey);
  if (routeScopeKey && orderRouteScopeKey && orderRouteScopeKey !== routeScopeKey) {
    reasons.push("route_scope_mismatch");
  }

  return Array.from(new Set(reasons));
}

export function isOrderSelectableForCurrentWorkset(order, context = {}) {
  return getOrderUnavailableReasons(order, context).length === 0;
}

export function getBulkOrderSelectionState(orders, context = {}) {
  const selectedOrders = [];
  const unavailableReasonCounts = {};

  for (const order of Array.isArray(orders) ? orders : []) {
    const reasons = getOrderUnavailableReasons(order, context);
    if (reasons.length === 0) {
      selectedOrders.push(order);
      continue;
    }

    for (const reason of reasons) {
      unavailableReasonCounts[reason] = (unavailableReasonCounts[reason] ?? 0) + 1;
    }
  }

  return {
    selectedOrderIds: selectedOrders.map((order) => order.id).filter(Boolean),
    selectedOrders,
    unavailableCount: (Array.isArray(orders) ? orders.length : 0) - selectedOrders.length,
    unavailableReasonCounts,
  };
}

export function formatUnavailableReason(reason) {
  return ORDER_UNAVAILABLE_REASON_LABELS[reason] ?? reason;
}

export function formatServiceTypeLabel(value) {
  const normalizedValue = normalizeServiceType(value);
  return (
    ORDER_SERVICE_TYPE_OPTIONS.find((option) => option.value === normalizedValue)?.label ??
    textOrEmpty(value)
  );
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

function getSortedDeliveryStates(orders) {
  const values = new Set(
    orders.map((order) => getOrderDeliveryStateFilterValue(order)).filter(Boolean),
  );

  return ORDER_DELIVERY_STATE_OPTIONS.map((option) => option.value).filter((value) =>
    values.has(value),
  );
}

function getSortedDeliveryWeekdays(orders) {
  const values = new Set(orders.map(getOrderDeliveryWeekday).filter(Boolean));

  return ORDER_WEEKDAY_OPTIONS.map((option) => option.value).filter((value) =>
    values.has(value),
  );
}

function getSortedServiceTypes(orders) {
  const knownValues = new Set(
    ORDER_SERVICE_TYPE_OPTIONS.map((option) => option.value),
  );
  const values = Array.from(
    new Set(
      orders
        .map((order) => normalizeServiceType(order?.serviceType))
        .filter(Boolean),
    ),
  );

  return [
    ...ORDER_SERVICE_TYPE_OPTIONS.map((option) => option.value).filter((value) =>
      values.includes(value),
    ),
    ...values
      .filter((value) => !knownValues.has(value))
      .sort((leftValue, rightValue) => leftValue.localeCompare(rightValue)),
  ];
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

function normalizeTab(value, legacyPlannedValue) {
  const normalizedValue = normalizeComparableText(value);
  if (["all", "unplanned", "planned", "needs_review"].includes(normalizedValue)) {
    return normalizedValue;
  }

  const legacyPlanned = normalizePlannedFilter(legacyPlannedValue);
  if (legacyPlanned === "all") return "all";

  return ORDER_DEFAULT_TAB;
}

function normalizeScope(value) {
  const normalizedValue = normalizeComparableText(value);
  return normalizedValue === ORDER_HISTORY_SCOPE
    ? ORDER_HISTORY_SCOPE
    : ORDER_PLANNING_SCOPE;
}

function normalizeServiceType(value) {
  const normalizedValue = textOrEmpty(value).toUpperCase().replace(/[\s-]+/g, "_");
  return ["DELIVERY", "EVENING_DELIVERY", "PICKUP"].includes(normalizedValue)
    ? normalizedValue
    : "";
}

function normalizeDeliveryWeekday(value) {
  const normalizedValue = textOrEmpty(value).toUpperCase().replace(/[\s-]+/g, "_");
  return ORDER_WEEKDAY_OPTIONS.some((option) => option.value === normalizedValue)
    ? normalizedValue
    : "";
}

function normalizeDeliveryState(value) {
  const normalizedValue = normalizeComparableText(value);
  return ORDER_DELIVERY_STATE_OPTIONS.some((option) => option.value === normalizedValue)
    ? normalizedValue
    : "";
}

function getWeekdayFromDate(dateValue) {
  if (!dateValue) return "";

  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";

  return ORDER_WEEKDAY_OPTIONS[date.getUTCDay()]?.value ?? "";
}

function orderMatchesServiceType(order, serviceTypeFilter) {
  const normalizedFilter = normalizeServiceType(serviceTypeFilter);
  const orderServiceType = normalizeServiceType(order?.serviceType);

  if (normalizedFilter === "PICKUP") return orderServiceType === "PICKUP";
  if (normalizedFilter === "DELIVERY") return orderServiceType !== "" && orderServiceType !== "PICKUP";

  return orderServiceType === normalizedFilter;
}

function isOrderNeedsReview(order, referenceDate) {
  if (!order) return true;
  if (normalizeComparableText(order.readiness) === "needs_review") return true;
  if (Array.isArray(order.reviewReasons) && order.reviewReasons.length > 0) return true;
  if (!order.hasCoordinates) return true;
  if (!getOrderDeliveryDateValue(order)) return true;
  if (!textOrEmpty(order.routeScopeKey)) return true;
  if (isOrderDeliveryDatePast(order, referenceDate)) return false;

  return false;
}

function orderMatchesSearch(order, searchValue) {
  const query = normalizeSearchText(searchValue);
  if (!query) return true;

  return [
    order?.name,
    order?.orderId,
    order?.legacyResourceId,
    order?.customer,
    order?.address,
    order?.email,
    order?.phone,
    order?.deliveryArea,
    order?.deliveryLabel,
    order?.planningStatus,
    order?.serviceType,
  ]
    .map(normalizeSearchText)
    .some((value) => value.includes(query));
}

function normalizeSearchText(value) {
  return textOrEmpty(value).toLowerCase();
}

function textOrEmpty(value) {
  return value == null ? "" : String(value).trim();
}

function toSearchParams(value) {
  return value instanceof URLSearchParams
    ? value
    : new URLSearchParams(value ?? "");
}
