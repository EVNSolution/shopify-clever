import { authenticate } from "../shopify.server";
import {
  proxyDeliveryRouteTrackingSnapshot,
  proxyDeliveryRouteTrackingStream,
} from "../features/delivery/route-tracking.server";

export const loader = async ({ request, params }) => {
  await authenticate.admin(request);
  const mode = new URL(request.url).searchParams.get("mode");
  if (mode === "snapshot") return proxyDeliveryRouteTrackingSnapshot(request, params.routePlanId);
  return proxyDeliveryRouteTrackingStream(request, params.routePlanId);
};
