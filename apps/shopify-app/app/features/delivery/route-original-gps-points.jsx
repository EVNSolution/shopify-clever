/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createOriginalObservationsSession, parseOriginalObservationsQuery } from './route-original-observations.js';
import { formatGpsDiagnosticTimestamp, initialOriginalObservationsWindow } from './route-gps-diagnostics.js';
import { ORIGINAL_OBSERVATION_LAYER_ID, removeOriginalObservationPoints, syncOriginalObservationPoints } from './route-original-observations-map.js';

const buttonStyle = { minHeight: 36, padding: '4px 10px', border: '1px solid #b5b5b5', background: '#fff', borderRadius: 6, cursor: 'pointer' };
const smallStyle = { fontSize: 12, color: '#616161', overflowWrap: 'anywhere' };
const quality = { VALID: 'Valid', MISSING: 'Missing', INVALID: 'Invalid', REDACTED: 'Redacted' };

export function RouteOriginalGpsPoints({ routePlanId, serviceDate, timeZone, getToken, mapRef, mapReady, onClose, fetchObservations }) {
  const initialWindow = useMemo(() => initialOriginalObservationsWindow(serviceDate, timeZone), [serviceDate, timeZone]);
  const [draft, setDraft] = useState(initialWindow);
  const [window, setWindow] = useState(initialWindow);
  const [read, setRead] = useState({ status: 'loading', pages: [], message: null });
  const [validationError, setValidationError] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  // The pages follow one another up to the 5,000-point cap, so the map shows every point without clicking. Cancel stops it; Load more resumes it.
  const [autoLoad, setAutoLoad] = useState(true);
  const sessionRef = useRef(null);
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const observations = useMemo(() => read.pages.flatMap(page => page.observations), [read.pages]);
  const observationsRef = useRef(observations);
  observationsRef.current = observations;
  const selected = observations.find(item => item.eventId === selectedId);
  const page = read.pages[Math.min(pageIndex, read.pages.length - 1)];
  const lastPage = read.pages.at(-1);
  const validCount = observations.filter(item => item.coordinateStatus === 'VALID').length;

  useEffect(() => {
    const session = createOriginalObservationsSession({ routePlanId, getToken: () => tokenRef.current?.(), fetch: fetchObservations, onChange: setRead });
    sessionRef.current = session;
    session.start(initialWindow);
    return () => { session.dispose(); sessionRef.current = null; };
  }, [routePlanId, initialWindow, fetchObservations]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return undefined;
    const map = mapRef.current;
    const sync = () => syncOriginalObservationPoints(map, observationsRef.current);
    sync();
    const select = event => setSelectedId(event.features?.[0]?.properties?.eventId ?? '');
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    map.on('style.load', sync);
    map.on('click', ORIGINAL_OBSERVATION_LAYER_ID, select);
    map.on('mouseenter', ORIGINAL_OBSERVATION_LAYER_ID, enter);
    map.on('mouseleave', ORIGINAL_OBSERVATION_LAYER_ID, leave);
    return () => {
      map.off('style.load', sync);
      map.off('click', ORIGINAL_OBSERVATION_LAYER_ID, select);
      map.off('mouseenter', ORIGINAL_OBSERVATION_LAYER_ID, enter);
      map.off('mouseleave', ORIGINAL_OBSERVATION_LAYER_ID, leave);
      if (map.isStyleLoaded()) { leave(); removeOriginalObservationPoints(map); }
    };
  }, [mapReady, mapRef]);
  useEffect(() => { if (mapReady) syncOriginalObservationPoints(mapRef.current, observations); }, [mapReady, mapRef, observations]);

  useEffect(() => {
    if (autoLoad && read.status === 'ready' && lastPage?.page.hasMore) sessionRef.current?.next();
  }, [autoLoad, lastPage, read.status]);

  const restart = (nextWindow = window) => { setSelectedId(''); setPageIndex(0); setValidationError(null); setAutoLoad(true); sessionRef.current?.start(nextWindow); };
  const loadWindow = event => {
    event.preventDefault();
    try { const nextWindow = parseOriginalObservationsQuery(new URLSearchParams(draft)); setWindow(nextWindow); restart(nextWindow); }
    catch { setValidationError('Use UTC timestamps ending in Z and a window greater than zero and at most 24 hours.'); }
  };
  const nextPage = async () => { setAutoLoad(true); await sessionRef.current?.next(); const count = sessionRef.current?.getState().pages.length; if (count) setPageIndex(count - 1); };
  const empty = read.status === 'empty';
  return <section aria-label="Original GPS points" style={{ border: '1px solid #d2d5d8', borderRadius: 8, marginTop: 8, padding: '8px 12px', fontSize: 13 }}>
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <span role="status" aria-live="polite"><strong>Original GPS</strong> · {read.status === 'loading' ? (read.pages.length ? `${observations.length} loaded · loading more…` : 'Loading…') : read.status === 'unavailable' ? 'Unavailable' : empty ? lastPage?.emptyReason === 'NO_ASSIGNED_DRIVER' ? 'No assigned driver' : 'No observations' : read.pages.length ? `${observations.length} loaded · ${validCount} plotted` : read.status === 'idle' ? 'Cancelled' : read.status === 'restart' ? 'Restart required' : 'Could not load'}</span>
      {lastPage?.page.hasMore ? <button type="button" onClick={nextPage} disabled={read.status === 'loading'} style={buttonStyle}>Load more</button> : null}
      {read.status === 'loading' ? <button type="button" onClick={() => { setAutoLoad(false); sessionRef.current?.cancel(); }} style={buttonStyle}>Cancel</button> : ['error', 'restart', 'unavailable', 'idle'].includes(read.status) ? <button type="button" onClick={() => restart()} style={buttonStyle}>Restart</button> : null}
      <button type="button" onClick={onClose} style={{ ...buttonStyle, marginLeft: 'auto' }}>Back to dotted track</button>
    </div>
    {read.message ? <p role="status" style={{ margin: '6px 0' }}>{read.message}</p> : null}
    {lastPage?.page.capReached ? <p role="status" style={{ margin: '6px 0' }}>5,000-point cap reached. More observations exist; choose a smaller window.</p> : null}
    <details style={{ marginTop: 6 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12 }}>Time window & point details · current assignment only</summary>
      <p style={smallStyle}>[{formatGpsDiagnosticTimestamp(window.from, timeZone)} → {formatGpsDiagnosticTimestamp(window.to, timeZone)})<br />{window.from} → {window.to} · end excluded</p>
      <p style={smallStyle}>Up to 24 hours per window, {window.limit} observations per page, 5,000 per traversal. {lastPage?.page.hasMore ? 'More pages remain; loaded count is not a total.' : lastPage && !lastPage.page.capReached ? 'All retained observations in this window and current assignment are loaded.' : ''} Previous assignments are excluded. Missing, invalid and redacted observations are retained; only valid coordinate pairs are plotted. Equal fixes may overlap.</p>
      <form onSubmit={loadWindow} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
        <label style={{ flex: '1 1 230px' }}>From · inclusive UTC<input required value={draft.from} onChange={event => setDraft(value => ({ ...value, from: event.target.value }))} style={{ width: '100%', minHeight: 36, boxSizing: 'border-box', marginTop: 4 }} /></label>
        <label style={{ flex: '1 1 230px' }}>To · exclusive UTC<input required value={draft.to} onChange={event => setDraft(value => ({ ...value, to: event.target.value }))} style={{ width: '100%', minHeight: 36, boxSizing: 'border-box', marginTop: 4 }} /></label>
        <button type="submit" style={buttonStyle}>Load window</button>
      </form>
      {validationError ? <p role="alert">{validationError}</p> : null}
      <p style={smallStyle}>Default: fixed 24 hours from service-date midnight; daylight saving may shift the local end. This can differ from the processed track’s service-day plus next-day window. {lastPage ? `Storage cutoff: ${lastPage.page.snapshotAt}. Late storage, retention or redaction can affect coverage.` : ''}</p>
      {page?.observations.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ flex: '1 1 230px' }}>Select observation · page {pageIndex + 1} of {read.pages.length}<select aria-label="Select original GPS observation" value={page.observations.some(item => item.eventId === selectedId) ? selectedId : ''} onChange={event => setSelectedId(event.target.value)} style={{ display: 'block', width: '100%', minHeight: 36, marginTop: 4 }}><option value="">Choose a point</option>{page.observations.map((item, index) => <option key={item.eventId} value={item.eventId}>{pageIndex * window.limit + index + 1} · {item.observedAt} · {quality[item.coordinateStatus]}</option>)}</select></label>
        <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex(index => index - 1)} style={buttonStyle}>Previous page</button>
        <button type="button" disabled={pageIndex >= read.pages.length - 1} onClick={() => setPageIndex(index => index + 1)} style={buttonStyle}>Next loaded page</button>
      </div> : null}
    </details>
    {selected ? <aside aria-label="Selected original GPS observation" style={{ marginTop: 8, padding: 8, borderTop: '1px solid #ddd', overflowWrap: 'anywhere' }}>
      <button aria-label="Close point details" type="button" onClick={() => setSelectedId('')} style={{ ...buttonStyle, float: 'right' }}>×</button>
      <strong>GPS point · {quality[selected.coordinateStatus]}</strong><br />Coordinates: {selected.latitude ?? 'Not provided'}, {selected.longitude ?? 'Not provided'}<br />Accuracy: {selected.accuracyMeters === null ? quality[selected.accuracyStatus] : `${selected.accuracyMeters} m`}<br />Observed: {formatGpsDiagnosticTimestamp(selected.observedAt, timeZone)}<br /><code>{selected.observedAt}</code><br />Stored: {formatGpsDiagnosticTimestamp(selected.storedAt, timeZone)}<br /><code>{selected.storedAt}</code><br /><span style={smallStyle}>Observed time is client supplied. Event: {selected.eventId}<br />Client event key: {selected.clientEventKey ?? 'Not provided'}</span>
    </aside> : null}
  </section>;
}

export function renderGpsPointsIcon() {
  return <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="5" cy="5" r="2" /><circle cx="15" cy="8" r="2" /><circle cx="8" cy="15" r="2" /></svg>;
}
