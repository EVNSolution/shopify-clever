import assert from 'node:assert/strict';
import test from 'node:test';
import { syncOriginalObservationPoints, removeOriginalObservationPoints, ORIGINAL_OBSERVATION_LAYER_ID } from '../app/features/delivery/route-original-observations-map.js';
import { syncRouteDetailTrackingVisibility, syncRouteDetailLiveTracking } from '../app/features/delivery/route-detail-map.js';
import { ORIGINAL_OBSERVATION_SOURCE_ID } from '../app/features/delivery/route-original-observations.js';
import { observation } from './fixtures/original-observations.mjs';
function mapFixture() {
  const layers = new Map(['route-detail-live-tracking-trail', 'route-detail-live-tracking-connector', 'route-detail-live-driver-position', 'route-detail-departure-marker', 'route-detail-stop-markers', 'route-detail-osrm-route-line'].map(id => [id, { id, layout: { visibility: 'visible' } }]));
  const sources = new Map();
  return { layers, sources, isStyleLoaded: () => true, getLayer: id => layers.get(id), getSource: id => sources.get(id), addSource(id, source) { sources.set(id, { ...source, setData(data) { this.data = data; } }); }, addLayer(layer) { layers.set(layer.id, layer); }, removeLayer: id => layers.delete(id), removeSource: id => sources.delete(id), setLayoutProperty(id, key, value) { const layer = layers.get(id); layer.layout ??= {}; layer.layout[key] = value; }, moveLayer() {} };
}

test('same-map point mode hides processed GPS lines/position and restores them on exit', () => {
  const map = mapFixture(); const ordinaryLayers = ['route-detail-departure-marker', 'route-detail-stop-markers', 'route-detail-osrm-route-line'];
  const before = ordinaryLayers.map(id => structuredClone(map.getLayer(id)));
  syncOriginalObservationPoints(map, [observation(1), observation(2), observation(3, { coordinateStatus: 'MISSING', latitude: 43.7, longitude: null })]);
  assert.equal(map.getLayer(ORIGINAL_OBSERVATION_LAYER_ID).type, 'circle');
  assert.equal(map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID).data.features.length, 2);
  for (const id of ['route-detail-live-tracking-trail', 'route-detail-live-tracking-connector', 'route-detail-live-driver-position']) assert.equal(map.getLayer(id).layout.visibility, 'none');
  syncRouteDetailLiveTracking(map, { routePlanId: 'route', recentPositions: [] });
  assert.equal(map.getLayer('route-detail-live-tracking-trail').layout.visibility, 'none', 'live updates cannot restore dotted track during point mode');
  assert.deepEqual(ordinaryLayers.map(id => map.getLayer(id)), before);
  removeOriginalObservationPoints(map);
  assert.equal(map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID), undefined);
  assert.equal(map.getLayer('route-detail-live-tracking-trail').layout.visibility, 'visible');
  syncRouteDetailTrackingVisibility(map, false);
  assert.equal(map.getLayer('route-detail-live-tracking-trail').layout.visibility, 'none');
});

test('repeat point toggles remove only owned source/layer and preserve duplicate fixes', () => {
  const map = mapFixture();
  for (let i = 0; i < 3; i++) { syncOriginalObservationPoints(map, [observation(1), observation(2)]); assert.equal(map.getSource(ORIGINAL_OBSERVATION_SOURCE_ID).data.features.length, 2); removeOriginalObservationPoints(map); }
  assert.equal(map.layers.size, 6); assert.equal(map.sources.size, 0);
});
