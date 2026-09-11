export const ROUTES_ROOT_PATH = "/app/routes";

export function routeGroupPath(routeGroupId) {
  return `${ROUTES_ROOT_PATH}/groups/${encodeURIComponent(routeGroupId)}`;
}

export function routeGroupChildPath(routeGroupId, routePlanId) {
  return `${routeGroupPath(routeGroupId)}/routes/${encodeURIComponent(routePlanId)}`;
}

export function routePlanPath(routePlanId) {
  return `${ROUTES_ROOT_PATH}/${encodeURIComponent(routePlanId)}`;
}

const EMBEDDED_SHOPIFY_CONTEXT_KEYS = ["shop", "host", "embedded"];
const SHOPIFY_CREDENTIAL_QUERY_KEYS = ["id_token", "session", "hmac", "timestamp"];

export function withEmbeddedShopifyContext(path, currentSearchParams) {
  const [pathAndSearch, hash = ""] = String(path).split("#", 2);
  const [pathname, search = ""] = pathAndSearch.split("?", 2);
  const destinationSearchParams = new URLSearchParams(search);
  const sourceSearchParams = currentSearchParams instanceof URLSearchParams
    ? currentSearchParams
    : new URLSearchParams(currentSearchParams);

  for (const key of SHOPIFY_CREDENTIAL_QUERY_KEYS) {
    destinationSearchParams.delete(key);
  }

  for (const key of EMBEDDED_SHOPIFY_CONTEXT_KEYS) {
    const value = sourceSearchParams.get(key);
    if (value) destinationSearchParams.set(key, value);
  }

  const destinationSearch = destinationSearchParams.toString();
  return `${pathname}${destinationSearch ? `?${destinationSearch}` : ""}${hash ? `#${hash}` : ""}`;
}

export function appendIdToken(path, idToken) {
  if (!idToken) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}id_token=${encodeURIComponent(idToken)}`;
}
