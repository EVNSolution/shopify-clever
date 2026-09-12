import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

import { getAdminRouteErrorPresentation } from "../app/features/shopify/admin-route-error.js";
import { translate } from "../app/i18n/i18n.js";

const appRoot = process.cwd();

test("Shopify bounce responses remain delegated outside the recovery endpoint", () => {
  const presentation = getAdminRouteErrorPresentation({
    data: '<script data-api-key="key_123" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>',
    status: 200,
    statusText: "",
  });

  assert.equal(presentation.kind, "shopify-response");
});

test("failed Shopify session-token bounces render recovery instead of another dead-end", () => {
  const presentation = getAdminRouteErrorPresentation(
    {
      data: '<script data-api-key="key_123" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>',
      status: 200,
      statusText: "",
    },
    { allowShopifyResponse: false, hasEmbeddedContext: true },
  );

  assert.equal(presentation.kind, "recovery-failed");
  assert.equal(presentation.titleKey, "recovery.failed.title");
});

test("context-free Shopify bounce responses render static recovery guidance", () => {
  const presentation = getAdminRouteErrorPresentation(
    {
      data: '<script data-api-key="key_123" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>',
      status: 200,
      statusText: "",
    },
    { hasEmbeddedContext: false },
  );

  assert.equal(presentation.kind, "missing-context");
  assert.equal(presentation.messageKey, "recovery.missingContext.message");
});

test("Session failures render recovery guidance", () => {
  const presentation = getAdminRouteErrorPresentation({
    data: "Shopify session expired",
    status: 401,
    statusText: "Unauthorized",
  });

  assert.equal(presentation.kind, "session-expired");
  assert.equal(presentation.titleKey, "recovery.sessionExpired.title");
  assert.equal(presentation.messageKey, "recovery.sessionExpired.message");
});

test("Status-only responses never render a bare number", () => {
  const presentation = getAdminRouteErrorPresentation({
    data: "200",
    status: 200,
    statusText: "",
  });

  assert.equal(presentation.kind, "route-error");
  assert.equal(presentation.titleKey, "recovery.routeError.title");
  assert.equal(presentation.messageKey, "recovery.routeError.message");
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

test("recovery copy renders one selected language with English fallback", () => {
  assert.equal(translate("en", "recovery.action"), "Open in Shopify");
  assert.equal(translate("ko", "recovery.action"), "Shopify에서 열기");
  assert.equal(translate("unsupported", "recovery.action"), "Open in Shopify");

  for (const language of ["en", "ko"]) {
    for (const key of [
      "recovery.failed.title",
      "recovery.failed.message",
      "recovery.missingContext.title",
      "recovery.missingContext.message",
      "recovery.routeError.title",
      "recovery.routeError.message",
      "recovery.sessionExpired.title",
      "recovery.sessionExpired.message",
    ]) {
      const copy = translate(language, key);
      assert.notEqual(copy, key);
      assert.doesNotMatch(copy, /\s\/\s/u);
    }
  }
});

test("recovery page keeps re-entry and standalone accessibility contracts", () => {
  const boundarySource = readFileSync(
    join(appRoot, "app/ui/admin-route-error-boundary.jsx"),
    "utf8",
  );
  const pageSource = readFileSync(
    join(appRoot, "app/ui/admin-route-error-page.jsx"),
    "utf8",
  );
  const pageStyles = readFileSync(
    join(appRoot, "app/ui/admin-route-error-page.css"),
    "utf8",
  );

  assert.match(boundarySource, /useRouteLoaderData\("routes\/app"\)/);
  assert.match(boundarySource, /normalizeLanguage\(appData\?\.language \?\? DEFAULT_LANGUAGE\)/);
  assert.match(pageSource, /data-shopify-document-error/);
  assert.match(pageSource, /role="alert"/);
  assert.match(pageSource, /target="_top"/);
  assert.match(pageSource, /aria-labelledby="admin-recovery-title"/);
  assert.doesNotMatch(pageSource, /AppProvider|useAppBridge|s-button/u);
  assert.match(pageStyles, /admin-recovery__action:focus-visible/);
  assert.match(pageStyles, /@media \(max-width: 520px\)/);
});
