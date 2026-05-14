import { useLoaderData } from "react-router";

import { PageShell, PageSection } from "../ui/page-shell";

const WEEK_SCOPE_OPTIONS = [
  { key: "current", label: "This week", href: "/app/analytics" },
  { key: "next", label: "Next week", href: "/app/analytics?week=next" },
];

const deliveryPerformanceRows = [];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

export const loader = async ({ request }) => {
  const selectedWeek = getSelectedWeekScope(request.url);
  const weekScope = createWeekScope(new Date().toISOString(), selectedWeek);

  return { selectedWeek, weekScope };
};

function getSelectedWeekScope(requestUrl) {
  const url = new URL(requestUrl);
  return url.searchParams.get("week") === "next" ? "next" : "current";
}

function createWeekScope(accessedAt, selectedWeek) {
  const accessDate = new Date(accessedAt);
  const weekStart = getAccessWeekStart(accessDate);

  if (selectedWeek === "next") {
    weekStart.setUTCDate(weekStart.getUTCDate() + 7);
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  return {
    key: selectedWeek,
    label: selectedWeek === "next" ? "Next week" : "This week",
    rangeLabel: `${dateFormatter.format(weekStart)} – ${dateFormatter.format(weekEnd)}`,
    startDate: weekStart.toISOString().slice(0, 10),
    endDate: weekEnd.toISOString().slice(0, 10),
  };
}

function getAccessWeekStart(accessDate) {
  const start = new Date(Date.UTC(accessDate.getUTCFullYear(), accessDate.getUTCMonth(), accessDate.getUTCDate()));
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

function createScopedHref(path, weekScope, params = {}) {
  const searchParams = new URLSearchParams({ weekScope, ...params });
  return `${path}?${searchParams.toString()}`;
}

function createDeliverySessionRows(weekScope) {
  return [
    {
      session: "Selected week delivery",
      date: weekScope.rangeLabel,
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
      href: createScopedHref("/app/orders", weekScope.key, { deliveryMode: "delivery" }),
    },
    {
      session: "Selected week pickup",
      date: weekScope.rangeLabel,
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
      href: createScopedHref("/app/orders", weekScope.key, { deliveryMode: "pickup" }),
    },
    {
      session: "Selected week evening delivery",
      date: weekScope.rangeLabel,
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
      href: createScopedHref("/app/orders", weekScope.key, { deliveryMode: "evening" }),
    },
  ];
}

function createUrgentIssueRows(weekScope) {
  return [
    {
      issue: "Route not confirmed near delivery date",
      count: "—",
      session: "Selected week",
      severity: "Blocked",
      cause: "Route/session plan is not confirmed",
      ownerStage: "Routes Confirmed",
      href: createScopedHref("/app/routes", weekScope.key, { stage: "routes_confirmed" }),
      linkLabel: "Open routes",
    },
    {
      issue: "Driver not assigned near delivery date",
      count: "—",
      session: "Selected week",
      severity: "Blocked",
      cause: "Route/session has no assigned driver",
      ownerStage: "Drivers Assigned",
      href: "/app/drivers-vehicles",
      linkLabel: "Open drivers",
    },
    {
      issue: "Customer ETA not notified",
      count: "—",
      session: "Selected week",
      severity: "Attention",
      cause: "Expected delivery time has not been sent",
      ownerStage: "Customer ETA Notified",
      href: "/app/settings?section=delivery",
      linkLabel: "Open delivery settings",
    },
    {
      issue: "Address or coordinate problem",
      count: "—",
      session: "Selected week",
      severity: "Blocked",
      cause: "Address review or geocode result is missing",
      ownerStage: "Exceptions Reviewed",
      href: createScopedHref("/app/orders", weekScope.key, { filter: "address_error" }),
      linkLabel: "Open Orders",
    },
    {
      issue: "Evening delivery classification",
      count: "—",
      session: "Selected week evening delivery",
      severity: "Attention",
      cause: "Evening delivery must stay separate from regular delivery",
      ownerStage: "Session Classified",
      href: createScopedHref("/app/routes", weekScope.key, { deliveryMode: "evening" }),
      linkLabel: "Open evening routes",
    },
  ];
}

export default function AnalyticsPage() {
  const { selectedWeek, weekScope } = useLoaderData();
  const deliverySessionRows = createDeliverySessionRows(weekScope);
  const urgentIssueRows = createUrgentIssueRows(weekScope);

  return (
    <PageShell
      title="Analytics"
      eyebrow="Batch dashboard"
      headerAction={(
        <nav className="week-scope-switcher" aria-label="Week scope selector">
          {WEEK_SCOPE_OPTIONS.map((option) => (
            <a key={option.key} href={option.href} aria-current={selectedWeek === option.key ? "page" : undefined}>
              {option.label}
            </a>
          ))}
        </nav>
      )}
    >
      <PageSection title="Delivery session summary">
        <div className="operations-table-wrap">
          <table className="operations-table" aria-label="Delivery session summary">
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Access-date week range</th>
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
                  <th scope="row"><a href={row.href}>{row.session}</a></th>
                  <td>{row.date}</td>
                  <td>{row.orders}</td>
                  <td>{row.stops}</td>
                  <td>{row.issues}</td>
                  <td>{row.routeConfirmed}</td>
                  <td>{row.driverAssigned}</td>
                  <td>{row.etaNotified}</td>
                  <td>{row.completed}</td>
                  <td>{row.averageExecutionTime}</td>
                  <td><span className={`operation-status operation-status--${row.statusTone}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>

      <PageSection title="Urgent issue detail">
        <div className="operations-table-wrap">
          <table className="operations-table" aria-label="Urgent issue detail">
            <thead>
              <tr>
                <th scope="col">Issue type</th>
                <th scope="col">Order/stop count</th>
                <th scope="col">Affected scope</th>
                <th scope="col">Severity</th>
                <th scope="col">Cause</th>
                <th scope="col">Owner stage</th>
                <th scope="col">Handling surface</th>
              </tr>
            </thead>
            <tbody>
              {urgentIssueRows.map((row) => (
                <tr key={row.issue}>
                  <th scope="row">{row.issue}</th>
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

      <PageSection title="Delivery performance detail">
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
              {deliveryPerformanceRows.length > 0 ? (
                deliveryPerformanceRows.map((row) => (
                  <tr key={`${row.session}-${row.route}`}>
                    <th scope="row">{row.session}</th>
                    <td>{row.route}</td>
                    <td>{row.driver}</td>
                    <td>{row.startedAt}</td>
                    <td>{row.completedAt}</td>
                    <td>{row.completedStops}</td>
                    <td>{row.totalExecutionTime}</td>
                    <td>{row.averageTimePerStop}</td>
                    <td>{row.note}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9}>아직 완료된 배송이 없습니다. 배송이 시작되면 route/session별 실행 시간이 표시됩니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageSection>
    </PageShell>
  );
}
