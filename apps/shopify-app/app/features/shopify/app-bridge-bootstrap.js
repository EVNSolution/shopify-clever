export function shouldLoadShopifyAppBridge(requestUrl) {
  const url = new URL(requestUrl);

  if (url.pathname !== "/auth/login") return true;

  return url.searchParams.has("shop");
}
