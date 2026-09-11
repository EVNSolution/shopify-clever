const SHOPIFY_ADMIN_ORIGIN = "https://admin.shopify.com";
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/iu;
const HOST_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/u;
const TRANSIENT_QUERY_KEYS = [
  "hmac",
  "id_token",
  "session",
  "shopify-reload",
  "timestamp",
];

function getStableEmbeddedContext(url) {
  const shop = url.searchParams.get("shop")?.trim() || "";
  const host = url.searchParams.get("host")?.trim() || "";

  if (
    !SHOP_DOMAIN_PATTERN.test(shop) ||
    !HOST_PATTERN.test(host) ||
    url.searchParams.get("embedded") !== "1"
  ) {
    return null;
  }

  return { embedded: "1", host, shop };
}

function isAppRoute(pathname) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function getTrustedReloadUrl(url, context) {
  const reload = url.searchParams.get("shopify-reload");
  if (!reload) return null;

  let target;
  try {
    target = new URL(reload, url.origin);
  } catch {
    return null;
  }

  const targetContext = getStableEmbeddedContext(target);
  if (
    target.origin !== url.origin ||
    !isAppRoute(target.pathname) ||
    !targetContext ||
    targetContext.shop !== context.shop ||
    targetContext.host !== context.host
  ) {
    return null;
  }

  return target;
}

export function getTrustedBounceRecoveryTarget(requestUrl) {
  const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
  const context = getStableEmbeddedContext(url);
  const idToken = url.searchParams.get("id_token")?.trim();

  if (url.pathname !== "/auth/session-token" || !context || !idToken) {
    return null;
  }

  const target = getTrustedReloadUrl(url, context);
  if (
    !target ||
    target.searchParams.get("shopify-recovery") === "1"
  ) {
    return null;
  }

  for (const key of TRANSIENT_QUERY_KEYS) target.searchParams.delete(key);
  target.searchParams.set("shop", context.shop);
  target.searchParams.set("host", context.host);
  target.searchParams.set("embedded", context.embedded);
  target.searchParams.set("id_token", idToken);
  target.searchParams.set("shopify-recovery", "1");

  return `${target.pathname}${target.search}${target.hash}`;
}

export function buildShopifyAdminReopenUrl(requestUrl, apiKey) {
  const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
  const context = getStableEmbeddedContext(url);
  const normalizedApiKey = String(apiKey || "").trim();
  if (!context || !normalizedApiKey) return `${SHOPIFY_ADMIN_ORIGIN}/`;

  const store = context.shop.slice(0, -".myshopify.com".length);
  const target = isAppRoute(url.pathname)
    ? new URL(url)
    : getTrustedReloadUrl(url, context) || new URL("/app/orders", url.origin);
  for (const key of TRANSIENT_QUERY_KEYS) target.searchParams.delete(key);
  target.searchParams.delete("shopify-recovery");
  const reopen = new URL(
    `/store/${encodeURIComponent(store)}/apps/${encodeURIComponent(normalizedApiKey)}${target.pathname}`,
    SHOPIFY_ADMIN_ORIGIN,
  );
  for (const [key, value] of target.searchParams) reopen.searchParams.append(key, value);
  reopen.searchParams.set("shop", context.shop);
  reopen.searchParams.set("host", context.host);
  reopen.searchParams.set("embedded", context.embedded);
  reopen.hash = target.hash;

  return reopen.toString();
}
