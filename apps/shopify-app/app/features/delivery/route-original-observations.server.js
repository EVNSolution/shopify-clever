import { getCleverAppId, getDeliveryApiBaseUrl, getShopifySessionBearer } from './route-plans.server.js';
import { createTelemetryRequestId } from '../telemetry/structured-telemetry.server.js';
import { isOriginalObservationRouteId, parseOriginalObservationsQuery } from './route-original-observations.js';

const EMBEDDED_CONTEXT_KEYS = new Set(['host', 'shop', 'embedded', 'id_token', 'locale']);
function errorResponse(status, code, message) {
  return Response.json({ data: null, error: { code, message } }, { status, headers: { 'cache-control': 'no-store' } });
}

export async function proxyDeliveryOriginalObservations(request, routePlanId, options = {}) {
  if (!isOriginalObservationRouteId(routePlanId)) return errorResponse(400, 'INVALID_QUERY', 'Invalid route identifier.');
  const authorization = getShopifySessionBearer(request);
  if (!authorization) return errorResponse(401, 'UNAUTHORIZED', 'Administrator session required.');
  let query;
  try {
    const params = new URL(request.url).searchParams;
    // Embedded navigation context never chooses upstream tenant/app/driver scope.
    for (const key of EMBEDDED_CONTEXT_KEYS) params.delete(key);
    query = parseOriginalObservationsQuery(params);
  } catch { return errorResponse(400, 'INVALID_QUERY', 'Invalid original observation query.'); }
  try {
    const baseUrl = options.baseUrl ?? getDeliveryApiBaseUrl();
    const upstreamQuery = new URLSearchParams(query);
    const upstream = await (options.fetch ?? fetch)(`${baseUrl}/admin/route-plans/${encodeURIComponent(routePlanId)}/tracking/original-observations?${upstreamQuery}`, {
      headers: { accept: 'application/json', authorization, 'x-clever-app-id': options.appId ?? getCleverAppId(), 'x-clever-client-request-id': createTelemetryRequestId() },
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { 'cache-control': 'no-store', 'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8' } });
  } catch (error) {
    if (request.signal.aborted) throw error;
    return errorResponse(503, 'UPSTREAM_UNAVAILABLE', 'Original observations service is unavailable.');
  }
}
