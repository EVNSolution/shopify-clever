import { redirect, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

function getSafeShopifyReloadRedirect(request) {
  const url = new URL(request.url);
  const reload = url.searchParams.get("shopify-reload");
  if (!reload) return "/app/orders";

  try {
    const target = new URL(reload, url.origin);
    if (target.origin !== url.origin) return "/app/orders";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/app/orders";
  }
}

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return redirect(getSafeShopifyReloadRedirect(request));
};

export default function AuthRedirect() {
  return null;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
