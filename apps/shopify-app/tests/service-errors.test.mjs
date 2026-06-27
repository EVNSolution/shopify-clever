import assert from "node:assert/strict";
import test from "node:test";

import {
  SERVICE_ERROR_CODES,
  SERVICE_ERROR_NOTICES,
  collectServiceErrors,
  getServiceErrorMessage,
  getServiceErrorNotice,
  normalizeCaughtServiceError,
  normalizeGraphqlErrors,
} from "../app/features/service-errors.js";

test("service error collector collects payload errors in one place", () => {
  const errors = collectServiceErrors([
    { errors: [{ code: "SHOPIFY", message: "Shopify failed" }] },
    { errors: [{ code: "IGNORED", message: "No session yet" }] },
    { errors: [{ code: "DELIVERY", message: "Delivery failed" }] },
  ], { ignoredCodes: ["IGNORED"] });

  assert.deepEqual(errors.map((error) => error.message), [
    "Shopify failed",
    "Delivery failed",
  ]);
});

test("service error collector also accepts direct error arrays", () => {
  const errors = collectServiceErrors([
    { code: "ACTION", message: "Route create failed" },
  ]);

  assert.deepEqual(errors.map((error) => error.message), ["Route create failed"]);
});

test("order error notice gives protected-order guidance before generic errors", () => {
  assert.equal(
    getServiceErrorNotice([
      { errors: [{ message: "Generic failure" }] },
      { errors: [{ code: SERVICE_ERROR_CODES.PROTECTED_ORDER_ACCESS, message: "Protected access" }] },
    ]),
    SERVICE_ERROR_NOTICES.PROTECTED_ORDER_ACCESS,
  );
});

test("route grouping delete blocked notice gives route group delete guidance", () => {
  assert.equal(
    getServiceErrorNotice([
      { errors: [{ code: SERVICE_ERROR_CODES.ROUTE_GROUPING_DELETE_BLOCKED, message: "child route status no longer allows delete" }] },
    ]),
    SERVICE_ERROR_NOTICES.ROUTE_GROUPING_DELETE_BLOCKED,
  );
});

test("service error notice logs internal diagnostics without changing user copy", () => {
  const logs = [];
  const notice = getServiceErrorNotice([
    {
      errors: [{
        code: "DELIVERY_API_ERROR",
        message: "Delivery orders API 호출에 실패했습니다.",
        path: "/admin/orders",
        status: 404,
      }],
    },
  ], {
    context: "orders_page:test",
    logger: { warn: (...args) => logs.push(args) },
  });

  assert.equal(notice, "Delivery orders API 호출에 실패했습니다.");
  assert.deepEqual(logs, [[
    "clever_service_errors",
    {
      context: "orders_page:test",
      errors: [{
        code: "DELIVERY_API_ERROR",
        message: "Delivery orders API 호출에 실패했습니다.",
        path: "/admin/orders",
        status: 404,
      }],
    },
  ]]);
});


test("service error collector normalizes GraphQL and caught service errors", () => {
  assert.deepEqual(
    normalizeGraphqlErrors([{ extensions: { code: "GRAPHQL" }, message: "GraphQL failed", path: ["shop", "orders"] }]),
    [{ code: "GRAPHQL", message: "GraphQL failed", path: "shop.orders" }],
  );
  assert.deepEqual(
    normalizeCaughtServiceError({ body: { errors: { graphQLErrors: [{ message: "Nested failure" }] } } }, "Fallback"),
    [{ code: undefined, message: "Nested failure", status: undefined }],
  );
  assert.equal(getServiceErrorMessage(null, "Fallback"), "Fallback");
});
