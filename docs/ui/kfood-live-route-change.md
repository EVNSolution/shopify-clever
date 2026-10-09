# KFood future delivery editor

The office can change future addresses and order while a KFood route is in progress.
The current stop and completed stops retain their public content and position.
Shopify orders and customers remain read only. Corrections stay in CLEVER.

## Dependencies and release gate

This change is stacked on Shopify PR293 at
`9b32a2573912b642c07a2c7269f41d2ba9d9d29b`. PR293 preserves terminal status,
detail/list freshness and the GET cache limit. The API contract is server PR486 at
`9bd6e7b8408508c83b1e4255a62c37ee9b983bf0`.
Both PRs were open drafts with successful exact-head CI on 2026-10-07.
The remote main was `e85c5bc1643a8ab8428ac77a69c7194d2ac6d357`.

The feature defaults off. Only the authenticated `clever-route-kfood` app can opt in
with `CLEVER_KFOOD_LIVE_CHANGE_ENABLED=true`. Keep production disabled until:

1. The reviewed server contract and additive migrations are available.
2. The driver app keeps pending-change guidance until the exact publication is applied.
3. The driver app preserves current stop, camera/completion drafts and offline event identity.
4. Synthetic device integration passes, including unchanged stop 2 completion after stop 7 changes.
5. A separate release decision authorizes production activation and manual deployment.

No runtime environment, deployment workflow, production route or driver notification
is changed by this implementation. For rollback, disable new commands first.
Keep server publication history and queued event identities for reconciliation.

## Office workflow

Open the actual child route from its group or from a direct route link.
The BFF resolves the actual `routePlanId`; group and underlying child UUIDs are not interchangeable.
The authenticated app, shop and session define the scope. Browser fields never grant tenant access.
The authenticated resource route `/app/route-live-change/:routePlanId` returns JSON,
including conflicts and Shopify authentication retry headers. It resolves the canonical
route again before each request. The resource has no page component.

The office uses the controls that READY routes already have. There is no separate panel.

1. Drag a future stop in the timeline, or open its row **⋯ → Edit stop**. Only future stops
   (the server's `editableFutureStopIds`) can be dragged or edited. Current and completed stops
   keep their place and cannot be dragged, edited or used as drop targets.
2. **Edit stop** shows the address and coordinates only. Changing an address clears the previous
   coordinates. **Find coordinates** searches, **Check location on map** opens the point, and
   **Confirm checked coordinates** confirms it. Coordinate confirmation is always required before Dispatch.
3. The existing floating bar shows **Unsaved route changes** with **Save** and **Revert**.
4. **Save** stores the changes privately. The table and timeline preview the saved changes. The driver
   and the published route do not change. The bar then shows **Saved changes are waiting for Dispatch**
   with **Discard**.
5. The header **Dispatch** publishes the saved changes. It stays disabled while changes are unsaved,
   while a changed address has no confirmed coordinates, and when nothing is saved.

An address can be saved without coordinates. Dispatch stays blocked until the location is verified.
Search failure preserves the address input. A delayed search cannot replace a more recent address.
Contact, instructions, time windows, service duration, append and removal are outside this editor.
Reverse stops, Re-optimize and the other Edit menu actions stay disabled while the route is in progress.
READY routes retain their existing editing and dispatch flow, which this feature does not touch.

A successful Dispatch means publication succeeded. Provider delivery, geometry refresh and
explicit driver application are separate outcomes. A SENT notification or a successful GET
never means the driver applied the change.

## Conflicts and retries

Each new Save, Dispatch and Discard uses a new UUID command.
The command retains `expectedAssignmentGeneration`, `expectedRouteVersionId` and `expectedRevision`
from its baseline GET. A response-loss retry sends the same command ID and serialized body.
After a receipt response, a fresh no-store GET supplies the current state before another command.
Do not substitute a new revision into a failed command or use a legacy API to bypass a conflict.

If another administrator changes the revision, preserve the office input.
A banner names the conflict and offers **Review latest**. Save and Dispatch stay disabled until the review is done.
The review dialog shows the latest saved address and future order beside the pending input.
**Use latest state and keep my edits** is the explicit rebase.
Rebase keeps only touched address fields. Untouched fields use the latest server values.
If the resulting address differs from the confirmed address, confirm coordinates again.
Reassignment, version drift, authentication failure and access loss also preserve input.
Responses from an old route, app, shop or session cannot change the current editor.

If an edited stop becomes current, Dispatch can return `STOP_NOT_FUTURE`.
The private draft remains. Select **Discard** in the floating bar, review the scope warning, and confirm.
Discard removes **all private changes for this route**, including another administrator's saved draft.
Opening the Discard confirmation fetches the latest guards first.
It does not undo published addresses/order, delivery history, geometry or notifications.
After success, read the latest revision, edit a remaining future stop, Save and Dispatch again.
GET, navigation and refresh never discard a server draft automatically.

A committed publication can have failed/unavailable geometry or failed notification delivery.
Retry its original Dispatch command to retry side effects. Do not create another publication.
This retry preserves office input entered after publication, including a second response loss.
If the command is superseded or access changes, read current state and follow the server error.

## Freshness and verification

Live-change GET bypasses the BFF GET cache and uses HTTP `Cache-Control: no-store`.
Successful commands invalidate affected detail/list reads and revalidate the detail and parent list.
PR293's terminal observation/retry behavior remains in place.

Synthetic browser verification and actual local HTTP API verification are reported separately in
[the verification record](../verification/kfood-live-change-ui-20261007.md).
The separate panel that record describes was replaced on 2026-10-09 by the existing Route Detail controls;
see [that verification record](../verification/kfood-live-change-existing-ui-20261009.md).
The API, receipt and conflict checks in the earlier record still apply.
Authenticated production Shopify, physical driver devices and live provider delivery require
separate release acceptance. Target issue: Shopify #327. Related control-plane record: #298.
