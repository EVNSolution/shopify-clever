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

test("Add filter popover lists filter types while value controls render in the page row", () => {
  assert.match(source, /<s-popover id="orders-filter-popover" inlineSize="240px">/);
  assert.match(source, /aria-label="Order filter types" role="menu" style=\{orderFilterTypeListStyle\}/);
  assert.match(source, /availableOrderFilterTypes\.map\(\(filterType\) =>/);
  assert.match(source, /commandFor="orders-filter-popover"[\s\S]*command="--hide"/);

  const popoverStart = source.indexOf('<s-popover id="orders-filter-popover"');
  const popoverEnd = source.indexOf("</s-popover>", popoverStart);
  const activeRowStart = source.indexOf('aria-label="Active order filters"', popoverEnd);
  assert.ok(popoverStart >= 0 && popoverEnd > popoverStart && activeRowStart > popoverEnd);

  const popoverSource = source.slice(popoverStart, popoverEnd);
  assert.doesNotMatch(popoverSource, /<OrderFilterMenu|handleOrderedDateCalendarOpen/);
  assert.match(source.slice(activeRowStart), /visibleOrderFilterKeys\.includes\("deliveryState"\)[\s\S]*<OrderFilterMenu/);
});

test("Orders rows no longer render Area or Payment cells", () => {
  const rowsStart = source.indexOf("{tableOrders.map((order) => {");
  const rowsEnd = source.indexOf("</tbody>", rowsStart);
  assert.ok(rowsStart >= 0 && rowsEnd > rowsStart);
  const rowsSource = source.slice(rowsStart, rowsEnd);

  assert.doesNotMatch(rowsSource, /areaPill|Area details|Edit delivery area/);
  assert.doesNotMatch(rowsSource, /paymentPillDetails|Payment details|formatOrderPaymentState/);
});
