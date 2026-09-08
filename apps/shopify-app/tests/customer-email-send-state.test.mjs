/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  getCustomerEmailDefaultSignal,
  getCustomerEmailPreviewEmptyState,
  summarizeCustomerEmailSendResult,
  getCustomerEmailSendReadiness,
  hasCustomerEmailPreviewConflict,
} from "../app/features/customer-notifications/customer-email-send-state.js";

const readyInput = {
  confirmed: true,
  hasMissingValues: false,
  hasPriorSends: false,
  missingValuesConfirmed: false,
  previewReady: true,
  resendConfirmed: false,
  selectionCount: 1,
};

test("customer email defaults the message to the route execution state", () => {
  assert.equal(getCustomerEmailDefaultSignal("READY"), "DELIVERY_SCHEDULED");
  assert.equal(getCustomerEmailDefaultSignal("IN_PROGRESS"), "OUT_FOR_DELIVERY");
  assert.equal(getCustomerEmailDefaultSignal("COMPLETED"), "DELIVERED");
  assert.equal(getCustomerEmailDefaultSignal(undefined), "DELIVERY_SCHEDULED");
});

test("customer email empty preview distinguishes status mismatch from skipped recipients", () => {
  assert.deepEqual(getCustomerEmailPreviewEmptyState({
    preview: {
      counts: { eligible: 0, skipped: 0, totalStops: 6 },
      recipients: [],
      skipped: [],
    },
    routeExecutionStatus: "COMPLETED",
    signal: "DELIVERY_SCHEDULED",
  }), {
    detail: "Completed routes usually use Delivered. Change the message and preview again.",
    title: "No stops match Delivery scheduled",
  });

  assert.deepEqual(getCustomerEmailPreviewEmptyState({
    preview: {
      counts: { eligible: 6, skipped: 6, statusExcluded: 0, totalStops: 6 },
      recipients: [],
      skipped: Array.from({ length: 6 }, () => ({ code: "CUSTOMER_EMAIL_MISSING" })),
    },
    routeExecutionStatus: "COMPLETED",
    signal: "DELIVERED",
  }), {
    detail: "6 matching stops were skipped. Review the recipient reasons.",
    title: "No sendable recipients",
  });

  assert.deepEqual(getCustomerEmailPreviewEmptyState({
    preview: {
      counts: { eligible: 0, skipped: 0, statusExcluded: 6, totalStops: 6 },
      exclusions: [{
        code: "ROUTE_ALREADY_COMPLETED",
        count: 6,
        message: "The route is already completed, so this notification cannot be sent.",
        status: "DELIVERED",
      }],
      recipients: [],
      skipped: [],
    },
    routeExecutionStatus: "COMPLETED",
    signal: "DELIVERY_SCHEDULED",
  }), {
    detail: "The route is already completed, so this notification cannot be sent.",
    title: "No sendable recipients",
  });

  assert.equal(getCustomerEmailPreviewEmptyState({
    preview: { recipients: [{ deliveryStopId: "stop-1", email: "customer@example.test" }] },
    routeExecutionStatus: "COMPLETED",
    signal: "DELIVERED",
  }), null);
});

test("customer email send state explains the preview and recipient selection gates", () => {
  assert.deepEqual(getCustomerEmailSendReadiness({
    ...readyInput,
    confirmed: false,
    previewReady: false,
    selectionCount: 0,
  }), {
    blockers: ["Preview recipients before sending."],
    ready: false,
  });

  assert.deepEqual(getCustomerEmailSendReadiness({
    ...readyInput,
    confirmed: false,
    selectionCount: 0,
  }), {
    blockers: ["Select at least one sendable recipient."],
    ready: false,
  });
});

test("customer email send state requires each applicable confirmation", () => {
  assert.deepEqual(getCustomerEmailSendReadiness({
    ...readyInput,
    confirmed: false,
    hasMissingValues: true,
    hasPriorSends: true,
  }), {
    blockers: [
      "Confirm this manual send.",
      "Confirm recipients with missing template values.",
      "Confirm recipients with prior send history.",
    ],
    ready: false,
  });
});

test("customer email send state becomes ready only after every gate passes", () => {
  assert.deepEqual(getCustomerEmailSendReadiness({
    ...readyInput,
    hasMissingValues: true,
    hasPriorSends: true,
    missingValuesConfirmed: true,
    resendConfirmed: true,
  }), {
    blockers: [],
    ready: true,
  });
});

test("customer email preview conflict recognizes normalized server error codes", () => {
  assert.equal(hasCustomerEmailPreviewConflict([{ code: "CUSTOMER_EMAIL_PREVIEW_CONFLICT" }]), true);
  assert.equal(hasCustomerEmailPreviewConflict([{ errorCode: "CUSTOMER_EMAIL_PREVIEW_CONFLICT" }]), true);
  assert.equal(hasCustomerEmailPreviewConflict([{ code: "CUSTOMER_EMAIL_BAD_REQUEST" }]), false);
  assert.equal(hasCustomerEmailPreviewConflict(null), false);
});

test("customer email dispatch summary distinguishes duplicate requests from new sends", () => {
  assert.deepEqual(summarizeCustomerEmailSendResult({
    counts: { duplicate: 1, failed: 0, sent: 0, skipped: 0 },
    duplicate: true,
    results: [{
      deliveryStopId: "stop-1",
      email: "customer@example.test",
      orderId: "order-1",
      status: "DUPLICATE",
    }],
  }), {
    counts: { accepted: 0, duplicate: 1, failed: 0, skipped: 0, unknown: 0 },
    details: [],
    duplicateRequest: true,
    originalOutcomeAvailable: false,
  });
});

test("customer email dispatch summary preserves mixed outcomes and their reasons", () => {
  assert.deepEqual(summarizeCustomerEmailSendResult({
    counts: { duplicate: 0, failed: 1, sent: 1, skipped: 1 },
    duplicate: false,
    results: [
      { deliveryStopId: "stop-1", orderId: "order-1", status: "SENT" },
      { deliveryStopId: "stop-2", errorCode: "PROVIDER_REJECTED", errorMessage: "Mailbox rejected", orderId: "order-2", status: "FAILED" },
      { deliveryStopId: "stop-3", errorCode: "CUSTOMER_EMAIL_MISSING", orderId: "order-3", status: "SKIPPED" },
      { deliveryStopId: "stop-4", orderId: "order-4", status: "PENDING" },
    ],
  }), {
    counts: { accepted: 1, duplicate: 0, failed: 1, skipped: 1, unknown: 1 },
    details: [
      { label: "order-2 - FAILED", reason: "Mailbox rejected" },
      { label: "order-3 - SKIPPED", reason: "CUSTOMER_EMAIL_MISSING" },
      { label: "order-4 - UNKNOWN", reason: "Outcome unavailable" },
    ],
    duplicateRequest: false,
    originalOutcomeAvailable: true,
  });
});
