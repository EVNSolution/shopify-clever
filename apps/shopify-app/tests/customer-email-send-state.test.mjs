/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  getCustomerEmailSendReadiness,
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
    blockers: ["Select at least one eligible recipient."],
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
