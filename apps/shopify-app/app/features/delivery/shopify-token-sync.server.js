import { getDeliveryApiBaseUrl } from "./route-plans.server.js";

const TOKEN_SYNC_TTL_MS = 5 * 60 * 1000;
const lastSyncedAtByShop = new Map();

export async function syncShopifyOfflineTokenToDeliveryApi(
  request,
  session,
  { fetch: fetchImpl = fetch, now = Date.now } = {},
) {
  const authorization = request.headers.get("authorization");
  const shopDomain = session?.shop;

  if (!authorization || !shopDomain) return { skipped: true };

  const lastSyncedAt = lastSyncedAtByShop.get(shopDomain);
  if (lastSyncedAt !== undefined && now() - lastSyncedAt < TOKEN_SYNC_TTL_MS) {
    return { skipped: true };
  }

  const response = await fetchImpl(`${getDeliveryApiBaseUrl()}/shopify/auth/token-exchange`, {
    body: JSON.stringify({ shopDomain }),
    headers: {
      authorization,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    console.warn(`Unable to sync Shopify offline token to delivery API: ${response.status}`);
    return { skipped: false, ok: false };
  }

  lastSyncedAtByShop.set(shopDomain, now());
  return { skipped: false, ok: true };
}
