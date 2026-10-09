/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../app/features/delivery/route-original-gps-points.jsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");

test("the pages of original points follow one another up to the cap, and only the last page ends it", () => {
  assert.match(component, /const \[autoLoad, setAutoLoad\] = useState\(true\);/);
  assert.match(component, /if \(autoLoad && read\.status === 'ready' && lastPage\?\.page\.hasMore\) sessionRef\.current\?\.next\(\);/);
  assert.match(component, /\}, \[autoLoad, lastPage, read\.status\]\);/);
});

test("Cancel stops the automatic loading, Load more and a restart bring it back", () => {
  assert.match(component, /onClick=\{\(\) => \{ setAutoLoad\(false\); sessionRef\.current\?\.cancel\(\); \}\}[^>]*>Cancel</);
  assert.match(component, /const restart = \(nextWindow = window\) => \{[^}]*setAutoLoad\(true\);/);
  assert.match(component, /const nextPage = async \(\) => \{ setAutoLoad\(true\); await sessionRef\.current\?\.next\(\);/);
});

test("the strip says how many points are loaded while more are on their way", () => {
  assert.match(component, /read\.status === 'loading' \? \(read\.pages\.length \? `\$\{observations\.length\} loaded · loading more…` : 'Loading…'\)/);
});

test("the toggle exists on the Tracking tab only and its state lives in the URL", () => {
  assert.match(page, /\.\.\.\(isTrackingMapView \? \[\{\s*ariaLabel: "Show original GPS points",\s*pressed: searchParams\.get\("gpsPoints"\) === "raw"/);
  assert.match(page, /\{isTrackingMapView && searchParams\.get\("gpsPoints"\) === "raw" \? \(\s*<RouteOriginalGpsPoints/);
  assert.match(page, /onClose=\{\(\) => setSearchParams\(gpsDiagnosticSearchParams\(searchParams, false\), \{ replace: true, preventScrollReset: true \}\)\}/);
});
