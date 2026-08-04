const DEFAULT_MAX_CACHE_MS = 30_000;
const DEFAULT_FALLBACK_CACHE_MS = 15_000;
const DEFAULT_EXPIRY_LEEWAY_MS = 10_000;

function decodeJwtPayload(token) {
  const payload = String(token ?? "").split(".")[1];
  if (!payload || typeof globalThis.atob !== "function") return null;

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  try {
    return JSON.parse(globalThis.atob(padded));
  } catch {
    return null;
  }
}

export function getOrdersSessionTokenCacheExpiry(token, {
  nowMs = Date.now(),
  maxCacheMs = DEFAULT_MAX_CACHE_MS,
  fallbackCacheMs = DEFAULT_FALLBACK_CACHE_MS,
  expiryLeewayMs = DEFAULT_EXPIRY_LEEWAY_MS,
} = {}) {
  const expSeconds = Number(decodeJwtPayload(token)?.exp);
  if (!Number.isFinite(expSeconds)) {
    return nowMs + Math.min(maxCacheMs, fallbackCacheMs);
  }

  return Math.max(
    nowMs,
    Math.min(nowMs + maxCacheMs, expSeconds * 1000 - expiryLeewayMs),
  );
}

export function createOrdersResourceSessionTokenGetter(fetchSessionToken, {
  now = Date.now,
  maxCacheMs = DEFAULT_MAX_CACHE_MS,
  fallbackCacheMs = DEFAULT_FALLBACK_CACHE_MS,
  expiryLeewayMs = DEFAULT_EXPIRY_LEEWAY_MS,
} = {}) {
  let cachedToken = null;
  let cachedTokenExpiresAt = 0;
  let inFlightRequest = null;

  return async function getOrdersResourceSessionToken() {
    const nowMs = now();
    if (cachedToken && nowMs < cachedTokenExpiresAt) return cachedToken;
    if (inFlightRequest) return inFlightRequest;

    inFlightRequest = Promise.resolve()
      .then(() => fetchSessionToken())
      .then((token) => {
        if (!token) return token;

        cachedToken = token;
        cachedTokenExpiresAt = getOrdersSessionTokenCacheExpiry(token, {
          nowMs: now(),
          maxCacheMs,
          fallbackCacheMs,
          expiryLeewayMs,
        });
        return token;
      })
      .finally(() => {
        inFlightRequest = null;
      });

    return inFlightRequest;
  };
}
