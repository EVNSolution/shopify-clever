import {
  clearDeliveryApiResponseCache,
  deliveryApiRequest,
  primeDeliveryApiGetResponseCache,
} from "./route-plans.server.js";
import { sanitizeTelemetryValue } from "../telemetry/structured-telemetry.server.js";

const DELIVERY_ORDERS_SYNC_SOURCE = "clever-app-orders";
const DELIVERY_ORDERS_SYNC_REASON = "orders_page_open";

export async function syncDeliveryOrders(request, payload = {}, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/orders/sync", {
    body: JSON.stringify({
      ...(payload.deliveryCycle ? { deliveryCycle: payload.deliveryCycle } : {}),
      source: DELIVERY_ORDERS_SYNC_SOURCE,
      reason: payload.reason ?? DELIVERY_ORDERS_SYNC_REASON,
      orders: Array.isArray(payload.orders) ? payload.orders : [],
    }),
    fetch: options.fetch,
    method: "PATCH",
    sessionToken: options.sessionToken,
  });

  if (options.primeOrdersCache === true) {
    primeDeliveryApiGetResponseCache(
      request,
      "/admin/orders",
      {
        data: { orders: result.data?.orders ?? [] },
        errors: result.errors,
      },
      {
        cacheKey: options.cacheKey,
        fetch: options.fetch,
        sessionToken: options.sessionToken,
      },
    );
  }

  return {
    orders: result.data?.orders ?? [],
    sync: result.data?.sync ?? null,
    warnings: result.data?.warnings ?? [],
    errors: result.errors,
  };
}

export async function fetchDeliveryOrders(request, filters = {}, options = {}) {
  const result = await deliveryApiRequest(
    request,
    buildDeliveryOrdersPath(filters),
    {
      fetch: options.fetch,
      cacheKey: options.cacheKey,
      method: "GET",
      sessionToken: options.sessionToken,
    },
  );

  return {
    orders: result.data?.orders ?? [],
    ...(
      result.data?.freshness || result.data?.syncStatus
        ? { freshness: normalizeOrdersFreshness(result.data?.freshness ?? result.data?.syncStatus) }
        : {}
    ),
    ...(result.data?.meta ? { meta: normalizeOrdersMeta(result.data.meta) } : {}),
    errors: result.errors,
  };
}

export async function fetchDeliveryOrdersPage(request, filters = {}, options = {}) {
  const result = await deliveryApiRequest(
    request,
    buildDeliveryOrdersResourcePath("page", normalizePageFilters(filters)),
    {
      cacheTtlMs: 0,
      fetch: options.fetch,
      method: "GET",
      sessionToken: options.sessionToken,
    },
  );

  return {
    rows: Array.isArray(result.data?.rows) ? result.data.rows : [],
    pageInfo: normalizeOrdersPageInfo(result.data?.pageInfo),
    result: normalizeOrdersPageResult(result.data?.result),
    freshness: normalizeOrdersFreshness(result.data?.freshness),
    errors: result.errors.map(redactDeliveryOrderError),
  };
}

export async function fetchDeliveryOrderFacets(request, filters = {}, options = {}) {
  const result = await deliveryApiRequest(
    request,
    buildDeliveryOrdersResourcePath("facets", filters),
    {
      cacheTtlMs: 0,
      fetch: options.fetch,
      method: "GET",
      sessionToken: options.sessionToken,
    },
  );

  return {
    countPrecision: normalizeCountPrecision(result.data?.countPrecision),
    facets: normalizeObject(result.data?.facets),
    filterHash: textOrNull(result.data?.filterHash),
    totalCount: numberOrNull(result.data?.totalCount),
    errors: result.errors.map(redactDeliveryOrderError),
  };
}

export async function fetchDeliveryOrderMapPoints(request, filters = {}, options = {}) {
  const result = await deliveryApiRequest(
    request,
    buildDeliveryOrdersResourcePath("map-points", filters),
    {
      cacheTtlMs: 0,
      fetch: options.fetch,
      method: "GET",
      sessionToken: options.sessionToken,
    },
  );

  return {
    filterHash: textOrNull(result.data?.filterHash),
    generatedAt: textOrNull(result.data?.generatedAt),
    omittedCount: numberOrNull(result.data?.omittedCount) ?? 0,
    points: Array.isArray(result.data?.points) ? result.data.points : [],
    errors: result.errors.map(redactDeliveryOrderError),
  };
}

export async function createDeliveryOrdersSelectionSnapshot(request, payload = {}, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/orders/selection-snapshots", {
    body: JSON.stringify({
      excludeOrderIds: normalizeStringArray(payload.excludeOrderIds),
      filters: normalizeObject(payload.filters),
      sort: textOrUndefined(payload.sort) ?? "id_desc",
    }),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
  });

  return normalizeSelectionSnapshotResult(result);
}

export async function replaceDeliveryOrdersSelectionExclusions(request, payload = {}, options = {}) {
  const result = await deliveryApiRequest(request, "/admin/orders/selection-snapshots", {
    body: JSON.stringify({
      excludeOrderIds: normalizeStringArray(payload.excludeOrderIds),
      selectionToken: textOrUndefined(payload.selectionToken) ?? "",
    }),
    fetch: options.fetch,
    method: "PATCH",
    sessionToken: options.sessionToken,
  });

  return normalizeSelectionSnapshotResult(result);
}

export async function startDeliveryOrdersReconciliation(request, payload = {}, options = {}) {
  const body = {
    mode: normalizeReconciliationModeForRequest(payload.mode),
    ...(textOrUndefined(payload.correlationId) ? { correlationId: textOrUndefined(payload.correlationId) } : {}),
    ...(integerOrUndefined(payload.overlapWindowSeconds) ? { overlapWindowSeconds: integerOrUndefined(payload.overlapWindowSeconds) } : {}),
    ...(integerOrUndefined(payload.pageSize) ? { pageSize: integerOrUndefined(payload.pageSize) } : {}),
  };

  const result = await deliveryApiRequest(request, "/admin/orders/reconciliations", {
    body: JSON.stringify(body),
    fetch: options.fetch,
    method: "POST",
    sessionToken: options.sessionToken,
    suppressErrorStatuses: [404],
  });

  return {
    job: normalizeOrdersReconciliationJob(result.data?.job ?? result.data?.reconciliation ?? result.data),
    errors: result.errors.map(redactDeliveryOrderError),
  };
}

export async function fetchDeliveryOrdersReconciliationStatus(request, jobId, options = {}) {
  const normalizedJobId = textOrUndefined(jobId);
  if (!normalizedJobId) {
    return {
      job: null,
      errors: [{ code: "DELIVERY_ORDER_RECONCILIATION_JOB_ID_MISSING", message: "조회할 reconciliation job ID가 없습니다." }],
    };
  }

  const result = await deliveryApiRequest(
    request,
    `/admin/orders/reconciliations/${encodeURIComponent(normalizedJobId)}`,
    {
      fetch: options.fetch,
      method: "GET",
      sessionToken: options.sessionToken,
      suppressErrorStatuses: [404],
    },
  );

  return {
    job: normalizeOrdersReconciliationJob(result.data?.job ?? result.data?.reconciliation ?? result.data),
    errors: result.errors.map(redactDeliveryOrderError),
  };
}

export async function patchDeliveryOrderMetadata(request, orderId, patch = {}, options = {}) {
  const result = await deliveryApiRequest(request, `/admin/orders/${encodeURIComponent(orderId)}/metadata`, {
    body: JSON.stringify(patch),
    fetch: options.fetch,
    method: "PATCH",
    sessionToken: options.sessionToken,
  });
  clearDeliveryApiResponseCache();

  return {
    order: result.data?.order ?? null,
    errors: result.errors,
  };
}

export async function bulkUpdateDeliveryOrders(request, payload = {}, options = {}) {
  const selectionToken = textOrUndefined(payload.selectionToken);
  const result = await deliveryApiRequest(request, "/admin/orders/bulk-update", {
    body: JSON.stringify({
      field: payload.field,
      ...(selectionToken
        ? { selectionToken }
        : { orderIds: Array.isArray(payload.orderIds) ? payload.orderIds : [] }),
      value: payload.value,
    }),
    fetch: options.fetch,
    method: "PATCH",
    sessionToken: options.sessionToken,
  });
  clearDeliveryApiResponseCache();

  return {
    orders: result.data?.orders ?? [],
    updated: result.data?.updated ?? 0,
    ...(result.data?.selected != null ? { selected: numberOrNull(result.data.selected) ?? 0 } : {}),
    ...(result.data?.resolved != null ? { resolved: numberOrNull(result.data.resolved) ?? 0 } : {}),
    ...(result.data?.skipped != null ? { skipped: numberOrNull(result.data.skipped) ?? 0 } : {}),
    ...(result.data?.noOp != null ? { noOp: numberOrNull(result.data.noOp) ?? 0 } : {}),
    errors: result.errors,
  };
}

function buildDeliveryOrdersPath(filters) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}

function buildDeliveryOrdersResourcePath(resource, filters) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value == null || value === "") continue;
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  const path = `/admin/orders/${resource}`;
  return query ? `${path}?${query}` : path;
}

function normalizePageFilters(filters) {
  const normalizedFilters = normalizeObject(filters);
  const rawAfter = normalizedFilters.after;
  const rawBefore = normalizedFilters.before;
  const rawPage = normalizedFilters.page;
  const rawReadWatermark = normalizedFilters.readWatermark;
  const rest = { ...normalizedFilters };
  delete rest.after;
  delete rest.before;
  delete rest.page;
  delete rest.readWatermark;
  delete rest.pageSize;
  delete rest.sort;
  const after = textOrUndefined(rawAfter);
  const before = after ? undefined : textOrUndefined(rawBefore);
  const page = after || before ? undefined : integerOrUndefined(rawPage);
  const readWatermark = textOrUndefined(rawReadWatermark);

  return {
    ...rest,
    pageSize: 50,
    sort: "id_desc",
    ...(page ? { page } : {}),
    ...(page && readWatermark ? { readWatermark } : {}),
    ...(after ? { after } : {}),
    ...(before ? { before } : {}),
  };
}

function normalizeOrdersPageInfo(value) {
  const pageInfo = normalizeObject(value);
  return {
    currentPage: integerOrUndefined(pageInfo.currentPage) ?? 1,
    endCursor: textOrNull(pageInfo.endCursor),
    hasNextPage: pageInfo.hasNextPage === true,
    hasPreviousPage: pageInfo.hasPreviousPage === true,
    pageSize: integerOrUndefined(pageInfo.pageSize) ?? 50,
    readWatermark: textOrNull(pageInfo.readWatermark),
    sort: textOrUndefined(pageInfo.sort) ?? "id_desc",
    startCursor: textOrNull(pageInfo.startCursor),
    totalPages: integerOrUndefined(pageInfo.totalPages) ?? 1,
  };
}

function normalizeOrdersPageResult(value) {
  const result = normalizeObject(value);
  return {
    count: numberOrNull(result.count),
    countPrecision: normalizeCountPrecision(result.countPrecision),
    filterHash: textOrNull(result.filterHash),
    readWatermark: textOrNull(result.readWatermark),
  };
}

function normalizeSelectionSnapshotResult(result) {
  return {
    expiresAt: textOrNull(result.data?.expiresAt),
    filterHash: textOrNull(result.data?.filterHash),
    selectedCount: numberOrNull(result.data?.selectedCount) ?? 0,
    selectionToken: textOrNull(result.data?.selectionToken),
    snapshotWatermark: textOrNull(result.data?.snapshotWatermark),
    errors: result.errors.map(redactDeliveryOrderError),
  };
}

function normalizeCountPrecision(value) {
  return value === "exact" ? "exact" : "unknown";
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(textOrUndefined).filter(Boolean))];
}

function normalizeOrdersFreshness(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {
      canonicalOrderCount: null,
      lastReconciliationAt: null,
      lastWebhookAt: null,
      oldestPendingReconciliationAt: null,
      oldestPendingWebhookAt: null,
      queueDepth: null,
      resultGeneratedAt: null,
      syncStatus: "unknown",
    };
  }

  return {
    canonicalOrderCount: numberOrNull(value.canonicalOrderCount ?? value.orderCount),
    lastReconciliationAt: textOrNull(value.lastReconciliationAt),
    lastWebhookAt: textOrNull(value.lastWebhookAt),
    oldestPendingReconciliationAt: textOrNull(value.oldestPendingReconciliationAt),
    oldestPendingWebhookAt: textOrNull(value.oldestPendingWebhookAt),
    queueDepth: numberOrNull(value.queueDepth),
    resultGeneratedAt: textOrNull(value.resultGeneratedAt ?? value.generatedAt),
    syncStatus: textOrNull(value.syncStatus ?? value.status) ?? "unknown",
  };
}

function normalizeOrdersMeta(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};

  return {
    canonicalOrderCount: numberOrNull(value.canonicalOrderCount),
  };
}

function normalizeOrdersReconciliationJob(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const counts = value.counts && typeof value.counts === "object" && !Array.isArray(value.counts)
    ? value.counts
    : {};

  return {
    attemptCount: numberOrNull(value.attemptCount),
    correlationId: textOrNull(value.correlationId),
    counts: {
      created: numberOrNull(counts.created),
      failed: numberOrNull(counts.failed ?? value.failedCount ?? value.ordersFailed),
      finalCanonical: numberOrNull(counts.finalCanonical),
      scanned: numberOrNull(counts.scanned ?? value.scannedCount ?? value.ordersScanned),
      staleSkipped: numberOrNull(counts.staleSkipped ?? value.skippedStaleCount ?? value.ordersSkippedStale),
      unchanged: numberOrNull(counts.unchanged),
      updated: numberOrNull(counts.updated ?? value.appliedCount ?? value.ordersApplied),
    },
    appliedCount: numberOrNull(value.appliedCount ?? value.ordersApplied ?? counts.updated),
    createdAt: textOrNull(value.createdAt),
    cursor: textOrNull(value.cursor ?? value.pageCursor),
    deadLetteredAt: textOrNull(value.deadLetteredAt),
    failedCount: numberOrNull(value.failedCount ?? value.ordersFailed ?? counts.failed),
    finishedAt: textOrNull(value.finishedAt),
    highWatermark: textOrNull(value.highWatermark),
    jobId: textOrNull(value.jobId ?? value.id),
    lastError: sanitizeTelemetryValue(value.lastError ?? value.error ?? null),
    mode: textOrNull(value.mode),
    nextRunAt: textOrNull(value.nextRunAt),
    overlapWindowSeconds: numberOrNull(value.overlapWindowSeconds),
    pageCount: numberOrNull(value.pageCount ?? value.pagesProcessed ?? value.progress?.pages),
    pageSize: numberOrNull(value.pageSize),
    progress: sanitizeTelemetryValue(value.progress ?? null),
    queueDepth: numberOrNull(value.queueDepth),
    scannedCount: numberOrNull(value.scannedCount ?? value.ordersScanned ?? counts.scanned),
    skippedStaleCount: numberOrNull(value.skippedStaleCount ?? value.ordersSkippedStale ?? counts.staleSkipped),
    startedAt: textOrNull(value.startedAt),
    startedFrom: textOrNull(value.startedFrom),
    status: normalizeReconciliationStatus(value.status),
    updatedAt: textOrNull(value.updatedAt),
    warningsCount: numberOrNull(value.warningsCount ?? value.warningCount),
  };
}

function normalizeReconciliationStatus(value) {
  const status = textOrNull(value)?.replaceAll("-", "_").toUpperCase();
  if (!status) return "unknown";

  if (status === "QUEUED") return "queued";
  if (status === "RUNNING" || status === "PROCESSING") return "running";
  if (status === "RETRY_WAIT" || status === "RETRYING") return "retry_wait";
  if (status === "SUCCEEDED" || status === "SUCCESS" || status === "PROCESSED") return "succeeded";
  if (status === "FAILED") return "failed";
  if (status === "DEAD_LETTER" || status === "DEADLETTER") return "dead_letter";
  if (status === "CANCELLED" || status === "CANCELED") return "cancelled";

  return status.toLowerCase();
}

function redactDeliveryOrderError(error) {
  return sanitizeTelemetryValue(error);
}

function normalizeReconciliationModeForRequest(value) {
  const mode = textOrUndefined(value)?.toUpperCase();
  if (mode === "FULL") return "FULL";
  return "INCREMENTAL";
}

function textOrUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function textOrNull(value) {
  return textOrUndefined(value) ?? null;
}

function numberOrNull(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrUndefined(value) {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
}
