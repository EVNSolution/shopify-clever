# G008 UltraQA final evidence report

Updated: 2026-08-25 KST

## Verdict

The code-level hostile remediation is **LOCAL VERIFIED** at these exact pushed heads:

- Driver `8ac428f3017986e33db262789e0ba3989197cd98`
- Shopify `25e3bc3a5129ec2495caeb0b8394aef685ca4a02`
- Server `c421cca212ccc5a206715e677ab83076b1385f6a`

Production rollout is **PENDING**. This report does not claim that Server, Shopify, K-food, Driver binaries, systemd timers, CloudWatch resources, migrations, or email configuration have been deployed or observed in production.

## What the final review closed

### Driver

- Ordered workflow evidence survives restart, response loss, token expiry, and hung/late calls without reordering or false acknowledgement.
- Proof upload retries use one deterministic, encrypted-restart-stable idempotency identity and carry cancellation to transport.
- Corrupt/schema-invalid encrypted rows are isolated; support evidence contains allowlisted metadata and keyed digests, never raw notes, URIs, signatures, recipients, addresses, proof bytes, or legacy source bytes.
- GPS freshness uses the canonical 120/300-second thresholds.
- Device, Server, Sync, Gap, GPS, Route, and Alert remain independent in the app and foreground notification. Equal-count/different-stop and server-ahead states cannot render green.

Final Driver evidence: full `576/576`, encrypted-store focused `27/27`, typecheck, lint with zero errors, and native release preflight. Physical-device migration, signed release, and production telemetry remain pending.

### Shopify and K-food boundary

- Order and mandatory compliance webhooks authenticate the exact bounded raw body without depending on offline Admin sessions.
- The shared streaming reader enforces a 5 MiB default and 10 MiB maximum before trust decisions, including missing/lying length and split-Unicode cases.
- Only durable allowed Server receipts are acknowledged. A suppressed redaction tombstone is terminal only as `IGNORED` plus `duplicate:true`.
- Token exchange is bounded, shop-scoped, and externally logged only through stable allowlisted telemetry.
- Operational Pills preserve signed Gap direction and do not infer healthy alert state from absent evidence.

Final Shopify evidence: full `604/604`, focused operational `48`, build, typecheck, lint, public URL guard, and relevant compose/contract gates. Live Shopify/K-food delivery is pending.

### Server

- Driver-event admission/finalization evidence is required, globally collision-safe, scoped, retained for at least 90 days, and observable when finalization fails after a committed receipt.
- Heartbeat/session health is monotonic and active-lease scoped. Stale/equal heartbeats do not mutate alerts; unresolved multi-device conflicts force BLOCKED; read projections re-age persisted heartbeats at the 60/180-second boundaries.
- Kitchener current position derives proximity and freshness from actual route-stop geometry and captured occurrence time. Stale, future, or low-confidence GPS cannot imply a nearby stop.
- Webhook admission maps malformed JSON to sanitized 400, stores only minimal replay identity, preserves durable duplicate authority, and fences outage/restart/late-worker races.
- Customer/shop redaction uses durable tombstones, common privacy locking, install epochs, preserved compliance receipts, and canonical-order suppression so stale workers or token refreshes cannot recreate erased state.
- Proof media uses scoped idempotent reservations, bounded PUT/DELETE, cleanup fencing, late-settlement compensation, durable retry evidence, and READY-only production reads.
- Driver stop status is monotonic across late and multi-device events.
- Automatic/manual email health is shop-scoped and backlog-aware. Provider success remains SENT even if later attempt settlement fails; bounded reconciliation repairs evidence without resending.
- External logs use allowlisted codes/hashes; hostile messages, stacks, correlation values, identifiers, tokens, and customer fields are excluded.
- Retention is scheduled, fair, deadline-bounded, continuation-aware, and batched with `SKIP LOCKED`. The final asymmetric alert/email cap regression prevents a zero-take tight loop.
- Online-index, migration, candidate timer, installer, health-check, and rollback scripts fail closed and preserve rollback compatibility. Proof-reservation compatibility is advertised only when the READY-read contract tests pass and their SHA is recorded.

Final Server evidence at `c421cca`:

- Full Delivery API: `2046` passed, `100` conditionally skipped.
- Disposable PostgreSQL and migration rehearsal groups: `101/101` passed.
- Final retention tight-loop targeted suite: `7/7` passed.
- Preceding combined operational/retention/READY inventory target: `52` passed, `8` conditionally skipped because no standalone DB URL was supplied; the DB variants then passed in the disposable run.
- Lint, typecheck, build, diff check, retention schedule shell test, and SSM deploy shell contract passed.

## Historical audit summary

### Kitchener, 2026-08-22

The historical signal was a split authority state: the device completed through stop 11 while the server projection remained at stop 1. Earlier presentation could collapse or omit the independent facts, making a single result look like the whole route truth. The local remediation now exposes GPS, Device, Server, signed Gap, Sync, Route, and Alert separately and re-derives freshness/conflict at read time. This is a regression-backed code conclusion, not a claim that historical production data was rewritten or the new UI is already deployed.

### K-food

The audit separated webhook durability from Admin-token health. A valid signed webhook must reach the Server durable inbox even when the app session/offline token is stale; malformed, oversized, unauthenticated, or non-durable responses must retry safely. Local burst, duplicate, outage, restart, body-bound, compliance, and tombstone contracts pass. No live K-food webhook, customer record, or production inbox was touched in this evidence update.

### Email

The audit found that configuration, worker enablement, queue age, provider delivery, recipient projection, and attempt settlement are different facts. The remediation prevents disabled or stale runtimes from appearing healthy, preserves SENT after provider success, records redacted attempt lineage, and reconciles bounded backlogs without duplicate send. This report contains no recipient, address, message body, provider token, or raw error and makes no claim that a production email was sent.

## Reviewer and architect hostile findings represented in the final heads

- Crash windows: business rollback versus attempt evidence, webhook claim versus redaction, proof write versus DB finalize, cleanup versus late PUT, provider send versus evidence settle, and deploy promotion versus installer failure.
- Concurrency: assignment generation locks, active lease takeover, conflict alert projection, terminal stop lattice, duplicate webhook bursts, order tombstone races, proof idempotency, geometry cleanup versus live append, alert observe versus resolve, and retention workers using `SKIP LOCKED`.
- Privacy: minimal webhook envelopes in every state including dead letter, durable redaction receipts/tombstones, no raw proof or corrupt migration bytes, bounded GPS retention, tenant-scoped token health, and centralized hostile-log redaction.
- Operability: backlog age and continuation, scheduled retention, fair per-job budgets, CloudWatch-compatible structured events, READY-read inventory, online-index verification, candidate-runtime staging, and rollback restoration.

## Local verification versus production pending

| Area | Local verified | Production pending |
|---|---|---|
| Driver | Unit/integration, encrypted persistence, native preflight | Physical device, signed release, staged pilot, telemetry observation |
| Shopify | Node tests, build/type/lint, URL/compose/contract gates | Manual production/K-food dispatch and live Shopify retry observation |
| Server | Full API, disposable PostgreSQL, migration and deploy shell rehearsals | EC2 image promotion, DB migration, timer installation, CloudWatch resources, live alarms |
| Email | Runtime/outbox/attempt/fault regressions | Sender credentials, worker enablement, live provider and reconciliation observation |
| Privacy | Hostile fixtures and DB race tests | Live compliance webhook sequence and operational retention monitoring |

## Cleanup and repository state

- Product worktrees were pushed at the exact heads listed above when their verification completed.
- The orchestration worktree already contains unrelated dirty route-tracking drafts and `DESIGN.md`; they were preserved untouched and are not included in this artifact commit.
- Only `.omx/artifacts/ultraqa/scenario-matrix.md` and `.omx/artifacts/ultraqa/report.md` are owned by this evidence update.
- No production action was executed, and no PII or secret-bearing evidence was copied into these artifacts.
