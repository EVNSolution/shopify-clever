import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  logAppEntryRedirect(request, "/app", "/app/orders");

  return redirect(`/app/orders${url.search}`);
};

export default function Index() {
  return null;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function logAppEntryRedirect(request, from, to) {
  const url = new URL(request.url);

  console.info("app_entry_redirect", {
    event: "app_entry_redirect",
    from,
    hasHost: url.searchParams.has("host"),
    hasShop: url.searchParams.has("shop"),
    to,
  });
}
