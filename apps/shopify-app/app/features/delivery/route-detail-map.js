import { addMapPinImage, createDepartureMarkerImageData, createMapPinImageData, createMapPinSymbolLayer } from "../maps/map-markers.js";
import { numberOrUndefined, textOrUndefined } from "./route-helpers.js";
import { getRouteTrackingFitCoordinates, getRouteTrackingLineFeatures } from "./route-tracking.js";

const DEFAULT_CENTER = [-79.3832, 43.6532];
const ROUTE_DETAIL_ROUTE_SOURCE_ID = "route-detail-osrm-route";
const ROUTE_DETAIL_ROUTE_LAYER_ID = "route-detail-osrm-route-line";
const ROUTE_DETAIL_MARKER_SOURCE_ID = "route-detail-markers";
const ROUTE_DETAIL_DEPARTURE_LAYER_ID = "route-detail-departure-marker";
const ROUTE_DETAIL_STOP_LAYER_ID = "route-detail-stop-markers";
const ROUTE_DETAIL_STOP_POINT_SOURCE_ID = "route-detail-snapped-stop-points";
const ROUTE_DETAIL_STOP_POINT_LAYER_ID = "route-detail-snapped-stop-points";
const ROUTE_DETAIL_TRACKING_SOURCE_ID = "route-detail-live-tracking";
const ROUTE_DETAIL_TRACKING_TRAIL_LAYER_ID = "route-detail-live-tracking-trail";
const ROUTE_DETAIL_TRACKING_CONNECTOR_LAYER_ID = "route-detail-live-tracking-connector";
const ROUTE_DETAIL_TRACKING_ARRIVAL_SOURCE_ID = "route-detail-tracking-arrivals";
const ROUTE_DETAIL_TRACKING_ARRIVAL_CIRCLE_LAYER_ID = "route-detail-tracking-arrival-circles";
const ROUTE_DETAIL_TRACKING_ARRIVAL_LABEL_LAYER_ID = "route-detail-tracking-arrival-labels";
const ROUTE_DETAIL_TRACKING_LAYER_IDS = [
  ROUTE_DETAIL_TRACKING_TRAIL_LAYER_ID,
  ROUTE_DETAIL_TRACKING_CONNECTOR_LAYER_ID,
  ROUTE_DETAIL_TRACKING_ARRIVAL_CIRCLE_LAYER_ID,
  ROUTE_DETAIL_TRACKING_ARRIVAL_LABEL_LAYER_ID,
];
const ROUTE_DETAIL_COMPLETED_STOP_COLOR = "#8c9196";
const ROUTE_DETAIL_DEPARTURE_IMAGE_ID = "route-detail-departure-pin";
const ROUTE_DETAIL_POLYGON_SOURCE_ID = "route-detail-edit-polygon";
const ROUTE_DETAIL_POLYGON_FILL_LAYER_ID = "route-detail-edit-polygon-fill";
const ROUTE_DETAIL_POLYGON_LINE_LAYER_ID = "route-detail-edit-polygon-line";
const ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID = "route-detail-edit-polygon-corners";
const ROUTE_STOP_POINT_MIN_DISTANCE_METERS = 1;
const ROUTE_DETAIL_STOP_POINT_MIN_ZOOM = 15;
const ROUTE_DETAIL_STOP_POINT_RADIUS = 2.5;
const ROUTE_DETAIL_STOP_POINT_STROKE_WIDTH = 1.5;
const ROUTE_DETAIL_ARRIVAL_GROUP_DISTANCE_METERS = 12;
const ROUTE_DETAIL_POPUP_EDGE_PADDING_PX = 12;
const ROUTE_TRACKING_ARRIVAL_LIST_MAX_HEIGHT_PX = 260;
const ROUTE_TRACKING_ARRIVAL_LIST_MIN_HEIGHT_PX = 72;
// Reserves frame edges, popup padding/header/tip, and the marker offset.
const ROUTE_TRACKING_ARRIVAL_POPUP_NON_LIST_HEIGHT_PX = 102;

function getRouteTrackingArrivalListMaxHeight(mapHeight) {
  const numericMapHeight = Number(mapHeight);
  if (!Number.isFinite(numericMapHeight) || numericMapHeight <= 0) {
    return ROUTE_TRACKING_ARRIVAL_LIST_MAX_HEIGHT_PX;
  }

  return Math.max(
    ROUTE_TRACKING_ARRIVAL_LIST_MIN_HEIGHT_PX,
    Math.min(
      ROUTE_TRACKING_ARRIVAL_LIST_MAX_HEIGHT_PX,
      Math.floor(numericMapHeight - ROUTE_TRACKING_ARRIVAL_POPUP_NON_LIST_HEIGHT_PX),
    ),
  );
}

function getRouteDetailPopupPanOffset(frameRect, popupRect, edgePadding = ROUTE_DETAIL_POPUP_EDGE_PADDING_PX) {
  const frame = [frameRect?.left, frameRect?.top, frameRect?.right, frameRect?.bottom].map(Number);
  const popup = [popupRect?.left, popupRect?.top, popupRect?.right, popupRect?.bottom].map(Number);
  const padding = Number(edgePadding);
  if (![...frame, ...popup, padding].every(Number.isFinite) || padding < 0) return [0, 0];

  const [frameLeft, frameTop, frameRight, frameBottom] = frame;
  const [popupLeft, popupTop, popupRight, popupBottom] = popup;
  const safeLeft = frameLeft + padding;
  const safeTop = frameTop + padding;
  const safeRight = frameRight - padding;
  const safeBottom = frameBottom - padding;

  const getAxisOffset = (start, end, safeStart, safeEnd) => {
    if (end - start > safeEnd - safeStart) {
      return Math.round((start + end - safeStart - safeEnd) / 2);
    }
    if (start < safeStart) return Math.round(start - safeStart);
    if (end > safeEnd) return Math.round(end - safeEnd);
    return 0;
  };

  return [
    getAxisOffset(popupLeft, popupRight, safeLeft, safeRight),
    getAxisOffset(popupTop, popupBottom, safeTop, safeBottom),
  ];
}

function emitRouteDetailMarkerDiagnostics(onDiagnostics, metric) {
  if (typeof onDiagnostics !== "function") return;

  onDiagnostics({
    hasDepartureLayer: false,
    hasMarkerLayer: false,
    hasMarkerSource: false,
    hasStopLayer: false,
    hasStopPointLayer: false,
    hasStopPointSource: false,
    ...metric,
  });
}

function getRouteDetailMarkerLayerState(map) {
  const hasDepartureLayer = Boolean(map?.getLayer?.(ROUTE_DETAIL_DEPARTURE_LAYER_ID));
  const hasStopLayer = Boolean(map?.getLayer?.(ROUTE_DETAIL_STOP_LAYER_ID));

  return {
    hasDepartureLayer,
    hasMarkerLayer: hasDepartureLayer || hasStopLayer,
    hasMarkerSource: Boolean(map?.getSource?.(ROUTE_DETAIL_MARKER_SOURCE_ID)),
    hasStopLayer,
    hasStopPointLayer: Boolean(map?.getLayer?.(ROUTE_DETAIL_STOP_POINT_LAYER_ID)),
    hasStopPointSource: Boolean(map?.getSource?.(ROUTE_DETAIL_STOP_POINT_SOURCE_ID)),
  };
}

function getRouteDetailMarkerError(error) {
  return {
    errorMessage: error instanceof Error ? error.message : String(error),
    errorName: error instanceof Error ? error.name : "unknown",
  };
}

function isValidLatitude(latitude) {
  return typeof latitude === "number" && latitude >= -90 && latitude <= 90;
}

function isValidLongitude(longitude) {
  return typeof longitude === "number" && longitude >= -180 && longitude <= 180;
}

function normalizeLngLat(latitudeValue, longitudeValue) {
  const latitude = numberOrUndefined(latitudeValue);
  const longitude = numberOrUndefined(longitudeValue);

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }

  return [longitude, latitude];
}

function normalizeLngLatPair(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const longitude = numberOrUndefined(coordinates[0]);
  const latitude = numberOrUndefined(coordinates[1]);

  if (!isValidLongitude(longitude) || !isValidLatitude(latitude)) {
    return null;
  }

  return [longitude, latitude];
}

function areLngLatPairsEqual(firstCoordinates, secondCoordinates) {
  if (!firstCoordinates || !secondCoordinates) return false;

  return (
    Math.abs(firstCoordinates[0] - secondCoordinates[0]) < 0.000001 &&
    Math.abs(firstCoordinates[1] - secondCoordinates[1]) < 0.000001
  );
}

function calculateLngLatDistanceMeters(firstCoordinates, secondCoordinates) {
  if (!firstCoordinates || !secondCoordinates) return null;

  const earthRadiusMeters = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const firstLatitude = toRadians(firstCoordinates[1]);
  const secondLatitude = toRadians(secondCoordinates[1]);
  const deltaLatitude = toRadians(secondCoordinates[1] - firstCoordinates[1]);
  const deltaLongitude = toRadians(secondCoordinates[0] - firstCoordinates[0]);
  const halfChord =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(deltaLongitude / 2) ** 2;
  const distanceMeters = 2 * earthRadiusMeters * Math.asin(Math.sqrt(halfChord));

  return Math.round(distanceMeters * 100) / 100;
}

function getRouteMapLocations(departureLocation, routeStops) {
  return [
    ...(departureLocation?.hasCoordinates ? [departureLocation] : []),
    ...routeStops.filter((stop) => stop.hasCoordinates),
  ];
}

function getRouteMapCenter(departureLocation, routeStops) {
  return getRouteMapLocations(departureLocation, routeStops)[0]?.coordinates ?? DEFAULT_CENTER;
}

function getValidRouteLineCoordinates(coordinates) {
  return coordinates.filter((coordinate) => (
    Array.isArray(coordinate) &&
    isValidLongitude(Number(coordinate[0])) &&
    isValidLatitude(Number(coordinate[1]))
  ));
}

function buildRouteDetailRouteLineData(routeLines, fallbackRouteColor) {
  const lines = Array.isArray(routeLines)
    ? routeLines
    : [{ routeColor: fallbackRouteColor, routeGeometry: routeLines }];
  const features = lines.flatMap((routeLine) => {
    const routeGeometry = routeLine?.routeGeometry;
    if (routeGeometry?.type !== "LineString" || !Array.isArray(routeGeometry.coordinates)) {
      return [];
    }

    const coordinates = getValidRouteLineCoordinates(routeGeometry.coordinates);
    if (coordinates.length < 2) return [];

    return [{
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: { routeColor: routeLine.routeColor ?? fallbackRouteColor },
    }];
  });

  if (features.length === 0) return null;

  return {
    type: "FeatureCollection",
    features,
  };
}

function removeRouteDetailRouteLine(map) {
  if (map.getLayer?.(ROUTE_DETAIL_ROUTE_LAYER_ID)) {
    map.removeLayer(ROUTE_DETAIL_ROUTE_LAYER_ID);
  }
  if (map.getSource?.(ROUTE_DETAIL_ROUTE_SOURCE_ID)) {
    map.removeSource(ROUTE_DETAIL_ROUTE_SOURCE_ID);
  }
}

function isRouteDetailMapStyleReady(map) {
  if (!map) return false;
  if (typeof map.getStyle !== "function") return true;

  try {
    return Boolean(map.getStyle());
  } catch {
    return false;
  }
}

function softenRouteColor(routeColor) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(routeColor).trim());
  if (!match) return routeColor;

  const mix = (hex) => Math.round(Number.parseInt(hex, 16) * 0.66 + 255 * 0.34);
  const color = match[1];
  return `rgb(${mix(color.slice(0, 2))}, ${mix(color.slice(2, 4))}, ${mix(color.slice(4, 6))})`;
}

function syncRouteDetailRouteLine(map, routeLines, routeColor = "#e11900", options = {}) {
  if (!isRouteDetailMapStyleReady(map)) return false;

  const routeLineData = buildRouteDetailRouteLineData(routeLines, routeColor);
  if (!routeLineData) {
    removeRouteDetailRouteLine(map);
    return true;
  }

  const existingSource = map.getSource?.(ROUTE_DETAIL_ROUTE_SOURCE_ID);
  const routeLineOpacity = options.isTrackingReference ? 0.22 : 0.78;
  const routeLineWidth = 2.5;
  if (existingSource?.setData) {
    existingSource.setData(routeLineData);
  } else {
    map.addSource(ROUTE_DETAIL_ROUTE_SOURCE_ID, {
      type: "geojson",
      data: routeLineData,
    });
  }

  if (!map.getLayer?.(ROUTE_DETAIL_ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_DETAIL_ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_DETAIL_ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["coalesce", ["get", "routeColor"], routeColor],
        "line-opacity": routeLineOpacity,
        "line-width": routeLineWidth,
      },
    });
  } else {
    map.setPaintProperty?.(ROUTE_DETAIL_ROUTE_LAYER_ID, "line-color", ["coalesce", ["get", "routeColor"], routeColor]);
    map.setPaintProperty?.(ROUTE_DETAIL_ROUTE_LAYER_ID, "line-opacity", routeLineOpacity);
    map.setPaintProperty?.(ROUTE_DETAIL_ROUTE_LAYER_ID, "line-width", routeLineWidth);
  }
  return true;
}

function buildRouteDetailLiveTrackingData(trackingSnapshot) {
  return {
    type: "FeatureCollection",
    features: getRouteTrackingLineFeatures(trackingSnapshot),
  };
}

function getRouteDetailArrivalTimestamp(arrival) {
  const timestamp = Date.parse(arrival?.occurredAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function areRouteDetailArrivalsAtSameLocation(firstArrival, secondArrival) {
  const distanceMeters = calculateLngLatDistanceMeters(firstArrival.coordinates, secondArrival.coordinates);
  return distanceMeters != null && distanceMeters <= ROUTE_DETAIL_ARRIVAL_GROUP_DISTANCE_METERS;
}

function buildRouteDetailTrackingArrivalData(trackingSnapshot, routeStops) {
  const stopByDeliveryStopId = new Map((Array.isArray(routeStops) ? routeStops : []).flatMap((stop) => {
    const deliveryStopId = textOrUndefined(stop?.deliveryStopId ?? stop?.id);
    return deliveryStopId ? [[deliveryStopId, stop]] : [];
  }));
  const arrivalByDeliveryStopId = new Map();
  for (const arrival of Array.isArray(trackingSnapshot?.stopArrivals) ? trackingSnapshot.stopArrivals : []) {
    const coordinates = normalizeLngLat(arrival?.latitude, arrival?.longitude);
    const deliveryStopId = textOrUndefined(arrival?.deliveryStopId);
    if (!coordinates || !deliveryStopId || arrival?.positionSource === "unavailable") continue;
    const routeStop = stopByDeliveryStopId.get(deliveryStopId);
    const stopNumber = numberOrUndefined(arrival?.stopSequence ?? routeStop?.stop);
    if (!Number.isInteger(stopNumber) || stopNumber < 1) continue;

    const candidate = {
      arrivalEventCount: 1,
      coordinates,
      deliveryStopId,
      eventId: textOrUndefined(arrival?.eventId),
      occurredAt: textOrUndefined(arrival?.occurredAt),
      stopNumber,
    };
    const existing = arrivalByDeliveryStopId.get(deliveryStopId);
    if (!existing) {
      arrivalByDeliveryStopId.set(deliveryStopId, candidate);
      continue;
    }

    existing.arrivalEventCount += 1;
    if (getRouteDetailArrivalTimestamp(candidate) < getRouteDetailArrivalTimestamp(existing)) {
      candidate.arrivalEventCount = existing.arrivalEventCount;
      arrivalByDeliveryStopId.set(deliveryStopId, candidate);
    }
  }

  const arrivalGroups = [];
  for (const arrival of [...arrivalByDeliveryStopId.values()].sort((left, right) => (
    getRouteDetailArrivalTimestamp(left) - getRouteDetailArrivalTimestamp(right)
    || left.stopNumber - right.stopNumber
  ))) {
    const group = arrivalGroups.find((candidateGroup) => (
      candidateGroup.arrivals.every((candidate) => areRouteDetailArrivalsAtSameLocation(candidate, arrival))
    ));
    if (group) {
      group.arrivals.push(arrival);
    } else {
      arrivalGroups.push({ arrivals: [arrival] });
    }
  }

  const features = arrivalGroups.map((group) => {
    const arrivals = [...group.arrivals].sort((left, right) => left.stopNumber - right.stopNumber);
    const representativeArrival = [...arrivals].sort((left, right) => (
      getRouteDetailArrivalTimestamp(left) - getRouteDetailArrivalTimestamp(right)
      || left.stopNumber - right.stopNumber
    ))[0];
    const arrivalStopCount = arrivals.length;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: representativeArrival.coordinates },
      properties: {
        arrivalDetailsJson: JSON.stringify(arrivals.map((arrival) => ({
          occurredAt: arrival.occurredAt,
          stopNumber: arrival.stopNumber,
        }))),
        arrivalEventCount: arrivals.reduce((count, arrival) => count + arrival.arrivalEventCount, 0),
        arrivalStopCount,
        arrivalStopNumbers: arrivals.map((arrival) => arrival.stopNumber).join(", "),
        deliveryStopId: representativeArrival.deliveryStopId,
        displayLabel: String(arrivalStopCount > 1 ? arrivalStopCount : representativeArrival.stopNumber),
        eventId: representativeArrival.eventId,
        featureType: "stopArrival",
        occurredAt: representativeArrival.occurredAt,
        stopNumber: representativeArrival.stopNumber,
      },
    };
  });
  return { type: "FeatureCollection", features };
}

function getRouteDetailTrackingArrivalItems(feature) {
  const serializedItems = textOrUndefined(feature?.properties?.arrivalDetailsJson);
  if (!serializedItems) return [];

  try {
    const items = JSON.parse(serializedItems);
    if (!Array.isArray(items)) return [];
    return items.flatMap((item) => {
      const stopNumber = numberOrUndefined(item?.stopNumber);
      return Number.isInteger(stopNumber) && stopNumber > 0
        ? [{ occurredAt: textOrUndefined(item?.occurredAt) ?? null, stopNumber }]
        : [];
    });
  } catch {
    return [];
  }
}

function syncRouteDetailLiveTracking(map, trackingSnapshot, routeStops) {
  if (!isRouteDetailMapStyleReady(map)) return false;

  const data = buildRouteDetailLiveTrackingData(trackingSnapshot);
  const existingSource = map.getSource?.(ROUTE_DETAIL_TRACKING_SOURCE_ID);
  if (existingSource?.setData) {
    existingSource?.setData(data);
  } else {
    map.addSource(ROUTE_DETAIL_TRACKING_SOURCE_ID, { type: "geojson", data });
  }

  const beforeMarkerLayerId = map.getLayer?.(ROUTE_DETAIL_DEPARTURE_LAYER_ID)
    ? ROUTE_DETAIL_DEPARTURE_LAYER_ID
    : undefined;
  if (!map.getLayer?.(ROUTE_DETAIL_TRACKING_TRAIL_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_DETAIL_TRACKING_TRAIL_LAYER_ID,
      type: "line",
      source: ROUTE_DETAIL_TRACKING_SOURCE_ID,
      filter: ["==", ["get", "trackingType"], "trackingTrail"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#0b84d8",
        "line-dasharray": [1.5, 1.25],
        "line-opacity": 0.9,
        "line-width": 3.5,
      },
    }, beforeMarkerLayerId);
  }
  if (!map.getLayer?.(ROUTE_DETAIL_TRACKING_CONNECTOR_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_DETAIL_TRACKING_CONNECTOR_LAYER_ID,
      type: "line",
      source: ROUTE_DETAIL_TRACKING_SOURCE_ID,
      filter: ["==", ["get", "trackingType"], "trackingConnector"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#0b84d8",
        "line-dasharray": [1.5, 1.25],
        "line-opacity": 0.9,
        "line-width": 3.5,
      },
    }, beforeMarkerLayerId);
  }


  const arrivalData = buildRouteDetailTrackingArrivalData(trackingSnapshot, routeStops);
  const existingArrivalSource = map.getSource?.(ROUTE_DETAIL_TRACKING_ARRIVAL_SOURCE_ID);
  if (existingArrivalSource?.setData) {
    existingArrivalSource.setData(arrivalData);
  } else {
    map.addSource(ROUTE_DETAIL_TRACKING_ARRIVAL_SOURCE_ID, { type: "geojson", data: arrivalData });
  }
  if (!map.getLayer?.(ROUTE_DETAIL_TRACKING_ARRIVAL_CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_DETAIL_TRACKING_ARRIVAL_CIRCLE_LAYER_ID,
      type: "circle",
      source: ROUTE_DETAIL_TRACKING_ARRIVAL_SOURCE_ID,
      paint: {
        "circle-color": ["case", [">", ["get", "arrivalStopCount"], 1], "#0869a6", "#0b84d8"],
        "circle-radius": ["case", [">", ["get", "arrivalStopCount"], 1], 13, 11],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["case", [">", ["get", "arrivalStopCount"], 1], 3, 2],
      },
    });
  }
  if (!map.getLayer?.(ROUTE_DETAIL_TRACKING_ARRIVAL_LABEL_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_DETAIL_TRACKING_ARRIVAL_LABEL_LAYER_ID,
      type: "symbol",
      source: ROUTE_DETAIL_TRACKING_ARRIVAL_SOURCE_ID,
      layout: {
        "text-allow-overlap": true,
        "text-field": ["get", "displayLabel"],
        "text-ignore-placement": true,
        "text-size": 11,
      },
      paint: { "text-color": "#ffffff" },
    });
  }

  syncRouteDetailTrackingVisibility(map, true);
  return true;
}

function syncRouteDetailTrackingVisibility(map, isTrackingView = false) {
  if (!isRouteDetailMapStyleReady(map)) return false;

  const visibility = isTrackingView ? "visible" : "none";
  for (const layerId of ROUTE_DETAIL_TRACKING_LAYER_IDS) {
    if (map.getLayer?.(layerId)) {
      map.setLayoutProperty?.(layerId, "visibility", visibility);
    }
  }
  return true;
}

function syncRouteDetailMapViewEmphasis(map, isTrackingView = false) {
  if (!isRouteDetailMapStyleReady(map)) return false;

  const stopOpacity = isTrackingView ? 0.42 : 1;
  const departureOpacity = isTrackingView ? 0.65 : 1;
  const stopPointOpacity = isTrackingView ? 0.3 : 1;
  if (map.getLayer?.(ROUTE_DETAIL_STOP_LAYER_ID)) {
    map.setPaintProperty?.(ROUTE_DETAIL_STOP_LAYER_ID, "icon-opacity", stopOpacity);
  }
  if (map.getLayer?.(ROUTE_DETAIL_DEPARTURE_LAYER_ID)) {
    map.setPaintProperty?.(ROUTE_DETAIL_DEPARTURE_LAYER_ID, "icon-opacity", departureOpacity);
  }
  if (map.getLayer?.(ROUTE_DETAIL_STOP_POINT_LAYER_ID)) {
    map.setPaintProperty?.(ROUTE_DETAIL_STOP_POINT_LAYER_ID, "circle-opacity", stopPointOpacity);
    map.setPaintProperty?.(ROUTE_DETAIL_STOP_POINT_LAYER_ID, "circle-stroke-opacity", stopPointOpacity);
  }
  return true;
}

function getRouteTrackingFitLocations(trackingSnapshot) {
  return getRouteTrackingFitCoordinates(trackingSnapshot).map((coordinates) => ({
    coordinates,
    hasCoordinates: true,
  }));
}

function removeRouteEditPolygon(map) {
  if (map.getLayer?.(ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID)) {
    map.removeLayer(ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID);
  }
  if (map.getLayer?.(ROUTE_DETAIL_POLYGON_LINE_LAYER_ID)) {
    map.removeLayer(ROUTE_DETAIL_POLYGON_LINE_LAYER_ID);
  }
  if (map.getLayer?.(ROUTE_DETAIL_POLYGON_FILL_LAYER_ID)) {
    map.removeLayer(ROUTE_DETAIL_POLYGON_FILL_LAYER_ID);
  }
  if (map.getSource?.(ROUTE_DETAIL_POLYGON_SOURCE_ID)) {
    map.removeSource(ROUTE_DETAIL_POLYGON_SOURCE_ID);
  }
}

function buildRouteEditPolygonData(points, isClosed) {
  const features = points.map((point, pointIndex) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: point,
    },
    properties: { pointIndex },
  }));

  if (points.length >= 2) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: isClosed ? [...points, points[0]] : points,
      },
      properties: {},
    });
  }
  if (isClosed && points.length >= 3) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[...points, points[0]]],
      },
      properties: {},
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function syncRouteEditPolygon(map, points, isClosed) {
  if (points.length === 0) {
    removeRouteEditPolygon(map);
    return true;
  }

  const data = buildRouteEditPolygonData(points, isClosed);
  const existingSource = map.getSource?.(ROUTE_DETAIL_POLYGON_SOURCE_ID);
  const didUpdateExistingSource = Boolean(existingSource?.setData);
  if (didUpdateExistingSource) {
    existingSource.setData(data);
  }

  const didHaveFillLayer = Boolean(map.getLayer?.(ROUTE_DETAIL_POLYGON_FILL_LAYER_ID));
  const didHaveLineLayer = Boolean(map.getLayer?.(ROUTE_DETAIL_POLYGON_LINE_LAYER_ID));
  const didHaveCornerLayer = Boolean(map.getLayer?.(ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID));
  if (!isRouteDetailMapStyleReady(map)) {
    return didUpdateExistingSource && didHaveFillLayer && didHaveLineLayer && didHaveCornerLayer;
  }

  if (!didUpdateExistingSource) {
    map.addSource(ROUTE_DETAIL_POLYGON_SOURCE_ID, {
      type: "geojson",
      data,
    });
  }

  if (!didHaveFillLayer) {
    map.addLayer({
      id: ROUTE_DETAIL_POLYGON_FILL_LAYER_ID,
      type: "fill",
      source: ROUTE_DETAIL_POLYGON_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": "#2563eb",
        "fill-opacity": 0.16,
      },
    });
  }
  if (!didHaveLineLayer) {
    map.addLayer({
      id: ROUTE_DETAIL_POLYGON_LINE_LAYER_ID,
      type: "line",
      source: ROUTE_DETAIL_POLYGON_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#1d4ed8",
        "line-opacity": 0.95,
        "line-width": 3,
      },
    });
  }
  if (!didHaveCornerLayer) {
    map.addLayer({
      id: ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID,
      type: "circle",
      source: ROUTE_DETAIL_POLYGON_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": "#ffffff",
        "circle-radius": 7,
        "circle-stroke-color": "#2563eb",
        "circle-stroke-width": 2,
      },
    });
  }

  return true;
}

function isLngLatInPolygon(point, polygon) {
  if (!Array.isArray(point) || polygon.length < 3) return false;

  let inside = false;
  const x = point[0];
  const y = point[1];
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previousIndex];
    const xi = currentPoint[0];
    const yi = currentPoint[1];
    const xj = previousPoint[0];
    const yj = previousPoint[1];
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function fitRouteDetailMap(map, maplibregl, locations, options = {}) {
  if (locations.length === 0) return;

  const duration = options.duration ?? 250;
  const maxZoom = options.maxZoom ?? 13;
  const singleZoom = options.singleZoom ?? 12;
  const padding = options.padding ?? {
    bottom: 104,
    left: 80,
    right: 80,
    top: 80,
  };

  if (locations.length === 1) {
    map.flyTo({ center: locations[0].coordinates, duration, essential: true, zoom: singleZoom });
    return;
  }

  const bounds = new maplibregl.LngLatBounds(
    locations[0].coordinates,
    locations[0].coordinates,
  );

  for (const location of locations.slice(1)) {
    bounds.extend(location.coordinates);
  }

  map.fitBounds(bounds, {
    duration,
    essential: true,
    maxZoom,
    padding,
  });
}

function findRouteStopPoint(stop, routeStopPoints) {
  if (!Array.isArray(routeStopPoints)) return null;

  return routeStopPoints.find((point) => (
    (point.deliveryStopId && stop.deliveryStopId && point.deliveryStopId === stop.deliveryStopId) ||
    point.shopifyOrderGid === stop.shopifyOrderGid
  )) ?? null;
}

function getRouteStopPointerCoordinates(stop, routeStopPoint) {
  if (stop.hasCoordinates) return stop.coordinates;

  return (
    normalizeLngLatPair(routeStopPoint?.inputCoordinates) ??
    normalizeLngLatPair(routeStopPoint?.snappedCoordinates)
  );
}

function buildRouteStopPointFitLocations(stop, routeStopPoint) {
  const locations = stop.hasCoordinates ? [{ coordinates: stop.coordinates }] : [];
  const snappedCoordinates = normalizeLngLatPair(routeStopPoint?.snappedCoordinates);

  if (
    snappedCoordinates &&
    !locations.some((location) => areLngLatPairsEqual(location.coordinates, snappedCoordinates))
  ) {
    locations.push({ coordinates: snappedCoordinates });
  }

  return locations;
}

function buildRouteStopPointMarker(stop, routeStopPoint) {
  const snappedCoordinates = normalizeLngLatPair(routeStopPoint?.snappedCoordinates);
  if (!snappedCoordinates) return null;

  if (stop.hasCoordinates) {
    const distanceMeters = calculateLngLatDistanceMeters(stop.coordinates, snappedCoordinates);
    if (distanceMeters != null && distanceMeters < ROUTE_STOP_POINT_MIN_DISTANCE_METERS) {
      return null;
    }
  }

  return {
    coordinates: snappedCoordinates,
    stop,
  };
}

function fitRouteStopAndSnappedPoint(map, maplibregl, stop, routeStopPoint) {
  if (!map || !maplibregl) return;

  const locations = buildRouteStopPointFitLocations(stop, routeStopPoint);
  fitRouteDetailMap(map, maplibregl, locations, {
    maxZoom: 12,
    singleZoom: 12,
  });
}

function getRouteStopDisplayColor(stop, routeColor, routeStopColorById) {
  if (isRouteStopCompleted(stop)) return ROUTE_DETAIL_COMPLETED_STOP_COLOR;
  return (
    routeStopColorById?.get(stop.id) ??
    routeStopColorById?.get(stop.deliveryStopId) ??
    routeStopColorById?.get(stop.orderId) ??
    stop.routeColor ??
    routeColor
  );
}

function isRouteStopCompleted(stop) {
  return [stop?.status, stop?.deliveryStatus, stop?.deliveryStopStatus, stop?.fulfillmentStatus]
    .some((status) => ["COMPLETED", "DELIVERED", "FULFILLED"].includes(String(status ?? "").toUpperCase()));
}

function getRouteStopMarkerKey(stop) {
  return [
    textOrUndefined(stop.routePlanId),
    textOrUndefined(stop.deliveryStopId),
    textOrUndefined(stop.shopifyOrderGid),
    textOrUndefined(stop.orderId),
    textOrUndefined(stop.id),
    stop.stop,
  ].filter(Boolean).join("|");
}

function getRouteDetailStopPinImageId(stop, routeColor) {
  const colorKey = String(routeColor).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `route-detail-stop-pin-${colorKey}-${stop.stop}`;
}

function ensureRouteDetailMarkerImages(map, departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById) {
  if (departureLocation?.hasCoordinates && !addMapPinImage(
    map,
    ROUTE_DETAIL_DEPARTURE_IMAGE_ID,
    createDepartureMarkerImageData(),
  )) {
    return false;
  }

  for (const stop of routeStops) {
    const routeStopPoint = findRouteStopPoint(stop, routeStopPoints);
    const markerCoordinates = getRouteStopPointerCoordinates(stop, routeStopPoint);
    if (!markerCoordinates) continue;

    const stopColor = getRouteStopDisplayColor(stop, routeColor, routeStopColorById);
    const imageData = createMapPinImageData(stopColor, {
      label: stop.stop,
      shadowBlur: stop.isPolygonSelected ? 8 : undefined,
      shadowColor: stop.isPolygonSelected ? "rgba(79, 124, 255, 0.95)" : undefined,
    });
    if (!addMapPinImage(map, getRouteDetailStopPinImageId(stop, stopColor), imageData)) {
      return false;
    }
  }

  return true;
}

function buildRouteDetailMarkerFeatureCollection(departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById) {
  const features = [];

  if (departureLocation?.hasCoordinates) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: departureLocation.coordinates,
      },
      properties: {
        featureType: "departure",
        pinImage: ROUTE_DETAIL_DEPARTURE_IMAGE_ID,
        sortKey: 2000,
      },
    });
  }

  for (const stop of routeStops) {
    const routeStopPoint = findRouteStopPoint(stop, routeStopPoints);
    const markerCoordinates = getRouteStopPointerCoordinates(stop, routeStopPoint);
    if (!markerCoordinates) continue;
    const stopColor = getRouteStopDisplayColor(stop, routeColor, routeStopColorById);

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: markerCoordinates,
      },
      properties: {
        featureType: "routeStop",
        orderId: stop.orderId ?? "",
        pinImage: getRouteDetailStopPinImageId(stop, stopColor),
        sortKey: stop.isPolygonSelected ? 3000 : 1000 - stop.stop,
        stopKey: getRouteStopMarkerKey(stop),
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function buildRouteDetailStopPointFeatureCollection(routeStops, routeStopPoints, routeColor, routeStopColorById) {
  return {
    type: "FeatureCollection",
    features: routeStops.flatMap((stop) => {
      const routeStopPoint = findRouteStopPoint(stop, routeStopPoints);
      const stopPointMarker = buildRouteStopPointMarker(stop, routeStopPoint);
      if (!stopPointMarker) return [];
      return [{
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: stopPointMarker.coordinates,
        },
        properties: {
          color: getRouteStopDisplayColor(stop, routeColor, routeStopColorById),
          stopKey: getRouteStopMarkerKey(stop),
        },
      }];
    }),
  };
}

function syncRouteDetailMapMarkerLayers(map, departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById = new Map(), onDiagnostics = null) {
  let markerData = null;
  let stopPointData = null;

  try {
    markerData = buildRouteDetailMarkerFeatureCollection(departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById);
    stopPointData = buildRouteDetailStopPointFeatureCollection(routeStops, routeStopPoints, routeColor, routeStopColorById);

    if (!isRouteDetailMapStyleReady(map)) {
      emitRouteDetailMarkerDiagnostics(onDiagnostics, {
        ...getRouteDetailMarkerLayerState(map),
        markerFeatureCount: markerData.features.length,
        phase: "style-not-ready",
        routeStopCount: routeStops.length,
        stopPointCount: routeStopPoints.length,
        stopPointFeatureCount: stopPointData.features.length,
      });
      return false;
    }

    if (!ensureRouteDetailMarkerImages(map, departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById)) {
      emitRouteDetailMarkerDiagnostics(onDiagnostics, {
        ...getRouteDetailMarkerLayerState(map),
        markerFeatureCount: markerData.features.length,
        phase: "image-registration-failed",
        routeStopCount: routeStops.length,
        stopPointCount: routeStopPoints.length,
        stopPointFeatureCount: stopPointData.features.length,
      });
      return false;
    }

    const existingMarkerSource = map.getSource?.(ROUTE_DETAIL_MARKER_SOURCE_ID);
    if (existingMarkerSource?.setData) {
      existingMarkerSource.setData(markerData);
    } else {
      map.addSource(ROUTE_DETAIL_MARKER_SOURCE_ID, {
        type: "geojson",
        data: markerData,
      });
    }

    if (!map.getLayer?.(ROUTE_DETAIL_DEPARTURE_LAYER_ID)) {
      map.addLayer(createMapPinSymbolLayer({
        id: ROUTE_DETAIL_DEPARTURE_LAYER_ID,
        iconSize: 1,
        source: ROUTE_DETAIL_MARKER_SOURCE_ID,
        iconImage: ["get", "pinImage"],
        sortKey: ["get", "sortKey"],
      }));
      map.setFilter?.(ROUTE_DETAIL_DEPARTURE_LAYER_ID, ["==", ["get", "featureType"], "departure"]);
    }

    if (!map.getLayer?.(ROUTE_DETAIL_STOP_LAYER_ID)) {
      map.addLayer(createMapPinSymbolLayer({
        id: ROUTE_DETAIL_STOP_LAYER_ID,
        source: ROUTE_DETAIL_MARKER_SOURCE_ID,
        iconImage: ["get", "pinImage"],
        sortKey: ["get", "sortKey"],
      }));
      map.setFilter?.(ROUTE_DETAIL_STOP_LAYER_ID, ["==", ["get", "featureType"], "routeStop"]);
    }

    const existingStopPointSource = map.getSource?.(ROUTE_DETAIL_STOP_POINT_SOURCE_ID);
    if (existingStopPointSource?.setData) {
      existingStopPointSource.setData(stopPointData);
    } else {
      map.addSource(ROUTE_DETAIL_STOP_POINT_SOURCE_ID, {
        type: "geojson",
        data: stopPointData,
      });
    }

    if (!map.getLayer?.(ROUTE_DETAIL_STOP_POINT_LAYER_ID)) {
      map.addLayer({
        id: ROUTE_DETAIL_STOP_POINT_LAYER_ID,
        minzoom: ROUTE_DETAIL_STOP_POINT_MIN_ZOOM,
        type: "circle",
        source: ROUTE_DETAIL_STOP_POINT_SOURCE_ID,
        paint: {
          "circle-color": ["coalesce", ["get", "color"], routeColor],
          "circle-radius": ROUTE_DETAIL_STOP_POINT_RADIUS,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ROUTE_DETAIL_STOP_POINT_STROKE_WIDTH,
        },
      });
    }
    map.moveLayer?.(ROUTE_DETAIL_STOP_POINT_LAYER_ID, ROUTE_DETAIL_DEPARTURE_LAYER_ID);

    emitRouteDetailMarkerDiagnostics(onDiagnostics, {
      ...getRouteDetailMarkerLayerState(map),
      markerFeatureCount: markerData.features.length,
      phase: "synced",
      routeStopCount: routeStops.length,
      stopPointCount: routeStopPoints.length,
      stopPointFeatureCount: stopPointData.features.length,
    });

    return true;
  } catch (error) {
    emitRouteDetailMarkerDiagnostics(onDiagnostics, {
      ...getRouteDetailMarkerLayerState(map),
      ...getRouteDetailMarkerError(error),
      markerFeatureCount: markerData?.features?.length ?? null,
      phase: "exception",
      routeStopCount: routeStops.length,
      stopPointCount: routeStopPoints.length,
      stopPointFeatureCount: stopPointData?.features?.length ?? null,
    });
    return false;
  }
}

function getRouteStopFromMapFeature(feature, routeStops) {
  const stopKey = textOrUndefined(feature?.properties?.stopKey);
  if (!stopKey) return null;

  return routeStops.find((stop) => getRouteStopMarkerKey(stop) === stopKey) ?? null;
}

export {
  buildRouteDetailLiveTrackingData,
  DEFAULT_CENTER,
  ROUTE_DETAIL_COMPLETED_STOP_COLOR,
  ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID,
  ROUTE_DETAIL_STOP_LAYER_ID,
  ROUTE_DETAIL_TRACKING_ARRIVAL_CIRCLE_LAYER_ID,
  ROUTE_DETAIL_TRACKING_ARRIVAL_LABEL_LAYER_ID,
  findRouteStopPoint,
  fitRouteDetailMap,
  fitRouteStopAndSnappedPoint,
  getRouteDetailPopupPanOffset,
  getRouteMapCenter,
  getRouteMapLocations,
  getRouteDetailTrackingArrivalItems,
  getRouteTrackingArrivalListMaxHeight,
  getRouteTrackingFitLocations,
  getRouteStopFromMapFeature,
  isLngLatInPolygon,
  normalizeLngLat,
  removeRouteEditPolygon,
  softenRouteColor,
  syncRouteDetailMapMarkerLayers,
  syncRouteDetailMapViewEmphasis,
  syncRouteDetailLiveTracking,
  syncRouteDetailRouteLine,
  syncRouteDetailTrackingVisibility,
  syncRouteEditPolygon,
};
