import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";

import { getAdminRouteErrorPresentation } from "../features/shopify/admin-route-error";

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
  const presentation = getAdminRouteErrorPresentation(error);

  if (presentation.kind === "shopify-response") {
    return boundary.error(error);
  }

  if (presentation.kind === "unexpected-error") {
    throw error;
  }

  return (
    <main role="alert" style={pageStyle}>
      <section style={cardStyle}>
        <h1>{presentation.title}</h1>
        <p>{presentation.message}</p>
        <button type="button" onClick={() => window.location.reload()} style={buttonStyle}>
          Reload
        </button>
      </section>
    </main>
  );
}
