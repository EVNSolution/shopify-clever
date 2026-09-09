# Direct order links and local empty-route drafts

Date: 2026-09-09. Base: `72a000a2e96c62dce87d5c9efd07036f33576ee8`.

## Behavior

- Order No is an HTTPS Shopify admin link using the current session shop and canonical order ID, with `target="_blank"` and `rel="noopener noreferrer"`. Clicking it no longer selects an order map popup. Map-marker popup behavior remains available.
- Add Empty Route creates a local temporary row without requesting the next display number. Saved routes retain their IDs and routeIdx; new routes omit routeIdx in the save payload so the existing server contract allocates it. Generated labels remain null; explicit names remain intact.
- Ordinary-route split-save remains guarded pending the confirmed atomic server bridge. This follow-up does not claim that bridge is implemented or deployed.

## Verification

- Initial full serial app suite: 711 tests, 709 passed; two source assertions still expected the former click/loader declaration. Updated those assertions, then reran all 104 Orders tests successfully. The other 607 tests passed unchanged in the full run.
- Route-focused tests: 75 passed, including zero Add Empty action submissions, existing/new identity payload handling, generated/custom names, cancel and save-failure guards.
- Changed-file ESLint passed (five explicit files; no root scan).
- Production build, typecheck, public URL guard and git diff whitespace check passed.
- Node heap bounded to 2 GiB; checks ran sequentially under build-hygiene with timeouts. No lingering owned check processes were reported; no caches were removed.
- In-app sidebar, synthetic Routes fixture: two immediate Add Empty clicks created three draft rows; Revert removed both temporary rows and preserved the saved six-stop route.
- In-app sidebar, actual Order No JSX/helper extracted into a synthetic cell fixture: click exposed the expected HTTPS order URL, `_blank`, and `noopener noreferrer`, without a map popup. External navigation was disabled in this fixture; live Shopify navigation was not exercised.
- No production route/order mutation, backend edits, merge or deployment.

Local logs: `/tmp/direct-actions-suite.log`, `/tmp/direct-orders-tests-fixed.log`, `/tmp/direct-actions-eslint.log`, `/tmp/direct-actions-build.log`, `/tmp/direct-actions-typecheck.log`. Durable observer evidence is under `/Users/jiin/.codex/build-hygiene/logs/clever-shopify-app/20260909T173*`.

Backend analysis and copy-ready request: [backend-route-numbering-handoff.md](../backend-route-numbering-handoff.md). Actual database and lock latency remain unmeasured.
