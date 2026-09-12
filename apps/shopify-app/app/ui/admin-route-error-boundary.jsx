import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLocation, useRouteError, useRouteLoaderData } from "react-router";

import { buildShopifyAdminReopenUrl } from "../features/shopify/admin-bounce-recovery";
import { getAdminRouteErrorPresentation } from "../features/shopify/admin-route-error";
import { hasEmbeddedShopifySearchParams } from "../features/shopify/app-bridge-bootstrap";
import { DEFAULT_LANGUAGE, normalizeLanguage } from "../i18n/i18n";
import { AdminRouteErrorPage } from "./admin-route-error-page";
import "./admin-route-error-page.css";

export function AdminRouteErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const rootData = useRouteLoaderData("root");
  const appData = useRouteLoaderData("routes/app");
  const language = normalizeLanguage(appData?.language ?? DEFAULT_LANGUAGE);
  const searchParams = new URLSearchParams(location.search);
  const presentation = getAdminRouteErrorPresentation(error, {
    allowShopifyResponse: location.pathname !== "/auth/session-token",
    hasEmbeddedContext: hasEmbeddedShopifySearchParams(searchParams),
  });
  const reopenHref = buildShopifyAdminReopenUrl(
    new URL(`${location.pathname}${location.search}${location.hash}`, "https://app.invalid"),
    rootData?.shopifyApiKey,
    { appOrigin: rootData?.shopifyAppUrl },
  );

  if (presentation.kind === "shopify-response") {
    return <div data-shopify-document-error>{boundary.error(error)}</div>;
  }

  if (presentation.kind === "unexpected-error") {
    throw error;
  }

  return <AdminRouteErrorPage
    language={language}
    presentation={presentation}
    reopenHref={reopenHref}
  />;
}
