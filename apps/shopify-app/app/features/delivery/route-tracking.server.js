import {
  getCleverAppId,
  getDeliveryApiBaseUrl,
  getShopifySessionBearer,
} from "./route-plans.server.js";
import { createTelemetryRequestId } from "../telemetry/structured-telemetry.server.js";

const CLIENT_REQUEST_ID_HEADER = "x-clever-client-request-id";
const SAFE_CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/u;

function trackingProxyError(message, status) {
  return new Response(message, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function proxyDeliveryRouteTrackingStream(request, routePlanId, options = {}) {
  const safeRoutePlanId = String(routePlanId ?? "").trim();
  if (!safeRoutePlanId) return trackingProxyError("Route plan ID is required.", 400);

  const authorization = getShopifySessionBearer(request);
  if (!authorization) return trackingProxyError("Shopify session token is required.", 401);

  const baseUrl = options.baseUrl ?? getDeliveryApiBaseUrl();
  const encodedRoutePlanId = encodeURIComponent(safeRoutePlanId);
  const clientRequestId = resolveClientRequestId(request, options.correlationId);
  const fetchImpl = options.fetch ?? fetch;
  const upstreamResponse = await fetchImpl(
    `${baseUrl}/admin/route-plans/${encodedRoutePlanId}/tracking/stream`,
    {
      headers: {
        accept: "text/event-stream",
        authorization,
        [CLIENT_REQUEST_ID_HEADER]: clientRequestId,
        "x-clever-app-id": options.appId ?? getCleverAppId(),
      },
      cache: "no-store",
      signal: request.signal,
    },
  );

  const contentType = upstreamResponse.headers.get("content-type") ?? "text/event-stream; charset=utf-8";
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: {
      "cache-control": "no-store, no-transform",
      "content-type": contentType,
      "x-accel-buffering": "no",
    },
  });
}

async function proxyDeliveryRouteTrackingSnapshot(request, routePlanId, options = {}) {
  const safeRoutePlanId = String(routePlanId ?? "").trim();
  if (!safeRoutePlanId) return trackingProxyError("Route plan ID is required.", 400);

  const authorization = getShopifySessionBearer(request);
  if (!authorization) return trackingProxyError("Shopify session token is required.", 401);

  const baseUrl = options.baseUrl ?? getDeliveryApiBaseUrl();
  const encodedRoutePlanId = encodeURIComponent(safeRoutePlanId);
  const clientRequestId = resolveClientRequestId(request, options.correlationId);
  const fetchImpl = options.fetch ?? fetch;
  const upstreamResponse = await fetchImpl(
    `${baseUrl}/admin/route-plans/${encodedRoutePlanId}/tracking`,
    {
      headers: {
        accept: "application/json",
        authorization,
        [CLIENT_REQUEST_ID_HEADER]: clientRequestId,
        "x-clever-app-id": options.appId ?? getCleverAppId(),
      },
      cache: "no-store",
      signal: request.signal,
    },
  );

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: {
      "cache-control": "no-store",
      "content-type": upstreamResponse.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}

function resolveClientRequestId(request, explicitRequestId) {
  return normalizeClientRequestId(explicitRequestId)
    ?? normalizeClientRequestId(request.headers.get(CLIENT_REQUEST_ID_HEADER))
    ?? createTelemetryRequestId();
}

function normalizeClientRequestId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!SAFE_CLIENT_REQUEST_ID_PATTERN.test(normalized)) return null;
  return normalized;
}

export { proxyDeliveryRouteTrackingSnapshot, proxyDeliveryRouteTrackingStream };
