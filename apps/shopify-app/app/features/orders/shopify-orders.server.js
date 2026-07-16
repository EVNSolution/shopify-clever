import {
  formatDeliveryScopeLabel,
  inferDeliveryDateForOrder,
} from "../delivery/delivery-labels.js";
import {
  SERVICE_ERROR_CODES,
  SERVICE_ERROR_NOTICES,
  getServiceErrorMessage,
  normalizeGraphqlErrors as normalizeServiceGraphqlErrors,
} from "../service-errors.js";

const SHOPIFY_ORDERS_PAGE_SIZE = 50;
const SHOPIFY_ORDERS_MAX_PAGES = 20;

export const SHOPIFY_ORDERS_QUERY = `#graphql
  query CleverRouteOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          legacyResourceId
          name
          phone
          createdAt
          updatedAt
          cancelledAt
          note
          customer {
            note
          }
          processedAt
          displayFinancialStatus
          paymentGatewayNames
          displayFulfillmentStatus
          currentTotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          customAttributes {
            key
            value
          }
          lineItems(first: 20) {
            nodes {
              title
              name
              variantTitle
              quantity
              sku
            }
          }
          shippingAddress {
            name
            address1
            address2
            city
            province
            provinceCode
            zip
            countryCodeV2
            phone
            latitude
            longitude
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const SHOPIFY_ORDERS_QUERY_WITHOUT_CUSTOMER_NOTE = SHOPIFY_ORDERS_QUERY.replace(
  /\n[ ]{10}customer \{\n[ ]{12}note\n[ ]{10}\}/,
  "",
);

export const ORDER_SCOPE_ACCESS_ERROR_CODE = "ORDER_SCOPE_ACCESS";
export const PROTECTED_ORDER_ACCESS_ERROR_CODE = SERVICE_ERROR_CODES.PROTECTED_ORDER_ACCESS;

const ORDER_SCOPE_ACCESS_MESSAGE =
  "Shopify Orders 권한이 아직 승인되지 않았습니다. shopify.app.toml의 access_scopes에 read_orders를 포함한 뒤 Shopify 앱을 다시 설치/권한 갱신해 주세요.";

const PROTECTED_ORDER_ACCESS_MESSAGE = SERVICE_ERROR_NOTICES.PROTECTED_ORDER_ACCESS;

const DEFAULT_SHOPIFY_ORDERS_CACHE_TTL_MS = 30_000;
const shopifyOrdersCache = new Map();
const LATITUDE_ATTRIBUTE_KEYS = ["clever_lat", "tomatono_lat"];
const LONGITUDE_ATTRIBUTE_KEYS = ["clever_lng", "tomatono_lng"];
const DELIVERY_DATE_ATTRIBUTE_KEYS = [
  "Delivery Date",
  "Delivery date",
  "clever_delivery_date",
  "deliveryDate",
  "delivery_date",
  "tomatono_delivery_date",
];

export function clearShopifyOrdersCache() {
  shopifyOrdersCache.clear();
}

export function assertReadOnlyShopifyOrdersOperation(operation) {
  const withoutComments = String(operation ?? "").replace(/#[^\r\n]*/gu, " ");
  if (/\bmutation\b/u.test(withoutComments)) {
    throw new Error(
      "Shopify order and customer mutations are disabled; save operational corrections in CLEVER DB.",
    );
  }
}

export async function fetchShopifyOrders(admin, options = {}) {
  const cacheKey = normalizeShopifyOrdersCacheKey(
    [options.cacheKey, buildDeliveryCycleCacheScope(options.deliveryCycle)].filter(Boolean).join("|"),
  );
  const cacheTtlMs = getShopifyOrdersCacheTtlMs();

  if (!cacheKey || cacheTtlMs <= 0) {
    return withShopifyOrdersCacheStatus(await loadShopifyOrders(admin, options), "disabled");
  }

  const now = Date.now();
  const cached = readShopifyOrdersCache(cacheKey, now);
  if (cached) return cached;

  const cacheEntry = {
    expiresAt: now + cacheTtlMs,
    promise: loadShopifyOrders(admin, options).then(
      (result) => {
        if ((result.errors ?? []).length > 0) {
          shopifyOrdersCache.delete(cacheKey);
        }

        return result;
      },
      (error) => {
        shopifyOrdersCache.delete(cacheKey);
        throw error;
      },
    ),
  };
  shopifyOrdersCache.set(cacheKey, cacheEntry);

  return withShopifyOrdersCacheStatus(await cacheEntry.promise, "miss");
}

async function loadShopifyOrders(admin, options = {}) {
  try {
    const orders = [];
    const errors = [];
    let after = null;
    let ordersQuery = SHOPIFY_ORDERS_QUERY;

    for (let page = 0; page < SHOPIFY_ORDERS_MAX_PAGES; page += 1) {
      const variables = { after, first: SHOPIFY_ORDERS_PAGE_SIZE };
      let response;
      try {
        assertReadOnlyShopifyOrdersOperation(ordersQuery);
        response = await admin.graphql(ordersQuery, { variables });
      } catch (error) {
        if (ordersQuery !== SHOPIFY_ORDERS_QUERY || !isCustomerScopeAccessError(error)) throw error;
        ordersQuery = SHOPIFY_ORDERS_QUERY_WITHOUT_CUSTOMER_NOTE;
        assertReadOnlyShopifyOrdersOperation(ordersQuery);
        response = await admin.graphql(ordersQuery, { variables });
      }
      const payload = await response.json();
      orders.push(...mapShopifyOrdersResponse(payload, options));
      errors.push(...normalizeGraphqlErrors(payload.errors));

      const pageInfo = payload?.data?.orders?.pageInfo;
      if (pageInfo?.hasNextPage !== true) break;

      const nextCursor = textOrUndefined(pageInfo.endCursor);
      if (!nextCursor || nextCursor === after) break;
      after = nextCursor;
    }

    return {
      orders,
      errors,
    };
  } catch (error) {
    if (isOrderScopeAccessError(error)) {
      return {
        orders: [],
        errors: [
          {
            code: ORDER_SCOPE_ACCESS_ERROR_CODE,
            message: ORDER_SCOPE_ACCESS_MESSAGE,
          },
        ],
      };
    }

    if (isProtectedOrderAccessError(error)) {
      return {
        orders: [],
        errors: [
          {
            code: PROTECTED_ORDER_ACCESS_ERROR_CODE,
            message: PROTECTED_ORDER_ACCESS_MESSAGE,
          },
        ],
      };
    }

    throw error;
  }
}

function readShopifyOrdersCache(cacheKey, now) {
  const cached = shopifyOrdersCache.get(cacheKey);

  if (!cached) return null;
  if (cached.expiresAt <= now) {
    shopifyOrdersCache.delete(cacheKey);
    return null;
  }

  return cached.promise.then((result) =>
    withShopifyOrdersCacheStatus(result, "hit"),
  );
}

function buildDeliveryCycleCacheScope(deliveryCycle) {
  if (!deliveryCycle) return "";
  return `${deliveryCycle.cutoffWeekday ?? ""}@${deliveryCycle.cutoffTime ?? ""}@${deliveryCycle.timeZone ?? ""}`;
}

function getShopifyOrdersCacheTtlMs() {
  const configuredTtl = Number(process.env.CLEVER_SHOPIFY_ORDERS_CACHE_TTL_MS);

  if (process.env.CLEVER_SHOPIFY_ORDERS_CACHE_TTL_MS != null) {
    return Number.isFinite(configuredTtl) && configuredTtl >= 0
      ? configuredTtl
      : DEFAULT_SHOPIFY_ORDERS_CACHE_TTL_MS;
  }

  return DEFAULT_SHOPIFY_ORDERS_CACHE_TTL_MS;
}

function normalizeShopifyOrdersCacheKey(cacheKey) {
  return textOrUndefined(cacheKey);
}

function cloneShopifyOrdersResult(result) {
  if (typeof structuredClone === "function") {
    return structuredClone(result);
  }

  return JSON.parse(JSON.stringify(result));
}

function withShopifyOrdersCacheStatus(result, cacheStatus) {
  return {
    ...cloneShopifyOrdersResult(result),
    cacheStatus,
  };
}

export function mapShopifyOrdersResponse(payload, options = {}) {
  const edges = payload?.data?.orders?.edges;
  if (!Array.isArray(edges)) return [];

  return edges.map((edge) => mapOrderNode(edge?.node, options)).filter(Boolean);
}

function mapOrderNode(order, options = {}) {
  if (!order?.id) return undefined;

  const shippingAddress = order.shippingAddress ?? {};
  const attributes = getAttributeMap(order.customAttributes);
  const deliveryDay = textOrUndefined(attributes["Delivery Day"]);
  const deliveryDateRaw = getDeliveryDateAttribute(attributes);
  const deliveryDate = inferDeliveryDateForOrder({
    deliveryCycle: options.deliveryCycle,
    deliveryDate: deliveryDateRaw,
    deliveryDay,
    lineItems: order.lineItems,
    orderCreatedAt: order.createdAt ?? order.processedAt,
  });
  const pickupOrder = isPickupAttributes(attributes);
  const deliverySession = deliveryDate ? "DAY" : undefined;
  const serviceType = pickupOrder ? "PICKUP" : deliveryDate ? "DELIVERY" : undefined;
  const routeScopeKey = buildRouteScopeKey({
    deliveryDate,
    serviceType,
  });
  const deliveryArea =
    textOrUndefined(attributes["Delivery Area"]) ?? (pickupOrder ? "Pickup" : undefined);
  const coordinateAttributes = getCoordinateAttributes(order.customAttributes);
  const latitude =
    numberOrUndefined(shippingAddress.latitude) ??
    numberOrUndefined(coordinateAttributes.latitude);
  const longitude =
    numberOrUndefined(shippingAddress.longitude) ??
    numberOrUndefined(coordinateAttributes.longitude);
  const customerNote = textOrUndefined(order.customer?.note);

  return {
    id: order.id,
    name: textOrUndefined(order.name) ?? order.id,
    customer: textOrUndefined(shippingAddress.name) ?? "Unknown recipient",
    address: formatShippingAddress(shippingAddress),
    status: textOrUndefined(order.displayFulfillmentStatus) ?? "UNKNOWN",
    paymentStatus: textOrUndefined(order.displayFinancialStatus) ?? "UNKNOWN",
    eta: "—",
    legacyResourceId: textOrUndefined(order.legacyResourceId),
    createdAt: textOrUndefined(order.createdAt),
    updatedAt: textOrUndefined(order.updatedAt),
    cancelledAt: textOrUndefined(order.cancelledAt),
    note: textOrUndefined(order.note),
    ...(customerNote ? { customerNote } : {}),
    phone:
      textOrUndefined(shippingAddress.phone) ?? textOrUndefined(order.phone) ?? "",
    processedAt: textOrUndefined(order.processedAt),
    totalPriceAmount: textOrUndefined(
      order.currentTotalPriceSet?.shopMoney?.amount,
    ),
    currencyCode: textOrUndefined(
      order.currentTotalPriceSet?.shopMoney?.currencyCode,
    ),
    lineItems: order.lineItems,
    shippingAddress: mapShippingAddress(shippingAddress),
    attributes: formatDeliveryAttributes(attributes),
    attributeList: getAttributeList(order.customAttributes),
    deliveryArea,
    deliveryDay,
    deliveryDate,
    deliveryLabel: formatDeliveryScopeLabel({ deliveryDate }),
    deliverySession,
    serviceType,
    routeScopeKey,
    planningGroupKey:
      routeScopeKey && deliveryArea ? `${routeScopeKey}|${deliveryArea}` : routeScopeKey,
    timeWindowEnd: undefined,
    timeWindowStart: undefined,
    orderedDate:
      formatDateOnly(order.createdAt) ?? formatDateOnly(order.processedAt),
    coordinates: [longitude, latitude],
    hasCoordinates: latitude != null && longitude != null,
    shopifyOrderSnapshot: order,
    rawPayload: order,
  };
}

function buildRouteScopeKey({ deliveryDate, serviceType, timeWindowEnd, timeWindowStart }) {
  if (!deliveryDate || !serviceType) return undefined;

  return [
    deliveryDate,
    serviceType,
    textOrUndefined(timeWindowStart) ?? "",
    textOrUndefined(timeWindowEnd) ?? "",
  ].join("|");
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

function mapShippingAddress(address) {
  return {
    address1: textOrUndefined(address?.address1),
    address2: textOrUndefined(address?.address2),
    city: textOrUndefined(address?.city),
    province:
      textOrUndefined(address?.provinceCode) ?? textOrUndefined(address?.province),
    postalCode: textOrUndefined(address?.zip),
    countryCode: textOrUndefined(address?.countryCodeV2),
  };
}

function formatShippingAddress(address) {
  const parts = [
    address?.address1,
    address?.address2,
    address?.city,
    textOrUndefined(address?.provinceCode) ?? textOrUndefined(address?.province),
    address?.zip,
    address?.countryCodeV2,
  ]
    .map(textOrUndefined)
    .filter(Boolean);

  return parts.length ? parts.join(", ") : "No shipping address";
}

function textOrUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function numberOrUndefined(value) {
  if (value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getCoordinateAttributes(customAttributes) {
  const attributes = getAttributeMap(customAttributes);

  return {
    latitude: getFirstAttributeValue(attributes, LATITUDE_ATTRIBUTE_KEYS),
    longitude: getFirstAttributeValue(attributes, LONGITUDE_ATTRIBUTE_KEYS),
  };
}

function getAttributeList(customAttributes) {
  if (!Array.isArray(customAttributes)) {
    return [];
  }

  return customAttributes
    .map((attribute) => ({
      key: textOrUndefined(attribute?.key),
      value: textOrUndefined(attribute?.value),
    }))
    .filter((attribute) => attribute.key && attribute.value);
}

function getAttributeMap(customAttributes) {
  return Object.fromEntries(
    getAttributeList(customAttributes).map((attribute) => [
      attribute.key,
      attribute.value,
    ]),
  );
}

function getDeliveryDateAttribute(attributes) {
  return getFirstAttributeValue(attributes, DELIVERY_DATE_ATTRIBUTE_KEYS);
}

function isPickupAttributes(attributes) {
  const orderType = textOrUndefined(attributes["Order Type"]);
  return /^pickup$/iu.test(orderType ?? "") || Boolean(textOrUndefined(attributes["Pickup Day"]));
}

function getFirstAttributeValue(attributes, keys) {
  for (const key of keys) {
    const value = textOrUndefined(attributes[key]);
    if (value) return value;
  }

  return undefined;
}

function formatDeliveryAttributes(attributes) {
  const deliveryArea = textOrUndefined(attributes["Delivery Area"]);
  const deliveryDay = textOrUndefined(attributes["Delivery Day"]);
  const parts = [];

  if (deliveryArea) parts.push(`Delivery Area: ${deliveryArea}`);
  if (deliveryDay) parts.push(`Delivery Day: ${deliveryDay}`);

  return parts.join(", ");
}

function normalizeGraphqlErrors(errors) {
  return normalizeServiceGraphqlErrors(errors, { mapError: normalizeOrderGraphqlError });
}

function normalizeOrderGraphqlError(error) {
  if (isOrderScopeAccessError(error)) {
    return {
      code: ORDER_SCOPE_ACCESS_ERROR_CODE,
      message: ORDER_SCOPE_ACCESS_MESSAGE,
    };
  }

  if (isProtectedOrderAccessError(error)) {
    return {
      code: PROTECTED_ORDER_ACCESS_ERROR_CODE,
      message: PROTECTED_ORDER_ACCESS_MESSAGE,
    };
  }

  return { message: getServiceErrorMessage(error) };
}

function isOrderScopeAccessError(error) {
  const message = getShopifyErrorMessage(error);

  return (
    /Access denied for orders field/i.test(message) ||
    /Required access:\s*`?read_orders`?/i.test(message)
  );
}

function isCustomerScopeAccessError(error) {
  const message = getShopifyErrorMessage(error);
  return /Access denied for customer field/i.test(message) || /Required access:\s*`?read_customers`?/i.test(message);
}

function isProtectedOrderAccessError(error) {
  const message = getShopifyErrorMessage(error);

  return (
    /not approved to access the Order object/i.test(message) ||
    /not approved to use the .+ field/i.test(message)
  );
}

function getShopifyErrorMessage(error) {
  return [
    error?.message,
    error?.body?.errors?.message,
    ...(Array.isArray(error?.body?.errors?.graphQLErrors)
      ? error.body.errors.graphQLErrors.map((graphQLError) => graphQLError?.message)
      : []),
    ...(Array.isArray(error?.body?.errors)
      ? error.body.errors.map((graphqlError) => graphqlError?.message)
      : []),
  ]
    .filter(Boolean)
    .join("\n");
}
