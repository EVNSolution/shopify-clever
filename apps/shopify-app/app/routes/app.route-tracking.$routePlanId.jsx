import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { proxyDeliveryRouteTrackingStream } from "../features/delivery/route-tracking.server";

export const loader = async ({ request, params }) => {
  await authenticate.admin(request);
  return proxyDeliveryRouteTrackingStream(request, params.routePlanId);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
