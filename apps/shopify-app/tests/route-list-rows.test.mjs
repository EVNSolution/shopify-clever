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

test("a saved singleton stays uncolored without losing its existing membership", () => {
  const group = { id: "saved", children: [{ routePlanId: "original", routePlan: { id: "original", name: "Original" } }] };
  const before = structuredClone(group);
  const [row] = buildRouteRows([], [group]);
  assert.equal(row.groupAccentColor, null);
  assert.equal(row.routeGroupId, "saved");
  assert.equal(row.href, "/app/routes/groups/saved/routes/original");
  assert.deepEqual(group, before);
});

test("only confirmed distinct members receive a shared group color", () => {
  const plans = ["one", "two", "three"].map(id => ({ id, name: id, routeGroupingChild: { groupingId: "saved" } }));
  assert.equal(buildRouteRows(plans.slice(0, 1))[0].groupAccentColor, null);
  const rows = buildRouteRows(plans);
  assert.equal(rows.length, 3);
  assert.ok(rows[0].groupAccentColor);
  assert.equal(new Set(rows.map(row => row.groupAccentColor)).size, 1);
  assert.deepEqual(rows.map(row => row.id), ["one", "two", "three"]);
});

test("route list shows a created child once without a parent management row", () => {
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

  assert.deepEqual(rows.map((row) => row.rowKey), ["routePlan:route-child-3"]);
  assert.equal(rows[0].route, "Thu 07/02–Sat 07/04 orders — #3");
  assert.equal(rows[0].href, "/app/routes/groups/group-1/routes/route-child-3");
  assert.equal(rows[0].groupManagementHref, undefined);
  assert.equal(rows[0].deleteKey, "routeGroupChild:group-1:route-child-3");
  assert.equal(rows[0].isSummaryRoute, true);
  assert.equal(rows[0].distanceMeters, 1200);
  assert.equal(rows[0].driveTimeSeconds, 600);
});

test("route list reveals a single child after a driver is assigned", () => {
  const rows = buildRouteRows(
    [],
    [
      {
        id: "group-1",
        name: "Thu 07/16 orders",
        assignments: Array.from({ length: 4 }, (_, index) => ({ id: `order-${index + 1}` })),
        children: [
          {
            driverId: "driver-1",
            driverName: "Driver One",
            routeIdx: 3,
            routePlanId: "route-child-3",
            routePlan: {
              id: "route-child-3",
              name: "Thu 07/16 orders — #3",
              stopsCount: 4,
            },
          },
        ],
      },
    ],
  );

  assert.deepEqual(rows.map((row) => row.rowKey), [
    "routePlan:route-child-3",
  ]);
  assert.equal(rows[0].isSummaryRoute, true);
  assert.equal(rows[0].route, "Thu 07/16 orders — #3");
  assert.equal(rows[0].driver, "Driver One");
});

test("route child rows expose actual delivered counts and order totals", () => {
  const rows = buildRouteRows([], [{
    id: "group-1",
    children: [{
      routePlanId: "route-child-1",
      routePlan: {
        id: "route-child-1",
        etaRange: { startAt: "2026-09-09T14:00:00.000Z", endAt: "2026-09-09T15:00:00.000Z" },
        totalAmount: { amount: "40.00", currencyCode: "CAD" },
        stopsCount: 3,
        stops: [
          { deliveryStopStatus: "DELIVERED", totalPriceAmount: "21.50", currencyCode: "CAD" },
          { deliveryStopStatus: "FAILED", totalPriceAmount: "10.00", currencyCode: "CAD" },
          { deliveryStopStatus: "DELIVERED", totalPriceAmount: "8.50", currencyCode: "CAD" },
        ],
      },
    }],
  }]);
  const child = rows.find((row) => row.id === "route-child-1");

  assert.equal(child.delivered, 2);
  assert.equal(child.attempted, 3);
  assert.equal(child.totalAmount, 40);
  assert.equal(child.currencyCode, "CAD");
  assert.deepEqual(child.etaRange, {
    startAt: "2026-09-09T14:00:00.000Z",
    endAt: "2026-09-09T15:00:00.000Z",
  });
});

test("route list never sums mixed or currency-less fallback amounts", () => {
  const mixed = buildRouteRows([{ id: "mixed", stops: [
    { totalPriceAmount: "10.00", currencyCode: "CAD" },
    { totalPriceAmount: "20.00", currencyCode: "USD" },
  ] }]);
  const missingCurrency = buildRouteRows([{ id: "missing", stops: [
    { totalPriceAmount: "10.00", currencyCode: "CAD" },
    { totalPriceAmount: "20.00" },
  ] }]);

  assert.equal(mixed[0].totalAmount, null);
  assert.equal(mixed[0].currencyCode, null);
  assert.equal(missingCurrency[0].totalAmount, null);
  assert.equal(missingCurrency[0].currencyCode, null);
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

  assert.equal(rows[0].id, "empty-route-plans");
  assert.equal(rows[0].orders, null);
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
    "routePlan:child-early-1",
    "routePlan:child-early-2",
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
  assert.equal(accentRows.some((row) => row.isRouteGroup), false);
  const childRows = accentRows.filter((row) => !row.isRouteGroup);
  const standaloneRow = groupedRows.find((row) => row.id === "standalone");

  assert.equal(accentRows.length, 2);
  assert.ok(childRows[0].groupAccentColor);
  assert.equal(childRows[1].groupAccentColor, childRows[0].groupAccentColor);
  assert.deepEqual(childRows.map((row) => row.groupSummary), ["2 Routes - 43 Stop(s)", "2 Routes - 43 Stop(s)"]);
  assert.equal(repeatedRows[1].groupAccentColor, childRows[0].groupAccentColor);
  assert.equal(standaloneRow.groupAccentColor, null);
});

test("select-all targets each actual child and ordinary route, never the hidden group", () => {
  const rows = buildRouteRows([{id:"ordinary"}], [{id:"group", children:[
    {routePlanId:"one", routePlan:{id:"one"}},
    {routePlanId:"two", routePlan:{id:"two"}},
  ]}, {id:"childless", totalOrders:10, children:[]}]);
  const selected = getPrimaryRouteSelectionKeys(rows);
  assert.deepEqual(selected, ["routeGroupChild:group:one", "routeGroupChild:group:two", "routePlan:ordinary"]);
  assert.deepEqual(getRouteDeletePayloadKeys(rows, selected), selected);
  assert.deepEqual(getExpandedRouteDeleteKeys(rows, ["routeGroup:group"]), []);
  assert.deepEqual(getRouteDeletePayloadKeys(rows, ["routeGroup:group", "routeGroup:childless", "missing"]), []);
  assert.deepEqual(toggleRouteSelection(rows, selected, rows.find(row=>row.id==="one")), ["routeGroupChild:group:two", "routePlan:ordinary"]);
  assert.equal(rows.some(row => row.id === "childless"), false);
});

test("each route retains its own totals and copied groups use the resulting group identity", () => {
  const groups=[{id:"source", totalOrders:99, children:[
    {routePlanId:"one",routePlan:{id:"one",stopsCount:2,totalAmount:{amount:"20",currencyCode:"CAD"}}},
    {routePlanId:"two",routePlan:{id:"two",stopsCount:3,totalAmount:{amount:"45",currencyCode:"CAD"}}},
  ]}, {id:"copy",children:[{routePlanId:"virtual",routePlan:{id:"virtual",stopsCount:2,totalAmount:{amount:"20",currencyCode:"CAD"}}}]}];
  const rows=buildRouteRows([{id:"ordinary",stopsCount:1,totalAmount:{amount:"8",currencyCode:"CAD"}}],groups);
  assert.deepEqual(rows.map(row=>row.orders),[2,3,2,1]);
  assert.deepEqual(rows.map(row=>row.totalAmount),[20,45,20,8]);
  assert.equal(rows[0].groupAccentColor,rows[1].groupAccentColor);
  const independentCopy=buildRouteRows([], [groups[1]])[0];
  assert.equal(rows[2].groupAccentColor,independentCopy.groupAccentColor);
  assert.equal(rows[2].routeGroupId,"copy");
  assert.equal(rows[3].href,"/app/routes/ordinary");
});

test("route columns use each member's own summary, never group or version timestamps", () => {
  const rows = buildRouteRows([
    { id: "one", name: "London", scheduledStartAt: "2026-09-10T12:00:00Z", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-02T11:00:00Z", itemSummary: { totalQuantity: 7 }, stopsCount: 2 },
  ], [{ id: "shared", name: "Not a route", totalOrders: 999, createdAt: "2000-01-01", updatedAt: "2099-01-01", children: [
    {routePlanId: "one", routePlan: {id: "one"}, updatedAt: "2099-02-02"},
    {routePlanId: "two", routePlan: {id: "two", name: "Kitchener", itemSummary: {totalQuantity: 0}, stopsCount: 0}},
  ]}]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].route, "London");
  assert.equal(rows[0].startTime, "2026-09-10T12:00:00Z");
  assert.equal(rows[0].createdAt, "2026-09-01T10:00:00Z");
  assert.equal(rows[0].updatedAt, "2026-09-02T11:00:00Z");
  assert.equal(rows[0].totalItems, 7);
  assert.equal(rows[0].orders, 2);
  assert.equal(rows[1].totalItems, 0);
  assert.equal(rows[1].createdAt, null);
  assert.equal(rows[1].updatedAt, null);
  assert.equal(rows[0].groupAccentColor, rows[1].groupAccentColor);
});

test("membership remains a route relationship without a group container response", () => {
  const rows = buildRouteRows([
    {id:"one",name:"London",routeGroupingChild:{groupingId:"same"}},
    {id:"two",name:"Kitchener",routeGroupingChild:{groupingId:"same"}},
    {id:"ordinary",name:"Mine"},
  ], []);
  assert.deepEqual(rows.map(row=>row.route), ["London","Kitchener","Mine"]);
  assert.ok(rows[0].groupAccentColor);
  assert.equal(rows[0].groupAccentColor,rows[1].groupAccentColor);
  assert.equal(rows[2].groupAccentColor,null);
  assert.equal(rows[0].href,"/app/routes/groups/same/routes/one");
  assert.equal(rows[0].deleteKey,"routeGroupChild:same:one");
  assert.equal(rows[2].totalItems,null);
  assert.equal(rows[2].orders,null);
});

test("missing route column values stay unknown instead of inheriting group values", () => {
  const [row] = buildRouteRows([], [{id:"group", name:"Group title", totalOrders:99, createdAt:"2026-01-01", children:[{routePlanId:"empty", routePlan:{id:"empty"}}]}]);
  assert.equal(row.route, "-");
  assert.equal(row.orders, null);
  assert.equal(row.totalItems, null);
  assert.equal(row.totalAmount, null);
  assert.equal(row.startTime, null);
  assert.equal(row.createdAt, null);
  assert.equal(row.updatedAt, null);
});

test("compact Routes-list groups preserve row identity, summaries, colors, totals, and nulls", () => {
  const routePlans = [
    {
      attemptedCount: 1,
      deliveredCount: 3,
      id: "grouped-completed",
      name: "Completed child",
      status: "COMPLETED",
      stopsCount: 4,
    },
    {
      attemptedCount: 0,
      deliveredCount: 2,
      id: "ordinary",
      itemSummary: { totalQuantity: 5 },
      name: "Ordinary route",
      routeMetrics: { distanceMeters: 7000, durationSeconds: 900 },
      status: "READY",
      stopsCount: 2,
      totalAmount: { amount: "18.25", currencyCode: "CAD" },
    },
  ];
  const compactGroups = [
    {
      children: [
        {
          color: "#2563eb",
          displayStatus: "COMPLETED",
          driverId: "driver-1",
          driverName: "Driver One",
          routeIdx: 1,
          routePlanId: "grouped-completed",
          sortOrder: 1,
          stopsCount: 4,
          routeMetrics: { distanceMeters: 12000, durationSeconds: 1800 },
          routePlan: {
            createdAt: "2026-09-01T10:00:00.000Z",
            deliveredCount: 3,
            driverId: "driver-1",
            etaRange: { startAt: "2026-09-04T13:30:00.000Z", endAt: "2026-09-04T15:00:00.000Z" },
            id: "grouped-completed",
            itemSummary: { totalQuantity: 9 },
            missingCoordinates: 0,
            name: "Completed child",
            planDate: "2026-09-04",
            routeMetrics: { distanceMeters: 12000, durationSeconds: 1800 },
            scheduledStartAt: "2026-09-04T13:30:00.000Z",
            status: "COMPLETED",
            stopsCount: 4,
            totalAmount: { amount: "40.50", currencyCode: "CAD" },
            updatedAt: "2026-09-04T16:00:00.000Z",
          },
        },
        {
          color: "#2563eb",
          displayStatus: "READY",
          driverId: null,
          driverName: null,
          routeIdx: 2,
          routePlanId: "grouped-ready",
          sortOrder: 2,
          stopsCount: 1,
          routeMetrics: null,
          routePlan: {
            createdAt: "2026-09-01T10:05:00.000Z",
            deliveredCount: 0,
            driverId: null,
            etaRange: null,
            id: "grouped-ready",
            itemSummary: { totalQuantity: 0 },
            missingCoordinates: 0,
            name: "Ready child",
            planDate: "2026-09-04",
            routeMetrics: null,
            scheduledStartAt: null,
            status: "READY",
            stopsCount: 1,
            totalAmount: null,
            updatedAt: "2026-09-04T16:05:00.000Z",
          },
        },
      ],
      currentVersion: 3,
      displayStatus: "COMPLETED",
      id: "group-multi",
      name: "Multi group",
      status: "READY",
      totalOrders: 5,
      unresolvedOrders: 0,
      updatedAt: "2026-09-04T16:05:00.000Z",
    },
    {
      children: [{
        color: "#059669",
        displayStatus: "READY",
        driverId: null,
        driverName: null,
        routeIdx: 3,
        routePlanId: "single-child",
        sortOrder: 1,
        stopsCount: 0,
        routeMetrics: null,
        routePlan: {
          createdAt: "2026-09-02T10:00:00.000Z",
          deliveredCount: 0,
          driverId: null,
          etaRange: null,
          id: "single-child",
          itemSummary: { totalQuantity: 0 },
          missingCoordinates: 0,
          name: "Single child",
          planDate: "2026-09-05",
          routeMetrics: null,
          scheduledStartAt: null,
          status: "READY",
          stopsCount: 0,
          totalAmount: null,
          updatedAt: "2026-09-05T10:00:00.000Z",
        },
      }],
      currentVersion: 1,
      displayStatus: "READY",
      id: "group-single",
      name: "Single group",
      status: "READY",
      totalOrders: 0,
      unresolvedOrders: 0,
      updatedAt: "2026-09-05T10:00:00.000Z",
    },
    {
      children: [],
      currentVersion: 1,
      displayStatus: "READY",
      id: "group-empty",
      name: "Empty group",
      status: "READY",
      totalOrders: 0,
      unresolvedOrders: 0,
      updatedAt: "2026-09-05T11:00:00.000Z",
    },
  ];

  const rows = buildRouteRows(routePlans, compactGroups);
  const completed = rows.find((row) => row.id === "grouped-completed");
  const ready = rows.find((row) => row.id === "grouped-ready");
  const single = rows.find((row) => row.id === "single-child");
  const ordinary = rows.find((row) => row.id === "ordinary");

  assert.deepEqual(rows.map((row) => row.id), [
    "grouped-completed",
    "grouped-ready",
    "single-child",
    "ordinary",
  ]);
  assert.equal(completed.href, "/app/routes/groups/group-multi/routes/grouped-completed");
  assert.equal(completed.deleteKey, "routeGroupChild:group-multi:grouped-completed");
  assert.equal(completed.route, "Completed child");
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.orders, 4);
  assert.equal(completed.totalItems, 9);
  assert.equal(completed.delivered, 3);
  assert.equal(completed.attempted, 1);
  assert.equal(completed.totalAmount, 40.5);
  assert.equal(completed.currencyCode, "CAD");
  assert.equal(completed.distanceMeters, 12000);
  assert.equal(completed.driveTimeSeconds, 1800);
  assert.ok(completed.groupAccentColor);
  assert.equal(ready.groupAccentColor, completed.groupAccentColor);
  assert.equal(ready.totalAmount, null);
  assert.equal(ready.currencyCode, null);
  assert.equal(ready.distanceMeters, null);
  assert.equal(ready.driver, "-");
  assert.equal(single.groupAccentColor, null);
  assert.equal(single.orders, 0);
  assert.equal(single.totalAmount, null);
  assert.equal(ordinary.groupAccentColor, null);
  assert.equal(ordinary.href, "/app/routes/ordinary");
  assert.equal(ordinary.totalAmount, 18.25);
  assert.equal(rows.some((row) => row.id === "group-empty"), false);
  assert.deepEqual(getPrimaryRouteSelectionKeys(rows), [
    "routeGroupChild:group-multi:grouped-completed",
    "routeGroupChild:group-multi:grouped-ready",
    "routeGroupChild:group-single:single-child",
    "routePlan:ordinary",
  ]);
});
