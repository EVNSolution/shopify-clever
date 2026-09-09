import test from "node:test";
import assert from "node:assert/strict";
import { parseTemplateDocument, serializeTemplateDocument, hasUnsupportedTemplateSegments, insertTemplateToken } from "../app/features/customer-notifications/template-document.js";
import { translate } from "../app/i18n/i18n.js";

test("scheduled ETA window survives editing alongside legacy ETA and custom copy", () => {
  const source = "Custom greeting: {{eta}}; arrival window {{etaWindow}}.";
  const document = parseTemplateDocument(source);
  assert.equal(hasUnsupportedTemplateSegments(document), false);
  assert.equal(serializeTemplateDocument(document), source);
});

test("scheduled window can be inserted without replacing custom copy or changing template language", () => {
  const document = insertTemplateToken(parseTemplateDocument("Your custom text: "), "etaWindow");
  assert.equal(serializeTemplateDocument(document), "Your custom text: {{etaWindow}}");
  assert.equal(translate("ko", "notifications.variables.etaWindow"), "예상 도착 시간대");
  assert.equal(translate("en", "notifications.variables.etaWindow"), "Estimated arrival window");
});
