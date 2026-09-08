/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const routeDetailSource = readFileSync(join(root, "app/routes/app.routes.$routeId.jsx"), "utf8");
const routeDetailServerSource = readFileSync(join(root, "app/features/delivery/route-detail.server.js"), "utf8");
const customerEmailComponentsSource = readFileSync(join(root, "app/features/customer-notifications/customer-email-components.jsx"), "utf8");
const routeDetailUiSource = `${routeDetailSource}\n${customerEmailComponentsSource}`;

test("route detail customer email actions forward selected delivery stops and missing-value confirmation", () => {
  assert.match(routeDetailServerSource, /function readDeliveryStopIds\(formData\) \{/);
  assert.match(routeDetailServerSource, /formData\.getAll\("deliveryStopIds"\)/);
  assert.match(routeDetailServerSource, /deliveryStopIds: readDeliveryStopIds\(formData\),[\s\S]*signal: textOrUndefined\(formData\.get\("signal"\)\),/);
  assert.match(routeDetailServerSource, /deliveryStopIds: readDeliveryStopIds\(formData\),[\s\S]*missingValuesConfirmed: formData\.get\("missingValuesConfirmed"\) === "true"/);
  assert.match(routeDetailServerSource, /previewToken: textOrUndefined\(formData\.get\("previewToken"\)\)/);
  assert.match(routeDetailServerSource, /resendConfirmed: formData\.get\("resendConfirmed"\) === "true"/);
});

test("route detail customer email modal defaults to manual zero-recipient selection after preview", () => {
  assert.match(routeDetailSource, /const \[selectedCustomerEmailDeliveryStopIds, setSelectedCustomerEmailDeliveryStopIds\] = useState\(\[\]\)/);
  assert.match(routeDetailSource, /setSelectedCustomerEmailDeliveryStopIds\(\[\]\);[\s\S]*setCustomerEmailPreviewSignal\(null\)/);
  assert.match(routeDetailSource, /if \(!customerEmailPreview\) return;[\s\S]*setSelectedCustomerEmailDeliveryStopIds\(\[\]\)/);
  assert.match(routeDetailSource, /\{customerEmailSelectionCount\} selected \/ \{customerEmailSendableCount\} sendable \/ \{customerEmailExcludedCount\} excluded/);
});

test("route detail customer email modal uses route-aware defaults and a compact empty layout", () => {
  assert.match(routeDetailSource, /useState\(\(\) => getCustomerEmailDefaultSignal\(loaderRouteExecutionStatus\)\)/);
  assert.match(routeDetailSource, /setCustomerEmailSignal\(getCustomerEmailDefaultSignal\(routeExecutionStatus\)\)/);
  assert.match(routeDetailSource, /customerEmailPreviewEmptyState/);
  assert.match(routeDetailSource, /customerEmailRecipients\.length > 0 \|\| customerEmailExample\s*\? customerEmailDialogGridStyle\s*:\s*customerEmailDialogEmptyGridStyle/);
  assert.match(routeDetailSource, /customerEmailSendableCount > 0 \? \(/);
  assert.match(routeDetailSource, /customerEmailRecipients\.length > 0 \|\| customerEmailExample/);
  assert.match(routeDetailSource, /gridTemplateColumns: "repeat\(auto-fit, minmax\(min\(320px, 100%\), 1fr\)\)"/);
  assert.match(routeDetailSource, /const customerEmailDialogStyle = \{[\s\S]*overflow: "hidden"[\s\S]*width: "680px"/);
  assert.match(routeDetailSource, /const customerEmailDialogBodyStyle = \{[\s\S]*overflowY: "auto"[\s\S]*overscrollBehavior: "contain"/);
  assert.match(routeDetailSource, /const customerEmailDialogFooterStyle = \{[\s\S]*borderTop: "1px solid #e3e3e3"/);
  assert.match(routeDetailSource, /aria-modal="true"[\s\S]*customerEmailDialogHeaderStyle[\s\S]*customerEmailDialogBodyStyle[\s\S]*customerEmailDialogFooterStyle/);
  assert.match(routeDetailSource, /Template example/);
  assert.match(routeDetailSource, /This example is not a selected recipient and will not be sent/);
  assert.match(routeDetailSource, /customerEmailStatusExclusions/);
  assert.match(routeDetailSource, /Missing or invalid email/);
  assert.match(routeDetailSource, /Not matched by route status/);
});

test("route detail customer email binds send requests to the completed preview", () => {
  assert.match(routeDetailSource, /customerEmailPreview\?\.previewToken/);
  assert.match(routeDetailSource, /formData\.set\("previewToken", customerEmailPreview\.previewToken\)/);
  assert.match(routeDetailSource, /deliveryStopIds", JSON\.stringify\(selectedCustomerEmailDeliveryStopIds\)/);
  assert.match(routeDetailSource, /setCustomerEmailCommandId\(globalThis\.crypto\?\.randomUUID\?\.\(\) \?\? `\$\{Date\.now\(\)\}-\$\{effectiveRoutePlan\?\.id\}-retry`\)/);
});

test("route detail customer email requires a fresh preview after a preview conflict", () => {
  assert.match(routeDetailSource, /hasCustomerEmailPreviewConflict\(data\.errors\)/);
  assert.match(routeDetailSource, /hasCustomerEmailPreviewConflict\(data\.errors\)[\s\S]*setCustomerEmailPreviewSnapshot\(null\);[\s\S]*setCustomerEmailPreviewSignal\(null\);[\s\S]*setCustomerEmailCommandId\(null\);[\s\S]*setSelectedCustomerEmailDeliveryStopIds\(\[\]\)/);
});

test("route detail customer email modal selects only eligible rows and previews the focused recipient", () => {
  assert.match(routeDetailSource, /const customerEmailSelectableRecipients = useMemo\([\s\S]*customerEmailRecipients\.filter\(isCustomerEmailRecipientSelectable\)/);
  assert.match(routeDetailSource, /toggleAllCustomerEmailRecipients\(event\.target\.checked\)/);
  assert.match(routeDetailSource, /customerEmailSelectableRecipients\.map\(getCustomerEmailRecipientDeliveryStopId\)\.filter\(Boolean\)/);
  assert.match(routeDetailSource, /onFocus=\{\(\) => setActiveCustomerEmailRecipientKey\(recipientKey\)\}/);
  assert.match(routeDetailSource, /getCustomerEmailRenderedSubject\(activeCustomerEmailRecipient\)/);
  assert.match(routeDetailSource, /getCustomerEmailRenderedBody\(activeCustomerEmailRecipient\)/);
});

test("route detail customer email send requires current preview, selection, confirmation, and missing-value acknowledgement", () => {
  assert.match(routeDetailSource, /const selectedCustomerEmailHasMissingValues = selectedCustomerEmailRecipients\.some\(hasCustomerEmailMissingTemplateValues\)/);
  assert.match(routeDetailSource, /function getCustomerEmailMissingTemplateDiagnostics\(recipient\) \{/);
  assert.match(routeDetailSource, /diagnostic\?\.code === "MISSING_TEMPLATE_VALUE"/);
  assert.match(routeDetailSource, /formData\.set\("deliveryStopIds", JSON\.stringify\(selectedCustomerEmailDeliveryStopIds\)\)/);
  assert.match(routeDetailSource, /formData\.set\("missingValuesConfirmed", String\(customerEmailMissingValuesConfirmed\)\)/);
  assert.match(routeDetailSource, /formData\.set\("resendConfirmed", String\(customerEmailResendConfirmed\)\)/);
  assert.match(routeDetailSource, /getCustomerEmailSendReadiness\(\{[\s\S]*previewReady:[\s\S]*selectionCount: customerEmailSelectionCount/);
  assert.match(routeDetailSource, /id="customer-email-send-status"[\s\S]*customerEmailSendReadiness\.blockers/);
  assert.match(routeDetailSource, /<s-checkbox[\s\S]*label="Confirm this manual send to the selected recipients shown above"/);
  assert.match(routeDetailSource, /aria-describedby="customer-email-send-status"/);
  assert.match(routeDetailSource, /Confirm selected previews with missing template values/);
});

test("route detail customer email diagnostics combine subject and body missing template values without raw braces", () => {
  assert.match(routeDetailSource, /if \(Array\.isArray\(diagnostics\)\) return diagnostics/);
  assert.match(routeDetailSource, /\.\.\.\(Array\.isArray\(diagnostics\.subject\) \? diagnostics\.subject : \[\]\)/);
  assert.match(routeDetailSource, /\.\.\.\(Array\.isArray\(diagnostics\.body\) \? diagnostics\.body : \[\]\)/);
  assert.match(routeDetailSource, /function getCustomerEmailDiagnosticTokenLabel\(diagnostic\) \{/);
  assert.match(routeDetailSource, /diagnostic\?\.name \?\? diagnostic\?\.key \?\? diagnostic\?\.token/);
  assert.match(routeDetailSource, /replace\(\[\/\{\}\]\/g, ""\)|replace\(\/\[\{\}\]\/g, ""\)/);
  assert.match(routeDetailSource, /formatCustomerEmailMissingTemplateDiagnostics\(recipient\)/);
  assert.match(routeDetailSource, /formatCustomerEmailMissingTemplateDiagnostics\(activeCustomerEmailRecipient\)/);
  assert.doesNotMatch(routeDetailSource, /Missing: \{\{/);
});

test("route detail customer email send requires independent resend acknowledgement for recipients with history", () => {
  assert.match(routeDetailSource, /function getCustomerEmailRecipientHistory\(recipient\) \{/);
  assert.match(routeDetailSource, /function hasCustomerEmailPriorSend\(recipient\) \{/);
  assert.match(routeDetailSource, /const selectedCustomerEmailHasPriorSends = selectedCustomerEmailRecipients\.some\(hasCustomerEmailPriorSend\)/);
  assert.match(routeDetailSource, /hasPriorSends: selectedCustomerEmailHasPriorSends/);
  assert.match(routeDetailSource, /resendConfirmed: customerEmailResendConfirmed/);
  assert.match(routeDetailSource, /formatCustomerEmailHistory\(getCustomerEmailRecipientHistory\(recipient\)\)/);
  assert.match(routeDetailSource, /history\.lastProviderStatus/);
  assert.match(routeDetailSource, /history\.lastProviderEventAt/);
  assert.match(routeDetailSource, /Confirm resend to recipients with prior send history/);
});

test("route detail customer email blocks recipients with unresolved provider outcomes", () => {
  assert.match(routeDetailSource, /function hasCustomerEmailUncertainOutcome\(recipient\) \{/);
  assert.match(routeDetailSource, /history\(recipient\)\?\.uncertainCount|RecipientHistory\(recipient\)\?\.uncertainCount/);
  assert.match(routeDetailSource, /&& !hasCustomerEmailUncertainOutcome\(recipient\)/);
  assert.match(routeDetailSource, /Pending or unknown delivery outcome; cannot resend/);
  assert.match(routeDetailSource, /pending or unknown delivery outcome and cannot be resent/);
});

test("route detail customer email can retry failed dispatch recipients through the existing send action", () => {
  assert.match(routeDetailSource, /function getCustomerEmailFailedSendDeliveryStopIds\(dispatch\) \{/);
  assert.match(routeDetailSource, /const customerEmailFailedDeliveryStopIds = useMemo\(/);
  assert.match(routeDetailSource, /const retryFailedCustomerEmails = \(\) => \{/);
  assert.match(routeDetailSource, /setCustomerEmailCommandId\(globalThis\.crypto\?\.randomUUID\?\.\(\) \?\? `\$\{Date\.now\(\)\}-\$\{effectiveRoutePlan\?\.id\}-retry`\)/);
  assert.match(routeDetailSource, /setSelectedCustomerEmailDeliveryStopIds\(retryableStopIds\)/);
  assert.match(routeDetailUiSource, />\s*Retry failed only\s*<\/button>/);
  assert.doesNotMatch(routeDetailSource, /retryFailedRouteCustomerNotification|retry-failed/);
});

test("route detail customer email renders accepted, failed, skipped, duplicate, and unknown outcomes", () => {
  assert.match(routeDetailSource, /summarizeCustomerEmailSendResult\(customerEmailSendResult\)/);
  assert.match(routeDetailUiSource, /provider accepted/);
  assert.match(routeDetailUiSource, /failed/);
  assert.match(routeDetailUiSource, /skipped/);
  assert.match(routeDetailUiSource, /duplicate/);
  assert.match(routeDetailUiSource, /outcome unknown/);
  assert.match(routeDetailUiSource, /Provider acceptance is not final delivery confirmation\./);
  assert.match(routeDetailUiSource, /No new send was started/);
  assert.match(routeDetailUiSource, /The original delivery outcome is unavailable in this response\./);
  assert.match(routeDetailUiSource, /Click Preview recipients again to refresh provider delivery or bounce status/);
});

test("route detail customer email preserves the preview locally so failed-only retry can reuse existing send", () => {
  assert.match(routeDetailSource, /const \[customerEmailPreviewSnapshot, setCustomerEmailPreviewSnapshot\] = useState\(null\)/);
  assert.match(routeDetailSource, /customerEmailPreviewSignal === customerEmailSignal\s*\? customerEmailPreviewSnapshot\s*:\s*null/);
  assert.match(routeDetailSource, /setCustomerEmailPreviewSnapshot\(data\.preview\);[\s\S]*setCustomerEmailPreviewSignal\(requestSnapshot\.signal\)/);
  assert.match(routeDetailSource, /setCustomerEmailPreviewSnapshot\(null\);[\s\S]*setCustomerEmailPreviewSignal\(null\)/);
  assert.doesNotMatch(routeDetailSource, /customerEmailFetcher\.data\?\.preview \?\?/);
});

test("route detail customer email ignores stale fetcher data until the current request completes", () => {
  assert.match(routeDetailSource, /const customerEmailRequestRef = useRef\(null\)/);
  assert.match(routeDetailSource, /previousData: customerEmailFetcher\.data,[\s\S]*signal: customerEmailSignal/);
  assert.match(routeDetailSource, /customerEmailFetcher\.state !== "idle"[\s\S]*customerEmailFetcher\.data === requestSnapshot\.previousData/);
  assert.match(routeDetailSource, /setCustomerEmailActionResult\(\{[\s\S]*intent: requestSnapshot\.intent,[\s\S]*signal: requestSnapshot\.signal/);
  assert.match(routeDetailSource, /customerEmailPreviewBusy[\s\S]*Finding matching recipients…/);
});

test("route detail customer email does not show a stale preview while another signal is loading", () => {
  assert.match(routeDetailSource, /customerEmailRequestRef\.current = \{[\s\S]*previousData: customerEmailFetcher\.data,[\s\S]*signal: customerEmailSignal/);
  assert.match(routeDetailSource, /setCustomerEmailPreviewSnapshot\(null\);[\s\S]*setCustomerEmailPreviewSignal\(null\)/);
  assert.match(routeDetailSource, /customerEmailFetcher\.data === requestSnapshot\.previousData/);
  assert.match(routeDetailSource, /setCustomerEmailPreviewSignal\(requestSnapshot\.signal\)/);
  assert.match(routeDetailSource, /disabled=\{customerEmailFetcher\.state !== "idle"\}[\s\S]*id="customer-email-signal"/);
  assert.doesNotMatch(routeDetailSource, /customerEmailFetcher\.data\?\.preview \?\? customerEmailPreviewSnapshot/);
});

test("route detail customer email resets selection and confirmations on signal change and close", () => {
  assert.match(routeDetailSource, /function closeCustomerEmailDialog|const closeCustomerEmailDialog = \(\) => \{/);
  assert.match(routeDetailSource, /setCustomerEmailPreviewSignal\(null\);[\s\S]*setCustomerEmailCommandId\(null\);[\s\S]*setSelectedCustomerEmailDeliveryStopIds\(\[\]\);[\s\S]*setActiveCustomerEmailRecipientKey\(null\)/);
  assert.match(routeDetailSource, /const handleCustomerEmailSignalChange = \(event\) => \{/);
  assert.match(routeDetailSource, /setCustomerEmailSignal\(event\.target\.value\);[\s\S]*setCustomerEmailMissingValuesConfirmed\(false\);[\s\S]*setSelectedCustomerEmailDeliveryStopIds\(\[\]\)/);
});
