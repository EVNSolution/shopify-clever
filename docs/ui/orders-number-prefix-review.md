# Orders number prefix correction

- App issue: https://github.com/EVNSolution/shopify-clever/issues/323
- Server issue: https://github.com/EVNSolution/clever-route-server/issues/484
- Change control: https://github.com/EVNSolution/clever-change-control/issues/311

Searching `2335` previously returned unrelated orders because the broad server predicate also searched addresses, phone numbers and internal identities. Orders search now compares only the displayed Order Number from left to right. `233` matches `#2335`; it excludes `#12335` and different numbers whose other fields contain `233`. An optional leading `#` is ignored. Merchant text prefixes are case-insensitive.

UI URLs retain `search` and legacy `q`. The BFF converts the query to `orderNumberPrefix` on every list/page/count/facets/map/selection request and removes broad `search`/`q`. Arrays and dates remain intact. The legacy local matcher uses the same number-only prefix behavior. The nonpaginated loader reloads when filters change, including clearing a search. Paginated results remain authoritative server results and are not filtered again in the browser.

The synthetic fixture mounts the actual Orders page. It now searches only Order Number and includes unrelated rows whose address or phone is `2335`. Run `node scripts/orders-table-browser-fixture.mjs --port 43827` from `apps/shopify-app`. Open `/` for pagination or `/?pagination=off` for the canonical fallback. This fixture does not call Shopify or the Delivery API.

## Validation

Before implementation, three focused regression tests failed: missing prefix transport, blank legacy `q` leakage and broad local matching. After implementation, six expanded transport and local-matching tests passed. The full app suite passed all 952 tests with no skips. Production build, TypeScript, scoped ESLint and public URL guard passed.

The real Orders component in the synthetic browser fixture returned only `#2335` for `2335`/`#2335`, excluding other rows with that address or phone. `23` returned 99 orders over two pages (`1–50`, then `51–99`). Frozen selection selected 98 eligible orders after excluding one cancelled order. Changing search cleared the selection. With pagination disabled, searching returned one row and clearing restored all 123 rows.

## Release boundary

The user explicitly authorized server and app implementation and deployment in this chat. Deploy server issue #484 first, then this app to KFood. Retain other server clients' broad search semantics. No schema, source data, notification or configuration change is required. Roll back the KFood app before reverting the additive server contract. Authenticated store acceptance remains the user's final check.
