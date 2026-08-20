const SHOPIFY_RESPONSE_PATTERN = /^\s*<script data-api-key="[^"<>\s]+" src="https:\/\/cdn\.shopify\.com\/shopifycloud\/app-bridge\.js"><\/script>\s*(?:<script>window\.open\("(?:[^"\\]|\\.)*",\s*"_(?:top|self|parent|blank)"\)<\/script>\s*)?$/u;

function errorDataText(error) {
  if (typeof error?.data === "string") return error.data;
  if (typeof error?.data === "number") return String(error.data);
  return "";
}

export function getAdminRouteErrorPresentation(error) {
  if (SHOPIFY_RESPONSE_PATTERN.test(errorDataText(error))) {
    return { kind: "shopify-response" };
  }

  if (Number(error?.status) === 401) {
    return {
      kind: "session-expired",
      title: "Shopify session expired",
      message: "Reload this page. If it still fails, reopen CLEVER from Shopify Admin.",
    };
  }

  if (error instanceof Error) {
    return { kind: "unexpected-error" };
  }

  return {
    kind: "route-error",
    title: "This page could not be loaded",
    message: "Reload the page. If the app was just updated, reopen it from Shopify Admin.",
  };
}
