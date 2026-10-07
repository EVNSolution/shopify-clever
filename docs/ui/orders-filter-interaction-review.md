# Orders filter interaction review

Date: 2026-10-01. Scope: Shopify app presentation only. User requested actual computer/browser observation before selective adoption, removal of Orders search, and a one-line Route plan header.

## Reference observations

Authenticated Safari tabs: EasyRoutes Local Delivery `/apps/easyroutes/orders` and CLEVER K-food `/app/orders`. Read only filter interactions; no order/route updates or saved views. Counts below are time-specific observations, not a reconciliation baseline between apps.

| Actual interaction | Visible result |
| --- | --- |
| Open Fulfillment | Checkboxes: Unfulfilled, Partial, In Progress, Fulfilled, On Hold, Restocked, Scheduled; individual Clear |
| Check Unfulfilled | Chip becomes Unfulfilled with an X; visible cohort changes from 822 to 99 |
| Also check Fulfilled | Both selections remain and the chip reads Unfulfilled, Fulfilled |
| Click panel Clear | Only that dimension disappears; Contains address remains; 822 visible restored |
| Open Status | Open, Archived, Canceled; distinct from delivery/fulfillment |
| Open Delivery status; choose Completed | Completed, Attempted, In progress, Ready, Preparing, No delivery status; Completed cohort shows 703 |
| Open Stop type | Delivery, Pickup, Task |
| Open Delivery method | Shipping-method values No delivery method, 픽업, Standard, separate from Stop type |
| Open Order date; choose Custom | Preset radio list expands to Start date, End date and a calendar |
| Choose Last 7 days | Chip changes to Last 7 days; 89 visible orders |
| Open Delivery date; choose Weekday | Today, Tomorrow, Next 7 days, Next 30 days, Past orders, Weekday, Until, Custom, No Date; Weekday reveals a selector |
| Open Payment | Unpaid, Payment pending, Authorized, Partially paid, Paid, Partially refunded, Refunded, Voided |

Add filter also lists City, Province, Postal code, Country, Route and tags. Unapplied category chips disappear on moving to another category. EasyRoutes was restored to the initial Contains address plus empty Fulfillment panel state (822 visible).

CLEVER's actual Add filter contained Order received date, Scheduled delivery / pickup date, Service type, Routing & delivery status, Shopify fulfillment, Operational payment status, Cancellation and Area. Its scheduled-date panel showed all preset buttons, both date inputs, all weekdays and explanatory copy at once. The search input occupied most of the toolbar. Route plan description wrapped beneath its heading.

## Selective application

Keep CLEVER's supported eight predicates. Adopt short category names, compact active chips before Add filter, checkbox lists, per-condition Clear, a popover anchored to the clicked condition, and a weekday disclosure. Following the user's explicit correction, Order date and Delivery date both show a range calendar immediately: select the start and end dates in the calendar, without From/To fields. Presets remain shortcuts. A completed date range or preset applies and closes immediately. Other selections are drafted until Add filter applies and closes; dismissal cancels the draft. Selected chips use compact value text while title/accessible text retains the full condition. Preserve an independently combinable weekday constraint instead of importing a mutually exclusive weekday mode. Reuse the already loaded Polaris `s-date-picker`; no new dependency. Its inclusive range value and completed-selection event follow [Shopify Date picker documentation](https://shopify.dev/docs/api/app-home/latest/web-components/forms/date-picker).

Do not add EasyRoutes-only shipping methods, Task, Shopify Open/Archived, routes, geographic fields or tags. Preserve CLEVER payment corrections, separate Shopify fulfillment from delivery progress, and never label an elapsed pickup period as confirmed delivery. Keep unsupported states out of the API contract.

Remove the Orders search input; incoming search URLs remain explicit removable chips. Remove the Route plan explanation and its unused translations; retain the title input, Assign actions and Order summary.

## Validation boundary

Reference evidence is the actual authenticated Safari UI. Local interaction evidence uses the real Orders page and filter components with synthetic empty loader data and disconnected mutation transport. This proves UI controls and emitted filter parameters, not production server result counts. Unit/contract tests cover normalization, date predicates, transport and existing selection behavior. Production release remains a separate manual deployment.


## Implemented validation

- Browser: Order date and Delivery date open a calendar directly. First date click leaves the query unchanged; the second click emits both inclusive bounds. The completed range closes the popover.
- Browser: choosing No date clears the range; Monday plus Past dates preserves the weekday constraint. Enum multi-selection remains a draft until Add filter, which applies and closes. Closing without applying discards the draft. Opening the outer Add filter menu closes the previous panel.
- Visual: popovers remain next to the visible trigger rather than jumping to the top; chips use short date labels and first-value-plus-count summaries with full accessible text and tooltips. The measured Order range chip is about 141px wide, compared with the former 260px cap.
- Automated: app suite 888/888; focused filter tests 20/20; build, typecheck, scoped ESLint and public URL guard pass. Independent code review has no remaining findings.
- The preview is a local synthetic fixture. No production orders, saved views, routes, deployment or upstream Shopify data were changed.

## 2026-10-02: repeat-open scroll regression

The earlier repeat-open check covered the native Add filter menu. It did not cover
closing the actual filter editor while its trigger was outside the visible frame.
The real `OrderFilterBar` fixture now records document/toolbar scrolling, trigger
and dialog bounds, and focus events before and after the component's own handlers.

- Before the fix, closing Delivery date moved document `scrollY` from `239.5` to
  `620.5` (381 px). The trigger focus call scrolled it back into view; subsequent
  popovers then opened against a different viewport position.
- All five programmatic focus paths now use `preventScroll`. The same close
  scenario retains `239.5`; Escape, applying No date, and clearing the filter also
  retain their captured document and toolbar scroll positions.
- At the actual narrow Orders viewport, an applied chip's wrapper shrank to 2 px
  around a 104.9 px button. Active/search chips and the Add filter wrapper now
  preserve their width and use the existing horizontal overflow container.
- Positioning still prefers below the trigger and uses above when the viewport
  has insufficient space. This intentional placement is separate from a document
  jump caused by focus restoration.

Run the isolated real-component fixture with:

```sh
cd apps/shopify-app
node scripts/orders-filter-browser-fixture.mjs --port 4179
```

Use the 636/1000 px widths and 360/560/760 px iframe heights. Open the actual date
editor near the top, middle, and bottom; inspect its diagnostic before/after
coordinates when closing, pressing Escape, applying, and clearing. Also verify
calendar range completion, weekday disclosure, enumeration drafts, and reopening
after the toolbar has scrolled horizontally. These checks use synthetic filters;
authenticated production verification remains a separate release check.

`Run focus regression` automatically checks all editor focus transitions and the
six initial trigger wrappers, including the search chip. It verifies both preserved
scroll coordinates and the expected keyboard focus target (editor, original chip,
or Add filter, including the Polaris shadow host). Against release `afbaa26`, five closing/applying
scenarios move the document 653–667 px and four chip wrappers measure 2 px, so the
suite fails. The corrected component passes all seven checks at 636×560,
1000×360, and 636×760 iframe sizes. Results include the actual before/after
coordinates in the visible regression output; they do not inspect source strings.
