import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { fetchDeliveryDrivers } from "../features/delivery/drivers.server";
import { fetchDeliveryRouteGroupDetail } from "../features/delivery/route-groups.server";
import { fetchShopifyDepartureLocation } from "../features/locations/shopify-locations.server";
import { authenticate } from "../shopify.server";
import { buildRouteGroupChildDetails, cleanRoutePathParam, routeDetailAction } from "../features/delivery/route-detail.server";
import RouteDetailPage from "./app.routes.$routeId";

function logRouteGroupApiPayload(payload) {
  const data = {
    measuredAt: new Date().toISOString(),
    ...payload,
  };

  try {
    console.info("route_group_detail.api.raw", JSON.stringify(data, null, 2));
  } catch {
    console.info("route_group_detail.api.raw", data);
  }
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
  const errors = [
    ...(routeGroupData.errors ?? []),
    ...(driverData.errors ?? []),
  ];
  logRouteGroupApiPayload({ routeGroupData, departureLocationData, driverData });
  return {
    errors,
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
