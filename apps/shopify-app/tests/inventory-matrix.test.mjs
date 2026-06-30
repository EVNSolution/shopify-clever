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
  assert.deepEqual(matrix.products.map((product) => product.displayLabel), ["Kimchi", "Soup (Size: L)"]);
  assert.equal(matrix.rows[0].quantities[matrix.products[0].key], 5);
  assert.equal(matrix.rows[0].quantities[matrix.products[1].key], 5);
  assert.equal(matrix.totalQuantity, 10);
});

test("inventory matrix keeps source labels while selecting display language", () => {
  const matrix = buildInventoryProductMatrix([
    {
      deliveryDate: "2026-06-25",
      items: [
        { name: "Kimchi Stew / 김치찌개 500g", options: [], quantity: 1, sku: "SOUP-1" },
        { name: "만두 Dumplings", options: [{ key: "Size", value: "L" }], quantity: 2, sku: null },
        { name: "寿司 Sushi", options: [], quantity: 3, sku: "SUSHI-1" },
        { name: "소고기 사태수육 feat. 도가니", options: [], quantity: 4, sku: "BEEF-1" },
      ],
    },
  ]);

  assert.deepEqual(
    matrix.products.map((product) => product.label),
    ["Kimchi Stew / 김치찌개 500g", "만두 Dumplings (Size: L)", "寿司 Sushi", "소고기 사태수육 feat. 도가니"],
  );
  assert.deepEqual(
    matrix.products.map((product) => product.displayLabel),
    ["김치찌개 500g", "만두 (Size: L)", "Sushi", "소고기 사태수육 feat. 도가니"],
  );
  assert.equal(matrix.totalQuantity, 10);
});
