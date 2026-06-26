import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const seedSource = readFileSync(
  join(root, "scripts/seed-shopify-demo-data.mjs"),
  "utf8",
);

test("CLEVER demo seed orders use unique stop addresses instead of repeated unit suffixes", () => {
  const quotedAddressValues = [
    ...seedSource.matchAll(/address1:\s*"([^"]+)"/g),
  ].map((match) => match[1]);

  assert.match(seedSource, /addressStops:\s*\[/);
  assert.match(seedSource, /function addressStopForOrder\(area, orderIndex\)/);
  assert.match(seedSource, /const addressStop = addressStopForOrder\(area, index\)/);
  assert.match(seedSource, /address1:\s*addressStop\.address1/);
  assert.match(seedSource, /city:\s*addressStop\.city/);
  assert.match(seedSource, /zip:\s*addressStop\.zip/);
  assert.match(seedSource, /provinceCode:\s*addressStop\.provinceCode/);
  assert.equal(quotedAddressValues.length, 30);
  assert.equal(new Set(quotedAddressValues).size, quotedAddressValues.length);
  assert.doesNotMatch(seedSource, /address1:\s*`\$\{area\.address1\} #/);
});

test("CLEVER demo seed leaves phone out to avoid Shopify test-number validation", () => {
  assert.doesNotMatch(seedSource, /phoneSuffix/);
  assert.doesNotMatch(seedSource, /phone:\s*customer\.phone/);
});

test("CLEVER demo seed products carry the concrete delivery batch range", () => {
  assert.match(seedSource, /const seedNow = new Date\(/);
  assert.match(seedSource, /const deliveryBatch = getDeliveryBatchForSeed\(seedNow\)/);
  assert.match(seedSource, /function formatDeliveryBatchRange\(batch\) \{/);
  assert.match(seedSource, /title: `CLEVER \$\{category\} \$\{String\(number\)\.padStart\(2, "0"\)\} \$\{deliveryBatch\.label\} \$\{runId\}`/);
});

test("CLEVER demo seed orders stay inside order-level weekday attributes", () => {
  assert.doesNotMatch(seedSource, /deliveryDay: "Wednesday"/);
  assert.doesNotMatch(seedSource, /5pm to 9pm/);
  assert.doesNotMatch(seedSource, /Delivery Batch/);
});
