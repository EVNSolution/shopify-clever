import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLocation, useRouteError, useRouteLoaderData } from "react-router";

import { buildShopifyAdminReopenUrl } from "../features/shopify/admin-bounce-recovery";
import { getAdminRouteErrorPresentation } from "../features/shopify/admin-route-error";
import { hasEmbeddedShopifySearchParams } from "../features/shopify/app-bridge-bootstrap";

const pageStyle = {
  alignItems: "center",
  display: "flex",
  justifyContent: "center",
  minHeight: "60vh",
  padding: "24px",
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #d8d8d8",
  borderRadius: "12px",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)",
  maxWidth: "480px",
  padding: "24px",
  width: "100%",
};

const buttonStyle = {
  background: "#303030",
  border: 0,
  borderRadius: "8px",
  color: "#ffffff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  marginTop: "16px",
  padding: "10px 16px",
};

export function AdminRouteErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const rootData = useRouteLoaderData("root");
  const searchParams = new URLSearchParams(location.search);
  const presentation = getAdminRouteErrorPresentation(error, {
    allowShopifyResponse: location.pathname !== "/auth/session-token",
    hasEmbeddedContext: hasEmbeddedShopifySearchParams(searchParams),
  });
  const reopenHref = buildShopifyAdminReopenUrl(
    new URL(`${location.pathname}${location.search}${location.hash}`, "https://app.invalid"),
    rootData?.shopifyApiKey,
  );

  if (presentation.kind === "shopify-response") {
    return <div data-shopify-document-error>{boundary.error(error)}</div>;
  }

  if (presentation.kind === "unexpected-error") {
    throw error;
  }

  return (
    <main data-shopify-document-error role="alert" style={pageStyle}>
      <section style={cardStyle}>
        <h1>{presentation.title}</h1>
        <p>{presentation.message}</p>
        <a
          href={reopenHref}
          rel="noreferrer"
          style={{ ...buttonStyle, textDecoration: "none" }}
          target="_top"
        >
          Shopify Admin에서 다시 열기 / Reopen in Shopify Admin
        </a>
      </section>
    </main>
  );
}
