import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { proxyDeliveryOriginalObservations } from '../app/features/delivery/route-original-observations.server.js';
import { routeId, window, envelope } from './fixtures/original-observations.mjs';
function request(query = new URLSearchParams(window), authorization = 'Bearer synthetic-admin') { return new Request(`https://app.local/app/route-original-observations/${routeId}?${query}`, { headers: authorization ? { authorization, 'x-clever-app-id': 'foreign-app' } : {} }); }

test('proxy requires admin authentication resource, bearer and bounded authorized query', async () => {
  const source = readFileSync(new URL('../app/routes/app.route-original-observations.$routePlanId.jsx', import.meta.url), 'utf8');
  assert.match(source, /await authenticate\.admin\(request\)/);
  assert.doesNotMatch(source, /export default/);
  let calls = 0; const options = { baseUrl: 'https://delivery.local', appId: 'trusted-app', fetch: async () => { calls++; return Response.json(envelope()); } };
  assert.equal((await proxyDeliveryOriginalObservations(request(undefined, null), routeId, options)).status, 401);
  for (const extra of ['tenant=foreign', 'appId=foreign', 'driverId=foreign', `from=${window.from}`, 'limit=999']) assert.equal((await proxyDeliveryOriginalObservations(request(`${new URLSearchParams(window)}&${extra}`), routeId, options)).status, 400);
  assert.equal((await proxyDeliveryOriginalObservations(request(), '../foreign', options)).status, 400);
  assert.equal(calls, 0);
});

test('proxy keeps exact window/cursor and trusted app/bearer only, no cache or cookie forwarding', async () => {
  const query = new URLSearchParams(window); query.set('cursor', 'signed:opaque+/='); query.set('shop', 'embedded-shop'); query.set('host', 'embedded-host');
  const req = request(query); let received;
  const response = await proxyDeliveryOriginalObservations(req, routeId, { baseUrl: 'https://delivery.local', appId: 'trusted-app', fetch: async (url, options) => { received = { url, options }; return Response.json(envelope(), { headers: { 'set-cookie': 'not-forwarded', 'cache-control': 'public' } }); } });
  const url = new URL(received.url);
  assert.equal(url.pathname, `/admin/route-plans/${routeId}/tracking/original-observations`);
  assert.equal(url.searchParams.get('cursor'), 'signed:opaque+/='); assert.equal(url.searchParams.get('from'), window.from); assert.equal(url.searchParams.has('shop'), false);
  assert.equal(received.options.headers.authorization, 'Bearer synthetic-admin'); assert.equal(received.options.headers['x-clever-app-id'], 'trusted-app'); assert.equal(received.options.headers.cookie, undefined);
  assert.equal(received.options.cache, 'no-store'); assert.equal(received.options.signal.aborted, false);
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), envelope());
});

test('proxy retains API error codes, undeployed status and client cancellation', async () => {
  for (const [status, code] of [[409, 'ASSIGNMENT_CHANGED'], [400, 'INVALID_CURSOR'], [404, 'NOT_FOUND'], [501, 'NOT_IMPLEMENTED'], [503, 'READ_TIMEOUT']]) {
    const response = await proxyDeliveryOriginalObservations(request(), routeId, { baseUrl: 'https://delivery.local', appId: 'trusted', fetch: async () => Response.json({ data: null, error: { code, message: 'synthetic' } }, { status }) });
    assert.equal(response.status, status); assert.equal((await response.json()).error.code, code);
  }
  const controller = new AbortController(); const req = new Request(request(), { signal: controller.signal });
  await assert.rejects(proxyDeliveryOriginalObservations(req, routeId, { baseUrl: 'https://delivery.local', appId: 'trusted', fetch: async (_, options) => { controller.abort(); assert.equal(options.signal.aborted, true); throw new DOMException('Aborted', 'AbortError'); } }), { name: 'AbortError' });
});
