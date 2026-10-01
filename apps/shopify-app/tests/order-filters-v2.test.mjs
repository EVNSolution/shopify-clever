import assert from "node:assert/strict";
import test from "node:test";
import process from "node:process";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  activeV2Groups,
  changeV2DateBound,
  clearV2Group,
  datePresetV2,
  getOrdersUiFilters,
  normalizeV2Filters,
  readV2Filters,
  V2_GROUPS,
  writeV2Filters,
} from "../app/features/orders/order-filters-v2.js";
import { buildOrdersResourceRequest } from "../app/features/orders/orders-resource-state.js";
import {
  fetchDeliveryOrders,
  fetchDeliveryOrdersPage,
  fetchDeliveryOrderFacets,
  fetchDeliveryOrderMapPoints,
  createDeliveryOrdersSelectionSnapshot,
} from "../app/features/delivery/orders.server.js";

const base = normalizeV2Filters({
  receivedDateFrom: "2026-10-01",
  scheduledDateFrom: "2026-10-02",
  scheduledDateTo: "2026-10-08",
  scheduledWeekdays: ["FRIDAY", "MONDAY"],
  serviceTypes: ["PICKUP", "DELIVERY"],
  deliveryProgress: ["planned"],
  fulfillmentStatuses: ["UNFULFILLED"],
  paymentStatuses: ["PENDING"],
  cancelled: false,
  areas: ["North, East", "Toronto"],
  areaMissing: true,
  search: "sample",
});
test("custom received dates preserve no scheduled date; scheduled bounds leave that mode", () => {
  const missing = normalizeV2Filters({
    scheduledDateMissing: true,
    serviceTypes: ["PICKUP"],
    paymentStatuses: ["PENDING"],
    cancelled: false,
  });
  const received = changeV2DateBound(missing, "received", "From", "2026-10-01");
  assert.deepEqual(received, { ...missing, receivedDateFrom: "2026-10-01" });
  const scheduled = changeV2DateBound(
    received,
    "scheduled",
    "To",
    "2026-10-03",
  );
  assert.equal(scheduled.scheduledDateMissing, undefined);
  assert.equal(scheduled.scheduledDateTo, "2026-10-03");
  assert.equal(scheduled.receivedDateFrom, "2026-10-01");
  assert.deepEqual(scheduled.serviceTypes, missing.serviceTypes);
  assert.deepEqual(scheduled.paymentStatuses, missing.paymentStatuses);
  assert.equal(scheduled.cancelled, "false");
  const reversed = changeV2DateBound(received, "received", "To", "2026-09-29");
  assert.equal(reversed.receivedDateFrom, "2026-09-29");
  assert.equal(reversed.receivedDateTo, "2026-10-01");
  assert.equal(reversed.scheduledDateMissing, "true");
  assert.equal(
    changeV2DateBound(received, "received", "From", "").receivedDateFrom,
    undefined,
  );
});
test("each chip removes only its dimension; no weekday or service side effects", () => {
  for (const group of Object.keys(V2_GROUPS)) {
    const result = clearV2Group(base, group);
    for (const key of V2_GROUPS[group]) assert.equal(result[key], undefined);
    for (const key of Object.keys(base).filter(
      (key) => !V2_GROUPS[group].includes(key),
    ))
      assert.deepEqual(result[key], base[key]);
  }
  const selected = normalizeV2Filters({
    ...base,
    serviceTypes: ["EVENING_DELIVERY"],
  });
  assert.deepEqual(selected.scheduledWeekdays, base.scheduledWeekdays);
  assert.deepEqual(
    normalizeV2Filters({ ...base, scheduledWeekdays: ["SUNDAY"] }).serviceTypes,
    base.serviceTypes,
  );
});
test("missing schedule is exclusive, presets use supplied store dates, ranges include endpoints", () => {
  const noDate = datePresetV2(base, "scheduled", "missing", "2026-10-01");
  assert.equal(noDate.scheduledDateMissing, "true");
  assert.equal(noDate.scheduledWeekdays, undefined);
  assert.equal(noDate.scheduledDateFrom, undefined);
  assert.deepEqual(noDate.serviceTypes, base.serviceTypes);
  const last = datePresetV2(base, "received", "last7", "2026-10-01");
  assert.equal(last.receivedDateFrom, "2026-09-25");
  assert.equal(last.receivedDateTo, "2026-10-01");
  const next = datePresetV2(base, "scheduled", "next7", "2026-10-01");
  assert.equal(next.scheduledDateTo, "2026-10-07");
  assert.deepEqual(
    normalizeV2Filters({
      receivedDateFrom: "2026-10-09",
      receivedDateTo: "2026-10-01",
    }),
    {
      filterVersion: "2",
      receivedDateFrom: "2026-10-01",
      receivedDateTo: "2026-10-09",
    },
  );
});
test("all default and clear-all return to page one while preserving Shopify navigation context", () => {
  assert.deepEqual(getOrdersUiFilters(new URLSearchParams()), {
    filterVersion: "2",
  });
  assert.deepEqual(activeV2Groups(normalizeV2Filters({})), []);
  const params = writeV2Filters(
    new URLSearchParams(
      "host=embedded&shop=fixture&view=orders&page=3&after=stale&readWatermark=old",
    ),
    normalizeV2Filters({}),
  );
  assert.equal(params.get("host"), "embedded");
  assert.equal(params.get("page"), null);
  assert.equal(params.get("after"), null);
  assert.equal(params.get("search"), null);
});
test("legacy links retain original nested State/raw weekday meaning until explicitly replaced", () => {
  const legacy = getOrdersUiFilters(
    new URLSearchParams(
      "deliveryState=planned&deliveryWeekday=MONDAY&serviceCategory=PICKUP",
    ),
  );
  assert.equal(legacy.filterVersion, undefined);
  assert.equal(legacy.deliveryState, "planned");
  assert.equal(legacy.serviceCategory, "PICKUP");
  assert.throws(() =>
    getOrdersUiFilters(new URLSearchParams("filterVersion=3")),
  );
});
test("URL and token-safe resource requests retain repeated arrays including commas in an area", () => {
  const params = writeV2Filters(new URLSearchParams(), base);
  assert.deepEqual(readV2Filters(params), base);
  for (const resource of ["page", "facets", "map", "selection"]) {
    const result = buildOrdersResourceRequest(resource, params, {
      idToken: "test-token",
      page: 1,
    });
    assert.deepEqual(result.payload.filters, base);
    assert.doesNotMatch(result.action, /test-token|Toronto/);
  }
});
test("all BFF query endpoints repeat arrays; snapshot POST preserves JSON arrays and bools", async () => {
  const previous = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example/";
  const calls = [];
  const request = new Request("https://app.example/app/orders");
  const options = {
    sessionToken: "test-token",
    fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        data: { orders: [], rows: [], facets: {}, points: [] },
        error: null,
      });
    },
  };
  try {
    for (const endpoint of [
      fetchDeliveryOrders,
      fetchDeliveryOrdersPage,
      fetchDeliveryOrderFacets,
      fetchDeliveryOrderMapPoints,
    ])
      await endpoint(request, base, options);
    await createDeliveryOrdersSelectionSnapshot(
      request,
      { filters: base },
      options,
    );
    for (const { url } of calls.slice(0, 4)) {
      const query = new URL(url).searchParams;
      assert.deepEqual(query.getAll("areas"), base.areas);
      assert.deepEqual(query.getAll("serviceTypes"), base.serviceTypes);
    }
    assert.deepEqual(JSON.parse(calls[4].options.body).filters, base);
  } finally {
    if (previous === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previous;
  }
});
test("filter bar renders eight choices, no fixed value controls, independent chips and Korean labels", async () => {
  const bundle = await build({
    entryPoints: ["app/features/orders/order-filter-bar.jsx"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
  });
  const { writeFile, unlink } = await import("node:fs/promises");
  const path = new URL("../.order-filter-bar-test.mjs", import.meta.url);
  await writeFile(path, bundle.outputFiles[0].text);
  try {
    const { OrderFilterBar } = await import(path.href);
    const render = (filters) =>
      renderToStaticMarkup(
        createElement(OrderFilterBar, {
          filters,
          language: "ko",
          today: "2026-10-01",
          onChange() {},
          onClear() {},
          buttonStyle: {},
        }),
      );
    const initial = render(normalizeV2Filters({}));
    assert.equal((initial.match(/<s-button(?: |>)/g) ?? []).length, 9);
    assert.doesNotMatch(initial, /type="date"|type="checkbox"/);
    assert.match(initial, /필터 추가/);
    const active = render(base);
    assert.match(active, /Shopify 주문 처리상태: 미처리/);
    assert.match(active, /운영 결제상태: 결제대기/);
    assert.match(active, /배차·배송 상태: 배차됨/);
    assert.match(active, /삭제: 유형/);
    assert.match(active, /모두 지우기/);
  } finally {
    await unlink(path);
  }
});
