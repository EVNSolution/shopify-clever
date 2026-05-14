# Analytics and Workflows Batch Dashboard Design

Status: Approved design for operating v1  
Date: 2026-05-11  
Scope: `Analytics` and `Workflows` tabs in the Tomatono Shopify delivery admin app

## Goal

Define the product intent and UI information architecture for `Analytics` and `Workflows` as operating-v1 surfaces. Both tabs should focus on the current delivery batch rather than long-range reporting or generic automation setup.

The approved direction is **Batch Dashboard**:

- `Analytics` answers: **What is wrong in this delivery batch, and how much have we already completed?**
- `Workflows` answers: **At each operating stage, how many orders/stops/routes/sessions exist, and is the batch progressing normally?**

## Operational context

The design reflects the Tomatono operating process described in the May 2026 email thread:

- The menu is updated on Tuesday.
- Orders are accepted until the following Monday.
- That week's delivery happens from Thursday through Saturday.
- After Monday cutoff, planning starts on Tuesday.
- The weekly delivery batch is split by day and by pickup/delivery using EasyRoute-style attributes.
- Route planning is confirmed per delivery day/session, then drivers are assigned.
- Customers receive expected delivery-time notices after routes and driver assignments are ready.
- Friday evening delivery is a separate operating session:
  - It starts around 17:00.
  - It is separate from regular Friday delivery.
  - Morning/daytime drivers usually finish around 14:00-15:00, so evening delivery can use different drivers.

The email's `2026.05.07-05.09 배송전체` is a historical example batch. Product behavior should always default to the current active batch, or the next delivery batch if no active execution batch exists.

## Non-goals

- Do not create Analytics report detail routes.
- Do not create Workflows rule, exception, log, or status detail routes.
- Do not make Workflows a full rule-editing screen in v1.
- Do not make Analytics a monthly BI/reporting module in v1.
- Do not add many internal tabs, nested cards, or decorative KPI blocks.
- Do not hide operational facts behind extra clicks when a summary row and detail table can show them directly.

## Shared operating concepts

### Delivery batch

A delivery batch is the main planning and execution unit.

Required fields:

- Batch name, e.g. `2026.05.07-05.09 배송전체`
- Order intake period
- Cutoff timestamp/status
- Delivery period
- Batch status
- Total order count
- Total stop count
- Delivery count
- Pickup count
- Unresolved issue count
- Completed delivery count
- Average delivery execution time, when available

### Delivery sessions

The default Tomatono batch sessions are:

1. Thursday delivery
2. Thursday pickup
3. Friday regular delivery
4. Friday pickup
5. Friday evening delivery
6. Saturday delivery
7. Saturday pickup

Friday evening delivery must remain separate from Friday regular delivery.

### Counting units

Workflows uses mixed counting because different stages are managed at different operating levels:

- Order/stop count: how many customer-facing items are waiting or blocked.
- Route/session count: whether the operating plan for each day/session is ready.
- Exception count: how many items are blocking the next step.

Analytics also uses mixed counting, but always presents it as batch health and delivery performance.

### Delivery execution time

Delivery execution time means:

- Start: driver departure or delivery-start timestamp.
- End: route/session/delivery completion timestamp.

Analytics should show:

- Completed delivery count
- Completed pickup count, if tracked
- Total execution time
- Average execution time
- Session-level average time
- Route-level time
- Driver-level completed count and average time

If start/end timestamps are not yet available, show an explicit empty or unavailable state rather than fake values.

## Analytics product intent

`Analytics` is the current-batch operating diagnosis screen. It should help the operator quickly answer:

- Which sessions in the current Thursday-Saturday delivery batch are not ready?
- Which orders/stops are urgent because the delivery date is close but planning, assignment, ETA notice, or exception review is incomplete?
- How many deliveries have been completed so far?
- How long did completed delivery execution take?
- Which session, route, or driver is slower or blocked?
- Where should the operator go to fix the issue: Orders, Routes, Drivers, Workflows, or Settings?

Analytics is not the place to edit operational rules or manage the full process stage-by-stage. It is the place to discover issues and verify execution performance.

## Analytics information architecture

Use a simple vertical structure:

1. Batch summary
2. Delivery session summary table
3. Urgent issue detail table
4. Delivery performance detail table

### 1. Batch summary

Use a compact summary block, not a grid of cards.

Show:

- Current batch name
- Order intake period
- Cutoff status
- Delivery period
- Batch status
- Total orders
- Total stops
- Delivery / pickup split
- Unresolved issues
- Completed deliveries
- Average delivery execution time

Example copy:

```text
2026.05.07-05.09 배송전체
주문 접수: 2026.04.29-2026.05.04
배송 기간: 목-토
상태: 경로 계획 중
```

### 2. Delivery session summary table

This table is the primary comparison surface for Analytics.

Rows:

- Thursday delivery
- Thursday pickup
- Friday regular delivery
- Friday pickup
- Friday evening delivery
- Saturday delivery
- Saturday pickup

Columns:

- Session
- Date
- Orders
- Stops
- Issues
- Route confirmed
- Driver assigned
- ETA notified
- Completed
- Average execution time
- Status

Rows should link to the relevant operational surface:

- Orders filters for order/stop lists
- Routes for route/session review
- Workflows for stage/session blockers
- Drivers for driver assignment issues

### 3. Urgent issue detail table

This table shows the first items the operator should resolve.

Priority order:

1. Delivery date is close and route is not confirmed.
2. Delivery date is close and driver is not assigned.
3. Customer ETA is not notified.
4. Address or coordinate problem.
5. Delivery date/session is unclassified.
6. Friday evening delivery is mixed into regular Friday delivery.
7. Cancelled, duplicate, or unpaid order issue.

Columns:

- Issue type
- Order/stop count
- Affected session
- Severity
- Cause
- Owner stage
- Handling surface
- Link

### 4. Delivery performance detail table

Show this only when at least one route/session has execution data. Otherwise show a clear empty state.

Columns:

- Delivery date/session
- Route
- Driver
- Started at
- Completed at
- Completed stops
- Total execution time
- Average time per stop
- Status / note

Empty state example:

```text
아직 완료된 배송이 없습니다.
배송이 시작되면 route/session별 실행 시간이 표시됩니다.
```

## Workflows product intent

`Workflows` is the current-batch process control screen. It should help the operator quickly answer:

- Has the weekly batch moved through the expected operating stages?
- How many orders, stops, routes, or sessions are currently in each stage?
- Which stage is blocked?
- Which blocked items require action first?
- What is the next operational action?

Workflows is not primarily a rule editor. In v1, rules are displayed as applied operating facts, while edits belong in Settings or a future rule drawer/modal.

## Workflows information architecture

Use a simple vertical structure:

1. Batch workflow summary
2. Workflow stage summary table
3. Session progress matrix
4. Workflow detail table
5. Activity log table

### 1. Batch workflow summary

Use a compact summary block.

Show:

- Current batch
- Current major stage
- Main bottleneck
- Next action
- Completed stage count
- Blocked stage count

Example copy:

```text
현재 단계: 경로 확정 중
병목: 주소 확인 3건, 금요일 저녁배송 미배정 5건
다음 작업: 금요일 저녁배송 기사 배정
```

### 2. Workflow stage summary table

This replaces a card-heavy workflow board.

Rows:

1. Menu Updated
2. Orders Received
3. Cutoff Closed
4. Batch Created
5. Session Classified
6. Exceptions Reviewed
7. Routes Confirmed
8. Drivers Assigned
9. Customer ETA Notified
10. Delivery In Progress
11. Completed
12. Reviewed

Columns:

- Stage
- Status
- Orders
- Stops
- Routes / sessions
- Exceptions
- Handling surface
- Next action

Supported statuses:

- Not started
- In progress
- Blocked
- Complete

### 3. Session progress matrix

This remains as a compact table because it gives a strong at-a-glance view of the weekly batch.

Rows:

- Thursday delivery
- Thursday pickup
- Friday regular delivery
- Friday pickup
- Friday evening delivery
- Saturday delivery
- Saturday pickup

Columns:

- Classified
- Exceptions reviewed
- Route confirmed
- Driver assigned
- ETA notified
- Delivery in progress
- Completed

Cell statuses:

- Complete
- In progress
- Blocked
- Not started

### 4. Workflow detail table

This table replaces separate exception cards and detailed sub-tabs. Default ordering should put blocked or attention-required items first.

Columns:

- Stage
- Target type: order / stop / route / session
- Target name or ID
- Session
- Problem / status
- Handling surface
- Last updated
- Next action

Examples:

- `Session Classified` / `stop` / `#1008` / `Friday evening delivery` / `misclassified as Friday regular delivery`
- `Drivers Assigned` / `session` / `Friday evening delivery` / `Friday evening delivery` / `driver not assigned`
- `Customer ETA Notified` / `route` / `Friday East Loop` / `Friday regular delivery` / `ETA not sent`

### 5. Activity log table

Keep this as a lower-priority audit table, not a primary control surface.

Columns:

- Time
- Event
- Target
- Result
- Note

Events include:

- Order synced
- Cutoff closed
- Batch created
- Session classified
- Route confirmed
- Driver assigned
- ETA notified
- Route started
- Delivery completed
- Exception created/resolved

## Rule status handling

Applied operating rules should appear as read-only facts in the relevant summary/detail rows, not as a separate rule-management page.

Rules to expose in v1:

- Monday cutoff applied
- Thursday-Saturday delivery batch created
- Attribute-based day/session classification applied
- Delivery/pickup split applied
- Friday evening delivery separated
- Paid orders included
- Cancelled/duplicate orders excluded or flagged
- Coordinate failure blocks route creation

If a rule must be edited, link to Settings or a future drawer/modal. Do not create `workflows/rules/:ruleId` routes.

## Navigation and detail boundaries

Allowed destinations:

- Orders for order and stop review
- Routes for route/session review
- Drivers for driver assignment review
- Workflows for process-stage blockers
- Settings for configuration/default/rule source review

Forbidden in v1:

- `app.analytics.$reportId.jsx`
- `app.workflows.rules.$ruleId.jsx`
- `app.workflows.exceptions.$exceptionId.jsx`
- `app.workflows.logs.$eventId.jsx`
- Additional object-detail routes for Analytics or Workflows

Details should use row expansion, drawer, modal, or direct links to existing operational pages.

## UI simplification rules

- Prefer tables over cards when comparing sessions, stages, or issues.
- Avoid internal tabs in Analytics and Workflows.
- Use one page-level flow per tab.
- Keep the most important summary at the top.
- Use compact status labels for `complete`, `in progress`, `blocked`, and `not started`.
- Keep Friday evening delivery visible as its own row wherever sessions are listed.
- Do not show fake hard-coded metrics as if they are real operating data.
- If data is missing, show `Unavailable`, `Not started`, or a clear empty state.

## Implementation-facing changes

Likely files:

- `app/routes/app.analytics.jsx`
- `app/routes/app.workflows.jsx`
- `app/ui/page-shell.jsx`, only if shared table/status helpers are needed
- `tests/page-tabs.test.mjs`
- `tests/navigation-contract.test.mjs`

Expected implementation direction:

- Replace Analytics hard-coded KPI cards with compact batch summary and operational tables.
- Replace Workflows board/cards with stage summary table, session matrix, and workflow detail table.
- Keep existing navigation contract: exactly six visible daily-operations tabs.
- Keep Analytics and Workflows free of new detail routes.
- Preserve Orders and Routes behavior unless a link target requires a query parameter convention.

## Acceptance criteria

Analytics acceptance criteria:

- The page defaults to the current active or next delivery batch.
- The page shows a compact batch summary.
- The page shows a session summary table with Thursday, Friday regular, Friday evening, and Saturday sessions.
- The page shows urgent issue details in a table.
- The page shows delivery execution performance only when execution data exists.
- Friday evening delivery is separate from Friday regular delivery.
- Issue rows link to existing operational surfaces.
- No Analytics detail route is introduced.

Workflows acceptance criteria:

- The page defaults to the current active or next delivery batch.
- The page shows a compact workflow summary.
- The page shows the 12-stage workflow summary table.
- The page shows the session progress matrix.
- The page shows blocked/attention-required workflow details in a table.
- Applied rule facts are visible without turning Workflows into a rule editor.
- Friday evening delivery is separate from Friday regular delivery.
- No Workflow detail route is introduced.

Verification acceptance criteria:

- Navigation tests still prove the visible app tabs are Orders, Routes, Analytics, Workflows, Drivers, and Settings.
- Tests still forbid Analytics and Workflows detail route files.
- Page tests assert the table-oriented structure and Friday evening session row.
- Existing Orders and Routes tests remain green or are not affected by these page-only changes.

## Risks and decisions

- If route/session execution timestamps do not exist yet, delivery-time metrics must show empty/unavailable states rather than fake values.
- If current batch selection is not available yet, use the next delivery batch derived from cutoff and delivery window rules.
- If pickup timing is not tracked like delivery timing, Analytics should distinguish pickup completion count from delivery execution time.
- If EasyRoute attributes are imported as free text, classification logic should normalize them before they power session rows.
- The approved UI style is intentionally table-first to reduce visual noise and avoid card/tab sprawl.
