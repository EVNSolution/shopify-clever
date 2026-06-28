import test from "node:test";
import assert from "node:assert/strict";
import {
  filterOrders,
  formatServiceTypeLabel,
  getBulkOrderSelectionState,
  getOrderDeliveryExceptionState,
  getOrderFilterOptions,
  getOrderFiltersFromSearchParams,
  getOrderTabState,
  getOrderUnavailableReasons,
  hasActiveOrderFilters,
  isOrderDeliveryComplete,
  isOrderDeliveryDatePast,
  isOrderRouteAssigned,
  isOrderRouteCreated,
  isOrderRoutePlanningLocked,
  isOrderSelectableForCurrentWorkset,
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
    hasCoordinates: true,
    orderedDate: "2026-05-08",
    planningStatus: "UNPLANNED",
    routeScopeKey: "2026-05-14|DAY",
  },
  {
    id: "order-2",
    name: "#1124",
    customer: "Ryan Jung",
    address: "300 Borough Dr, Scarborough, ON",
    deliveryArea: "Scarborough",
    deliveryDate: "2026-05-15",
    deliveryLabel: "Fri 05/15",
    hasCoordinates: true,
    orderedDate: "2026-05-09",
    planningStatus: "PLANNED",
    routeScopeKey: "2026-05-15|DAY",
  },
  {
    id: "order-3",
    name: "#1131",
    customer: "Noah Yoon",
    address: "300 City Centre Dr, Mississauga, ON",
    deliveryArea: "Mississauga",
    deliveryDate: "2026-05-16",
    deliveryLabel: "Sat 05/16",
    hasCoordinates: true,
    orderedDate: "2026-05-09",
    planningStatus: "UNPLANNED",
    routeScopeKey: "2026-05-16|DAY",
  },
];

test("filters orders by delivery area, delivery date, and ordered date", () => {
  assert.deepEqual(
    filterOrders(orders, {
      deliveryArea: "Scarborough",
      deliveryDate: "2026-05-15",
      orderedDate: "2026-05-09",
      scope: "history",
    }).map((order) => order.id),
    ["order-2"],
  );

  assert.deepEqual(
    filterOrders(orders, {
      deliveryArea: "Scarborough",
      deliveryDate: "2026-05-16",
      orderedDate: "2026-05-09",
      scope: "history",
    }),
    [],
  );
});

test("filters orders by ordered date range", () => {
  assert.deepEqual(
    filterOrders(orders, {
      orderedDateFrom: "2026-05-08",
      orderedDateTo: "2026-05-09",
      scope: "history",
    }).map((order) => order.id),
    ["order-1", "order-2", "order-3"],
  );

  assert.deepEqual(
    filterOrders(orders, {
      orderedDateFrom: "2026-05-09",
      orderedDateTo: "2026-05-09",
      scope: "history",
    }).map((order) => order.id),
    ["order-2", "order-3"],
  );
});

test("filters orders by delivery weekday", () => {
  assert.deepEqual(
    filterOrders(orders, {
      deliveryWeekday: "FRIDAY",
      scope: "history",
    }).map((order) => order.id),
    ["order-2"],
  );
});

test("filters orders by delivery state", () => {
  assert.deepEqual(
    filterOrders(orders, {
      deliveryState: "planned",
      referenceDate: "2026-05-14",
      scope: "history",
    }).map((order) => order.id),
    ["order-2"],
  );

  assert.deepEqual(
    filterOrders(orders, {
      deliveryState: "unplanned",
      referenceDate: "2026-05-14",
      scope: "history",
    }).map((order) => order.id),
    ["order-1", "order-3"],
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
      { deliveryDate: "2026-05-18", scope: "history" },
    ).map((order) => order.id),
    ["date-only", "date-time"],
  );
});

test("parses and applies search while removing legacy q query parameters", () => {
  assert.deepEqual(
    filterOrders(orders, { scope: "history", search: "city centre" }).map((order) => order.id),
    ["order-3"],
  );

  assert.deepEqual(getOrderFiltersFromSearchParams(new URLSearchParams("q=claire")), {
    deliveryArea: "",
    deliveryDate: "",
    deliveryState: "",
    deliveryWeekday: "",
    orderedDate: "",
    orderedDateFrom: "",
    orderedDateTo: "",
    planned: "",
    scope: "planning",
    search: "claire",
    serviceType: "",
    tab: "unplanned",
  });
});

test("defaults the query-backed Orders view to Unplanned planning scope while All is planning-only", () => {
  const defaultFilters = getOrderFiltersFromSearchParams(new URLSearchParams("id_token=session"));

  assert.deepEqual(defaultFilters, {
    deliveryArea: "",
    deliveryDate: "",
    deliveryState: "",
    deliveryWeekday: "",
    orderedDate: "",
    orderedDateFrom: "",
    orderedDateTo: "",
    planned: "",
    scope: "planning",
    search: "",
    serviceType: "",
    tab: "unplanned",
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
      tab: "unplanned",
      referenceDate: "2026-05-14",
    }).map((order) => order.id),
    ["order-1", "order-3"],
  );

  assert.deepEqual(
    filterOrders(orders, {
      tab: "all",
      referenceDate: "2026-05-14",
    }).map((order) => order.id),
    ["order-1", "order-2", "order-3"],
  );

  assert.deepEqual(
    filterOrders(orders, {
      planned: "true",
      referenceDate: "2026-05-14",
    }).map((order) => order.id),
    ["order-1", "order-2", "order-3"],
  );

  assert.equal(isOrderRouteCreated(orders[1]), true);
  assert.equal(isOrderRouteCreated(orders[0]), false);
});

test("treats published-route orders as planned-stage orders", () => {
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
      routeStatus: "PUBLISHED",
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
      tab: "unplanned",
      referenceDate: "2026-05-14",
    }).map((order) => order.id),
    ["order-1", "order-3"],
  );

  assert.deepEqual(
    filterOrders(stagedOrders, {
      tab: "all",
      referenceDate: "2026-05-14",
    }).map((order) => order.id),
    ["order-1", "order-2", "order-3", "order-4", "order-5"],
  );
});

test("defaults Orders to current unplanned delivery dates and hides past due orders", () => {
  const datedOrders = [
    {
      id: "past-unassigned",
      deliveryDate: "2026-05-14",
      hasCoordinates: true,
      planningStatus: "UNPLANNED",
      routeScopeKey: "past",
    },
    {
      id: "today-unassigned",
      deliveryDate: "2026-05-18",
      hasCoordinates: true,
      planningStatus: "UNPLANNED",
      routeScopeKey: "today",
    },
    {
      id: "future-unassigned",
      deliveryDate: "2026-05-19",
      hasCoordinates: true,
      planningStatus: "UNPLANNED",
      routeScopeKey: "future",
    },
    {
      id: "past-assigned",
      deliveryDate: "2026-05-14",
      hasCoordinates: true,
      routeStatus: "PUBLISHED",
      routeScopeKey: "past",
    },
  ];

  assert.deepEqual(
    filterOrders(datedOrders, {
      tab: "unplanned",
      referenceDate: "2026-05-18",
    }).map((order) => order.id),
    ["today-unassigned", "future-unassigned"],
  );

  assert.deepEqual(
    filterOrders(datedOrders, {
      tab: "all",
      referenceDate: "2026-05-18",
    }).map((order) => order.id),
    ["today-unassigned", "future-unassigned"],
  );

  assert.deepEqual(
    filterOrders(datedOrders, {
      scope: "history",
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
    routeStatus: "PUBLISHED",
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
    deliveryStates: ["assigned_overdue", "past_due"],
    deliveryWeekdays: ["THURSDAY", "FRIDAY", "SATURDAY"],
    orderedDates: ["2026-05-08", "2026-05-09"],
    serviceTypes: [],
  });
});

test("reads and updates Orders filter query parameters without dropping embedded app params", () => {
  const currentParams = new URLSearchParams(
    "id_token=session&deliveryArea=Thornhill&deliveryDate=2026-05-14&deliveryWeekday=THURSDAY&orderedDate=2026-05-08&planned=true&q=claire",
  );

  assert.deepEqual(getOrderFiltersFromSearchParams(currentParams), {
    deliveryArea: "Thornhill",
    deliveryDate: "2026-05-14",
    deliveryState: "",
    deliveryWeekday: "THURSDAY",
    orderedDate: "",
    orderedDateFrom: "2026-05-08",
    orderedDateTo: "2026-05-08",
    planned: "",
    scope: "planning",
    search: "claire",
    serviceType: "",
    tab: "all",
  });

  assert.equal(
    getOrderFiltersFromSearchParams(new URLSearchParams("planned=true")).tab,
    "all",
  );

  assert.equal(hasActiveOrderFilters(getOrderFiltersFromSearchParams(currentParams)), true);

  const nextParams = updateOrderFilterSearchParams(currentParams, {
    deliveryArea: "",
    deliveryDate: "2026-05-15",
    deliveryState: "planned",
    deliveryWeekday: "FRIDAY",
    orderedDate: "",
    orderedDateFrom: "2026-05-08",
    orderedDateTo: "2026-05-09",
    scope: "planning",
    search: "  Ryan  ",
    serviceType: "DELIVERY",
    tab: "unplanned",
  });

  assert.equal(nextParams.get("id_token"), "session");
  assert.equal(nextParams.has("deliveryArea"), false);
  assert.equal(nextParams.get("deliveryDate"), "2026-05-15");
  assert.equal(nextParams.get("deliveryState"), "planned");
  assert.equal(nextParams.get("deliveryWeekday"), "FRIDAY");
  assert.equal(nextParams.has("orderedDate"), false);
  assert.equal(nextParams.get("orderedDateFrom"), "2026-05-08");
  assert.equal(nextParams.get("orderedDateTo"), "2026-05-09");
  assert.equal(nextParams.has("planned"), false);
  assert.equal(nextParams.get("scope"), "planning");
  assert.equal(nextParams.get("search"), "Ryan");
  assert.equal(nextParams.get("serviceType"), "DELIVERY");
  assert.equal(nextParams.get("tab"), "unplanned");
  assert.equal(nextParams.has("q"), false);
});

test("filters by service type and exposes stable service labels", () => {
  const serviceOrders = [
    { id: "day", deliveryDate: "2026-05-18", serviceType: "DELIVERY" },
    { id: "evening", deliveryDate: "2026-05-18", serviceType: "EVENING_DELIVERY" },
    { id: "pickup", deliveryDate: "2026-05-18", serviceType: "PICKUP" },
  ];

  assert.deepEqual(
    filterOrders(serviceOrders, {
      referenceDate: "2026-05-18",
      serviceType: "DELIVERY",
      tab: "all",
    }).map((order) => order.id),
    ["day", "evening"],
  );

  assert.deepEqual(
    filterOrders(serviceOrders, {
      referenceDate: "2026-05-18",
      serviceType: "PICKUP",
      tab: "all",
    }).map((order) => order.id),
    ["pickup"],
  );
  assert.equal(formatServiceTypeLabel("DELIVERY"), "Delivery");
  assert.equal(formatServiceTypeLabel("EVENING_DELIVERY"), "Evening Delivery");
  assert.equal(formatServiceTypeLabel("PICKUP"), "Pickup");
  assert.deepEqual(getOrderFilterOptions(serviceOrders).serviceTypes, [
    "DELIVERY",
    "EVENING_DELIVERY",
    "PICKUP",
  ]);
});

test("classifies planning tabs and route-selection unavailable reasons", () => {
  const readyOrder = {
    id: "ready",
    deliveryDate: "2026-05-18",
    hasCoordinates: true,
    readiness: "READY_TO_PLAN",
    routeScopeKey: "2026-05-18|EVENING",
  };
  const reviewOrder = {
    id: "review",
    deliveryDate: "2026-05-18",
    hasCoordinates: false,
    readiness: "NEEDS_REVIEW",
    reviewReasons: ["missing_coordinates"],
  };
  const plannedOrder = {
    id: "planned",
    deliveryDate: "2026-05-18",
    hasCoordinates: true,
    routePlanId: "route-1",
    routeScopeKey: "2026-05-18|EVENING",
  };

  assert.equal(getOrderTabState(readyOrder, "2026-05-18"), "unplanned");
  assert.equal(getOrderTabState(reviewOrder, "2026-05-18"), "needs_review");
  assert.equal(getOrderTabState(plannedOrder, "2026-05-18"), "planned");

  assert.deepEqual(
    filterOrders([readyOrder, reviewOrder, plannedOrder], {
      referenceDate: "2026-05-18",
      tab: "needs_review",
    }).map((order) => order.id),
    ["review"],
  );

  assert.equal(
    isOrderSelectableForCurrentWorkset(readyOrder, {
      referenceDate: "2026-05-18",
      scope: "planning",
    }),
    true,
  );
  assert.deepEqual(
    getOrderUnavailableReasons(reviewOrder, {
      referenceDate: "2026-05-18",
      scope: "planning",
    }).sort(),
    ["missing_coordinates", "missing_route_scope", "needs_review"].sort(),
  );
  assert.deepEqual(
    getOrderUnavailableReasons(readyOrder, {
      referenceDate: "2026-05-18",
      scope: "history",
    }),
    ["history_read_only"],
  );
});

test("bulk selection reports selected ids and unavailable reason counts", () => {
  const mixedOrders = [
    {
      id: "ready",
      deliveryDate: "2026-05-18",
      hasCoordinates: true,
      routeScopeKey: "scope-a",
    },
    {
      id: "missing-date",
      hasCoordinates: true,
      routeScopeKey: "scope-a",
    },
    {
      id: "wrong-scope",
      deliveryDate: "2026-05-18",
      hasCoordinates: true,
      routeScopeKey: "scope-b",
    },
  ];
  const state = getBulkOrderSelectionState(mixedOrders, {
    referenceDate: "2026-05-18",
    routeScopeKey: "scope-a",
    scope: "planning",
  });

  assert.deepEqual(state.selectedOrderIds, ["ready"]);
  assert.equal(state.unavailableCount, 2);
  assert.equal(state.unavailableReasonCounts.missing_delivery_date, 1);
  assert.equal(state.unavailableReasonCounts.route_scope_mismatch, 1);
});
