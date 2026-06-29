import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { fetchDeliveryDrivers } from "../features/delivery/drivers.server";
import { fetchDeliveryRouteGroupDetail } from "../features/delivery/route-groups.server";
import { fetchDeliveryRoutePlanDetail } from "../features/delivery/route-plans.server";
import { fetchShopifyDepartureLocation } from "../features/locations/shopify-locations.server";
import { authenticate } from "../shopify.server";
import RouteDetailPage, { action, cleanRoutePathParam } from "./app.routes.$routeId";

function textOrUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
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
  const childRoutePlanIds = [
    ...new Set(
      (routeGroupData.routeGroup?.children ?? [])
        .map((child) => textOrUndefined(child?.routePlanId ?? child?.routePlan?.id))
        .filter(Boolean),
    ),
  ];
  const childRouteDetailResults = await Promise.all(
    childRoutePlanIds.map((routePlanId) => fetchDeliveryRoutePlanDetail(request, routePlanId, { cacheKey })),
  );
  return {
    errors: [
      ...(routeGroupData.errors ?? []),
      ...(driverData.errors ?? []),
      ...childRouteDetailResults.flatMap((detail) => detail.errors ?? []),
    ],
    childRouteDetails: childRouteDetailResults.map((detail) => ({
      routeGeometry: detail.routeGeometry,
      routeMetrics: detail.routeMetrics ?? null,
      routePlan: detail.routePlan,
      routePlanId: detail.routePlan?.id,
      routeStopPoints: detail.routeStopPoints ?? [],
      stops: detail.stops ?? [],
    })),
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

export { action };
export default RouteDetailPage;

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
