import { getDeliveryApiBaseUrl } from "./route-plans.server.js";
import { logSafeOperationalEvent } from "../telemetry/structured-telemetry.server.js";

const TOKEN_SYNC_TTL_MS = 5 * 60 * 1000;
const TOKEN_HEALTH_RETENTION_MS = 12 * TOKEN_SYNC_TTL_MS;
const TOKEN_HEALTH_MAX_ENTRIES = 250;
const lastSyncedAtByIdentity = new Map();
const inFlightSyncByIdentity = new Map();
const tokenSyncHealthByIdentity = new Map();

const UNKNOWN_TOKEN_SYNC_HEALTH = Object.freeze({
  errorCode: null,
  lastAttemptAt: null,
  lastErrorCode: null,
  lastFailureAt: null,
  lastSuccessAt: null,
  status: "unknown",
});

export function getShopifyTokenSyncHealth(shopDomain, { now = Date.now } = {}) {
  const observedAt = now();
  pruneTokenState(observedAt);
  const identity = shopIdentity(shopDomain);
  const record = identity ? tokenSyncHealthByIdentity.get(identity) : null;
  return record ? publicHealth(record) : { ...UNKNOWN_TOKEN_SYNC_HEALTH };
}

export function recordShopifyAdminTokenRefreshFailure({
  appId,
  now = Date.now,
  shopDomain,
} = {}) {
  const failedAtMs = now();
  pruneTokenState(failedAtMs);
  const identity = shopIdentity(shopDomain) ?? appIdentity(appId);
  recordTokenSyncFailure(
    identity,
    "ADMIN_TOKEN_REFRESH_FAILED",
    new Date(failedAtMs).toISOString(),
    failedAtMs,
    "admin_auth_refresh",
  );
}

export async function syncShopifyOfflineTokenToDeliveryApi(
  request,
  session,
  { fetch: fetchImpl = fetch, now = Date.now } = {},
) {
  const authorization = request.headers.get("authorization");
  const shopDomain = normalizeIdentityPart(session?.shop);
  const identity = shopIdentity(shopDomain);

  if (!authorization || !identity) return { skipped: true };

  const checkedAt = now();
  pruneTokenState(checkedAt);
  const lastSyncedAt = lastSyncedAtByIdentity.get(identity);
  if (lastSyncedAt !== undefined && checkedAt - lastSyncedAt < TOKEN_SYNC_TTL_MS) {
    return { skipped: true };
  }

  const inFlightSync = inFlightSyncByIdentity.get(identity);
  if (inFlightSync) return inFlightSync;

  const syncPromise = syncShopifyOfflineToken(identity, shopDomain, authorization, {
    fetch: fetchImpl,
    now,
  });
  inFlightSyncByIdentity.set(identity, syncPromise);

  try {
    return await syncPromise;
  } finally {
    inFlightSyncByIdentity.delete(identity);
  }
}

async function syncShopifyOfflineToken(
  identity,
  shopDomain,
  authorization,
  { fetch: fetchImpl, now },
) {
  const attemptedAtMs = now();
  const attemptedAt = new Date(attemptedAtMs).toISOString();
  updateTokenSyncHealth(identity, attemptedAtMs, (health) => ({
    ...health,
    lastAttemptAt: attemptedAt,
    status: "checking",
  }));
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
    recordTokenSyncFailure(
      identity,
      "TOKEN_EXCHANGE_UNAVAILABLE",
      attemptedAt,
      attemptedAtMs,
      "token_exchange",
    );
    return { skipped: false, ok: false };
  }

  if (!response.ok) {
    recordTokenSyncFailure(
      identity,
      `TOKEN_EXCHANGE_HTTP_${response.status}`,
      attemptedAt,
      attemptedAtMs,
      "token_exchange",
    );
    return { skipped: false, ok: false };
  }

  const succeededAtMs = now();
  lastSyncedAtByIdentity.set(identity, succeededAtMs);
  updateTokenSyncHealth(identity, succeededAtMs, (health) => ({
    ...health,
    errorCode: null,
    lastAttemptAt: attemptedAt,
    lastSuccessAt: new Date(succeededAtMs).toISOString(),
    status: "healthy",
  }));
  return { skipped: false, ok: true };
}

function recordTokenSyncFailure(identity, errorCode, failedAt, failedAtMs, stage) {
  const health = updateTokenSyncHealth(identity, failedAtMs, (currentHealth) => ({
    ...currentHealth,
    errorCode,
    lastAttemptAt: failedAt,
    lastErrorCode: errorCode,
    lastFailureAt: failedAt,
    status: "degraded",
  }));
  logTokenSyncHealth(health, stage);
}

function updateTokenSyncHealth(identity, updatedAtMs, update) {
  const current = tokenSyncHealthByIdentity.get(identity);
  const health = update(current ? publicHealth(current) : UNKNOWN_TOKEN_SYNC_HEALTH);
  tokenSyncHealthByIdentity.delete(identity);
  tokenSyncHealthByIdentity.set(identity, { ...health, updatedAtMs });
  enforceHealthEntryLimit(identity);
  return health;
}

function pruneTokenState(observedAtMs) {
  for (const [identity, syncedAt] of lastSyncedAtByIdentity) {
    if (observedAtMs - syncedAt >= TOKEN_SYNC_TTL_MS) {
      lastSyncedAtByIdentity.delete(identity);
    }
  }

  for (const [identity, health] of tokenSyncHealthByIdentity) {
    if (
      observedAtMs - health.updatedAtMs >= TOKEN_HEALTH_RETENTION_MS
      && !inFlightSyncByIdentity.has(identity)
    ) {
      tokenSyncHealthByIdentity.delete(identity);
    }
  }
}

function enforceHealthEntryLimit(preservedIdentity) {
  while (tokenSyncHealthByIdentity.size > TOKEN_HEALTH_MAX_ENTRIES) {
    const evictedIdentity = tokenSyncHealthByIdentity.keys().next().value;
    if (evictedIdentity === preservedIdentity) break;
    tokenSyncHealthByIdentity.delete(evictedIdentity);
  }
}

function shopIdentity(shopDomain) {
  const shop = normalizeIdentityPart(shopDomain);
  return shop ? `shop:${normalizeAppId()}:${shop}` : null;
}

function appIdentity(appId) {
  return `app:${normalizeAppId(appId)}`;
}

function normalizeAppId(appId) {
  // eslint-disable-next-line no-undef
  return normalizeIdentityPart(appId ?? process.env.CLEVER_APP_ID) ?? "default";
}

function normalizeIdentityPart(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function publicHealth(health) {
  return {
    errorCode: health.errorCode,
    lastAttemptAt: health.lastAttemptAt,
    lastErrorCode: health.lastErrorCode,
    lastFailureAt: health.lastFailureAt,
    lastSuccessAt: health.lastSuccessAt,
    status: health.status,
  };
}

function logTokenSyncHealth(health, stage) {
  logSafeOperationalEvent("warn", "shopify_token_sync", {
    errorCode: health.errorCode,
    stage,
    status: health.status,
  });
}
