import assert from 'node:assert/strict';
import { setImmediate } from "node:timers";
import test from 'node:test';
import { parseOriginalObservationsQuery, validateOriginalObservationsPage, originalObservationFeatures, createOriginalObservationsSession } from '../app/features/delivery/route-original-observations.js';
import { envelope, observation, routeId, window } from './fixtures/original-observations.mjs';
const expected = { routePlanId: routeId, window, pages: [] };

test('bounded UTC window rejects invalid dates, repeated/unknown scope, offsets and over 24 hours', () => {
  assert.deepEqual(parseOriginalObservationsQuery(new URLSearchParams(window)), window);
  for (const query of [ { ...window, from: '2026-02-30T00:00:00Z' }, { ...window, from: '2026-11-01T06:00:00+02:00' }, { ...window, to: window.from }, { ...window, to: '2026-11-02T04:00:00.000001Z' }, { ...window, limit: 501 }, { ...window, tenant: 'foreign' } ]) assert.throws(() => parseOriginalObservationsQuery(new URLSearchParams(query)));
  const repeated = new URLSearchParams(window); repeated.append('from', window.from);
  assert.throws(() => parseOriginalObservationsQuery(repeated));
});

test('contract keeps quality omissions, zero accuracy, redaction, equal fixes and microseconds', () => {
  const observations = [observation(1), observation(2), observation(3, { coordinateStatus: 'MISSING', latitude: null, longitude: null, accuracyStatus: 'INVALID', accuracyMeters: null }), observation(4, { coordinateStatus: 'REDACTED', latitude: null, longitude: null, accuracyStatus: 'REDACTED', accuracyMeters: null })];
  const page = validateOriginalObservationsPage(envelope({ observations, page: { ...envelope().data.page, returned: 4, totalReturned: 4 } }), expected);
  assert.deepEqual(page.observations, observations);
  assert.equal(page.observations[0].observedAt, '2026-11-01T06:30:00.123456Z');
  const features = originalObservationFeatures(page.observations);
  assert.equal(features.features.length, 2);
  assert.ok(features.features.every(f => f.geometry.type === 'Point'));
  assert.notEqual(features.features[0].properties.eventId, features.features[1].properties.eventId);
});

test('rejects foreign route, derived geometry, malformed quality and exclusive-end observations', () => {
  for (const data of [ { routePlanId: '10000000-0000-4000-8000-000000000002' }, { source: 'OSRM' }, { scope: 'ALL_ASSIGNMENTS' }, { observations: [observation(1, { accuracyMeters: null })] }, { observations: [observation(1, { observedAt: window.to })] }, { observations: [observation(1, { coordinateStatus: 'INVALID' })] }, { page: { ...envelope().data.page, totalReturned: 5001 } } ]) assert.throws(() => validateOriginalObservationsPage(envelope(data), expected));
});

test('paging binds window, limit, snapshot, cumulative count and chronological microsecond ties', () => {
  const pagingExpected = { ...expected, window: { ...window, limit: 1 } };
  const first = validateOriginalObservationsPage(envelope({ page: { ...envelope().data.page, limit: 1, hasMore: true, nextCursor: 'opaque-cursor' } }), pagingExpected);
  const next = envelope({ observations: [observation(2, { observedAt: '2026-11-01T06:30:00.123457Z' })], page: { ...envelope().data.page, limit: 1, totalReturned: 2 } });
  assert.equal(validateOriginalObservationsPage(next, { ...pagingExpected, pages: [first] }).page.totalReturned, 2);
  for (const mutate of [p => p.data.page.snapshotAt = '2026-11-03T00:00:01Z', p => p.data.window.from = '2026-11-01T00:00:00Z', p => p.data.page.limit = 500, p => p.data.page.totalReturned = 1, p => p.data.observations[0] = observation(1), p => p.data.observations[0].observedAt = '2026-11-01T06:30:00.123455Z']) {
    const payload = structuredClone(next); mutate(payload);
    assert.throws(() => validateOriginalObservationsPage(payload, { ...pagingExpected, pages: [first] }));
  }
});

const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
test('close/restart cancels token wait and stale network responses; each read gets fresh auth', async () => {
  const old = deferred(); const states = []; let calls = 0; let signal;
  const session = createOriginalObservationsSession({ routePlanId: routeId, getToken: async () => 'synthetic', fetch: async (url, options) => { calls++; signal = options.signal; assert.match(url, /original-observations/); assert.equal(options.headers.Authorization, 'Bearer synthetic'); return calls === 1 ? old.promise : Response.json(envelope()); }, onChange: s => states.push(s) });
  const first = session.start(window); await new Promise(r => setImmediate(r));
  const second = session.start(window); assert.equal(signal.aborted, true); await second;
  old.resolve(Response.json(envelope({ source: 'OSRM' }))); await first;
  assert.equal(states.at(-1).status, 'ready'); assert.equal(states.at(-1).pages.length, 1);
  const token = deferred(); let fetched = false;
  const waiting = createOriginalObservationsSession({ routePlanId: routeId, getToken: () => token.promise, fetch: () => { fetched = true; }, onChange() {} });
  const pending = waiting.start(window); waiting.dispose(); token.resolve('token'); await pending; assert.equal(fetched, false);
  session.dispose();
});

test('409/expired cursor clear old assignment pages, unavailable is never empty, timeout is actionable', async () => {
  for (const [status, code, expectedStatus] of [[409, 'ASSIGNMENT_CHANGED', 'restart'], [400, 'INVALID_CURSOR', 'restart'], [501, 'NOT_IMPLEMENTED', 'unavailable'], [404, 'NOT_FOUND', 'unavailable'], [401, 'UNAUTHORIZED', 'error'], [503, 'READ_TIMEOUT', 'error']]) {
    let state;
    const session = createOriginalObservationsSession({ routePlanId: routeId, getToken: async () => 'synthetic', fetch: async () => Response.json({ data: null, error: { code, message: 'not echoed' } }, { status }), onChange: value => state = value });
    await session.start(window); assert.equal(state.status, expectedStatus); assert.equal(state.pages.length, 0); session.dispose();
  }
});

test('empty and cap have explicit semantics; 5000 without an extra row is complete', () => {
  const empty = envelope({ observations: [], emptyReason: 'NO_ASSIGNED_DRIVER', page: { ...envelope().data.page, returned: 0, totalReturned: 0 } });
  assert.equal(validateOriginalObservationsPage(empty, expected).emptyReason, 'NO_ASSIGNED_DRIVER');
  assert.throws(() => validateOriginalObservationsPage(envelope({ page: { ...envelope().data.page, capReached: true } }), expected));
});

test('partial coordinate facts remain in the count without plotting a malformed pair', () => {
  const page = validateOriginalObservationsPage(envelope({ observations: [observation(1, { latitude: 43.7, longitude: null, coordinateStatus: 'MISSING' })] }), expected);
  assert.equal(page.observations[0].latitude, 43.7);
  assert.equal(originalObservationFeatures(page.observations).features.length, 0);
});

test('full traversal stops at the 5000 cap and distinguishes exactly 5000 complete records', async () => {
  for (const extra of [true, false]) {
    let state; let calls = 0;
    const session = createOriginalObservationsSession({ routePlanId: routeId, getToken: async () => 'synthetic', fetch: async url => {
      calls++; const offset = Number(new URL(url, 'https://app.local').searchParams.get('cursor') ?? 0);
      const totalReturned = offset + 200; const hasMore = totalReturned < 5000;
      return Response.json(envelope({ observations: Array.from({ length: 200 }, (_, index) => observation(offset + index + 1)), page: { ...envelope().data.page, returned: 200, hasMore, nextCursor: hasMore ? String(totalReturned) : null, totalReturned, capReached: totalReturned === 5000 && extra } }));
    }, onChange: value => state = value });
    await session.start(window); for (let index = 1; index < 25; index++) await session.next(); await session.next();
    assert.equal(calls, 25); assert.equal(state.status, 'ready'); assert.equal(state.pages.at(-1).page.capReached, extra); assert.equal(state.pages.flatMap(page => page.observations).length, 5000); session.dispose();
  }
});

test('assignment/cursor failure after a loaded page clears points, cancel blocks late pages, token timeout completes', async () => {
  for (const status of [409, 400]) {
    let state; let calls = 0;
    const session = createOriginalObservationsSession({ routePlanId: routeId, getToken: async () => 'synthetic', fetch: async () => ++calls === 1 ? Response.json(envelope({ page: { ...envelope().data.page, limit: 1, hasMore: true, nextCursor: 'opaque' } })) : Response.json({ data: null, error: { code: status === 409 ? 'ASSIGNMENT_CHANGED' : 'INVALID_CURSOR' } }, { status }), onChange: value => state = value });
    await session.start({ ...window, limit: 1 }); assert.equal(state.pages.length, 1); await session.next(); assert.equal(state.status, 'restart'); assert.equal(state.pages.length, 0); session.dispose();
  }
  let state; const token = deferred();
  const timeout = createOriginalObservationsSession({ routePlanId: routeId, timeoutMs: 5, getToken: () => token.promise, onChange: value => state = value, fetch: () => assert.fail('timed-out token must not fetch') });
  await timeout.start(window); assert.equal(state.status, 'error'); assert.match(state.message, /timed out/); timeout.dispose(); token.resolve('late');
});


test('a transport that ignores abort still exits loading on timeout and cannot publish late data', async () => {
  const late = deferred(); let state;
  const session = createOriginalObservationsSession({ routePlanId: routeId, timeoutMs: 5, getToken: async () => 'synthetic', fetch: () => late.promise, onChange: value => state = value });
  const read = session.start(window);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(state.status, 'error');
  assert.match(state.message, /timed out/);
  late.resolve(Response.json(envelope())); await read;
  assert.equal(state.pages.length, 0); session.dispose();
});
