/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";
import { mapCanonicalOrdersToOrderRows, normalizeOrderRowsStoreDates } from "../app/features/orders/canonical-orders.js";
import { mapShopifyOrdersResponse } from "../app/features/orders/shopify-orders.server.js";
import { filterOrders } from "../app/features/orders/order-filters.js";
import { buildOrderTimelineDetails } from "../app/features/orders/orders-page.shared.js";

const zone = "America/Toronto";
const fixture = (processedAt, createdAt) => ({ id: "gid://shopify/Order/fixture", orderId: "fixture", name: "#fixture", processedAt, createdAt,
  orderCreatedAt: createdAt, orderDateLocal: "2026-10-06", displayFinancialStatus: "PENDING", displayFulfillmentStatus: "UNFULFILLED" });
function rows(order) {
  const canonical = mapCanonicalOrdersToOrderRows([order], zone)[0];
  const legacy = normalizeOrderRowsStoreDates(mapShopifyOrdersResponse({ data: { orders: { edges: [{ node: order }] } } }), zone)[0];
  return [canonical, legacy];
}
test("Order Date follows the received source timestamp even when Shopify creation and DB import are later", () => {
  const order = { ...fixture("2026-10-07T02:00:00Z", "2026-10-08T18:00:00Z"), dbCreatedAt: "2026-10-09T18:00:00Z" };
  for (const row of rows(order)) {
    assert.equal(row.orderedDate, "2026-10-06");
    assert.equal(filterOrders([row], { scope: "history", tab: "all", orderedDateFrom: "2026-10-06", orderedDateTo: "2026-10-06" }).length, 1);
    assert.ok(buildOrderTimelineDetails({ order: row, shopTimeZone: zone }).includes("Ordered: 2026-10-06, 22:00"));
  }
});
test("the former failing fixture uses the Shopify order date, not stale createdAt-derived orderDateLocal", () => {
  for (const row of rows(fixture("2026-10-07T18:00:00Z", "2026-10-07T02:00:00Z"))) {
    assert.equal(row.orderedDate, "2026-10-07");
    assert.equal(filterOrders([row], { scope: "history", tab: "all", orderedDate: "2026-10-06" }).length, 0);
    assert.equal(filterOrders([row], { scope: "history", tab: "all", orderedDate: "2026-10-07" }).length, 1);
  }
});
for (const [date, before, start, end] of [
  ["2026-07-14", "2026-07-14T03:59:59.999Z", "2026-07-14T04:00:00Z", "2026-07-15T04:00:00Z"],
  ["2026-01-13", "2026-01-13T04:59:59.999Z", "2026-01-13T05:00:00Z", "2026-01-14T05:00:00Z"],
  ["2026-03-08", "2026-03-08T04:59:59.999Z", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"],
  ["2026-11-01", "2026-11-01T03:59:59.999Z", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"],
]) test(`received-day ${date} boundaries ignore browser timezone, creation and delayed import`, () => {
  const original = process.env.TZ;
  try {
    for (const host of ["UTC", "Asia/Seoul", "America/Los_Angeles"]) {
      process.env.TZ = host;
      const received = [before, start, new Date(new Date(end).getTime() - 1).toISOString(), end];
      for (const [index, instant] of received.entries()) for (const row of rows(fixture(instant, "2026-10-20T12:00:00Z"))) {
        assert.equal(filterOrders([row], { scope: "history", tab: "all", orderedDate: date }).length, index === 1 || index === 2 ? 1 : 0);
      }
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
test("unknown source date never becomes a database import or creation date", () => {
  const [row] = mapCanonicalOrdersToOrderRows([{ ...fixture(null, "2026-10-07T02:00:00Z"), createdAt: "2026-10-09T18:00:00Z" }], zone);
  assert.equal(row.orderedDate, undefined);
  assert.equal(normalizeOrderRowsStoreDates([row], zone)[0].orderedDate, undefined);
  assert.equal(filterOrders([row], { scope: "history", tab: "all", orderedDate: "2026-10-06" }).length, 0);
  assert.equal(mapCanonicalOrdersToOrderRows([{ createdAt: "2026-10-09T18:00:00Z" }], zone)[0].orderedDate, undefined);
  assert.equal(buildOrderTimelineDetails({ order: { createdAt: "2026-10-09T18:00:00Z" }, shopTimeZone: zone }).some((detail) => detail.startsWith("Ordered:")), false);
});
