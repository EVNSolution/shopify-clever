# Original GPS points on the Tracking map

Shopify issue #297 / change-control #300. The map’s upper-right point icon toggles
between the existing dotted processed track and original observation circles on
**the same map**, following the user’s clarified request. There is no modal or
second map. Turning the mode off restores the processed trail, connector and
current-position layer. Stop/depot markers and the existing predicted route stay
visible. No GPS observations are connected into an inferred path. PR296’s removed
legend, all-dates controls, date badge and yellow inferred line remain removed.

`gpsPoints=raw` is transient presentation state. Browser Back reverses a toggle;
exit removes only this field and preserves embedded context. The point session is
remounted on route, embedded host/shop, map generation, service date or timezone
change. Closing cancels reads and removes only the owned point layer/source.
Live processed updates respect the point mode, so they cannot restore the dotted
layers while the original source is active. The matching/quality algorithms and
processed geometry are unchanged.

## Authority and provenance

Server source of truth:
[PR463 contract at 4c3ba418203ce95d02cfb696bb8e32d4a5de6581](https://github.com/EVNSolution/clever-route-server/blob/4c3ba418203ce95d02cfb696bb8e32d4a5de6581/apps/delivery-api/docs/api/original-observations.md)
and its [OpenAPI](https://github.com/EVNSolution/clever-route-server/blob/4c3ba418203ce95d02cfb696bb8e32d4a5de6581/apps/delivery-api/docs/api/openapi.yaml).
That draft is not proof of deployment. The UI is safe before availability.

The authenticated Shopify resource
`GET /app/route-original-observations/:routePlanId` proxies
`GET /admin/route-plans/:routePlanId/tracking/original-observations`.
It authenticates the administrator, forwards the existing bearer and the
server-configured app ID, and rejects unknown/repeated observation query fields.
Embedded context fields do not choose tenant/app/driver scope. No cookies,
upstream credentials or client app-ID override are forwarded. Responses and
requests use `no-store`; no observation logging/cache/export/storage is added.
The service’s verified administrator session owns tenant/route authorization;
missing and foreign routes share its 404. A frontend route ID check additionally
rejects an unexpected route in a successful response.

Only `schemaVersion:1`, `DRIVER_EVENT_LOCATION_UPDATED`, `CURRENT_ASSIGNMENT`
responses with the requested route/window/limit are accepted. `recentPositions`,
recorded geometry, OSRM vertices, DSV history and reconstructed fixes are never
substituted. This view covers retained events of the current driver/assignment
generation, not all sensor fixes or historical assignments.

## Bounds, time and quality

From/to are mandatory valid UTC ISO timestamps ending in Z, zero to six fractional
digits, `[from,to)` and at most 24 hours. Default: service-date local midnight plus
24 elapsed hours. DST can move the local end; this bounded window can differ from
the main processed map’s service-day plus next-day window. A compact expandable
control shows the exact UTC window, local IANA zone/offset and editable UTC fields.

Pages have 200 observations, within the server maximum 500. Explicit Load more
fetches an opaque cursor with the identical window/limit and fresh admin token.
The snapshot cutoff must remain fixed, native microsecond chronological tuples
must strictly increase, and returned/cumulative counts must agree with loaded
pages. No automatic unbounded paging occurs. At most 5000 records are retained by
one traversal. `capReached` means additional records exist, not a total count;
exactly 5000 complete records are distinct from a truncated traversal. Only one
page’s keyboard selector is rendered at a time.

Every observation remains counted, including missing/invalid/redacted coordinate
pairs and accuracy. Partly available coordinate values remain visible in details,
but only `VALID` pairs become map Points. Distinct equal-coordinate observations
remain distinct records; overlapping circles need not be visually separable.
Accuracy zero is valid, missing/invalid/redacted accuracy is explicit, and no
accuracy is inferred. Point click or the keyboard selector opens compact details
showing coordinates, quality, observation time and storage time. UTC text retains
microseconds; local text adds the IANA zone and numerical UTC offset. Observation
time is client supplied, storage time is server persistence time. The event ID
and optional scoped client event key remain available without raw payload data.

Loading/cancellation/error/empty are distinct. 409 assignment changes and invalid
or expired cursors clear the traversal and require explicit restart. 404/501 and
upstream absence show unavailable, never success-empty or processed fallback.
READ_TIMEOUT asks for a smaller window. Close/navigation/window replacement abort
and generation checks reject stale token/network responses, including transports
that ignore abort. No merge or deployment is authorized by this work.

## Read-only explanation of the dotted appearance

The original processed trail remains a MapLibre `line` with round caps/joins,
width `3.5`, dash array `[1.5,1.25]`; its connector uses width `2.5`, dash array
`[0.8,1.8]`, round caps. The current-position circle has radius `8`. Short round
dashes, zoom and fragmented accepted coverage can look pointlike. This is a
style/data inference, not a claimed diagnosis of a particular live image.
The user-requested mode changes layer visibility only, not the algorithm.

## Synthetic browser proof and release boundary

Run from `apps/shopify-app`:
`node_modules/.bin/vite --config scripts/gps-preview.config.mjs`.
The loopback fixture uses the production point controller, toolbar and MapLibre
layers with an offline synthetic background and fake authenticated responses.
Modes cover paging, quality, empty, unassigned, unavailable, timeout, slow reads,
assignment/cursor failure, foreign responses and cap. It is not authenticated
K-food runtime proof. The production route is not a fixture route and no runtime
preview bypass is added. Server/mobile/batch/DSV files are not changed.

Server deployment and authenticated K-food verification remain a separate,
explicitly authorized release decision. The user explicitly prohibited deployment.
Context-monorepo update: not-needed; this additive owner-repo runtime behavior
changes no global rules, shared terms or template registry.
