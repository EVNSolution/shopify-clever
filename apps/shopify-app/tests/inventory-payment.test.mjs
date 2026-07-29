import assert from "node:assert/strict";
import test from "node:test";

import {
  formatInventoryPaymentMethod,
  formatInventoryPaymentStatus,
} from "../app/features/orders/inventory-payment.js";

test("Inventory keeps Shopify payment method separate from payment status", () => {
  const pendingETransfer = {
    financialStatus: "PENDING",
    paymentGatewayNames: ["eTransfer"],
  };
  const paidCash = {
    paymentStatus: "PAID",
    paymentGatewayNames: ["현금 Cash"],
  };

  assert.equal(formatInventoryPaymentMethod(pendingETransfer), "e-Transfer");
  assert.equal(formatInventoryPaymentStatus(pendingETransfer), "Awaiting payment");
  assert.equal(formatInventoryPaymentMethod(paidCash), "Cash");
  assert.equal(formatInventoryPaymentStatus(paidCash), "Paid");
});

test("Inventory preserves mixed Shopify payment methods without bullet separators", () => {
  const order = {
    paymentGatewayNames: ["shopify_payments", "eTransfer"],
  };

  assert.equal(
    formatInventoryPaymentMethod(order),
    "Shopify Payments / e-Transfer",
  );
});

test("Inventory recognizes Shopify Email Money Transfer gateways", () => {
  assert.equal(
    formatInventoryPaymentMethod({
      paymentGatewayNames: ["Email Money Transfer"],
    }),
    "e-Transfer",
  );
});

test("Inventory never presents Pending as the customer-facing payment label", () => {
  assert.equal(
    formatInventoryPaymentStatus({ paymentStatus: "PENDING" }),
    "Awaiting payment",
  );
  assert.equal(
    formatInventoryPaymentStatus({ paymentStatus: "PARTIALLY_REFUNDED" }),
    "Partially refunded",
  );
});
