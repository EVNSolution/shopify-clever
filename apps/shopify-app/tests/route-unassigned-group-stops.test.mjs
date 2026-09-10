/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
const names = ["getRouteGroupChildOrderIds", "buildUnsplitRouteGroupRow", "buildRouteGroupChildRows",
  "mergeCurrentRouteRow",
  "getTimelineRouteStopIds", "moveTimelineStop", "resequenceRouteStops", "buildTimelineRows",
  "getRouteRowDraftKey", "getRouteDraftOptimized", "shouldIncludeRouteDraftRow", "getRouteDraftLabel", "buildRouteDraftPayload"];
const helpers = names.map((name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  return source.slice(start, source.indexOf("\nfunction ", start + 1));
}).join("\n");
const dependencies = {
  textOrUndefined: (v) => typeof v === "string" && v.trim() ? v.trim() : undefined,
  numberOrUndefined: (v) => v == null ? undefined : Number(v),
  firstArray: (...vs) => vs.find(Array.isArray) ?? [],
  getVisibleRouteGroupChildren: (group) => group?.children ?? [],
  getRouteGroupChildRoutePlanId: (child) => child.routePlanId,
  countRouteStopsByStatus: (stops, statuses) => stops.filter((s) => statuses.includes(s.status)).length,
  getRouteCreatedLabel: () => "created",
  getRouteStartDateTimeValue: () => "",
  getRouteStartTimeLabel: () => "–",
  getRouteMetricLabel: (...vs) => vs.find((v) => v != null) ?? "–",
  formatRouteDurationSeconds: () => "–",
  formatRouteDistanceMeters: () => "–",
  formatRouteStatus: (v) => v,
  getRouteGroupChildRouteName: (_group, child) => `#${child.routeIdx}`,
  getRouteTotalItems: (_plan, stops) => stops.reduce((n, s) => n + s.itemCount, 0),
  readRouteOptimizedSnapshot: (v) => v,
  ROUTE_DEFAULT_COLORS: ["#123456"],
  MAP_MARKER_PALETTE: { plannedOrder: { color: "#123456" } },
  ROUTE_EMPTY_LABEL: "–",
};
const { buildRouteGroupChildRows, buildRouteDraftPayload, moveTimelineStop, buildTimelineRows } =
  Function(...Object.keys(dependencies), `${helpers}\nreturn {buildRouteGroupChildRows, buildRouteDraftPayload, moveTimelineStop, buildTimelineRows};`)(...Object.values(dependencies));

function fixture(total = 42, allocated = 41) {
  const stops = Array.from({ length: total }, (_, i) => ({
    id: `stop-${i + 1}`, deliveryStopId: `delivery-${i + 1}`, orderId: `order-${i + 1}`,
    itemCount: 1, status: i === 0 ? "DELIVERED" : "READY", stop: i + 1,
  }));
  const group = { id: "group", updatedAt: "revision", assignments: stops,
    children: [44, 46, 47, 48].map((routeIdx, index) => ({
      routeIdx, routePlanId: `route-${routeIdx}`, updatedAt: `child-${routeIdx}`,
      orderIds: index === 0 ? stops.slice(0, allocated).map((s) => s.orderId) : [],
    })),
  };
  return { group, stops, rows: buildRouteGroupChildRows(group, new Map(), stops, "UTC") };
}

test("42 assignments / 41 child stops exposes the missing canonical stop as Unassigned", () => {
  const { rows, stops } = fixture();
  assert.equal(rows.length, 5);
  const pool = rows.find((r) => r.isUnassigned);
  assert.equal(pool.title, "Unassigned");
  assert.equal(pool.isPreviewOnly, false);
  assert.equal(pool.routePlanId, null);
  assert.equal(pool.tempId, undefined);
  assert.deepEqual(pool.stops, [stops[41]]);
  assert.deepEqual(rows.slice(0, 4).map((r) => r.stops.length), [41, 0, 0, 0]);
});

test("unallocated stops never become a new route or a removed-order instruction", () => {
  const { rows } = fixture();
  const payload = buildRouteDraftPayload(rows, { expectedUpdatedAt: "revision", mode: "MANUAL_ORDER" });
  assert.equal(payload.routes.length, 4);
  assert.equal(payload.routes.flatMap((r) => r.orderIds).length, 41);
  assert.deepEqual(payload.removedOrderIds, []);
  assert.equal(payload.routes.some((r) => !r.routePlanId), false);
});

test("dragging Unassigned into a child sends all 42 orders exactly once and preserves identities/progress", () => {
  const { rows, stops } = fixture();
  const pool = rows.find((r) => r.isUnassigned);
  assert.ok(pool);
  const order = moveTimelineStop(rows, {}, { stopId: stops[41].id, sourceRouteId: pool.id }, "route-46");
  const draftRows = buildTimelineRows(rows, order);
  const payload = buildRouteDraftPayload(draftRows, { mode: "MANUAL_ORDER" });
  const ids = payload.routes.flatMap((r) => r.orderIds);
  assert.equal(ids.length, 42);
  assert.equal(new Set(ids).size, 42);
  assert.deepEqual(payload.routes.map((r) => r.routePlanId), ["route-44", "route-46", "route-47", "route-48"]);
  assert.deepEqual(payload.routes[1].orderIds, ["order-42"]);
  assert.equal(draftRows[0].stops[0].status, "DELIVERED");
  assert.equal(draftRows[1].stops[0].deliveryStopId, "delivery-42");
  assert.equal(draftRows.find((r) => r.isUnassigned).stops.length, 0);
  assert.deepEqual(buildTimelineRows(rows, {}).find((r) => r.isUnassigned).stops, [{ ...stops[41], stop: 1 }]);
});

test("complete 65/65 groups retain their existing rows and payload", () => {
  const { rows } = fixture(65, 65);
  assert.equal(rows.length, 4);
  assert.equal(rows.some((r) => r.isUnassigned), false);
  assert.equal(buildRouteDraftPayload(rows).routes.flatMap((r) => r.orderIds).length, 65);
});

test("materialized child pages expose the pool and preserve sibling orders when allocating it", () => {
  const { rows, stops } = fixture();
  const memoSource = source.slice(source.indexOf("  const displayRouteRowsSource = useMemo("), source.indexOf("  const routeRows = useMemo("));
  const currentRows = [rows[1]];
  const loadRows = Function(...Object.keys(dependencies), "useMemo", "isRouteGroupDetail", "isOrdinaryRouteDetail",
    "groupRouteRowsSource", "currentRouteRowsSource", `${helpers}\n${memoSource}\nreturn {displayRouteRowsSource, contextRouteRowsSource};`);
  const result = loadRows(...Object.values(dependencies), (fn) => fn(), false, false, rows, currentRows);
  assert.deepEqual(result.displayRouteRowsSource.map((r) => r.title), ["#46", "Unassigned"]);
  const order = moveTimelineStop(result.displayRouteRowsSource, {}, { stopId: stops[41].id }, "route-46");
  const payload = buildRouteDraftPayload(buildTimelineRows(result.contextRouteRowsSource, order));
  assert.deepEqual(payload.routes.map((r) => r.orderIds.length), [41, 1, 0, 0]);
  assert.equal(new Set(payload.routes.flatMap((r) => r.orderIds)).size, 42);
  const singleton = loadRows(...Object.values(dependencies), (fn) => fn(), false, true, [rows[0], rows[4]], [rows[0]]);
  assert.deepEqual(singleton.contextRouteRowsSource.map((r) => r.title), ["#44", "Unassigned"]);
  assert.match(source, /aria-label=\{routeRow\.isUnassigned \? "Unassigned orders" : undefined\}/);
});
