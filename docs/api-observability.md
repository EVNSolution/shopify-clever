# API request and performance observability

## Delivery API correlation

Every request sent through the app BFF's `deliveryApiRequest` boundary carries
an `x-clever-client-request-id`. Orders resource loaders reuse their existing
request ID; other calls receive a generated UUID. The direct route-tracking
snapshot and SSE proxies propagate a safe incoming correlation ID when present
and otherwise generate one before calling the Delivery API.

The app emits a `delivery_api_request` structured metric containing the
correlation ID, sanitized path, method, response status, duration, and error
count. The Delivery API emits `shopify_admin_api_surface_request` with the same
correlation ID, matched route, response status, and duration. Neither log stores
authorization headers or request/response bodies.

Use these paired records for production timing and status evidence. Use the
request-helper and resource-route tests for exact payload contracts. Raw
order/customer bodies must not be retained as a substitute for a browser HAR.

## `/perf` capture boundary

The first-party `/perf` resource is enabled outside production. In production it
is enabled only when `CLEVER_PERF_CAPTURE=1`; otherwise its loader and action
return `404`.

Accepted metric bodies are capped at 32 KB and reduced to an allowlist before
storage. URLs lose query strings and fragments, and sensitive metric fields are
redacted. Captured JSONL files are written under the app process working
directory:

- `.omx/perf/app-page-navigation.jsonl`
- `.omx/perf/orders-navigation.jsonl`

These files are diagnostic evidence, not application data. The app does not
provide retention or rotation. Production capture must therefore be enabled for
a bounded investigation, copied to a protected evidence location when needed,
and disabled afterward. Container replacement can remove the local files.
