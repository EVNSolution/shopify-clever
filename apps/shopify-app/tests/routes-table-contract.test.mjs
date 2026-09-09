/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const routesPageSource = readFileSync(join(root, "app/routes/app.routes.jsx"), "utf8");
const translationsSource = readFileSync(join(root, "app/i18n/i18n.js"), "utf8");

function getRouteTableBlock() {
  const start = routesPageSource.indexOf("<table style={singleRouteTableStyle}>");
  const end = routesPageSource.indexOf("</table>", start);
  assert.notEqual(start, -1, "Routes table start is present");
  assert.notEqual(end, -1, "Routes table end is present");
  return routesPageSource.slice(start, end);
}

function loadFormatRouteInstant() {
  const start = routesPageSource.indexOf("function formatRouteInstant(");
  const end = routesPageSource.indexOf("function buildRoutesSummary(", start);
  assert.notEqual(start, -1, "route instant formatter is present");
  assert.notEqual(end, -1, "Routes summary follows the instant formatter");
  return Function(`${routesPageSource.slice(start, end)}\nreturn formatRouteInstant;`)();
}

test("Routes list renders the exact 12-column contract", () => {
  const table = getRouteTableBlock();
  const header = table.slice(table.indexOf("<thead>"), table.indexOf("</thead>"));
  const keys = Array.from(header.matchAll(/translate\(language, "([^"]+)"\)/g), (match) => match[1]);

  assert.deepEqual(keys, [
    "routes.table.name",
    "routes.table.status",
    "routes.table.driver",
    "routes.table.startTime",
    "routes.table.stops",
    "routes.table.totalItems",
    "routes.table.totalDriveTime",
    "routes.table.totalDistance",
    "routes.table.totalPrice",
    "routes.table.created",
    "routes.table.lastModified",
  ]);
  assert.equal((header.match(/<th\b/g) ?? []).length, 12);
  assert.doesNotMatch(header, /routes\.table\.(route|date|orders|delivered|amount|eta|area)/);
});

test("group color is rendered inside the route name cell and route metrics stay per row", () => {
  const table = getRouteTableBlock();
  const row = table.slice(table.indexOf("routeRows.map"), table.indexOf("</tr>", table.indexOf("routeRows.map")));

  assert.match(row, /<td style=\{routeNameCellStyle\}>[\s\S]*route\.groupAccentColor[\s\S]*route\.route[\s\S]*<\/td>/);
  assert.doesNotMatch(table, /routeGroupMarkerHeaderCellStyle|routeGroupMarkerCellStyle/);
  assert.match(row, /formatRouteInstant\(route\.startTime\)/);
  assert.match(row, /\{route\.orders \?\? "-"\}/);
  assert.match(row, /\{route\.totalItems \?\? "-"\}/);
  assert.match(row, /formatRouteDurationSeconds\(route\.driveTimeSeconds\)/);
  assert.match(row, /formatRouteDistanceMeters\(route\.distanceMeters\)/);
  assert.match(row, /formatRouteAmount\(route\.totalAmount, route\.currencyCode\)/);
  assert.match(row, /formatRouteInstant\(route\.createdAt\)/);
  assert.match(row, /formatRouteInstant\(route\.updatedAt\)/);
});

test("Routes header has no Actions or childless-group recovery UI", () => {
  const header = routesPageSource.slice(routesPageSource.indexOf("<header"), routesPageSource.indexOf("</header>"));

  assert.doesNotMatch(header, /routes\.list\.actions|routes\.group\.withoutRoutes|routes\.group\.choose|groupsWithoutRoutes/);
  assert.doesNotMatch(translationsSource, /"routes\.list\.actions"|"routes\.group\.withoutRoutes"|"routes\.group\.choose"/);
});

test("route timestamps use the shared UTC formatter and fail closed", () => {
  const formatRouteInstant = loadFormatRouteInstant();

  assert.equal(formatRouteInstant("2026-09-09T03:04:05.000Z"), "2026-09-09 03:04 UTC");
  assert.equal(formatRouteInstant(null), "-");
  assert.equal(formatRouteInstant("not-a-date"), "-");
});
