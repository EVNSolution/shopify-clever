# KFood Route Detail: Total time, and no Original shipping total

Date: 2026-10-10. Scope: Route Detail in `apps/shopify-app`. No server, driver app, Shopify order data or ETA calculation change.

## Change

- Route Detail shows `Total time`: the planned End minus the Start of the route, so drive time, waits for time windows and every Stop time. It is computed with the same inputs as the End row of the stop table (`getRoutePlannedTotalSeconds` next to `getPlannedRouteEndAt`), so the two always agree. The owner's route (Start 16:30, 45 min of driving, 25 min of Stop time, End 17:40) reads `1 hr 10 min`.
- Where: a column before `Total drive time` in the route summary table, and the first item of the totals line below the stop table. In a route group the All routes totals row shows the sum, or `–` when one route has no value.
- It reads `–` when the End row has no planned time (no start time, a stop without an ETA leg or a Stop time).
- `Total drive time` and `Total distance` are unchanged.
- The `Original shipping total` item of the totals line is removed, with its label helper and its three translation keys. It summed the Shopify shipping price snapshot of each order and read "Unavailable - N order(s) have no original shipping snapshot" when one order had none. The order data and `summarizeChildRouteMoney` are not changed.

## Verification

Unit tests: the helper (the 45 + 25 = 70 min case equals End minus Start of `buildRouteEndpointPresentation`; the wait for a time window; end at last stop; unknown without a start time, a Stop time or a leg), the All routes summary (sum, and `null` when one route has no value), and the source checks of the table header order, the totals line and the removed item. The suite (1,178 tests), typecheck, production build and public URL guard pass.

Local preview of the real Route Detail page (`scripts/live-route-change-browser-fixture.mjs`, stops with an 8 min leg added for the check only): Start 09:00, End 11:10, summary table `Total time 2 hr 10 min`, `Total drive time 1 hr 30 min`, totals line `Total time: 2 hr 10 min`, no Original shipping item. Without a leg the same page shows `–` in both the End row and Total time.

After the deployment the check on K-food is view only.
