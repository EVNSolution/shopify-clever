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
  const orderedDate =
    textOrUndefined(order?.orderedDate) ??
    formatOrderDateTimePart(orderedAt, shopTimeZone, DATE_FORMAT_OPTIONS);
  const orderedTime = formatOrderDateTimePart(orderedAt, shopTimeZone, TIME_FORMAT_OPTIONS);
  const timeZone = textOrUndefined(deliveryCycle?.timeZone) ?? textOrUndefined(shopTimeZone);
  const routeSequence =
    order?.routeSequence ??
    order?.rawPayload?.routeSequence ??
    order?.shopifyOrderSnapshot?.routeSequence;

  return getUniqueTimelineDetails([
    formatTimelineDetail("Ordered", formatOrderedDateTime(orderedDate, orderedTime)),
    formatTimelineDetail(
      "Processed",
      formatRelativeOrderDateTime(processedAt, shopTimeZone, orderedDate),
    ),
    isSameOrderInstant(processedAt, updatedAt)
      ? undefined
      : formatTimelineDetail(
          "Updated",
          formatRelativeOrderDateTime(updatedAt, shopTimeZone, orderedDate),
        ),
    formatTimelineDetail("Cutoff", formatDeliveryCycleCutoff(deliveryCycle)),
    formatTimelineDetail("Delivery", formatOrderDeliveryCycle(order)),
    formatTimelineDetail("Stop", routeSequence),
    formatTimelineDetail("Time zone", timeZone),
  ]);
}

const DATE_FORMAT_OPTIONS = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const TIME_FORMAT_OPTIONS = {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
};

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

function formatOrderedDateTime(date, time) {
  if (!date) return undefined;
  return time ? `${date}, ${time}` : date;
}

function formatRelativeOrderDateTime(value, shopTimeZone, orderedDate) {
  const text = textOrUndefined(value);
  if (!text) return undefined;

  const date = formatOrderDateTimePart(text, shopTimeZone, DATE_FORMAT_OPTIONS);
  const time = formatOrderDateTimePart(text, shopTimeZone, TIME_FORMAT_OPTIONS);
  if (!date || !time) return text;

  return date === orderedDate ? time : `${date}, ${time}`;
}

function isSameOrderInstant(firstValue, secondValue) {
  const firstText = textOrUndefined(firstValue);
  const secondText = textOrUndefined(secondValue);
  if (!firstText || !secondText) return false;

  const firstDate = new Date(firstText);
  const secondDate = new Date(secondText);
  if (Number.isNaN(firstDate.getTime()) || Number.isNaN(secondDate.getTime())) {
    return firstText === secondText;
  }

  return firstDate.getTime() === secondDate.getTime();
}

function formatDeliveryCycleCutoff(deliveryCycle) {
  if (!deliveryCycle) return undefined;

  return getUniqueTimelineDetails([
    formatCompactWeekday(deliveryCycle.cutoffWeekday),
    deliveryCycle.cutoffTime,
  ]).join(", ") || undefined;
}

function formatOrderDeliveryCycle(order) {
  const deliveryDate = textOrUndefined(order?.deliveryDate);
  if (!deliveryDate) return undefined;

  const timeWindowStart = textOrUndefined(order?.timeWindowStart);
  const timeWindowEnd = textOrUndefined(order?.timeWindowEnd);
  const timeWindow =
    timeWindowStart && timeWindowEnd ? `${timeWindowStart}–${timeWindowEnd}` : undefined;
  const deliverySession = formatTitleCase(order?.deliverySession);
  const deliveryWindow = [
    timeWindow,
    deliverySession ? `(${deliverySession})` : undefined,
  ].filter(Boolean).join(" ");

  return getUniqueTimelineDetails([
    formatCompactWeekday(order?.deliveryDay) ?? formatWeekdayFromDate(deliveryDate),
    deliveryDate,
    deliveryWindow,
  ]).join(", ") || undefined;
}

function formatCompactWeekday(value) {
  const text = textOrUndefined(value);
  if (!text) return undefined;

  const weekdays = new Map([
    ["sun", "Sun"],
    ["sunday", "Sun"],
    ["mon", "Mon"],
    ["monday", "Mon"],
    ["tue", "Tue"],
    ["tues", "Tue"],
    ["tuesday", "Tue"],
    ["wed", "Wed"],
    ["wednesday", "Wed"],
    ["thu", "Thu"],
    ["thur", "Thu"],
    ["thurs", "Thu"],
    ["thursday", "Thu"],
    ["fri", "Fri"],
    ["friday", "Fri"],
    ["sat", "Sat"],
    ["saturday", "Sat"],
  ]);

  return weekdays.get(text.toLowerCase()) ?? text;
}

function formatWeekdayFromDate(value) {
  const text = textOrUndefined(value);
  if (!text) return undefined;

  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(date);
}

function formatTitleCase(value) {
  const text = textOrUndefined(value);
  if (!text) return undefined;

  return text
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
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
