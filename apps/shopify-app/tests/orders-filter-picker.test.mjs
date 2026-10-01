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

test("active chips precede Add filter and each chip anchors its own progressive panel", () => {
  const bar = readFileSync(join(process.cwd(), "app/features/orders/order-filter-bar.jsx"), "utf8");
  assert.ok(bar.indexOf("groups.map") < bar.indexOf('commandFor="orders-v2-add-filter"'));
  assert.match(bar, /openEditor\(group, event\.currentTarget\)/);
  assert.match(bar, /addFilterPositionAnchor = useRef\(null\)/);
  assert.match(bar, /ref=\{addFilterPositionAnchor\}/);
  assert.match(
    bar,
    /openEditor\(\s*group,\s*addFilterAnchor\.current,\s*addFilterPositionAnchor\.current,?\s*\)/,
  );
  assert.match(bar, /onChange\(\{ \.\.\.filters, search: undefined \}\)/);
  assert.doesNotMatch(bar, /addEventListener\("scroll", positionPanel, true\)/);
  assert.doesNotMatch(bar, /window\.innerHeight - 400/);
  assert.match(bar, /requestAnimationFrame\(\(\) => addFilterAnchor\.current\?\.focus\(\{ preventScroll: true \}\)\)/);
  assert.match(bar, /if \(!isV2\) \{/);
  assert.match(bar, /const \[draftFilters, setDraftFilters\] = useState/);
  assert.match(bar, /applyAndClose\(\s*datePresetV2\(\s*draftFilters/);
  assert.match(bar, /changeV2DateRange\(\s*draftFilters/);
  assert.match(bar, /applyAndClose\(draftFilters\)/);
  assert.match(bar, /local\("Add filter", "필터 추가"\)/);
  assert.match(bar, /weekdayOpen \|\| scheduledWeekdaysChanged/);
  assert.match(bar, /<s-date-picker/);
  assert.match(bar, /type="range"/);
  assert.match(bar, /changeV2DateRange/);
  assert.doesNotMatch(bar, /type="date"/);
  assert.doesNotMatch(bar, /\["custom", "Custom", "직접 선택"\]/);
  assert.match(bar, /<details/);
  assert.match(bar, /Clear filter/);
  assert.match(bar, /No areas available/);
  assert.doesNotMatch(bar, /CLEVER payment corrections take priority/);
  assert.doesNotMatch(bar, /Pickup period ended does not confirm collection/);
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


test("filter panels use document coordinates inside the embedded scroll surface", () => {
  const bar = readFileSync(join(process.cwd(), "app/features/orders/order-filter-bar.jsx"), "utf8");
  const positionSource = bar.match(/const panelPosition = ([\s\S]*?);\n {2}const openEditor/)?.[1];
  assert.ok(positionSource);
  const positionPanel = vm.runInNewContext(`(${positionSource})`, {
    window: {
      innerWidth: 1000,
      innerHeight: 720,
      scrollX: 41,
      scrollY: 900,
    },
  });
  const above = positionPanel({ getBoundingClientRect: () => ({ left: 30, top: 620, bottom: 650 }) });
  assert.equal(above.left, 71);
  assert.equal(above.top, 1514);
  assert.equal(above.transform, "translateY(-100%)");
  assert.equal(620 + 900 - above.top, 6);
  const below = positionPanel({ getBoundingClientRect: () => ({ left: 30, top: 200, bottom: 230 }) });
  assert.equal(below.left, 71);
  assert.equal(below.top, 1136);
  assert.equal(below.transform, undefined);
  assert.equal(below.top - (230 + 900), 6);

  const displayContentsHost = positionPanel({
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0 }),
  });
  const layoutWrapper = positionPanel({
    getBoundingClientRect: () => ({ left: 396, top: 344, bottom: 372 }),
  });
  assert.equal(displayContentsHost.top, 906);
  assert.equal(layoutWrapper.left, 437);
  assert.equal(layoutWrapper.top, 1278);
  assert.notEqual(layoutWrapper.top, displayContentsHost.top);
  assert.match(bar, /position:\s*"absolute"/);
  assert.doesNotMatch(bar, /addEventListener\("scroll", positionPanel, true\)/);
});
