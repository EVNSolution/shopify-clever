import { addMapPinImage, createDepartureMarkerImageData, createMapPinImageData, createMapPinSymbolLayer } from "../maps/map-markers";
import { numberOrUndefined, textOrUndefined } from "./route-helpers";

const DEFAULT_CENTER = [-79.3832, 43.6532];
const ROUTE_DETAIL_ROUTE_SOURCE_ID = "route-detail-osrm-route";
const ROUTE_DETAIL_ROUTE_LAYER_ID = "route-detail-osrm-route-line";
const ROUTE_DETAIL_MARKER_SOURCE_ID = "route-detail-markers";
const ROUTE_DETAIL_DEPARTURE_LAYER_ID = "route-detail-departure-marker";
const ROUTE_DETAIL_STOP_LAYER_ID = "route-detail-stop-markers";
const ROUTE_DETAIL_STOP_POINT_SOURCE_ID = "route-detail-snapped-stop-points";
const ROUTE_DETAIL_STOP_POINT_LAYER_ID = "route-detail-snapped-stop-points";
const ROUTE_DETAIL_DEPARTURE_IMAGE_ID = "route-detail-departure-pin";
const ROUTE_DETAIL_POLYGON_SOURCE_ID = "route-detail-edit-polygon";
const ROUTE_DETAIL_POLYGON_FILL_LAYER_ID = "route-detail-edit-polygon-fill";
const ROUTE_DETAIL_POLYGON_LINE_LAYER_ID = "route-detail-edit-polygon-line";
const ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID = "route-detail-edit-polygon-corners";
const ROUTE_STOP_POINT_MIN_DISTANCE_METERS = 1;

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
  if (typeof map?.isStyleLoaded !== "function") return true;

  try {
    return map.isStyleLoaded();
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

function syncRouteDetailRouteLine(map, routeLines, routeColor = "#e11900") {
  if (!isRouteDetailMapStyleReady(map)) return false;

  const routeLineData = buildRouteDetailRouteLineData(routeLines, routeColor);
  if (!routeLineData) {
    removeRouteDetailRouteLine(map);
    return true;
  }

  const existingSource = map.getSource?.(ROUTE_DETAIL_ROUTE_SOURCE_ID);
  if (existingSource?.setData) {
    existingSource.setData(routeLineData);
    if (map.getLayer?.(ROUTE_DETAIL_ROUTE_LAYER_ID)) {
      map.setPaintProperty?.(ROUTE_DETAIL_ROUTE_LAYER_ID, "line-color", ["coalesce", ["get", "routeColor"], routeColor]);
    }
    return true;
  }

  map.addSource(ROUTE_DETAIL_ROUTE_SOURCE_ID, {
    type: "geojson",
    data: routeLineData,
  });
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
      "line-opacity": 0.78,
      "line-width": 2.5,
    },
  });
  return true;
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
    maxZoom: 8,
    singleZoom: 8,
  });
}

function getRouteStopDisplayColor(stop, routeColor, routeStopColorById) {
  return (
    routeStopColorById?.get(stop.id) ??
    routeStopColorById?.get(stop.deliveryStopId) ??
    routeStopColorById?.get(stop.orderId) ??
    stop.routeColor ??
    routeColor
  );
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

function syncRouteDetailMapMarkerLayers(map, departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById = new Map()) {
  if (!isRouteDetailMapStyleReady(map)) return false;
  if (!ensureRouteDetailMarkerImages(map, departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById)) return false;

  const markerData = buildRouteDetailMarkerFeatureCollection(departureLocation, routeStops, routeStopPoints, routeColor, routeStopColorById);
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

  const stopPointData = buildRouteDetailStopPointFeatureCollection(routeStops, routeStopPoints, routeColor, routeStopColorById);
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
      type: "circle",
      source: ROUTE_DETAIL_STOP_POINT_SOURCE_ID,
      paint: {
        "circle-color": ["coalesce", ["get", "color"], routeColor],
        "circle-radius": 4,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }

  return true;
}

function getRouteStopFromMapFeature(feature, routeStops) {
  const stopKey = textOrUndefined(feature?.properties?.stopKey);
  if (!stopKey) return null;

  return routeStops.find((stop) => getRouteStopMarkerKey(stop) === stopKey) ?? null;
}

export {
  DEFAULT_CENTER,
  ROUTE_DETAIL_POLYGON_CORNER_LAYER_ID,
  ROUTE_DETAIL_STOP_LAYER_ID,
  findRouteStopPoint,
  fitRouteDetailMap,
  fitRouteStopAndSnappedPoint,
  getRouteMapCenter,
  getRouteMapLocations,
  getRouteStopFromMapFeature,
  isLngLatInPolygon,
  normalizeLngLat,
  removeRouteEditPolygon,
  softenRouteColor,
  syncRouteDetailMapMarkerLayers,
  syncRouteDetailRouteLine,
  syncRouteEditPolygon,
};
