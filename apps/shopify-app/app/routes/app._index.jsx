import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  return redirect(`/app/orders${url.search}`);
};

export default function Index() {
  return null;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
