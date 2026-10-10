# KFood Tracking: switch the map between the dotted route and the original GPS points

Date: 2026-10-10. Scope: Route Detail Tracking tab in `apps/shopify-app`. No server, driver app, Shopify data or production data change. Nothing is stored or exported.

## Change

- The map toolbar of the Tracking tab has a points icon (`aria-pressed`, `gpsPoints=raw` in the URL). It switches the same map from the dotted tracking line to one circle per original GPS point the driver app sent, with nothing left out and nothing joined into a line. Turning it off, or `Back to dotted track`, brings the dotted tracking back. The Stops tab map has no such icon.
- A strip under the map says `Original GPS · N loaded · M plotted`. Every point is counted; only a point with a valid coordinate pair is drawn. A collapsed section shows the exact window and, for the selected point, its coordinates, accuracy, observed time and stored time.
- The work is the closed PR #300 (head `6962760`, kept in change-control #300) ported onto current main: the same modules, tests, preview fixture and contract document, one merge conflict (the route-file list of `navigation-contract.test.mjs`). The server read is `GET /admin/route-plans/:id/tracking/original-observations` (clever-route-server PR #463). Its contract is unchanged between the draft #300 was written against and the deployed server.
- New in this port: the pages of 200 points now follow one another automatically up to the 5,000-point cap (at most 25 reads for one toggle), so the map shows every point without a click. While pages are on their way the strip says `N loaded · loading more…`. Cancel stops the loading and Load more resumes it. #300 had an explicit Load more for every page.
- Unchanged from #300: the app resource `/app/route-original-observations/:routePlanId` proxies the server read with the administrator session (query and cursor checked, no cache, no log); empty, unavailable (404, 501), timeout, changed-assignment and expired-cursor states are told apart and never fall back to the processed trail.

## Verification

Unit tests: the 28 tests of #300 (contract validation, paging, cancel and stale responses, map layers, proxy, URL toggle, time window) pass on current main, and 4 new tests pin the automatic loading, Cancel, Load more, the strip text and the toggle wiring.

The synthetic preview of #300 (`node_modules/.bin/vite --config scripts/gps-preview.config.mjs`, real MapLibre layers on an offline background):

- 202 points loaded in two reads without a click, `202 loaded · 199 plotted` (three points have a missing, invalid or redacted coordinate pair), the dotted trail hidden.
- The cap case loaded 25 pages without a click and stopped at `5000 loaded · 4997 plotted` with "5,000-point cap reached".
- Cancel while loading stopped the loading and stayed stopped; Load more resumed it up to the cap.

The real Route Detail page against synthetic transport (`scripts/route-status-browser-fixture.mjs`; the route with a UUID id now serves 450 synthetic points, 200 per page; its map is a stub):

- The points icon is absent on the Stops tab and present on the Tracking tab. Turning it on set `gpsPoints=raw`, made three reads (first, 200, 400) and showed `450 loaded · 449 plotted`.
- Browser Back removed the parameter and the strip, Forward restored them, and `Back to dotted track` removed them again.

![The Tracking tab with the points icon pressed and the strip under the map](assets/kfood-tracking-raw-gps-toggle-page-20261010.jpg)

![Original points on the same map (synthetic preview): the dotted trail is hidden and the planned route and stops stay](assets/kfood-tracking-raw-gps-points-preview-20261010.jpg)

Not covered locally: the real page draws on a stubbed map in the fixture, so the circle layer was seen only in the preview. Authenticated KFood data is checked after the manual deployment, view only.

## Follow-up: points not drawn on the real map

The authenticated KFood check after the first deployment showed the strip counting `1838 loaded · 1838 plotted` while the map showed no circles. The points were gated on `map.isStyleLoaded()`, which is false while any tile is loading; the page's own layers only need the map to have a style (`isRouteDetailMapStyleReady`). The first sync, at an idle moment, created the source and hid the dotted trail, and the later pages were skipped, so the source stayed empty.

Reproduced on the preview with `?slowTiles=1` (a raster source whose tiles never arrive, `isStyleLoaded()` false): with the old code the strip said `202 loaded · 199 plotted` and the map had no circles; with the points code using the page's readiness check all 199 circles are drawn while `isStyleLoaded()` stays false. Two unit tests cover drawing and removing with `isStyleLoaded()` false and a map without a style.

## Second follow-up: points drawn under the plan line

After the readiness fix was deployed, the authenticated KFood check still showed no red circles along the route while the strip said `1838 loaded · 1838 plotted`. Where the driver followed the planned route, the map showed a blue-gray dotted chain. Only where the driver left the plan (no plan line there) did red circles with a white outline show. The points were drawn, under the semi-transparent plan line.

Cause: every marker sync of the page ends with `syncRouteDetailLineOrder`, which moves the plan line, the tracking connector and the tracking trail to just below the first marker layer. The points layer was inserted once, before the departure pin, and was not part of that stack. The next marker sync put the plan line over it. The synthetic preview draws its own plan and pin layers and never runs a marker sync after the points are added, so it showed the points on top.

Fix: the points layer is now the last layer of the stack that `syncRouteDetailLineOrder` re-asserts (plan, connector, trail, points, then the pins), and it is placed with the same function when it is first added. Test `original GPS points stay above the plan and below the pins through every load order and refresh` runs the real plan, GPS, marker and points syncs in all 24 load orders and then repeated refreshes. It checks that the points are above the plan, the connector and the trail and below the pins and the latest position. It fails on the old code.

Local check (a throwaway fixture that renders the real Routes page with real MapLibre against synthetic transport; not committed): with the old code the points show as a blue-gray dotted chain with red edges, with the new code as a red chain with a white outline above the plan line and below the pin.

![Before: the plan line covers the points](assets/kfood-tracking-raw-gps-under-plan-before-20261010.jpg)

![After: the points are above the plan line](assets/kfood-tracking-raw-gps-above-plan-after-20261010.jpg)

