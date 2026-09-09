# Routes split draft: web follow-up

Scope: additive follow-up to Orders `de848d4` and Routes table `739677b`. Those commits remain separate. No merge, deployment, live route/order mutation, or server edit is part of this change.

## Confirmed contract and integration boundary

The server owner's `docs/evidence/routes-correction-2-contract.md` in the `routes-correction-2/clever-route-server` worktree was read on 2026-09-09. It documents the list DTO corrections associated with PR 408 head `95b1152cd670a33c2e60d3c9e961ddacab2d5e1d`. It does not document an ordinary-route split-save bridge or ordinary-route Copy endpoint.

Existing web contracts:

- Group save: `saveDeliveryRouteGroupDraft` sends one `PATCH /admin/route-groups/:groupId/draft`. A stored singleton still has this identity; presenting it without a color does not dissolve its membership.
- Copy: `copyRouteGroup` currently accepts a group overview, uses the existing group Copy API, and rejects an ordinary route detail. True ordinary-route Copy remains an integration dependency; no group is created as a workaround.
- Missing group IDs are rejected locally before any request. No create-group/save chain is introduced.

The remaining server bridge must atomically retain the existing route-plan ID and its canonical orders/progress, create the additional real routes, and persist membership. It must expose its exact method/path, optimistic concurrency requirements, failure semantics, and a complete success response with the saved group and distinct real member IDs. The web draft already carries only order IDs and route editing fields, not full order DTOs: `routePlanId`, `tempId`, `routeKey`, `orderIds`, route/child revisions, label, driver, schedule/time zone, route index and sort order. These fields describe the existing draft adapter, not an invented new API schema.

Until that bridge is confirmed, a true ordinary route can be edited as a split draft, but Save remains blocked and preserves the draft. A stored singleton uses the existing group save and only clears the draft when the returned group matches, retains its existing real IDs, and includes distinct real IDs for every additional route. Missing/incomplete success responses preserve the draft. This is not a completed end-to-end ordinary Copy/split/save release.

## Presentation and identity

Single saved members are uncolored while retaining their real membership, links and deletion identity. Multiple confirmed distinct members share a stable group color. Client draft colors never establish saved membership. The table retains the exact supplied column list (12 named columns, including Select); no extra marker column, parent row, Actions menu or empty-group workaround is added.

## Verification

- Initial singleton-color tests failed before the model change; all 14 model tests passed afterward.
- Draft/model/group helper tests: 38 passed. Focused detail, save notice and UI regressions: 86 passed after updating superseded assertions and source extraction boundaries.
- Changed-file ESLint passed with a 2 GiB heap and 90-second timeout. No recursive root lint or cache cleanup.
- App build passed in 4.9 seconds and typecheck passed in 5.1 seconds, each observed sequentially with a 2 GiB heap. Public URL guard passed.
- Observer evidence: `~/.codex/build-hygiene/logs/clever-shopify-app/20260909T170927.489391+0900-739677be78fe-split-app-build/` and `20260909T170947.055741+0900-739677be78fe-split-app-typecheck/`. These checks reported zero lingering owned processes.
- The first full-suite run progressed through deployment fixture tests normally (about 60 MiB RSS, idle between fixture subprocesses); elapsed time was not evidence of a leak. It exposed four test failures, repaired above.
- Final full app suite: **708/708 passed**, 60.7 seconds, `--test-concurrency=1`, 2 GiB heap, zero lingering owned processes. Evidence: `20260909T171032.673491+0900-739677be78fe-split-app-regression-final/` under the same observer log root. Error-signature matches in observer summaries include intentional negative-test log messages; the runner exit and test totals establish the result.

## In-app browser verification

Ran `node apps/shopify-app/scripts/routes-split-browser-fixture.mjs --port 43819`, bound only to `127.0.0.1`. The fixture bundles the actual `RoutesPage` and `RouteDetail` components. Shopify transport and map resources are stubbed; all orders are synthetic. The initial copy is supplied as fixture data because ordinary Copy has no confirmed contract.

- Ordinary route: Add Empty twice produced three draft rows. Actual timeline drag moved orders to a 4/1/1 allocation. Save displayed the unavailable message and retained all three rows. Back opened the unsaved-change dialog; Cancel retained the draft. Revert restored one route with six stops.
- Existing saved singleton: Add Empty reused numbering requests. An incomplete synthetic response retained the draft and displayed the unconfirmed-save message without a success notice.
- Complete synthetic response: 4/1/1 allocation saved through the existing handler, cleared the draft, and displayed sibling navigation `1 / 3`. Next showed the second route with only its allocated order (`#FIX-6`). Returning to Routes showed the untouched original with six stops plus three separate rows with 4/1/1 stops and one shared color.
- Separate saved snapshots verified one member without a color and three named members with the same stripe, distinct driver/count/price values, and the unchanged column list.
- The temporary browser tab and fixture server were closed after verification. This proves UI wiring against synthetic responses, not server atomic persistence, real Copy behavior, map rendering, or production operation.

No production verification is claimed.
