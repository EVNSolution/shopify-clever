/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRouteRows,
  getExpandedRouteDeleteKeys,
  getPrimaryRouteSelectionKeys,
  getRouteDeletePayloadKeys,
  toggleRouteSelection,
} from "../app/features/delivery/route-list-rows.js";

test("route list shows an unsplit route group as the group row only", () => {
  const rows = buildRouteRows(
    [
      { id: "route-child-3", name: "Thu 07/02–Sat 07/04 orders — #3", stopsCount: 7 },
    ],
    [
      {
        id: "group-1",
        name: "Thu 07/02–Sat 07/04 orders",
        createdAt: "2026-07-02T09:00:00.000Z",
        children: [
          {
            routeIdx: 3,
            routePlanId: "route-child-3",
            routeMetrics: { distanceMeters: 1200, durationSeconds: 600 },
            routePlan: { id: "route-child-3", name: "Thu 07/02–Sat 07/04 orders — #3", stopsCount: 7 },
          },
        ],
      },
    ],
  );

  assert.deepEqual(rows.map((row) => row.rowKey), ["routeGroup:group-1"]);
  assert.equal(rows[0].route, "Thu 07/02–Sat 07/04 orders");
  assert.equal(rows[0].href, "/app/routes/groups/group-1");
  assert.equal(rows[0].deleteKey, "routeGroup:group-1");
  assert.equal(rows.some((row) => row.deleteKey === "routePlan:route-child-3"), false);
  assert.equal(rows[0].distanceMeters, 1200);
  assert.equal(rows[0].driveTimeSeconds, 600);
  assert.equal(rows[0].isSummaryRoute, true);
});

test("route list does not show collapsed route group children as standalone routes", () => {
  const rows = buildRouteRows(
    [
      {
        id: "route-child-1",
        name: "Thu 07/02 orders — #1",
        routeGroupingChild: { groupingId: "group-1" },
        status: "CANCELLED",
        stopsCount: 0,
      },
    ],
    [
      {
        id: "group-1",
        name: "Thu 07/02 orders",
        assignments: Array.from({ length: 41 }, (_, index) => ({ id: `order-${index + 1}` })),
        children: [],
        createdAt: "2026-07-02T09:00:00.000Z",
      },
    ],
  );

  assert.deepEqual(rows.map((row) => row.rowKey), ["routeGroup:group-1"]);
  assert.equal(rows[0].orders, 41);
  assert.equal(rows.some((row) => row.rowKey === "routePlan:route-child-1"), false);
});

test("route list keeps split children attached to their group in child order", () => {
  const rows = buildRouteRows(
    [
      { id: "standalone-new", name: "Standalone new", createdAt: "2026-07-04T09:00:00.000Z" },
      { id: "child-late-2", name: "Late — #2" },
      { id: "child-early-2", name: "Early — #2" },
      { id: "child-early-1", name: "Early — #1" },
    ],
    [
      {
        id: "late-group",
        name: "Late group",
        createdAt: "2026-07-03T09:00:00.000Z",
        children: [
          { routeIdx: 2, routePlanId: "child-late-2", routePlan: { id: "child-late-2", name: "Late — #2" } },
          { routeIdx: 1, routePlanId: "child-late-1", routePlan: { id: "child-late-1", name: "Late — #1" } },
        ],
      },
      {
        id: "early-group",
        name: "Early group",
        createdAt: "2026-07-01T09:00:00.000Z",
        children: [
          { routeIdx: 2, routePlanId: "child-early-2", routePlan: { id: "child-early-2", name: "Early — #2" } },
          { routeIdx: 1, routePlanId: "child-early-1", routePlan: { id: "child-early-1", name: "Early — #1" } },
        ],
      },
    ],
  );

  assert.deepEqual(rows.map((row) => row.rowKey), [
    "routeGroup:early-group",
    "routePlan:child-early-1",
    "routePlan:child-early-2",
    "routeGroup:late-group",
    "routePlan:child-late-1",
    "routePlan:child-late-2",
    "routePlan:standalone-new",
  ]);
  const earlyChildRow = rows.find((row) => row.rowKey === "routePlan:child-early-1");
  assert.equal(earlyChildRow.isDeletable, true);
  assert.equal(earlyChildRow.deleteKey, "routeGroupChild:early-group:child-early-1");
  assert.equal(earlyChildRow.routeGroupId, "early-group");
  assert.equal(earlyChildRow.routeGroupDeleteKey, "routeGroup:early-group");
});

test("route list leaves the group marker blank and gives only its children one stable accent color", () => {
  const routeGroups = [
    {
      id: "group-accent",
      name: "Accent group",
      totalOrders: 43,
      children: [
        { routeIdx: 1, routePlanId: "accent-child-1", routePlan: { id: "accent-child-1" } },
        { routeIdx: 2, routePlanId: "accent-child-2", routePlan: { id: "accent-child-2" } },
      ],
    },
  ];
  const groupedRows = buildRouteRows(
    [{ id: "standalone", name: "Standalone" }],
    routeGroups,
  );
  const repeatedRows = buildRouteRows([], routeGroups);
  const accentRows = groupedRows.filter((row) => row.routeGroupId === "group-accent");
  const groupRow = accentRows.find((row) => row.isRouteGroup);
  const childRows = accentRows.filter((row) => !row.isRouteGroup);
  const standaloneRow = groupedRows.find((row) => row.id === "standalone");

  assert.equal(accentRows.length, 3);
  assert.equal(groupRow.groupAccentColor, undefined);
  assert.equal(groupRow.groupSummary, "2 Routes - 43 Stop(s)");
  assert.ok(childRows[0].groupAccentColor);
  assert.equal(childRows[1].groupAccentColor, childRows[0].groupAccentColor);
  assert.equal(repeatedRows[1].groupAccentColor, childRows[0].groupAccentColor);
  assert.equal(standaloneRow.groupAccentColor, undefined);
});

test("route selection displays group children as checked without double-deleting them", () => {
  const rows = buildRouteRows(
    [
      { id: "standalone-new", name: "Standalone new", createdAt: "2026-07-04T09:00:00.000Z" },
    ],
    [
      {
        id: "early-group",
        name: "Early group",
        createdAt: "2026-07-01T09:00:00.000Z",
        children: [
          { routeIdx: 1, routePlanId: "child-early-1", routePlan: { id: "child-early-1", name: "Early — #1" } },
          { routeIdx: 2, routePlanId: "child-early-2", routePlan: { id: "child-early-2", name: "Early — #2" } },
        ],
      },
    ],
  );
  const groupRow = rows.find((row) => row.rowKey === "routeGroup:early-group");
  const firstChildRow = rows.find((row) => row.rowKey === "routePlan:child-early-1");

  assert.deepEqual(getExpandedRouteDeleteKeys(rows, [groupRow.deleteKey]), [
    "routeGroup:early-group",
    "routeGroupChild:early-group:child-early-1",
    "routeGroupChild:early-group:child-early-2",
  ]);
  assert.deepEqual(getRouteDeletePayloadKeys(rows, [groupRow.deleteKey]), ["routeGroup:early-group"]);
  assert.deepEqual(toggleRouteSelection(rows, [groupRow.deleteKey], firstChildRow), ["routeGroupChild:early-group:child-early-2"]);
  assert.deepEqual(getPrimaryRouteSelectionKeys(rows), ["routeGroup:early-group", "routePlan:standalone-new"]);
});
