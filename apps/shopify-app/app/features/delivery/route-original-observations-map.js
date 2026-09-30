import { ORIGINAL_OBSERVATION_SOURCE_ID, originalObservationFeatures } from './route-original-observations.js';
import { syncRouteDetailTrackingVisibility } from './route-detail-map.js';
export const ORIGINAL_OBSERVATION_LAYER_ID = 'route-detail-original-observation-points';

export function syncOriginalObservationPoints(map, observations) {
  if (!map?.isStyleLoaded?.()) return false;
  const data = originalObservationFeatures(observations);
  const source = map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID);
  if (source) source.setData(data);
  else map.addSource(ORIGINAL_OBSERVATION_SOURCE_ID, { type: 'geojson', data });
  if (!map.getLayer(ORIGINAL_OBSERVATION_LAYER_ID)) map.addLayer({ id: ORIGINAL_OBSERVATION_LAYER_ID, type: 'circle', source: ORIGINAL_OBSERVATION_SOURCE_ID, paint: { 'circle-color': '#d32f2f', 'circle-radius': 4, 'circle-opacity': 0.9, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } }, map.getLayer('route-detail-departure-marker') ? 'route-detail-departure-marker' : undefined);
  syncRouteDetailTrackingVisibility(map, true);
  return true;
}

export function removeOriginalObservationPoints(map) {
  if (!map?.isStyleLoaded?.()) return;
  if (map.getLayer(ORIGINAL_OBSERVATION_LAYER_ID)) map.removeLayer(ORIGINAL_OBSERVATION_LAYER_ID);
  if (map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID)) map.removeSource(ORIGINAL_OBSERVATION_SOURCE_ID);
  syncRouteDetailTrackingVisibility(map, true);
}
