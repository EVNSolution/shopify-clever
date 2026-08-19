import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOrdersResourceRequest,
  completeOrdersPageRequest,
  getOrdersPageCacheKey,
  getReverseOrdersPageCacheEntry,
  isOrdersPageUpdating,
  mapCompactOrderPointsToRows,
  mergeLocatedOrderRows,
  shouldSyncOrdersLoaderPage,
  shouldApplyOrdersResourceResponse,
  updateOrdersSelectionExclusions,
  updateVisibleOrdersSelectionExclusions,
} from "../app/features/orders/orders-resource-state.js";

test("Orders pagination stays visibly busy until the matching response is applied", () => {
  assert.equal(
    isOrdersPageUpdating({
      enabled: true,
      pendingRequestKey: "page-12",
      fetcherState: "idle",
      appliedFilterKey: "deliveryState=FULFILLED",
      requestedFilterKey: "deliveryState=UNFULFILLED",
    }),
    true,
  );
  assert.equal(completeOrdersPageRequest("page-12", "page-11"), "page-12");
  assert.equal(completeOrdersPageRequest("page-12", "page-12"), null);
  assert.equal(
    isOrdersPageUpdating({
      enabled: true,
      filterTransitionPending: true,
      pendingRequestKey: null,
      fetcherState: "idle",
      appliedFilterKey: "deliveryState=FULFILLED",
      requestedFilterKey: "deliveryState=FULFILLED",
    }),
    true,
  );
  assert.equal(
    isOrdersPageUpdating({
      enabled: true,
      filterTransitionPending: false,
      pendingRequestKey: null,
      fetcherState: "idle",
      appliedFilterKey: "deliveryState=UNFULFILLED",
      requestedFilterKey: "deliveryState=UNFULFILLED",
    }),
    false,
  );
});

test("Orders pagination does not let a page-one loader revalidation replace page two", () => {
  assert.equal(
    shouldSyncOrdersLoaderPage(
      { currentPage: 2, totalPages: 12 },
      { currentPage: 1, totalPages: 12 },
    ),
    false,
  );
  assert.equal(
    shouldSyncOrdersLoaderPage(
      { currentPage: 2, totalPages: 12 },
      { currentPage: 2, totalPages: 12 },
    ),
    true,
  );
  assert.equal(shouldSyncOrdersLoaderPage({ currentPage: 2 }, null), false);
});

test("Orders map keeps planned rows as a fallback when compact points are incomplete", () => {
  const compactPoint = { id: "order-1", coordinates: [-79.4, 43.7], hasCoordinates: true };
  const plannedRow = { id: "order-2", coordinates: [-79.5, 43.8], hasCoordinates: true };

  assert.deepEqual(
    mergeLocatedOrderRows([compactPoint], [plannedRow, { id: "order-3", hasCoordinates: false }]),
    [compactPoint, plannedRow],
  );
});

test("Orders resource requests keep filters and session tokens out of URLs", () => {
  const request = buildOrdersResourceRequest(
    "page",
    new URLSearchParams({ deliveryArea: "North, East", search: "kim lee", before: "stale", page: "9" }),
    {
      idToken: "token",
      page: 2,
      readWatermark: "2026-08-04T00:00:00.000Z",
      requestKey: "page-2",
    },
  );
  assert.equal(request.action, "/app/orders/page");
  assert.equal(request.action.includes("?"), false);
  assert.deepEqual(request.payload, {
    _requestKey: "page-2",
    page: "2",
    readWatermark: "2026-08-04T00:00:00.000Z",
    filters: { deliveryArea: "North, East", search: "kim lee" },
    shopifySessionToken: "token",
  });
});

test("Orders optional route-group data uses the same token-safe resource transport", () => {
  const request = buildOrdersResourceRequest(
    "routeGroups",
    new URLSearchParams({ search: "ignored for route groups" }),
    { idToken: "token", requestKey: "route-groups-1" },
  );

  assert.equal(request.action, "/app/orders/route-groups");
  assert.equal(request.action.includes("?"), false);
  assert.deepEqual(request.payload, {
    _requestKey: "route-groups-1",
    filters: { search: "ignored for route groups" },
    shopifySessionToken: "token",
  });
});

test("Orders adjacent page cache binds filters, direction, and cursor without persistence", () => {
  const currentPage = { rows: [{ id: "order-1" }] };
  const targetPage = {
    pageInfo: { startCursor: "target-start", endCursor: "target-end" },
    rows: [{ id: "order-2" }],
  };

  assert.equal(
    getOrdersPageCacheKey("deliveryArea=North", "next", "cursor-1"),
    "deliveryArea=North\nnext\ncursor-1",
  );
  assert.equal(getOrdersPageCacheKey("filters", "invalid", "cursor"), null);
  assert.deepEqual(
    getReverseOrdersPageCacheEntry({
      currentPage,
      direction: "next",
      filterKey: "deliveryArea=North",
      targetPage,
    }),
    {
      key: "deliveryArea=North\nprevious\ntarget-start",
      value: currentPage,
    },
  );
});

test("Orders resource state rejects stale responses and maps compact PII-free points", () => {
  assert.equal(shouldApplyOrdersResourceResponse({ _requestKey: "old" }, "new"), false);
  assert.equal(shouldApplyOrdersResourceResponse({ _requestKey: "new" }, "new"), true);
  assert.deepEqual(mapCompactOrderPointsToRows([
    { orderId: "order-1", displayLabel: "#1001", coordinates: [127, 37.5], deliveryArea: "North" },
    { orderId: "order-2", coordinates: [null, 37.5] },
  ]), [{
    id: "order-1",
    orderId: "order-1",
    name: "#1001",
    coordinates: [127, 37.5],
    deliveryArea: "North",
    deliveryDate: undefined,
    planningStatus: undefined,
    hasCoordinates: true,
  }]);
});

test("Orders frozen selection exclusions survive pages and support deselect or reselect", () => {
  assert.deepEqual(
    updateOrdersSelectionExclusions([], "order-1", false),
    ["order-1"],
  );
  assert.deepEqual(
    updateOrdersSelectionExclusions(["order-1", "order-2"], "order-1", true),
    ["order-2"],
  );
  assert.deepEqual(
    updateVisibleOrdersSelectionExclusions(["order-9"], ["order-1", "order-2"], false),
    ["order-9", "order-1", "order-2"],
  );
  assert.deepEqual(
    updateVisibleOrdersSelectionExclusions(["order-1", "order-2", "order-9"], ["order-1", "order-2"], true),
    ["order-9"],
  );
});
