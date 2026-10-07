import { logSafeOperationalEvent } from "../telemetry/structured-telemetry.server.js";

const TOKEN_HEALTH_RETENTION_MS = 60 * 60 * 1000;
const TOKEN_HEALTH_MAX_ENTRIES = 250;
const tokenSyncHealthByIdentity = new Map();

const UNKNOWN_TOKEN_SYNC_HEALTH = Object.freeze({
  errorCode: null,
  lastAttemptAt: null,
  lastErrorCode: null,
  lastFailureAt: null,
  lastSuccessAt: null,
  status: "unknown",
});

export function getShopifyTokenSyncHealth(shopDomain, { appId, now = Date.now } = {}) {
  const observedAt = now();
  pruneTokenState(observedAt);
  const identity = shopIdentity(shopDomain, appId);
  const record = identity ? tokenSyncHealthByIdentity.get(identity) : null;
  return record ? publicHealth(record) : { ...UNKNOWN_TOKEN_SYNC_HEALTH };
}

export function recordShopifyTokenAuthoritySuccess({ appId, now = Date.now, shopDomain } = {}) {
  const succeededAtMs = now();
  pruneTokenState(succeededAtMs);
  const identity = shopIdentity(shopDomain, appId);
  if (!identity) return;
  const succeededAt = new Date(succeededAtMs).toISOString();
  updateTokenSyncHealth(identity, succeededAtMs, (health) => ({
    ...health,
    errorCode: null,
    lastAttemptAt: succeededAt,
    lastSuccessAt: succeededAt,
    status: "healthy",
  }));
}

export function recordShopifyTokenAuthorityFailure({
  appId,
  errorCode = "TOKEN_AUTHORITY_UNAVAILABLE",
  now = Date.now,
  shopDomain,
  stage = "token_authority",
} = {}) {
  const failedAtMs = now();
  pruneTokenState(failedAtMs);
  const identity = shopIdentity(shopDomain, appId) ?? appIdentity(appId);
  const failedAt = new Date(failedAtMs).toISOString();
  const health = updateTokenSyncHealth(identity, failedAtMs, (currentHealth) => ({
    ...currentHealth,
    errorCode,
    lastAttemptAt: failedAt,
    lastErrorCode: errorCode,
    lastFailureAt: failedAt,
    status: "degraded",
  }));
  logSafeOperationalEvent("warn", "shopify_token_sync", {
    errorCode: health.errorCode,
    stage,
    status: health.status,
  });
}

export function recordShopifyAdminTokenRefreshFailure(options = {}) {
  recordShopifyTokenAuthorityFailure({
    ...options,
    errorCode: "ADMIN_TOKEN_REFRESH_FAILED",
    stage: "admin_auth_refresh",
  });
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
  for (const [identity, health] of tokenSyncHealthByIdentity) {
    if (observedAtMs - health.updatedAtMs >= TOKEN_HEALTH_RETENTION_MS) {
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

function shopIdentity(shopDomain, appId) {
  const shop = normalizeIdentityPart(shopDomain);
  return shop ? `shop:${normalizeAppId(appId)}:${shop}` : null;
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
