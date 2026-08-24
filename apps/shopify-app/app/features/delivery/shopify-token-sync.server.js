import { getDeliveryApiBaseUrl } from "./route-plans.server.js";

const TOKEN_SYNC_TTL_MS = 5 * 60 * 1000;
const lastSyncedAtByShop = new Map();
const inFlightSyncByShop = new Map();
let tokenSyncHealth = {
  errorCode: null,
  lastAttemptAt: null,
  lastErrorCode: null,
  lastFailureAt: null,
  lastSuccessAt: null,
  status: "unknown",
};

export function getShopifyTokenSyncHealth() {
  return { ...tokenSyncHealth };
}

export function recordShopifyAdminTokenRefreshFailure({ now = Date.now } = {}) {
  const failedAt = new Date(now()).toISOString();
  recordTokenSyncFailure("ADMIN_TOKEN_REFRESH_FAILED", failedAt, "admin_auth_refresh");
}

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

  const inFlightSync = inFlightSyncByShop.get(shopDomain);
  if (inFlightSync) return inFlightSync;

  const syncPromise = syncShopifyOfflineToken(shopDomain, authorization, {
    fetch: fetchImpl,
    now,
  });
  inFlightSyncByShop.set(shopDomain, syncPromise);

  try {
    return await syncPromise;
  } finally {
    inFlightSyncByShop.delete(shopDomain);
  }
}

async function syncShopifyOfflineToken(
  shopDomain,
  authorization,
  { fetch: fetchImpl, now },
) {
  const attemptedAt = new Date(now()).toISOString();
  tokenSyncHealth = { ...tokenSyncHealth, lastAttemptAt: attemptedAt, status: "checking" };
  let response;
  try {
    response = await fetchImpl(`${getDeliveryApiBaseUrl()}/shopify/auth/token-exchange`, {
      body: JSON.stringify({ shopDomain }),
      headers: {
        authorization,
        "content-type": "application/json",
      },
      method: "POST",
    });
  } catch {
    recordTokenSyncFailure("TOKEN_EXCHANGE_UNAVAILABLE", attemptedAt, "token_exchange");
    return { skipped: false, ok: false };
  }

  if (!response.ok) {
    recordTokenSyncFailure(`TOKEN_EXCHANGE_HTTP_${response.status}`, attemptedAt, "token_exchange");
    return { skipped: false, ok: false };
  }

  lastSyncedAtByShop.set(shopDomain, now());
  tokenSyncHealth = {
    ...tokenSyncHealth,
    errorCode: null,
    lastAttemptAt: attemptedAt,
    lastSuccessAt: attemptedAt,
    status: "healthy",
  };
  return { skipped: false, ok: true };
}

function recordTokenSyncFailure(errorCode, failedAt, stage) {
  tokenSyncHealth = {
    ...tokenSyncHealth,
    errorCode,
    lastAttemptAt: failedAt,
    lastErrorCode: errorCode,
    lastFailureAt: failedAt,
    status: "degraded",
  };
  logTokenSyncHealth(stage);
}

function logTokenSyncHealth(stage) {
  console.warn(JSON.stringify({
    event: "shopify_token_sync",
    errorCode: tokenSyncHealth.errorCode,
    stage,
    status: tokenSyncHealth.status,
  }));
}
