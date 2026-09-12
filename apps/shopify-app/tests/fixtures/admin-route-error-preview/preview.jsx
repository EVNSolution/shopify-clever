// The standalone Vite fixture does not use the React Router JSX transform.
import React from "react";
import { createRoot } from "react-dom/client";

import { AdminRouteErrorPage } from "../../../app/ui/admin-route-error-page";
import "../../../app/ui/admin-route-error-page.css";

// React Router supplies the JSX runtime in production. The standalone fixture
// exposes React for the same compiled component without loading App Bridge.
window.React = React;

const presentations = {
  "missing-context": {
    kind: "missing-context",
    messageKey: "recovery.missingContext.message",
    titleKey: "recovery.missingContext.title",
  },
  "recovery-failed": {
    kind: "recovery-failed",
    messageKey: "recovery.failed.message",
    titleKey: "recovery.failed.title",
  },
  "session-expired": {
    kind: "session-expired",
    messageKey: "recovery.sessionExpired.message",
    titleKey: "recovery.sessionExpired.title",
  },
};

// eslint-disable-next-line react/prop-types
function LegacyPreview({ language }) {
  const korean = language === "ko";

  return (
    <main role="alert" style={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "60vh", padding: 24 }}>
      <section style={{ background: "#fff", border: "1px solid #d8d8d8", borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,.08)", maxWidth: 480, padding: 24, width: "100%" }}>
        <h1>{korean ? "Shopify 세션이 만료되었습니다 / Shopify session expired" : "Shopify session expired / Shopify 세션이 만료되었습니다"}</h1>
        <p>{korean ? "Shopify Admin에서 CLEVER를 다시 열어 인증을 갱신하세요. / Reopen CLEVER in Shopify Admin to refresh authentication." : "Reopen CLEVER in Shopify Admin to refresh authentication. / Shopify Admin에서 CLEVER를 다시 열어 인증을 갱신하세요."}</p>
        <a href="#shopify" style={{ background: "#303030", borderRadius: 8, color: "white", display: "inline-block", fontWeight: 600, marginTop: 16, padding: "10px 16px", textDecoration: "none" }}>
          Shopify Admin에서 다시 열기 / Reopen in Shopify Admin
        </a>
      </section>
    </main>
  );
}

const params = new URLSearchParams(window.location.search);
const language = params.get("lang") === "ko" ? "ko" : "en";
const presentation = presentations[params.get("state")] ?? presentations["session-expired"];
document.documentElement.lang = language;

createRoot(document.getElementById("root")).render(
  params.get("view") === "before"
    ? <LegacyPreview language={language} />
    : <AdminRouteErrorPage
      language={language}
      presentation={presentation}
      reopenHref="#shopify"
    />,
);
