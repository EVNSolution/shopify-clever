import { formatDeliveryScopeLabel } from "../delivery/delivery-labels.js";

export function mapCanonicalOrdersToOrderRows(canonicalOrders) {
  if (!Array.isArray(canonicalOrders)) return [];

  return canonicalOrders.map((order) => {
    const latitude = numberOrUndefined(order?.latitude);
    const longitude = numberOrUndefined(order?.longitude);
    const hasCoordinates =
      order?.hasCoordinates === true && latitude != null && longitude != null;
    const shippingAddress = normalizeShippingAddress(order?.shippingAddress);
    const serviceType = textOrUndefined(order?.serviceType) ?? inferServiceType(order);
    const deliveryArea =
      textOrUndefined(order?.deliveryArea) ?? (serviceType === "PICKUP" ? "Pickup" : undefined);
    const deliveryDay =
      textOrUndefined(order?.deliveryDayRaw) ??
      textOrUndefined(order?.deliveryWeekday);
    const orderCreatedAt = textOrUndefined(order?.orderCreatedAt);
    const orderedDate =
      textOrUndefined(order?.orderDateLocal) ??
      formatDateOnly(orderCreatedAt) ??
      formatDateOnly(order?.processedAt);
    const deliveryDate = textOrUndefined(order?.deliveryDate);
    const timeWindowStart = textOrUndefined(order?.timeWindowStart);
    const timeWindowEnd = textOrUndefined(order?.timeWindowEnd);
    const routePlanId = firstText(
      order?.routePlanId,
      order?.plannedRoutePlanId,
      order?.activeRoutePlanId,
      order?.deliveryRoutePlanId,
      order?.routeId,
    );
    const routeStatus = firstText(order?.routeStatus, order?.routePlanStatus);
    const routePlanName = firstText(order?.routePlanName, order?.routeName);
    const routeSequence = numberOrUndefined(order?.routeSequence ?? order?.sequence);

    return {
      id: textOrUndefined(order?.shopifyOrderGid),
      orderId: textOrUndefined(order?.orderId),
      deliveryStopId: textOrUndefined(order?.deliveryStopId),
      legacyResourceId: textOrUndefined(order?.shopifyOrderLegacyId),
      name: textOrUndefined(order?.name) ?? textOrUndefined(order?.shopifyOrderGid),
      customer: textOrUndefined(order?.recipientName) ?? "Unknown recipient",
      address: formatShippingAddress(shippingAddress),
      status: textOrUndefined(order?.fulfillmentStatus) ?? "UNKNOWN",
      deliveryStatus: textOrUndefined(order?.deliveryStatus),
      deliveryStopStatus: textOrUndefined(order?.deliveryStopStatus),
      paymentStatus: textOrUndefined(order?.financialStatus) ?? "UNKNOWN",
      eta: "—",
      email: textOrUndefined(order?.email),
      phone: textOrUndefined(order?.phone) ?? "",
      processedAt: textOrUndefined(order?.processedAt),
      updatedAt: textOrUndefined(order?.updatedAtShopify),
      cancelledAt: textOrUndefined(order?.cancelledAt),
      totalPriceAmount: textOrUndefined(order?.totalPriceAmount),
      currencyCode: textOrUndefined(order?.currencyCode),
      lineItems: order?.lineItems ?? order?.shopifyOrderSnapshot?.lineItems ?? order?.rawPayload?.lineItems,
      attributes: formatDeliveryAttributes(deliveryArea, deliveryDay),
      attributeList: formatCanonicalAttributeList(deliveryArea, deliveryDay),
      deliveryArea,
      deliveryDay,
      orderCreatedAt,
      orderedDate,
      deliveryBatchStartDate: textOrUndefined(order?.deliveryBatchStartDate),
      deliveryBatchEndDate: textOrUndefined(order?.deliveryBatchEndDate),
      deliveryDate,
      deliveryDateSource: textOrUndefined(order?.deliveryDateSource),
      deliverySession: textOrUndefined(order?.deliverySession),
      deliveryLabel: formatDeliveryScopeLabel({
        deliveryDate,
        timeWindowEnd,
        timeWindowStart,
      }),
      routeScopeKey: textOrUndefined(order?.routeScopeKey),
      planningGroupKey: textOrUndefined(order?.planningGroupKey),
      timeWindowStart,
      timeWindowEnd,
      coordinates: hasCoordinates ? [longitude, latitude] : [undefined, undefined],
      hasCoordinates,
      shippingAddress,
      readiness: textOrUndefined(order?.readiness),
      reviewReasons: Array.isArray(order?.reviewReasons) ? order.reviewReasons : [],
      planningStatus: textOrUndefined(order?.planningStatus),
      routeMemberships: Array.isArray(order?.routeMemberships) ? order.routeMemberships : [],
      serviceType,
      ...(routePlanId ? { routePlanId } : {}),
      ...(routeStatus ? { routeStatus } : {}),
      ...(routePlanName ? { routePlanName } : {}),
      ...(routeSequence != null ? { routeSequence } : {}),
      shopifyOrderSnapshot: order?.shopifyOrderSnapshot,
      rawPayload: order?.rawPayload,
    };
  });
}

export function mergeShopifyOrderRowsWithCanonicalRows(shopifyRows, canonicalRows) {
  const safeShopifyRows = Array.isArray(shopifyRows) ? shopifyRows : [];
  if (!Array.isArray(canonicalRows) || canonicalRows.length === 0) {
    return safeShopifyRows;
  }

  const canonicalRowById = new Map(
    canonicalRows
      .map((canonicalRow) => [textOrUndefined(canonicalRow?.id), canonicalRow])
      .filter(([orderId]) => orderId),
  );

  if (canonicalRowById.size === 0) return safeShopifyRows;

  const mergedRows = safeShopifyRows.map((shopifyRow) => {
    const canonicalRow = canonicalRowById.get(textOrUndefined(shopifyRow?.id));
    if (!canonicalRow) return shopifyRow;

    canonicalRowById.delete(textOrUndefined(shopifyRow?.id));

    return {
      ...shopifyRow,
      ...canonicalRow,
      shopifyOrderSnapshot:
        shopifyRow?.shopifyOrderSnapshot ?? canonicalRow?.shopifyOrderSnapshot,
      rawPayload: shopifyRow?.rawPayload ?? canonicalRow?.rawPayload,
    };
  });

  return [...mergedRows, ...canonicalRowById.values()];
}

export function isOrderReadyToPlan(order) {
  if (!order?.hasCoordinates) return false;

  const readiness = textOrUndefined(order.readiness);
  if (!readiness) return true;

  return readiness === "READY_TO_PLAN";
}

export function getOrderSyncSnapshots(orders) {
  if (!Array.isArray(orders)) return [];

  return orders
    .map((order) => {
      if (isCompleteShopifySnapshot(order?.shopifyOrderSnapshot)) {
        return sanitizeShopifyOrderSyncSnapshot(order.shopifyOrderSnapshot);
      }

      if (isCompleteShopifySnapshot(order?.rawPayload)) {
        return sanitizeShopifyOrderSyncSnapshot(order.rawPayload);
      }

      return undefined;
    })
    .filter(Boolean);
}

function sanitizeShopifyOrderSyncSnapshot(snapshot) {
  const output = {
    id: textOrUndefined(snapshot.id),
    legacyResourceId: textOrUndefined(snapshot.legacyResourceId),
    name: textOrUndefined(snapshot.name),
    updatedAt: dateStringOrNull(snapshot.updatedAt),
  };

  copyDateField(output, snapshot, "cancelledAt");
  copyDateField(output, snapshot, "createdAt");
  copyDateField(output, snapshot, "processedAt");
  copyStringField(output, snapshot, "displayFinancialStatus");
  copyStringField(output, snapshot, "displayFulfillmentStatus");
  copyStringField(output, snapshot, "email");
  copyStringField(output, snapshot, "note");
  copyStringField(output, snapshot, "phone");
  copyStringArrayField(output, snapshot, "paymentGatewayNames");

  if (Object.hasOwn(snapshot, "currentTotalPriceSet")) {
    output.currentTotalPriceSet = sanitizeMoneySet(snapshot.currentTotalPriceSet);
  }

  if (Object.hasOwn(snapshot, "customAttributes")) {
    output.customAttributes = sanitizeAttributes(snapshot.customAttributes);
  }

  if (Object.hasOwn(snapshot, "lineItems")) {
    output.lineItems = sanitizeLineItems(snapshot.lineItems);
  }

  if (Object.hasOwn(snapshot, "shippingAddress")) {
    output.shippingAddress = sanitizeShippingAddress(snapshot.shippingAddress);
  }

  return output;
}

function copyDateField(output, source, key) {
  if (Object.hasOwn(source, key)) {
    output[key] = dateStringOrNull(source[key]);
  }
}

function copyStringField(output, source, key) {
  if (Object.hasOwn(source, key)) {
    output[key] = stringOrNull(source[key]);
  }
}

function copyStringArrayField(output, source, key) {
  if (Object.hasOwn(source, key)) {
    output[key] = Array.isArray(source[key])
      ? source[key].flatMap((value) => (typeof value === "string" ? [value] : []))
      : [];
  }
}

function sanitizeMoneySet(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const shopMoney = value.shopMoney;
  if (shopMoney == null || typeof shopMoney !== "object" || Array.isArray(shopMoney)) {
    return null;
  }

  const amount = moneyAmountOrNull(shopMoney.amount);
  const currencyCode = stringOrNull(shopMoney.currencyCode);

  if (amount === null || currencyCode === null) {
    return null;
  }

  return { shopMoney: { amount, currencyCode } };
}

function sanitizeAttributes(value) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((attribute) => {
    if (attribute == null || typeof attribute !== "object" || Array.isArray(attribute)) {
      return [];
    }

    const key = stringOrNull(attribute.key);
    const attributeValue = stringOrNull(attribute.value);

    return key && attributeValue ? [{ key, value: attributeValue }] : [];
  });
}

function sanitizeLineItems(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return {
    ...(Object.hasOwn(value, "edges")
      ? { edges: sanitizeLineItemEdges(value.edges) }
      : {}),
    ...(Object.hasOwn(value, "nodes")
      ? { nodes: sanitizeLineItemArray(value.nodes) }
      : {}),
  };
}

function sanitizeLineItemEdges(value) {
  if (!Array.isArray(value)) return null;

  return value.flatMap((edge) => {
    if (edge == null || typeof edge !== "object" || Array.isArray(edge)) {
      return [];
    }

    const node = sanitizeLineItem(edge.node);
    return node ? [{ node }] : [];
  });
}

function sanitizeLineItemArray(value) {
  if (!Array.isArray(value)) return null;

  return value.map(sanitizeLineItem).filter(Boolean);
}

function sanitizeLineItem(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const output = {};
  copyStringField(output, value, "name");
  copyStringField(output, value, "sku");
  copyStringField(output, value, "title");
  copyStringField(output, value, "variantTitle");

  if (Object.hasOwn(value, "quantity")) {
    output.quantity = numberOrNull(value.quantity);
  }

  return output;
}

function sanitizeShippingAddress(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const output = {};
  for (const key of [
    "address1",
    "address2",
    "city",
    "countryCodeV2",
    "name",
    "phone",
    "province",
    "provinceCode",
    "zip",
  ]) {
    copyStringField(output, value, key);
  }

  if (Object.hasOwn(value, "latitude")) {
    output.latitude = numberOrNull(value.latitude);
  }

  if (Object.hasOwn(value, "longitude")) {
    output.longitude = numberOrNull(value.longitude);
  }

  return output;
}

function inferServiceType(order) {
  const attributes = getAttributeMap(
    order?.customAttributes ??
      order?.rawPayload?.customAttributes ??
      order?.shopifyOrderSnapshot?.customAttributes,
  );
  const orderType = textOrUndefined(attributes["Order Type"]);

  return /^pickup$/iu.test(orderType ?? "") || textOrUndefined(attributes["Pickup Day"])
    ? "PICKUP"
    : undefined;
}

function getAttributeMap(customAttributes) {
  if (!Array.isArray(customAttributes)) return {};

  return Object.fromEntries(
    customAttributes
      .map((attribute) => [textOrUndefined(attribute?.key), textOrUndefined(attribute?.value)])
      .filter(([key, value]) => key && value),
  );
}

function normalizeShippingAddress(address = {}) {
  return {
    address1: textOrUndefined(address?.address1),
    address2: textOrUndefined(address?.address2),
    city: textOrUndefined(address?.city),
    province: textOrUndefined(address?.province),
    postalCode: textOrUndefined(address?.postalCode),
    countryCode: textOrUndefined(address?.countryCode),
  };
}

function formatShippingAddress(address) {
  const parts = [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.postalCode,
    address.countryCode,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "No shipping address";
}

function formatCanonicalAttributeList(deliveryArea, deliveryDay) {
  return [
    deliveryArea ? { key: "Delivery Area", value: deliveryArea } : null,
    deliveryDay ? { key: "Delivery Day", value: deliveryDay } : null,
  ].filter(Boolean);
}

function formatDeliveryAttributes(deliveryArea, deliveryDay) {
  return formatCanonicalAttributeList(deliveryArea, deliveryDay)
    .map((attribute) => `${attribute.key}: ${attribute.value}`)
    .join(", ");
}

function isCompleteShopifySnapshot(snapshot) {
  return Boolean(
    snapshot &&
      textOrUndefined(snapshot.id) &&
      textOrUndefined(snapshot.legacyResourceId) &&
      textOrUndefined(snapshot.name) &&
      dateStringOrNull(snapshot.updatedAt),
  );
}

function dateStringOrNull(value) {
  const text = stringOrNull(value);
  if (!text) return null;

  return Number.isNaN(new Date(text).getTime()) ? null : text;
}

function stringOrNull(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function moneyAmountOrNull(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }

  const text = stringOrNull(value);
  if (!text) return null;

  return /^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(text) ? text : null;
}

function numberOrNull(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatDateOnly(value) {
  const text = textOrUndefined(value);
  if (!text) return undefined;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.toISOString().slice(0, 10);
}

function textOrUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function firstText(...values) {
  for (const value of values) {
    const text = textOrUndefined(value);
    if (text) return text;
  }

  return undefined;
}

function numberOrUndefined(value) {
  if (value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
