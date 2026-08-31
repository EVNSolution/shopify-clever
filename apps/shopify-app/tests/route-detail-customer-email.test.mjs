/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const routeDetailSource = readFileSync(join(root, "app/routes/app.routes.$routeId.jsx"), "utf8");
const routeDetailServerSource = readFileSync(join(root, "app/features/delivery/route-detail.server.js"), "utf8");

test("route detail customer email actions forward selected delivery stops and missing-value confirmation", () => {
  assert.match(routeDetailServerSource, /function readDeliveryStopIds\(formData\) \{/);
  assert.match(routeDetailServerSource, /formData\.getAll\("deliveryStopIds"\)/);
  assert.match(routeDetailServerSource, /deliveryStopIds: readDeliveryStopIds\(formData\),[\s\S]*signal: textOrUndefined\(formData\.get\("signal"\)\),/);
  assert.match(routeDetailServerSource, /deliveryStopIds: readDeliveryStopIds\(formData\),[\s\S]*missingValuesConfirmed: formData\.get\("missingValuesConfirmed"\) === "true"/);
  assert.match(routeDetailServerSource, /resendConfirmed: formData\.get\("resendConfirmed"\) === "true"/);
});

test("route detail customer email modal defaults to manual zero-recipient selection after preview", () => {
  assert.match(routeDetailSource, /const \[selectedCustomerEmailDeliveryStopIds, setSelectedCustomerEmailDeliveryStopIds\] = useState\(\[\]\)/);
  assert.match(routeDetailSource, /setSelectedCustomerEmailDeliveryStopIds\(\[\]\);[\s\S]*setCustomerEmailPreviewSignal\(customerEmailSignal\)/);
  assert.match(routeDetailSource, /if \(!customerEmailPreview\) return;[\s\S]*setSelectedCustomerEmailDeliveryStopIds\(\[\]\)/);
  assert.match(routeDetailSource, /\{customerEmailSelectionCount\} selected \/ \{customerEmailEligibleCount\} eligible \/ \{customerEmailSkippedCount\} skipped/);
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

test("route detail customer email can retry failed dispatch recipients through the existing send action", () => {
  assert.match(routeDetailSource, /function getCustomerEmailFailedSendDeliveryStopIds\(dispatch\) \{/);
  assert.match(routeDetailSource, /const customerEmailFailedDeliveryStopIds = useMemo\(/);
  assert.match(routeDetailSource, /const retryFailedCustomerEmails = \(\) => \{/);
  assert.match(routeDetailSource, /setCustomerEmailCommandId\(globalThis\.crypto\?\.randomUUID\?\.\(\) \?\? `\$\{Date\.now\(\)\}-\$\{effectiveRoutePlan\?\.id\}-retry`\)/);
  assert.match(routeDetailSource, /setSelectedCustomerEmailDeliveryStopIds\(retryableStopIds\)/);
  assert.match(routeDetailSource, />\s*Retry failed only\s*<\/button>/);
  assert.doesNotMatch(routeDetailSource, /retryFailedRouteCustomerNotification|retry-failed/);
});

test("route detail customer email preserves the preview locally so failed-only retry can reuse existing send", () => {
  assert.match(routeDetailSource, /const \[customerEmailPreviewSnapshot, setCustomerEmailPreviewSnapshot\] = useState\(null\)/);
  assert.match(routeDetailSource, /customerEmailFetcher\.data\?\.preview \?\? customerEmailPreviewSnapshot/);
  assert.match(routeDetailSource, /setCustomerEmailPreviewSnapshot\(customerEmailFetcher\.data\.preview\)/);
  assert.match(routeDetailSource, /setCustomerEmailPreviewSnapshot\(null\);[\s\S]*setCustomerEmailPreviewSignal\(customerEmailSignal\)/);
});

test("route detail customer email resets selection and confirmations on signal change and close", () => {
  assert.match(routeDetailSource, /function closeCustomerEmailDialog|const closeCustomerEmailDialog = \(\) => \{/);
  assert.match(routeDetailSource, /setCustomerEmailPreviewSignal\(null\);[\s\S]*setCustomerEmailCommandId\(null\);[\s\S]*setSelectedCustomerEmailDeliveryStopIds\(\[\]\);[\s\S]*setActiveCustomerEmailRecipientKey\(null\)/);
  assert.match(routeDetailSource, /const handleCustomerEmailSignalChange = \(event\) => \{/);
  assert.match(routeDetailSource, /setCustomerEmailSignal\(event\.target\.value\);[\s\S]*setCustomerEmailMissingValuesConfirmed\(false\);[\s\S]*setSelectedCustomerEmailDeliveryStopIds\(\[\]\)/);
});
