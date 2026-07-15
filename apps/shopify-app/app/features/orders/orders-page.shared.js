import { ORDER_FILTER_QUERY_KEYS } from "./order-filters.js";

export const DEFAULT_ROUTE_PLAN_TITLE = "CLEVER route draft";

const ORDERS_UI_ONLY_QUERY_KEYS = new Set([
  ...Object.values(ORDER_FILTER_QUERY_KEYS),
  "q",
  "view",
]);

export function textOrUndefined(value) {
  if (value == null) return undefined;

  const text = String(value).trim();

  return text.length > 0 ? text : undefined;
}

export function buildOrderTimelineDetails({ deliveryCycle, order, shopTimeZone }) {
  const orderedAt = getOrderTimestampValue(order, ["orderCreatedAt", "createdAt"]);
  const processedAt = getOrderTimestampValue(order, ["processedAt"]);
  const updatedAt = getOrderTimestampValue(order, ["updatedAt", "updatedAtShopify"]);
  const routeSequence =
    order?.routeSequence ??
    order?.rawPayload?.routeSequence ??
    order?.shopifyOrderSnapshot?.routeSequence;

  return getUniqueTimelineDetails([
    formatTimelineDetail(
      "Ordered date",
      order?.orderedDate ?? formatOrderDateTimePart(orderedAt, shopTimeZone, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    ),
    formatTimelineDetail("Ordered time", formatOrderTime(orderedAt, shopTimeZone)),
    formatTimelineDetail("Processed", formatOrderDateTime(processedAt, shopTimeZone)),
    formatTimelineDetail("Last updated", formatOrderDateTime(updatedAt, shopTimeZone)),
    formatTimelineDetail("Cycle cutoff", formatDeliveryCycleCutoff(deliveryCycle)),
    formatTimelineDetail("Delivery cycle", formatOrderDeliveryCycle(order)),
    formatTimelineDetail("Route sequence", routeSequence),
  ]);
}

function getOrderTimestampValue(order, keys) {
  for (const key of keys) {
    const value =
      order?.[key] ??
      order?.rawPayload?.[key] ??
      order?.shopifyOrderSnapshot?.[key];
    const text = textOrUndefined(value);
    if (text) return text;
  }

  return undefined;
}

function formatOrderDateTimePart(value, shopTimeZone, options) {
  const text = textOrUndefined(value);
  if (!text) return undefined;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  return new Intl.DateTimeFormat("en-CA", {
    ...options,
    ...(shopTimeZone ? { timeZone: shopTimeZone } : {}),
  }).format(date);
}

function formatOrderDateTime(value, shopTimeZone) {
  return formatOrderDateTimePart(value, shopTimeZone, {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZoneName: "short",
    year: "numeric",
  });
}

function formatOrderTime(value, shopTimeZone) {
  return formatOrderDateTimePart(value, shopTimeZone, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatDeliveryCycleCutoff(deliveryCycle) {
  if (!deliveryCycle) return undefined;

  return getUniqueTimelineDetails([
    deliveryCycle.cutoffWeekday,
    deliveryCycle.cutoffTime,
    deliveryCycle.timeZone,
  ]).join(" · ") || undefined;
}

function formatOrderDeliveryCycle(order) {
  const timeWindowStart = textOrUndefined(order?.timeWindowStart);
  const timeWindowEnd = textOrUndefined(order?.timeWindowEnd);

  return getUniqueTimelineDetails([
    order?.deliveryDate,
    order?.deliveryLabel,
    order?.deliveryDay,
    order?.deliverySession,
    timeWindowStart && timeWindowEnd ? `${timeWindowStart}-${timeWindowEnd}` : undefined,
  ]).join(" · ") || undefined;
}

function formatTimelineDetail(label, value) {
  const text = textOrUndefined(value);
  return text ? `${label}: ${text}` : undefined;
}

function getUniqueTimelineDetails(values) {
  return Array.from(new Set(values.map(textOrUndefined).filter(Boolean)));
}

export function roundPerfDuration(duration) {
  return Number(duration.toFixed(2));
}

export function getSafePerformanceNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

export function buildOrdersViewNavigationMetric({
  activeOrdersView,
  observedAt,
  pendingNavigation,
}) {
  if (!pendingNavigation || pendingNavigation.toView !== activeOrdersView) return null;

  return {
    name: "orders.view.navigation",
    category: "orders-view-navigation",
    durationMs: roundPerfDuration(observedAt - pendingNavigation.startedAt),
    fromView: pendingNavigation.fromView,
    toView: activeOrdersView,
  };
}

export function shouldRequestOrdersData({
  activeOrdersView,
  ordersLoaded,
  requestPending,
  revalidationState,
}) {
  return activeOrdersView === "orders" &&
    !ordersLoaded &&
    !requestPending &&
    revalidationState === "idle";
}

export function shouldRevalidateOrdersRoute({
  currentUrl,
  defaultShouldRevalidate,
  formMethod,
  nextUrl,
}) {
  if (formMethod && formMethod.toLowerCase() !== "get") {
    return defaultShouldRevalidate;
  }
  if (!currentUrl || !nextUrl || currentUrl.pathname !== nextUrl.pathname) {
    return defaultShouldRevalidate;
  }
  if (currentUrl.href === nextUrl.href) {
    return defaultShouldRevalidate;
  }

  const changedQueryKeys = getChangedQueryKeys(
    currentUrl.searchParams,
    nextUrl.searchParams,
  );

  if (changedQueryKeys.length === 0) {
    return defaultShouldRevalidate;
  }

  return changedQueryKeys.every((queryKey) => ORDERS_UI_ONLY_QUERY_KEYS.has(queryKey))
    ? false
    : defaultShouldRevalidate;
}

export function withPromiseTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(message)),
      timeoutMs,
    );

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function getChangedQueryKeys(currentSearchParams, nextSearchParams) {
  const queryKeys = new Set([
    ...currentSearchParams.keys(),
    ...nextSearchParams.keys(),
  ]);

  return [...queryKeys].filter((queryKey) => {
    const currentValues = currentSearchParams.getAll(queryKey);
    const nextValues = nextSearchParams.getAll(queryKey);

    return currentValues.length !== nextValues.length ||
      currentValues.some((value, index) => value !== nextValues[index]);
  });
}
