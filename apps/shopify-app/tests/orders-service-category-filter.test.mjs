/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildOrdersResourceRequest,
  getOrdersPageCacheKey,
} from "../app/features/orders/orders-resource-state.js";
import { translate } from "../app/i18n/i18n.js";

const ordersPageSource = readFileSync(
  new URL("../app/features/orders/orders-page.jsx", import.meta.url),
  "utf8",
);

test("Orders keeps the Delivery and Pickup category control visible in the filter row", () => {
  assert.match(ordersPageSource, /aria-label=\{translate\(language, "orders\.filters\.serviceCategory\.aria"\)\}/);
  assert.match(ordersPageSource, /ORDER_SERVICE_CATEGORY_OPTIONS\.map\(\(option\) =>/);
  assert.match(ordersPageSource, /handleOrderFilterChange\("serviceCategory", option\.value\)/);
  assert.doesNotMatch(ordersPageSource, /ORDER_FILTER_TYPES[\s\S]*key: "serviceCategory"/);
  assert.equal(translate("en", "orders.filters.serviceCategory.delivery"), "Delivery");
  assert.equal(translate("en", "orders.filters.serviceCategory.pickup"), "Pickup");
  assert.equal(translate("ko", "orders.filters.serviceCategory.all"), "전체");
  assert.equal(translate("ko", "orders.filters.serviceCategory.delivery"), "배송");
  assert.equal(translate("ko", "orders.filters.serviceCategory.pickup"), "픽업");
});

test("Orders resource payloads retain serviceCategory without exposing it in the URL", () => {
  const request = buildOrdersResourceRequest(
    "page",
    new URLSearchParams({
      deliveryWeekday: "THURSDAY",
      serviceCategory: "DELIVERY",
    }),
    { idToken: "token", requestKey: "category-page" },
  );

  assert.equal(request.action, "/app/orders/page");
  assert.equal(request.action.includes("?"), false);
  assert.deepEqual(request.payload.filters, {
    deliveryWeekday: "THURSDAY",
    serviceCategory: "DELIVERY",
  });
});

test("clear filters resets the persistent category selection", () => {
  assert.match(ordersPageSource, /const handleClearOrderFilters = \(\) => \{[\s\S]*serviceCategory: ""/);
  assert.match(ordersPageSource, /updateOrderFiltersForChange\(orderFilters, filterKey, filterValue\)/);
});

test("category changes invalidate pagination identity and feed selection snapshots", () => {
  const deliveryKey = new URLSearchParams({ serviceCategory: "DELIVERY" }).toString();
  const pickupKey = new URLSearchParams({ serviceCategory: "PICKUP" }).toString();
  assert.notEqual(
    getOrdersPageCacheKey(deliveryKey, "next", "cursor"),
    getOrdersPageCacheKey(pickupKey, "next", "cursor"),
  );
  assert.match(
    ordersPageSource,
    /const resourceFilterKey = resourceFilterSearchParams\.toString\(\)[\s\S]*?ordersPageCacheRef\.current\.clear\(\)[\s\S]*?\}, \[resourceFilterKey\]\)/,
  );
  assert.match(
    ordersPageSource,
    /formData\.set\("filters", JSON\.stringify\(Object\.fromEntries\(resourceFilterSearchParams\)\)\)/,
  );
});
