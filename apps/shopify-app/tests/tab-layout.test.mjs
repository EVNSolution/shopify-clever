import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const tabLayoutPath = join(root, "app/ui/tab-layout.jsx");
const pageShellPath = join(root, "app/ui/page-shell.jsx");

const flexibleTabRouteFiles = [
  "app/routes/app.analytics.jsx",
  "app/routes/app.drivers-vehicles.jsx",
  "app/routes/app.settings.jsx",
];

test("old one-size tab layout rule is removed from purpose-led tabs", () => {
  assert.equal(existsSync(tabLayoutPath), true, "Orders keeps the existing map/table compatibility layout");
  assert.equal(existsSync(pageShellPath), true, "app/ui/page-shell.jsx should define the flexible page shell");

  for (const routeFile of flexibleTabRouteFiles) {
    const source = readFileSync(join(root, routeFile), "utf8");
    assert.match(source, /import \{ PageShell/);
    assert.match(source, /<PageShell\b/);
    assert.doesNotMatch(source, /import \{ TabLayout \}/);
    assert.doesNotMatch(source, /screen layout standard/i);
  }
});

test("Orders can still use TabLayout without moving new page responsibilities into it", () => {
  const ordersSource = readFileSync(join(root, "app/routes/app.orders.jsx"), "utf8");
  const tabLayoutSource = readFileSync(tabLayoutPath, "utf8");

  assert.match(ordersSource, /import \{ TabLayout \} from "\.\.\/ui\/tab-layout";/);
  assert.match(ordersSource, /<TabLayout\s+title="Orders"/);
  assert.match(tabLayoutSource, /className="tab-layout"/);
  assert.match(tabLayoutSource, /primary, secondary, lower/);
  assert.match(tabLayoutSource, /notice/);
  assert.doesNotMatch(tabLayoutSource, /Analytics|Workflows|Drivers|Settings|User variables|Runtime\/system values/);
});

test("flexible page shell defines presentation primitives without feature-specific widgets", () => {
  const source = readFileSync(pageShellPath, "utf8");

  assert.match(source, /export function PageShell/);
  assert.match(source, /export function PageSection/);
  assert.match(source, /export function PageGrid/);
  assert.match(source, /export function ValueList/);
  assert.match(source, /export function StatusPill/);
  assert.match(source, /export function PageNote/);
  assert.doesNotMatch(source, /maplibre|OpenFreeMap|orders-map|routePlanFetcher|fetchShopifyOrders|fetchDeliveryRoutePlans/i);
});

test("routes tab stays table-first and exempt from shell-driven feature additions", () => {
  const source = readFileSync(join(root, "app/routes/app.routes.jsx"), "utf8");

  assert.doesNotMatch(source, /import \{ TabLayout \}/);
  assert.doesNotMatch(source, /import \{ PageShell \}/);
  assert.doesNotMatch(source, /<TabLayout\b|<PageShell\b/);
  assert.match(source, /const singleRouteTableStyle = \{/);
  assert.doesNotMatch(source, /routeDetailMapStyle|routeSettingsPanelStyle|routeMetricsGridStyle/);
});
