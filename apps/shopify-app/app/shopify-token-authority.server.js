import crypto from "node:crypto";
import { setAbstractFetchFunc } from "@shopify/shopify-api/runtime";
import {
  recordShopifyTokenAuthorityFailure,
  recordShopifyTokenAuthoritySuccess,
} from "./features/delivery/shopify-token-sync.server.js";

export const SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER = "clever-route-managed-v1";

export function markLegacyOfflineSessionForTokenAuthority(session) {
  if (
    !session
    || session.isOnline
    || !session.accessToken
    || session.refreshToken === SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER
  ) {
    return session;
  }

  session.expires = new Date(0);
  session.refreshToken = SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER;
  session.refreshTokenExpires = undefined;
  return session;
}

const AUTHORITY_PATH = "/shopify/auth/offline-token";
const OAUTH_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ID_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";
const OFFLINE_TOKEN_TYPE = "urn:shopify:params:oauth:token-type:offline-access-token";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json" },
  });
}

function classifyShopifyOAuthUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return "other";
  }
  const looksLikeShopifyDomain = /(?:^|\.)myshopify\.com$/i.test(url.hostname);
  const shopDomain = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(url.hostname);
  if (!looksLikeShopifyDomain || url.pathname !== "/admin/oauth/access_token") return "other";
  if (!shopDomain) return "suspicious";
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash) return "suspicious";
  return "oauth";
}

export function buildTokenAuthoritySignature(clientSecret, timestamp, body) {
  const bodyHash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const canonical = ["clever-shopify-token-authority-v1", "POST", AUTHORITY_PATH, timestamp, bodyHash].join("\n");
  return crypto.createHmac("sha256", clientSecret).update(canonical).digest("hex");
}

function parseOAuthRequest(input, clientSecret) {
  if (input.method !== "POST") return { error: "invalid_request" };
  let payload;
  try {
    payload = JSON.parse(input.body || "");
  } catch {
    return { error: "invalid_request" };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { error: "invalid_request" };
  if (payload.grant_type === OAUTH_GRANT) {
    if (payload.subject_token_type !== ID_TOKEN_TYPE || payload.requested_token_type !== OFFLINE_TOKEN_TYPE || typeof payload.subject_token !== "string" || !payload.subject_token) return { error: "invalid_request" };
    if (typeof payload.client_id !== "string" || !payload.client_id || payload.client_secret !== clientSecret) return { error: "invalid_request" };
    return { clientId: payload.client_id, shopDomain: new URL(input.url).hostname, operation: "exchange", sessionToken: payload.subject_token };
  }
  if (payload.grant_type === "refresh_token") {
    if (typeof payload.client_id !== "string" || !payload.client_id || payload.client_secret !== clientSecret || typeof payload.refresh_token !== "string" || !payload.refresh_token) return { error: "invalid_request" };
    return { clientId: payload.client_id, shopDomain: new URL(input.url).hostname, operation: "refresh" };
  }
  return { error: "invalid_request" };
}

export function createShopifyTokenAuthorityFetch({
  nativeFetch = globalThis.fetch.bind(globalThis),
  brokerFetch = nativeFetch,
  clientSecret = process.env.SHOPIFY_API_SECRET || "",
  clientId = process.env.SHOPIFY_API_KEY || "",
  deliveryApiUrl = process.env.CLEVER_DELIVERY_API_URL || "",
  now = () => Date.now(),
  timeoutMs = 15_000,
  recordFailure = recordShopifyTokenAuthorityFailure,
  recordSuccess = recordShopifyTokenAuthoritySuccess,
} = {}) {
  if (typeof nativeFetch !== "function") throw new Error("Native fetch is unavailable");
  return async function tokenAuthorityFetch(input, init = {}) {
    const requestUrl = input instanceof Request ? input.url : input;
    const urlClass = classifyShopifyOAuthUrl(requestUrl);
    if (urlClass === "other") return nativeFetch(input, init);
    if (urlClass === "suspicious") return jsonResponse({ error: "invalid_request" }, 400);
    if (!clientSecret || !deliveryApiUrl) return jsonResponse({ error: "invalid_request" }, 400);

    const requestBody = init.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    const parsed = parseOAuthRequest({
      url: requestUrl,
      method: init.method ?? (input instanceof Request ? input.method : "GET"),
      body: requestBody,
    }, clientSecret);
    if (parsed.error || (clientId && parsed.clientId !== clientId)) return jsonResponse({ error: "invalid_request" }, 400);
    const body = parsed.operation === "exchange"
      ? { clientId: parsed.clientId, shopDomain: parsed.shopDomain, operation: parsed.operation, sessionToken: parsed.sessionToken }
      : { clientId: parsed.clientId, shopDomain: parsed.shopDomain, operation: parsed.operation };
    const timestamp = String(Math.floor(now() / 1000));
    const controller = new AbortController();
    let timer;
    try {
      const brokerRequest = Promise.resolve(brokerFetch(`${deliveryApiUrl.replace(/\/$/, "")}${AUTHORITY_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-clever-token-timestamp": timestamp,
          "x-clever-token-signature": buildTokenAuthoritySignature(clientSecret, timestamp, body),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: "error",
      }));
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("TOKEN_AUTHORITY_TIMEOUT"));
        }, timeoutMs);
      });
      const brokerResponse = await Promise.race([brokerRequest, timeout]);
      if (brokerResponse.status === 401) {
        recordFailure({ errorCode: "TOKEN_AUTHORITY_INVALID_GRANT", shopDomain: parsed.shopDomain });
        return jsonResponse({ error: "invalid_grant" }, 400);
      }
      if (!brokerResponse.ok) {
        recordFailure({ errorCode: `TOKEN_AUTHORITY_HTTP_${brokerResponse.status}`, shopDomain: parsed.shopDomain });
        return jsonResponse({ error: "temporarily_unavailable" }, 502);
      }
      const payload = await Promise.race([brokerResponse.json().catch(() => null), timeout]);
      if (!isCanonicalTokenResponse(payload)) {
        recordFailure({ errorCode: "TOKEN_AUTHORITY_INVALID_RESPONSE", shopDomain: parsed.shopDomain });
        return jsonResponse({ error: "temporarily_unavailable" }, 502);
      }
      recordSuccess({ shopDomain: parsed.shopDomain });
      return jsonResponse(normalizeCanonicalTokenResponse(payload));
    } catch {
      recordFailure({
        errorCode: controller.signal.aborted ? "TOKEN_AUTHORITY_TIMEOUT" : "TOKEN_AUTHORITY_UNAVAILABLE",
        shopDomain: parsed.shopDomain,
      });
      return jsonResponse({ error: "temporarily_unavailable" }, 502);
    } finally {
      clearTimeout(timer);
    }
  };
}

function isCanonicalTokenResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (typeof payload.access_token !== "string" || !payload.access_token) return false;
  if (typeof payload.scope !== "string") return false;
  if (payload.refresh_token !== SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER) return false;
  if (payload.expires_in !== undefined && (!Number.isFinite(payload.expires_in) || payload.expires_in <= 0)) return false;
  // The marker is authenticated by the app-server signature, not by Shopify's
  // refresh lifetime. A healthy access token may outlive its refresh credential.
  if (payload.refresh_token_expires_in !== undefined
    && (!Number.isFinite(payload.refresh_token_expires_in) || payload.refresh_token_expires_in < 0)) return false;
  return true;
}

function normalizeCanonicalTokenResponse(payload) {
  if (payload.refresh_token_expires_in > 0) return payload;
  // The SDK only retains a refresh marker when expiry metadata is present.
  // This bounds the local routing marker's cache metadata; it does not extend
  // any Shopify credential. The Route API remains the lifetime authority.
  return { ...payload, refresh_token_expires_in: 315_360_000 };
}

export function installShopifyTokenAuthorityFetch(options) {
  const configured = {
    clientId: process.env.SHOPIFY_API_KEY || "",
    clientSecret: process.env.SHOPIFY_API_SECRET || "",
    deliveryApiUrl: process.env.CLEVER_DELIVERY_API_URL || "",
    ...options,
  };
  if (!configured.clientId || !configured.clientSecret || !configured.deliveryApiUrl) {
    throw new Error("Shopify token authority configuration is incomplete");
  }
  const nativeFetch = globalThis.fetch.bind(globalThis);
  setAbstractFetchFunc(createShopifyTokenAuthorityFetch({ nativeFetch, ...configured }));
}

export { AUTHORITY_PATH };
