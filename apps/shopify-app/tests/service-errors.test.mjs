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


test("service error collector normalizes GraphQL and caught service errors", () => {
  assert.deepEqual(
    normalizeGraphqlErrors([{ message: "GraphQL failed" }]),
    [{ message: "GraphQL failed" }],
  );
  assert.deepEqual(
    normalizeCaughtServiceError({ body: { errors: { graphQLErrors: [{ message: "Nested failure" }] } } }, "Fallback"),
    [{ message: "Nested failure" }],
  );
  assert.equal(getServiceErrorMessage(null, "Fallback"), "Fallback");
});
