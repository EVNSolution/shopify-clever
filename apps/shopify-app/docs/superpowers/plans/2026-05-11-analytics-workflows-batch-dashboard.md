# Analytics and Workflows Batch Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current card/link-heavy Analytics and Workflows pages with table-first current-batch operating dashboards.

**Architecture:** Keep the existing React Router page modules and `PageShell` primitives. Add compact shared CSS classes for summary lists, operational tables, and status labels. Implement the first pass as honest source-level operating UI: values that require delivery-server batch data show `—`, `Unavailable`, or a clear empty state instead of fabricated metrics.

**Tech Stack:** React 18, React Router route modules, plain JSX, Node `node:test`, existing global CSS.

---

## Scope check

The approved spec covers two related page surfaces in the same navigation area. They can be implemented in one plan because they share the same current-batch vocabulary, table-first UI style, and source-level route tests.

Do not modify Orders, Routes, Drivers, Settings, server sync logic, or map logic in this plan. The current working tree contains unrelated local changes; implementation workers must touch only the files listed per task and must not stage unrelated files.

## File structure

- `tests/page-tabs.test.mjs`
  - Owns source-level page role checks.
  - Update Analytics and Workflows markers from old card/board copy to new batch/table copy.
- `tests/navigation-contract.test.mjs`
  - Owns navigation and forbidden route contract.
  - Update Analytics and Workflows contract tests to assert table-first operational links and no detail routes.
- `app/styles/global.css`
  - Add reusable visual classes for summary lists, operations tables, and status labels.
  - Do not add feature-specific business logic here.
- `app/routes/app.analytics.jsx`
  - Replace KPI cards and linked mini sections with current-batch summary, delivery-session table, urgent-issue table, and performance table empty state.
- `app/routes/app.workflows.jsx`
  - Replace workflow board and value-list sections with workflow summary, stage table, session matrix, workflow detail table, and activity log empty state.

## Task 1: Lock the Analytics table-first contract

**Files:**
- Modify: `tests/page-tabs.test.mjs`
- Modify: `tests/navigation-contract.test.mjs`
- Test: `tests/page-tabs.test.mjs`
- Test: `tests/navigation-contract.test.mjs`

- [ ] **Step 1: Update Analytics markers in `tests/page-tabs.test.mjs`**

In the `rolePages` array, replace the Analytics markers with this exact list:

```js
markers: [
  "Current delivery batch",
  "Delivery session summary",
  "Urgent issue detail",
  "Delivery performance detail",
  "Friday evening delivery",
],
```

Keep the Workflows and Drivers marker lists unchanged in this step.

- [ ] **Step 2: Add the Analytics table-first source test in `tests/page-tabs.test.mjs`**

Add this test after `non-Orders/Routes tabs use a flexible purpose-led page shell`:

```js
test("Analytics is a table-first current-batch dashboard", () => {
  const source = readAppFile("app/routes/app.analytics.jsx");

  for (const label of [
    "Current delivery batch",
    "Delivery session summary",
    "Urgent issue detail",
    "Delivery performance detail",
    "Friday evening delivery",
    "Average execution time",
  ]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const ariaLabel of [
    'aria-label="Delivery session summary"',
    'aria-label="Urgent issue detail"',
    'aria-label="Delivery performance detail"',
  ]) {
    assert.match(source, new RegExp(ariaLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const className of ["batch-summary-list", "operations-table", "operation-status"]) {
    assert.match(source, new RegExp(className));
  }

  assert.doesNotMatch(
    source,
    /analytics-kpi-grid|analytics-kpi-card|Overview KPI|Order health|Driver utilization|Sync\/webhook health|Missing data report/,
  );
});
```

- [ ] **Step 3: Replace only the Analytics navigation-contract test**

In `tests/navigation-contract.test.mjs`, replace the existing test named `Analytics routes findings into existing operational pages instead of report details` with this exact test:

```js
test("Analytics summarizes current-batch sessions, issues, and execution without report details", () => {
  const source = readAppFile("app/routes/app.analytics.jsx");

  for (const label of [
    "Current delivery batch",
    "Delivery session summary",
    "Urgent issue detail",
    "Delivery performance detail",
    "Thursday delivery",
    "Friday regular delivery",
    "Friday evening delivery",
    "Saturday pickup",
    "Average execution time",
  ]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const href of [
    "/app/orders?deliverySession=friday_evening",
    "/app/routes?session=friday_evening",
    "/app/workflows?session=friday_evening",
    "/app/drivers-vehicles",
  ]) {
    assert.match(source, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(source, /analytics\/:reportId|app\.analytics\.\$reportId|Webhook event detail page|Chart detail page/);
  assert.doesNotMatch(source, /analytics-kpi-grid|analytics-kpi-card|Overview KPI|Missing data report/);
});
```

- [ ] **Step 4: Run the targeted tests and confirm they fail for Analytics**

Run:

```bash
node --test tests/page-tabs.test.mjs tests/navigation-contract.test.mjs
```

Expected: FAIL. The failure should mention missing new Analytics strings such as `Current delivery batch`, `Delivery session summary`, or the old Analytics page still containing card/KPI copy.

Do not commit while these tests fail.

## Task 2: Implement the Analytics table-first batch dashboard

**Files:**
- Modify: `app/styles/global.css`
- Modify: `app/routes/app.analytics.jsx`
- Test: `tests/page-tabs.test.mjs`
- Test: `tests/navigation-contract.test.mjs`

- [ ] **Step 1: Add table-first shared styles to `app/styles/global.css`**

Append this block after the existing `.linked-table` rule:

```css
.batch-summary-list {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
}

.batch-summary-list > div {
  background: #f7f7f7;
  border: 1px solid #e3e3e3;
  border-radius: 10px;
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 9px 11px;
}

.batch-summary-list dt {
  color: #616161;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
}

.batch-summary-list dd {
  color: #303030;
  font-size: 13px;
  line-height: 1.35;
  margin: 0;
}

.operations-table-wrap {
  overflow-x: auto;
}

.operations-table {
  border-collapse: collapse;
  color: #303030;
  font-size: 13px;
  min-width: 760px;
  width: 100%;
}

.operations-table th,
.operations-table td {
  border-bottom: 1px solid #e3e3e3;
  padding: 9px 10px;
  text-align: left;
  vertical-align: top;
}

.operations-table th {
  background: #f7f7f7;
  color: #616161;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
}

.operations-table tr:last-child td {
  border-bottom: 0;
}

.operations-table a {
  color: #005bd3;
  text-decoration: none;
}

.operations-table a:hover {
  text-decoration: underline;
}

.operation-status {
  border-radius: 999px;
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  padding: 4px 8px;
  white-space: nowrap;
}

.operation-status--complete {
  background: #e5f5ec;
  color: #0b6b3a;
}

.operation-status--progress {
  background: #eaf4ff;
  color: #174a7c;
}

.operation-status--blocked {
  background: #fff1b8;
  color: #4f3f00;
}

.operation-status--idle {
  background: #f1f1f1;
  color: #616161;
}
```

Also add `.batch-summary-list` to the existing mobile media rule so it becomes one column on small screens:

```css
@media (max-width: 860px) {
  .page-grid--two,
  .page-grid--three,
  .analytics-kpi-grid,
  .workflow-board,
  .resource-tab-list,
  .settings-section-links,
  .batch-summary-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 2: Replace `app/routes/app.analytics.jsx` with the batch-dashboard implementation**

Use this complete file content:

```jsx
import { PageShell, PageSection, PageNote } from "../ui/page-shell";

const batchSummaryItems = [
  { label: "Batch", value: "Current active delivery batch" },
  { label: "Order intake", value: "Tuesday menu update → Monday cutoff" },
  { label: "Delivery window", value: "Thursday-Saturday" },
  { label: "Batch status", value: "Shown from delivery batch state" },
  { label: "Orders / stops", value: "—" },
  { label: "Delivery / pickup", value: "—" },
  { label: "Unresolved issues", value: "See urgent issue detail" },
  { label: "Average execution time", value: "Unavailable until delivery starts" },
];

const deliverySessionRows = [
  {
    session: "Thursday delivery",
    date: "Thursday",
    orders: "—",
    stops: "—",
    issues: "—",
    routeConfirmed: "—",
    driverAssigned: "—",
    etaNotified: "—",
    completed: "—",
    averageExecutionTime: "Unavailable",
    status: "Awaiting batch data",
    statusTone: "idle",
    href: "/app/orders?deliverySession=thursday_delivery",
  },
  {
    session: "Thursday pickup",
    date: "Thursday",
    orders: "—",
    stops: "—",
    issues: "—",
    routeConfirmed: "—",
    driverAssigned: "—",
    etaNotified: "—",
    completed: "—",
    averageExecutionTime: "Unavailable",
    status: "Awaiting batch data",
    statusTone: "idle",
    href: "/app/orders?deliverySession=thursday_pickup",
  },
  {
    session: "Friday regular delivery",
    date: "Friday",
    orders: "—",
    stops: "—",
    issues: "—",
    routeConfirmed: "—",
    driverAssigned: "—",
    etaNotified: "—",
    completed: "—",
    averageExecutionTime: "Unavailable",
    status: "Awaiting batch data",
    statusTone: "idle",
    href: "/app/orders?deliverySession=friday_regular",
  },
  {
    session: "Friday pickup",
    date: "Friday",
    orders: "—",
    stops: "—",
    issues: "—",
    routeConfirmed: "—",
    driverAssigned: "—",
    etaNotified: "—",
    completed: "—",
    averageExecutionTime: "Unavailable",
    status: "Awaiting batch data",
    statusTone: "idle",
    href: "/app/orders?deliverySession=friday_pickup",
  },
  {
    session: "Friday evening delivery",
    date: "Friday 17:00+",
    orders: "—",
    stops: "—",
    issues: "—",
    routeConfirmed: "—",
    driverAssigned: "—",
    etaNotified: "—",
    completed: "—",
    averageExecutionTime: "Unavailable",
    status: "Separate evening session",
    statusTone: "progress",
    href: "/app/orders?deliverySession=friday_evening",
  },
  {
    session: "Saturday delivery",
    date: "Saturday",
    orders: "—",
    stops: "—",
    issues: "—",
    routeConfirmed: "—",
    driverAssigned: "—",
    etaNotified: "—",
    completed: "—",
    averageExecutionTime: "Unavailable",
    status: "Awaiting batch data",
    statusTone: "idle",
    href: "/app/orders?deliverySession=saturday_delivery",
  },
  {
    session: "Saturday pickup",
    date: "Saturday",
    orders: "—",
    stops: "—",
    issues: "—",
    routeConfirmed: "—",
    driverAssigned: "—",
    etaNotified: "—",
    completed: "—",
    averageExecutionTime: "Unavailable",
    status: "Awaiting batch data",
    statusTone: "idle",
    href: "/app/orders?deliverySession=saturday_pickup",
  },
];

const urgentIssueRows = [
  {
    issue: "Route not confirmed near delivery date",
    count: "—",
    session: "Thursday-Saturday",
    severity: "Blocked",
    cause: "Route/session plan is not confirmed",
    ownerStage: "Routes Confirmed",
    href: "/app/workflows?stage=routes_confirmed",
    linkLabel: "Open workflow stage",
  },
  {
    issue: "Driver not assigned near delivery date",
    count: "—",
    session: "Thursday-Saturday",
    severity: "Blocked",
    cause: "Route/session has no assigned driver",
    ownerStage: "Drivers Assigned",
    href: "/app/drivers-vehicles",
    linkLabel: "Open drivers",
  },
  {
    issue: "Customer ETA not notified",
    count: "—",
    session: "Thursday-Saturday",
    severity: "Attention",
    cause: "Expected delivery time has not been sent",
    ownerStage: "Customer ETA Notified",
    href: "/app/workflows?stage=customer_eta_notified",
    linkLabel: "Open ETA stage",
  },
  {
    issue: "Address or coordinate problem",
    count: "—",
    session: "All sessions",
    severity: "Blocked",
    cause: "Address review or geocode result is missing",
    ownerStage: "Exceptions Reviewed",
    href: "/app/orders?filter=address_error",
    linkLabel: "Open Orders",
  },
  {
    issue: "Friday evening delivery classification",
    count: "—",
    session: "Friday evening delivery",
    severity: "Attention",
    cause: "Evening delivery must not be mixed with Friday regular delivery",
    ownerStage: "Session Classified",
    href: "/app/workflows?session=friday_evening",
    linkLabel: "Open Friday evening workflow",
  },
];

const deliveryPerformanceRows = [];

function SummaryList({ items }) {
  return (
    <dl className="batch-summary-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusLabel({ tone = "idle", children }) {
  return <span className={`operation-status operation-status--${tone}`}>{children}</span>;
}

export default function AnalyticsPage() {
  return (
    <PageShell
      title="Analytics"
      eyebrow="Batch dashboard"
      description="이번 배송 batch의 임박 주문, 문제, 완료 성과, 배송 실행 시간을 확인합니다."
    >
      <PageSection title="Current delivery batch" description="Analytics는 현재 활성 batch 또는 다음 배송 batch를 기본 범위로 사용합니다.">
        <SummaryList items={batchSummaryItems} />
      </PageSection>

      <PageSection title="Delivery session summary" description="목/금/금저녁/토 세션을 한 표에서 비교합니다.">
        <div className="operations-table-wrap">
          <table className="operations-table" aria-label="Delivery session summary">
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Date</th>
                <th scope="col">Orders</th>
                <th scope="col">Stops</th>
                <th scope="col">Issues</th>
                <th scope="col">Route confirmed</th>
                <th scope="col">Driver assigned</th>
                <th scope="col">ETA notified</th>
                <th scope="col">Completed</th>
                <th scope="col">Average execution time</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {deliverySessionRows.map((row) => (
                <tr key={row.session}>
                  <td><a href={row.href}>{row.session}</a></td>
                  <td>{row.date}</td>
                  <td>{row.orders}</td>
                  <td>{row.stops}</td>
                  <td>{row.issues}</td>
                  <td>{row.routeConfirmed}</td>
                  <td>{row.driverAssigned}</td>
                  <td>{row.etaNotified}</td>
                  <td>{row.completed}</td>
                  <td>{row.averageExecutionTime}</td>
                  <td><StatusLabel tone={row.statusTone}>{row.status}</StatusLabel></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PageNote>Friday evening delivery is separate from Friday regular delivery and links to <a href="/app/routes?session=friday_evening">Routes</a> and <a href="/app/workflows?session=friday_evening">Workflows</a>.</PageNote>
      </PageSection>

      <PageSection title="Urgent issue detail" description="먼저 처리해야 할 batch 이슈를 처리 화면과 함께 보여줍니다.">
        <div className="operations-table-wrap">
          <table className="operations-table" aria-label="Urgent issue detail">
            <thead>
              <tr>
                <th scope="col">Issue type</th>
                <th scope="col">Order/stop count</th>
                <th scope="col">Affected session</th>
                <th scope="col">Severity</th>
                <th scope="col">Cause</th>
                <th scope="col">Owner stage</th>
                <th scope="col">Handling surface</th>
              </tr>
            </thead>
            <tbody>
              {urgentIssueRows.map((row) => (
                <tr key={row.issue}>
                  <td>{row.issue}</td>
                  <td>{row.count}</td>
                  <td>{row.session}</td>
                  <td>{row.severity}</td>
                  <td>{row.cause}</td>
                  <td>{row.ownerStage}</td>
                  <td><a href={row.href}>{row.linkLabel}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>

      <PageSection title="Delivery performance detail" description="배송 시작부터 완료까지의 실행 시간을 route/session/driver 단위로 표시합니다.">
        {deliveryPerformanceRows.length > 0 ? (
          <div className="operations-table-wrap">
            <table className="operations-table" aria-label="Delivery performance detail">
              <thead>
                <tr>
                  <th scope="col">Delivery date/session</th>
                  <th scope="col">Route</th>
                  <th scope="col">Driver</th>
                  <th scope="col">Started at</th>
                  <th scope="col">Completed at</th>
                  <th scope="col">Completed stops</th>
                  <th scope="col">Total execution time</th>
                  <th scope="col">Average time per stop</th>
                  <th scope="col">Status / note</th>
                </tr>
              </thead>
              <tbody>
                {deliveryPerformanceRows.map((row) => (
                  <tr key={`${row.session}-${row.route}`}>
                    <td>{row.session}</td>
                    <td>{row.route}</td>
                    <td>{row.driver}</td>
                    <td>{row.startedAt}</td>
                    <td>{row.completedAt}</td>
                    <td>{row.completedStops}</td>
                    <td>{row.totalExecutionTime}</td>
                    <td>{row.averageTimePerStop}</td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <PageNote>아직 완료된 배송이 없습니다. 배송이 시작되면 route/session별 실행 시간이 표시됩니다.</PageNote>
        )}
      </PageSection>
    </PageShell>
  );
}
```

- [ ] **Step 3: Run the targeted Analytics tests**

Run:

```bash
node --test tests/page-tabs.test.mjs tests/navigation-contract.test.mjs
```

Expected: PASS for the current Analytics-only contract.

- [ ] **Step 4: Commit the Analytics slice when the targeted tests pass for existing assertions**

Run:

```bash
git add app/styles/global.css app/routes/app.analytics.jsx tests/page-tabs.test.mjs tests/navigation-contract.test.mjs
git commit -m "Make Analytics batch-first and table-oriented" \
  -m "Document the current delivery batch through compact summaries and operational tables instead of KPI cards." \
  -m "Constraint: Friday evening delivery is a separate Tomatono operating session." \
  -m "Rejected: KPI cards and linked mini-sections | They hide session comparison behind visual clutter." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep Analytics linked to existing operational pages and avoid report detail routes." \
  -m "Tested: node --test tests/page-tabs.test.mjs tests/navigation-contract.test.mjs" \
  -m "Not-tested: Live delivery-server batch data integration."
```

## Task 3: Lock the Workflows table-first contract

**Files:**
- Modify: `tests/page-tabs.test.mjs`
- Modify: `tests/navigation-contract.test.mjs`
- Test: `tests/page-tabs.test.mjs`
- Test: `tests/navigation-contract.test.mjs`

- [ ] **Step 1: Update Workflows markers in `tests/page-tabs.test.mjs`**

In the `rolePages` array, replace the Workflows markers with this exact list:

```js
markers: [
  "Batch workflow summary",
  "Workflow stage summary",
  "Session progress matrix",
  "Workflow detail",
  "Activity log",
],
```

- [ ] **Step 2: Add the Workflows table-first source test in `tests/page-tabs.test.mjs`**

Add this test after `Analytics is a table-first current-batch dashboard`:

```js
test("Workflows is a table-first current-batch process dashboard", () => {
  const source = readAppFile("app/routes/app.workflows.jsx");

  for (const label of [
    "Batch workflow summary",
    "Workflow stage summary",
    "Session progress matrix",
    "Workflow detail",
    "Activity log",
    "Menu Updated",
    "Customer ETA Notified",
    "Friday evening delivery",
  ]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const ariaLabel of [
    'aria-label="Workflow stage summary"',
    'aria-label="Session progress matrix"',
    'aria-label="Workflow detail"',
    'aria-label="Activity log"',
  ]) {
    assert.match(source, new RegExp(ariaLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(source, /workflow-board|Preset rules|Dispatch checklist|role="tablist"|workflows\/rules|workflows\/exceptions|workflows\/logs/);
});
```

- [ ] **Step 3: Replace only the Workflows navigation-contract test**

In `tests/navigation-contract.test.mjs`, replace the existing test named `Workflows uses board, exception drawers, rule drawers, and operational links` with this exact test:

```js
test("Workflows summarizes current-batch stages, sessions, and blocked details without workflow detail routes", () => {
  const source = readAppFile("app/routes/app.workflows.jsx");

  for (const label of [
    "Batch workflow summary",
    "Workflow stage summary",
    "Session progress matrix",
    "Workflow detail",
    "Activity log",
    "Menu Updated",
    "Orders Received",
    "Cutoff Closed",
    "Batch Created",
    "Session Classified",
    "Exceptions Reviewed",
    "Routes Confirmed",
    "Drivers Assigned",
    "Customer ETA Notified",
    "Delivery In Progress",
    "Completed",
    "Reviewed",
    "Friday evening delivery",
    "Monday cutoff applied",
    "Attribute-based day/session classification",
    "Coordinate failure blocks route creation",
  ]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const href of [
    "/app/orders?workflowStage=exceptions_reviewed",
    "/app/routes?stage=routes_confirmed",
    "/app/drivers-vehicles",
    "/app/settings?section=delivery",
  ]) {
    assert.match(source, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(source, /workflows\/rules|workflows\/exceptions|workflows\/logs|app\.workflows\.rules|app\.workflows\.exceptions/);
  assert.doesNotMatch(source, /workflow-board|Rule drawer|Exception drawer|Dispatch checklist|role="tablist"/);
});
```

- [ ] **Step 4: Run the targeted tests and confirm they fail for Workflows**

Run:

```bash
node --test tests/page-tabs.test.mjs tests/navigation-contract.test.mjs
```

Expected: FAIL. The failure should mention missing new Workflows strings such as `Batch workflow summary`, `Workflow stage summary`, or `Session progress matrix`.

Do not commit while these tests fail.

## Task 4: Implement the Workflows table-first process dashboard

**Files:**
- Modify: `app/routes/app.workflows.jsx`
- Test: `tests/page-tabs.test.mjs`
- Test: `tests/navigation-contract.test.mjs`

- [ ] **Step 1: Replace `app/routes/app.workflows.jsx` with the process-dashboard implementation**

Use this complete file content:

```jsx
import { PageShell, PageSection, PageNote } from "../ui/page-shell";

const workflowSummaryItems = [
  { label: "Batch", value: "Current active delivery batch" },
  { label: "Current stage", value: "Shown from batch workflow state" },
  { label: "Main bottleneck", value: "See Workflow detail" },
  { label: "Next action", value: "Resolve blocked rows first" },
  { label: "Completed stages", value: "—" },
  { label: "Blocked stages", value: "—" },
  { label: "Cutoff", value: "Monday cutoff applied" },
  { label: "Delivery window", value: "Thursday-Saturday" },
];

const workflowStageRows = [
  { stage: "Menu Updated", status: "Complete", tone: "complete", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/settings?section=delivery", action: "Confirm weekly menu is active" },
  { stage: "Orders Received", status: "In progress", tone: "progress", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/orders", action: "Review synced Shopify orders" },
  { stage: "Cutoff Closed", status: "In progress", tone: "progress", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/orders?workflowStage=cutoff_closed", action: "Separate orders after Monday cutoff" },
  { stage: "Batch Created", status: "Not started", tone: "idle", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/workflows?stage=batch_created", action: "Create Thursday-Saturday batch" },
  { stage: "Session Classified", status: "Not started", tone: "idle", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/workflows?stage=session_classified", action: "Classify day and pickup/delivery attributes" },
  { stage: "Exceptions Reviewed", status: "Blocked", tone: "blocked", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/orders?workflowStage=exceptions_reviewed", action: "Resolve address, coordinate, payment, duplicate, and cancellation issues" },
  { stage: "Routes Confirmed", status: "Not started", tone: "idle", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/routes?stage=routes_confirmed", action: "Confirm route plans per session" },
  { stage: "Drivers Assigned", status: "Not started", tone: "idle", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/drivers-vehicles", action: "Assign drivers, including Friday evening delivery" },
  { stage: "Customer ETA Notified", status: "Not started", tone: "idle", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/workflows?stage=customer_eta_notified", action: "Send expected delivery-time notices" },
  { stage: "Delivery In Progress", status: "Not started", tone: "idle", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/routes?status=IN_PROGRESS", action: "Track active routes" },
  { stage: "Completed", status: "Not started", tone: "idle", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/routes?status=COMPLETED", action: "Review completed routes" },
  { stage: "Reviewed", status: "Not started", tone: "idle", orders: "—", stops: "—", sessions: "—", exceptions: "—", surface: "/app/analytics", action: "Check batch outcomes in Analytics" },
];

const sessionProgressRows = [
  { session: "Thursday delivery", classified: "—", exceptions: "—", routes: "—", drivers: "—", eta: "—", progress: "—", completed: "—" },
  { session: "Thursday pickup", classified: "—", exceptions: "—", routes: "—", drivers: "—", eta: "—", progress: "—", completed: "—" },
  { session: "Friday regular delivery", classified: "—", exceptions: "—", routes: "—", drivers: "—", eta: "—", progress: "—", completed: "—" },
  { session: "Friday pickup", classified: "—", exceptions: "—", routes: "—", drivers: "—", eta: "—", progress: "—", completed: "—" },
  { session: "Friday evening delivery", classified: "Separate session", exceptions: "—", routes: "—", drivers: "—", eta: "—", progress: "—", completed: "—" },
  { session: "Saturday delivery", classified: "—", exceptions: "—", routes: "—", drivers: "—", eta: "—", progress: "—", completed: "—" },
  { session: "Saturday pickup", classified: "—", exceptions: "—", routes: "—", drivers: "—", eta: "—", progress: "—", completed: "—" },
];

const workflowDetailRows = [
  { stage: "Session Classified", targetType: "session", target: "Friday evening delivery", session: "Friday evening delivery", problem: "Keep separate from Friday regular delivery", surface: "/app/workflows?session=friday_evening", updated: "—", action: "Check classification" },
  { stage: "Exceptions Reviewed", targetType: "order/stop", target: "Address or coordinate issues", session: "All sessions", problem: "Coordinate failure blocks route creation", surface: "/app/orders?workflowStage=exceptions_reviewed", updated: "—", action: "Open Orders" },
  { stage: "Routes Confirmed", targetType: "route/session", target: "Unconfirmed route plans", session: "Thursday-Saturday", problem: "Routes must be confirmed before driver assignment", surface: "/app/routes?stage=routes_confirmed", updated: "—", action: "Open Routes" },
  { stage: "Drivers Assigned", targetType: "session", target: "Driver assignment", session: "Friday evening delivery", problem: "Evening delivery can use a different driver pool", surface: "/app/drivers-vehicles", updated: "—", action: "Open Drivers" },
  { stage: "Customer ETA Notified", targetType: "order/stop", target: "Customer notices", session: "Thursday-Saturday", problem: "ETA notices should follow confirmed routes and drivers", surface: "/app/workflows?stage=customer_eta_notified", updated: "—", action: "Review ETA stage" },
  { stage: "Rule status", targetType: "rule", target: "Monday cutoff applied", session: "Batch", problem: "Orders after cutoff are separated from the current batch", surface: "/app/settings?section=delivery", updated: "—", action: "Open Delivery Rules" },
  { stage: "Rule status", targetType: "rule", target: "Attribute-based day/session classification", session: "Batch", problem: "EasyRoute-style attributes classify day and pickup/delivery", surface: "/app/settings?section=delivery", updated: "—", action: "Open Delivery Rules" },
];

const activityLogRows = [];

function SummaryList({ items }) {
  return (
    <dl className="batch-summary-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusLabel({ tone = "idle", children }) {
  return <span className={`operation-status operation-status--${tone}`}>{children}</span>;
}

export default function WorkflowsPage() {
  return (
    <PageShell
      title="Workflows"
      eyebrow="Batch process"
      description="이번 배송 batch가 운영 단계별로 어디까지 진행됐고 어디서 막혔는지 확인합니다."
    >
      <PageSection title="Batch workflow summary" description="현재 batch의 주요 단계, 병목, 다음 작업을 요약합니다.">
        <SummaryList items={workflowSummaryItems} />
      </PageSection>

      <PageSection title="Workflow stage summary" description="주문, stop, route/session, 예외가 각 운영 단계에 얼마나 남아 있는지 확인합니다.">
        <div className="operations-table-wrap">
          <table className="operations-table" aria-label="Workflow stage summary">
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Status</th>
                <th scope="col">Orders</th>
                <th scope="col">Stops</th>
                <th scope="col">Routes / sessions</th>
                <th scope="col">Exceptions</th>
                <th scope="col">Handling surface</th>
                <th scope="col">Next action</th>
              </tr>
            </thead>
            <tbody>
              {workflowStageRows.map((row) => (
                <tr key={row.stage}>
                  <td>{row.stage}</td>
                  <td><StatusLabel tone={row.tone}>{row.status}</StatusLabel></td>
                  <td>{row.orders}</td>
                  <td>{row.stops}</td>
                  <td>{row.sessions}</td>
                  <td>{row.exceptions}</td>
                  <td><a href={row.surface}>Open</a></td>
                  <td>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>

      <PageSection title="Session progress matrix" description="목/금/금저녁/토 세션별 진행 상태를 compact table로 비교합니다.">
        <div className="operations-table-wrap">
          <table className="operations-table" aria-label="Session progress matrix">
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Classified</th>
                <th scope="col">Exceptions reviewed</th>
                <th scope="col">Route confirmed</th>
                <th scope="col">Driver assigned</th>
                <th scope="col">ETA notified</th>
                <th scope="col">Delivery in progress</th>
                <th scope="col">Completed</th>
              </tr>
            </thead>
            <tbody>
              {sessionProgressRows.map((row) => (
                <tr key={row.session}>
                  <td>{row.session}</td>
                  <td>{row.classified}</td>
                  <td>{row.exceptions}</td>
                  <td>{row.routes}</td>
                  <td>{row.drivers}</td>
                  <td>{row.eta}</td>
                  <td>{row.progress}</td>
                  <td>{row.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>

      <PageSection title="Workflow detail" description="Blocked 또는 attention-required 항목을 기존 운영 화면으로 연결합니다.">
        <div className="operations-table-wrap">
          <table className="operations-table" aria-label="Workflow detail">
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Target type</th>
                <th scope="col">Target</th>
                <th scope="col">Session</th>
                <th scope="col">Problem / status</th>
                <th scope="col">Handling surface</th>
                <th scope="col">Last updated</th>
                <th scope="col">Next action</th>
              </tr>
            </thead>
            <tbody>
              {workflowDetailRows.map((row) => (
                <tr key={`${row.stage}-${row.target}`}>
                  <td>{row.stage}</td>
                  <td>{row.targetType}</td>
                  <td>{row.target}</td>
                  <td>{row.session}</td>
                  <td>{row.problem}</td>
                  <td><a href={row.surface}>{row.action}</a></td>
                  <td>{row.updated}</td>
                  <td>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PageNote>Workflows shows applied operating facts such as Monday cutoff applied and Attribute-based day/session classification. Rule editing stays in Settings.</PageNote>
      </PageSection>

      <PageSection title="Activity log" description="프로세스 이벤트는 보조 감사 테이블로 표시합니다.">
        {activityLogRows.length > 0 ? (
          <div className="operations-table-wrap">
            <table className="operations-table" aria-label="Activity log">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Event</th>
                  <th scope="col">Target</th>
                  <th scope="col">Result</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {activityLogRows.map((row) => (
                  <tr key={`${row.time}-${row.event}-${row.target}`}>
                    <td>{row.time}</td>
                    <td>{row.event}</td>
                    <td>{row.target}</td>
                    <td>{row.result}</td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <PageNote>아직 표시할 workflow activity event가 없습니다.</PageNote>
        )}
      </PageSection>
    </PageShell>
  );
}
```

- [ ] **Step 2: Run the targeted page and navigation tests**

Run:

```bash
node --test tests/page-tabs.test.mjs tests/navigation-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit the Workflows slice**

Run:

```bash
git add app/routes/app.workflows.jsx tests/page-tabs.test.mjs tests/navigation-contract.test.mjs
git commit -m "Make Workflows stage-first and table-oriented" \
  -m "Represent the current delivery batch through stage, session, and blocked-detail tables instead of workflow cards." \
  -m "Constraint: Workflows is a process dashboard, not a rule editor or detail-route hierarchy." \
  -m "Rejected: Workflow boards, preset rule cards, and dispatch checklist cards | They add visual volume without stage-count clarity." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep Friday evening delivery separate and keep workflow details inside tables or existing operational pages." \
  -m "Tested: node --test tests/page-tabs.test.mjs tests/navigation-contract.test.mjs" \
  -m "Not-tested: Live workflow event ingestion."
```

## Task 5: Verify the full page-tab contract

**Files:**
- Test only

- [ ] **Step 1: Run the relevant source-level test suite**

Run:

```bash
node --test tests/page-tabs.test.mjs tests/navigation-contract.test.mjs tests/tab-layout.test.mjs tests/brand-header.test.mjs tests/app-nav.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run lint or explain an environment failure**

Run:

```bash
npm run lint
```

Expected: PASS. If dependencies are missing, capture the exact missing command/package message and run the source-level tests from Step 1 as the blocking verification for this page-only change.

- [ ] **Step 3: Run typecheck or explain an environment failure**

Run:

```bash
npm run typecheck
```

Expected: PASS. If React Router typegen or TypeScript fails because of unrelated current working tree changes, capture the exact first failure and do not modify unrelated files.

- [ ] **Step 4: Confirm no forbidden routes were added**

Run:

```bash
find app/routes -maxdepth 1 -type f | sort | rg 'app\.analytics\.|app\.workflows\.'
```

Expected output must include only:

```text
app/routes/app.analytics.jsx
app/routes/app.workflows.jsx
```

- [ ] **Step 5: Confirm the final diff only touches planned files**

Run:

```bash
git status --short
```

Expected: only the planned files are changed for this work. Existing unrelated local changes may still appear; do not stage or commit them.

## Plan self-review

Spec coverage:

- Analytics product intent is covered by Task 1 and Task 2.
- Analytics batch summary, session summary table, urgent issue table, and performance table are covered by Task 2.
- Workflows product intent is covered by Task 3 and Task 4.
- Workflows summary, stage table, session matrix, workflow detail table, and activity log are covered by Task 4.
- Friday evening delivery is asserted in both page and navigation tests.
- Detail-route boundaries remain covered by `tests/navigation-contract.test.mjs`.

Consistency check:

- Shared CSS classes used by pages are `batch-summary-list`, `operations-table-wrap`, `operations-table`, and `operation-status`.
- Status tones used by both pages are `complete`, `progress`, `blocked`, and `idle`.
- The tests assert the same section titles and route strings used in the implementation snippets.

Known verification boundary:

- This plan implements table-first source UI and contracts. Live delivery batch counts, execution timestamps, and workflow event ingestion remain integration work outside this page-structure pass.
