# Clever app performance plan

## Objective
Improve caching, query efficiency, speed, and perceived performance across the map UI, app loaders, delivery service calls, and API wrappers without changing user-visible route/order semantics.

## Gates
- Primary evaluator:
  `node --test tests/performance-instrumentation.test.mjs tests/orders-page.test.mjs tests/routes-page.test.mjs app/features/delivery/orders.server.test.js app/features/delivery/route-plans.server.test.js app/features/locations/shopify-locations.server.test.js && npm run lint && npm run typecheck && npm run build`
- Runtime benchmark, when Safari + Shopify dev app are available:
  `npm run perf:orders`
- Every optimization must keep route/order consistency guarantees: planned orders should not reappear as unplanned, mutation responses must invalidate stale cached reads, and delivery API calls remain shop/session scoped.

## Current baseline
- MapLibre is already lazy-loaded into isolated chunks rather than bundled into the initial app route.
- Orders loader already fetches Shopify orders, departure location, and delivery-server order state in parallel.
- App parent route already avoids unnecessary revalidation for internal `/app/*` navigation.
- The active regression suite covers Orders table state, Routes table/detail flows, delivery API wrappers, and performance instrumentation hooks.

## Optimization sequence
1. **Delivery API GET cache and request dedupe**
   - Cache only successful GET responses for a short TTL.
   - Scope cache keys by delivery API base URL, path, Shopify session bearer digest, and fetch implementation identity.
   - Return cloned payloads so caller mutation cannot corrupt cache.
   - Invalidate GET cache after successful POST/PATCH/DELETE mutations.
2. **Loader/query measurement tightening**
   - Keep loader timing fields explicit enough to compare Shopify, delivery API, and map initialization costs.
   - Include delivery-server order timing in `npm run perf:orders` summaries.
   - Extend tests before changing loader contracts.
3. **Shopify loader cache**
   - Cache departure location reads by authenticated shop key.
   - Return cloned payloads so a loader/action cannot mutate cached data.
   - Invalidate departure location cache after settings save.
4. **Map rendering stability/performance**
   - Preconnect to OpenFreeMap tile infrastructure before MapLibre is imported.
   - Avoid reinitializing map instances for filter-only state changes.
   - Keep marker/line updates source-driven and protect against map-not-loaded races.
5. **Server/API follow-up prompt, if needed**
   - If frontend caching exposes backend latency as the next bottleneck, define a separate backend prompt for route detail + same-day orders aggregation, OSRM geometry caching, and Shopify-store scoped cache invalidation.

## Stop condition
The goal is complete only when the primary evaluator passes after implemented optimizations and a completion audit maps each objective area—map, app loader, service wrapper, API consistency/performance—to concrete code/test evidence.
