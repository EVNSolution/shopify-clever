import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { fetchDeliveryDrivers } from "../features/delivery/drivers.server";
import { fetchDeliveryRouteGroupDetail } from "../features/delivery/route-groups.server";
import { fetchShopifyDepartureLocation } from "../features/locations/shopify-locations.server";
import { authenticate } from "../shopify.server";
import { buildRouteGroupChildDetails, cleanRoutePathParam, routeDetailAction } from "../features/delivery/route-detail.server";
import RouteDetailPage from "./app.routes.$routeId";

function shouldLogRouteGroupApiPayload(request) {
  const searchParams = new URL(request.url).searchParams;
  return searchParams.get("apiDebug") === "1" || searchParams.get("graphqlDebug") === "1";
}

function logRouteGroupApiPayload(request, routeGroup) {
  if (!shouldLogRouteGroupApiPayload(request)) return;
  console.info("route_group_detail.api", { routeGroup });
}

export const loader = async ({ params, request }) => {
  const { admin, session } = await authenticate.admin(request);
  const cacheKey = session?.shop;
  const routeGroupId = cleanRoutePathParam(params.routeGroupId);
  const [routeGroupData, departureLocationData, driverData] = await Promise.all([
    fetchDeliveryRouteGroupDetail(request, routeGroupId, { cacheKey }),
    fetchShopifyDepartureLocation(admin, { cacheKey }),
    fetchDeliveryDrivers(request, {}),
  ]);
  const childRouteDetails = buildRouteGroupChildDetails(routeGroupData.routeGroup);
  logRouteGroupApiPayload(request, routeGroupData.routeGroup);
  return {
    errors: [
      ...(routeGroupData.errors ?? []),
      ...(driverData.errors ?? []),
    ],
    childRouteDetails,
    currentDepartureLocation: departureLocationData.departureLocation,
    drivers: driverData.drivers,
    routeDetailTitleOverride: routeGroupData.routeGroup?.name ?? null,
    routeGroup: routeGroupData.routeGroup,
    routeGeometry: null,
    routeMetrics: null,
    routePlan: null,
    routeStopPoints: [],
    stops: routeGroupData.routeGroup?.assignments ?? [],
  };
};

export const action = routeDetailAction;
export default RouteDetailPage;

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
