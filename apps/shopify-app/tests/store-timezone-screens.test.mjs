/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildInventoryHistoryItems, buildInventoryProductMatrix } from "../app/features/delivery/inventory-matrix.js";
import { formatStoreInstant, formatStoreTime, getStoreDate } from "../app/features/shopify/store-date-time.js";
import { buildOrderTimelineDetails, formatOrdersResultGeneratedAt } from "../app/features/orders/orders-page.shared.js";
import { storeLocalDateTimeToIso, formatStoreLocalDateTimeInput } from "../app/features/delivery/child-route-detail-presentation.js";
import { filterOrders } from "../app/features/orders/order-filters.js";
import { mapCanonicalOrdersToOrderRows, normalizeOrderRowsStoreDates } from "../app/features/orders/canonical-orders.js";
const zone = "America/Toronto";
test("inventory history shows the store date and scheduled-date offset", () => {
  const inventory = { createdAt: "2026-01-17T03:30:00Z", orders: [{ name: "#fixture", items: [] }], lastChange: [{ createdAt: "2026-07-17T03:30:00Z", orderId: "fixture", quantityDelta: 1 }] };
  const history = buildInventoryHistoryItems(inventory, zone);
  assert.equal(history[0].title, "Initial snapshot · 2026-01-16 22:30 EST");
  assert.equal(history[1].title, "Inventory update · 2026-07-16 23:30 EDT");
});
test("inventory groups fallback instants by store day while preserving delivery dates", () => {
  const matrix = buildInventoryProductMatrix([
    { createdAt: "2026-07-17T03:30:00Z", items: [{name:"Fixture",quantity:1}] },
    { deliveryDate: "2026-07-17", createdAt: "2026-07-17T03:30:00Z", items: [{name:"Fixture",quantity:1}] }
  ], zone);
  assert.deepEqual(matrix.rows.map(r=>r.date), ["2026-07-16", "2026-07-17"]);
});
test("Routes metadata uses the app store zone rather than the UTC formatter default", () => {
  const source=readFileSync(new URL("../app/routes/app.routes.jsx",import.meta.url),"utf8");
  assert.ok(source.includes("formatRouteInstant(route.createdAt, storeTimeZone)"));
  assert.ok(source.includes("formatRouteInstant(route.updatedAt, storeTimeZone)"));
});

test("shared display and date boundaries ignore the host timezone across DST", () => {
  const originalTZ=process.env.TZ;
  try {
    for(const host of ["Asia/Seoul","America/Los_Angeles","UTC"]){
      process.env.TZ=host;
      for(const [instant,label] of [
        ["2026-07-17T03:30:00Z","2026-07-16 23:30 EDT"],
        ["2026-01-17T03:30:00Z","2026-01-16 22:30 EST"],
        ["2026-03-08T06:59:00Z","2026-03-08 01:59 EST"],
        ["2026-03-08T07:00:00Z","2026-03-08 03:00 EDT"],
        ["2026-11-01T05:30:00Z","2026-11-01 01:30 EDT"],
        ["2026-11-01T06:30:00Z","2026-11-01 01:30 EST"]
      ]){
        assert.equal(formatStoreInstant(instant,zone),label);
        assert.equal(formatStoreTime(instant,zone),label.slice(11));
        assert.equal(getStoreDate(instant,zone),label.slice(0,10));
      }
      assert.equal(getStoreDate("2026-07-17",zone),"2026-07-17");
      assert.equal(formatStoreInstant("2026-07-17",zone),"2026-07-17");
      assert.equal(formatStoreInstant("2026-07-17T03:30",zone),"—");
      assert.equal(getStoreDate("2026-02-31",zone),null);
      assert.equal(formatStoreInstant("2026-07-17T03:30Z","invalid/zone"),"—");
      const input="2026-07-16T23:30";
      const saved=JSON.parse(JSON.stringify({scheduledStartAt:storeLocalDateTimeToIso(input,zone),scheduledStartTimeZone:zone}));
      assert.equal(saved.scheduledStartAt,"2026-07-17T03:30:00.000Z");
      assert.equal(formatStoreLocalDateTimeInput(saved.scheduledStartAt,zone),input);
      assert.equal(storeLocalDateTimeToIso("2026-03-08T02:30",zone),null);
    }
  } finally { if(originalTZ===undefined)delete process.env.TZ;else process.env.TZ=originalTZ; }
});
test("order timeline and generated metadata use explicit zones with deterministic fallback", () => {
  const originalTZ=process.env.TZ;
  try {
    process.env.TZ="Asia/Seoul";
    const details=buildOrderTimelineDetails({shopTimeZone:zone,order:{orderCreatedAt:"2026-07-17T03:30Z",updatedAt:"2026-07-17T04:10Z"}});
    assert.ok(details.some(v=>v.includes("2026-07-16")&&v.includes("23:30")));
    assert.ok(details.some(v=>v.includes("Updated")&&v.includes("2026-07-17")&&v.includes("00:10")));
    assert.ok(formatOrdersResultGeneratedAt("2026-07-17T03:30Z",zone).includes("2026-07-16"));
    assert.ok(formatOrdersResultGeneratedAt("2026-07-17T03:30Z",null).includes("03:30"));
  } finally { if(originalTZ===undefined)delete process.env.TZ;else process.env.TZ=originalTZ; }
});

test("order date filters include the store midnight boundary and preserve date-only input", () => {
  const rows=[
    {id:"before", orderedDate:getStoreDate("2026-07-17T03:59:00Z",zone)},
    {id:"after", orderedDate:getStoreDate("2026-07-17T04:00:00Z",zone)}
  ];
  assert.deepEqual(filterOrders(rows,{scope:"history",tab:"all",orderedDate:"2026-07-16"}).map(r=>r.id),["before"]);
  assert.deepEqual(filterOrders(rows,{scope:"history",tab:"all",orderedDate:"2026-07-17"}).map(r=>r.id),["after"]);
});

test("canonical and legacy order fallback dates use the store boundary without replacing business dates", () => {
  const [canonical] = mapCanonicalOrdersToOrderRows([{orderCreatedAt:"2026-07-17T03:30Z"}],zone);
  assert.equal(canonical.orderedDate,"2026-07-16");
  const [legacy] = normalizeOrderRowsStoreDates([{orderedDate:"2026-07-17",rawPayload:{createdAt:"2026-07-17T03:30Z"}}],zone);
  assert.equal(legacy.orderedDate,"2026-07-16");
  const [business] = mapCanonicalOrdersToOrderRows([{orderDateLocal:"2026-07-17",orderCreatedAt:"2026-07-17T03:30Z"}],zone);
  assert.equal(normalizeOrderRowsStoreDates([business],zone)[0].orderedDate,"2026-07-17");
});

test("notification history renders event instants in the shared store zone", () => {
  const source=readFileSync(new URL("../app/routes/app.routes.$routeId.jsx",import.meta.url),"utf8");
  const start=source.indexOf("function formatCustomerEmailHistory(");
  const end=source.indexOf("\nfunction ",start+1);
  const format=Function("formatStoreInstant","numberOrUndefined","textOrUndefined",source.slice(start,end)+"; return formatCustomerEmailHistory;")(formatStoreInstant,v=>v==null?undefined:Number(v),v=>v==null?undefined:String(v).trim());
  const result=format({sendCount:1,lastProviderEventAt:"2026-07-17T03:30Z",lastSentAt:"2026-01-17T03:30Z"},zone);
  assert.equal(result,"1 previous send - 2026-07-16 23:30 EDT - 2026-01-16 22:30 EST");
});

test("inventory groups raw processed instants while preserving the API legacy calendar field", () => {
  const matrix=buildInventoryProductMatrix([{processedAt:"2026-07-17",processedAtInstant:"2026-07-17T03:30Z",items:[{name:"Fixture",quantity:1}]}],zone);
  assert.equal(matrix.rows[0].date,"2026-07-16");
});
