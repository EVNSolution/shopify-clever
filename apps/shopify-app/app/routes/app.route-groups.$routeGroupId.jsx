import { redirect, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { cleanRoutePathParam } from "../features/delivery/route-detail.server";
import { routeGroupPath } from "../features/delivery/route-paths";

function getRedirectSearch(request) {
  const url = new URL(request.url);
  return `${url.search}${url.hash}`;
}

export const loader = async ({ params, request }) => redirect(
  `${routeGroupPath(cleanRoutePathParam(params.routeGroupId))}${getRedirectSearch(request)}`,
);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
