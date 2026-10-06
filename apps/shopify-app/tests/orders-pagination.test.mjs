import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrdersPageNumbers,
  getOrdersPageRange,
} from "../app/features/orders/orders-pagination.js";

test("Orders pagination reports the exact visible range when the server count is exact", () => {
  assert.deepEqual(
    getOrdersPageRange(
      { currentPage: 1 },
      { count: 1368, countPrecision: "exact" },
      50,
    ),
    { start: 1, end: 50, total: 1368 },
  );
  assert.deepEqual(
    getOrdersPageRange(
      { currentPage: 28 },
      { count: 1368, countPrecision: "exact" },
      18,
    ),
    { start: 1351, end: 1368, total: 1368 },
  );
});

test("Orders pagination omits ranges when the server count is not exact", () => {
  assert.equal(
    getOrdersPageRange(
      { currentPage: 2 },
      { count: 100, countPrecision: "estimated" },
      50,
    ),
    null,
  );
  assert.equal(getOrdersPageRange(null, null, 50), null);
  assert.deepEqual(
    getOrdersPageRange(
      { currentPage: 1 },
      { count: 0, countPrecision: "exact" },
      0,
    ),
    { start: 0, end: 0, total: 0 },
  );
});

test("Orders pagination keeps the first, current neighborhood, and last page visible", () => {
  assert.deepEqual(getOrdersPageNumbers(1, 11), [1, 2, 3, 4, "ellipsis-11", 11]);
  assert.deepEqual(getOrdersPageNumbers(6, 11), [1, "ellipsis-5", 5, 6, 7, "ellipsis-11", 11]);
  assert.deepEqual(getOrdersPageNumbers(10, 11), [1, "ellipsis-8", 8, 9, 10, 11]);
});

test("Orders pagination expands small page counts without ellipses", () => {
  assert.deepEqual(getOrdersPageNumbers(1, 1), [1]);
  assert.deepEqual(getOrdersPageNumbers(3, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(getOrdersPageNumbers(1, 6), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(getOrdersPageNumbers(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});
