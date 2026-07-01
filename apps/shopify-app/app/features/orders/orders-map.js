import { addMapPinImage, createMapPinSymbolLayer, createPaletteMapPinImageData } from "../maps/map-markers";

export const OPENFREEMAP_STYLE_URL = "/vendor/openfreemap-clever-lite.json";
export const DEFAULT_CENTER = [-79.4163, 43.787];
export const INITIAL_HOME_ZOOM = 10;
export const MAP_RECOVERY_DELAY_MS = 2500;
export const MAX_MAP_RECOVERY_ATTEMPTS = 3;
export const MAP_SOURCE_SYNC_RETRY_DELAY_MS = 120;
export const MAX_MAP_SOURCE_SYNC_RETRY_ATTEMPTS = 3;
export const MARKER_CLICK_ZOOM_OUT_THRESHOLD = 8;
export const MARKER_CLICK_TARGET_ZOOM = 10;
export const ORDERS_MAP_SOURCE_ID = "orders-map-orders";
export const ORDERS_MAP_ORDER_LAYER_ID = "orders-map-order-pins";
export const ORDER_PIN_IMAGE_ID = "orders-map-pin";
export const ORDER_PIN_PLANNED_IMAGE_ID = "orders-map-pin-planned";

function isOrdersMapStyleReady(map) {
  if (typeof map?.isStyleLoaded !== "function") return true;

  try {
    return map.isStyleLoaded();
  } catch {
    return false;
  }
}

function getPlannedOrderPinImageId(plannedIndex) {
  return `${ORDER_PIN_PLANNED_IMAGE_ID}-${plannedIndex}`;
}

function ensureOrdersMapPinImages(map, plannedOrderIds = []) {
  const images = [
    {
      id: ORDER_PIN_IMAGE_ID,
      imageData: createPaletteMapPinImageData("order"),
    },
    ...plannedOrderIds.map((_, index) => {
      const plannedIndex = index + 1;
      return {
        id: getPlannedOrderPinImageId(plannedIndex),
        imageData: createPaletteMapPinImageData("plannedOrder", {
          label: plannedIndex,
        }),
      };
    }),
  ];

  for (const image of images) {
    if (!addMapPinImage(map, image.id, image.imageData)) return false;
  }

  return true;
}

function buildOrdersMapFeatureCollection(orders, plannedOrderIds, focusedOrderId = null) {
  const plannedIndexByOrderId = new Map(
    plannedOrderIds.map((orderId, index) => [orderId, index + 1]),
  );

  return {
    type: "FeatureCollection",
    features: orders
      .filter((order) =>
        order.hasCoordinates &&
        (plannedIndexByOrderId.has(order.id) || order.id === focusedOrderId),
      )
      .map((order) => {
        const plannedIndex = plannedIndexByOrderId.get(order.id) ?? 0;
        const isPlanned = plannedIndex > 0;

        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: order.coordinates,
          },
          properties: {
            isPlanned,
            orderId: order.id,
            orderName: order.name,
            pinImage: isPlanned ? getPlannedOrderPinImageId(plannedIndex) : ORDER_PIN_IMAGE_ID,
            plannedIndex,
            sortKey: isPlanned ? 1000 - plannedIndex : 1,
          },
        };
      }),
  };
}

export function syncOrdersMapMarkerLayer(map, orders, plannedOrderIds, focusedOrderId = null) {
  if (!isOrdersMapStyleReady(map)) return false;
  if (!ensureOrdersMapPinImages(map, plannedOrderIds)) return false;

  const featureCollection = buildOrdersMapFeatureCollection(orders, plannedOrderIds, focusedOrderId);
  const existingSource = map.getSource?.(ORDERS_MAP_SOURCE_ID);
  if (existingSource?.setData) {
    existingSource.setData(featureCollection);
  } else {
    map.addSource(ORDERS_MAP_SOURCE_ID, {
      type: "geojson",
      data: featureCollection,
    });
  }

  if (!map.getLayer?.(ORDERS_MAP_ORDER_LAYER_ID)) {
    map.addLayer(createMapPinSymbolLayer({
      id: ORDERS_MAP_ORDER_LAYER_ID,
      source: ORDERS_MAP_SOURCE_ID,
    }));
  }

  return true;
}

export function getOrderIdFromMapFeature(feature) {
  const orderId = feature?.properties?.orderId;
  return typeof orderId === "string" && orderId.length > 0 ? orderId : null;
}
