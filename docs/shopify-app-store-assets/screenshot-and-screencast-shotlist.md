# Shopify App Store screenshot and screencast shotlist

_Last updated: 2026-05-14_

Use this when preparing final Partner Dashboard listing media for `clever`.

## Screenshot requirements

Shopify App Store best-practice target:

- 3–6 desktop screenshots
- 1600 × 900 px, 16:9
- At least one screenshot of the app UI
- Crop out browser chrome
- Avoid PII, pricing, reviews, and outcome guarantees
- Provide alt text for every screenshot

## Prepared screenshot set

Capture these from the production embedded app after opening `Apps > clever` in Shopify Admin with representative non-private test orders.

| File name | Page / state | Capture notes | Alt text |
| --- | --- | --- | --- |
| `01-orders-planning-map-1600x900.png` | Orders | Show order table, map pins, and route plan controls with test orders only. | Orders page showing a delivery planning table and map for local route planning. |
| `02-orders-add-to-plan-1600x900.png` | Orders after Add to plan | Show selected pins changed color without size change and centered sequence numbers. | Selected orders added to a route plan with numbered map pins. |
| `03-route-detail-map-stops-1600x900.png` | Route detail | Show route line, departure marker, numbered stop markers, blue snapped stop points, and stop list. | Route detail page showing a route line, numbered stops, and stop sequence list. |
| `04-route-edit-sequence-1600x900.png` | Route detail edit mode | Show drag/edit mode for stop sequence without real customer data. | Route editing view for adjusting the delivery stop sequence. |
| `05-driver-assignment-1600x900.png` | Route detail driver control | Show pending driver phone assignment using a dummy/test phone number. | Driver assignment control for saving a driver to a delivery route. |
| `06-settings-departure-location-1600x900.png` | Settings | Show departure location map preview and save controls. | Settings page for configuring a route departure location. |

## Screencast storyboard

Target length: 60–120 seconds.

1. Open Shopify Admin > Apps > clever.
2. Orders: show test orders in the table and on the map.
3. Select 3–4 orders and click Add to plan.
4. Confirm selected pins stay the same size, change color, and show centered sequence numbers.
5. Create a route draft.
6. Routes: open the created route detail.
7. Show route line, numbered stop markers, blue snapped stop points, and stop table.
8. Click Edit, drag/reorder one stop, then save.
9. Save a dummy pending driver phone number.
10. Settings: preview and save a departure location.

## Privacy guardrails

- Use a development/test store only.
- Use synthetic recipient names, addresses, and phone numbers.
- Do not show real merchant customer data, real order revenue, real emails, or browser tabs/bookmarks.
- If a Shopify Admin sidebar is visible, crop to the app content area when possible.
- Do not include the word `Shopify` in generated asset filenames or marketing claims except where the Partner Dashboard field itself requires platform context.
