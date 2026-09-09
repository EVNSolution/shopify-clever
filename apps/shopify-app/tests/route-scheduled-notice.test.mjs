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

const resolveSave = evaluateFunction(
  "resolveScheduledNoticeSaveResult",
  "\n\nfunction createScheduledNoticeNavigationState",
);
const createNavigationState = evaluateFunction(
  "createScheduledNoticeNavigationState",
  "\n\nfunction getScheduledNoticeLocationRoutePlanIds",
);
const getLocationRoutePlanIds = evaluateFunction(
  "getScheduledNoticeLocationRoutePlanIds",
  "\n\nfunction createCustomerEmailDialogOpenState",
);
const createDialogState = evaluateFunction(
  "createCustomerEmailDialogOpenState",
  "\n\nexport default function RouteDetailPage",
);

test("save result requires success and keeps only concrete route ids", () => {
  assert.deepEqual(resolveSave({
    errors: [{ message: "failed" }],
    routeGroupRoutePlanIds: ["route-1"],
  }), { routePlanIds: [], succeeded: false });
  assert.deepEqual(resolveSave({
    routeGroupRoutePlanIds: ["route-1", null, "route-1", "route-2"],
  }), { routePlanIds: ["route-1", "route-2"], succeeded: true });
  assert.deepEqual(resolveSave({
    routeGroupRoutePlanIds: ["group-member"],
    routePlanId: "current-route",
  }), { routePlanIds: ["current-route"], succeeded: true });
  assert.deepEqual(resolveSave({
    excludedRoutePlanIds: ["route-2"],
    routeGroupRoutePlanIds: ["route-1", "route-2"],
  }), { routePlanIds: ["route-1"], succeeded: true });
  assert.deepEqual(resolveSave({
    excludedRoutePlanIds: ["deleted-current"],
    routeGroupRoutePlanIds: ["deleted-current", "surviving-sibling"],
    routePlanId: "deleted-current",
  }), { routePlanIds: ["surviving-sibling"], succeeded: true });
  assert.deepEqual(createNavigationState(["route-1", null, "route-1", "route-2"]), {
    scheduledNoticeRoutePlanIds: ["route-1", "route-2"],
  });
  assert.deepEqual(getLocationRoutePlanIds({
    scheduledNoticeRoutePlanIds: ["route-2", "stale-route", "route-2"],
  }, ["route-1", "route-2"]), ["route-2"]);
});

test("group-null initialization and reset cannot dereference a missing route", () => {
  const initializer = Function("location", "effectiveRoutePlan", `return (
    effectiveRoutePlan?.id && location.state?.scheduledNoticeRoutePlanId === effectiveRoutePlan.id
      ? effectiveRoutePlan.id
      : null
  );`);
  assert.equal(initializer({ state: {} }, null), null);
  assert.equal(initializer({ state: { scheduledNoticeRoutePlanId: "route-1" } }, null), null);
  assert.equal(initializer({ state: { scheduledNoticeRoutePlanId: "route-1" } }, { id: "route-1" }), "route-1");
  assert.equal(initializer({ state: { scheduledNoticeRoutePlanId: "other" } }, { id: "route-1" }), null);
  assert.equal((source.match(/effectiveRoutePlan\?\.id && location\.state\?\.scheduledNoticeRoutePlanId === effectiveRoutePlan\.id/g) ?? []).length, 2);
});

test("successful save exposes entries without opening, previewing, or sending email", () => {
  const effect = between(
    'if (lastRouteActionIntentRef.current !== "saveRouteDraft") return;',
    "useEffect(() => {\n    if (!hasRouteAllocationDraft)",
  );
  assert.match(effect, /const savedRouteGroup = routeActionFetcher\.data\?\.routeGroup \?\? routeGroup/);
  assert.match(effect, /getVisibleRouteGroupChildren\(savedRouteGroup\)/);
  assert.match(effect, /excludedRoutePlanIds: deletedRoutePlanIds/);
  assert.match(effect, /if \(scheduledNoticeSaveResult\.succeeded\)/);
  assert.match(effect, /setScheduledNoticeRoutePlanId\(scheduledNoticeSaveResult\.routePlanIds\[0\] \?\? null\)/);
  assert.match(effect, /setScheduledNoticeGroupRoutePlanIds\(scheduledNoticeSaveResult\.routePlanIds\)/);
  assert.doesNotMatch(effect, /openCustomerEmailDialog|submitCustomerEmailAction|previewCustomerEmail|sendCustomerEmail/);
  assert.match(source, /const handleSaveRouteDraft = \(\) => \{[\s\S]*setScheduledNoticeRoutePlanId\(null\);[\s\S]*setScheduledNoticeGroupRoutePlanIds\(\[\]\);[\s\S]*submitRouteGroupAction\("saveRouteDraft"/);
});

test("successful save navigation preserves the remaining saved route ids", () => {
  assert.match(source, /navigate\(navigateAfterSave, \{[\s\S]*createScheduledNoticeNavigationState\(scheduledNoticeSaveResult\.routePlanIds\)/);
  assert.match(source, /navigate\(routeGroupPath\(routeGroupId\), \{[\s\S]*createScheduledNoticeNavigationState\(scheduledNoticeSaveResult\.routePlanIds\)/);
  assert.match(source, /getScheduledNoticeLocationRoutePlanIds\([\s\S]*getVisibleRouteGroupChildren\(routeGroup\)\.map\(getRouteGroupChildRoutePlanId\)/);
  assert.match(source, /\|\| scheduledNoticeGroupRoutePlanIds\.length > 0/);
  assert.doesNotMatch(source, /isRouteGroupDetail && scheduledNoticeGroupRoutePlanIds\.length > 0/);
});

test("group entry navigates only to an actual member and does not use the group as an email target", () => {
  assert.match(source, /siblingRouteRows[\s\S]*\.filter\(\(routeRow\) => scheduledNoticeGroupRoutePlanIds\.includes\(routeRow\.routePlanId\)\)/);
  assert.match(source, /navigate\(routeGroupChildPath\(routeGroupId, routePlanId\), \{[\s\S]*scheduledNoticeRoutePlanId: routePlanId/);
  assert.doesNotMatch(source, /openScheduledNoticeDialog\(routeGroupId\)|scheduledNoticeRoutePlanId: routeGroupId/);
});

test("explicit scheduled click resets consent and opens without submitting", () => {
  const applied = [];
  const opened = [];
  const signals = [];
  let submissions = 0;
  const handler = evaluateArrow("openScheduledNoticeDialog", {
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
  assert.match(source, /onClick=\{openScheduledNoticeDialog\}/);
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

test("entry is translated and disabled while route changes are unsaved", () => {
  assert.match(source, /useRouteLoaderData\("routes\/app"\)\?\.language \?\? "en"/);
  assert.match(source, /translate\(language, "routes\.scheduledNotice\.savedMessage"\)/);
  assert.match(source, /translate\(language, "routes\.scheduledNotice\.reviewAction"\)/);
  assert.match(source, /disabled=\{hasRouteAllocationDraft \|\| routeGroupActionBusy\}/);
  assert.match(source, /translate\(language, "routes\.scheduledNotice\.unsavedTitle"\)/);
});
