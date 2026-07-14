import { getRouteGroupChildRoutePlanId, textOrUndefined } from "./route-helpers.js";

export function mergeCurrentChildDirectDetail(childDetails, currentDetail) {
  const routePlanId = getRouteGroupChildRoutePlanId(currentDetail);
  if (!routePlanId) return childDetails;

  let didReplace = false;
  const mergedDetails = childDetails.map((detail) => {
    if (getRouteGroupChildRoutePlanId(detail) !== routePlanId) return detail;
    didReplace = true;
    const routePlan = {
      ...(detail.routePlan ?? {}),
      ...(currentDetail.routePlan ?? {}),
      name: detail.routePlan?.name ?? currentDetail.routePlan?.name,
    };
    return {
      ...detail,
      ...currentDetail,
      routePlan,
      routePlanId,
    };
  });

  return didReplace ? mergedDetails : [currentDetail, ...mergedDetails];
}

export function attachDeliveryOrderFieldsToRouteDetails(routeDetails, orders) {
  const orderByKey = buildDeliveryOrderLookup(orders);
  if (orderByKey.size === 0) return routeDetails;

  return routeDetails.map((detail) => ({
    ...detail,
    stops: attachDeliveryOrderFieldsToStops(detail.stops, orderByKey),
  }));
}

export function attachDeliveryOrderFieldsToStops(stops, ordersOrLookup) {
  if (!Array.isArray(stops)) return stops;
  const orderByKey = ordersOrLookup instanceof Map ? ordersOrLookup : buildDeliveryOrderLookup(ordersOrLookup);
  if (orderByKey.size === 0) return stops;

  return stops.map((stop) => {
    const order = getDeliveryOrderForStop(stop, orderByKey);
    if (!order) return stop;

    const lineItems = getDeliveryOrderLineItems(order);
    const orderCreatedAt = firstText(
      order?.orderCreatedAt,
      order?.createdAt,
      order?.processedAt,
      order?.shopifyOrderSnapshot?.createdAt,
      order?.rawPayload?.createdAt,
      order?.rawPayload?.processedAt,
    );
    const orderDateLocal = firstText(order?.orderDateLocal, order?.orderedDate);
    const deliveryStatus = firstText(order?.deliveryStatus);
    const deliveryStopStatus = firstText(order?.deliveryStopStatus);
    const fulfillmentStatus = firstText(order?.fulfillmentStatus, order?.status);
    const readiness = firstText(order?.readiness);
    const planningStatus = firstText(order?.planningStatus);
    const serviceType = firstText(order?.serviceType, order?.rawPayload?.serviceType);

    return {
      ...stop,
      ...(orderCreatedAt ? { orderCreatedAt } : {}),
      ...(orderDateLocal ? { orderDateLocal } : {}),
      ...(deliveryStatus ? { deliveryStatus } : {}),
      ...(deliveryStopStatus ? { deliveryStopStatus } : {}),
      ...(fulfillmentStatus ? { fulfillmentStatus } : {}),
      ...(readiness ? { readiness } : {}),
      ...(planningStatus ? { planningStatus } : {}),
      ...(serviceType ? { serviceType, method: serviceType } : {}),
      ...(lineItems && stop?.lineItems == null ? { lineItems } : {}),
      ...(lineItems ? { canonicalLineItems: lineItems } : {}),
    };
  });
}

export function buildDeliveryOrderLookup(orders) {
  const orderByKey = new Map();
  for (const order of orders ?? []) {
    addOrderLookupKey(orderByKey, order?.id, order);
    addOrderLookupKey(orderByKey, order?.orderId, order);
    addOrderLookupKey(orderByKey, order?.name, order);
    addOrderLookupKey(orderByKey, order?.shopifyOrderGid, order);
    addOrderLookupKey(orderByKey, order?.shopifyOrderLegacyId, order);
    addOrderLookupKey(orderByKey, order?.legacyResourceId, order);
  }
  return orderByKey;
}

function addOrderLookupKey(orderByKey, value, order) {
  const key = textOrUndefined(value);
  if (!key) return;
  orderByKey.set(key, order);
  if (key.startsWith("#")) orderByKey.set(key.slice(1), order);
}

function getDeliveryOrderForStop(stop, orderByKey) {
  const keys = [
    stop?.orderId,
    stop?.orderName,
    stop?.sourceOrderId,
    stop?.shopifyOrderGid,
    stop?.shopifyOrderLegacyId,
    stop?.legacyResourceId,
  ];
  for (const key of keys) {
    const normalizedKey = textOrUndefined(key);
    const order = orderByKey.get(normalizedKey) ?? orderByKey.get(normalizedKey?.replace(/^#/, ""));
    if (order) return order;
  }
  return null;
}

function getDeliveryOrderLineItems(order) {
  const lineItems = order?.items ?? order?.lineItems ?? order?.shopifyOrderSnapshot?.lineItems ?? order?.rawPayload?.lineItems;
  if (Array.isArray(lineItems)) return lineItems;
  if (Array.isArray(lineItems?.nodes)) return lineItems.nodes;
  if (Array.isArray(lineItems?.edges)) return lineItems.edges.map((edge) => edge?.node).filter(Boolean);
  return null;
}

function firstText(...values) {
  for (const value of values) {
    const text = textOrUndefined(value);
    if (text) return text;
  }
  return undefined;
}
