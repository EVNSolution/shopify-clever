import { createHash, randomUUID } from "node:crypto";

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|hmac|token|id_token|access[_-]?token|refresh[_-]?token|session|phone|email|address|customer|recipient|name|note|payload|variables|lineitems?/iu;
const SENSITIVE_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu,
  /\bid_token=[^&#\s]+/giu,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu,
  /\+?\d[\d\s().-]{7,}\d/gu,
];
const SAFE_CORRELATION_ID_FIELDS = new Set(["correlationId", "requestId"]);
const SAFE_CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/u;
const SAFE_OPERATIONAL_EVENT_PATTERN = /^[a-z][a-z0-9_]{0,119}$/u;
const SAFE_METRIC_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,119}$/u;
const SAFE_OPERATIONAL_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,119}$/u;
const SAFE_OPERATIONAL_STAGE_PATTERN = /^[a-z][a-z0-9_]{0,119}$/u;
const SAFE_OPERATIONAL_STATUS_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,119}$/u;
const SAFE_OPERATIONAL_TOPIC_PATTERN = /^[a-z][a-z0-9_/]{0,119}$/u;
const SAFE_SHOP_HASH_PATTERN = /^[a-f0-9]{16}$/u;

const ALLOWED_METRIC_FIELDS = new Set([
  "activeOrdersView",
  "app",
  "canonicalFirst",
  "canonicalOrderCount",
  "category",
  "correlationId",
  "count",
  "countPrecision",
  "createdAt",
  "cursorVersion",
  "deliveryApiMs",
  "domContentLoadedMs",
  "departureLocationMs",
  "durationMs",
  "encodedBodySize",
  "errorCount",
  "filterHash",
  "fromPage",
  "fromView",
  "graphqlCallCount",
  "host",
  "httpStatus",
  "inventoryCount",
  "inventoriesMs",
  "jobId",
  "loadEventEndMs",
  "loaderMode",
  "mapLibreImportMs",
  "mapRemoveMs",
  "measuredAtMs",
  "metric",
  "name",
  "orderCount",
  "noOpCount",
  "page",
  "pageCount",
  "path",
  "plannedOrderCount",
  "pointCount",
  "queueDepth",
  "referrerPath",
  "requestId",
  "resolvedCount",
  "responseEndMs",
  "routeGroupCount",
  "routeGroupsMs",
  "rowCount",
  "selectedCount",
  "shopHash",
  "shopifyMetadataMs",
  "shopifyOrdersCacheStatus",
  "shopifyOrdersMs",
  "sourceUpdateMs",
  "shopTimeZoneMs",
  "status",
  "skippedCount",
  "syncStatus",
  "toPage",
  "toView",
  "topic",
  "totalMs",
  "totalCount",
  "transferSize",
  "trigger",
  "ttfbMs",
  "updatedCount",
]);

export function createTelemetryRequestId() {
  return randomUUID();
}

export function hashShopIdentifier(shop) {
  const normalizedShop = typeof shop === "string" ? shop.trim().toLowerCase() : "";
  if (!normalizedShop) return null;

  return createHash("sha256").update(normalizedShop).digest("hex").slice(0, 16);
}

export function sanitizeRequestPath(value) {
  if (typeof value !== "string" || value.length === 0) return "/";

  try {
    return new URL(value, "https://app.local").pathname || "/";
  } catch {
    return "/";
  }
}

export function sanitizeTelemetryValue(value) {
  if (value == null) return value;

  if (typeof value === "string") {
    const url = sanitizeUrlString(value);
    return SENSITIVE_VALUE_PATTERNS.reduce(
      (output, pattern) => output.replace(pattern, REDACTED),
      url,
    );
  }

  if (typeof value !== "object") return value;

  if (value instanceof Error) {
    return {
      message: sanitizeTelemetryValue(value.message),
      name: value.name,
    };
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeTelemetryValue);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeTelemetryValue(nestedValue),
    ]),
  );
}

export function allowlistTelemetryMetric(metric = {}) {
  return Object.fromEntries(
    Object.entries(metric)
      .filter(([key]) => ALLOWED_METRIC_FIELDS.has(key))
      .map(([key, value]) => [
        key,
        SAFE_CORRELATION_ID_FIELDS.has(key) && typeof value === "string" && SAFE_CORRELATION_ID_PATTERN.test(value)
          ? value
          : sanitizeTelemetryValue(value),
      ]),
  );
}

export function logStructuredMetric(name, metric = {}) {
  const safeName = typeof name === "string" && SAFE_METRIC_NAME_PATTERN.test(name)
    ? name
    : "telemetry_metric";
  console.info(safeName, {
    measuredAt: new Date().toISOString(),
    ...allowlistTelemetryMetric({
      ...metric,
      name: safeName,
    }),
  });
}

export function logSafeOperationalEvent(level, event, fields = {}) {
  const log = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  const safeEvent = typeof event === "string" && SAFE_OPERATIONAL_EVENT_PATTERN.test(event)
    ? event
    : "operational_event";
  const safeFields = {};

  for (const [key, value] of Object.entries(fields)) {
    if (
      SAFE_CORRELATION_ID_FIELDS.has(key)
      && typeof value === "string"
      && SAFE_CORRELATION_ID_PATTERN.test(value)
    ) {
      safeFields[key] = value;
    } else if (
      key === "errorCode"
      && typeof value === "string"
      && SAFE_OPERATIONAL_ERROR_CODE_PATTERN.test(value)
    ) {
      safeFields.errorCode = value;
    } else if (
      key === "stage"
      && typeof value === "string"
      && SAFE_OPERATIONAL_STAGE_PATTERN.test(value)
    ) {
      safeFields.stage = value;
    } else if (
      key === "status"
      && typeof value === "string"
      && SAFE_OPERATIONAL_STATUS_PATTERN.test(value)
    ) {
      safeFields.status = value;
    } else if (
      key === "topic"
      && typeof value === "string"
      && SAFE_OPERATIONAL_TOPIC_PATTERN.test(value)
    ) {
      safeFields.topic = value;
    } else if (
      key === "shopHash"
      && typeof value === "string"
      && SAFE_SHOP_HASH_PATTERN.test(value)
    ) {
      safeFields.shopHash = value;
    } else if (key === "httpStatus" && Number.isInteger(value) && value >= 100 && value <= 599) {
      safeFields.httpStatus = value;
    }
  }

  log(JSON.stringify({ event: safeEvent, ...safeFields }));
}

export function buildServerTimingHeader(timings = {}) {
  return Object.entries(timings)
    .flatMap(([key, value]) => {
      const duration = Number(value);
      if (!Number.isFinite(duration) || duration < 0) return [];

      const token = key.replace(/[^A-Za-z0-9_-]/gu, "_");
      return [`${token};dur=${duration.toFixed(2)}`];
    })
    .join(", ");
}

function sanitizeUrlString(value) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.replace(/[?#].*$/u, "");
  }
}
