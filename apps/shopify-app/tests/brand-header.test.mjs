import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const appConfigSource = readFileSync(join(root, "shopify.app.toml"), "utf8");
const pageShellRouteFiles = [
  "app/routes/app.analytics.jsx",
  "app/routes/app.drivers-vehicles.jsx",
  "app/routes/app.settings.jsx",
];

test("Shopify production app name uses CLEVER with the clever-route fallback handle", () => {
  assert.match(appConfigSource, /^name = "CLEVER"$/m);
  assert.match(appConfigSource, /^handle = "clever-route"$/m);
});

test("sidebar pages use tab titles instead of duplicating the app name", () => {
  const routeFiles = [
    "app/routes/app.orders.jsx",
    "app/routes/app.routes.jsx",
    ...pageShellRouteFiles,
  ];

  for (const routeFile of routeFiles) {
    const source = readFileSync(join(root, routeFile), "utf8");
    assert.doesNotMatch(
      source,
      /<s-page heading="clever">/,
      `${routeFile} should not render clever as a breadcrumb page title`,
    );
  }

  const ordersSource = readFileSync(join(root, "app/routes/app.orders.jsx"), "utf8");
  assert.match(ordersSource, /<TabLayout\s+primaryExpanded=\{isMapWide\}/);
  assert.doesNotMatch(ordersSource, /title="Orders"/);

  const routesSource = readFileSync(join(root, "app/routes/app.routes.jsx"), "utf8");
  assert.match(routesSource, /<h1 style=\{routesTitleStyle\}>Routes<\/h1>/);

  for (const routeFile of pageShellRouteFiles) {
    const source = readFileSync(join(root, routeFile), "utf8");
    assert.match(source, /<PageShell\s+title=/, `${routeFile} should use its own tab title through PageShell`);
  }
});
