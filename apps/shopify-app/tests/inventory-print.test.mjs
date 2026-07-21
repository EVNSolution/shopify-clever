import assert from "node:assert/strict";
import test from "node:test";

import { getInventoryPrintTextLineCount } from "../app/features/delivery/inventory-print.js";

test("inventory print line estimates count explicit lines and wide customer-note characters", () => {
  assert.equal(getInventoryPrintTextLineCount(null), 0);
  assert.equal(getInventoryPrintTextLineCount("Call before arrival."), 1);
  assert.equal(getInventoryPrintTextLineCount("First line\nSecond line"), 2);
  assert.equal(getInventoryPrintTextLineCount("가".repeat(45)), 2);
  assert.equal(getInventoryPrintTextLineCount("a".repeat(89)), 2);
  assert.equal(getInventoryPrintTextLineCount("1234567890", 5), 2);
});
