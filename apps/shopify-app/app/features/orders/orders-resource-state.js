const ORDERS_RESOURCE_PATHS = {
  facets: "/app/orders/facets",
  map: "/app/orders/map-points",
  page: "/app/orders/page",
  routeGroups: "/app/orders/route-groups",
  selection: "/app/orders/selection-snapshots",
};

export function buildOrdersResourceRequest(resource, filterSearchParams, options = {}) {
  const path = ORDERS_RESOURCE_PATHS[resource];
  if (!path) throw new TypeError(`Unknown Orders resource: ${resource}`);

  const searchParams = new URLSearchParams(filterSearchParams ?? "");
  searchParams.delete("after");
  searchParams.delete("before");
  searchParams.delete("page");
  searchParams.delete("id_token");
  searchParams.delete("_requestKey");

  return {
    action: path,
    payload: {
      filters: Object.fromEntries(searchParams),
      ...(options.page ? { page: String(options.page) } : {}),
      ...(options.readWatermark ? { readWatermark: options.readWatermark } : {}),
      ...(resource === "map" && options.limit ? { limit: String(options.limit) } : {}),
      ...(options.requestKey ? { _requestKey: options.requestKey } : {}),
      ...(options.idToken ? { shopifySessionToken: options.idToken } : {}),
    },
  };
}

export function shouldApplyOrdersResourceResponse(data, requestKey) {
  return Boolean(requestKey) && data?._requestKey === requestKey;
}

export function completeOrdersPageRequest(pendingRequestKey, completedRequestKey) {
  return pendingRequestKey && pendingRequestKey === completedRequestKey
    ? null
    : pendingRequestKey ?? null;
}

export function isOrdersPageUpdating({
  enabled,
  filterTransitionPending,
  pendingRequestKey,
  fetcherState,
  appliedFilterKey,
  requestedFilterKey,
  resourceError,
}) {
  return Boolean(
    enabled &&
    (
      filterTransitionPending ||
      pendingRequestKey ||
      fetcherState !== "idle" ||
      (appliedFilterKey !== requestedFilterKey && !resourceError)
    )
  );
}

export function shouldSyncOrdersLoaderPage(currentPageInfo, loaderPageInfo) {
  const currentPage = positiveInteger(currentPageInfo?.currentPage);
  const loaderPage = positiveInteger(loaderPageInfo?.currentPage);
  return currentPage == null || (loaderPage != null && currentPage === loaderPage);
}

export function getOrdersPageCacheKey(filterKey, direction, cursor) {
  if (!cursor || !["next", "previous", "page"].includes(direction)) return null;
  return `${String(filterKey ?? "")}\n${direction}\n${cursor}`;
}

export function getReverseOrdersPageCacheEntry({
  currentPage,
  direction,
  filterKey,
  targetPage,
}) {
  const reverseDirection = direction === "next" ? "previous" : "next";
  const reverseCursor = direction === "next"
    ? targetPage?.pageInfo?.startCursor
    : targetPage?.pageInfo?.endCursor;
  const key = getOrdersPageCacheKey(filterKey, reverseDirection, reverseCursor);

  return key && currentPage ? { key, value: currentPage } : null;
}

export function updateOrdersSelectionExclusions(currentOrderIds, orderId, checked) {
  const normalizedOrderId = text(orderId);
  const exclusions = new Set(normalizeOrderIds(currentOrderIds));
  if (!normalizedOrderId) return [...exclusions];

  if (checked) exclusions.delete(normalizedOrderId);
  else exclusions.add(normalizedOrderId);
  return [...exclusions];
}

export function updateVisibleOrdersSelectionExclusions(currentOrderIds, visibleOrderIds, checked) {
  const exclusions = new Set(normalizeOrderIds(currentOrderIds));
  for (const orderId of normalizeOrderIds(visibleOrderIds)) {
    if (checked) exclusions.delete(orderId);
    else exclusions.add(orderId);
  }
  return [...exclusions];
}

export function mapCompactOrderPointsToRows(points) {
  if (!Array.isArray(points)) return [];

  return points.flatMap((point) => {
    const longitude = finiteNumber(point?.longitude ?? point?.coordinates?.[0]);
    const latitude = finiteNumber(point?.latitude ?? point?.coordinates?.[1]);
    const id = text(point?.shopifyOrderGid ?? point?.orderId);
    if (!id || longitude == null || latitude == null) return [];

    return [{
      id,
      orderId: text(point?.orderId),
      name: text(point?.displayLabel ?? point?.name) ?? id,
      coordinates: [longitude, latitude],
      deliveryArea: text(point?.deliveryArea),
      deliveryDate: text(point?.deliveryDate),
      planningStatus: text(point?.planningStatus),
      hasCoordinates: true,
    }];
  });
}

export function mergeLocatedOrderRows(primaryRows, fallbackRows) {
  const rows = [];
  const seenOrderIds = new Set();

  for (const order of [...(primaryRows ?? []), ...(fallbackRows ?? [])]) {
    const id = text(order?.id);
    if (!id || seenOrderIds.has(id) || !order?.hasCoordinates) continue;
    seenOrderIds.add(id);
    rows.push(order);
  }

  return rows;
}

function finiteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function text(value) {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function normalizeOrderIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(text).filter(Boolean))];
}
