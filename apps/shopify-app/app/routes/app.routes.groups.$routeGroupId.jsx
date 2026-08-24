import { boundary } from "@shopify/shopify-app-react-router/server";

import { fetchDeliveryDrivers } from "../features/delivery/drivers.server";
import { fetchDeliveryRouteGroupDetail } from "../features/delivery/route-groups.server";
import { fetchShopifyDepartureLocation } from "../features/locations/shopify-locations.server";
import { authenticate } from "../shopify.server";
import { buildRouteGroupChildDetails, cleanRoutePathParam, routeDetailAction } from "../features/delivery/route-detail.server";
import { fetchRouteFallbackTimeZone, resolveRouteTimeZone } from "../features/delivery/route-timezone.server";
import RouteDetailPage from "./app.routes.$routeId";
import { AdminRouteErrorBoundary } from "../ui/admin-route-error-boundary";
import { logStructuredMetric } from "../features/telemetry/structured-telemetry.server";

function logRouteGroupApiSummary({ routeGroupData, departureLocationData, driverData }) {
  logStructuredMetric("route_group_detail.api.summary", {
    count: 3,
    errorCount:
      (routeGroupData.errors?.length ?? 0)
      + (departureLocationData.errors?.length ?? 0)
      + (driverData.errors?.length ?? 0),
    routeGroupCount: routeGroupData.routeGroup ? 1 : 0,
  });
}

export const loader = async ({ params, request }) => {
  const { admin, session } = await authenticate.admin(request);
  const cacheKey = session?.shop;
  const routeGroupId = cleanRoutePathParam(params.routeGroupId);
  const [routeGroupData, departureLocationData, driverData, fallbackTimeZoneData] = await Promise.all([
    fetchDeliveryRouteGroupDetail(request, routeGroupId, { cacheKey }),
    fetchShopifyDepartureLocation(admin, { cacheKey }),
    fetchDeliveryDrivers(request, {}),
    fetchRouteFallbackTimeZone(admin, cacheKey),
  ]);
  const routeTimeZoneData = await resolveRouteTimeZone({
    departureLocation: departureLocationData.departureLocation,
    fallbackTimeZoneData,
    routePlan: null,
  });
  const childRouteDetails = buildRouteGroupChildDetails(routeGroupData.routeGroup);
  const errors = [
    ...(routeGroupData.errors ?? []),
    ...(driverData.errors ?? []),
    ...(routeTimeZoneData.errors ?? []),
  ];
  logRouteGroupApiSummary({ routeGroupData, departureLocationData, driverData });
  return {
    errors,
    childRouteDetails,
    currentDepartureLocation: departureLocationData.departureLocation,
    drivers: driverData.drivers,
    ianaTimezone: routeTimeZoneData.ianaTimezone,
    routeDetailTitleOverride: routeGroupData.routeGroup?.name ?? null,
    routeGroup: routeGroupData.routeGroup,
    routeGeometry: null,
    routeMetrics: null,
    routePlan: null,
    routeStopPoints: [],
    stops: routeGroupData.routeGroup?.assignments ?? [],
    timezoneAbbreviation: routeTimeZoneData.timezoneAbbreviation,
    timezoneSource: routeTimeZoneData.timezoneSource,
  };
};

export const action = routeDetailAction;
export default RouteDetailPage;

export const ErrorBoundary = AdminRouteErrorBoundary;

export const headers = (headersArgs) => boundary.headers(headersArgs);
