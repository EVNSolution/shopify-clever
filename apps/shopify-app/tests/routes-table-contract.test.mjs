/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { formatRouteStatus } from "../app/features/delivery/route-helpers.js";
import { formatStoreInstant } from "../app/features/shopify/store-date-time.js";
import { buildRouteRows } from "../app/features/delivery/route-list-rows.js";
import { formatStoreLocalDateTimeInput, storeLocalDateTimeToIso } from "../app/features/delivery/child-route-detail-presentation.js";
import { resolveRouteListTimeZones } from "../app/features/delivery/route-timezone.server.js";
import {
  getConfirmedRouteListRefresh,
  getRouteListRefreshKey,
  readRouteListRefreshRequest,
} from "../app/features/delivery/route-list-refresh.js";
import { getCleverAppId } from "../app/features/delivery/route-plans.server.js";

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
  return Function("formatStoreInstant", `${routesPageSource.slice(start, end)}\nreturn formatRouteInstant;`)(formatStoreInstant);
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
  assert.match(row, /formatRouteInstant\(route\.startTime, route\.startTimeZone \?\? routeTimeZones\[route\.id\]\)/);
  assert.match(row, /\{route\.orders \?\? "-"\}/);
  assert.match(row, /\{route\.totalItems \?\? "-"\}/);
  assert.match(row, /formatRouteDurationSeconds\(route\.driveTimeSeconds\)/);
  assert.match(row, /formatRouteDistanceMeters\(route\.distanceMeters\)/);
  assert.match(row, /formatRouteAmount\(route\.totalAmount, route\.currencyCode\)/);
  assert.match(row, /formatRouteInstant\(route\.createdAt, storeTimeZone\)/);
  assert.match(row, /formatRouteInstant\(route\.updatedAt, storeTimeZone\)/);
});

test("Routes header has no Actions or childless-group recovery UI", () => {
  const header = routesPageSource.slice(routesPageSource.indexOf("<header"), routesPageSource.indexOf("</header>"));

  assert.doesNotMatch(header, /routes\.list\.actions|routes\.group\.withoutRoutes|routes\.group\.choose|groupsWithoutRoutes/);
  assert.doesNotMatch(translationsSource, /"routes\.list\.actions"|"routes\.group\.withoutRoutes"|"routes\.group\.choose"/);
});

test("route timestamps honor the supplied IANA timezone and fail closed", () => {
  const formatRouteInstant = loadFormatRouteInstant();

  assert.equal(formatRouteInstant("2026-09-09T03:04:05.000Z"), "2026-09-09 03:04 UTC");
  assert.equal(formatRouteInstant("2026-09-17T13:00:00.000Z", "America/Toronto"), "2026-09-17 09:00 EDT");
  assert.equal(formatRouteInstant("2026-01-17T14:00:00.000Z", "America/Toronto"), "2026-01-17 09:00 EST");
  assert.equal(formatRouteInstant(null), "-");
  assert.equal(formatRouteInstant("not-a-date"), "-");
});

test("Start Time survives input, API JSON and list/detail display in Toronto across DST", async () => {
  const formatRouteInstant = loadFormatRouteInstant();
  const cases = [
    ["2026-07-16T09:00", "2026-07-16T13:00:00.000Z", "EDT"],
    ["2026-01-16T09:00", "2026-01-16T14:00:00.000Z", "EST"],
    ["2026-07-16T23:30", "2026-07-17T03:30:00.000Z", "EDT"],
    ["2026-03-08T01:59", "2026-03-08T06:59:00.000Z", "EST"],
    ["2026-03-08T03:00", "2026-03-08T07:00:00.000Z", "EDT"],
    ["2026-11-01T01:30", "2026-11-01T05:30:00.000Z", "EDT"],
    ["2026-11-01T02:00", "2026-11-01T07:00:00.000Z", "EST"],
  ];
  const previousTZ = process.env.TZ;
  try {
    for (const hostTimeZone of ["Asia/Seoul", "UTC", "America/Los_Angeles"]) {
      process.env.TZ = hostTimeZone;
      for (const [input, expectedInstant, abbreviation] of cases) {
        const payload = { id: "route", scheduledStartAt: storeLocalDateTimeToIso(input, "America/Toronto"), scheduledStartTimeZone: "America/Toronto" };
        assert.equal(payload.scheduledStartAt, expectedInstant);
        const [row] = buildRouteRows([JSON.parse(JSON.stringify(payload))]);
        assert.equal(row.startTimeZone, "America/Toronto");
        assert.equal(formatRouteInstant(row.startTime, row.startTimeZone), `${input.replace("T", " ")} ${abbreviation}`);
        assert.equal(formatStoreLocalDateTimeInput(row.startTime, row.startTimeZone), input);
      }
      assert.equal(storeLocalDateTimeToIso("2026-03-08T02:30", "America/Toronto"), null, "nonexistent spring-forward input is rejected");
      assert.equal(formatRouteInstant("2026-11-01T06:30:00.000Z", "America/Toronto"), "2026-11-01 01:30 EST", "second fall-back instant retains its offset label");
    }
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test("list loader reads settings and resolves legacy and saved child schedules", async () => {
  const routePlans = [{ id: "legacy", scheduledStartAt: "2026-07-17T03:30:00.000Z", planDate: "2026-07-16", driverId: "driver", status: "READY" }];
  const routeGroups = [{ id: "group", children: [{ routePlanId: "child", routePlan: { scheduledStartAt: "2026-01-17T14:00:00.000Z", scheduledStartTimeZone: "America/Toronto", planDate: "2026-01-17" } }] }];
  const calls = [];
  const session = { shop: "test.myshopify.com" };
  const admin = {};
  const loaderStart = routesPageSource.indexOf("export const loader = async");
  const loaderEnd = routesPageSource.indexOf("export function shouldRevalidate", loaderStart);
  const factory = Function("authenticate", "fetchDeliveryRoutePlans", "fetchDeliveryRouteGroups", "fetchShopifyDepartureLocation", "fetchRouteFallbackTimeZone", "resolveRouteListTimeZones", "measureRouteLoaderStep", "logStructuredMetric", "getCleverAppId", "getRouteListRefreshKey", "readRouteListRefreshRequest", "getConfirmedRouteListRefresh", "buildRouteRows", `${routesPageSource.slice(loaderStart, loaderEnd).replace("export const loader", "const loader")} return loader;`);
  const loader = factory(
    { admin: async () => ({ admin, session }) },
    async () => ({ routePlans, errors: [] }),
    async () => ({ routeGroups, errors: [] }),
    async (receivedAdmin, options) => { calls.push([receivedAdmin, options.cacheKey]); return { departureLocation: { coordinates: [-79.4760912, 43.7638824] }, errors: [] }; },
    async () => ({ ianaTimezone: "UTC", errors: [] }),
    resolveRouteListTimeZones,
    async (load) => ({ data: await load(), durationMs: 0 }),
    () => {},
    getCleverAppId,
    getRouteListRefreshKey,
    readRouteListRefreshRequest,
    getConfirmedRouteListRefresh,
    buildRouteRows,
  );
  const data = await loader({ request: new Request("https://local.test/app/routes") });
  assert.deepEqual(calls, [[admin, session.shop]]);
  assert.deepEqual(data.routeTimeZones, { legacy: "America/Toronto", child: "America/Toronto" });
  const rows = buildRouteRows(data.routePlans, data.routeGroups);
  const legacy = rows.find(row => row.id === "legacy");
  const child = rows.find(row => row.id === "child");
  const formatter = loadFormatRouteInstant();
  assert.equal(formatter(legacy.startTime, legacy.startTimeZone ?? data.routeTimeZones[legacy.id]), "2026-07-16 23:30 EDT");
  assert.equal(formatter(child.startTime, child.startTimeZone ?? data.routeTimeZones[child.id]), "2026-01-17 09:00 EST");
  assert.equal(legacy.date, "Thu 07/16", "service date stays date-only across UTC midnight");
  const filterStart = routesPageSource.indexOf("function normalizeRouteStatus(");
  const filterEnd = routesPageSource.indexOf("function getStatusBadgeStyle(", filterStart);
  const filter = Function("formatRouteStatus", `${routesPageSource.slice(filterStart, filterEnd)} return filterRouteRows;`)(formatRouteStatus);
  assert.deepEqual(filter(rows, { driverId: "driver", status: "READY" }).map(row => row.id), ["legacy"]);
  assert.equal(formatter("2026-07-16T13:00:00.000Z", "invalid-zone"), "-");
});
