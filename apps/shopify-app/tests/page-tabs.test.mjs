import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readOrdersPageSource } from "./helpers/orders-source.mjs";

const root = process.cwd();


function readAppFile(path) {
  if (path === "app/routes/app.orders.jsx") return readOrdersPageSource();
  return readFileSync(join(root, path), "utf8");
}

const rolePages = [
  {
    file: "app/routes/app.analytics.jsx",
    title: "Analytics",
    markers: [
      "Batch dashboard",
      "Week scope selector",
      "Delivery session summary",
      "Urgent issue detail",
      "Delivery performance detail",
      "Selected week delivery",
    ],
  },
  {
    file: "app/routes/app.drivers-vehicles.jsx",
    title: "Drivers",
    markers: [
      "Drivers",
      "Invite driver",
      "Search drivers",
      "Driver list",
      "Country dial code",
    ],
  },
];

test("non-Orders/Routes tabs use a flexible purpose-led page shell", () => {
  for (const { file, title, markers } of rolePages) {
    const source = readAppFile(file);

    if (file === "app/routes/app.drivers-vehicles.jsx") {
      assert.doesNotMatch(source, /import \{ PageShell, PageSection/);
      assert.match(source, /<h1 style=\{pageTitleStyle\}>Drivers<\/h1>/);
      assert.doesNotMatch(source, /role="tablist"|drivers-vehicles\?tab=|Create driver|Create vehicle/);
    } else {
      assert.match(source, /import \{ PageShell, PageSection/);
      assert.match(source, new RegExp(`<PageShell\\s+title="${title}"`));
    }
    assert.doesNotMatch(source, /import \{ TabLayout \}/);
    assert.doesNotMatch(source, /screen layout standard/i);

    for (const marker of markers) {
      assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("Analytics is a table-first current-batch dashboard", () => {
  const source = readAppFile("app/routes/app.analytics.jsx");

  for (const label of [
    "Batch dashboard",
    "Week scope selector",
    "This week",
    "Next week",
    "Access-date week range",
    "Delivery session summary",
    "Urgent issue detail",
    "Delivery performance detail",
    "Selected week delivery",
    "Selected week pickup",
    "Selected week evening delivery",
    "Average execution time",
    "Awaiting batch data",
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

  for (const className of ["week-scope-switcher", "operations-table", "operation-status"]) {
    assert.match(source, new RegExp(className));
  }

  assert.match(source, /headerAction=\{/);
  assert.doesNotMatch(source, /className="batch-summary-list"|createBatchSummaryItems|<dl|description="/);

  assert.match(source, /아직 완료된 배송이 없습니다/);
  assert.match(source, /\/app\/analytics\?week=next/);

  for (const fabricatedMetric of ["42 min", "1h", "90%"]) {
    assert.equal(source.includes(fabricatedMetric), false);
  }

  assert.doesNotMatch(source, /status:\s*"Separate evening session"|statusTone:\s*"progress"/);
  assert.doesNotMatch(source, /Thursday-Saturday|Thursday delivery|Friday regular delivery|Friday evening delivery|Saturday pickup|목\/금/);

  assert.doesNotMatch(
    source,
    /analytics-kpi-grid|analytics-kpi-card|Overview KPI|Order health|Driver utilization|Sync\/webhook health|Missing data report/,
  );
});

test("Orders and Routes remain first-pass complete surfaces without new tab-shell feature work", () => {
  const ordersSource = readAppFile("app/routes/app.orders.jsx");
  const routesSource = readAppFile("app/routes/app.routes.jsx");

  assert.match(ordersSource, /<TabLayout\s+primaryExpanded=\{isMapWide\}/);
  assert.doesNotMatch(ordersSource, /title="Orders"/);
  assert.match(routesSource, /<h1 style=\{routesTitleStyle\}>Routes<\/h1>/);
  assert.match(routesSource, />Create routes<\/button>/);
  assert.doesNotMatch(routesSource, /Filter routes|Optimize route|Assign driver|Schedule route/);
  assert.doesNotMatch(ordersSource, /Analytics|Workflows|Drivers|Future modules/);
});
