import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOMER_NOTIFICATION_VARIABLES,
  hasUnsupportedTemplateSegments,
  insertTemplateToken,
  parseTemplateDocument,
  serializeTemplateDocument,
} from "./template-document.js";

test("parses known legacy placeholders into atomic canonical tokens", () => {
  const document = parseTemplateDocument(
    "Hello {{ customerName }} from {{storeName}}\n{{inventoryList}}",
  );

  assert.deepEqual(document, {
    diagnostics: [],
    segments: [
      { type: "text", value: "Hello " },
      { key: "customerName", type: "token" },
      { type: "text", value: " from " },
      { key: "shopName", type: "token" },
      { type: "text", value: "\n" },
      { key: "inventoryList", type: "token" },
    ],
  });
  assert.equal(
    serializeTemplateDocument(document),
    "Hello {{customerName}} from {{shopName}}\n{{inventoryList}}",
  );
});

test("keeps unknown legacy syntax visible as an unsupported diagnostic", () => {
  const document = parseTemplateDocument("Hello {{unknownField}}");

  assert.equal(hasUnsupportedTemplateSegments(document), true);
  assert.deepEqual(document.diagnostics, [{
    code: "UNSUPPORTED_TEMPLATE_VARIABLE",
    key: "unknownField",
    raw: "{{unknownField}}",
  }]);
  assert.equal(serializeTemplateDocument(document), "Hello {{unknownField}}");
});

test("inserts only supported variables without exposing serialization to the editor", () => {
  const document = insertTemplateToken(
    parseTemplateDocument("Delivery items: "),
    "inventoryList",
    1,
  );

  assert.equal(serializeTemplateDocument(document), "Delivery items: {{inventoryList}}");
  assert.ok(CUSTOMER_NOTIFICATION_VARIABLES.includes("deliveryWeekday"));
  assert.throws(
    () => insertTemplateToken(document, "rawHtml"),
    /Unsupported customer notification variable/u,
  );
});
