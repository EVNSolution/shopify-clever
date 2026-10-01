import { getStoreDate } from "../shopify/store-date-time.js";

// Shopify processedAt is its displayed order date, including the original date of imported orders.
// CLEVER copies that source instant; its own createdAt/import times are never an Order Date.
export function getOrderReceivedAt(order) {
  for (const source of [order, order?.rawPayload, order?.shopifyOrderSnapshot]) {
    if (source && Object.hasOwn(source, "processedAt")) return source.processedAt ?? null;
  }
  return undefined;
}

export function getOrderDate(order, storeTimeZone = "UTC") {
  const receivedAt = getOrderReceivedAt(order);
  if (receivedAt !== undefined) return getStoreDate(receivedAt, storeTimeZone) ?? undefined;
  // Compatibility only for older rows without the source field, never a CLEVER DB timestamp.
  return getStoreDate(order?.orderDateLocal, storeTimeZone) ??
    getStoreDate(order?.orderCreatedAt ?? order?.rawPayload?.createdAt ?? order?.shopifyOrderSnapshot?.createdAt, storeTimeZone) ??
    order?.orderedDate;
}
