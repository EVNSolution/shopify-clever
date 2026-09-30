# Store timezone screen audit

Scope: K-food embedded app, excluding Analytics. Production inspection was read-only on 2026-09-30. No routes, orders, drivers, settings, notification sends, or stored dates were changed. Screenshots and API diagnostics remain in the private local task workspace.

The existing Shopify timezone query returns `shop.ianaTimezone`; `shop-timezone.server.js` caches this per shop for 30 seconds. Route start and Tracking already had explicit route/store zones, while metadata and Inventory used independent UTC or browser-local formatters. The app loader now supplies the configured IANA zone through `useStoreTimeZone`; shared instant/date helpers apply the offset for the displayed date. Saved route-specific start zones remain authoritative. UTC serialization is unchanged. Date-only delivery/filter values remain calendar dates.

## Screen inventory and evidence

| Screen / surface | Live read-only inspection | Code / local evidence | Result |
| --- | --- | --- | --- |
| Orders list, ordered/processed/updated timeline, results timestamp | Inspected; existing timestamps are Toronto local | Explicit store-zone timeline/result tests; Seoul host | Existing formatting retained; app-zone fallback added |
| Orders order-date calendar | Opened, without submitting changes | Store-midnight filter tests; calendar starts from store date | Calendar dates preserved; instant fallback dates corrected |
| Orders delivery-date/day/area/type/state filters, sorting, grouping | Main list inspected; individual combinations not applied live | Existing filter suite plus store midnight cases; date-only comparisons and instant sorting audited | Store-local fallback day and reference date supplied |
| Orders map/item/note popovers | Not individually opened live | Audited: no additional instant formatter; shared order rows/timeline | Code evidence only |
| Orders bulk edit / route planning / add-to-route modals | Not submitted or individually opened live | Audited date-only delivery inputs and shared row/filter handling; existing tests | No production round-trip claimed |
| Inventory list, Changed time | Opened; current list empty | Shared formatter unit coverage; list call site supplies store zone | UTC slice replaced |
| Inventory detail Products | Opened with existing linked inventory | Actual component fixture in Seoul, Los Angeles, UTC | Output browser-local leak and fallback group day fixed |
| Inventory detail Orders, Start | Opened | Actual component fixture in three browser zones | Saved IANA start zone respected; ETA consumes full route-stop instant, with full date in its tooltip |
| Inventory History, collapsed updates, output/print timestamp | Existing history and output inspected; no print action | Actual component fixture includes summer/winter timestamps | History/output share store formatter |
| Routes list Start/Created/Last modified | Inspected; Start local, metadata UTC | Actual component fixture; summer/winter/midnight starts and metadata | Metadata fixed; previous Start fix preserved |
| Standalone route detail and stop popover | Opened | Shared Created/Updated helper and existing detail contracts | Created UTC leak fixed |
| Route group / child detail | Opened existing group and child | Shared component child/unassigned rows audited and contracts | Created/Updated use store zone |
| Start Time modal | Opened and closed without Apply/save | Existing wall-time conversion tests: API JSON round-trip, summer/winter, DST gap/fold; store-calendar fallback | Existing IANA/UTC contract preserved |
| Tracking and evidence / completion timestamps | Opened completed route; Toronto offset visible | Existing tracking suite and explicit IANA formatters audited | No Tracking/GPS change |
| Customer email dialog | Opened and closed; Preview/Send not invoked | Event/sent history formatter test, summer/winter | UTC history slice fixed; actual recipient-history view not inspected live |
| Route copy, delete, dispatch, line/stop edit, add-order, unsaved-change/notice dialogs | Not submitted or all opened live | Audited: date-only add-order filters or existing start picker; other dialogs have no timestamp formatter | Code/test evidence only; no production mutation claimed |
| Drivers list, Joined / last-seen search data | Inspected | Actual component fixture with midnight instant in Seoul, Los Angeles, UTC | Store-local date fixed |
| Drivers Invite / Download app dialogs | Opened and closed | No instant fields rendered | Pass |
| Drivers Edit name / Delete confirmation | Not opened/submitted live | No instant fields rendered | Code evidence only |
| Settings General | Opened | Cutoff is a wall-clock value; location/language have no instant display | Existing contract preserved |
| Settings Customer Notifications and branding example | Opened example; no save/upload/test send | Preview date is synthetic date-only text | Pass |
| Settings template editor / email-test panel | Not opened/submitted live | No stored instant formatter; static preview calendar values | Code evidence only |
| App home redirect and resource/auth/performance routes | No extra business screen | Route manifest and resource code audited | No additional time display; machine UTC telemetry preserved |
| Analytics | Excluded | No Analytics source change | Excluded |

## Inventory API dependency

The server previously returned `processedAt` as a UTC calendar prefix and `eta` as a UTC clock, losing the original instant. It also omitted saved start metadata from linked routes. A separate timezone-only API PR adds `processedAtInstant`, `estimatedArrivalAt`, `scheduledStartAt`, and `scheduledStartTimeZone`; existing fields and persisted values remain unchanged. The app groups by the new processed instant only when authoritative date-only delivery/order dates are absent and uses original ETA/start instants. No extra API request or data migration is added. Deploy the additive API contract before this app change; missing legacy ETA instants render empty rather than guessing an offset.

## Verification limits

Actual Inventory Products/Orders/history and Drivers fixtures passed under browser zones `Asia/Seoul`, `America/Los_Angeles`, and `UTC`. Routes fixtures also passed the same three browser overrides for Created/Modified and summer/winter/midnight Start values. The subsequent Orders fixture became unresponsive; no successful full Orders browser-zone fixture run is claimed. Production Orders and explicit-zone unit tests provide its current evidence. Synthetic fixtures block production requests and writes; framework prefetch is omitted from the Inventory harness only.

No production input/save/reload cycle was attempted. Serialization and re-display round trips are tested with synthetic values. Existing four schedule/plan-date discrepancies were not modified; their intended dates and historical cause remain unproven.

Local full verification, exact-head CI, and deployment readiness are reported in the PR after fresh checks. Production deployment remains pending separate review of this expanded scope. Raw GPS Shopify PR300 and server PR463 are excluded.
