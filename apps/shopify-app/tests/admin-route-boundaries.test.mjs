import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { shouldHydrateDocument } from "../app/features/runtime/document-hydration.js";

const routesDir = path.resolve("app/routes");

function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath);
    return entry.isFile() && /\.[jt]sx?$/.test(entry.name) ? [fullPath] : [];
  });
}

test("document routes that authenticate admin requests export Shopify boundary helpers", () => {
  const authenticatedRouteFiles = walkFiles(routesDir).filter((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    return source.includes("authenticate.admin(") && /export\s+default\b/.test(source);
  });

  assert.ok(authenticatedRouteFiles.length > 0, "expected authenticated route coverage");

  const missingBoundaryExports = authenticatedRouteFiles
    .map((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      const relative = path.relative(process.cwd(), filePath);
      const missing = [];

      if (!/AdminRouteErrorBoundary/.test(source)) {
        missing.push("ErrorBoundary");
      }
      if (!/boundary\.headers\(headersArgs\)/.test(source)) missing.push("headers");

      return missing.length > 0 ? `${relative}: ${missing.join(", ")}` : null;
    })
    .filter(Boolean);

  assert.deepEqual(missingBoundaryExports, []);
});


test("custom client entry leaves server-rendered error boundaries unhydrated", () => {
  const source = fs.readFileSync(path.resolve("app/entry.client.jsx"), "utf8");
  const boundarySource = fs.readFileSync(
    path.resolve("app/ui/admin-route-error-boundary.jsx"),
    "utf8",
  );
  const hydrationSource = fs.readFileSync(
    path.resolve("app/features/runtime/document-hydration.js"),
    "utf8",
  );

  assert.match(hydrationSource, /document\.body\.firstElementChild\?\.textContent === "Handling response"/);
  assert.match(source, /shouldHydrateDocument\(document\)/);
  assert.match(source, /hydrateApp\(\)/);
  assert.match(boundarySource, /data-shopify-document-error/);
  assert.match(boundarySource, /<div data-shopify-document-error>\{boundary\.error\(error\)\}<\/div>/);
  assert.match(boundarySource, /hasEmbeddedShopifySearchParams\(searchParams\)/);
  assert.match(source, /installStaleBundleRecovery\(\)/);
  assert.match(source, /<HydratedRouter \/>/);

  const createDocument = ({ boundaryText, marked = false } = {}) => ({
    body: { firstElementChild: boundaryText ? { textContent: boundaryText } : null },
    querySelector: () => marked ? {} : null,
  });

  assert.equal(shouldHydrateDocument(createDocument()), true);
  assert.equal(shouldHydrateDocument(createDocument({ boundaryText: "Handling response" })), false);
  assert.equal(shouldHydrateDocument(createDocument({ boundaryText: "Route: Handling response" })), true);
  assert.equal(shouldHydrateDocument(createDocument({ marked: true })), false);
});

test("customer notification Shopify lane stays behind delivery API boundaries", () => {
  const customerNotificationSources = [
    "app/features/customer-notifications/customer-email.server.js",
    "app/routes/app.settings.jsx",
  ].map((filePath) => fs.readFileSync(path.resolve(filePath), "utf8")).join("\n");

  assert.match(customerNotificationSources, /deliveryApiRequest/);
  assert.match(customerNotificationSources, /saveCustomerNotificationSettings/);
  assert.doesNotMatch(customerNotificationSources, /orderUpdate|customerUpdate/);
  assert.doesNotMatch(customerNotificationSources, /customer\s*\{/);
  assert.doesNotMatch(customerNotificationSources, /\bemail\b[\s\S]{0,80}currentAppInstallation/);
  assert.doesNotMatch(customerNotificationSources, /previewText|logoAlt|rawHtml|raw HTML/i);
});

test("Shopify order GraphQL documents do not add protected customer email fields or mutations", () => {
  const orderSource = fs.readFileSync(
    path.resolve("app/features/orders/shopify-orders.server.js"),
    "utf8",
  );
  const graphqlDocuments = extractGraphqlDocuments(orderSource).map((document) =>
    document.replace(/\bcustomer\s*\{\s*note\s*\}/gu, " "),
  ).join("\n");

  assert.ok(graphqlDocuments.trim(), "expected Shopify order GraphQL documents");
  assert.doesNotMatch(graphqlDocuments, /\bemail\b/u);
  assert.doesNotMatch(graphqlDocuments, /\bcustomer\s*\{/u);
  assert.doesNotMatch(graphqlDocuments, /\borderUpdate\b|\bcustomerUpdate\b/u);
  assert.doesNotMatch(graphqlDocuments, /\bmutation\b/u);
});

function extractGraphqlDocuments(source) {
  return [...source.matchAll(/`#graphql([\s\S]*?)`/gu)].map((match) => match[1]);
}
