import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ORDER_SERVICE_TYPE_OPTIONS,
  getOrderDeliveryDateFilterOptions,
  getOrderFilterOptions,
  getServerOrderFilterOptions,
} from "../app/features/orders/order-filters.js";

test("server delivery date options are newest first and retain counts without mutating facets", () => {
  const facets = { deliveryDates: [
    { value: "2026-07-02", count: 22 },
    { value: "2026-08-15", count: 37 },
    { value: "2026-07-18", count: 35 },
    { value: "2026-09-12", count: 51 },
    { value: "2025-12-31", count: 2 },
  ] };
  const original = structuredClone(facets);
  assert.deepEqual(getServerOrderFilterOptions(facets).deliveryDates, [
    { value: "2026-09-12", count: 51 },
    { value: "2026-08-15", count: 37 },
    { value: "2026-07-18", count: 35 },
    { value: "2026-07-02", count: 22 },
    { value: "2025-12-31", count: 2 },
  ]);
  assert.deepEqual(facets, original);
});

test("server and fallback date options keep the same pending-first ordering", () => {
  const rows = [{ deliveryDate: "2026-09-03" }, {}, { deliveryDate: "2026-09-12" }];
  const deliveryDates = [
    { value: "2026-09-03", count: 1 },
    { value: "pending", count: 1 },
    { value: "2026-09-12", count: 1 },
  ];
  assert.deepEqual(
    getServerOrderFilterOptions({ deliveryDates }).deliveryDates,
    getOrderDeliveryDateFilterOptions(rows),
  );
});

test("server areas use the same alphabetical order as fallback options", () => {
  const areas = ["Vaughan", "Zone 10", "Hamilton", "North York", "Zone 2", "aurora"];
  assert.deepEqual(
    getServerOrderFilterOptions({ deliveryAreas: areas.map(value => ({ value, count: 1 })) }).deliveryAreas,
    getOrderFilterOptions(areas.map(deliveryArea => ({ deliveryArea }))).deliveryAreas,
  );
});

test("facet normalization retains legacy strings and handles absent or malformed arrays", () => {
  assert.deepEqual(getServerOrderFilterOptions(null), {
    deliveryAreas: [], deliveryDates: [], deliveryStates: [], deliveryWeekdays: [], serviceTypes: [],
  });
  assert.deepEqual(getServerOrderFilterOptions({ deliveryDates: [null, {}, "", "2026-09-12", { value: "2026-09-03", count: "18" }] }).deliveryDates, [
    { value: "2026-09-12", count: 0 }, { value: "2026-09-03", count: 18 },
  ]);
});

test("filter menus receive the accessible labels their component consumes", () => {
const source = readFileSync(new URL("../app/features/orders/order-filter-bar.jsx", import.meta.url), "utf8"); assert.match(source, /role="dialog"\s+aria-label=/); assert.match(source, /aria-label=.*local\("Remove"/);
});

test("service type filter exposes regular and evening delivery as distinct choices", () => {
assert.deepEqual(ORDER_SERVICE_TYPE_OPTIONS.map(option => option.value), ["DELIVERY", "EVENING_DELIVERY", "PICKUP"]);
});
