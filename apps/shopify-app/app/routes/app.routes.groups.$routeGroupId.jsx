import { boundary } from "@shopify/shopify-app-react-router/server";

import { fetchDeliveryDrivers } from "../features/delivery/drivers.server";
import { fetchDeliveryOrders } from "../features/delivery/orders.server";
import { fetchDeliveryRouteGroupDetail } from "../features/delivery/route-groups.server";
import { fetchDeliveryRoutePlanDetail } from "../features/delivery/route-plans.server";
import { attachDeliveryOrderFieldsToRouteDetails, attachDeliveryOrderFieldsToStops, mergeCurrentChildDirectDetail } from "../features/delivery/route-detail-enrichment.server";
import { fetchShopifyDepartureLocation } from "../features/locations/shopify-locations.server";
import { authenticate } from "../shopify.server";
import { buildRouteGroupChildDetails, cleanRoutePathParam, routeDetailAction } from "../features/delivery/route-detail.server";
import { fetchRouteFallbackTimeZone, resolveRouteTimeZone } from "../features/delivery/route-timezone.server";
import RouteDetailPage from "./app.routes.$routeId";
import { AdminRouteErrorBoundary } from "../ui/admin-route-error-boundary";
import { logStructuredMetric } from "../features/telemetry/structured-telemetry.server";

function logRouteGroupApiSummary({ routeGroupData, departureLocationData, driverData, orderData, childRouteData }) {
  logStructuredMetric("route_group_detail.api.summary", {
    count: 4 + childRouteData.length,
    errorCount:
      (routeGroupData.errors?.length ?? 0)
      + (departureLocationData.errors?.length ?? 0)
      + (driverData.errors?.length ?? 0)
      + (orderData.errors?.length ?? 0)
      + childRouteData.reduce((count, data) => count + (data.errors?.length ?? 0), 0),
    routeGroupCount: routeGroupData.routeGroup ? 1 : 0,
  });
}

export const loader = async ({ params, request }) => {
  const { admin, session } = await authenticate.admin(request);
  const cacheKey = session?.shop;
  const routeGroupId = cleanRoutePathParam(params.routeGroupId);
  const [routeGroupData, departureLocationData, driverData, orderData, fallbackTimeZoneData] = await Promise.all([
    fetchDeliveryRouteGroupDetail(request, routeGroupId, { cacheKey }),
    fetchShopifyDepartureLocation(admin, { cacheKey }),
    fetchDeliveryDrivers(request, {}),
    fetchDeliveryOrders(request, {}, { cacheKey }),
    fetchRouteFallbackTimeZone(admin, cacheKey),
  ]);
  const thinChildRouteDetails = attachDeliveryOrderFieldsToRouteDetails(
    buildRouteGroupChildDetails(routeGroupData.routeGroup),
    orderData.orders,
  );
  const childRouteData = await Promise.all(thinChildRouteDetails.map(async ({ routePlanId }) => ({
    routePlanId,
    ...await fetchDeliveryRoutePlanDetail(request, routePlanId, { cacheKey }),
  })));
  const childRouteDetails = childRouteData.reduce((details, routePlanData) => {
    if (!routePlanData.routePlan && !routePlanData.stops?.length) return details;
    const directChildDetail = {
      routeGeometry: routePlanData.routeGeometry,
      routeMetrics: routePlanData.routeMetrics,
      routePlan: routePlanData.routePlan,
      routePlanId: routePlanData.routePlanId,
      routeStopPoints: routePlanData.routeStopPoints,
      stops: attachDeliveryOrderFieldsToStops(routePlanData.stops ?? [], orderData.orders),
    };
    return mergeCurrentChildDirectDetail(details, directChildDetail);
  }, thinChildRouteDetails);
  const routeTimeZoneData = await resolveRouteTimeZone({
    departureLocation: departureLocationData.departureLocation,
    fallbackTimeZoneData,
    routePlan: null,
  });
  const errors = [
    ...(routeGroupData.errors ?? []),
    ...(driverData.errors ?? []),
    ...(orderData.errors ?? []),
    ...childRouteData.flatMap((data) => data.errors ?? []),
    ...(routeTimeZoneData.errors ?? []),
  ];
  logRouteGroupApiSummary({ routeGroupData, departureLocationData, driverData, orderData, childRouteData });
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
