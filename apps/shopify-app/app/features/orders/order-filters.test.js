import test from "node:test";
import assert from "node:assert/strict";
import {
  filterOrders,
  getOrderDeliveryExceptionState,
  getOrderFilterOptions,
  getOrderFiltersFromSearchParams,
  hasActiveOrderFilters,
  isOrderDeliveryComplete,
  isOrderDeliveryDatePast,
  isOrderRouteAssigned,
  isOrderRouteCreated,
  isOrderRoutePlanningLocked,
  updateOrderFilterSearchParams,
} from "./order-filters.js";

const orders = [
  {
    id: "order-1",
    name: "#1118",
    customer: "Claire Jeon",
    address: "112 Kirk Dr, Thornhill, ON",
    deliveryArea: "Thornhill",
    deliveryDate: "2026-05-14",
    deliveryLabel: "Thu 05/14",
    orderedDate: "2026-05-08",
    planningStatus: "UNPLANNED",
  },
  {
    id: "order-2",
    name: "#1124",
    customer: "Ryan Jung",
    address: "300 Borough Dr, Scarborough, ON",
    deliveryArea: "Scarborough",
    deliveryDate: "2026-05-15",
    deliveryLabel: "Fri 05/15",
    orderedDate: "2026-05-09",
    planningStatus: "PLANNED",
  },
  {
    id: "order-3",
    name: "#1131",
    customer: "Noah Yoon",
    address: "300 City Centre Dr, Mississauga, ON",
    deliveryArea: "Mississauga",
    deliveryDate: "2026-05-16",
    deliveryLabel: "Sat 05/16",
    orderedDate: "2026-05-09",
    planningStatus: "UNPLANNED",
  },
];

test("filters orders by delivery area, delivery date, and ordered date", () => {
  assert.deepEqual(
    filterOrders(orders, {
      deliveryArea: "Scarborough",
      deliveryDate: "2026-05-15",
      orderedDate: "2026-05-09",
    }).map((order) => order.id),
    ["order-2"],
  );

  assert.deepEqual(
    filterOrders(orders, {
      deliveryArea: "Scarborough",
      deliveryDate: "2026-05-16",
      orderedDate: "2026-05-09",
    }),
    [],
  );
});

test("filters delivery dates with date-only normalization", () => {
  assert.deepEqual(
    filterOrders(
      [
        { id: "date-only", deliveryDate: "2026-05-18" },
        { id: "date-time", deliveryDate: "2026-05-18T13:30:00.000Z" },
        { id: "other-date", deliveryDate: "2026-05-19T00:00:00.000Z" },
      ],
      { deliveryDate: "2026-05-18" },
    ).map((order) => order.id),
    ["date-only", "date-time"],
  );
});

test("ignores removed search filters and legacy q query parameters", () => {
  assert.deepEqual(
    filterOrders(orders, { search: "city centre" }).map((order) => order.id),
    ["order-1", "order-2", "order-3"],
  );

  assert.deepEqual(getOrderFiltersFromSearchParams(new URLSearchParams("q=claire")), {
    deliveryArea: "",
    deliveryDate: "",
    orderedDate: "",
    planned: "false",
  });
});

test("defaults the query-backed Orders view to un-routed while All is explicit", () => {
  const defaultFilters = getOrderFiltersFromSearchParams(new URLSearchParams("id_token=session"));

  assert.deepEqual(defaultFilters, {
    deliveryArea: "",
    deliveryDate: "",
    orderedDate: "",
    planned: "false",
  });

  assert.deepEqual(
    filterOrders(orders, {
      ...defaultFilters,
      referenceDate: "2026-05-14",
    }).map((order) => order.id),
    ["order-1", "order-3"],
  );

  assert.equal(hasActiveOrderFilters(defaultFilters), false);

  assert.deepEqual(
    filterOrders(orders, {
      planned: "false",
      referenceDate: "2026-05-14",
    }).map((order) => order.id),
    ["order-1", "order-3"],
  );

  assert.deepEqual(
    filterOrders(orders, { planned: "all" }).map((order) => order.id),
    ["order-1", "order-2", "order-3"],
  );

  assert.deepEqual(
    filterOrders(orders, { planned: "true" }).map((order) => order.id),
    ["order-1", "order-2", "order-3"],
  );

  assert.equal(isOrderRouteCreated(orders[1]), true);
  assert.equal(isOrderRouteCreated(orders[0]), false);
});

test("treats route-assigned and later-stage orders as planned-stage orders", () => {
  const stagedOrders = [
    ...orders,
    {
      id: "order-4",
      name: "#1143",
      customer: "Ryan Jung",
      address: "200 Town Centre Ct, Scarborough, ON",
      deliveryArea: "Scarborough",
      deliveryDate: "2026-05-15",
      orderedDate: "2026-05-09",
      planningStatus: "DISPATCHED",
    },
    {
      id: "order-5",
      name: "#1139",
      customer: "Daniel Kim",
      address: "101 Town Centre Blvd, Markham, ON",
      deliveryArea: "Markham",
      deliveryDate: "2026-05-15",
      orderedDate: "2026-05-09",
      routePlanId: "route-plan-1",
    },
  ];

  assert.equal(isOrderRouteCreated(stagedOrders[3]), true);
  assert.equal(isOrderRouteCreated(stagedOrders[4]), true);

  assert.deepEqual(
    filterOrders(stagedOrders, {
      planned: "false",
      referenceDate: "2026-05-14",
    }).map((order) => order.id),
    ["order-1", "order-3"],
  );

  assert.deepEqual(
    filterOrders(stagedOrders, { planned: "all" }).map((order) => order.id),
    ["order-1", "order-2", "order-3", "order-4", "order-5"],
  );
});

test("defaults Orders to current unplanned delivery dates and hides past due orders", () => {
  const datedOrders = [
    {
      id: "past-unassigned",
      deliveryDate: "2026-05-14",
      planningStatus: "UNPLANNED",
    },
    {
      id: "today-unassigned",
      deliveryDate: "2026-05-18",
      planningStatus: "UNPLANNED",
    },
    {
      id: "future-unassigned",
      deliveryDate: "2026-05-19",
      planningStatus: "UNPLANNED",
    },
    {
      id: "past-assigned",
      deliveryDate: "2026-05-14",
      routeStatus: "ASSIGNED",
    },
  ];

  assert.deepEqual(
    filterOrders(datedOrders, {
      planned: "false",
      referenceDate: "2026-05-18",
    }).map((order) => order.id),
    ["today-unassigned", "future-unassigned"],
  );

  assert.deepEqual(
    filterOrders(datedOrders, {
      planned: "all",
      referenceDate: "2026-05-18",
    }).map((order) => order.id),
    ["past-unassigned", "today-unassigned", "future-unassigned", "past-assigned"],
  );
});

test("classifies combined delivery-date and route-assignment states", () => {
  const pastUnassignedOrder = {
    deliveryDate: "2026-05-14",
    planningStatus: "UNPLANNED",
  };
  const pastAssignedOrder = {
    deliveryDate: "2026-05-14",
    routeStatus: "ASSIGNED",
  };
  const completedPastOrder = {
    deliveryDate: "2026-05-14",
    status: "FULFILLED",
  };
  const futureUnassignedOrder = {
    deliveryDate: "2026-05-20",
    planningStatus: "UNPLANNED",
  };

  assert.equal(isOrderDeliveryDatePast(pastUnassignedOrder, "2026-05-18"), true);
  assert.equal(isOrderRouteAssigned(pastAssignedOrder), true);
  assert.equal(isOrderRoutePlanningLocked(pastUnassignedOrder, "2026-05-18"), true);
  assert.equal(isOrderDeliveryComplete(completedPastOrder), true);
  assert.equal(
    getOrderDeliveryExceptionState(pastUnassignedOrder, "2026-05-18"),
    "overdue_unassigned",
  );
  assert.equal(
    getOrderDeliveryExceptionState(pastAssignedOrder, "2026-05-18"),
    "overdue_assigned",
  );
  assert.equal(
    getOrderDeliveryExceptionState(completedPastOrder, "2026-05-18"),
    "none",
  );
  assert.equal(
    getOrderDeliveryExceptionState(futureUnassignedOrder, "2026-05-18"),
    "none",
  );
});

test("builds sorted filter options from current orders", () => {
  assert.deepEqual(getOrderFilterOptions(orders), {
    deliveryAreas: ["Mississauga", "Scarborough", "Thornhill"],
    deliveryDates: ["2026-05-14", "2026-05-15", "2026-05-16"],
    orderedDates: ["2026-05-08", "2026-05-09"],
  });
});

test("reads and updates Orders filter query parameters without dropping embedded app params", () => {
  const currentParams = new URLSearchParams(
    "id_token=session&deliveryArea=Thornhill&deliveryDate=2026-05-14&orderedDate=2026-05-08&planned=true&q=claire",
  );

  assert.deepEqual(getOrderFiltersFromSearchParams(currentParams), {
    deliveryArea: "Thornhill",
    deliveryDate: "2026-05-14",
    orderedDate: "2026-05-08",
    planned: "all",
  });

  assert.equal(
    getOrderFiltersFromSearchParams(new URLSearchParams("planned=true")).planned,
    "all",
  );

  assert.equal(hasActiveOrderFilters(getOrderFiltersFromSearchParams(currentParams)), true);

  const nextParams = updateOrderFilterSearchParams(currentParams, {
    deliveryArea: "",
    deliveryDate: "2026-05-15",
    orderedDate: "",
    planned: "false",
    search: "  Ryan  ",
  });

  assert.equal(nextParams.get("id_token"), "session");
  assert.equal(nextParams.has("deliveryArea"), false);
  assert.equal(nextParams.get("deliveryDate"), "2026-05-15");
  assert.equal(nextParams.has("orderedDate"), false);
  assert.equal(nextParams.get("planned"), "false");
  assert.equal(nextParams.has("q"), false);
});
