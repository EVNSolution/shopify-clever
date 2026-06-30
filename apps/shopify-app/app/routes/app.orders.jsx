import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import OrdersPage from "../features/orders/orders-page";

export { action, loader } from "../features/orders/orders-page.server";

export const links = () => [{ rel: "stylesheet", href: "/vendor/maplibre-gl.css" }];

export default OrdersPage;

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
