import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getOrdersLoaderDeliveryErrors } from "../app/features/orders/orders-loader-auth.js";

const ordersPageServerSource = readFileSync(
  new URL("../app/features/orders/orders-page.server.js", import.meta.url),
  "utf8",
);

test("Orders deferred loader preserves Delivery 401 as a session-recovery sentinel", () => {
  const errors = getOrdersLoaderDeliveryErrors(
    new Response("Shopify session expired", {
      headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" },
      status: 401,
    }),
    "fallback",
  );

  assert.deepEqual(errors, [{
    code: "UNAUTHORIZED",
    message: "Invalid Shopify session token",
    status: 401,
  }]);
});

test("Orders deferred loader keeps non-auth Delivery failures generic", () => {
  const errors = getOrdersLoaderDeliveryErrors(new Error("secret upstream body"), "Orders unavailable");

  assert.deepEqual(errors, [{
    code: "DELIVERY_API_ERROR",
    message: "Orders unavailable",
  }]);
});

test("Orders and Inventory deferred loader branches preserve authentication failures", () => {
  assert.match(
    ordersPageServerSource,
    /serverOrdersRequestPromise\.then\([\s\S]*?\(error\) => \(\{[\s\S]*?getOrdersLoaderDeliveryErrors\(\s*error,/u,
  );
  assert.match(
    ordersPageServerSource,
    /fetchDeliveryInventories\([\s\S]*?\.then\([\s\S]*?\(error\) => \(\{[\s\S]*?getOrdersLoaderDeliveryErrors\(error,/u,
  );
});
