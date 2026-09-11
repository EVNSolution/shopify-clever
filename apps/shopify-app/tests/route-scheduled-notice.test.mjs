/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const source = readFileSync(join(root, "app/routes/app.routes.$routeId.jsx"), "utf8");

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function evaluateFunction(name, nextMarker) {
  return Function(`return (${between(`function ${name}`, nextMarker).trim()});`)();
}

function evaluateArrow(name, bindings) {
  const declaration = `${between(`  const ${name} =`, "\n  };").trim()}\n  };`;
  return Function(...Object.keys(bindings), `${declaration}\nreturn ${name};`)(...Object.values(bindings));
}

const createDialogState = evaluateFunction(
  "createCustomerEmailDialogOpenState",
  "\n\nexport default function RouteDetailPage",
);

function runSaveEffect({ errors = [], outcomeUnknown = false, next = null, deleted = false } = {}) {
  const calls = [];
  const bindings = {
    lastRouteActionIntentRef: { current: "saveRouteDraft" },
    navigateAfterRouteDraftSaveRef: { current: next },
    splitSaveExpectationRef: { current: null },
    ordinaryMutationPendingRef: { current: true },
    routeActionFetcher: { state: "idle", data: { errors, outcomeUnknown } },
    deletedRoutePlanIds: deleted ? ["route-1"] : [],
    effectiveRoutePlan: { id: "route-1" },
    routeGroupId: "group-1",
    resetRouteDraftChanges: () => calls.push(["reset"]),
    revalidator: { revalidate: () => calls.push(["revalidate"]) },
    setPendingRouteDraftHref: (value) => calls.push(["pending", value]),
    setOrdinaryMutationPending: () => {},
    setOrdinaryMutationUncertain: (value) => calls.push(["uncertain", value]),
    navigateWithEmbeddedContext: (...args) => calls.push(["navigate", ...args]),
    routeGroupPath: (id) => "/app/routes/groups/" + id,
  };
  const effect = between(
    '    if (lastRouteActionIntentRef.current !== "saveRouteDraft") return;',
    "  }, [deletedRoutePlanIds, effectiveRoutePlan?.id, navigateWithEmbeddedContext, resetRouteDraftChanges",
  );
  const run = Function(...Object.keys(bindings), effect);
  run(...Object.values(bindings));
  run(...Object.values(bindings));
  return calls;
}

test("successful save resets the draft once without opening an email prompt", () => {
  assert.deepEqual(runSaveEffect(), [["reset"], ["revalidate"], ["pending", null]]);
});

test("save navigation keeps the destination without injecting scheduled-notice state", () => {
  assert.deepEqual(runSaveEffect({ next: "/app/routes" }), [
    ["reset"], ["revalidate"], ["pending", null], ["navigate", "/app/routes"],
  ]);
  assert.deepEqual(runSaveEffect({ deleted: true }), [
    ["reset"], ["revalidate"], ["pending", null], ["navigate", "/app/routes/groups/group-1"],
  ]);
});

test("failed and uncertain saves preserve the editable draft", () => {
  assert.deepEqual(runSaveEffect({ errors: [{ message: "Save failed" }] }), []);
  assert.deepEqual(runSaveEffect({ errors: [{ message: "Connection lost" }], outcomeUnknown: true }), [["uncertain", true]]);
});

test("explicit Send email click resets consent and opens without submitting", () => {
  const applied = [];
  const opened = [];
  const signals = [];
  let submissions = 0;
  const handler = evaluateArrow("openCustomerEmailDialog", {
    getCustomerEmailDefaultSignal: () => "DELIVERY_SCHEDULED",
    routeExecutionStatus: "READY",
    applyCustomerEmailDialogOpenState: (state) => applied.push(state),
    createCustomerEmailDialogOpenState: createDialogState,
    customerEmailFetcher: { submit: () => { submissions += 1; } },
    setCustomerEmailSignal: (signal) => signals.push(signal),
    setIsCustomerEmailDialogOpen: (value) => opened.push(value),
  });
  handler();
  assert.deepEqual(applied, [{
    actionResult: null,
    activeRecipientKey: null,
    commandId: null,
    confirmed: false,
    missingValuesConfirmed: false,
    previewSignal: null,
    previewSnapshot: null,
    resendConfirmed: false,
    selectedDeliveryStopIds: [],
    signal: "DELIVERY_SCHEDULED",
  }]);
  assert.deepEqual(opened, [true]);
  assert.deepEqual(signals, ["DELIVERY_SCHEDULED"]);
  assert.equal(submissions, 0);
  assert.match(source, /onClick=\{openCustomerEmailDialog\}/);
});

test("closing and preparing failed-only retry never submit email", () => {
  let submissions = 0;
  const customerEmailFetcher = { submit: () => { submissions += 1; } };
  const noop = () => {};
  const close = evaluateArrow("closeCustomerEmailDialog", {
    customerEmailFetcher,
    customerEmailRequestRef: { current: {} },
    setActiveCustomerEmailRecipientKey: noop,
    setCustomerEmailActionResult: noop,
    setCustomerEmailCommandId: noop,
    setCustomerEmailConfirmed: noop,
    setCustomerEmailMissingValuesConfirmed: noop,
    setCustomerEmailPreviewSignal: noop,
    setCustomerEmailPreviewSnapshot: noop,
    setCustomerEmailResendConfirmed: noop,
    setIsCustomerEmailDialogOpen: noop,
    setSelectedCustomerEmailDeliveryStopIds: noop,
  });
  close();

  const selected = [];
  const retry = evaluateArrow("retryFailedCustomerEmails", {
    activeCustomerEmailRecipientKey: null,
    customerEmailFailedDeliveryStopIds: ["stop-1"],
    customerEmailFetcher,
    customerEmailRecipients: [{ deliveryStopId: "stop-1" }],
    customerEmailSelectableRecipients: [{ deliveryStopId: "stop-1" }],
    effectiveRoutePlan: { id: "route-1" },
    getCustomerEmailRecipientDeliveryStopId: (recipient) => recipient.deliveryStopId,
    getCustomerEmailRecipientKey: (recipient) => recipient.deliveryStopId,
    setActiveCustomerEmailRecipientKey: (updater) => updater(null),
    setCustomerEmailCommandId: noop,
    setCustomerEmailConfirmed: noop,
    setCustomerEmailMissingValuesConfirmed: noop,
    setCustomerEmailResendConfirmed: noop,
    setSelectedCustomerEmailDeliveryStopIds: (ids) => selected.push(ids),
  });
  retry();
  assert.deepEqual(selected, [["stop-1"]]);
  assert.equal(submissions, 0);
});
