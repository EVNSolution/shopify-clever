import assert from "node:assert/strict";
import test from "node:test";
import { getOrdersPageNumbers } from "../app/features/orders/orders-pagination.js";

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
