const SHOPIFY_RESPONSE_PATTERN = /^\s*<script data-api-key="[^"<>\s]+" src="https:\/\/cdn\.shopify\.com\/shopifycloud\/app-bridge\.js"><\/script>\s*(?:<script>window\.open\("(?:[^"\\]|\\.)*",\s*"_(?:top|self|parent|blank)"\)<\/script>\s*)?$/u;

function errorDataText(error) {
  if (typeof error?.data === "string") return error.data;
  if (typeof error?.data === "number") return String(error.data);
  return "";
}

export function getAdminRouteErrorPresentation(
  error,
  { allowShopifyResponse = true, hasEmbeddedContext = true } = {},
) {
  if (SHOPIFY_RESPONSE_PATTERN.test(errorDataText(error))) {
    return hasEmbeddedContext && allowShopifyResponse
      ? { kind: "shopify-response" }
      : {
        kind: "route-error",
        title: "Shopify Admin에서 앱을 다시 열어주세요 / Reopen in Shopify Admin",
        message: "안전하게 계속하려면 Shopify Admin에서 CLEVER를 다시 여세요. / Reopen CLEVER from Shopify Admin to continue safely.",
      };
  }

  if (Number(error?.status) === 401) {
    return {
      kind: "session-expired",
      title: "Shopify 세션이 만료되었습니다 / Shopify session expired",
      message: "Shopify Admin에서 CLEVER를 다시 열어 인증을 갱신하세요. / Reopen CLEVER in Shopify Admin to refresh authentication.",
    };
  }

  if (error instanceof Error) {
    return { kind: "unexpected-error" };
  }

  return {
    kind: "route-error",
    title: "페이지를 열 수 없습니다 / This page could not be loaded",
    message: "Shopify Admin에서 CLEVER를 다시 열어주세요. / Reopen CLEVER from Shopify Admin.",
  };
}
