# All routes reference adaptation

Scope: group overview in `apps/shopify-app/app/routes/app.routes.$routeId.jsx`.
The Routes list retains saved group colors. All routes retains distinct existing
route colors across the map, table, timeline and sibling menu. The draft/save
palette and persisted colors are unchanged.

The overview now shows route/stop counts and an items summary, actual route rows
with available count/distance/duration totals, labelled timeline stops with Start
and End, and the existing All routes/child navigator. Unassigned stops count in
the group summary but do not become an extra actual route row. Weight totals are
unavailable (displayed as a dash); this change does not add reference-only price,
shipping or vehicle columns. This is a scoped adaptation, not pixel parity.

## Verification

In-app sidebar with synthetic `routes-split-browser-fixture.mjs?mode=reference`:
- Two routes, six stops, 21 items; actual rows contain two and four stops.
- Per-route markers and timeline labels, Start/End and totals render.
- Drag one stop across routes enables the existing unsaved Save/Revert controls.
- Revert restores the original two/four allocation and three/18 items.
- Sibling menu opens an individual route and returns to All routes.
- `mode=unassigned` includes the pool in overall counts, excludes it from actual
  route table rows and allocated totals.
- No fixture Save or production mutation was performed. The map is stubbed in
  this fixture: real map tiles and route geometry were not visually verified.

Focused regressions: 88 passed. Changed-file ESLint and typecheck passed.
Local build and PR CI are reported separately in the PR.

## Remaining server contract: retain unassigned membership

The reference drop zone means “remove from routes but keep in group”. The current
server saveDraft contract cannot express that. `removedOrderIds` removes group
membership; routes plus removed IDs must partition existing group orders.
The UI therefore keeps existing removal semantics and labels them explicitly as
removal from the group. It does not claim to implement reference pool-save parity.

Copy-ready server request:

> Target: /Users/jiin/.codex/worktrees/routes-correction-2/clever-route-server
>
> Add a confirmed atomic saveDraft contract for moving stops out of child routes
> while retaining route-group/inventory membership. Current route-grouping.service.ts
> saveDraft partition validation requires all orders in routes or removedOrderIds;
> removedOrderIds deletes group membership. Specify the request field for retained
> unassigned order IDs, response representation, revision/error behavior and
> identity guarantees. Validate a full disjoint partition of assigned, retained
> unassigned and explicitly removed IDs; preserve canonical order data, execution
> restrictions and rollback on failure. Test move to pool, reload, reassignment,
> duplicate/missing IDs and stale revision. Do not change Shopify source orders,
> send notifications or deploy. Return the precise contract and tested SHA for
> the frontend connection; the web must not invent an endpoint or serialize a
> proposed field before confirmation.
