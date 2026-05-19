import { useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { PageNote, PageSection, PageShell, StatusPill } from "../../ui/page-shell";
import { loginErrorMessage } from "./error.server";

const SHOPIFY_OFFICIAL_URL = "https://www.shopify.com/";
const SHOPIFY_ADMIN_URL = "https://admin.shopify.com/";

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const primaryLinkStyle = {
  background: "#303030",
  border: "1px solid #303030",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-flex",
  fontSize: "13px",
  fontWeight: 650,
  lineHeight: 1.2,
  padding: "8px 12px",
  textDecoration: "none",
};

const secondaryLinkStyle = {
  ...primaryLinkStyle,
  background: "#ffffff",
  borderColor: "#c9c9c9",
  color: "#303030",
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (!url.searchParams.get("shop")) {
    return {
      errors: {},
      missingShopContext: true,
      shopifyOfficialUrl: SHOPIFY_OFFICIAL_URL,
      shopifyAdminUrl: SHOPIFY_ADMIN_URL,
    };
  }

  const errors = loginErrorMessage(await login(request));

  return { errors, missingShopContext: false };
};

export default function Auth() {
  const {
    errors,
    missingShopContext,
    shopifyOfficialUrl,
    shopifyAdminUrl,
  } = useLoaderData();

  if (missingShopContext) {
    return (
      <PageShell
        eyebrow="CLEVER app entry"
        title="Open clever from Shopify"
        description="This page is ready, but Shopify did not include the store context needed to continue."
      >
        <PageSection
          title="Store context required"
          description="Start from Shopify Admin, then open the clever embedded app from your store admin."
          badge={<StatusPill tone="amber">Missing context</StatusPill>}
        >
          <PageNote tone="warning">
            This login URL cannot be opened directly. No token, session, host, or
            store-specific value is shown here.
          </PageNote>
          <div style={actionRowStyle}>
            <a href={shopifyAdminUrl} target="_top" rel="noreferrer" style={primaryLinkStyle}>
              Open Shopify Admin
            </a>
            <a href={shopifyOfficialUrl} target="_top" rel="noreferrer" style={secondaryLinkStyle}>
              Go to Shopify official site
            </a>
          </div>
        </PageSection>
      </PageShell>
    );
  }

  const message =
    errors.shop || "Redirecting to Shopify Admin to connect the active store.";

  return (
    <PageShell
      eyebrow="CLEVER app entry"
      title="Connecting store"
      description="Shopify is connecting the active store to the embedded app."
    >
      <PageSection
        title="Connection in progress"
        badge={<StatusPill tone="blue">Shopify auth</StatusPill>}
      >
        <PageNote>{message}</PageNote>
      </PageSection>
    </PageShell>
  );
}
