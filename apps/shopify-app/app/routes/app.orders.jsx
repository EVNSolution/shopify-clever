import { boundary } from "@shopify/shopify-app-react-router/server";
import OrdersPage from "../features/orders/orders-page";
import { shouldRevalidateOrdersRoute } from "../features/orders/orders-page.shared";
import { AdminRouteErrorBoundary } from "../ui/admin-route-error-boundary";

export { action, loader } from "../features/orders/orders-page.server";

export default OrdersPage;

export function shouldRevalidate(args) {
  return shouldRevalidateOrdersRoute(args);
}

export const ErrorBoundary = AdminRouteErrorBoundary;

export const headers = (headersArgs) => {
  const headers = boundary.headers(headersArgs);
  const serverTiming = headersArgs.loaderHeaders?.get("Server-Timing");
  if (serverTiming) headers.set("Server-Timing", serverTiming);
  return headers;
};
