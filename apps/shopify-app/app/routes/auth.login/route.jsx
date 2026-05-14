import { useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

const SHOPIFY_OFFICIAL_URL = "https://www.shopify.com/";
const SHOPIFY_ADMIN_URL = "https://admin.shopify.com/";

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
      <s-page>
        <s-section heading="Open clever from Shopify">
          <s-paragraph>
            This login URL needs Shopify store context and cannot be opened
            directly. Start from Shopify&apos;s official site or Shopify Admin,
            then open the clever embedded app from your store admin.
          </s-paragraph>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginTop: "1rem",
            }}
          >
            <a href={shopifyOfficialUrl} target="_top">
              Go to Shopify official site
            </a>
            <a href={shopifyAdminUrl} target="_top">
              Open Shopify Admin
            </a>
          </div>
        </s-section>
      </s-page>
    );
  }

  const message =
    errors.shop || "Redirecting to Shopify Admin to connect the active store.";

  return (
    <s-page>
      <s-section heading="Connecting store">
        <s-paragraph>{message}</s-paragraph>
      </s-section>
    </s-page>
  );
}
