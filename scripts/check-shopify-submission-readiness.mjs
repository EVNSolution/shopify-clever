#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const repoRoot = process.cwd();
const failures = [];
const checks = [];

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function ok(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function match(path, pattern, name) {
  const source = read(path);
  ok(name, pattern.test(source), `${path} missing ${pattern}`);
}

function parsePngDimensions(path) {
  const buffer = readFileSync(join(repoRoot, path));
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function requireFile(path, name = path) {
  ok(name, existsSync(join(repoRoot, path)), `${path} must exist`);
}

requireFile("skills-lock.json", "Shopify AI Toolkit lockfile exists");
requireFile(".agents/skills/shopify-app-store-review/SKILL.md", "shopify-app-store-review skill installed");
requireFile(".agents/skills/shopify-use-shopify-cli/SKILL.md", "shopify-use-shopify-cli skill installed");
match("skills-lock.json", /Shopify\/shopify-ai-toolkit/, "skills-lock references Shopify AI Toolkit");

match("apps/shopify-app/app/root.jsx", /<meta name="shopify-api-key" content=\{shopifyApiKey\} \/>/, "root renders Shopify API key meta");
match("apps/shopify-app/app/root.jsx", /https:\/\/cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/, "root renders App Bridge CDN script");

const appConfig = read("apps/shopify-app/shopify.app.toml");
ok("Shopify app URL is production HTTPS", /application_url = "https:\/\/clever-admin\./.test(appConfig));
ok("Shopify app is embedded", /embedded = true/.test(appConfig));
ok("Shopify compliance webhooks configured", /compliance_topics = \["customers\/data_request", "customers\/redact", "shop\/redact"\]/.test(appConfig));
ok("Shopify scopes remain minimal", /scopes = "read_orders,read_locations"/.test(appConfig));

requireFile("docs/shopify-protected-customer-data-field-map.md", "protected customer data field map exists");
match("docs/shopify-protected-customer-data-field-map.md", /Do \*\*not\*\* request customer email/, "protected data map excludes email for current release");
match("docs/shopify-protected-customer-data-field-map.md", /read_orders,read_locations/, "protected data map records minimal scopes");

const embeddedOrdersQuerySource = read("apps/shopify-app/app/features/orders/shopify-orders.server.js");
ok("embedded Shopify order query does not request email", !/\bemail\b/.test(embeddedOrdersQuerySource), "apps/shopify-app/app/features/orders/shopify-orders.server.js");
ok("embedded Shopify order query does not request customer object", !/customer\s*\{/.test(embeddedOrdersQuerySource), "apps/shopify-app/app/features/orders/shopify-orders.server.js");
const deliveryOrdersQuerySource = read("apps/delivery-api/src/modules/shopify/order-sync.query.ts");
ok("delivery Shopify order sync query does not request email", !/\bemail\b/.test(deliveryOrdersQuerySource), "apps/delivery-api/src/modules/shopify/order-sync.query.ts");
ok("delivery Shopify order sync query does not request customer object", !/customer\s*\{/.test(deliveryOrdersQuerySource), "apps/delivery-api/src/modules/shopify/order-sync.query.ts");
ok("Shopify app config does not request read_customers", !/read_customers/.test(appConfig), "apps/shopify-app/shopify.app.toml");
ok("Shopify app config does not request read_all_orders", !/read_all_orders/.test(appConfig), "apps/shopify-app/shopify.app.toml");

match("apps/shopify-app/app/routes/webhooks.compliance.jsx", /authenticate\.webhook\(requestForAuth\)/, "compliance route authenticates Shopify webhook clone");
match("apps/shopify-app/app/routes/webhooks.compliance.jsx", /forwardComplianceWebhookToDeliveryApi\(request, rawBody\)/, "compliance route forwards raw body to delivery API");
match("apps/delivery-api/src/modules/shopify/webhook-event.repository.ts", /customers\/redact/, "delivery repository handles customers/redact");
match("apps/delivery-api/src/modules/shopify/webhook-event.repository.ts", /shop\/redact/, "delivery repository handles shop/redact");

const iconPath = "docs/shopify-app-store-assets/clever-app-icon-1200.png";
requireFile(iconPath, "prepared Shopify App Store icon exists");
const dimensions = existsSync(join(repoRoot, iconPath)) ? parsePngDimensions(iconPath) : null;
ok("prepared Shopify App Store icon is 1200x1200 PNG", dimensions?.width === 1200 && dimensions?.height === 1200, dimensions ? `${dimensions.width}x${dimensions.height}` : "not a PNG");
requireFile("docs/shopify-app-store-assets/screenshot-and-screencast-shotlist.md", "listing media shotlist exists");
match("docs/shopify-app-store-assets/screenshot-and-screencast-shotlist.md", /1600 × 900 px/, "shotlist records screenshot dimensions");
match("docs/shopify-app-store-assets/screenshot-and-screencast-shotlist.md", /Privacy guardrails/, "shotlist records privacy guardrails");

requireFile("docs/shopify-privacy-policy-draft.md", "standalone privacy policy draft exists");
match("docs/shopify-privacy-policy-draft.md", /Do not publish this draft until every bracketed placeholder is replaced/, "privacy draft has publication warning");
match("docs/shopify-privacy-policy-draft.md", /\[LEGAL COMPANY NAME\]/, "privacy draft keeps legal company placeholder explicit");
match("docs/shopify-privacy-policy-draft.md", /\[SUPPORT EMAIL\]/, "privacy draft keeps support email placeholder explicit");

requireFile("docs/shopify-app-store-listing-draft.md", "standalone App Store listing draft exists");
const listingDraft = read("docs/shopify-app-store-listing-draft.md");
ok("listing draft uses clever app name", /```text\nclever\n```/.test(listingDraft), "docs/shopify-app-store-listing-draft.md");
ok("listing draft includes factual route-planning subtitle", /Plan local delivery routes from Shopify orders/.test(listingDraft), "docs/shopify-app-store-listing-draft.md");

requireFile("docs/shopify-dashboard-submission-evidence-template.md", "dashboard submission evidence template exists");
const dashboardEvidenceTemplate = read("docs/shopify-dashboard-submission-evidence-template.md");
for (const phrase of [
  "Protected customer data request evidence",
  "Privacy policy publication evidence",
  "Listing copy evidence",
  "Pricing evidence",
  "Media evidence",
  "Contact and reviewer evidence",
  "Automated checks evidence",
  "Final Submit for Review evidence",
  "EVNSolution/shopify-clever#6",
  "EVNSolution/clever-change-control#211",
  "chg-20260514-001"
]) {
  ok(`dashboard evidence template includes ${phrase}`, dashboardEvidenceTemplate.includes(phrase), "docs/shopify-dashboard-submission-evidence-template.md");
}

const listingCopyBlocks = [...listingDraft.matchAll(/```text\n([\s\S]*?)```/g)]
  .map((match) => match[1])
  .join("\n");
const unsupportedListingClaimPatterns = [
  /guaranteed?/i,
  /#\s*1/i,
  /best[-\s]in[-\s]class/i,
  /official\s+Shopify/i,
  /Shopify\s+official/i,
  /endorsed\s+by\s+Shopify/i,
  /certified\s+by\s+Shopify/i,
  /increase\s+revenue/i,
  /save\s+money/i
];
for (const pattern of unsupportedListingClaimPatterns) {
  ok(`listing copy avoids unsupported claim ${pattern}`, !pattern.test(listingCopyBlocks), "docs/shopify-app-store-listing-draft.md");
}

const currentVersion = "compliance-20260514-0d05a46";
const currentVersionId = "gid://shopify/Version/963177807873";
const currentCi = "25852472566";
const currentProductionBundleCommit = "b64fa2c8ebcf0bf5cb6e9eebc04450e557fa9d01";
const currentReadinessCi = "25856119836";
const currentProductionWorkflow = "25856190483";
const currentReadinessCheckCount = "91";
const targetTrackingIssue = "EVNSolution/shopify-clever#6";
const changeControlIssue = "EVNSolution/clever-change-control#211";
const changeId = "chg-20260514-001";
for (const path of [
  "docs/shopify-app-store-approval-report.md",
  "docs/shopify-partner-dashboard-submission-packet.md",
  "docs/shopify-app-store-completion-audit.md",
]) {
  const source = read(path);
  ok(`${basename(path)} references current Shopify version`, source.includes(currentVersion), path);
  ok(`${basename(path)} references current version ID or CI`, source.includes(currentVersionId) || source.includes(currentCi), path);
  ok(`${basename(path)} references current production bundle commit`, source.includes(currentProductionBundleCommit), path);
  ok(`${basename(path)} references current readiness CI`, source.includes(currentReadinessCi), path);
  ok(`${basename(path)} references current production workflow`, source.includes(currentProductionWorkflow), path);
  ok(`${basename(path)} references target tracking issue`, source.includes(targetTrackingIssue), path);
  ok(`${basename(path)} references change-control issue`, source.includes(changeControlIssue), path);
  ok(`${basename(path)} references change id`, source.includes(changeId), path);
}

for (const path of [
  "docs/shopify-app-store-approval-report.md",
  "docs/shopify-dashboard-submission-evidence-template.md",
]) {
  const source = read(path);
  ok(`${basename(path)} references current readiness check count`, source.includes(`${currentReadinessCheckCount} checks`), path);
}

const staleNeedles = ["approval-20260514-174cfcc", "963140550657"];
for (const path of [
  "docs/shopify-app-store-approval-report.md",
  "docs/shopify-partner-dashboard-submission-packet.md",
  "docs/shopify-app-store-completion-audit.md",
  "docs/shopify-dashboard-submission-evidence-template.md",
]) {
  const source = read(path);
  for (const needle of staleNeedles) {
    ok(`${basename(path)} has no stale ${needle}`, !source.includes(needle), path);
  }
}

const remainingBlockers = read("docs/shopify-app-store-completion-audit.md");
ok("completion audit keeps Partner Dashboard blockers explicit", /Submit protected customer data/.test(remainingBlockers) && /Submit for Review/.test(remainingBlockers));

if (failures.length > 0) {
  console.error("shopify-submission-readiness-failed");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("shopify-submission-readiness-ok");
console.log(JSON.stringify({ checks: checks.length, currentVersion, icon: iconPath }, null, 2));
