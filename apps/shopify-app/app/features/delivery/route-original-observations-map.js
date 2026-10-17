import { ORIGINAL_OBSERVATION_LAYER_ID, ORIGINAL_OBSERVATION_SOURCE_ID, ORIGINAL_OBSERVATION_START_LABEL_LAYER_ID, ORIGINAL_OBSERVATION_START_LAYER_ID, originalObservationFeatures } from './route-original-observations.js';
import { addRouteStartLayers, buildRouteStartFeature, isRouteDetailMapStyleReady, syncRouteDetailLineOrder, syncRouteDetailTrackingVisibility } from './route-detail-map.js';
export { ORIGINAL_OBSERVATION_LAYER_ID };

// start: the tracking snapshot's executionEvidence.start. Points before it are grey, the Start press is the green point.
export function syncOriginalObservationPoints(map, observations, start = null, timeZone) {
  // Not isStyleLoaded(): it is false while tiles load, which left the points undrawn on the real map.
  if (!isRouteDetailMapStyleReady(map)) return false;
  const data = originalObservationFeatures(observations, start?.occurredAt);
  const startFeature = buildRouteStartFeature(start, observations.filter(item => item.coordinateStatus === 'VALID').map(item => ({ coordinates: [item.longitude, item.latitude], occurredAt: item.observedAt })), timeZone);
  if (startFeature) data.features.push(startFeature);
  const source = map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID);
  if (source) source.setData(data);
  else map.addSource(ORIGINAL_OBSERVATION_SOURCE_ID, { type: 'geojson', data });
  if (!map.getLayer(ORIGINAL_OBSERVATION_LAYER_ID)) {
    map.addLayer({ id: ORIGINAL_OBSERVATION_LAYER_ID, type: 'circle', source: ORIGINAL_OBSERVATION_SOURCE_ID, filter: ['has', 'eventId'], paint: { 'circle-color': ['case', ['==', ['get', 'beforeStart'], true], '#8c9196', '#d32f2f'], 'circle-radius': 4, 'circle-opacity': 0.9, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
    addRouteStartLayers(map, ORIGINAL_OBSERVATION_SOURCE_ID, ORIGINAL_OBSERVATION_START_LAYER_ID, ORIGINAL_OBSERVATION_START_LABEL_LAYER_ID);
    // Above the plan and below the pins, the Start point on top; later marker syncs keep this order through syncRouteDetailLineOrder.
    syncRouteDetailLineOrder(map);
  }
  syncRouteDetailTrackingVisibility(map, true);
  return true;
}

export function removeOriginalObservationPoints(map) {
  if (!isRouteDetailMapStyleReady(map)) return;
  for (const id of [ORIGINAL_OBSERVATION_START_LABEL_LAYER_ID, ORIGINAL_OBSERVATION_START_LAYER_ID, ORIGINAL_OBSERVATION_LAYER_ID]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID)) map.removeSource(ORIGINAL_OBSERVATION_SOURCE_ID);
  syncRouteDetailTrackingVisibility(map, true);
}
