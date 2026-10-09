# KFood future-stop changes in the existing Route Detail controls — 2026-10-09

The separate "Future delivery changes" panel is gone. A KFood route in progress now uses the controls
READY routes already have: timeline drag, row **⋯ → Edit stop**, the floating **Save / Revert** bar, and
the header **Dispatch** button. **Discard** is the only new button, and it sits in the same bar.
The live-change commands, receipts, retries and conflict rules are unchanged; they moved into
`use-live-route-change.js`. See [the workflow](../ui/kfood-live-route-change.md).

Production still needs a separate release decision. Nothing here touched an operational route,
a driver notification or a runtime environment.

## Actual page with synthetic transport

`apps/shopify-app/scripts/live-route-change-browser-fixture.mjs` serves the real Routes and Route Detail
modules. The synthetic live-change transport returns the PR486 shapes. MapLibre and external providers are
stubbed. Only synthetic recipients and addresses were used.

| Case | Observed result |
| --- | --- |
| Open the in-progress child route | No panel. The header **Dispatch** button is visible and disabled. |
| Drag stop 7 earlier | Stops 1 (completed) and 2 (current) cannot be dragged and do not move. The floating bar shows **Unsaved route changes** with Save and Revert. |
| Save | Server revision 1, one save, public order unchanged. The table shows the saved order. The bar shows **Saved changes are waiting for Dispatch** with Discard. Dispatch is enabled. |
| Dispatch | One dispatch, one publication, one logical notification. The published order matches. The bar disappears and Dispatch is disabled again. |
| Edit stop, new address | Coordinates clear. The row shows the existing **Location error** chip. Save is allowed. Dispatch stays disabled with "Save route changes before dispatching." |
| Find coordinates, then Confirm | Coordinates fill. Confirm is required. After Save the server draft holds the new address with coordinates; the published address is unchanged. |
| Discard | A dialog warns that all saved changes, including another office user's, are removed. After confirmation the draft equals the published route and the bar disappears. |
| Another office user saves, then Save | `REVISION_CONFLICT` keeps the local order. One banner offers **Review latest**. Save is disabled until the review is done. **Use latest state and keep my edits** rebases; the next Save succeeds with both changes. |
| Lost Dispatch reply | One publication and one notification already exist. The banner offers **Retry original command**. The retry replays the receipt: still one publication and one notification. |
| Geometry and notification failure | **Retry publication delivery** appears. After recovery, the retry replays the receipt with no second publication. |
| Stop 7 becomes current after Save | Dispatch returns `STOP_NOT_FUTURE`. The draft stays; Discard is available. |
| Route becomes Incomplete | Banner: "This route is no longer in progress." No stop is draggable. Dispatch shows the standard disabled state. |
| READY route | Standard Dispatch and drag are unchanged. No live-change banner, dialog or request (0 live reads). |
| Korean at 375 px | The Edit stop dialog and the bar fit without horizontal overflow. |

Screens inspected after capture:
[unsaved](assets/kfood-live-existing-ui-unsaved-20261009.jpg),
[saved and waiting](assets/kfood-live-existing-ui-saved-20261009.jpg),
[Edit stop](assets/kfood-live-existing-ui-edit-stop-20261009.jpg),
[conflict](assets/kfood-live-existing-ui-conflict-20261009.jpg),
[review](assets/kfood-live-existing-ui-review-20261009.jpg).

## Automated checks

- `npm test`: 1,094 tests pass. New tests cover the draft overlay, the fixed-stop drag rule, the Dispatch
  rules, the notices and dialogs, and label parity between English and Korean.
- Source-pinning tests for Route Detail were updated to the new `canDragTimelineStop`, live Dispatch and
  draft-overlay code. Each still asserts the original READY and in-progress guards.
- `npm run typecheck`, `npm run build`, changed-file ESLint and `npm run check:public-urls` pass.

## Not verified

The authenticated Shopify iframe, the real map, real geocoding, a physical driver device and provider delivery.
