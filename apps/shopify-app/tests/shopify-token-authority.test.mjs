import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import "@shopify/shopify-api/adapters/node";
import { shopifyApi } from "@shopify/shopify-api";
import { setAbstractFetchFunc } from "@shopify/shopify-api/runtime";

import {
  createShopifyTokenAuthorityFetch,
  buildTokenAuthoritySignature,
  installShopifyTokenAuthorityFetch,
  markLegacyOfflineSessionForTokenAuthority,
  SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER,
} from "../app/shopify-token-authority.server.js";

const clientSecret = "test-client-secret";
const brokerUrl = "https://delivery.test";
const authorityPath = "/shopify/auth/offline-token";
const shopifyOAuthUrl = "https://example.myshopify.com/admin/oauth/access_token";

function response(body, init = {}) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function makeFetch() {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return response({ access_token: "native" });
  };
  fetch.calls = calls;
  return fetch;
}

function makeSessionToken({ aud = "client-id", secret = clientSecret } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ aud, exp: now + 60, nbf: now - 1 })}`;
  return `${unsigned}.${crypto.createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

test("production installer fails closed when authority configuration is incomplete", () => {
  assert.throws(
    () => installShopifyTokenAuthorityFetch({ clientId: "", clientSecret: "", deliveryApiUrl: "" }),
    /configuration is incomplete/,
  );
});

test("OAuth exchange is brokered with exact signed body and no Shopify issuance", async () => {
  const nativeFetch = makeFetch();
  const brokerCalls = [];
  const fetch = createShopifyTokenAuthorityFetch({
    nativeFetch,
    clientSecret,
    deliveryApiUrl: brokerUrl,
    now: () => 1_700_000_000_000,
    brokerFetch: async (url, init) => {
      brokerCalls.push({ url, init });
      return response({ access_token: "broker-token", scope: "read_orders", expires_in: 3600, refresh_token: SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER, refresh_token_expires_in: 7776000 });
    },
  });

  const result = await fetch(shopifyOAuthUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: "client-id",
      client_secret: clientSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: "fresh-subject-token",
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      expiring: "1",
    }),
  });

  assert.equal(result.status, 200);
  assert.equal(nativeFetch.calls.length, 0);
  assert.equal(brokerCalls.length, 1);
  assert.equal(brokerCalls[0].url, `${brokerUrl}${authorityPath}`);
  const brokerBody = JSON.parse(brokerCalls[0].init.body);
  assert.deepEqual(Object.keys(brokerBody), ["clientId", "shopDomain", "operation", "sessionToken"]);
  assert.deepEqual(brokerBody, {
    clientId: "client-id",
    shopDomain: "example.myshopify.com",
    operation: "exchange",
    sessionToken: "fresh-subject-token",
  });
  const timestamp = brokerCalls[0].init.headers["x-clever-token-timestamp"];
  assert.equal(timestamp, "1700000000");
  assert.equal(brokerCalls[0].init.redirect, "error");
  assert.equal(
    brokerCalls[0].init.headers["x-clever-token-signature"],
    buildTokenAuthoritySignature(clientSecret, timestamp, brokerBody),
  );
  assert.equal(brokerCalls[0].init.body.includes(clientSecret), false);
});

test("refresh delegates without forwarding the legacy refresh token", async () => {
  const nativeFetch = makeFetch();
  let brokerRequest;
  const fetch = createShopifyTokenAuthorityFetch({
    nativeFetch,
    clientSecret,
    deliveryApiUrl: brokerUrl,
    brokerFetch: async (url, init) => {
      brokerRequest = { url, init };
      return response({ access_token: "broker-token", refresh_token: SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER, scope: "read_orders" });
    },
  });

  const result = await fetch(shopifyOAuthUrl, {
    method: "POST",
    body: JSON.stringify({
      client_id: "client-id",
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: "legacy-token-must-not-leak",
    }),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(brokerRequest.init.body), {
    clientId: "client-id",
    shopDomain: "example.myshopify.com",
    operation: "refresh",
  });
  assert.equal(brokerRequest.init.body.includes("legacy-token-must-not-leak"), false);
});

test("non-OAuth requests pass through native fetch unchanged", async () => {
  const nativeFetch = makeFetch();
  const fetch = createShopifyTokenAuthorityFetch({ nativeFetch, clientSecret, deliveryApiUrl: brokerUrl });
  const init = { method: "GET", headers: { authorization: "Bearer x" } };
  await fetch("https://example.myshopify.com/admin/api/2026-04/graphql.json", init);
  assert.equal(nativeFetch.calls.length, 1);
  assert.equal(nativeFetch.calls[0].init, init);
});

test("unknown OAuth grant and malformed requests fail closed", async () => {
  const nativeFetch = makeFetch();
  const fetch = createShopifyTokenAuthorityFetch({ nativeFetch, clientSecret, deliveryApiUrl: brokerUrl });
  const result = await fetch(shopifyOAuthUrl, {
    method: "POST",
    body: JSON.stringify({ grant_type: "authorization_code" }),
  });
  assert.equal(result.status, 400);
  assert.equal(nativeFetch.calls.length, 0);
});

test("suspicious Shopify OAuth URLs fail closed instead of falling through", async () => {
  const nativeFetch = makeFetch();
  const fetch = createShopifyTokenAuthorityFetch({ nativeFetch, clientSecret, clientId: "client-id", deliveryApiUrl: brokerUrl });
  for (const url of [
    "http://example.myshopify.com/admin/oauth/access_token",
    "https://example.myshopify.com:443/admin/oauth/access_token",
    "https://user:pass@example.myshopify.com/admin/oauth/access_token",
    "https://example.myshopify.com/admin/oauth/access_token?x=1",
    "https://sub.example.myshopify.com/admin/oauth/access_token",
  ]) {
    const result = await fetch(url, { method: "POST", body: "{}" });
    assert.equal(result.status, 400, url);
  }
  assert.equal(nativeFetch.calls.length, 0);
});

test("configured client id mismatch fails closed", async () => {
  const nativeFetch = makeFetch();
  const fetch = createShopifyTokenAuthorityFetch({ nativeFetch, clientSecret, clientId: "expected", deliveryApiUrl: brokerUrl });
  const result = await fetch(shopifyOAuthUrl, { method: "POST", body: JSON.stringify({ client_id: "wrong", client_secret: clientSecret, grant_type: "refresh_token", refresh_token: "legacy" }) });
  assert.equal(result.status, 400);
  assert.equal(nativeFetch.calls.length, 0);
});

test("broker 401 is sanitized and broker failure never falls back to Shopify", async () => {
  const nativeFetch = makeFetch();
  const fetch = createShopifyTokenAuthorityFetch({
    nativeFetch,
    clientSecret,
    deliveryApiUrl: brokerUrl,
    brokerFetch: async () => response({ secret: "must-not-leak" }, { status: 401 }),
  });
  const result = await fetch(shopifyOAuthUrl, {
    method: "POST",
    body: JSON.stringify({
      client_id: "client-id",
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: "legacy",
    }),
  });
  assert.equal(result.status, 400);
  assert.deepEqual(await result.json(), { error: "invalid_grant" });
  assert.equal(nativeFetch.calls.length, 0);
});

test("broker timeout aborts and returns a sanitized OAuth error", async () => {
  const nativeFetch = makeFetch();
  let signal;
  const failures = [];
  const fetch = createShopifyTokenAuthorityFetch({
    nativeFetch,
    clientSecret,
    deliveryApiUrl: brokerUrl,
    timeoutMs: 10,
    recordFailure: (failure) => failures.push(failure),
    brokerFetch: async (_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    },
  });
  const result = await fetch(shopifyOAuthUrl, {
    method: "POST",
    body: JSON.stringify({
      client_id: "client-id",
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: "never-return-this-secret",
    }),
  });
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), { error: "temporarily_unavailable" });
  assert.equal(signal.aborted, true);
  assert.equal(failures[0].errorCode, "TOKEN_AUTHORITY_TIMEOUT");
  assert.equal(nativeFetch.calls.length, 0);
});

test("concurrent OAuth requests all stay on the broker path", async () => {
  const nativeFetch = makeFetch();
  let brokerCount = 0;
  const fetch = createShopifyTokenAuthorityFetch({
    nativeFetch,
    clientSecret,
    deliveryApiUrl: brokerUrl,
    brokerFetch: async () => {
      brokerCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 0));
      return response({ access_token: "broker-token", refresh_token: SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER, scope: "read_orders" });
    },
  });
  const requests = Array.from({ length: 12 }, (_, index) => fetch(shopifyOAuthUrl, {
    method: "POST",
    body: JSON.stringify({
      client_id: "client-id",
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: `legacy-${index}`,
    }),
  }));
  const results = await Promise.all(requests);
  assert.equal(results.every((result) => result.status === 200), true);
  assert.equal(brokerCount, 12);
  assert.equal(nativeFetch.calls.length, 0);
});

test("signature is HMAC-SHA256 over the documented canonical lines", () => {
  const body = { clientId: "c", shopDomain: "s.myshopify.com", operation: "refresh" };
  const timestamp = "1700000000";
  const payload = ["clever-shopify-token-authority-v1", "POST", authorityPath, timestamp, crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")].join("\n");
  assert.equal(buildTokenAuthoritySignature(clientSecret, timestamp, body), crypto.createHmac("sha256", clientSecret).update(payload).digest("hex"));
});

test("installed Shopify SDK auth methods use the broker transport", async () => {
  const nativeFetch = makeFetch();
  const brokerCalls = [];
  const brokerFetch = async (url, init) => {
    brokerCalls.push({ url, init });
    const body = JSON.parse(init.body);
    return response(body.operation === "refresh"
      ? { access_token: "refreshed", scope: "read_orders", expires_in: 3600, refresh_token: SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER, refresh_token_expires_in: 7776000 }
      : { access_token: "exchanged", scope: "read_orders", expires_in: 3600, refresh_token: SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER, refresh_token_expires_in: 7776000 });
  };
  setAbstractFetchFunc(createShopifyTokenAuthorityFetch({ nativeFetch, brokerFetch, clientSecret, deliveryApiUrl: brokerUrl }));
  const api = shopifyApi({
    apiKey: "client-id",
    apiSecretKey: clientSecret,
    apiVersion: "2026-04",
    hostName: "app.test",
    hostScheme: "https",
    isEmbeddedApp: true,
  });
  const refreshed = await api.auth.refreshToken({ shop: "example.myshopify.com", refreshToken: "legacy" });
  assert.equal(refreshed.session.accessToken, "refreshed");
  const exchanged = await api.auth.tokenExchange({
    expiring: true,
    requestedTokenType: "urn:shopify:params:oauth:token-type:offline-access-token",
    sessionToken: makeSessionToken(),
    shop: "example.myshopify.com",
  });
  assert.equal(exchanged.session.accessToken, "exchanged");
  assert.equal(exchanged.session.refreshToken, SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER);
  assert.ok(exchanged.session.expires instanceof Date);
  assert.equal(nativeFetch.calls.length, 0);
  assert.equal(brokerCalls.length, 2);
});

test("installed tokenExchange accepts a canonical non-expiring offline token", async () => {
  const nativeFetch = makeFetch();
  setAbstractFetchFunc(createShopifyTokenAuthorityFetch({
    nativeFetch,
    clientSecret,
    deliveryApiUrl: brokerUrl,
    brokerFetch: async () => response({ access_token: "permanent", scope: "read_orders", refresh_token: SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER }),
  }));
  const api = shopifyApi({
    apiKey: "client-id",
    apiSecretKey: clientSecret,
    apiVersion: "2026-04",
    hostName: "app.test",
    hostScheme: "https",
    isEmbeddedApp: true,
  });
  const result = await api.auth.tokenExchange({
    expiring: false,
    requestedTokenType: "urn:shopify:params:oauth:token-type:offline-access-token",
    sessionToken: makeSessionToken(),
    shop: "example.myshopify.com",
  });
  assert.equal(result.session.accessToken, "permanent");
  assert.equal(result.session.expires, undefined);
  assert.equal(result.session.refreshToken, SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER);
  assert.ok(result.session.refreshTokenExpires instanceof Date);
  assert.equal(nativeFetch.calls.length, 0);
});

test("healthy canonical access remains usable when its Shopify refresh lifetime is absent or exhausted", async () => {
  for (const refreshLifetime of [undefined, 0]) {
    const authorityFetch = createShopifyTokenAuthorityFetch({
      nativeFetch: makeFetch(), clientSecret, deliveryApiUrl: brokerUrl,
      brokerFetch: async () => response({
        access_token: "healthy-canonical", scope: "read_orders", expires_in: 600,
        refresh_token: SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER,
        ...(refreshLifetime === undefined ? {} : { refresh_token_expires_in: refreshLifetime }),
      }),
    });
    const result = await authorityFetch(shopifyOAuthUrl, {
      method: "POST",
      body: JSON.stringify({ client_id: "client-id", client_secret: clientSecret, grant_type: "refresh_token", refresh_token: "legacy" }),
    });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).access_token, "healthy-canonical");
  }
});

test("installed SDK retains the routing marker when the canonical refresh credential has expired", async () => {
  setAbstractFetchFunc(createShopifyTokenAuthorityFetch({
    nativeFetch: makeFetch(), clientSecret, deliveryApiUrl: brokerUrl,
    brokerFetch: async () => response({
      access_token: "still-active", scope: "read_orders", expires_in: 600,
      refresh_token: SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER, refresh_token_expires_in: 0,
    }),
  }));
  const api = shopifyApi({ apiKey: "client-id", apiSecretKey: clientSecret, apiVersion: "2026-04", hostName: "app.test", isEmbeddedApp: true });
  const { session } = await api.auth.tokenExchange({
    expiring: true,
    requestedTokenType: "urn:shopify:params:oauth:token-type:offline-access-token",
    sessionToken: makeSessionToken(), shop: "example.myshopify.com",
  });
  assert.equal(session.refreshToken, SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER);
  assert.equal(markLegacyOfflineSessionForTokenAuthority(session).isExpired(), false);
  assert.ok(session.expires.getTime() <= Date.now() + 600_000);
});

test("the broker deadline also bounds a stalled response body", async () => {
  const authorityFetch = createShopifyTokenAuthorityFetch({
    nativeFetch: makeFetch(), clientSecret, deliveryApiUrl: brokerUrl, timeoutMs: 10,
    recordFailure: () => {},
    brokerFetch: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }),
  });
  const result = await authorityFetch(shopifyOAuthUrl, {
    method: "POST",
    body: JSON.stringify({ client_id: "client-id", client_secret: clientSecret, grant_type: "refresh_token", refresh_token: "legacy" }),
  });
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), { error: "temporarily_unavailable" });
});

test("Request-object OAuth is brokered while installed GraphQL and REST clients use native fetch", async () => {
  const nativeCalls = [];
  const nativeFetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    nativeCalls.push({ init, url });
    if (url.endsWith("/graphql.json")) return response({ data: { shop: { id: "gid://shopify/Shop/1" } } });
    return response({ shop: { id: 1 } });
  };
  const fetch = createShopifyTokenAuthorityFetch({
    nativeFetch,
    clientSecret,
    deliveryApiUrl: brokerUrl,
    brokerFetch: async () => response({
      access_token: "sdk-token",
      expires_in: 3600,
      refresh_token: SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER,
      refresh_token_expires_in: 7776000,
      scope: "read_orders",
    }),
  });
  const requestResult = await fetch(new Request(shopifyOAuthUrl, {
    method: "POST",
    body: JSON.stringify({
      client_id: "client-id",
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: "legacy",
    }),
  }));
  assert.equal(requestResult.status, 200);

  setAbstractFetchFunc(fetch);
  const api = shopifyApi({
    apiKey: "client-id",
    apiSecretKey: clientSecret,
    apiVersion: "2026-04",
    hostName: "app.test",
    hostScheme: "https",
    isEmbeddedApp: true,
  });
  const session = (await api.auth.refreshToken({ shop: "example.myshopify.com", refreshToken: "legacy" })).session;
  const graphql = new api.clients.Graphql({ session });
  await graphql.request("query { shop { id } }");
  const rest = new api.clients.Rest({ session });
  await rest.get({ path: "shop" });
  assert.equal(nativeCalls.length, 2);
  assert.match(nativeCalls[0].url, /\/graphql\.json$/);
  assert.match(nativeCalls[1].url, /\/shop\.json$/);
});

test("legacy offline session caches converge on the broker marker without changing online or canonical sessions", () => {
  const legacy = {
    accessToken: "legacy-access",
    expires: undefined,
    isOnline: false,
    refreshToken: "legacy-real-refresh-secret",
    refreshTokenExpires: new Date("2026-12-01T00:00:00.000Z"),
  };
  assert.equal(markLegacyOfflineSessionForTokenAuthority(legacy), legacy);
  assert.equal(legacy.expires.getTime(), 0);
  assert.equal(legacy.refreshToken, SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER);
  assert.equal(legacy.refreshTokenExpires, undefined);

  const canonical = { accessToken: "canonical", expires: undefined, isOnline: false, refreshToken: SHOPIFY_TOKEN_AUTHORITY_REFRESH_MARKER };
  const online = { accessToken: "online", expires: undefined, isOnline: true, refreshToken: "online-refresh" };
  assert.equal(markLegacyOfflineSessionForTokenAuthority(canonical).expires, undefined);
  assert.equal(markLegacyOfflineSessionForTokenAuthority(online).expires, undefined);
  assert.equal(online.refreshToken, "online-refresh");
});
