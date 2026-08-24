import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getRouteStopLocationMessage,
  normalizeRouteStopLocationDiagnostic,
  summarizeRouteStopLocationDiagnostics,
} from "../app/features/delivery/route-stop-location-diagnostic.js";

test("legacy zero coordinates remain visible as a critical location error", () => {
  const diagnostic = normalizeRouteStopLocationDiagnostic({
    countryCode: "1",
    geocodeStatus: "RESOLVED",
    latitude: 0,
    longitude: 0,
    province: "ONTARIO",
  });

  assert.deepEqual(diagnostic, {
    issues: ["COUNTRY_CODE_INVALID", "COORDINATES_ZERO", "GEOCODE_STATUS_INCONSISTENT"],
    routeable: false,
    severity: "CRITICAL",
  });
  assert.equal(getRouteStopLocationMessage(diagnostic), "Coordinates are invalid and must be corrected.");
});

test("server diagnostics are preserved and summarized without stop address data", () => {
  const stops = [{
    locationDiagnostic: {
      issues: ["COORDINATES_OUTSIDE_PROVINCE"],
      routeable: false,
      severity: "CRITICAL",
    },
  }, {
    locationDiagnostic: { issues: [], routeable: true, severity: "NONE" },
  }];

  assert.deepEqual(summarizeRouteStopLocationDiagnostics(stops), {
    affectedCount: 1,
    criticalCount: 1,
    warningCount: 0,
  });
});

test("route detail renders persistent Polaris warnings and excludes unrouteable stops from the map", () => {
  const source = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");

  assert.match(source, /<s-banner[^>]+heading="Location review required"[^>]+tone=\{routeLocationDiagnosticSummary\.criticalCount > 0 \? "critical" : "warning"\}/);
  assert.match(source, /<s-badge tone=/);
  assert.match(source, />Location \{row\.locationDiagnostic\.severity === "CRITICAL" \? "error" : "warning"\}<\/s-badge>/);
  assert.match(source, /hasCoordinates: coordinates != null && locationDiagnostic\.routeable/);
  assert.match(source, /const hasUnrouteableStop = routeRow\.stops\.some\(\(stop\) => stop\.locationDiagnostic\?\.routeable === false\)/);
});
