/* eslint-env node */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import { CustomerEmailPreviewFrame } from "../app/features/customer-notifications/customer-email-preview-frame.js";

test("customer email HTML preview is script-disabled and cannot navigate its parent", () => {
  const output = renderToStaticMarkup(createElement(CustomerEmailPreviewFrame, {
    html: '<script>parent.location="https://bad.test"</script><a target="_top" href="https://bad.test">Bad</a>',
    title: "Email preview",
  }));

  assert.match(output, /<iframe/);
  assert.match(output, /sandbox=""/);
  assert.match(output, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(output, /allow-scripts|allow-top-navigation|allow-popups/);
});
