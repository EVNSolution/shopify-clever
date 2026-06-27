import { redirect, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { fetchDeliveryRouteGroupDetail } from "../features/delivery/route-groups.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ params, request }) => {
  const { session } = await authenticate.admin(request);
  const result = await fetchDeliveryRouteGroupDetail(request, params.routeGroupId, {
    cacheKey: session?.shop,
  });
  const childRoutePlanId = result.routeGroup?.children?.find((child) => child?.routePlanId)?.routePlanId;

  return redirect(childRoutePlanId ? `/app/routes/${childRoutePlanId}` : "/app/routes");
};

export const action = () => redirect("/app/routes");

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
