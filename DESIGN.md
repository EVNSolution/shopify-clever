# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-08-24
- Primary product surfaces: Shopify Admin route list, route detail Tracking tab, tracking map overlay, operational alerts, driver sync-status surface, system notifications, customer-notification operations.
- Evidence reviewed:
  - `apps/shopify-app/app/routes/app.routes.$routeId.jsx`
  - `apps/shopify-app/app/features/delivery/route-tracking.js`
  - `apps/shopify-app/app/ui/info-pill.jsx`
  - `apps/shopify-app/app/ui/operational-pill-group.jsx`
  - `apps/shopify-app/app/features/delivery/operational-state.js`
  - `apps/shopify-app/app/styles/global.css`
  - `apps/shopify-app/tests/route-tracking-live.test.mjs`
  - `apps/shopify-app/tests/route-tracking-contract.test.mjs`
  - 2026-08-20 through 2026-08-23 Kitchener, South, Oshawa, K-food, and customer-email operations audit.
- Decision scope: operational state presentation and alert hierarchy. This document does not redefine route-planning or order-management workflows.
- Observed evidence: the Delivery API list contract supplies one optional `operationalState` per route in the existing batch response; detail/tracking snapshots can carry the same contract. The Shopify app owns queryable token-sync health, while the other Settings dependencies do not yet expose verified app-consumable health evidence.
- Assumption: alert thresholds remain server-owned. The UI maps server evidence and only derives the Device-to-Server arithmetic gap and the invariant “completed with unresolved results” contradiction.

## Brand

- Personality: calm, precise, operationally accountable, and easy to scan under time pressure.
- Trust signals: explicit data source, explicit freshness, explicit confirmation state, and direct acknowledgement of unavailable data.
- Avoid:
  - Joining independent operational facts with middle dots, bullets, slashes, or prose separators.
  - Presenting GPS proximity as delivery confirmation.
  - Presenting device-local progress as server-confirmed progress.
  - Relying on color alone or using decorative status dots without text.
  - Showing a healthy route label while a synchronization or progress mismatch is active.

## Product goals

- Goals:
  - Let an operator distinguish physical location, device-local workflow, server-confirmed results, and synchronization health in under five seconds.
  - Surface a Kitchener-style split state before a route reaches its final stop.
  - Use one reusable Pill grammar across route lists, route details, maps, alerts, and in-app driver status.
  - Preserve detailed diagnostics without making the default operational view noisy.
- Non-goals:
  - Inferring delivery completion from GPS.
  - Replacing detailed event history with Pills.
  - Adding a separate design system when the existing `InfoPill` can be extended.
  - Claiming device-local state in Shopify Admin until sync-health telemetry exists.
- Success signals:
  - Operators can correctly answer “where is the driver?”, “what did the device advance to?”, “what did the server confirm?”, and “is sync healthy?” independently.
  - A route with a progress gap of two or more stops is visible in both the route list and detail view.
  - No operational summary combines state values with `·`.
  - Critical sync states remain visible without hover, map interaction, or opening a secondary tab.

## Personas and jobs

- Primary personas:
  - Dispatcher or operations administrator monitoring active routes.
  - Support engineer diagnosing missing events or delayed delivery results.
  - Driver checking whether route work has reached the server.
- User jobs:
  - Identify live physical position without confusing it with completion.
  - Compare local and confirmed progress.
  - Find routes that require intervention and understand why.
  - Preserve and inspect queued-event evidence before reset or sign-out.
- Key contexts of use:
  - Desktop Shopify Admin with multiple routes open.
  - Narrow embedded-admin viewport.
  - Driver phone in an active route with intermittent connectivity.
  - Incident review after the route date has passed.

## Information architecture

- Primary navigation: Routes list -> Route detail -> Tracking -> Sync diagnostics or Event history.
- Core routes/screens:
  - Routes list: route lifecycle plus one independent synchronization-health Pill.
  - Route detail header: lifecycle Pill cluster visible on every tab.
  - Tracking map: GPS/freshness and server progress Pills over the map, with diagnostics below.
  - Tracking summary: source-separated operational state followed by descriptive metrics.
  - Sync diagnostics drawer/panel: queue depth, oldest queued event, last successful acknowledgement, last error code, retry count, and evidence-preservation warning.
  - Driver active route: server confirmation and sync queue Pills above the current task.
- Content hierarchy:
  1. Severity and intervention requirement.
  2. Independent source states: GPS, Device, Server, Sync.
  3. Route identity and driver.
  4. Event timing and diagnostic detail.
  5. Raw event history.

## Design principles

- Source before status: every operational Pill names its source or domain, such as `GPS`, `Device`, `Server`, or `Sync`.
- Confirmation is explicit: only server-acknowledged stop results use confirmed or delivered wording.
- One Pill, one claim: a Pill must not contain two independent facts joined by punctuation.
- Gaps are first-class: disagreement between sources is its own derived `Gap` or `Sync` Pill, not hidden in a tooltip.
- Unknown is honest: unavailable device telemetry displays `Device unavailable`; it is never inferred from GPS.
- Severity is actionable: warning and critical Pills must open or sit next to the diagnostic action that explains recovery.
- Progressive disclosure: the first row stays compact; timestamps, error codes, and event IDs live in details.
- Tradeoffs:
  - More Pills improve source clarity but can create visual noise. Preserve every independent fact, wrap the group, and use progressive disclosure for timestamps and error codes.
  - Short labels improve scan speed. Full timestamps and explanations remain available through adjacent details and accessible labels.

## Visual language

- Color:
  - Neutral: factual, unavailable, stopped, or historical state.
  - Info: live GPS or contextual navigation state.
  - Success: current and server-confirmed healthy state.
  - Warning: delayed, partial, or review-required state.
  - Critical: blocked sync, contradictory completion, or missing confirmation requiring intervention.
  - `pickup` remains supported for existing order semantics; operational live-state design adds a separate `info` tone rather than overloading `pickup`.
- Typography:
  - Pill text: 12px, semibold, sentence case.
  - Use tabular numerals for counts and elapsed time where supported.
  - Do not abbreviate source names into ambiguous initials.
- Spacing/layout rhythm:
  - Pill cluster uses `display: flex`, `flex-wrap: wrap`, and a 6px gap.
  - 8px vertical separation between severity row and source-state row.
  - No punctuation characters are inserted between sibling Pills.
- Shape/radius/elevation:
  - Reuse the existing 999px `InfoPill` radius.
  - Pills have no shadow. Alert containers may use a 1px semantic border.
- Motion:
  - No pulsing or blinking status.
  - Live updates may use a subtle 120ms background transition while respecting reduced motion.
- Imagery/iconography:
  - Text is mandatory. Icons are optional and never replace the source label.
  - The existing map marker dot remains a map symbol, not an operational-status separator.

## Components

- Existing components to reuse:
  - `InfoPill` for semantic status.
  - Existing map panel, tracking summary, and operational alert container.
- New/changed components:
  - `InfoPill` adds `info` tone and optional `ariaLabel`; it remains non-interactive by default.
  - `OperationalPillGroup` owns wrapping, gap, and group label semantics.
  - `mapRouteOperationalState` is the single pure mapper from the server contract into ordered Pills.
  - `SyncDiagnostics` renders queue and acknowledgement details as label/value rows rather than a dense Pill cloud.
- Variants and states:
  - GPS: `GPS live`, `GPS 2m delayed`, `GPS offline`, `GPS unavailable`.
  - Position: `Near stop 11`, `Position unavailable`.
  - Device: `Device 11/11`, `Device unavailable`.
  - Server: `Server 1/11`, `Server complete`, `Server unavailable`.
  - Sync: `Sync healthy`, `Sync 10 pending`, `Sync blocked`, `Sync unknown`.
  - Gap: `Gap 10 stops`, shown only when independently calculable.
  - Route lifecycle remains separate: `Ready`, `In progress`, `Completed`, `Cancelled`.
- Pill ordering:
  1. Severity when warning or critical.
  2. GPS freshness.
  3. Physical position.
  4. Device-local progress, when reported.
  5. Server-confirmed progress.
  6. Sync state or derived gap.
- Token/component ownership:
  - Pill visual tokens remain in `apps/shopify-app/app/styles/global.css`.
  - Pill normalization remains in `apps/shopify-app/app/ui/info-pill.jsx`.
  - Operational state derivation belongs in `apps/shopify-app/app/features/delivery/operational-state.js`, not inside JSX rendering.
  - Route-detail JSX composes normalized presentation and does not infer new states.

## Operational state model

The UI consumes the server's `RouteOperationalStateV1` evidence through one normalized presentation mapper:

```js
{
  activeAlerts,
  deviceProgress,
  observedAt,
  physicalPosition,
  routePlanId,
  routeStatus,
  serverProgress,
  syncHealth,
}
```

- Missing `deviceProgress`, `syncHealth`, or `physicalPosition` remains explicit `Unknown`; legacy rows without `operationalState` use the same fallback.
- Stale or low-accuracy GPS may retain freshness and accuracy evidence, but `reliableForProximity: false` prevents a nearby-stop claim.
- GPS-nearest-stop may contribute to a warning but must never populate the Device or Server fields.

## Severity rules

- Healthy:
  - GPS is live or intentionally historical.
  - Queue depth is zero when device telemetry is available.
  - Device and server progress agree.
- Warning:
  - GPS is delayed beyond server policy.
  - Oldest queued workflow event is at least 5 minutes old.
  - GPS is near a later stop while earlier server results remain unresolved.
  - Device/server gap is one stop for at least 5 minutes or two or more stops at any time.
- Critical:
  - A route claims completion while any stop result remains unresolved.
  - Device claims final stop or local completion while the server remains behind.
  - GPS tracking stops while the server remains `IN_PROGRESS` and unresolved.
  - Oldest queued workflow event is at least 60 minutes old or a non-retryable sync error is present.
- Unknown:
  - Required telemetry is absent. Unknown does not downgrade an independently known warning or critical condition.

## Surface specifications

### Route list

- Keep lifecycle in its existing Pill.
- Render lifecycle, GPS freshness/position, Device, Server, Sync, Gap, and Alert as independent Pills from each row's optional `operationalState`; do not concatenate labels.
- Critical routes sort above warning routes within the selected business sort unless the user explicitly changes sorting.
- Row accessible name includes the full reason and last confirmed time.

### Route detail header

- Always show lifecycle and operational severity as separate Pills.
- When a warning exists, show `Review sync` or `Critical sync` before the source Pills.
- The header must remain meaningful even when the Tracking tab is not selected.

### Tracking map

- Use a wrapping Pill group sourced from the same mapper as list and detail.
- Kitchener evidence example:
  - `GPS fresh`
  - `GPS Stop 11 nearby`
  - `Device 11/11`
  - `Server 1/11`
  - `Sync blocked`
  - `Gap 10 stops`
- Detailed “double-click marker” help remains outside the Pill label and is available as map help text.

### Tracking summary

- The first row is the operational Pill group.
- Keep descriptive metrics such as Driver, GPS records, Displayed points, and Range as label/value content, not Pills.
- Rename generic `Progress` to `Server-confirmed results`.
- Do not show a generic `Driver stage` as authoritative if it is derived only from server events; label it `Server stage`.

### Operational alert

- Structure:
  - Severity Pill: `Review sync` or `Critical sync`.
  - Title: one sentence naming the contradiction.
  - Body: one or two sentences with exact source values.
  - Action: `View sync details`.
- Example:
  - Pill: `Critical sync`
  - Title: `Route progress is not reaching the server`
  - Body: `GPS is near stop 11. The server confirms 1 of 11 stops. GPS proximity is not delivery confirmation.`
- Do not repeat the same status values in a dot-separated title.

### Driver in-app status

- Render a Pill group above the current task:
  - `Device 11/11`
  - `Server 1/11`
  - `Sync 10 pending`
- While sync is blocked, the current task may remain visible, but route completion is not presented as server-complete.
- `View sync details` shows queued item count, oldest age, last error, and last successful server acknowledgement.
- Sign-out, reset, or data-clearing actions display an evidence-loss warning whenever queue depth is greater than zero.

### Native system notification

- Android/iOS notification layouts cannot reliably render application Pill components.
- Use separate labeled lines and line breaks, never middle dots:

```text
Sync delayed
Device progress 11 of 11
Server confirmed 1 of 11
10 updates waiting
```

- The notification tap target opens the in-app Pill summary and sync diagnostics.

### Email and administrator notifications

- HTML email may render semantic badges, but plain-text fallback uses separate labeled lines.
- Alert payloads carry structured source fields rather than a prejoined status sentence.
- Missing notification runtime configuration is represented as `Notifications disabled` or `Delivery unavailable`, never as an implicit healthy state.

## Accessibility

- Target standard: WCAG 2.2 AA for Shopify Admin web surfaces.
- Keyboard/focus behavior:
  - Non-interactive Pills are not focusable.
  - Interactive Pill-like controls use a button or link element and visible focus state.
  - Diagnostic actions follow the Pill group in keyboard order.
- Contrast/readability:
  - Every tone meets AA contrast against its background.
  - Every Pill includes a visible text label; color is supplemental.
- Screen-reader semantics:
  - `OperationalPillGroup` has a concise group label such as `Route operational status`.
  - Dynamic warnings use `role="status"`; critical intervention states use `role="alert"` only when newly introduced.
  - Elapsed times expose a full timestamp through `aria-label` or adjacent details.
- Reduced motion and sensory considerations:
  - No blink or pulse.
  - State transition animations are removed under `prefers-reduced-motion`.

## Responsive behavior

- Supported breakpoints/devices: Shopify embedded desktop/tablet widths and narrow mobile administration widths down to 320px.
- Layout adaptations:
  - Pill groups wrap by item and never use horizontal scrolling.
  - On narrow widths, severity occupies the first row and source Pills wrap below.
  - Labels remain intact; do not truncate `Server 1/11` into an ambiguous value.
  - Diagnostic details become a single-column label/value list.
- Touch/hover differences:
  - Hover title is supplemental only.
  - Touch users reach the same diagnostics through an explicit action.

## Interaction states

- Loading: `GPS loading`, `Server loading`; do not display stale values without their timestamp.
- Empty: `GPS unavailable`, `Device unavailable`, or `Server unavailable`, naming the missing source.
- Error: severity Pill plus concise error; raw codes live in diagnostics.
- Success: `Sync healthy` appears only when the available sources agree and queue depth is known to be zero.
- Disabled: use a neutral Pill and explanatory label, such as `Tracking not started`.
- Offline/slow network:
  - Driver app keeps `Device` and `Server` progress separate.
  - Admin shows last known GPS age and server-confirmed progress.
  - Queue status survives restart and remains visible until acknowledgement or explicit evidence-preserving resolution.

## Content voice

- Tone: factual, calm, and specific. Avoid blame and false reassurance.
- Terminology:
  - `GPS` means physical telemetry only.
  - `Device` means local workflow state reported by the driver app.
  - `Server` means acknowledged driver-event state.
  - `Sync` means the transport and queue relationship between Device and Server.
  - `Delivered` is used only for a server-confirmed terminal delivery event.
- Microcopy rules:
  - Use sentence case: `Sync delayed`, not `SYNC DELAYED`.
  - Prefer counts: `Server 1/11`, `Sync 10 pending`.
  - Do not use middle dots or inline bullets to separate operational claims.
  - Do not use `Current position` to describe a workflow stop. Use `Near stop 11` for GPS and `Device 11/11` for workflow.
  - Do not say `Complete` without naming the authority when sources can disagree.

## Implementation constraints

- Framework/styling system: React Router Shopify embedded app with existing React components and repo-local CSS.
- Design-token constraints:
  - Extend existing `InfoPill`; do not add a second Badge/Pill system.
  - Preserve current `success`, `warning`, `critical`, `neutral`, and `pickup` behavior.
- Performance constraints:
  - Operational presentation is derived with pure functions and memoized in route detail.
  - Live SSE updates must not rebuild the map.
- Compatibility constraints:
  - List rows, detail, and tracking tolerate an absent optional `operationalState` and show explicit Unknown Pills.
  - Settings shows verified Shopify-token health; unexposed runtime dependencies remain Unknown instead of inferred healthy.
- Test/screenshot expectations:
  - Contract tests assert no operational text contains the middle-dot separator.
  - Unit tests cover Pill ordering, tones, missing telemetry, severity thresholds, and GPS/server mismatch.
  - Route list and route detail tests verify the same normalized state produces consistent Pills.
  - Responsive screenshot checks cover wide, embedded narrow, and 320px layouts.
  - Accessibility checks cover roles, names, contrast, focus, and dynamic alert behavior.

## Delivery phases

### Phase 1: truthful server-side presentation (implemented)

- Replace the combined map freshness sentence with GPS and Server Pills.
- Convert the operational warning header to severity Pill plus structured copy.
- Rename ambiguous metrics to `Server stage` and `Server-confirmed results`.
- Add route-list sync-review Pill derived from GPS/server mismatch.
- Add tests preventing dot-separated operational copy.

### Phase 2: device sync-health telemetry (server contract implemented)

- Consume independent heartbeat evidence supplied by `deviceProgress` and `syncHealth`.
- Report local stop, queue depth, oldest queued age, last error code, and last acknowledgement in diagnostics when exposed.
- Device, Sync, and Gap Pills are present in Shopify Admin; driver-app presentation remains a separate implementation surface.
- Add alert transitions and durable audit records.

### Phase 3: intervention and recovery

- Add sync diagnostics with evidence preservation.
- Add safe retry/reconcile actions with explicit authorization and audit trail.
- Add route-list prioritization and administrator notifications for warning/critical transitions.
- Verify that route completion cannot appear healthy until the server acknowledges all required terminal events.

## Acceptance criteria

- No operational state row uses `·`, bullets, or slash-separated prose to join independent claims.
- GPS, Device, Server, and Sync are rendered as separate Pills whenever their data is available.
- Missing Device telemetry is explicitly unavailable and never inferred from GPS.
- A Kitchener-shaped state renders `GPS Stop 11 nearby`, `Device 11/11`, `Server 1/11`, `Sync blocked`, and `Gap 10 stops` as separate Pills.
- A completed route with unresolved stop results renders `Alert unresolved results` on the route list, detail header, and Tracking tab.
- Native notifications use separate labeled lines and contain no middle dots.
- The full reason and source timestamps are accessible without relying on color or hover.
- Existing unrelated `InfoPill` uses continue to render unchanged.

## Open questions

- [ ] Confirm initial warning/critical timing thresholds against operational SLA. Owner: Operations. Impact: alert volume.
- [ ] Expose one authenticated aggregate runtime-health endpoint for webhook ingest/consumer, email sender/outbox, sync detector, tracking/alert streams, and external log sink. Owner: API/Operations. Impact: Settings currently renders those facts as Unknown.
- [ ] Decide whether route-group summary rows should aggregate child operational severity or remain Unknown. Owner: Product/API. Impact: group-only rows currently do not infer child state.
- [ ] Define retention and redaction rules for `lastErrorCode` and queue evidence. Owner: Security/Operations. Impact: incident diagnostics.
