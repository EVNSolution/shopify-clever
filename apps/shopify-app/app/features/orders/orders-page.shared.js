import { ORDER_FILTER_QUERY_KEYS } from "./order-filters.js";

export const DEFAULT_ROUTE_PLAN_TITLE = "CLEVER route draft";
export const ORDERS_VIEW_SNAPSHOT_TTL_MS = 30 * 60_000;

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

export function getLatestShopifyOrderUpdatedAt(orders) {
  let latestTimestamp;

  for (const order of Array.isArray(orders) ? orders : []) {
    const candidates = [
      order?.updatedAtShopify,
      order?.sourceUpdatedAt,
      order?.shopifyOrderSnapshot?.updatedAt,
      order?.rawPayload?.updatedAt,
      order?.updatedAt,
    ];

    for (const candidate of candidates) {
      const text = textOrUndefined(candidate);
      if (!text) continue;

      const timestamp = new Date(text).getTime();
      if (Number.isNaN(timestamp)) continue;

      latestTimestamp = latestTimestamp == null
        ? timestamp
        : Math.max(latestTimestamp, timestamp);
    }
  }

  return latestTimestamp == null
    ? undefined
    : new Date(latestTimestamp).toISOString();
}

export function formatLatestShopifyOrderUpdatedAt(orders, shopTimeZone) {
  const latestUpdatedAt = getLatestShopifyOrderUpdatedAt(orders);
  if (!latestUpdatedAt) return "—";

  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    ...(shopTimeZone ? { timeZone: shopTimeZone } : {}),
    year: "numeric",
  }).format(new Date(latestUpdatedAt));
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

export function getPendingOrdersView(pendingLocation) {
  if (pendingLocation?.pathname !== "/app/orders") return undefined;

  return new URLSearchParams(pendingLocation.search ?? "").get("view") === "inventory"
    ? "inventory"
    : "orders";
}

export function createOrdersViewSnapshot(loaderData, capturedAt = Date.now()) {
  const ordersCacheKey = textOrUndefined(loaderData?.ordersCacheKey);
  if (!loaderData?.ordersLoaded || !ordersCacheKey) return null;

  return {
    capturedAt,
    departureLocation: loaderData.departureLocation ?? null,
    deliveryCycle: loaderData.deliveryCycle ?? null,
    orders: Array.isArray(loaderData.orders) ? loaderData.orders : [],
    ordersCacheKey,
    routeGroups: Array.isArray(loaderData.routeGroups) ? loaderData.routeGroups : [],
    shopLocalDate: loaderData.shopLocalDate ?? null,
    shopTimeZone: loaderData.shopTimeZone ?? null,
  };
}

export function restoreOrdersViewSnapshot(
  loaderData,
  snapshot,
  {
    now = Date.now(),
    ttlMs = ORDERS_VIEW_SNAPSHOT_TTL_MS,
  } = {},
) {
  const loaderCacheKey = textOrUndefined(loaderData?.ordersCacheKey);
  const snapshotCacheKey = textOrUndefined(snapshot?.ordersCacheKey);
  const capturedAt = Number(snapshot?.capturedAt);
  const maxAgeMs = Number(ttlMs);
  const snapshotAgeMs = Number(now) - capturedAt;
  const canRestore =
    loaderData?.ordersLoaded !== true &&
    loaderCacheKey &&
    loaderCacheKey === snapshotCacheKey &&
    Number.isFinite(capturedAt) &&
    Number.isFinite(snapshotAgeMs) &&
    snapshotAgeMs >= 0 &&
    Number.isFinite(maxAgeMs) &&
    maxAgeMs >= 0 &&
    snapshotAgeMs <= maxAgeMs;

  if (!canRestore) {
    return { loaderData, restored: false };
  }

  return {
    loaderData: {
      ...loaderData,
      departureLocation: snapshot.departureLocation ?? null,
      deliveryCycle: snapshot.deliveryCycle ?? null,
      orders: Array.isArray(snapshot.orders) ? snapshot.orders : [],
      ordersLoaded: true,
      routeGroups: Array.isArray(snapshot.routeGroups) ? snapshot.routeGroups : [],
      shopLocalDate: snapshot.shopLocalDate ?? null,
      shopTimeZone: snapshot.shopTimeZone ?? null,
    },
    restored: true,
  };
}

export function getOrdersRefreshCompletion({
  activeRequestId,
  data,
  fetcherState,
  handledRequestId,
}) {
  if (fetcherState !== "idle" || !data) return null;

  const responseRequestId = textOrUndefined(data.refreshRequestId);
  if (responseRequestId && responseRequestId !== activeRequestId) return null;

  const requestId = responseRequestId ?? textOrUndefined(activeRequestId);
  if (!requestId || requestId === handledRequestId) {
    return null;
  }

  return {
    data,
    hasErrors: (data.errors ?? []).length > 0,
    requestId,
  };
}

export function getOrdersReconciliationPollingCompletion({
  activeJobId,
  activeRequestId,
  data,
  fetcherState,
}) {
  if (fetcherState !== "idle" || !data) return null;

  const responseRequestId = textOrUndefined(data.refreshRequestId);
  const job = data.reconciliationJob ?? null;
  const responseJobId = textOrUndefined(job?.jobId);

  if (!responseRequestId || responseRequestId !== activeRequestId) return null;
  if (!responseJobId || responseJobId !== activeJobId) return null;

  return {
    data,
    hasErrors: (data.errors ?? []).length > 0,
    job,
    jobId: responseJobId,
    requestId: responseRequestId,
  };
}

export function isOrdersReconciliationTerminalSuccess(job) {
  return normalizeOrdersReconciliationStatus(job?.status) === "succeeded";
}

export function isOrdersReconciliationTerminalFailure(job) {
  return new Set(["failed", "dead_letter", "cancelled"]).has(
    normalizeOrdersReconciliationStatus(job?.status),
  );
}

export function shouldPollOrdersReconciliationJob(job) {
  if (!textOrUndefined(job?.jobId)) return false;
  if (isOrdersReconciliationTerminalSuccess(job)) return false;
  if (isOrdersReconciliationTerminalFailure(job)) return false;
  return true;
}

export function getOrdersReconciliationStatusMessage(job, fallback = null) {
  if (!job) return fallback;
  const status = normalizeOrdersReconciliationStatus(job.status);
  const counts = job.counts ?? {};
  const scanned = numberOrNull(job.scannedCount ?? counts.scanned);
  const updated = numberOrNull(job.appliedCount ?? counts.updated);
  const failed = numberOrNull(job.failedCount ?? counts.failed);

  if (status === "succeeded") {
    return `Reconciliation complete: ${updated ?? 0} updated`;
  }
  if (status === "failed" || status === "dead_letter" || status === "cancelled") {
    return getOrdersReconciliationFailureMessage(job);
  }
  if (status === "retry_wait") {
    return `Reconciliation retrying: ${scanned ?? 0} scanned`;
  }
  if (status === "running") {
    return `Reconciliation running: ${scanned ?? 0} scanned, ${updated ?? 0} updated`;
  }
  if (status === "queued") {
    return "Reconciliation queued";
  }
  if (failed != null && failed > 0) {
    return `Reconciliation ${status}: ${failed} failed`;
  }

  return fallback ?? `Reconciliation ${status}`;
}

export function getOrdersReconciliationFailureMessage(job) {
  const message = textOrUndefined(job?.lastError?.message);
  return message ? `Reconciliation failed: ${message}` : "Reconciliation failed";
}

function normalizeOrdersReconciliationStatus(value) {
  return textOrUndefined(value)?.replaceAll("-", "_").toLowerCase() ?? "unknown";
}

export function shouldRevalidateOrdersRoute({
  currentUrl,
  defaultShouldRevalidate,
  formData,
  formMethod,
  nextUrl,
}) {
  if (formMethod && formMethod.toLowerCase() !== "get") {
    if (formData?.get("_intent") === "refreshAllRoutes") return false;
    if (formData?.get("_intent") === "pollOrdersReconciliation") return false;
    return defaultShouldRevalidate;
  }
  if (!currentUrl || !nextUrl || currentUrl.pathname !== nextUrl.pathname) {
    return defaultShouldRevalidate;
  }
  if (currentUrl.href === nextUrl.href) {
    return defaultShouldRevalidate;
  }

  if (
    currentUrl.searchParams.get("view") === "inventory" &&
    nextUrl.searchParams.get("view") !== "inventory"
  ) {
    return true;
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

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
