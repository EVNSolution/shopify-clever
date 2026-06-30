import assert from "node:assert/strict";
import test from "node:test";

import { buildInventoryProductMatrix, isRealInventorySku } from "../app/features/delivery/inventory-matrix.js";

test("inventory matrix groups by real SKU and falls back for product-id-like SKU", () => {
  const matrix = buildInventoryProductMatrix([
    {
      deliveryDate: "2026-06-25",
      items: [
        { name: "Kimchi", options: [], quantity: 2, sku: "KIMCHI-1" },
        { name: "Soup", options: [{ key: "Size", value: "L" }], quantity: 1, sku: "products/123" },
      ],
    },
    {
      deliveryDate: "2026-06-25",
      items: [
        { name: "Renamed Kimchi", options: [], quantity: 3, sku: "KIMCHI-1" },
        { name: "Soup", options: [{ key: "Size", value: "L" }], quantity: 4, sku: null },
      ],
    },
  ]);

  assert.equal(isRealInventorySku("products/:productid"), false);
  assert.equal(isRealInventorySku("KIMCHI-1"), true);
  assert.deepEqual(matrix.products.map((product) => product.label), ["Kimchi", "Soup (Size: L)"]);
  assert.equal(matrix.rows[0].quantities[matrix.products[0].key], 5);
  assert.equal(matrix.rows[0].quantities[matrix.products[1].key], 5);
  assert.equal(matrix.totalQuantity, 10);
});
