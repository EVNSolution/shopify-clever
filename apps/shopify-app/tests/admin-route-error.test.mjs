import assert from "node:assert/strict";
import test from "node:test";

import { getAdminRouteErrorPresentation } from "../app/features/shopify/admin-route-error.js";

test("Shopify bounce responses remain delegated to the Shopify boundary", () => {
  const presentation = getAdminRouteErrorPresentation({
    data: '<script data-api-key="key_123" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>',
    status: 200,
    statusText: "",
  });

  assert.equal(presentation.kind, "shopify-response");
});

test("Session failures render recovery guidance", () => {
  const presentation = getAdminRouteErrorPresentation({
    data: "Shopify session expired",
    status: 401,
    statusText: "Unauthorized",
  });

  assert.equal(presentation.kind, "session-expired");
  assert.match(presentation.title, /session/i);
  assert.match(presentation.message, /reload|reopen/i);
});

test("Status-only responses never render a bare number", () => {
  const presentation = getAdminRouteErrorPresentation({
    data: "200",
    status: 200,
    statusText: "",
  });

  assert.equal(presentation.kind, "route-error");
  assert.notEqual(presentation.title, "200");
  assert.doesNotMatch(presentation.message, /^200$/u);
});

test("Unexpected programming errors remain on the existing observable error path", () => {
  const presentation = getAdminRouteErrorPresentation(
    new Error("token=secret customer@example.com"),
  );

  assert.equal(presentation.kind, "unexpected-error");
  assert.doesNotMatch(JSON.stringify(presentation), /secret|customer@example\.com/u);
});

test("Untrusted HTML that mentions App Bridge is never delegated", () => {
  const presentation = getAdminRouteErrorPresentation({
    data: '<p>prefix</p><script data-api-key="key_123" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script><p>suffix</p>',
    status: 200,
  });

  assert.equal(presentation.kind, "route-error");
});
