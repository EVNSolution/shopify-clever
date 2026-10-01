# Design

## Source of truth

- Status: Active
- Last updated: 2026-10-01
- Applies to: `apps/shopify-app`, with current emphasis on Orders filters and route detail/tracking operations

- Evidence: actual Safari interactions on EasyRoutes and CLEVER K-food Orders (2026-10-01), existing Orders filter component and v2 contract. See [interaction evidence](docs/ui/orders-filter-interaction-review.md). No component gallery or Storybook exists in this repo; the Orders component and this document own the pattern.

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
- Show the same detailed stop/order table on a standalone route, a saved child route, and the group All routes view. All routes prepends route identity and includes every child-route stop plus the explicit Unassigned row set; keep the route summary and timeline available alongside it.
- In standalone route and All routes detail, show the map first, then the stop timeline, then the order list.

### Orders

- Keep the table toolbar in one horizontal row: active conditions, Add filter, Clear all, order/selection counts and actions. Remove the Orders search input. Incoming search URLs remain visible as a removable chip.
- Route plan keeps its title and Assign action in a single row; omit explanatory copy. The route title input and Order summary remain separate.
- Expose only supported dimensions: Stop type, Delivery status, Order date, Delivery date, Payment, Fulfillment, Cancellation, Area.

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
- Stop-table disclosures use a route-scoped row key. All routes is read-only and links each assigned row to its child route for operational actions; Unassigned has no route action. Actual arrival evidence is shown only when it belongs to that same route; never reuse one child route's tracking evidence for another child or Unassigned.

### Orders filter controls

- Open the chosen condition beside its trigger. Active chips appear before Add filter and stay on one line. Show compact values (short dates or a first value plus count) in chips no wider than 180px, with the full condition in accessible text/title. Keep the popover adjacent to its visible trigger, preferably below; adjust only for actual viewport space. Above-trigger panels anchor their bottom edge to the trigger rather than reserving their maximum height.
- Enumeration values use checkboxes; multiple values are OR, different dimensions are AND. Hide zero-count choices when server facets are available; retain applied and draft selections so they can be cleared or restored. Missing facet data is not evidence of zero orders. Checkbox/radio selections are a local draft until the panel Add filter button applies them and closes the popover; Escape, outside click, and close discard the draft.
- Order date and Delivery date both show a month calendar immediately. Select inclusive ranges directly on the calendar; never replace it with From/To inputs. Selecting a complete calendar range or preset applies it and closes the popover. Date presets are shortcuts to calendar selection. Weekday reveals weekday checkboxes and may further narrow the scheduled range. Existing store-timezone and inclusive-range behavior remains authoritative.
- A chip remove button and a panel Clear reset only that condition. Clear all resets all filters and the existing selection/page state.

## Accessibility

- Controls retain native button, checkbox, details, and summary semantics.
- Selected tabs expose `aria-pressed`; grouped operational regions have specific accessible labels.
- Status is communicated with text in addition to color.
- Focus indicators must remain visible. Primary action controls should be at least 36px high; compact applied-filter chips use 28px height with a 24px-wide remove target.
- Filter chips and the Add filter trigger do not shrink inside the horizontally scrolling toolbar. Opening, closing, applying, clearing, and Escape restore keyboard focus without scrolling either the document or toolbar.

- Orders filter dialogs close on Escape or outside interaction and restore trigger focus when explicitly closed.

## Responsive behavior

- Tabs may horizontally scroll instead of shrinking labels beyond recognition.
- The primary tracking grid uses four columns above 900px, two through 521–900px, and one at 520px or below. Summary spacing is compact (8px sections, 10px row gap); explicit label/value line heights and start alignment keep the 4px label/value gap stable. Long driver values wrap within their metric.
- Evidence metrics wrap into fewer columns while retaining label/value pairs.
- The map height remains independently resizable and is not changed by shell layout work.

- Orders toolbar uses horizontal scrolling on narrow screens; controls and chip text do not wrap into a second row. Popovers fit within the viewport independently of toolbar overflow.

## Interaction states

- Loading: retain the current layout and label the pending connection or data state.
- Live: emphasize current tracking state and freshness without animating the whole surface.
- Historical/completed: show recorded/completion language rather than implying a live connection.
- Unavailable: use an explicit dash or unavailable label, never a synthetic value.
- Error: use existing route-level banner/error treatment and keep diagnostic evidence available.

## Content voice

Use concise operational English consistent with the existing app. Prefer concrete labels such as “Latest position,” “GPS gaps,” and “Tracking evidence.” Avoid celebratory or marketing copy.

- Orders uses short names: Order date (주문일), Delivery date (배송·픽업일), Stop type (배송 유형), Delivery status (배송 상태), Payment (결제 상태), Fulfillment (주문 처리상태).
- Delivery date means the scheduled delivery/pickup date; Fulfillment remains Shopify fulfillment, separate from CLEVER delivery progress. Stop type retains our evening-delivery and unknown values. Cancellation does not imply Shopify Archived/Open support.
- Do not copy EasyRoutes shipping-method, task, route, address, tag, or other dimensions unless this app has a matching data contract and a requested need.

## Implementation constraints

- Do not change map layers, controls, legend behavior, marker styling, or geometry as part of shell UI work.
- Preserve the existing tracking data contract and `gps_quality.v4` API compatibility.
- Do not add dependencies for layout or presentation.
- Keep route state and evidence derived from existing server payloads.

## Open questions

- Whether route tracking labels should be fully localized with the rest of the route detail surface.
- Whether Inventory should receive a count once a single authoritative inventory count is available in this view.
