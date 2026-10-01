import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  join(process.cwd(), "app/features/orders/orders-page.jsx"),
  "utf8",
);

function evaluateFunction(name) {
  const declaration = source.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(declaration, `${name} must be exported for interaction regression coverage`);
  return vm.runInNewContext(`(${declaration.replace("export ", "")})`);
}

test("active URL filters seed visible controls and picker additions persist", () => {
  const getActiveKeys = evaluateFunction("getActiveOrderFilterKeys");
  const updateVisibleKeys = evaluateFunction("updateVisibleOrderFilterKeys");

  const initial = Array.from(getActiveKeys({
    deliveryArea: "Toronto",
    deliveryDate: "",
    deliveryState: "unplanned",
    deliveryWeekday: "",
    orderedDateFrom: "2026-09-01",
    orderedDateTo: "2026-09-08",
    serviceType: "",
  }));
  assert.deepEqual(initial, ["orderedDate", "deliveryArea", "deliveryState"]);

  const withType = Array.from(updateVisibleKeys(initial, "serviceType", true));
  const withSecondType = Array.from(updateVisibleKeys(withType, "deliveryDate", true));
  assert.deepEqual(withSecondType, [
    "orderedDate",
    "deliveryArea",
    "deliveryState",
    "serviceType",
    "deliveryDate",
  ]);
  assert.deepEqual(
    Array.from(updateVisibleKeys(withSecondType, "serviceType", false)),
    ["orderedDate", "deliveryArea", "deliveryState", "deliveryDate"],
  );
});

test("Add filter uses native menu rows while value controls render in the page row", () => {
const bar = readFileSync(join(process.cwd(), "app/features/orders/order-filter-bar.jsx"), "utf8"); assert.match(source, /<OrderFilterBar/); assert.match(bar, /<s-menu\s+id="orders-v2-add-filter"/); assert.match(bar, /groups.map\(\(?group\)? =>/); assert.doesNotMatch(source, /<OrderFilterMenu/);
});

test("Orders rows no longer render Area or Payment cells", () => {
  const rowsStart = source.indexOf("{tableOrders.map((order) => {");
  const rowsEnd = source.indexOf("</tbody>", rowsStart);
  assert.ok(rowsStart >= 0 && rowsEnd > rowsStart);
  const rowsSource = source.slice(rowsStart, rowsEnd);

  assert.doesNotMatch(rowsSource, /areaPill|Area details|Edit delivery area/);
  assert.doesNotMatch(rowsSource, /paymentPillDetails|Payment details|formatOrderPaymentState/);
});


test("day filter controls restore their service category and replace the opposite day control", () => {
  const getActiveKeys = evaluateFunction("getActiveOrderFilterKeys");
  const updateVisibleKeys = evaluateFunction("updateVisibleOrderFilterKeys");
  assert.deepEqual(Array.from(getActiveKeys({ deliveryWeekday: "THURSDAY", serviceCategory: "DELIVERY" })), ["deliveryWeekday"]);
  assert.deepEqual(Array.from(getActiveKeys({ deliveryWeekday: "THURSDAY", serviceCategory: "PICKUP" })), ["pickupWeekday"]);
  assert.deepEqual(Array.from(getActiveKeys({ serviceCategory: "PICKUP" })), ["pickupWeekday"]);
  assert.deepEqual(Array.from(updateVisibleKeys(["deliveryDate", "deliveryWeekday"], "pickupWeekday", true)), ["deliveryDate", "pickupWeekday"]);
  assert.deepEqual(Array.from(updateVisibleKeys(["deliveryDate", "pickupWeekday"], "deliveryWeekday", true)), ["deliveryDate", "deliveryWeekday"]);
  assert.deepEqual(Array.from(updateVisibleKeys(["deliveryDate", "pickupWeekday"], "pickupWeekday", false)), ["deliveryDate"]);
});

test("service-specific day filters live in Add filter without a standalone category toggle", () => {
const bar = readFileSync(join(process.cwd(), "app/features/orders/order-filter-bar.jsx"), "utf8"); assert.match(bar, /renderChoices\(\s*"scheduledWeekdays"/); assert.doesNotMatch(bar, /serviceCategory|pickupWeekday/);
});
