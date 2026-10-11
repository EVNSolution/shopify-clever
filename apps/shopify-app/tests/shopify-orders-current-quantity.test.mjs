/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  SHOPIFY_ORDER_LINE_ITEMS_QUERY,
  SHOPIFY_ORDERS_BY_IDS_QUERY,
  SHOPIFY_ORDERS_BY_IDS_QUERY_WITHOUT_CUSTOMER_NOTE,
  SHOPIFY_ORDERS_QUERY,
  toCurrentLineItems,
} from "../app/features/orders/shopify-orders.server.js";

test("every Shopify order query asks for the current line item quantity", () => {
  for (const query of [
    SHOPIFY_ORDERS_QUERY,
    SHOPIFY_ORDERS_BY_IDS_QUERY,
    SHOPIFY_ORDERS_BY_IDS_QUERY_WITHOUT_CUSTOMER_NOTE,
    SHOPIFY_ORDER_LINE_ITEMS_QUERY,
  ]) {
    assert.match(query, /quantity\s+currentQuantity\s+sku/);
  }
});

test("line items count what is left after refunds and order edits", () => {
  // Order #2373 on 2026-10-07: one unit refunded with restock; Shopify keeps quantity 1 and sets currentQuantity 0.
  const nodes = toCurrentLineItems([
    { name: "소고기 사태수육", quantity: 1, currentQuantity: 1, sku: "A" },
    { name: "꼼장어구이", quantity: 1, currentQuantity: 0, sku: "B" },
    { name: "포기김치", quantity: 5, currentQuantity: 3, sku: "C" },
    { name: "legacy without the field", quantity: 2, sku: "D" },
    { name: "unreadable field", quantity: 4, currentQuantity: "n/a", sku: "E" },
  ]);

  assert.deepEqual(nodes.map((item) => [item.sku, item.quantity]), [["A", 1], ["C", 3], ["D", 2], ["E", 4]]);
  assert.equal(nodes.reduce((sum, item) => sum + item.quantity, 0), 10);
  assert.deepEqual(toCurrentLineItems(undefined), []);
});
