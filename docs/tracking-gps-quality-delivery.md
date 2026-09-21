# GPS tracking quality delivery

Tracking: [change control 296](https://github.com/EVNSolution/clever-change-control/issues/296),
[Shopify 280](https://github.com/EVNSolution/shopify-clever/issues/280),
[server 432](https://github.com/EVNSolution/clever-route-server/issues/432).

## Authorized outcome

Implement and deploy server GPS correction and Shopify tracking presentation,
then reprocess the existing 2026-09-17 South route and verify its production map.
Raw driver events, delivery statuses, Shopify orders, and mobile completion flows
remain authoritative and unchanged.

## Implementation boundaries

- Preserve accuracy and measurement time through the derived GPS pipeline.
- Determine acquisition gaps before display simplification; never count removed
  samples as missing GPS.
- Preserve slow turns, U-turns, visits, route endpoints, and temporal anchors.
- Suppress stationary jitter and implausible outliers without connecting real gaps.
- Match cleaned time-ordered segments to roads using per-sample accuracy.
- Retain matched source coverage; replace only covered raw segments on the map.
- Separate planned, matched, and uncertain paths visually.
- Make the historical viewing window explicit and keep later-day/live positions
  from distorting the selected journey; retain an all-records view.
- Keep additions backward compatible; avoid database schema migration if the
  existing derived JSON contract can carry the required metadata.

## Regression and acceptance evidence

1. 101 samples every six seconds have zero acquisition gaps after processing.
2. 121 samples describing a slow 150m east / 150m north turn retain the turn.
3. Stationary noise, spikes, actual gaps, partial matches, and stale match caches
   have targeted regression coverage.
4. Existing tracking, route execution, and API tests pass; build/type checks pass.
5. Reviewed PRs and successful exact-SHA CI precede manual server/K-food deploys.
6. Historical rebuild defaults to dry-run, verifies route/tenant identity, stores
   host-only derived-row backup, uses lock/concurrency guards, and is repeatable.
7. Raw-event and route/stop-state invariants remain intact after rebuild.
8. Production runtime revision/health and authenticated South map are verified.

## Release and rollback

Use existing manual workflows and preserve prior runtime images. Rebuild only the
authorized route's derived tracking row. Keep host-only backup and scoped rollback
instructions. Do not include raw GPS, personal data, secrets, or production dumps
in Git. Automatic completion and DSV/UVIS tracking are outside this change.
