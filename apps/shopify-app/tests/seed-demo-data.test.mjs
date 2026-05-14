import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const seedSource = readFileSync(
  join(root, "scripts/seed-shopify-demo-data.mjs"),
  "utf8",
);

test("Tomatono demo seed orders use unique stop addresses instead of repeated unit suffixes", () => {
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

test("Tomatono demo seed customer phones are unique per seed run", () => {
  assert.match(seedSource, /const phoneSuffix = String\(\(Number\(runId\.slice\(-4\)\) \+ number\) % 10000\)\.padStart\(4, "0"\)/);
  assert.match(seedSource, /const phone = `\+1416555\$\{phoneSuffix\}`/);
  assert.doesNotMatch(seedSource, /const phone = `\+1416555\$\{String\(number\)\.padStart\(4, "0"\)\}`/);
});

test("Tomatono demo seed products carry the concrete delivery batch range", () => {
  assert.match(seedSource, /const seedNow = new Date\(/);
  assert.match(seedSource, /const deliveryBatch = getDeliveryBatchForSeed\(seedNow\)/);
  assert.match(seedSource, /function formatDeliveryBatchRange\(batch\) \{/);
  assert.match(seedSource, /title: `Tomatono \$\{category\} \$\{String\(number\)\.padStart\(2, "0"\)\} \$\{deliveryBatch\.label\} \$\{runId\}`/);
});

test("Tomatono demo seed orders stay inside order-level weekday attributes", () => {
  assert.doesNotMatch(seedSource, /deliveryDay: "Wednesday"/);
  assert.doesNotMatch(seedSource, /5pm to 9pm/);
  assert.doesNotMatch(seedSource, /Delivery Batch/);
});
