# Shared Shopify offline credentials

The Route API is the only issuer/refresh owner for each app and shop. The app
SDK's SQLite session is an access-token cache. Its refresh field contains an
opaque routing marker rather than a usable Shopify refresh token.

`app/shopify-token-authority.server.js` installs Shopify's exported runtime fetch
adapter after the Node adapter, before `shopifyApp()`. Exact offline token
exchange/refresh requests go to the signed Route API broker. Admin GraphQL and
REST requests retain the native transport. Invalid OAuth shapes and unavailable
broker responses fail closed; never add a direct Shopify OAuth fallback.

The broker uses existing `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` and
`CLEVER_DELIVERY_API_URL`. No new environment value or database migration is
required. The client secret is server-only, per-app authority over all of that
app's installed shops; never send broker signatures or responses to a browser.

The app no longer performs a second token exchange from the root loader. Broker
outcomes update the existing app/shop-scoped health view. Staff requests still
require fresh App Bridge ID tokens and retain their existing access checks.
Legacy offline sessions are marked expired in memory on their first load so the
SDK obtains the canonical credential through the broker. Online sessions and
already managed sessions remain intact. For canonical non-expiring credentials,
the SDK requires synthetic expiry metadata to retain its opaque routing marker;
this metadata does not change Shopify's actual credential lifetime.

Uninstall admission validates Shopify HMAC without asking the SDK to refresh a
possibly revoked token. It forwards the event to durable server processing before
deleting local sessions. Server processing clears the canonical credential under
the same privacy lock, ignores duplicates, and fences old events after reinstall.

Deploy the server broker first, then the K-food app through the existing manual
workflow after exact-main CI. All replicas for one app identity must use the
adapter; other app identities can be migrated independently. Roll back the app
before the server. Do not delete live sessions or tokens as a migration step.

The token-authority tests exercise the installed SDK, its expiring and legacy
non-expiring responses, native API passthrough, error handling and health
isolation. Keep these tests and the SDK contract guard when upgrading Shopify
dependencies. Review changes to the runtime adapter and OAuth request paths.

Trace: [change control #308](https://github.com/EVNSolution/clever-change-control/issues/308).
