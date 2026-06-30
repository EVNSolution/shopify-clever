import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { cleanRoutePathParam, loadRoutePlanDetail, routeDetailAction } from "../features/delivery/route-detail.server";
import RouteDetailPage from "./app.routes.$routeId";

export const loader = async ({ params, request }) => loadRoutePlanDetail(
  request,
  cleanRoutePathParam(params.routeId),
  cleanRoutePathParam(params.routeGroupId),
);

export const action = routeDetailAction;
export default RouteDetailPage;

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
