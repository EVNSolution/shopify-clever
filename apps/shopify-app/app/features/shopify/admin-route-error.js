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
    if (hasEmbeddedContext && allowShopifyResponse) {
      return { kind: "shopify-response" };
    }

    return hasEmbeddedContext
      ? {
        kind: "recovery-failed",
        messageKey: "recovery.failed.message",
        titleKey: "recovery.failed.title",
      }
      : {
        kind: "missing-context",
        messageKey: "recovery.missingContext.message",
        titleKey: "recovery.missingContext.title",
      };
  }

  if (Number(error?.status) === 401) {
    return {
      kind: "session-expired",
      messageKey: "recovery.sessionExpired.message",
      titleKey: "recovery.sessionExpired.title",
    };
  }

  if (error instanceof Error) {
    return { kind: "unexpected-error" };
  }

  return {
    kind: "route-error",
    messageKey: "recovery.routeError.message",
    titleKey: "recovery.routeError.title",
  };
}
