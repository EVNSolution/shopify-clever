const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUALITY = new Set(['VALID', 'MISSING', 'INVALID', 'REDACTED']);
const MAX_WINDOW_MICROS = 86_400_000_000n;
export const ORIGINAL_OBSERVATION_SOURCE_ID = "route-detail-original-observations";
export const ORIGINAL_OBSERVATION_LAYER_ID = "route-detail-original-observation-points";
export const ORIGINAL_OBSERVATIONS_LIMIT = 200;
export const ORIGINAL_OBSERVATIONS_CAP = 5000;

export function originalObservationInstant(value) {
  if (typeof value !== 'string') throw new Error('Invalid UTC instant.');
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/);
  if (!match) throw new Error('Invalid UTC instant.');
  const milliseconds = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 19) !== match[1]) throw new Error('Invalid UTC instant.');
  const fraction = (match[2] ?? '').padEnd(6, '0');
  return { key: `${match[1]}.${fraction}Z`, micros: globalThis.BigInt(milliseconds) * 1000n + globalThis.BigInt(fraction) };
}

export function isOriginalObservationRouteId(value) {
  return typeof value === 'string' && UUID.test(value);
}

export function parseOriginalObservationsQuery(params) {
  const allowed = new Set(['from', 'to', 'limit', 'cursor']);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new Error('Invalid query.');
  }
  const from = params.get('from');
  const to = params.get('to');
  const span = originalObservationInstant(to).micros - originalObservationInstant(from).micros;
  if (span <= 0n || span > MAX_WINDOW_MICROS) throw new Error('Choose a UTC window greater than zero and at most 24 hours.');
  const limitText = params.get('limit') ?? String(ORIGINAL_OBSERVATIONS_LIMIT);
  if (!/^[1-9]\d*$/.test(limitText) || Number(limitText) > 500) throw new Error('Invalid page limit.');
  const cursor = params.get('cursor');
  if (cursor !== null && (!cursor || cursor.length > 2048)) throw new Error('Invalid cursor.');
  return { from, to, limit: Number(limitText), ...(cursor !== null ? { cursor } : {}) };
}

function ensure(condition) {
  if (!condition) throw new Error('Original observation response does not match the requested contract.');
}
function sameInstant(a, b) {
  return originalObservationInstant(a).key === originalObservationInstant(b).key;
}
function tuple(observation) {
  return [originalObservationInstant(observation.observedAt).key, originalObservationInstant(observation.storedAt).key, observation.eventId.toLowerCase()].join('|');
}

export function validateOriginalObservationsPage(payload, { routePlanId, window, pages = [] }) {
  const data = payload?.data;
  ensure(payload?.error === null && data?.schemaVersion === 1 && data.routePlanId === routePlanId);
  ensure(data.source === 'DRIVER_EVENT_LOCATION_UPDATED' && data.scope === 'CURRENT_ASSIGNMENT');
  ensure(sameInstant(data.window?.from, window.from) && sameInstant(data.window?.to, window.to));
  const observations = data.observations;
  const page = data.page;
  const loaded = pages.reduce((count, item) => count + item.observations.length, 0);
  ensure(Array.isArray(observations) && observations.length <= window.limit);
  ensure(page?.limit === window.limit && page.returned === observations.length && page.pointCap === ORIGINAL_OBSERVATIONS_CAP);
  ensure(Number.isInteger(page.totalReturned) && page.totalReturned === loaded + observations.length && page.totalReturned <= ORIGINAL_OBSERVATIONS_CAP);
  ensure(typeof page.hasMore === 'boolean' && typeof page.capReached === 'boolean');
  ensure(page.hasMore ? typeof page.nextCursor === 'string' && page.nextCursor.length > 0 && page.nextCursor.length <= 2048 && page.totalReturned < ORIGINAL_OBSERVATIONS_CAP : page.nextCursor === null);
  ensure(!page.capReached || (page.totalReturned === ORIGINAL_OBSERVATIONS_CAP && !page.hasMore));
  originalObservationInstant(page.snapshotAt);
  if (pages.length) {
    ensure(pages.at(-1).page.hasMore && sameInstant(page.snapshotAt, pages[0].page.snapshotAt));
    ensure(!pages.some(item => page.nextCursor !== null && item.page.nextCursor === page.nextCursor));
  }
  ensure(observations.length ? data.emptyReason === null : ['NO_ASSIGNED_DRIVER', 'NO_OBSERVATIONS'].includes(data.emptyReason));
  ensure(!page.hasMore || observations.length === window.limit);
  const seen = new Set(pages.flatMap(item => item.observations.map(observation => observation.eventId)));
  let previous = pages.at(-1)?.observations.at(-1);
  const from = originalObservationInstant(window.from).key;
  const to = originalObservationInstant(window.to).key;
  for (const observation of observations) {
    ensure(isOriginalObservationRouteId(observation.eventId) && !seen.has(observation.eventId));
    seen.add(observation.eventId);
    const observedAt = originalObservationInstant(observation.observedAt).key;
    ensure(originalObservationInstant(observation.storedAt).key <= originalObservationInstant(page.snapshotAt).key);
    ensure(observedAt >= from && observedAt < to);
    ensure(QUALITY.has(observation.coordinateStatus) && QUALITY.has(observation.accuracyStatus));
    ensure(observation.latitude === null || (typeof observation.latitude === 'number' && Number.isFinite(observation.latitude) && Math.abs(observation.latitude) <= 90));
    ensure(observation.longitude === null || (typeof observation.longitude === 'number' && Number.isFinite(observation.longitude) && Math.abs(observation.longitude) <= 180));
    ensure(observation.coordinateStatus === 'VALID' ? observation.latitude !== null && observation.longitude !== null : observation.latitude === null || observation.longitude === null);
    ensure(observation.accuracyStatus === 'VALID' ? typeof observation.accuracyMeters === 'number' && Number.isFinite(observation.accuracyMeters) && observation.accuracyMeters >= 0 : observation.accuracyMeters === null);
    ensure(observation.clientEventKey === null || typeof observation.clientEventKey === 'string');
    if (observation.coordinateStatus === 'REDACTED' || observation.accuracyStatus === 'REDACTED') {
      ensure(observation.coordinateStatus === 'REDACTED' && observation.accuracyStatus === 'REDACTED' && observation.latitude === null && observation.longitude === null && observation.clientEventKey === null);
    }
    ensure(!previous || tuple(observation) > tuple(previous));
    previous = observation;
  }
  return data;
}

export function originalObservationFeatures(observations) {
  return { type: 'FeatureCollection', features: observations.filter(item => item.coordinateStatus === 'VALID').map(item => ({ type: 'Feature', properties: { eventId: item.eventId }, geometry: { type: 'Point', coordinates: [item.longitude, item.latitude] } })) };
}

function responseFailure(status, code) {
  if (status === 409 || code === 'INVALID_CURSOR') return { status: 'restart', message: status === 409 ? 'Assignment changed. Restart to read the current assignment; previous points have been cleared.' : 'The paging cursor expired or is no longer valid. Restart this window; previous points have been cleared.' };
  if ([404, 501].includes(status) || code === 'UPSTREAM_UNAVAILABLE') return { status: 'unavailable', message: 'Original observations are unavailable. The API may not be deployed or supported, or this route may no longer be accessible.' };
  if (status === 401) return { status: 'error', message: 'Administrator authentication expired. Close this view and reload the app.' };
  if (code === 'READ_TIMEOUT') return { status: 'error', message: 'The server read timed out. Choose a smaller UTC window and load again.' };
  return { status: 'error', message: 'Original observations could not be loaded. Retry or restart this window.' };
}

// Each map point mode owns one transient traversal. No storage, global cache or decoded cursor.
export function createOriginalObservationsSession({ routePlanId, getToken, fetch: fetchImpl = fetch, onChange, timeoutMs = 20_000 }) {
  let state = { status: 'idle', pages: [], message: null };
  let activeWindow = null;
  let generation = 0;
  let controller = null;
  let disposed = false;
  function publish(next) { state = next; if (!disposed) onChange(state); }
  function abort() { generation += 1; controller?.abort(); controller = null; }
  async function read(cursor) {
    const requestGeneration = ++generation;
    controller = new AbortController();
    const currentController = controller;
    const priorPages = state.pages;
    publish({ ...state, status: 'loading', message: null });
    const aborted = new Promise((_, reject) => currentController.signal.addEventListener('abort', () => reject(new Error('Aborted.')), { once: true }));
    const timer = setTimeout(() => currentController.abort(), timeoutMs);
    const current = () => !disposed && requestGeneration === generation;
    try {
      const token = await Promise.race([Promise.resolve().then(getToken), aborted]);
      if (!current() || currentController.signal.aborted) return;
      if (!token) throw new Error('Authentication unavailable.');
      const query = new URLSearchParams({ from: activeWindow.from, to: activeWindow.to, limit: String(activeWindow.limit), ...(cursor ? { cursor } : {}) });
      const response = await Promise.race([fetchImpl(`/app/route-original-observations/${encodeURIComponent(routePlanId)}?${query}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, cache: 'no-store', signal: currentController.signal }), aborted]);
      if (!current() || currentController.signal.aborted) return;
      const payload = await Promise.race([response.json().catch(() => null), aborted]);
      if (!current() || currentController.signal.aborted) return;
      if (!response.ok) {
        const failure = responseFailure(response.status, payload?.error?.code);
        const clear = ['restart', 'unavailable'].includes(failure.status) || response.status === 401;
        publish({ ...failure, pages: clear ? [] : priorPages });
        return;
      }
      let page;
      try { page = validateOriginalObservationsPage(payload, { routePlanId, window: activeWindow, pages: priorPages }); }
      catch { publish({ status: 'error', pages: [], message: 'The response does not match this route, window or original-observation contract. No points are displayed.' }); return; }
      publish({ status: page.observations.length || priorPages.length ? 'ready' : 'empty', pages: [...priorPages, page], message: null });
    } catch {
      if (current()) publish({ status: 'error', pages: priorPages, message: currentController.signal.aborted ? 'The request timed out. Retry or choose a smaller UTC window.' : 'Original observations could not be loaded. Retry or restart this window.' });
    } finally { clearTimeout(timer); if (current()) controller = null; }
  }
  return {
    getState: () => state,
    async start(window) {
      if (disposed) return;
      abort();
      try { activeWindow = parseOriginalObservationsQuery(new URLSearchParams(window)); if (!isOriginalObservationRouteId(routePlanId)) throw new Error('Invalid route.'); }
      catch { publish({ status: 'error', pages: [], message: 'Enter valid UTC from/to timestamps ending in Z, with a window greater than zero and at most 24 hours.' }); return; }
      publish({ status: 'idle', pages: [], message: null });
      await read(null);
    },
    async next() { if (!disposed && state.status !== 'loading' && state.pages.at(-1)?.page.hasMore) await read(state.pages.at(-1).page.nextCursor); },
    cancel() { if (!disposed) { abort(); publish({ ...state, status: state.pages.length ? 'ready' : 'idle', message: 'Request cancelled. Only previously loaded observations are shown.' }); } },
    dispose() { disposed = true; abort(); },
  };
}
