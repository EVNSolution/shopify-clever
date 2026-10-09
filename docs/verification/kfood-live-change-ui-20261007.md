# KFood live-change UI verification — 2026-10-07

> The separate panel verified here was replaced on 2026-10-09 by the existing Route Detail controls.
> See [the replacement record](kfood-live-change-existing-ui-20261009.md). The API, receipt and conflict results below still apply.

The office can edit stop 7 while stop 2 remains current, Save privately, and Dispatch.
A blocked draft remains until explicit Discard. Future editing resumes after Discard.
The production feature remains disabled by default. No merge, deployment, runtime
environment change, operational Dispatch, or real driver notification was performed.

## Source and review boundary

- Shopify baseline: [PR293](https://github.com/EVNSolution/shopify-clever/pull/293),
  `9b32a2573912b642c07a2c7269f41d2ba9d9d29b`.
- Server contract: [PR486](https://github.com/EVNSolution/clever-route-server/pull/486),
  `9bd6e7b8408508c83b1e4255a62c37ee9b983bf0`.
- Remote main at task start: `e85c5bc1643a8ab8428ac77a69c7194d2ac6d357`.
- Separate branch: `codex/feat-kfood-live-change-ui`. Its PR base is PR293's branch
  `cc-298-kfood-terminal-status`. Recheck/rebase and retarget after PR293 merges.
- Target trace: [Shopify #327](https://github.com/EVNSolution/shopify-clever/issues/327).
  Related control-plane record: #298. All three local control-plane repos were
  available; the canonical preflight returned `ready=true`.
- Final source SHA, exact-head CI, and latest dependency status are in the draft PR.
  Source hashes are not inferred from a passing local build.

PR293's terminal-state merge, parent list invalidation/retry, and cache TTL remain
in place. A read-only final review found no remaining material defect. It checked
the chained Dispatch retry, route/scope epochs, BFF auth, and cache integration.

## Actual browser with synthetic transport

The Codex in-app browser rendered the real Routes page, route detail, and editor.
The fixture imports the production list loader and GET cache. The synthetic live
transport returns the PR486 shapes. MapLibre and external providers are stubbed.
The cache clock is frozen inside the 15-second TTL; freshness is not an expiry test.
Only synthetic recipients and addresses were used.

| Case | Observed result |
| --- | --- |
| Child alias, direct link, group child link | Canonical routePlan ID is used; group and version UUIDs differ. |
| Stop 2 current; edit stop 7 address/order | Only future IDs appear in the editor. Stop 2 address, order, status, and 09:02 arrival remain unchanged. |
| Address-only Save | Private revision advances. Public stop table stays unchanged. Dispatch is disabled. |
| Failed search, held search, newer address | Input stays visible. Released older coordinates do not replace the newer address. |
| Coordinates and order | Search fills coordinates; explicit confirmation is required. Save sends the complete future ID order. |
| Double Save/Dispatch clicks | One new command and one publication; clean Dispatch is disabled. |
| Lost Save reply, then access denied | New commands stay blocked. Input and original command remain. Restore access, fresh GET, and retry recover the receipt. |
| Lost Dispatch reply | Same command ID/body returns the original publication; no second notification/publication. |
| Failed geometry/notification, then lost retry reply | Original Dispatch retries side effects. New office input survives and needs explicit review. Provider recovery returns fresh/SENT, while driver Apply stays separate. |
| Stop 7 becomes current after Save | Dispatch returns STOP_NOT_FUTURE. The server draft remains. |
| Explicit Discard, including lost reply | Confirmation states that all private edits are removed. Identical retry returns the original receipt. The published route stays intact. |
| Edit stop 8 after Discard | Fresh Save/Dispatch succeeds. |
| Other office changes revision | REVISION_CONFLICT preserves input. Review shows both addresses. Explicit rebase preserves untouched server suite and clears coordinates. |
| Driver reassignment | ASSIGNMENT_CHANGED blocks the stale command. Latest assignment is shown before explicit rebase. |
| Session scope change and held GET | Previous input is isolated. Released old response does not overwrite the new editor. |
| Route A → READY → route A with held GET | Office input returns in review. Late old-visit response does not clear it. READY keeps its existing Dispatch and has no live editor. |
| Terminal detail and return to list | Incomplete survives both views. Terminal writes are disabled. |
| English desktop and Korean narrow view | Editor works at 1280×900 and 375×900. Narrow editor has no horizontal overflow. Browser console errors were empty. |

[Synthetic counters, immutable bodies, receipts, and cache logs](kfood-live-change-browser-20261007.json)
record each captured scenario. All repeated IDs in the record have identical bodies.
Loss is simulated by HTTP 503 after commit; the UI must use the retained command.

Screens inspected after capture:

- [Private Save](assets/kfood-live-private-20261007.jpg).
- [Published Dispatch](assets/kfood-live-published-20261007.jpg).
- [Blocked draft](assets/kfood-live-blocked-20261007.jpg).
- [Korean narrow editor](assets/kfood-live-narrow-ko-20261007.jpg).

Reproduce the synthetic browser fixture from the repo root:

```bash
node apps/shopify-app/scripts/live-route-change-browser-fixture.mjs
```

Open the loopback URL printed by the script. Use only the fixture controls and
synthetic records. The script runs no Shopify platform authentication or driver push.

## Actual PR486 local HTTP API

[Local API results](kfood-live-change-local-api-20261007.json) report five passing
groups. This run used actual loopback Fastify HTTP, actual BFF fetch helpers,
temporary PostgreSQL 17, PR486 migrations, and locally signed synthetic JWTs.
It did not replace the HTTP API with fixture responses.

It verified authentication/tenant/version guards, immutable Save/Dispatch/Discard
retries after lost replies, revision/idempotency conflicts, public/private separation,
current stop preservation, driver-pending publication, cache invalidation,
STOP_NOT_FUTURE recovery, and missing-coordinate Dispatch rejection.
Shopify order records and driver execution history were unchanged by office edits.
HTTP service, Prisma client, and temporary database were closed and removed.

Reproduce with the reviewed server checkout and installed PostgreSQL binaries:

```bash
node apps/shopify-app/scripts/verify-kfood-live-change-local-api.mjs \
  /path/to/reviewed-PR486-checkout /path/to/postgresql/bin
```

The script uses only loopback addresses and a newly created temporary database.
It does not load runtime env files or provider configuration. The server checkout
must contain its dependencies and the reviewed source; no server source is edited.

## Repository checks and limits

- Full repository tests: 1,043/1,043 pass. New coverage includes authenticated resource JSON,
  real HTTP 401/409/no-store behavior, scoped cache invalidation, immutable command
  retry, address rebase, delayed search, and fixture contracts.
- Build, typecheck, public URL guard: pass.
- Changed source/test ESLint: pass, except pre-existing errors in the navigation
  contract test's unchanged code. Full app lint remains blocked by the pre-existing
  `app.drivers-vehicles.jsx:651` `process` no-undef error. Neither was repaired here.
- Prisma migration replay/schema parity, Shopify token-authority SDK source check,
  all three Compose configurations, and `git diff --check`: pass.
- Shopify's standalone UI validator could not resolve the repository's App Bridge
  module and imported JavaScript types. The official docs confirm the App Bridge
  import. Repository typecheck/build and browser rendering pass. No new Polaris
  custom-element props were introduced.

Authenticated Shopify iframe acceptance, real geocoding/map correctness, live
provider notification, and physical driver Apply/offline-queue behavior remain
separate release checks. The map confirmation URL was inspected with synthetic
coordinates; this run did not validate a real delivery address on an external map.
The next mobile work must preserve stop 2 camera/completion drafts and offline
event identity, keep persistent pending guidance, and apply the exact publication.
Keep the office feature disabled until that integration passes and release is authorized.

The context monorepo needs the accepted release state after dependent reviews.
This task changed only the Shopify repository and its target issue/draft PR.
