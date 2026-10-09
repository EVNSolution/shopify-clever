import { isCustomRouteStop } from "./custom-stop-form.js";
import { distanceBetweenCoordinatesMeters, findRouteTrackingDepotReturn } from "./route-tracking.js";
import {
  getRouteStopLocationMessage,
  normalizeRouteStopLocationDiagnostic,
} from "./route-stop-location-diagnostic.js";

const EMPTY_LABEL = "–";

export const CHILD_ROUTE_ORDER_COLUMNS = [
  { key: "stop", label: "Stop" },
  { key: "order", label: "Order / stop" },
  { key: "status", label: "Status" },
  { key: "orderDate", label: "Order date" },
  { key: "address", label: "Address" },
  { key: "expectedArrival", label: "ETA" },
  { key: "driveTime", label: "Drive time" },
  { key: "stopTime", label: "Stop time" },
  { key: "customer", label: "Customer" },
  { key: "items", label: "Items" },
  { key: "method", label: "Method" },
  { key: "payment", label: "Payment" },
  { key: "amount", label: "Amount" },
  { key: "attributes", label: "Attributes" },
  { key: "actions", label: "Actions" },
];

function textOrUndefined(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function numberOrUndefined(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function firstText(...values) {
  for (const value of values) {
    const text = textOrUndefined(value);
    if (text) return text;
  }
  return undefined;
}

function getRouteGroupChildRoutePlanId(child) {
  return firstText(
    child?.routePlanId,
    child?.routePlan?.id,
    child?.id,
    child?.routeGroupingChild?.routePlanId,
  );
}

export function isMaterializedChildRouteDetail({ routePlan, routeGroup } = {}) {
  const routePlanId = firstText(routePlan?.id, routePlan?.routePlanId);
  if (!routePlanId) return false;

  const groupingId = firstText(
    routePlan?.routeGroupingChild?.groupingId,
    routePlan?.routeGroupingChild?.routeGroupId,
    routePlan?.groupingId,
    routePlan?.routeGroupId,
  );
  if (groupingId) return true;

  return (routeGroup?.children ?? []).some((child) => {
    if (getRouteGroupChildRoutePlanId(child) !== routePlanId) return false;
    return Boolean(firstText(child?.groupingId, child?.routeGroupId, routeGroup?.id));
  });
}

export function formatChildOrderStatus(value) {
  const status = String(value ?? "").trim().replace(/-/g, "_").toUpperCase();
  if (status === "READY" || status === "PENDING" || status === "ASSIGNED") return "Ready";
  if (status === "EN_ROUTE" || status === "ARRIVED") return "In progress";
  if (status === "DELIVERED" || status === "COMPLETED") return "Completed";
  if (status === "FAILED") return "Failed";
  if (status === "SKIPPED") return "Skipped";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "IN_PROGRESS") return "In progress";
  return "Preparing";
}

function formatDateParts(value, ianaTimezone, options) {
  const timeZone = textOrUndefined(ianaTimezone) ?? "UTC";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      // hour12 overrides h23 and renders midnight as 24:00 in Node 20.
      timeZone,
      ...options,
    }).formatToParts(date);
    return Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
  } catch {
    return null;
  }
}

export function formatStoreLocalOrderDate(value, ianaTimezone) {
  const parts = formatDateParts(value, ianaTimezone, {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
  });
  if (!parts?.month || !parts?.day || !parts?.hour || !parts?.minute) return EMPTY_LABEL;
  return `${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatStoreLocalDateTimeInput(value, ianaTimezone) {
  if (value === null || value === undefined || value === "" || !textOrUndefined(ianaTimezone)) return "";
  const parts = formatDateParts(value, ianaTimezone, {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  if (!parts?.year || !parts?.month || !parts?.day || !parts?.hour || !parts?.minute) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function storeLocalDateTimeToIso(value, ianaTimezone) {
  const timeZone = textOrUndefined(ianaTimezone);
  const match = textOrUndefined(value)?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!timeZone || !match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const expected = {
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    month: Number(monthText),
    year: Number(yearText),
  };
  const targetUtcMs = Date.UTC(expected.year, expected.month - 1, expected.day, expected.hour, expected.minute);
  const targetDate = new Date(targetUtcMs);
  if (
    targetDate.getUTCFullYear() !== expected.year ||
    targetDate.getUTCMonth() + 1 !== expected.month ||
    targetDate.getUTCDate() !== expected.day ||
    targetDate.getUTCHours() !== expected.hour ||
    targetDate.getUTCMinutes() !== expected.minute
  ) return null;

  let candidateMs = targetUtcMs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatDateParts(candidateMs, timeZone, {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    if (!parts) return null;
    const renderedUtcMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    const adjustmentMs = targetUtcMs - renderedUtcMs;
    if (adjustmentMs === 0) return new Date(candidateMs).toISOString();
    candidateMs += adjustmentMs;
  }

  return null;
}

function getRouteEndMode(routePlan, executionEvidence) {
  const value = firstText(
    executionEvidence?.routeEndMode,
    routePlan?.routeEndMode,
    routePlan?.constraints?.routeEndMode,
  );
  return value === "END_AT_LAST_STOP" ? "END_AT_LAST_STOP" : "RETURN_TO_DEPOT";
}

function getTimeWindowStartInstant(currentMs, timeWindowStart, ianaTimezone) {
  const normalizedTimeWindow = firstText(timeWindowStart);
  const explicitTimestampMs = Date.parse(normalizedTimeWindow ?? "");
  if (Number.isFinite(explicitTimestampMs)) return explicitTimestampMs;

  const match = normalizedTimeWindow?.match(/^(\d{1,2}):(\d{2})/);
  const localDateTime = formatStoreLocalDateTimeInput(currentMs, ianaTimezone);
  if (!match || !localDateTime) return null;

  const hour = String(Number(match[1])).padStart(2, "0");
  const candidate = storeLocalDateTimeToIso(`${localDateTime.slice(0, 10)}T${hour}:${match[2]}`, ianaTimezone);
  const candidateMs = Date.parse(candidate ?? "");
  return Number.isFinite(candidateMs) ? candidateMs : null;
}

function getPlannedRouteEndAt({ ianaTimezone, routeEndMode, routeMetrics, scheduledStartAt, stops }) {
  const startMs = Date.parse(scheduledStartAt ?? "");
  const totalDriveSeconds = numberOrUndefined(routeMetrics?.durationSeconds);
  const orderedStops = sortChildStopsByActualSequence(Array.isArray(stops) ? stops : []);
  if (!Number.isFinite(startMs) || totalDriveSeconds === undefined || orderedStops.length === 0) return null;

  const outboundDriveSeconds = orderedStops.reduce((total, stop) => {
    const duration = numberOrUndefined(stop?.durationFromPreviousSeconds);
    return duration === undefined ? Number.NaN : total + duration;
  }, 0);
  if (!Number.isFinite(outboundDriveSeconds)) return null;
  const remainingDriveSeconds = totalDriveSeconds - outboundDriveSeconds;
  if (routeEndMode === "END_AT_LAST_STOP" && Math.abs(remainingDriveSeconds) > 5) return null;
  if (routeEndMode === "RETURN_TO_DEPOT" && remainingDriveSeconds < -5) return null;

  let currentMs = startMs;
  for (const [stopIndex, stop] of orderedStops.entries()) {
    currentMs += Number(stop.durationFromPreviousSeconds) * 1_000;
    const windowStartMs = getTimeWindowStartInstant(currentMs, stop?.timeWindowStart, ianaTimezone);
    if (firstText(stop?.timeWindowStart) && windowStartMs == null) return null;
    if (windowStartMs != null && windowStartMs > currentMs) currentMs = windowStartMs;
    const isLastStopArrival = routeEndMode === "END_AT_LAST_STOP" && stopIndex === orderedStops.length - 1;
    if (!isLastStopArrival) {
      const serviceMinutes = numberOrUndefined(stop?.serviceMinutes);
      if (serviceMinutes === undefined || serviceMinutes < 0) return null;
      currentMs += serviceMinutes * 60_000;
    }
  }

  if (routeEndMode === "RETURN_TO_DEPOT") {
    currentMs += Math.max(0, remainingDriveSeconds) * 1_000;
  }
  return new Date(currentMs).toISOString();
}

const MIN_RETURN_LEG_SECONDS = 30;

function sumStopLegs(stops, field) {
  let total = 0;
  for (const stop of stops) {
    const value = numberOrUndefined(stop?.[field]);
    if (value === undefined) return null;
    total += value;
  }
  return total;
}

/**
 * The leg from the last stop back to the depot is not part of any stop row.
 * The route total includes it, so it is the total minus the stop legs.
 */
function getReturnLeg({ orderedStops, routeEndMode, routeMetrics }) {
  if (routeEndMode !== "RETURN_TO_DEPOT" || orderedStops.length === 0) return null;
  const totalSeconds = numberOrUndefined(routeMetrics?.durationSeconds);
  const stopSeconds = sumStopLegs(orderedStops, "durationFromPreviousSeconds");
  if (totalSeconds === undefined || stopSeconds === null || totalSeconds - stopSeconds < MIN_RETURN_LEG_SECONDS) return null;
  const totalMeters = numberOrUndefined(routeMetrics?.distanceMeters);
  const stopMeters = sumStopLegs(orderedStops, "distanceFromPreviousMeters");
  return {
    distanceMeters: totalMeters !== undefined && stopMeters !== null && totalMeters >= stopMeters ? totalMeters - stopMeters : null,
    durationSeconds: totalSeconds - stopSeconds,
  };
}

// A visited stop was reached by the driver, so an arrival event is expected. Skipped and cancelled stops are done but never visited.
const VISITED_STOP_STATUSES = new Set(["ATTEMPTED", "COMPLETE", "COMPLETED", "DELIVERED", "FAILED", "FULFILLED"]);
const TERMINAL_STOP_STATUSES = new Set([...VISITED_STOP_STATUSES, "CANCELLED", "SKIPPED"]);
const DEFAULT_DEPOT_RETURN_RADIUS_METERS = 150;

function getStopStatusKey(stop) {
  return String(getOrderStatusSource(stop) ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}
const isVisitedStop = (stop) => VISITED_STOP_STATUSES.has(getStopStatusKey(stop));
const isTerminalStop = (stop) => TERMINAL_STOP_STATUSES.has(getStopStatusKey(stop));

/**
 * The server confirms a return only from a completion event. K-food routes have none, so once every stop is finished
 * the first recorded GPS point near the depot after the last known arrival is shown as an observed return.
 */
function getObservedDepotReturn({ actualArrivalByStopId, departureLocation, orderedStops, returnEvidence, routeEndMode, trackingSnapshot }) {
  const depot = departureLocation?.savedCoordinates;
  const radiusMeters = numberOrUndefined(returnEvidence?.thresholdMeters) ?? DEFAULT_DEPOT_RETURN_RADIUS_METERS;
  if (
    routeEndMode !== "RETURN_TO_DEPOT"
    || returnEvidence?.status === "CONFIRMED"
    || !trackingSnapshot
    || !Array.isArray(depot)
    || orderedStops.length === 0
    || !orderedStops.every(isTerminalStop)
  ) return null;

  const lastStop = orderedStops.at(-1);
  const lastStopCoordinates = [numberOrUndefined(lastStop?.longitude), numberOrUndefined(lastStop?.latitude)];
  // A last stop at the depot cannot be told apart from the return.
  if (lastStopCoordinates.every((value) => value !== undefined)
    && distanceBetweenCoordinatesMeters(lastStopCoordinates, depot) <= radiusMeters) return null;

  const lastArrivalMs = Math.max(...orderedStops
    .map((stop) => Date.parse(actualArrivalByStopId[firstText(stop?.deliveryStopId)] ?? ""))
    .filter(Number.isFinite));
  if (!Number.isFinite(lastArrivalMs)) return null;
  const found = findRouteTrackingDepotReturn(trackingSnapshot, {
    afterIso: new Date(lastArrivalMs).toISOString(),
    depotCoordinates: depot,
    radiusMeters,
  });
  return found && { ...found, radiusMeters };
}

export function buildRouteEndpointPresentation({
  actualArrivalByStopId = {},
  departureLocation,
  executionEvidence,
  ianaTimezone,
  routeMetrics,
  routePlan,
  stops,
  trackingSnapshot,
} = {}) {
  const orderedStops = sortChildStopsByActualSequence(Array.isArray(stops) ? stops : []);
  const lastStop = orderedStops.at(-1) ?? null;
  const routeEndMode = getRouteEndMode(routePlan, executionEvidence);
  const scheduledStartAt = firstText(routePlan?.scheduledStartAt);
  const actualStartAt = firstText(executionEvidence?.start?.occurredAt);
  const plannedEndAt = getPlannedRouteEndAt({
    ianaTimezone,
    routeEndMode,
    routeMetrics,
    scheduledStartAt,
    stops: orderedStops,
  });

  const returnEvidence = executionEvidence?.returnToDepot;
  const lastStopId = firstText(lastStop?.deliveryStopId);
  const lastStopArrival = lastStopId ? firstText(actualArrivalByStopId[lastStopId]) : null;
  const returnConfirmedAt = returnEvidence?.status === "CONFIRMED"
    ? firstText(returnEvidence?.observedAt)
    : null;
  const observedReturn = getObservedDepotReturn({
    actualArrivalByStopId,
    departureLocation,
    orderedStops,
    returnEvidence,
    routeEndMode,
    trackingSnapshot,
  });
  const actualEndAt = routeEndMode === "RETURN_TO_DEPOT" ? returnConfirmedAt ?? observedReturn?.occurredAt ?? null : lastStopArrival;
  const returnLeg = getReturnLeg({ orderedStops, routeEndMode, routeMetrics });
  const departureAddress = firstText(
    departureLocation?.endpointAddress,
    departureLocation?.address,
    departureLocation?.name,
  );
  const savedCoordinates = departureLocation?.savedCoordinates;
  const currentCoordinates = departureLocation?.currentCoordinates;
  const currentAddressMatchesSavedDepot = Array.isArray(savedCoordinates)
    && Array.isArray(currentCoordinates)
    && savedCoordinates.length >= 2
    && currentCoordinates.length >= 2
    && savedCoordinates.every((coordinate, index) => (
      Number.isFinite(Number(coordinate))
      && Number.isFinite(Number(currentCoordinates[index]))
      && Math.abs(Number(coordinate) - Number(currentCoordinates[index])) <= 0.000001
    ));
  const endpointDepartureAddress = departureLocation?.addressSource === "UNAVAILABLE"
    ? null
    : departureLocation?.addressSource === "CURRENT_SETTING"
      ? currentAddressMatchesSavedDepot && departureAddress
        ? departureAddress
        : null
      : departureAddress;
  const endpointDepartureAddressTitle = departureLocation?.addressSource === "CURRENT_SETTING"
    && endpointDepartureAddress
    ? "Current location address matched to the saved depot coordinates"
    : null;

  return {
    end: {
      actualAt: actualEndAt ?? null,
      actualLabel: actualEndAt
        ? routeEndMode === "RETURN_TO_DEPOT" ? returnConfirmedAt ? "Return confirmed" : "Return observed (GPS)" : "Actual arrival"
        : "Unconfirmed",
      address: routeEndMode === "RETURN_TO_DEPOT"
        ? endpointDepartureAddress ?? EMPTY_LABEL
        : lastStop ? getStopAddress(lastStop) : EMPTY_LABEL,
      addressTitle: routeEndMode === "RETURN_TO_DEPOT" ? endpointDepartureAddressTitle : null,
      driveTime: returnLeg ? formatChildDriveTimeLabel(returnLeg.durationSeconds, returnLeg.distanceMeters) : EMPTY_LABEL,
      ianaTimezone,
      observedDistanceMeters: observedReturn?.distanceMeters ?? null,
      observedFromGps: observedReturn !== null,
      observedThresholdMeters: observedReturn?.radiusMeters ?? null,
      plannedAt: plannedEndAt,
      returnLegMeters: returnLeg?.distanceMeters ?? null,
      returnLegSeconds: returnLeg?.durationSeconds ?? null,
    },
    start: {
      actualAt: actualStartAt ?? null,
      actualLabel: actualStartAt ? "Actual departure" : "Unconfirmed",
      address: endpointDepartureAddress ?? EMPTY_LABEL,
      addressTitle: endpointDepartureAddressTitle,
      ianaTimezone,
      plannedAt: scheduledStartAt ?? null,
    },
  };
}

export function formatChildEtaLabel(value, ianaTimezone) {
  const parts = formatDateParts(value, ianaTimezone, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  });
  if (!parts?.hour || !parts?.minute) return EMPTY_LABEL;
  return `${parts.hour}:${parts.minute}`;
}

export function formatChildDriveTimeLabel(durationSeconds, distanceMeters) {
  const seconds = numberOrUndefined(durationSeconds);
  const meters = numberOrUndefined(distanceMeters);
  const duration = seconds === undefined ? null : `${Math.round(seconds / 60)} min`;
  let distance = null;

  if (meters !== undefined) {
    if (meters < 1000) {
      distance = `${Math.round(meters)} m`;
    } else {
      const kilometers = meters / 1000;
      distance = `${kilometers >= 10 ? Math.round(kilometers) : kilometers.toFixed(1)} km`;
    }
  }

  return [duration, distance].filter(Boolean).join(" / ") || EMPTY_LABEL;
}

export function formatChildStopTimeLabel(serviceMinutes) {
  const minutes = numberOrUndefined(serviceMinutes);
  return minutes === undefined ? EMPTY_LABEL : `${Math.round(minutes)} min`;
}

function getStopCanonicalSequence(stop) {
  return numberOrUndefined(stop?.sequence ?? stop?.routeStop?.sequence ?? stop?.sortOrder);
}

function getStopFallbackSequence(stop) {
  return numberOrUndefined(stop?.sourceSequence);
}

function sortChildStopsByActualSequence(stops) {
  const hasCanonicalSequence = stops.some((stop) => getStopCanonicalSequence(stop) !== undefined);
  return [...stops].sort((first, second) => {
    const firstSequence = hasCanonicalSequence ? getStopCanonicalSequence(first) : getStopFallbackSequence(first);
    const secondSequence = hasCanonicalSequence ? getStopCanonicalSequence(second) : getStopFallbackSequence(second);
    return (firstSequence ?? Number.MAX_SAFE_INTEGER) - (secondSequence ?? Number.MAX_SAFE_INTEGER);
  });
}

function getLineItemList(lineItems) {
  if (Array.isArray(lineItems)) return lineItems;
  if (Array.isArray(lineItems?.nodes)) return lineItems.nodes;
  if (Array.isArray(lineItems?.edges)) return lineItems.edges.map((edge) => edge?.node).filter(Boolean);
  return [];
}

function getStopLineItems(stop) {
  for (const candidate of [
    stop?.items,
    stop?.lineItems,
    stop?.canonicalLineItems,
    stop?.shopifyOrderSnapshot?.lineItems,
    stop?.rawPayload?.lineItems,
    stop?.order?.lineItems,
  ]) {
    const items = getLineItemList(candidate);
    if (items.length > 0) return items;
  }
  return [];
}

function normalizeItems(stop) {
  return getStopLineItems(stop).map((item) => ({
    name: firstText(item?.name, item?.title) ?? "Item",
    quantity: numberOrUndefined(item?.quantity) ?? 1,
    sku: firstText(item?.sku),
  }));
}

function formatItemsSummary(items, fallbackCount) {
  const quantity = items.reduce((total, item) => total + (numberOrUndefined(item.quantity) ?? 0), 0)
    || numberOrUndefined(fallbackCount)
    || 0;
  if (quantity <= 0) return "No items";
  return quantity === 1 ? "1 item" : `${quantity} items`;
}

function formatItemsDetail(items, fallbackCount) {
  if (items.length === 0) return formatItemsSummary(items, fallbackCount);
  return items.map((item) => `${item.name} ×${item.quantity}${item.sku ? ` · SKU ${item.sku}` : ""}`).join("\n");
}

function getStopAddress(stop) {
  const explicit = firstText(stop?.addressLabel, stop?.formattedAddress, stop?.address);
  if (explicit) return explicit;
  const address = stop?.address ?? stop?.shippingAddress;
  const parts = [
    address?.address1,
    address?.address2,
    address?.city,
    address?.province,
    address?.postalCode,
    address?.countryCode,
  ].map(textOrUndefined).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : EMPTY_LABEL;
}

function getCustomerName(stop) {
  return firstText(
    stop?.recipientName,
    stop?.recipient,
    stop?.customerName,
    stop?.customer?.displayName,
    stop?.customer?.name,
    stop?.order?.customer?.displayName,
    stop?.order?.customer?.name,
  ) ?? EMPTY_LABEL;
}

function getStopPhone(stop) {
  return firstText(
    stop?.phone,
    stop?.recipientPhone,
    stop?.customerPhone,
    stop?.shippingAddress?.phone,
    stop?.address?.phone,
    stop?.order?.phone,
    stop?.order?.customer?.phone,
    stop?.shopifyOrderSnapshot?.phone,
    stop?.shopifyOrderSnapshot?.shippingAddress?.phone,
  );
}

function getStopAddressField(stop, field) {
  return firstText(
    stop?.[field],
    stop?.address?.[field],
    stop?.shippingAddress?.[field],
    stop?.order?.shippingAddress?.[field],
    stop?.shopifyOrderSnapshot?.shippingAddress?.[field],
    stop?.rawPayload?.shippingAddress?.[field],
  );
}

function getStopLatitude(stop) {
  return numberOrUndefined(
    stop?.latitude ??
    stop?.coordinates?.latitude ??
    stop?.address?.latitude ??
    stop?.shippingAddress?.latitude ??
    (Array.isArray(stop?.coordinates) ? stop.coordinates[1] : undefined)
  );
}

function getStopLongitude(stop) {
  return numberOrUndefined(
    stop?.longitude ??
    stop?.coordinates?.longitude ??
    stop?.address?.longitude ??
    stop?.shippingAddress?.longitude ??
    (Array.isArray(stop?.coordinates) ? stop.coordinates[0] : undefined)
  );
}

function getStopInstructions(stop) {
  return firstText(
    stop?.instructions,
    stop?.deliveryInstructions,
    stop?.driverInstructions,
    stop?.note,
    stop?.order?.note,
    stop?.shopifyOrderSnapshot?.note,
    stop?.rawPayload?.note,
  );
}

function getStopNote(stop) {
  return firstText(
    stop?.customerNoteContext?.customerNote,
    stop?.customerNote,
    stop?.note,
    stop?.order?.note,
    stop?.shopifyOrderSnapshot?.note,
    stop?.rawPayload?.note,
  );
}

function formatCurrencyAmount(amount, currencyCode) {
  if (amount === undefined || !currencyCode) return EMPTY_LABEL;
  try {
    return new Intl.NumberFormat("en-US", {
      currency: currencyCode,
      style: "currency",
    }).format(amount);
  } catch {
    return EMPTY_LABEL;
  }
}

export function summarizeChildRouteMoney(rows) {
  const routeRows = Array.isArray(rows) ? rows : [];
  const currencies = [...new Set(routeRows.map((row) => textOrUndefined(row?.currencyCode)).filter(Boolean))];
  const currencyCode = currencies.length === 1 ? currencies[0] : undefined;
  const originalShippingEntries = routeRows.map((row) => ({
    amount: numberOrUndefined(row?.totalShippingPriceAmount),
    currencyCode: textOrUndefined(row?.totalShippingPriceCurrencyCode),
  }));
  const shippingPriceMissingCount = originalShippingEntries.filter((entry) => entry.amount === undefined || !entry.currencyCode).length;
  const shippingCurrencies = [...new Set(originalShippingEntries.map((entry) => entry.currencyCode).filter(Boolean))];
  const shippingPriceState = shippingPriceMissingCount > 0 || routeRows.length === 0
    ? "missing"
    : shippingCurrencies.length === 1 ? "complete" : "mixed_currency";
  const shippingPrice = shippingPriceState === "complete"
    ? originalShippingEntries.reduce((total, entry) => total + entry.amount, 0)
    : undefined;
  const totalPrices = routeRows.map((row) => numberOrUndefined(row?.totalPriceAmount)).filter((amount) => amount !== undefined);
  const totalPrice = totalPrices.length > 0 ? totalPrices.reduce((total, amount) => total + amount, 0) : undefined;

  return {
    currencyCode: currencyCode ?? null,
    shippingPriceLabel: formatCurrencyAmount(shippingPrice, shippingCurrencies[0]),
    shippingPriceMissingCount,
    shippingPriceState,
    totalPriceLabel: formatCurrencyAmount(totalPrice, currencyCode),
  };
}

function normalizeAttributes(attributes) {
  if (typeof attributes === "string") {
    const value = attributes.trim();
    return value ? [{ key: null, label: value, value }] : [];
  }
  if (!Array.isArray(attributes)) return [];
  return attributes
    .map((attribute) => {
      const key = firstText(attribute?.key, attribute?.name);
      const value = firstText(attribute?.value);
      const label = key && value ? `${key}: ${value}` : value ?? key;
      return label ? { key: key ?? null, label, value: value ?? key ?? null } : null;
    })
    .filter(Boolean);
}

function formatAttributesSummary(attributes) {
  return String(attributes.length);
}

function getOrderDateSource(stop) {
  return firstText(
    stop?.orderCreatedAt,
    stop?.createdAt,
    stop?.processedAt,
    stop?.order?.createdAt,
    stop?.shopifyOrderSnapshot?.createdAt,
    stop?.rawPayload?.createdAt,
  );
}

function getOrderStatusSource(stop) {
  return firstText(
    stop?.deliveryStopStatus,
    stop?.deliveryStatus,
    stop?.readiness,
    stop?.planningStatus,
    stop?.fulfillmentStatus,
    stop?.status,
  );
}

function formatPaymentStatus(stop) {
  const status = firstText(
    stop?.payment,
    stop?.paymentStatus,
    stop?.financialStatus,
    stop?.order?.paymentStatus,
    stop?.shopifyOrderSnapshot?.displayFinancialStatus,
    stop?.rawPayload?.displayFinancialStatus,
  );
  if (!status) return EMPTY_LABEL;

  const normalized = status.replace(/\s+/g, "_").toUpperCase();
  if (normalized === "PAID") return "Paid";
  if (normalized === "PENDING") return "Pending";
  return status;
}

/**
 * Lines of a stop's Amount cell. Without a Cash receipt it is the order amount alone.
 * Each Cash receipt adds the expected amount and what the driver received.
 */
export function buildChildRouteAmounts(row, receipts = []) {
  if (!receipts.length) return [{ id: "order", expected: row.amountLabel, received: null }];
  return receipts.map(({ completion }) => {
    const expected = formatCurrencyAmount(numberOrUndefined(completion.expectedAmount), completion.currencyCode);
    return {
      id: completion.id,
      expected: expected === EMPTY_LABEL ? row.amountLabel : expected,
      received: formatCurrencyAmount(numberOrUndefined(completion.actualAmount), completion.currencyCode),
    };
  });
}

export function buildChildActualArrivalByStopId(stopArrivals) {
  const actualArrivalByStopId = {};

  for (const arrival of Array.isArray(stopArrivals) ? stopArrivals : []) {
    const deliveryStopId = firstText(arrival?.deliveryStopId);
    const occurredAt = firstText(arrival?.occurredAt);
    const occurredAtTimestamp = Date.parse(occurredAt ?? "");
    if (!deliveryStopId || !Number.isFinite(occurredAtTimestamp)) continue;

    const currentTimestamp = Date.parse(actualArrivalByStopId[deliveryStopId] ?? "");
    if (!Number.isFinite(currentTimestamp) || occurredAtTimestamp < currentTimestamp) {
      actualArrivalByStopId[deliveryStopId] = occurredAt;
    }
  }

  return actualArrivalByStopId;
}

export function buildChildRouteOrderRows(stops, {
  actualArrivalByStopId = {},
  arrivalEvidenceLoaded = false,
  ianaTimezone,
} = {}) {
  return sortChildStopsByActualSequence(Array.isArray(stops) ? stops : []).map((stop, index) => {
    const items = normalizeItems(stop);
    const attributes = normalizeAttributes(stop?.attributes);
    const serviceType = firstText(stop?.serviceType, stop?.method);
    const deliveryStopId = firstText(stop?.deliveryStopId);
    const locationDiagnostic = normalizeRouteStopLocationDiagnostic(stop);
    const estimatedArrivalAt = firstText(stop?.estimatedArrivalAt, stop?.eta, stop?.arrivalAt);
    const etaSource = firstText(stop?.etaSource);
    const isRollingEta = ["ROUTE_STARTED", "PICKUP_COMPLETED", "STOP_ARRIVED", "STOP_DELIVERED", "STOP_FAILED"].includes(etaSource);
    const expectedArrival = formatChildEtaLabel(estimatedArrivalAt, ianaTimezone);
    const actualArrival = formatChildEtaLabel(actualArrivalByStopId[deliveryStopId], ianaTimezone);

    return {
      id: firstText(stop?.id, stop?.deliveryStopId, stop?.shopifyOrderGid, stop?.orderId) ?? `child-order-${index + 1}`,
      orderId: firstText(stop?.orderId, stop?.sourceOrderId),
      deliveryStopId,
      sourcePlatform: firstText(stop?.sourcePlatform),
      isCustomStop: isCustomRouteStop(stop),
      shopifyOrderGid: firstText(stop?.shopifyOrderGid),
      shopifyOrderLegacyId: firstText(stop?.shopifyOrderLegacyId, stop?.legacyResourceId, stop?.shopifyOrderSnapshot?.legacyResourceId),
      stop: index + 1,
      order: firstText(stop?.order, stop?.orderName, stop?.sourceOrderId, stop?.shopifyOrderGid) ?? EMPTY_LABEL,
      status: formatChildOrderStatus(getOrderStatusSource(stop)),
      orderDate: formatStoreLocalOrderDate(getOrderDateSource(stop), ianaTimezone),
      address: getStopAddress(stop),
      locationDiagnostic,
      locationDiagnosticMessage: getRouteStopLocationMessage(locationDiagnostic),
      currencyCode: firstText(stop?.currencyCode),
      expectedArrival,
      actualArrival,
      arrivalMissing: arrivalEvidenceLoaded && isVisitedStop(stop) && actualArrival === EMPTY_LABEL && expectedArrival !== EMPTY_LABEL,
      hasActualArrival: actualArrival !== EMPTY_LABEL,
      etaCalculatedAt: firstText(stop?.etaCalculatedAt),
      etaLabel: isRollingEta ? "Rolling ETA" : "Planned ETA",
      etaSource,
      etaStatus: firstText(stop?.etaStatus),
      driveTime: formatChildDriveTimeLabel(stop?.durationFromPreviousSeconds, stop?.distanceFromPreviousMeters),
      stopTime: formatChildStopTimeLabel(stop?.serviceMinutes),
      priority: numberOrUndefined(stop?.priority) ?? 0,
      email: firstText(stop?.email),
      customer: getCustomerName(stop),
      items,
      itemsSummary: formatItemsSummary(items, stop?.itemCount ?? stop?.itemsCount),
      itemsDetail: formatItemsDetail(items, stop?.itemCount ?? stop?.itemsCount),
      method: serviceType ?? EMPTY_LABEL,
      note: getStopNote(stop),
      payment: formatPaymentStatus(stop),
      shippingPriceAmount: numberOrUndefined(stop?.shippingPriceAmount),
      totalShippingPriceAmount: numberOrUndefined(stop?.totalShippingPriceAmount),
      totalShippingPriceCurrencyCode: firstText(stop?.totalShippingPriceCurrencyCode),
      totalPriceAmount: numberOrUndefined(stop?.totalPriceAmount),
      amountLabel: formatCurrencyAmount(numberOrUndefined(stop?.totalPriceAmount), firstText(stop?.currencyCode)),
      attributes,
      attributesSummary: formatAttributesSummary(attributes),
      attributesDetail: attributes.length > 0 ? attributes.map((attribute) => attribute.label).join("\n") : EMPTY_LABEL,
      editFields: {
        recipientName: firstText(stop?.recipientName, stop?.recipient, stop?.customerName),
        email: firstText(stop?.email),
        phone: getStopPhone(stop),
        address1: getStopAddressField(stop, "address1"),
        address2: getStopAddressField(stop, "address2"),
        city: getStopAddressField(stop, "city"),
        province: getStopAddressField(stop, "province"),
        postalCode: getStopAddressField(stop, "postalCode"),
        countryCode: getStopAddressField(stop, "countryCode"),
        latitude: getStopLatitude(stop),
        longitude: getStopLongitude(stop),
        timeWindowStart: firstText(stop?.timeWindowStart),
        timeWindowEnd: firstText(stop?.timeWindowEnd),
        serviceMinutes: numberOrUndefined(stop?.serviceMinutes),
        instructions: getStopInstructions(stop),
      },
    };
  });
}

export function buildRouteOrderRows(routeRows, {
  actualArrivalByStopId = {},
  actualArrivalRoutePlanId,
  arrivalEvidenceLoaded = false,
  ianaTimezone,
} = {}) {
  return (Array.isArray(routeRows) ? routeRows : []).flatMap((routeRow, routeIndex) => {
    const sourceRouteId = firstText(routeRow?.id, routeRow?.routeKey) ?? `route-${routeIndex + 1}`;
    const sourceRoutePlanId = firstText(routeRow?.routePlanId);
    const routeActualArrivalByStopId = sourceRoutePlanId && sourceRoutePlanId === actualArrivalRoutePlanId
      ? actualArrivalByStopId
      : {};

    return buildChildRouteOrderRows(routeRow?.stops, {
      actualArrivalByStopId: routeActualArrivalByStopId,
      arrivalEvidenceLoaded: arrivalEvidenceLoaded && Boolean(sourceRoutePlanId) && sourceRoutePlanId === actualArrivalRoutePlanId,
      ianaTimezone,
    }).map((row) => ({
      ...row,
      rowKey: `${sourceRouteId}:${row.id}`,
      sourceRouteColor: firstText(routeRow?.color),
      sourceRouteId,
      sourceRoutePlanId: sourceRoutePlanId ?? null,
      sourceRouteStatus: firstText(routeRow?.status),
      sourceRouteTitle: routeRow?.isUnassigned ? "Unassigned" : firstText(routeRow?.title) ?? `Route ${routeIndex + 1}`,
    }));
  });
}
