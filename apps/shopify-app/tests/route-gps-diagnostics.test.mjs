import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { formatGpsDiagnosticTimestamp, gpsDiagnosticSearchParams, initialOriginalObservationsWindow } from "../app/features/delivery/route-gps-diagnostics.js";

const position = { latitude: 43.7, longitude: -79.4, occurredAt: "2026-11-01T06:30:00Z" };

test("timestamp includes timezone and UTC offset across DST; missing values are explicit", () => {
  const value = formatGpsDiagnosticTimestamp(position.occurredAt, "America/Toronto");
  assert.match(value, /America\/Toronto/);
  assert.match(value, /GMT-05:00/);
  assert.equal(formatGpsDiagnosticTimestamp(null, "America/Toronto"), "Not provided");
  assert.match(formatGpsDiagnosticTimestamp(position.occurredAt, "invalid-zone"), /UTC/);
});

test("open/close/reopen preserves embedded context and repeated unrelated query values", () => {
  const initial = new URLSearchParams("host=embedded&shop=tenant&tag=a&tag=b");
  for (let i = 0; i < 3; i += 1) {
    const opened = gpsDiagnosticSearchParams(initial, true);
    assert.equal(opened.get("gpsPoints"), "raw");
    assert.equal(gpsDiagnosticSearchParams(opened, false).toString(), initial.toString());
  }
  assert.equal(initial.has("gpsPoints"), false);
});

test("point toggle is restricted to Tracking and never uses a separate modal or map", () => {
  const route = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  const control = readFileSync(new URL("../app/features/delivery/route-original-gps-points.jsx", import.meta.url), "utf8");
  assert.match(route, /\.\.\.\(isTrackingMapView \? \[\{\s*ariaLabel: "Show original GPS points"/);
  assert.match(route, /isTrackingMapView && searchParams.get\("gpsPoints"\) === "raw"/);
  assert.doesNotMatch(control, /showModal|dialog|recentPositions|LineString|new .*Map/);
  assert.match(route, /pressed: searchParams.get\("gpsPoints"\) === "raw"/);
  assert.match(control, /createOriginalObservationsSession/);
  assert.doesNotMatch(route, /All recorded dates|routeTrackingMapLegendStyle/);
});


test("default fixed 24-hour window starts at local service-date midnight across DST", () => {
  const range = initialOriginalObservationsWindow("2026-11-01", "America/Toronto");
  assert.equal(range.from, "2026-11-01T04:00:00.000Z");
  assert.equal(range.to, "2026-11-02T04:00:00.000Z");
  assert.match(formatGpsDiagnosticTimestamp(range.to, "America/Toronto"), /GMT-05:00/);
});
