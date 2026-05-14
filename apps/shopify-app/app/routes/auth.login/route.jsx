import { useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

const MISSING_SHOP_CONTEXT_MESSAGE =
  "Open this app from Shopify Admin so Shopify can provide the store context.";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (!url.searchParams.get("shop")) {
    throw new Response(MISSING_SHOP_CONTEXT_MESSAGE, {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export default function Auth() {
  const { errors } = useLoaderData();
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
