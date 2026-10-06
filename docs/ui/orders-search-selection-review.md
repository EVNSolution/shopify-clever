# Orders search and selection review

- Target issue: https://github.com/EVNSolution/shopify-clever/issues/321
- Change control: https://github.com/EVNSolution/clever-change-control/issues/311
- Scope: embedded Orders app UI, existing resource transport, tests and synthetic browser fixture.

## Behavior

Search uses the existing server-wide `search` predicate. `#2301` and `2301` submit the same numeric query. Typing waits 300 ms; Enter and clearing apply immediately. Search works with existing filters and returns to the first page. Query changes clear manual and frozen selection. It does not search only the rows on the current page.

The page checkbox selects only eligible orders on that page. Manual selection persists across pagination. A selection reveals a toolbar with selected count, `Select all N orders`, Clear selection, Add to map and Action. The toolbar stays outside horizontal table scrolling. Semantic table headings remain available while their visual headings are hidden. Clearing restores sorting controls and retains column widths.

`N` is the exact filtered result count. The existing snapshot API excludes cancelled orders, so the selected count can be lower. The button explains this through its title. Snapshot creation reuses the resource request parser to preserve repeated V2 array filters and legacy `routeOpsToday`. Existing snapshot Add to map eligibility remains unchanged.

Pagination appears below the table with the exact row range, such as `51–100 of 123 orders`. Numbered pages retain the existing 50-row server contract. Empty results display `No matching orders` and `0–0 of 0 orders`.

## Local browser fixture

Run from `apps/shopify-app`:

```sh
node scripts/orders-table-browser-fixture.mjs --port 43827
```

Open `http://127.0.0.1:43827/`. The fixture mounts the actual Orders component with 123 synthetic orders, a mocked App Bridge and map, and local resource actions. It uses the production `shouldRevalidateOrdersRoute` helper for routing parity. It makes no Shopify or Delivery API requests. It does not load the hosted Polaris runtime, so the unchanged Add filter custom elements are not representative of their hosted appearance.

## Verified on 2026-10-07

- Full app tests, including legacy filter tests: 946 passed, 0 failed, 0 skipped.
- Targeted search, pagination and selection tests: 127 passed.
- Production build, TypeScript, scoped ESLint, fixture syntax, public URL guard and diff checks passed.
- Initial view: 50 rows, `1–50 of 123 orders`, no selection action toolbar.
- Search `#2301`: finds the order from the original third page; returns `1–1 of 1 orders`.
- Selecting page 1 keeps 50 selected on page 2; adding #2373 produces 51 selected.
- Search changes clear manual and frozen selection and restore the first page.
- `Sample` plus Toronto and Oakville produces 82 matching orders. The snapshot payload preserves both Areas and search; it selects 81 after excluding one cancelled order.
- No-result search shows the empty state and `0–0 of 0 orders`.
- Clear all during a pending search cancels the pending term and returns to 123 results.
- At the default 1280-pixel browser viewport, Add to map and Action remain visible. Column widths persist through selection, page changes and clearing. Semantic headings remain in the accessibility tree without hidden sort buttons.

## Validation boundary

The browser fixture proves local component interaction and request payloads. It does not prove authenticated Shopify iframe behavior, live store counts, or server deployment. No server implementation, Shopify data mutation, feature flag change, merge or deployment is part of this change.

The supplementary Shopify skill validator was attempted but could not run because its own `preact` dependency is unavailable. The app's native TypeScript, production build and scoped ESLint remain the required code checks. No new app dependency was added for that validator.

The existing context repositories were checked for routing and traceability. This app-only behavior is recorded here and in change control; no cross-repository implementation or context update is required.
