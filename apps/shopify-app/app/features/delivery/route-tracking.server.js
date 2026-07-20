import {
  getCleverAppId,
  getDeliveryApiBaseUrl,
  getShopifySessionBearer,
} from "./route-plans.server.js";

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
  const fetchImpl = options.fetch ?? fetch;
  const upstreamResponse = await fetchImpl(
    `${baseUrl}/admin/route-plans/${safeRoutePlanId}/tracking/stream`,
    {
      headers: {
        accept: "text/event-stream",
        authorization,
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

export { proxyDeliveryRouteTrackingStream };
