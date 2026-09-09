# Ordinary Copy and split Save: web contract

Frontend follow-up to PR #253 (`f753fc45e63ccc98c8d3969fa016c5ef29768625`).

## Connected requests

- Copy: `POST /admin/route-plans/:sourceRoutePlanId/copies`, body `{ expectedRoutePlanUpdatedAt }`; successful envelope contains `data.routePlan`.
- Split: `POST /admin/route-plans/:copiedRoutePlanId/route-group`, body `{ expectedRoutePlanUpdatedAt, mode: "MANUAL_ORDER", routes }`; successful envelope contains `data.routeGroup`.
- Existing group Save remains `PATCH /admin/route-groups/:groupId/draft`.

The Copy button is available on standalone details and enabled for a READY route with a saved revision and no unsaved changes. Success requires a new ID, READY state, revision and absent group membership before navigating to the new ordinary detail.

Add Empty is local. Its first use captures the copied route revision; subsequent edits retain it. The existing draft builder supplies route entries and order IDs. The standalone API adapter removes deletedRoutePlanIds, removedOrderIds, group expectedUpdatedAt, row optimized and unknown fields. Its allowlist matches the split parser at server `88aa151be7bdae087fb825574c230ba2b27fa2ba` (`readCreateGroupingFromRoutePlanPayload` / `readDraftRouteRows`).

Only a complete response with a nonempty group ID, exactly the expected number of distinct real child IDs, and the copied route as the first child clears the draft. Normal Save then selects that copied child under the new group; Save-and-leave honors the pending destination. No parent/leader table row is introduced.

## Failure behavior

Copy/Save automatic loader revalidation is deferred until response reconciliation. Stale/already-grouped 409, started/invalid-input 400 and missing/wrong-shop 404 return distinct frontend categories while retaining HTTP status and original server code. Failed saves preserve the editable draft.

Lost API responses, 5xx and malformed success responses are treated as uncertain. Every attempted Copy/Split invalidates GET cache so checking saved routes does not reuse pre-mutation data. Shared mutations are locked through token acquisition and confirmed destination loading. The UI retains the draft and disables repeat ordinary creation requests until the saved result is checked outside the current edit session. It does not automatically retry, silently create a second copy, or announce partial group success. This is conservative handling; it does not implement server idempotency or a new reconciliation endpoint.

## Server integration boundary

Copy follows the user-confirmed contract: a distinct standalone READY route named `<source> Copy`, preserved schedule/time zone/depot/constraints and ordered stops, separate virtual Order/DeliveryStop identities retaining original Shopify references, no copied driver/vehicle/execution history, and immutable source data.

The exact server Copy implementation SHA and its CI were not yet supplied at implementation start. Final integration must verify that SHA against these response fields, the virtual-order detail-loader shape, stable error codes/messages, and split response children. No production request is needed for this verification; use safe server fixtures and contract tests. No email behavior, operating-route mutation, merge or deployment is part of this web change.

## Web verification (2026-09-09)

- Final targeted regression set: 94/94 passed (Copy/Split clients, payload and errors, revision/identity, navigation, delayed-token mutation races and duplicate Copy protection).
- Earlier serial full app run: 719/720 passed; the sole failure was an existing navigation test harness missing the newly added pending ref. Corrected the harness and verified the complete affected test files in the final targeted set. Full final validation is also required in PR CI.
- Eight explicitly named changed files passed ESLint with a 2 GiB Node heap and 90-second timeout. Typecheck passed under the same heap bound; checks ran sequentially.
- In-app sidebar synthetic fixture: Copy generated a distinct ordinary READY route with driver unassigned. Two Add Empty clicks made three drafts with zero action submissions. Actual drag allocation produced 4/1/1 stops. One Save selected the preserved copied child (`1 / 3`); Next showed the allocated order only; the list showed the untouched six-stop original plus three actual rows sharing one group stripe, without a parent row. Counters: total actions 2, Copy 1, Save 1, Add Empty server submissions 0; full original JSON snapshot unchanged.
- Incomplete Save retained all draft rows and disabled repeat Save; navigation Cancel retained edits; Revert restored the last saved route. Copy outcome-unknown stayed on the original, disabled repeat Copy and showed an unconfirmed-result message. Normal Copy/Save was rechecked after the mutation-lock fix, including driver remaining unassigned and action locks releasing at the saved child.
- Fixture transport and map are stubbed; this is UI/client-contract evidence, not real server atomicity, map rendering or production evidence. Fixture server and tab were stopped after checks.
- No stylesheet, table-column, layout, map or editor redesign. Visible additions are the ordinary Copy action and necessary busy/failure behavior. Email actions were not changed or invoked.

Local observer evidence: `/Users/jiin/.codex/build-hygiene/logs/clever-shopify-app/20260909T18*`. Short logs: `/tmp/ordinary-final-focused.log`, `/tmp/ordinary-bridge-suite.log`, `/tmp/ordinary-bridge-eslint.log`, `/tmp/ordinary-bridge-typecheck.log`, `/tmp/ordinary-bridge-build.log`.
