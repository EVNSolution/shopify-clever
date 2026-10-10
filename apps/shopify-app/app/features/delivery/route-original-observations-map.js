import { ORIGINAL_OBSERVATION_LAYER_ID, ORIGINAL_OBSERVATION_SOURCE_ID, originalObservationFeatures } from './route-original-observations.js';
import { isRouteDetailMapStyleReady, syncRouteDetailLineOrder, syncRouteDetailTrackingVisibility } from './route-detail-map.js';
export { ORIGINAL_OBSERVATION_LAYER_ID };

export function syncOriginalObservationPoints(map, observations) {
  // Not isStyleLoaded(): it is false while tiles load, which left the points undrawn on the real map.
  if (!isRouteDetailMapStyleReady(map)) return false;
  const data = originalObservationFeatures(observations);
  const source = map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID);
  if (source) source.setData(data);
  else map.addSource(ORIGINAL_OBSERVATION_SOURCE_ID, { type: 'geojson', data });
  if (!map.getLayer(ORIGINAL_OBSERVATION_LAYER_ID)) {
    map.addLayer({ id: ORIGINAL_OBSERVATION_LAYER_ID, type: 'circle', source: ORIGINAL_OBSERVATION_SOURCE_ID, paint: { 'circle-color': '#d32f2f', 'circle-radius': 4, 'circle-opacity': 0.9, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
    // Above the plan and below the pins; later marker syncs keep this order through syncRouteDetailLineOrder.
    syncRouteDetailLineOrder(map);
  }
  syncRouteDetailTrackingVisibility(map, true);
  return true;
}

export function removeOriginalObservationPoints(map) {
  if (!isRouteDetailMapStyleReady(map)) return;
  if (map.getLayer(ORIGINAL_OBSERVATION_LAYER_ID)) map.removeLayer(ORIGINAL_OBSERVATION_LAYER_ID);
  if (map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID)) map.removeSource(ORIGINAL_OBSERVATION_SOURCE_ID);
  syncRouteDetailTrackingVisibility(map, true);
}
