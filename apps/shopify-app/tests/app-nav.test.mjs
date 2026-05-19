import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const appRoutePath = join(process.cwd(), "app/routes/app.jsx");
const appRouteSource = readFileSync(appRoutePath, "utf8");

const expectedVisibleNavItems = [
  ["/app/orders", "nav.orders"],
  ["/app/routes", "nav.routes"],
  ["/app/analytics", "nav.analytics"],
  ["/app/drivers-vehicles", "nav.drivers"],
  ["/app/settings", "nav.settings"],
];

test("Shopify app nav keeps app home separate from visible sidebar sections", () => {
  assert.match(
    appRouteSource,
    /<s-link\s+href="\/app\/orders"\s+rel="home"[\s\S]*?>\s*\{translate\(language, "nav\.home"\)\}\s*<\/s-link>/,
    "expected the app-name home row to land directly on Orders instead of the root redirect path",
  );
  assert.doesNotMatch(appRouteSource, /<s-link\s+href="\/"\s+rel="home"/);
});

test("Shopify app nav renders the requested sidebar sections in order", () => {
  const [, navItemsSource = ""] =
    appRouteSource.match(/const APP_NAV_ITEMS = \[([\s\S]*?)\];/) ?? [];
  const visibleLinks = [
    ...navItemsSource.matchAll(
      /\{ href: "([^"]+)", labelKey: "([^"]+)" \}/g,
    ),
  ].map(([, href, labelKey]) => [href, labelKey]);

  assert.deepEqual(visibleLinks, expectedVisibleNavItems);
  assert.match(appRouteSource, /fetchShopifyAppPreferences\(admin\)/);
  assert.match(appRouteSource, /const \{ apiKey, language \} = useLoaderData\(\)/);
  assert.match(appRouteSource, /translate\(language, item\.labelKey\)/);
});

test("each visible sidebar section has a matching React Router route module", () => {
  const routeFiles = [
    "app/routes/app.orders.jsx",
    "app/routes/app.routes.jsx",
    "app/routes/app.analytics.jsx",
    "app/routes/app.drivers-vehicles.jsx",
    "app/routes/app.settings.jsx",
  ];

  for (const routeFile of routeFiles) {
    assert.equal(
      existsSync(join(process.cwd(), routeFile)),
      true,
      `${routeFile} should exist`,
    );
  }
});

test("Workflows is temporarily removed from the visible app surface", () => {
  assert.equal(
    existsSync(join(process.cwd(), "app/routes/app.workflows.jsx")),
    false,
    "app.workflows.jsx should not exist while Workflows is paused",
  );
  assert.doesNotMatch(appRouteSource, /\/app\/workflows|Workflows/);
});

test("app shell does not revalidate Shopify auth on internal tab navigation", () => {
  assert.match(appRouteSource, /export function shouldRevalidate\(/);
  assert.match(appRouteSource, /function isAppPath\(pathname\)/);
  assert.match(appRouteSource, /currentUrl\.pathname/);
  assert.match(appRouteSource, /nextUrl\.pathname/);
  assert.match(appRouteSource, /return false/);
  assert.match(appRouteSource, /formMethod/);
});

test("app shell avoids static PrefetchPageLinks during SSR hydration", () => {
  assert.match(appRouteSource, /PrefetchPageLinks/);
  assert.doesNotMatch(appRouteSource, /STATIC_APP_PAGES_TO_PREFETCH/);
  assert.doesNotMatch(appRouteSource, /function StaticAppPagePrefetchLinks/);
  assert.doesNotMatch(appRouteSource, /<StaticAppPagePrefetchLinks \/>/);
});

test("app nav prefetches loader tabs only after navigation intent", () => {
  assert.match(appRouteSource, /useState/);
  assert.match(appRouteSource, /const \[intentPrefetchPage, setIntentPrefetchPage\] = useState\(null\)/);
  assert.match(appRouteSource, /function prefetchNavPage\(page\) \{/);
  assert.match(appRouteSource, /setIntentPrefetchPage\(page\)/);
  assert.match(appRouteSource, /<PrefetchPageLinks page=\{intentPrefetchPage\} \/>/);
  assert.match(appRouteSource, /onMouseEnter=\{\(\) => prefetchNavPage\(item\.href\)\}/);
  assert.match(appRouteSource, /onFocus=\{\(\) => prefetchNavPage\(item\.href\)\}/);
});


test("app nav intercepts sidebar clicks for client-side tab navigation", () => {
  assert.match(appRouteSource, /useNavigate/);
  assert.match(appRouteSource, /const navigate = useNavigate\(\)/);
  assert.match(appRouteSource, /function handleNavClick\(event, href\) \{/);
  assert.match(appRouteSource, /event\.preventDefault\(\)/);
  assert.match(appRouteSource, /navigate\(href\)/);
  assert.match(appRouteSource, /onClick=\{\(event\) => handleNavClick\(event, item\.href\)\}/);
});


test("app additional route is removed from the visible app surface", () => {
  assert.equal(
    existsSync(join(process.cwd(), "app/routes/app.additional.jsx")),
    false,
    "app.additional.jsx should not exist",
  );
  assert.doesNotMatch(appRouteSource, /additional/i);
});
