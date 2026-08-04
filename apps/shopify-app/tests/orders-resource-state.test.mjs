import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOrdersResourceRequest,
  getOrdersPageCacheKey,
  getReverseOrdersPageCacheEntry,
  mapCompactOrderPointsToRows,
  shouldApplyOrdersResourceResponse,
  updateOrdersSelectionExclusions,
  updateVisibleOrdersSelectionExclusions,
} from "../app/features/orders/orders-resource-state.js";

test("Orders resource requests keep filters and session tokens out of URLs", () => {
  const request = buildOrdersResourceRequest(
    "page",
    new URLSearchParams({ deliveryArea: "North, East", search: "kim lee", before: "stale" }),
    { after: "next", idToken: "token", requestKey: "page-2" },
  );
  assert.equal(request.action, "/app/orders/page");
  assert.equal(request.action.includes("?"), false);
  assert.deepEqual(request.payload, {
    _requestKey: "page-2",
    after: "next",
    filters: { deliveryArea: "North, East", search: "kim lee" },
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
