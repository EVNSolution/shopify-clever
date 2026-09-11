export function hasEmbeddedShopifySearchParams(searchParams) {
  return Boolean(
    searchParams.get("shop")?.trim() &&
    searchParams.get("host")?.trim(),
  );
}

export function hasEmbeddedShopifyContext(requestUrl) {
  const url = new URL(requestUrl);
  return hasEmbeddedShopifySearchParams(url.searchParams);
}

export function isEmbeddedShopifyContext(requestUrl) {
  const url = new URL(requestUrl);
  return hasEmbeddedShopifyContext(url) && url.searchParams.get("embedded") === "1";
}

export function shouldLoadShopifyAppBridge(requestUrl) {
  const url = new URL(requestUrl);

  if (url.pathname === "/auth/login") return Boolean(url.searchParams.get("shop")?.trim());

  return hasEmbeddedShopifyContext(url);
}
