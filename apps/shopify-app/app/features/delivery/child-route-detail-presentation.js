const EMPTY_LABEL = "–";

export const CHILD_ROUTE_ORDER_COLUMNS = [
  { key: "stop", label: "Stop" },
  { key: "order", label: "Order" },
  { key: "status", label: "Status" },
  { key: "orderDate", label: "Order date" },
  { key: "address", label: "Address" },
  { key: "eta", label: "ETA" },
  { key: "driveTime", label: "Drive time" },
  { key: "stopTime", label: "Stop time" },
  { key: "customer", label: "Customer" },
  { key: "items", label: "Items" },
  { key: "method", label: "Method" },
  { key: "attributes", label: "Attributes" },
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
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "completed") return "Completed";
  if (status === "in_progress" || status === "in-progress") return "In progress";
  return "Preparing";
}

function formatDateParts(value, ianaTimezone, options) {
  const timeZone = textOrUndefined(ianaTimezone) ?? "UTC";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour12: false,
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

function getTimeZoneAbbreviationForInstant(ianaTimezone, instant, fallbackAbbreviation) {
  const timeZone = textOrUndefined(ianaTimezone);
  if (!timeZone) return textOrUndefined(fallbackAbbreviation);

  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return textOrUndefined(fallbackAbbreviation);

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(date);
    return textOrUndefined(parts.find((part) => part.type === "timeZoneName")?.value) ?? textOrUndefined(fallbackAbbreviation);
  } catch {
    return textOrUndefined(fallbackAbbreviation);
  }
}

export function formatChildEtaLabel(value, ianaTimezone, fallbackAbbreviation) {
  const parts = formatDateParts(value, ianaTimezone, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  });
  if (!parts?.hour || !parts?.minute) return EMPTY_LABEL;

  const abbreviation = getTimeZoneAbbreviationForInstant(ianaTimezone, value, fallbackAbbreviation);
  return abbreviation ? `${parts.hour}:${parts.minute} ${abbreviation}` : `${parts.hour}:${parts.minute}`;
}

export function formatChildDriveTimeLabel(durationSeconds, distanceMeters) {
  const seconds = numberOrUndefined(durationSeconds);
  const meters = numberOrUndefined(distanceMeters);
  const duration = seconds === undefined ? null : `${Math.round(seconds / 60)}m`;
  let distance = null;

  if (meters !== undefined) {
    if (meters < 1000) {
      distance = `${Math.round(meters)}m`;
    } else {
      const kilometers = meters / 1000;
      distance = `${kilometers >= 10 ? Math.round(kilometers) : kilometers.toFixed(1)}km`;
    }
  }

  return [duration, distance].filter(Boolean).join(" · ") || EMPTY_LABEL;
}

export function formatChildStopTimeLabel(serviceMinutes) {
  const minutes = numberOrUndefined(serviceMinutes);
  return minutes === undefined ? EMPTY_LABEL : `${Math.round(minutes)}m`;
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

export function buildChildRouteOrderRows(stops, { ianaTimezone, timezoneAbbreviation } = {}) {
  return sortChildStopsByActualSequence(Array.isArray(stops) ? stops : []).map((stop, index) => {
    const items = normalizeItems(stop);
    const attributes = normalizeAttributes(stop?.attributes);
    const serviceType = firstText(stop?.serviceType, stop?.method);

    return {
      id: firstText(stop?.id, stop?.deliveryStopId, stop?.shopifyOrderGid, stop?.orderId) ?? `child-order-${index + 1}`,
      stop: index + 1,
      order: firstText(stop?.order, stop?.orderName, stop?.sourceOrderId, stop?.shopifyOrderGid) ?? EMPTY_LABEL,
      status: formatChildOrderStatus(getOrderStatusSource(stop)),
      orderDate: formatStoreLocalOrderDate(getOrderDateSource(stop), ianaTimezone),
      address: getStopAddress(stop),
      eta: formatChildEtaLabel(firstText(stop?.estimatedArrivalAt, stop?.eta, stop?.arrivalAt), ianaTimezone, timezoneAbbreviation),
      driveTime: formatChildDriveTimeLabel(stop?.durationFromPreviousSeconds, stop?.distanceFromPreviousMeters),
      stopTime: formatChildStopTimeLabel(stop?.serviceMinutes),
      customer: getCustomerName(stop),
      items,
      itemsSummary: formatItemsSummary(items, stop?.itemCount ?? stop?.itemsCount),
      itemsDetail: formatItemsDetail(items, stop?.itemCount ?? stop?.itemsCount),
      method: serviceType ?? EMPTY_LABEL,
      attributes,
      attributesSummary: formatAttributesSummary(attributes),
      attributesDetail: attributes.length > 0 ? attributes.map((attribute) => attribute.label).join("\n") : EMPTY_LABEL,
    };
  });
}
