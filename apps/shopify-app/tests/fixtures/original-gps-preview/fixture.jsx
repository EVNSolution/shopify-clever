/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useSearchParams } from 'react-router';
import { RouteOriginalGpsPoints, renderGpsPointsIcon } from '../../../app/features/delivery/route-original-gps-points.jsx';
import { gpsDiagnosticSearchParams } from '../../../app/features/delivery/route-gps-diagnostics.js';
import { MapPanel, MapToolbar } from '../../../app/ui/map-panel.jsx';
import { routeId, envelope, observation } from '../original-observations.mjs';

import { createMapLibreMap } from '../../../app/features/maps/maplibre-map.js';
import { syncRouteDetailLiveTracking } from '../../../app/features/delivery/route-detail-map.js';

function Fixture() {
  const mapRef = useRef(null);
  const canvasRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (disposed) return;
      const map = createMapLibreMap(maplibregl, { container: canvasRef.current, style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#edf1ed' } }] }, center: [-79.399,43.7005], zoom: 16, attributionControl: false });
      mapRef.current = map;
      map.on('load', () => {
        map.addSource('planned', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.401,43.6998],[-79.399,43.701],[-79.397,43.7002]] } } });
        map.addLayer({ id: 'route-detail-osrm-route-line', type: 'line', source: 'planned', paint: { 'line-color': '#8a8a8a', 'line-width': 3 } });
        map.addSource('markers', { type: 'geojson', data: { type: 'FeatureCollection', features: [[-79.401,43.6998],[-79.397,43.7002]].map(coordinates => ({ type: 'Feature', geometry: { type: 'Point', coordinates } })) } });
        map.addLayer({ id: 'route-detail-stop-markers', type: 'circle', source: 'markers', paint: { 'circle-color': '#333', 'circle-radius': 8 } });
        syncRouteDetailLiveTracking(map, { routePlanId: routeId, recentPositions: Array.from({ length: 15 }, (_, i) => ({ latitude: 43.6998 + i*0.00008, longitude: -79.401 + i*0.00018, occurredAt: new Date(Date.parse('2026-11-01T04:00:00Z') + i*1000).toISOString() })) });
        setMapReady(true);
      });
    });
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState(params.get('fixture') ?? 'ready');
  const [route, setRoute] = useState(routeId);
  const [requests, setRequests] = useState(0);
  const fetchObservations = useMemo(() => async (url, options) => {
    setRequests(count => count + 1);
    const query = new URL(url, location.origin).searchParams;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, mode === 'slow' ? 30_000 : 300);
      options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
    const codes = { unavailable: [501, 'NOT_IMPLEMENTED'], error: [503, 'READ_TIMEOUT'], expired: [400, 'INVALID_CURSOR'], assignment: [409, 'ASSIGNMENT_CHANGED'] };
    const failure = codes[mode];
    if (failure && (!['expired', 'assignment'].includes(mode) || query.has('cursor'))) return Response.json({ data: null, error: { code: failure[1], message: 'Synthetic error' } }, { status: failure[0] });
    const from = query.get('from'); const to = query.get('to'); const start = Number(query.get('cursor') ?? 0);
    const empty = mode === 'empty' || mode === 'unassigned';
    const cap = mode === 'cap';
    const total = cap ? 5001 : 202;
    const count = empty ? 0 : Math.min(200, total - start, 5000 - start);
    const observations = Array.from({ length: count }, (_, index) => {
      const ordinal = start + index;
      const item = observation(ordinal + 1, { observedAt: new Date(Date.parse(from) + 60_000 + ordinal * 1000).toISOString(), storedAt: new Date(Date.parse(from) + 60_000 + ordinal * 1000 + 500).toISOString(), latitude: 43.70 + Math.floor(ordinal / 20) * 0.0001, longitude: -79.40 + ordinal % 20 * 0.0001, accuracyMeters: ordinal % 3 === 0 ? 0 : 7.5 });
      if (ordinal === 0) { item.observedAt = new Date(Date.parse(from) + 60_000).toISOString().replace('.000Z', '.123456Z'); item.latitude = 43.7; item.longitude = -79.4; }
      if (ordinal === 1) { item.latitude = 43.7; item.longitude = -79.4; }
      if (ordinal === 2) Object.assign(item, { coordinateStatus: 'MISSING', latitude: 43.7, longitude: null, accuracyStatus: 'MISSING', accuracyMeters: null });
      if (ordinal === 3) Object.assign(item, { coordinateStatus: 'INVALID', latitude: null, longitude: -79.4, accuracyStatus: 'INVALID', accuracyMeters: null });
      if (ordinal === 4) Object.assign(item, { coordinateStatus: 'REDACTED', latitude: null, longitude: null, accuracyStatus: 'REDACTED', accuracyMeters: null });
      return item;
    });
    const totalReturned = start + count;
    const capReached = cap && totalReturned === 5000;
    const hasMore = !empty && totalReturned < total && !capReached;
    const payload = envelope({ routePlanId: mode === 'foreign' ? '10000000-0000-4000-8000-000000000099' : route, window: { from, to }, observations, emptyReason: empty ? mode === 'unassigned' ? 'NO_ASSIGNED_DRIVER' : 'NO_OBSERVATIONS' : null, page: { limit: 200, returned: count, hasMore, nextCursor: hasMore ? String(totalReturned) : null, totalReturned, pointCap: 5000, capReached, snapshotAt: '2030-01-01T00:00:00.123456Z' } });
    return Response.json(payload);
  }, [mode, route]);
  return <main style={{ fontFamily: 'system-ui', padding: 12 }}>
    <p>Synthetic local UI fixture · offline map background · no customer data · requests {requests}</p>
    <label>Fixture state <select value={mode} onChange={event => setMode(event.target.value)}>{['ready', 'slow', 'unavailable', 'error', 'empty', 'unassigned', 'assignment', 'expired', 'foreign', 'cap'].map(value => <option key={value}>{value}</option>)}</select></label>{' '}
    <button type="button" onClick={() => setRoute(value => value === routeId ? '10000000-0000-4000-8000-000000000002' : routeId)}>Navigate route</button>
    <MapPanel ariaLabel="Synthetic route tracking map" canvasRef={canvasRef} frameStyle={{ height: 420, marginTop: 12 }} toolbar={<MapToolbar actions={[{ ariaLabel: 'Show original GPS points', pressed: params.get('gpsPoints') === 'raw', icon: renderGpsPointsIcon(), onClick: () => setParams(gpsDiagnosticSearchParams(params, params.get('gpsPoints') !== 'raw')) }]} />} />
    {params.get('gpsPoints') === 'raw' ? <RouteOriginalGpsPoints key={`${route}:${mode}`} routePlanId={route} mapRef={mapRef} mapReady={mapReady} timeZone="America/Toronto" serviceDate="2026-11-01" getToken={async () => 'synthetic-token'} fetchObservations={fetchObservations} onClose={() => setParams(gpsDiagnosticSearchParams(params, false), { replace: true })} /> : null}
  </main>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture /></BrowserRouter>);
