import { boundary } from "@shopify/shopify-app-react-router/server";

import { cleanRoutePathParam, loadRoutePlanDetail, routeDetailAction } from "../features/delivery/route-detail.server";
import RouteDetailPage from "./app.routes.$routeId";
import { AdminRouteErrorBoundary } from "../ui/admin-route-error-boundary";

export const loader = async ({ params, request }) => loadRoutePlanDetail(
  request,
  cleanRoutePathParam(params.routeId),
  cleanRoutePathParam(params.routeGroupId),
);

export const action = routeDetailAction;
export default RouteDetailPage;

export const ErrorBoundary = AdminRouteErrorBoundary;

export const headers = (headersArgs) => boundary.headers(headersArgs);
