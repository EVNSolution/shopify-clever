# CLEVER Shopify App Design Source of Truth

- Status: Active
- Last updated: 2026-09-22
- Applies to: `apps/shopify-app`, with current emphasis on route detail and tracking operations

## Brand

CLEVER is an operational routing product. The interface should feel dependable, calm, and information-dense rather than promotional. Neutral surfaces and restrained status colors keep attention on exceptions and current work.

## Product goals

- Let an operator understand route state, driver assignment, progress, and exceptions at a glance.
- Preserve a clear boundary between planned route data and recorded GPS evidence.
- Keep Shopify-origin order and customer data read-only while making CLEVER operational state legible.
- Reveal technical evidence when needed without letting it dominate routine monitoring.

## Personas and jobs

- Dispatcher: confirm who is driving, where the route stands, and whether intervention is needed.
- Operations manager: review completed routes and evidence without reconstructing events from raw records.
- Support engineer: inspect connection, execution events, GPS counts, and gaps when diagnosing a report.

## Information architecture

- Route header: route identity, lifecycle status, dispatch state, and last update.
- Primary navigation: Stops, Inventory, Tracking, and Add orders.
- Route controls: scheduled start, driver, and execution status.
- Map: spatial route and GPS evidence. Map internals are owned by the map feature and are not restyled by shell-only work.
- Operational summary: driver, delivery progress, latest position, and GPS gap signal.
- Evidence disclosure: connection state, execution events, return-to-depot evidence, point counts, and recorded range.
- Stop table: authoritative ordered stop detail.

## Design principles

1. Put the operator's next decision before diagnostic detail.
2. Use one cohesive surface instead of a row of oversized dashboard cards.
3. State unavailable or missing evidence explicitly; never fabricate operational values.
4. Keep live state, historical evidence, and planned route concepts visibly distinct.
5. Preserve stable placement for controls and status across route states.

## Visual language

- Canvas: Shopify admin neutral background.
- Surfaces: white with `#e3e3e3` borders and 8–12 px radii.
- Primary text: `#202223`/`#303030`; secondary text: `#616161`/`#6d7175`.
- Active navigation: quiet blue-gray tint with a strong dark label; avoid decorative gradients.
- Status color is semantic and sparing. A small dot or badge is preferred to a full colored card.
- Type scale: 11–12 px labels, 13–14 px operational values, 16 px section emphasis.

## Components

- Section tabs use a generous hit area, visible selected state, and count pills where counts exist.
- Tracking status band summarizes mode, current label, freshness, driver, and delivered progress before the map.
- Tracking summary is a single bordered region with a four-column primary grid.
- Tracking evidence uses a native disclosure so keyboard and assistive technology behavior remain reliable.
- Tables remain the primary detailed operations surface.

## Accessibility

- Controls retain native button, checkbox, details, and summary semantics.
- Selected tabs expose `aria-pressed`; grouped operational regions have specific accessible labels.
- Status is communicated with text in addition to color.
- Focus indicators must remain visible and hit targets should be at least 36 px high.

## Responsive behavior

- Tabs may horizontally scroll instead of shrinking labels beyond recognition.
- The primary tracking grid collapses from four columns to two, then one on narrow screens.
- Evidence metrics wrap into fewer columns while retaining label/value pairs.
- The map height remains independently resizable and is not changed by shell layout work.

## Interaction states

- Loading: retain the current layout and label the pending connection or data state.
- Live: emphasize current tracking state and freshness without animating the whole surface.
- Historical/completed: show recorded/completion language rather than implying a live connection.
- Unavailable: use an explicit dash or unavailable label, never a synthetic value.
- Error: use existing route-level banner/error treatment and keep diagnostic evidence available.

## Content voice

Use concise operational English consistent with the existing app. Prefer concrete labels such as “Latest position,” “GPS gaps,” and “Tracking evidence.” Avoid celebratory or marketing copy.

## Implementation constraints

- Do not change map layers, controls, legend behavior, marker styling, or geometry as part of shell UI work.
- Preserve the existing tracking data contract and `gps_quality.v4` API compatibility.
- Do not add dependencies for layout or presentation.
- Keep route state and evidence derived from existing server payloads.

## Open questions

- Whether route tracking labels should be fully localized with the rest of the route detail surface.
- Whether Inventory should receive a count once a single authoritative inventory count is available in this view.
