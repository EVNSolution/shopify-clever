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
