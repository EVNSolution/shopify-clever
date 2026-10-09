# Design

## Source of truth

- Status: Active
- Last updated: 2026-10-09
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
- In standalone route, saved child route, and All routes detail, show the map first, then the stop timeline with its route summary table immediately below, then the order list. Keep the timeline and route summary together.

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
- Standalone and saved child route tables place a read-only Start row before the first order and an End row after the last order in both Stops and Tracking. These endpoint rows are outside order selection, counts, actions, and reordering. Do not synthesize one Start/End pair for All routes or Unassigned.
- Endpoint times use the same presentation as order ETA: show the planned time alone, then strike it through and show the observed time in green when evidence exists. Evidence labels such as actual departure and `Return confirmed` stay available to assistive text and tooltips instead of taking visible table space. Planned End requires a complete route schedule: saved start, every outbound leg, service time, time-window waits, and a consistent return leg when the route returns to depot. Actual departure requires the recorded start occurrence; completion alone is not depot-return evidence. When the server has no completion event, so it reports the return as unavailable, the End row may show a return observed from GPS: the first recorded point within the server's depot radius after the last stop's arrival, only when every stop is finished and the last stop is outside that radius. It is labeled `Return observed (GPS)`, never replaces a server-confirmed return, and the Tracking evidence panel says `Observed (GPS)`. A finished stop that has an estimate but no recorded arrival or completion time keeps the estimate struck through with an empty actual; an estimate is styled like an observed time only while the stop is still in progress. The KFood Complete Delivery flow records no arrival, only the time the driver completed the stop. When a Delivered or Failed stop has no arrival, the completion time the server reports for it is shown as its actual time in the same green slot, and the tooltip names it (Delivered or Failed instead of Actual arrival). A completion counts only while the stop status still matches its type, and an arrival always wins over a completion. The End row starts the GPS-observed return search after the last stop's completion when that stop has no arrival, and a route that ends at its last stop shows that completion labeled `Last stop completed`. Every Tracking timestamp uses one store-time format (`YYYY-MM-DD HH:mm:ss zone`), not the browser locale. The End row of a route that returns to the depot shows the drive time and distance of the leg back to the depot (the route total minus the stop legs), so the Drive time column adds up to Total drive time. It stays empty when the total or any stop leg is missing, or when the route ends at the last stop.
- Route circles are 24px everywhere: the timeline, the Stop column of the stop table, and the Start and End markers. A route that is the only route of its group colors them by status: Ready blue, Completed green, Failed red. Start turns green once the route has left the depot and End turns green when the route is completed. A route inside a group of several routes keeps its own route color and its checkered End. All routes use the same timeline (order labels above the circles, a star for Start, a flag for End), and the Start and End rows of the stop table use the same star and flag. Map markers and the Tracking table colors do not change.
- The stop table's Amount column follows Payment and uses the ETA treatment: the order amount alone, then the expected Cash amount struck through with the amount the driver received in green once a Cash receipt exists. It is read-only. Route Detail has no Cash panel, popup or office confirmation.
- The Stop time cell of the Stops table keeps a margin at its right edge for a pencil that shows only while the pointer is over the cell or the pencil has keyboard focus (a screen without hover always shows it). The pencil opens an inline editor for whole minutes from 0 to 1440: Enter or the check saves, Escape or the cross cancels, and a value that is not a whole number in that range cannot be saved. The editor closes only after the server accepted the value, so a failed save keeps what was typed. The pencil exists only on a Ready single route outside live change mode, for a stop that is already saved, because the server recalculates ETAs after a Stop time change only for a Ready route. It is never shown on the All routes overview, in the Tracking table, or on in-progress, finished or unknown routes. The save writes only that stop's Stop time.
- The Stops table of a single route starts with a Select column of checkboxes. It is never on the All routes overview, the Unassigned list or the Tracking table, and the Start and End rows leave its cell empty. Selecting a stop turns its row grey and replaces the header row with a bar of the same height: a checkbox that clears the selection (a dash while only some stops are selected), the number selected, then `Edit stop` (one stop only), `Remove stop` or `Remove stops`, `Send to route` and `Mark as` (Ready, In progress, Completed). Each button follows the rule of the stop's row menu, and a disabled button says why in its tooltip. Remove also waits once the route has started. `Mark as` sends one request that changes the stops one after the other, stops at the first failure and says how many changed. The bar sits outside the horizontally scrolling table, so it stays in view and its menus are never clipped; Escape or a press outside closes a menu. Cancel and Pickup are not part of this bar. Each Select checkbox and each Stop time pencil is named after its order (`Select #2330`, `Edit stop time for #2330`), and the Stop time editor hands keyboard focus back to its pencil when it closes.
- Each stop row of a single route's Stops table starts with a grip handle to the left of its checkbox, so the first column is 56 px wide and the selection bar pads its checkbox to the same place. The handle shows only on a stop that the timeline lets staff drag (Ready and in-progress routes, and only future stops in live change mode); the other rows keep an empty space of the same size. The Start and End rows have none. Dragging a handle moves that one stop inside the route, with the timeline's drag state and guards: the rows and the timeline circles follow the pointer, a small tag with the stop number and order follows it, and a pointer in the upper half of a row puts the stop before that row, in the lower half after it. Releasing keeps the new order as an unsaved draft for the existing Save and Revert bar. Releasing outside the table, or pressing Escape, puts the stop back. While a route has an unsaved order the Stops table lists the stops in that order and Tracking keeps the saved order. ETA and Drive time of the stops from the first moved one on, and the End row's planned time and drive time, stay empty until the order is saved, because they describe the saved order. A drag that started on the timeline never changes the table, and the table takes a drop only from its own handles.

### Route Add orders

- Search covers all same-store orders regardless of the selected delivery-date filter, including orders labeled `Date Pending`. Date filters still narrow the browse list when search is empty.
- Visibility and addability are separate. Already assigned, cancelled, terminal delivery, and missing-coordinate orders stay visible with a concise reason and disabled selection. The server action revalidates selected IDs against the addable set.
- Adding a cross-date or Date Pending order preserves its original delivery date and targets the chosen saved child route. The dialog does not imply that browsing or selection changes the order's date.

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
- The primary tracking grid uses four columns above 900px, two through 521–900px, and one at 520px or below. Summary spacing is compact (8px sections, 10px row gap); explicit label/value line heights and start alignment keep the 4px label/value gap stable. Long driver values wrap within their metric. Omit the Overview title/description row and primary-metric vertical dividers; use equal column gaps so wrapped rows share the same left alignment.
- Evidence metrics wrap into fewer columns while retaining label/value pairs.
- The map height remains independently resizable and is not changed by shell layout work.

- Orders toolbar uses horizontal scrolling on narrow screens; controls and chip text do not wrap into a second row. Popovers fit within the viewport independently of toolbar overflow.
- Route endpoint rows follow the same table width and horizontal-scroll behavior as order rows. Endpoint addresses may wrap or truncate through the existing table treatment; observed times use the same two-line planned-versus-actual treatment as order ETA.

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
