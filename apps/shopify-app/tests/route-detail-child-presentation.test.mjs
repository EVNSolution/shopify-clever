/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  CHILD_ROUTE_ORDER_COLUMNS,
  buildChildActualArrivalByStopId,
  buildChildRouteAmounts,
  buildChildRouteOrderRows,
  buildRouteEndpointPresentation,
  buildRouteOrderRows,
  summarizeChildRouteMoney,
  formatChildDriveTimeLabel,
  formatChildEtaLabel,
  formatChildOrderStatus,
  formatChildStopTimeLabel,
  formatStoreLocalDateTimeInput,
  formatStoreLocalOrderDate,
  isMaterializedChildRouteDetail,
  storeLocalDateTimeToIso,
} from "../app/features/delivery/child-route-detail-presentation.js";

test("route endpoints include service, waits, and a consistent return leg in planned arrival", () => {
  const endpoints = buildRouteEndpointPresentation({
    departureLocation: { address: "4475 Chesswood Dr" },
    executionEvidence: {
      start: { occurredAt: "2026-07-15T13:02:00.000Z" },
      completion: { occurredAt: "2026-07-15T15:30:00.000Z" },
      returnToDepot: { status: "CONFIRMED", observedAt: "2026-07-15T15:42:00.000Z" },
      routeEndMode: "RETURN_TO_DEPOT",
    },
    ianaTimezone: "America/Toronto",
    routeMetrics: { durationSeconds: 5_400 },
    routePlan: { routeEndMode: "RETURN_TO_DEPOT", scheduledStartAt: "2026-07-15T13:00:00.000Z" },
    stops: [
      { durationFromPreviousSeconds: 1_800, serviceMinutes: 10, timeWindowStart: "10:00" },
      { durationFromPreviousSeconds: 1_200, serviceMinutes: 5 },
    ],
  });

  assert.equal(endpoints.start.plannedAt, "2026-07-15T13:00:00.000Z");
  assert.equal(endpoints.start.actualAt, "2026-07-15T13:02:00.000Z");
  assert.equal(endpoints.end.plannedAt, "2026-07-15T15:15:00.000Z");
  assert.equal(endpoints.end.actualAt, "2026-07-15T15:42:00.000Z");
  assert.equal(endpoints.end.actualLabel, "Return confirmed");
  assert.equal(endpoints.end.address, "4475 Chesswood Dr");
});

test("route endpoints do not treat completion or duration-only metrics as depot arrival", () => {
  const endpoints = buildRouteEndpointPresentation({
    departureLocation: { address: "4475 Chesswood Dr" },
    executionEvidence: {
      completion: { occurredAt: "2026-07-15T15:30:00.000Z" },
      returnToDepot: { status: "UNCONFIRMED", observedAt: "2026-07-15T15:30:00.000Z" },
      routeEndMode: "RETURN_TO_DEPOT",
    },
    ianaTimezone: "America/Toronto",
    routeMetrics: { durationSeconds: 5_400 },
    routePlan: { routeEndMode: "RETURN_TO_DEPOT", scheduledStartAt: "2026-07-15T13:00:00.000Z" },
    stops: [{ serviceMinutes: 5 }],
  });

  assert.equal(endpoints.end.plannedAt, null);
  assert.equal(endpoints.end.actualAt, null);
  assert.equal(endpoints.end.actualLabel, "Unconfirmed");
});

test("route planned return is unavailable when a serviced stop has no service duration", () => {
  const endpoints = buildRouteEndpointPresentation({
    departureLocation: { address: "4475 Chesswood Dr" },
    executionEvidence: { routeEndMode: "RETURN_TO_DEPOT" },
    ianaTimezone: "America/Toronto",
    routeMetrics: { durationSeconds: 1_800 },
    routePlan: { routeEndMode: "RETURN_TO_DEPOT", scheduledStartAt: "2026-07-15T13:00:00.000Z" },
    stops: [{ durationFromPreviousSeconds: 1_200, serviceMinutes: null }],
  });

  assert.equal(endpoints.end.plannedAt, null);
});

test("route planned return tolerates rounded outbound legs by clamping a tiny negative return leg", () => {
  const endpoints = buildRouteEndpointPresentation({
    departureLocation: { address: "4475 Chesswood Dr" },
    executionEvidence: { routeEndMode: "RETURN_TO_DEPOT" },
    ianaTimezone: "America/Toronto",
    routeMetrics: { durationSeconds: 1_199.6 },
    routePlan: { routeEndMode: "RETURN_TO_DEPOT", scheduledStartAt: "2026-07-15T13:00:00.000Z" },
    stops: [{ durationFromPreviousSeconds: 1_200, serviceMinutes: 5 }],
  });

  assert.equal(endpoints.end.plannedAt, "2026-07-15T13:25:00.000Z");
});

test("current departure address is labeled only when it matches the saved depot coordinates", () => {
  const baseInput = {
    departureLocation: {
      address: "Current depot label",
      addressSource: "CURRENT_SETTING",
      currentCoordinates: [-79.38, 43.65],
      savedCoordinates: [-79.38, 43.65],
    },
    executionEvidence: { routeEndMode: "RETURN_TO_DEPOT" },
    ianaTimezone: "America/Toronto",
    routeMetrics: { durationSeconds: 1_800 },
    routePlan: { routeEndMode: "RETURN_TO_DEPOT", scheduledStartAt: "2026-07-15T13:00:00.000Z" },
    stops: [{ durationFromPreviousSeconds: 1_200, serviceMinutes: 5 }],
  };

  assert.equal(buildRouteEndpointPresentation(baseInput).start.address, "Current depot label");
  assert.equal(
    buildRouteEndpointPresentation(baseInput).start.addressTitle,
    "Current location address matched to the saved depot coordinates",
  );
  assert.equal(buildRouteEndpointPresentation({
    ...baseInput,
    departureLocation: { ...baseInput.departureLocation, currentCoordinates: [-79.4, 43.7] },
  }).start.address, "–");
});

test("route endpoints do not present a generic fallback as a saved depot address", () => {
  const endpoints = buildRouteEndpointPresentation({
    departureLocation: {
      address: "Company location",
      addressSource: "UNAVAILABLE",
      savedCoordinates: [-79.38, 43.65],
    },
    executionEvidence: { routeEndMode: "RETURN_TO_DEPOT" },
    routePlan: { routeEndMode: "RETURN_TO_DEPOT" },
  });

  assert.equal(endpoints.start.address, "–");
  assert.equal(endpoints.end.address, "–");
});

test("route endpoints require event occurrence time and default unknown end mode to depot return", () => {
  const endpoints = buildRouteEndpointPresentation({
    departureLocation: { address: "4475 Chesswood Dr" },
    executionEvidence: {
      completion: { occurredAt: "2026-07-15T15:30:00.000Z" },
      start: { receivedAt: "2026-07-15T13:02:00.000Z" },
    },
    ianaTimezone: "America/Toronto",
    routeMetrics: { durationSeconds: 1_800 },
    routePlan: { scheduledStartAt: "2026-07-15T13:00:00.000Z" },
    stops: [{ durationFromPreviousSeconds: 1_200, serviceMinutes: 5 }],
  });

  assert.equal(endpoints.start.actualAt, null);
  assert.equal(endpoints.end.address, "4475 Chesswood Dr");
  assert.equal(endpoints.end.actualAt, null);
  assert.equal(endpoints.end.plannedAt, "2026-07-15T13:35:00.000Z");
});

test("route planned arrival accepts ISO time-window starts", () => {
  const endpoints = buildRouteEndpointPresentation({
    departureLocation: { address: "4475 Chesswood Dr" },
    executionEvidence: { routeEndMode: "RETURN_TO_DEPOT" },
    ianaTimezone: "America/Toronto",
    routeMetrics: { durationSeconds: 2_400 },
    routePlan: { routeEndMode: "RETURN_TO_DEPOT", scheduledStartAt: "2026-07-15T13:00:00.000Z" },
    stops: [{
      durationFromPreviousSeconds: 1_800,
      serviceMinutes: 5,
      timeWindowStart: "2026-07-15T14:00:00.000Z",
    }],
  });

  assert.equal(endpoints.end.plannedAt, "2026-07-15T14:15:00.000Z");
});

test("last-stop route endpoint uses the last stop address and observed stop arrival", () => {
  const endpoints = buildRouteEndpointPresentation({
    actualArrivalByStopId: { "stop-2": "2026-07-16T04:05:00.000Z" },
    departureLocation: { address: "4475 Chesswood Dr" },
    executionEvidence: { routeEndMode: "END_AT_LAST_STOP" },
    ianaTimezone: "America/Toronto",
    routeMetrics: { durationSeconds: 3_000 },
    routePlan: { routeEndMode: "END_AT_LAST_STOP", scheduledStartAt: "2026-07-16T03:00:00.000Z" },
    stops: [
      { deliveryStopId: "stop-1", durationFromPreviousSeconds: 1_200, serviceMinutes: 5 },
      { address: "2 Test St", deliveryStopId: "stop-2", durationFromPreviousSeconds: 1_800, serviceMinutes: 5 },
    ],
  });

  assert.equal(endpoints.end.address, "2 Test St");
  assert.equal(endpoints.end.plannedAt, "2026-07-16T03:55:00.000Z");
  assert.equal(endpoints.end.actualAt, "2026-07-16T04:05:00.000Z");
  assert.equal(endpoints.end.actualLabel, "Actual arrival");
});

test("child route rows expose notes and summarize shipping and order totals", () => {
  const rows = buildChildRouteOrderRows([{
    currencyCode: "CAD",
    customerNoteContext: { customerNote: "Leave at side door" },
    orderId: "order-1",
    shippingPriceAmount: "10.00",
    totalShippingPriceAmount: "5.00",
    totalShippingPriceCurrencyCode: "CAD",
    totalPriceAmount: "1539.57",
  }], { ianaTimezone: "America/Toronto" });

  assert.equal(rows[0].note, "Leave at side door");
  assert.equal(rows[0].shippingPriceAmount, 10);
  assert.equal(rows[0].totalShippingPriceAmount, 5);
  assert.equal(rows[0].totalShippingPriceCurrencyCode, "CAD");
  assert.equal(rows[0].totalPriceAmount, 1539.57);
  assert.deepEqual(summarizeChildRouteMoney(rows), {
    currencyCode: "CAD",
    shippingPriceLabel: "CA$5.00",
    shippingPriceMissingCount: 0,
    shippingPriceState: "complete",
    totalPriceLabel: "CA$1,539.57",
  });
  assert.deepEqual(summarizeChildRouteMoney([{ currencyCode: "CAD" }]), {
    currencyCode: "CAD",
    shippingPriceLabel: "–",
    shippingPriceMissingCount: 1,
    shippingPriceState: "missing",
    totalPriceLabel: "–",
  });
});

test("standalone Stops and Tracking tables render endpoint rows outside order iteration", () => {
  assert.match(routeDetailSource, /data-route-endpoint=\{kind\}/);
  assert.match(routeDetailSource, /data-route-tracking-endpoint=\{kind\}/);
  assert.match(routeDetailSource, /!isRouteGroupDetail \? renderRouteEndpointOrderRow\(\{[\s\S]*kind: "start"/);
  assert.match(routeDetailSource, /routeOrderRows\.map\(\(row\) => \([\s\S]*!isRouteGroupDetail \? renderRouteEndpointOrderRow\(\{[\s\S]*kind: "end"/);
  assert.match(routeDetailSource, /renderRouteEndpointTrackingRow\(\{[\s\S]*kind: "start"[\s\S]*routeOrderRows\.map\(\(row\) => \([\s\S]*renderRouteEndpointTrackingRow\(\{[\s\S]*kind: "end"/);
  assert.match(routeDetailSource, /routeEndpointPresentation = useMemo\(\(\) => buildRouteEndpointPresentation/);
  assert.match(routeDetailSource, /function renderRouteEndpointTime[\s\S]*return renderChildRouteEta\(\{/);
  assert.doesNotMatch(routeDetailSource, />Planned \{plannedTime\}</);
  assert.doesNotMatch(routeDetailSource, /\? `\$\{actualShortLabel\} \$\{actualTime\}` : "Unconfirmed"/);
  assert.doesNotMatch(routeDetailSource, /completion.*actualEndAt/);
});

test("route order rows include every child and unassigned stop without crossing route evidence", () => {
  const rows = buildRouteOrderRows([
    {
      color: "#0b84d8",
      id: "route-1",
      routePlanId: "route-plan-1",
      status: "Ready",
      title: "#1",
      stops: [{
        deliveryStopId: "stop-1",
        note: "Keep chilled",
        orderId: "order-1",
        orderName: "#1001",
      }],
    },
    {
      color: "#7c3aed",
      id: "route-2",
      routePlanId: "route-plan-2",
      status: "Completed",
      title: "#2",
      stops: [{
        deliveryStopId: "stop-2",
        orderId: "order-2",
        orderName: "#1002",
      }],
    },
    {
      color: "#64748b",
      id: "unassigned",
      isUnassigned: true,
      routePlanId: null,
      status: "Ready",
      title: "Unassigned",
      stops: [{
        deliveryStopId: "stop-3",
        orderId: "order-3",
        orderName: "#1003",
      }],
    },
  ], {
    actualArrivalByStopId: {
      "stop-1": "2026-10-01T14:10:00Z",
      "stop-2": "2026-10-01T15:20:00Z",
    },
    actualArrivalRoutePlanId: "route-plan-1",
    ianaTimezone: "America/Toronto",
  });

  assert.deepEqual(rows.map((row) => row.order), ["#1001", "#1002", "#1003"]);
  assert.deepEqual(rows.map((row) => row.sourceRouteTitle), ["#1", "#2", "Unassigned"]);
  assert.deepEqual(rows.map((row) => row.sourceRoutePlanId), ["route-plan-1", "route-plan-2", null]);
  assert.deepEqual(rows.map((row) => row.sourceRouteStatus), ["Ready", "Completed", "Ready"]);
  assert.equal(rows[0].note, "Keep chilled");
  assert.equal(rows[0].hasActualArrival, true);
  assert.equal(rows[1].hasActualArrival, false);
  assert.match(rows[0].rowKey, /route-1.*stop-1/);
});

test("original shipping totals distinguish confirmed zero, missing snapshots, and mixed currencies", () => {
  assert.deepEqual(summarizeChildRouteMoney([{
    currencyCode: "CAD",
    totalShippingPriceAmount: 0,
    totalShippingPriceCurrencyCode: "CAD",
    totalPriceAmount: 25,
  }]), {
    currencyCode: "CAD",
    shippingPriceLabel: "CA$0.00",
    shippingPriceMissingCount: 0,
    shippingPriceState: "complete",
    totalPriceLabel: "CA$25.00",
  });

  const incomplete = summarizeChildRouteMoney([
    { currencyCode: "CAD", totalShippingPriceAmount: 5, totalShippingPriceCurrencyCode: "CAD" },
    { currencyCode: "CAD", totalShippingPriceAmount: null, totalShippingPriceCurrencyCode: null },
  ]);
  assert.equal(incomplete.shippingPriceLabel, "–");
  assert.equal(incomplete.shippingPriceMissingCount, 1);
  assert.equal(incomplete.shippingPriceState, "missing");

  const mixed = summarizeChildRouteMoney([
    { currencyCode: "CAD", totalShippingPriceAmount: 5, totalShippingPriceCurrencyCode: "CAD" },
    { currencyCode: "USD", totalShippingPriceAmount: 3, totalShippingPriceCurrencyCode: "USD" },
  ]);
  assert.equal(mixed.shippingPriceLabel, "–");
  assert.equal(mixed.shippingPriceMissingCount, 0);
  assert.equal(mixed.shippingPriceState, "mixed_currency");
});

const root = process.cwd();
const routeDetailSource = readFileSync(join(root, "app/routes/app.routes.$routeId.jsx"), "utf8");
const routeDetailServerSource = readFileSync(join(root, "app/features/delivery/route-detail.server.js"), "utf8");

test("materialized child route guard only accepts route-plan-backed group children", () => {
  assert.equal(
    isMaterializedChildRouteDetail({
      routePlan: { id: "route-1", routeGroupingChild: { groupingId: "group-1" } },
      routeGroup: { id: "group-1" },
    }),
    true,
  );
  assert.equal(isMaterializedChildRouteDetail({ routePlan: null, routeGroup: { id: "group-1" } }), false);
  assert.equal(isMaterializedChildRouteDetail({ routePlan: { id: "route-1" }, routeGroup: null }), false);
});

test("child row status mapper is per-order and does not reuse route lifecycle semantics", () => {
  assert.equal(formatChildOrderStatus("PENDING"), "Ready");
  assert.equal(formatChildOrderStatus("ASSIGNED"), "Ready");
  assert.equal(formatChildOrderStatus("ready"), "Ready");
  assert.equal(formatChildOrderStatus("EN_ROUTE"), "In progress");
  assert.equal(formatChildOrderStatus("ARRIVED"), "In progress");
  assert.equal(formatChildOrderStatus("DELIVERED"), "Completed");
  assert.equal(formatChildOrderStatus("FAILED"), "Failed");
  assert.equal(formatChildOrderStatus("SKIPPED"), "Skipped");
  assert.equal(formatChildOrderStatus("CANCELLED"), "Cancelled");
  assert.equal(formatChildOrderStatus("in_progress"), "In progress");
  assert.equal(formatChildOrderStatus("completed"), "Completed");
  assert.equal(formatChildOrderStatus("DRAFT"), "Preparing");
  assert.equal(formatChildOrderStatus("PUBLISHED"), "Preparing");
});

test("child row date and arrival formatting uses store-local time without timezone abbreviations", () => {
  assert.equal(
    formatStoreLocalOrderDate("2026-06-30T18:20:00.000Z", "America/New_York"),
    "06.30 14:20",
  );
  assert.equal(
    formatChildEtaLabel("2026-01-15T16:00:00.000Z", "America/New_York"),
    "11:00",
  );
  assert.equal(
    formatChildEtaLabel("2026-07-15T16:00:00.000Z", "America/New_York"),
    "12:00",
  );
});

test("route start date-time input round-trips through the store timezone without inferring a date", () => {
  assert.equal(
    formatStoreLocalDateTimeInput("2026-07-16T16:30:00.000Z", "America/Toronto"),
    "2026-07-16T12:30",
  );
  assert.equal(
    storeLocalDateTimeToIso("2026-07-16T12:30", "America/Toronto"),
    "2026-07-16T16:30:00.000Z",
  );
  assert.equal(
    storeLocalDateTimeToIso("2026-07-16T12:30", "Asia/Seoul"),
    "2026-07-16T03:30:00.000Z",
  );
  assert.equal(formatStoreLocalDateTimeInput(null, "America/Toronto"), "");
  assert.equal(storeLocalDateTimeToIso("2026-07-16", "America/Toronto"), null);
  assert.equal(storeLocalDateTimeToIso("2026-07-16T12:30", null), null);
});

test("Toronto midnight keeps the same date and 00-hour across server and browser runtimes", () => {
  for (const [instant, localDate] of [
    ["2026-09-03T04:00:00.000Z", "2026-09-03"],
    ["2026-01-15T05:00:00.000Z", "2026-01-15"],
  ]) {
    assert.equal(formatStoreLocalOrderDate(instant, "America/Toronto"), `${localDate.slice(5).replace("-", ".")} 00:00`);
    assert.equal(formatChildEtaLabel(instant, "America/Toronto"), "00:00");
    assert.equal(formatStoreLocalDateTimeInput(instant, "America/Toronto"), `${localDate}T00:00`);
    assert.equal(storeLocalDateTimeToIso(`${localDate}T00:00`, "America/Toronto"), instant);
  }
});

test("child route compact metrics use read-only drive and stop labels", () => {
  assert.equal(formatChildDriveTimeLabel(960, 7400), "16 min / 7.4 km");
  assert.equal(formatChildDriveTimeLabel(60, 80), "1 min / 80 m");
  assert.equal(formatChildStopTimeLabel(5), "5 min");
});

test("executed child rows pair the server rolling ETA with the actual arrival", () => {
  const [row] = buildChildRouteOrderRows([{
    deliveryStopId: "stop-1",
    estimatedArrivalAt: "2026-07-15T14:20:00.000Z",
    etaCalculatedAt: "2026-07-15T14:10:00.000Z",
    etaSource: "STOP_ARRIVED",
    etaStatus: "READY",
    sequence: 1,
  }], {
    actualArrivalByStopId: { "stop-1": "2026-07-15T14:23:00.000Z" },
    ianaTimezone: "UTC",
  });

  assert.equal(row.expectedArrival, "14:20");
  assert.equal(row.actualArrival, "14:23");
  assert.equal(row.hasActualArrival, true);
  assert.equal(row.etaLabel, "Rolling ETA");
  assert.equal(row.etaSource, "STOP_ARRIVED");
});

test("failed stop recalculation remains a Rolling ETA source", () => {
  const [row] = buildChildRouteOrderRows([{
    deliveryStopId: "stop-1",
    estimatedArrivalAt: "2026-07-15T14:20:00.000Z",
    etaSource: "STOP_FAILED",
    sequence: 1,
  }], { ianaTimezone: "UTC" });

  assert.equal(row.etaLabel, "Rolling ETA");
});

test("child tracking keeps the earliest actual stop arrival by delivery stop", () => {
  assert.deepEqual(buildChildActualArrivalByStopId([
    {
      deliveryStopId: "stop-1",
      occurredAt: "2026-07-15T16:03:00.000Z",
    },
    {
      deliveryStopId: "stop-1",
      occurredAt: "2026-07-15T16:05:00.000Z",
    },
    {
      deliveryStopId: "stop-2",
      occurredAt: "invalid",
    },
  ]), {
    "stop-1": "2026-07-15T16:03:00.000Z",
  });
});

test("child order rows follow actual child sequence and use delivery serviceType only", () => {
  const actualArrivalByStopId = buildChildActualArrivalByStopId([
    {
      deliveryStopId: "stop-1002",
      occurredAt: "2026-07-15T15:58:00.000Z",
    },
  ]);
  const rows = buildChildRouteOrderRows(
    [
      {
        deliveryStopId: "stop-1002",
        sequence: 2,
        sourceSequence: 1,
        orderName: "#1002",
        status: "completed",
        orderCreatedAt: "2026-06-30T18:20:00.000Z",
        estimatedArrivalAt: "2026-07-15T16:00:00.000Z",
        durationFromPreviousSeconds: 960,
        distanceFromPreviousMeters: 7400,
        serviceMinutes: 5,
        recipientName: "Second Customer",
        addressLabel: "2 Test St",
        lineItems: [{ title: "Soup", quantity: 2 }],
        serviceType: "EVENING_DELIVERY",
        paymentStatus: "PAID",
        paymentMethodTitle: "Visa",
        attributes: [{ key: "Gate", value: "1234" }],
      },
      {
        sequence: 1,
        sourceSequence: 2,
        orderName: "#1001",
        deliveryStatus: "ready",
        orderCreatedAt: "2026-06-30T17:20:00.000Z",
        recipientName: "First Customer",
        addressLabel: "1 Test St",
        serviceType: "MORNING_DELIVERY",
        financialStatus: "PENDING",
        paymentMethodTitle: "Cash",
      },
    ],
    { actualArrivalByStopId, ianaTimezone: "America/New_York" },
  );

  assert.deepEqual(rows.map((row) => row.order), ["#1001", "#1002"]);
  assert.deepEqual(rows.map((row) => row.stop), [1, 2]);
  assert.deepEqual(rows.map((row) => row.status), ["Ready", "Completed"]);
  assert.equal(rows[1].orderDate, "06.30 14:20");
  assert.equal(rows[1].expectedArrival, "12:00");
  assert.equal(rows[1].actualArrival, "11:58");
  assert.equal(rows[1].driveTime, "16 min / 7.4 km");
  assert.equal(rows[1].stopTime, "5 min");
  assert.equal(rows[1].customer, "Second Customer");
  assert.equal(rows[1].itemsSummary, "2 items");
  assert.equal(rows[1].method, "EVENING_DELIVERY");
  assert.notEqual(rows[1].method, "Visa");
  assert.deepEqual(rows.map((row) => row.payment), ["Pending", "Paid"]);
  assert.equal(rows[1].attributesSummary, "1");
  assert.deepEqual(rows[1].attributes[0], {
    key: "Gate",
    label: "Gate: 1234",
    value: "1234",
  });
  assert.match(rows[1].attributesDetail, /Gate: 1234/);
});

test("child order rows preserve flattened address strings from route stop normalization", () => {
  const [row] = buildChildRouteOrderRows([
    {
      sequence: 1,
      orderName: "#1219",
      address: "1219 Flat Address Rd, Seoul",
    },
  ]);

  assert.equal(row.address, "1219 Flat Address Rd, Seoul");
});

test("child order table columns include a sticky Actions column with the confirmed menu contract", () => {
  const actionsMenuStart = routeDetailSource.indexOf('aria-label={`Actions for ${activeChildStopActionsRow.order}`}');
  const actionsMenuEnd = routeDetailSource.indexOf("</div>,", actionsMenuStart);
  const actionsMenuSource = routeDetailSource.slice(actionsMenuStart, actionsMenuEnd);

  assert.deepEqual(CHILD_ROUTE_ORDER_COLUMNS.map((column) => column.label), [
    "Stop",
    "Order / stop",
    "Status",
    "Order date",
    "Address",
    "ETA",
    "Drive time",
    "Stop time",
    "Customer",
    "Items",
    "Method",
    "Payment",
    "Amount",
    "Attributes",
    "Actions",
  ]);

  assert.match(routeDetailSource, /aria-label="Child route order stops"/);
  assert.match(routeDetailSource, /routeOrderColumns\.map\(\(column\) =>/);
  assert.match(routeDetailSource, /routeOrderRows\.map\(\(row\) =>/);
  assert.match(routeDetailSource, /<td style=\{childRouteExpectedArrivalCellStyle\}>\{renderChildRouteEta\(row\)\}<\/td>/);
  assert.match(routeDetailSource, /<td style=\{childRouteOrderCellStyle\}>\{row\.payment\}<\/td>/);
  assert.match(routeDetailSource, /<td style=\{childRouteOrderCellStyle\}>\s*\{renderChildRouteAmount\(row, cashByStopId\.get\(row\.deliveryStopId\)\)\}\s*<\/td>/);
  assert.match(routeDetailSource, /const childRouteActionsHeaderCellStyle = \{/);
  assert.match(routeDetailSource, /const childRouteActionsCellStyle = \{/);
  assert.match(routeDetailSource, /minWidth: "1500px"/);
  assert.match(routeDetailSource, /const childRouteActionsHeaderCellStyle = \{[\s\S]*background: "#f7f7f7"/);
  assert.match(routeDetailSource, /position: "sticky"/);
  assert.match(routeDetailSource, /right: 0/);
  assert.match(routeDetailSource, /boxShadow: "-8px 0 12px rgba\(255, 255, 255, 0\.92\)"/);
  assert.match(routeDetailSource, /aria-label=\{`Open actions for \$\{row\.order\}`\}/);
  assert.match(routeDetailSource, /aria-haspopup="menu"/);
  assert.match(routeDetailSource, /data-child-stop-actions-trigger="true"/);
  assert.match(routeDetailSource, /data-child-stop-actions-menu="true"/);
  assert.match(routeDetailSource, /role="menu"/);
  assert.match(routeDetailSource, />Mark as…<\/div>/);
  assert.match(routeDetailSource, /handleMarkChildStopStatus\(activeChildStopActionsRow, "READY"\)/);
  assert.match(routeDetailSource, /handleMarkChildStopStatus\(activeChildStopActionsRow, "IN_PROGRESS"\)/);
  assert.match(routeDetailSource, /handleMarkChildStopStatus\(activeChildStopActionsRow, "COMPLETED"\)/);
  assert.ok(actionsMenuStart >= 0 && actionsMenuEnd > actionsMenuStart);
  assert.doesNotMatch(actionsMenuSource, /Attempted/);
  assert.match(routeDetailSource, /activeChildStopActionsRow\.isCustomStop \? "Edit custom stop" : "Edit stop"/);
  assert.match(routeDetailSource, />\s*Remove from group\s*<\/button>/);
  assert.match(routeDetailSource, />\s*Send to route\s*<\/button>/);
  assert.match(routeDetailSource, />\s*View in Shopify\s*<\/a>/);
  assert.match(routeDetailSource, />\s*Open tracking\s*<\/button>/);
});

test("one-route and All routes reuse the detailed order table while preserving route summaries", () => {
  assert.match(routeDetailSource, /const orderTableRouteRows = useMemo\([\s\S]*isRouteGroupDetail[\s\S]*timelineRouteRows/);
  assert.match(routeDetailSource, /buildRouteOrderRows\(orderTableRouteRows/);
  assert.match(routeDetailSource, /childDetailTab === "stops" && \(routeOrderRows\.length > 0 \|\| !isRouteGroupDetail\)/);
  assert.match(routeDetailSource, /const routeOrderColumns = isRouteGroupDetail[\s\S]*\{ key: "route", label: "Route" \}/);
  assert.match(routeDetailSource, /routeOrderColumns\.map\(\(column\) =>/);
  assert.match(routeDetailSource, /\{row\.sourceRouteTitle\}/);
  assert.match(routeDetailSource, /findRouteOrderRow\(routeOrderRows, activeChildOrderDisclosure\.rowId\)/);
  assert.match(routeDetailSource, /summarizeChildRouteMoney\(routeOrderRows\)/);
  assert.match(routeDetailSource, /isRouteGroupDetail \? \([\s\S]*href=\{withEmbeddedShopifyContext\(routeGroupChildPath\(routeGroupId, row\.sourceRoutePlanId\), searchParams\)\}[\s\S]*>Open route<\/a>/);
  assert.match(routeDetailSource, /\) : null\}\s+\{isTrackingMapView \? \(/);
  assert.match(routeDetailSource, /aria-label="Driver route rows"/);
  assert.match(routeDetailSource, /aria-label="Route stop timeline"/);
});

test("custom stops stay visible but never become Shopify-linked child rows", () => {
  const [row] = buildChildRouteOrderRows([{
    deliveryStopId: "custom-stop-1",
    orderName: "Warehouse pickup",
    sourcePlatform: "CUSTOM",
  }]);

  assert.equal(row.isCustomStop, true);
  assert.equal(row.order, "Warehouse pickup");
  assert.equal(row.shopifyOrderGid, undefined);
  assert.equal(row.priority, 0);
});

test("route detail links only canonical Shopify order rows in a new tab", () => {
  assert.match(routeDetailSource, /sourcePlatform && sourcePlatform !== "SHOPIFY"/);
  assert.match(routeDetailSource, /href=\{shopifyOrderAdminHref\} rel="noopener noreferrer" target="_blank"/);
  assert.match(routeDetailSource, /row\?\.isCustomStop\) return null/);
});

test("child order rows preserve canonical identifiers and flat operational edit fields for actions", () => {
  const [row] = buildChildRouteOrderRows([
    {
      address: {
        address1: "10 Test St",
        address2: "Unit 2",
        city: "Toronto",
        countryCode: "CA",
        postalCode: "M1M 1M1",
        province: "ON",
      },
      coordinates: [-79.4, 43.7],
      id: "local-stop-id",
      instructions: "Use side door",
      deliveryStopId: "delivery-stop-1",
      email: "minji@example.test",
      orderId: "canonical-order-1",
      orderName: "#1001",
      phone: "+14165550123",
      recipientName: "Kim Minji",
      serviceMinutes: 7,
      shopifyOrderGid: "gid://shopify/Order/1001",
      shopifyOrderLegacyId: "1001",
      timeWindowEnd: "21:00",
      timeWindowStart: "17:00",
    },
  ]);

  assert.equal(row.orderId, "canonical-order-1");
  assert.equal(row.deliveryStopId, "delivery-stop-1");
  assert.equal(row.shopifyOrderGid, "gid://shopify/Order/1001");
  assert.equal(row.shopifyOrderLegacyId, "1001");
  assert.deepEqual(row.editFields, {
    address1: "10 Test St",
    address2: "Unit 2",
    city: "Toronto",
    countryCode: "CA",
    email: "minji@example.test",
    instructions: "Use side door",
    latitude: 43.7,
    longitude: -79.4,
    phone: "+14165550123",
    postalCode: "M1M 1M1",
    province: "ON",
    recipientName: "Kim Minji",
    serviceMinutes: 7,
    timeWindowEnd: "21:00",
    timeWindowStart: "17:00",
  });
});

test("child stop actions keep active route membership locked", () => {
  assert.match(routeDetailSource, /submitRouteAction\("transitionRouteStop"/);
  assert.match(routeDetailSource, /submitRouteAction\("updateRouteStop"/);
  assert.doesNotMatch(routeDetailSource, /\["deliveryArea", "Delivery area"\]/);
  assert.doesNotMatch(routeDetailSource, /\["deliveryNote", "Delivery note"\]/);
  assert.doesNotMatch(routeDetailSource, /\["serviceType", "Service type"\]/);
  assert.match(routeDetailSource, /const routeMembershipChangeIsInProgress = isRouteExecutionInProgressForStopMembership\(routeExecutionStatus\)/);
  assert.match(routeDetailSource, /const canAddOrRemoveChildStops = canDraftEditChildStopMembership/);
  assert.match(routeDetailSource, /disabled=\{!canRemoveChildStopFromGroup\(activeChildStopActionsRow\)\}/);
  assert.match(routeDetailSource, /disabled=\{!canDraftEditChildStopMembership \|\| childStopSendTargetRows\.length === 0\}/);
  assert.match(routeDetailSource, /heading: "Change in-progress route\?"/);
  assert.match(routeDetailSource, /Adding a stop changes the active stop list/);
  assert.match(routeDetailSource, /Removing .* changes the active stop list/);
  assert.match(routeDetailServerSource, /intent === "transitionRouteStop"/);
  assert.match(routeDetailServerSource, /transitionDeliveryRoutePlanStop\(\s*request,\s*routeId,\s*deliveryStopId/);
  assert.match(routeDetailServerSource, /intent === "updateRouteStop"/);
  assert.match(routeDetailServerSource, /updateDeliveryRoutePlanStop\(\s*request,\s*routeId,\s*deliveryStopId/);
});

test("child timeline precedes the table and enforces explicit responsive minimum spacing", () => {
  const timelineIndex = routeDetailSource.indexOf('aria-label="Child route stop timeline"');
  const tableIndex = routeDetailSource.indexOf('aria-label="Child route order stops"');

  assert.notEqual(timelineIndex, -1);
  assert.notEqual(tableIndex, -1);
  assert.ok(timelineIndex < tableIndex);
  assert.match(routeDetailSource, /const CHILD_ROUTE_TIMELINE_UNIT_MIN_WIDTH = 73;/);
  assert.match(routeDetailSource, /function getChildRouteTimelineTrackStyle\(stopCount\)/);
  assert.match(routeDetailSource, /minWidth: `\$\{unitCount \* CHILD_ROUTE_TIMELINE_UNIT_MIN_WIDTH\}px`/);
  assert.match(routeDetailSource, /const childRouteTimelineStopUnitStyle = \{/);
  assert.match(routeDetailSource, /minWidth: "73px"/);
  assert.match(routeDetailSource, /minHeight: "48px"/);
  assert.match(routeDetailSource, /maxWidth: "100%"/);
  assert.match(routeDetailSource, /minWidth: 0/);
  assert.match(routeDetailSource, /overflowX: "auto"/);
  assert.match(routeDetailSource, /getChildRouteTimelineTrackStyle\(routeRow\.stops\.length\)/);
});

test("Stops and Tracking route markers share one order popup with the existing stop Actions menu", () => {
  assert.match(routeDetailSource, /const handleRouteStopLayerClick = \(event\) => \{/);
  assert.match(routeDetailSource, /map\.on\("click", ROUTE_DETAIL_STOP_LAYER_ID, handleRouteStopLayerClick\)/);
  assert.match(routeDetailSource, /map\.off\("click", ROUTE_DETAIL_STOP_LAYER_ID, handleRouteStopLayerClick\)/);
  assert.doesNotMatch(routeDetailSource, /if \(!isTrackingMapView\) bindStopLayerHandlers\(\)/);
  assert.match(routeDetailSource, /content\.className = "route-stop-map-popup__content"/);
  assert.match(routeDetailSource, /actions\.dataset\.childStopActionsTrigger = "true"/);
  assert.match(routeDetailSource, /handleToggleChildStopActionsRef\.current\?\.\(event, row\.id\)/);
  assert.match(routeDetailSource, /activeRouteTimelineStopPopover\.mode === "pinned"[\s\S]*handleToggleChildStopActions\(event, activeRouteTimelineStop\.id\)/);
});

test("child timeline renders distinct circular Start and End markers", () => {
  assert.match(routeDetailSource, /function renderChildRouteTimelineStartMarker\(\)/);
  assert.match(routeDetailSource, /function renderChildRouteTimelineEndMarker\(\)/);
  assert.match(routeDetailSource, /aria-label="Route start"/);
  assert.match(routeDetailSource, /aria-label="Route end"/);
  assert.match(routeDetailSource, /childRouteTimelineEndStyle/);
  assert.match(routeDetailSource, />End<\/span>/);
  assert.match(routeDetailSource, /childRouteTimelineOrderLabelStyle/);
  assert.match(routeDetailSource, /<span style=\{childRouteTimelineOrderLabelStyle\}>\{stop\.order\}<\/span>/);
  assert.match(routeDetailSource, /const childRouteActionsCellStyle = \{[\s\S]*position: "sticky"/);
  assert.match(routeDetailSource, /onDragStart=\{routeRow\.isPreviewOnly \|\| !canDragTimelineStop\(routeRow, stop\) \? undefined : \(event\) => handleRouteTimelineDragStart\(event, routeRow, stop\)\}/);
  assert.match(routeDetailSource, /onClick=\{handleSaveRouteDraft\}/);
  assert.match(routeDetailSource, /Drop orders here to remove them from the route/);
});

test("child timeline drag suppresses stop details until the gesture fully ends", () => {
  assert.match(
    routeDetailSource,
    /const handleRouteTimelineStopMouseEnter = \(stop\) => \{\s*if \(routeTimelineDragRef\.current\) return;/,
  );
  assert.match(
    routeDetailSource,
    /const handleRouteTimelineStopClick = \(event, stop\) => \{[\s\S]*routeTimelineSuppressClickRef\.current/,
  );
  assert.match(
    routeDetailSource,
    /\{!routeTimelineDrag && activeRouteTimelineStop && activeRouteTimelineStopPopover \? \(/,
  );
});

test("child timeline drag previews midpoint placement and preserves the returned start snapshot", () => {
  assert.match(
    routeDetailSource,
    /function areTimelineOrdersEqual\(routeRows, firstOrderByRouteId, secondOrderByRouteId\)/,
  );
  assert.match(
    routeDetailSource,
    /const targetStopIds = getTimelineRouteStopIds\(\s*routeRows,\s*routeTimelineOrderByRouteIdRef\.current,\s*routeRow\.id,\s*\)\.filter\(\(stopId\) => stopId !== drag\.stopId\)/,
  );
  assert.match(
    routeDetailSource,
    /event\.clientX < activationPoint/,
  );
  assert.match(
    routeDetailSource,
    /areTimelineOrdersEqual\(\s*routeRows,\s*nextOrderByRouteId,\s*snapshot\.orderByRouteId,\s*\)/,
  );
  assert.doesNotMatch(
    routeDetailSource,
    /routeTimelineDropCommittedRef\.current = true;\s*moveDraggedTimelineStop\(routeRow\.id\);\s*handleRouteTimelineDragEnd\(\);/,
  );
});

test("child timeline reorders whole stop units with a cancellable FLIP animation", () => {
  assert.match(routeDetailSource, /const routeTimelineStopMotionRefs = useRef\(new Map\(\)\)/);
  assert.match(routeDetailSource, /const setRouteTimelineStopMotionRef = useCallback/);
  assert.match(routeDetailSource, /routeTimelineStopMotionRefs\.current\.entries\(\)/);
  assert.match(routeDetailSource, /node\.animate\(\s*\[/);
  assert.match(routeDetailSource, /translate3d\(\$\{deltaX\}px, \$\{deltaY\}px, 0\)/);
  assert.match(routeDetailSource, /const ROUTE_TIMELINE_REORDER_ANIMATION_MS = 200;/);
  assert.match(routeDetailSource, /duration: ROUTE_TIMELINE_REORDER_ANIMATION_MS/);
  assert.match(routeDetailSource, /easing: "cubic-bezier\(0\.22, 1, 0\.36, 1\)"/);
  assert.match(
    routeDetailSource,
    /ref=\{\(node\) => setRouteTimelineStopMotionRef\(stop\.id, node\)\}/,
  );
});

test("child timeline slightly widens the directional reorder activation area", () => {
  assert.match(routeDetailSource, /const ROUTE_TIMELINE_REORDER_ACTIVATION_BIAS_PX = 6;/);
  assert.match(routeDetailSource, /const routeTimelineDragPointerXRef = useRef\(null\);/);
  assert.match(routeDetailSource, /const previousPointerX = routeTimelineDragPointerXRef\.current;/);
  assert.match(routeDetailSource, /const pointerDirection = previousPointerX == null\s*\? 0\s*: Math\.sign\(event\.clientX - previousPointerX\);/);
  assert.match(
    routeDetailSource,
    /const activationPoint = targetRect\.left \+ targetRect\.width \/ 2\s*- pointerDirection \* ROUTE_TIMELINE_REORDER_ACTIVATION_BIAS_PX;/,
  );
  assert.match(routeDetailSource, /event\.clientX < activationPoint/);
});

test("child timeline connectors run only between component centers", () => {
  assert.match(routeDetailSource, /const childRouteTimelineConnectorStyle = \{/);
  assert.match(routeDetailSource, /left: "50%"/);
  assert.match(routeDetailSource, /width: "100%"/);
  assert.match(routeDetailSource, /aria-hidden="true" style=\{childRouteTimelineConnectorStyle\}/);
  assert.doesNotMatch(routeDetailSource, /backgroundSize: `calc\(100% - \$\{CHILD_ROUTE_TIMELINE_UNIT_MIN_WIDTH\}px\) 2px`/);
});

test("child order stop rows reuse the route color marker and a taller row", () => {
  assert.match(routeDetailSource, /const childRouteTableStopMarkerStyle = \{/);
  assert.match(routeDetailSource, /background: "var\(--route-marker-color, #0b84d8\)"/);
  assert.match(routeDetailSource, /const childRouteOrderRowStyle = \{[\s\S]*height: "40px"/);
  assert.match(routeDetailSource, /<span style=\{childRouteTableStopMarkerTextStyle\}>\{row\.stop\}<\/span>/);
  assert.match(routeDetailSource, /"--route-marker-color": currentTimelineRouteRow\?\.color \?\? routeLineColor/);
});

test("child timeline and order table share explicit centered alignment axes", () => {
  assert.match(routeDetailSource, /const childRouteTimelineStopUnitStyle = \{[\s\S]*justifyItems: "center"[\s\S]*width: "100%"/);
  assert.match(routeDetailSource, /const childRouteTimelineOrderLabelStyle = \{[\s\S]*textAlign: "center"[\s\S]*width: "100%"/);
  assert.match(routeDetailSource, /const childRouteTimelineStopMarkerStyle = \{[\s\S]*display: "grid"[\s\S]*placeItems: "center"/);
  assert.match(routeDetailSource, /const childRouteOrderHeaderCellStyle = \{[\s\S]*textAlign: "center"[\s\S]*verticalAlign: "middle"/);
  assert.match(routeDetailSource, /const childRouteOrderCellStyle = \{[\s\S]*textAlign: "center"/);
  assert.match(routeDetailSource, /const childRouteStopCellStyle = \{[\s\S]*padding: "8px 0"[\s\S]*textAlign: "center"/);
  assert.match(routeDetailSource, /style=\{column\.key === "actions" \? childRouteActionsHeaderCellStyle : childRouteOrderHeaderCellStyle\}/);
});

test("child action cell styles initialize after the shared styles they extend", () => {
  const orderHeaderIndex = routeDetailSource.indexOf("const childRouteOrderHeaderCellStyle");
  const orderCellIndex = routeDetailSource.indexOf("const childRouteOrderCellStyle");
  const actionsHeaderIndex = routeDetailSource.indexOf("const childRouteActionsHeaderCellStyle");
  const actionsCellIndex = routeDetailSource.indexOf("const childRouteActionsCellStyle");

  assert.ok(orderHeaderIndex >= 0);
  assert.ok(orderCellIndex >= 0);
  assert.ok(actionsHeaderIndex > orderHeaderIndex);
  assert.ok(actionsCellIndex > orderCellIndex);
});

test("child timeline keeps breathing room while table stop digits stay geometrically centered", () => {
  assert.match(routeDetailSource, /const childRouteTimelineStyle = \{[\s\S]*padding: "8px 8px 16px"/);
  assert.match(routeDetailSource, /aria-label="Child route stop timeline"[\s\S]*style=\{childRouteTimelineStyle\}/);
  assert.match(routeDetailSource, /const childRouteTableStopMarkerStyle = \{[\s\S]*display: "grid"[\s\S]*placeItems: "center"[\s\S]*margin: "0 auto"/);
  assert.match(routeDetailSource, /const routeNumberMarkerGlyphStyle = \{[\s\S]*lineHeight: 1[\s\S]*transform: "translateY\(0\.1em\)"/);
  assert.match(routeDetailSource, /const childRouteTableStopMarkerTextStyle = \{[\s\S]*\.\.\.routeNumberMarkerGlyphStyle[\s\S]*fontSize: "11px"[\s\S]*fontWeight: 700[\s\S]*transform: "none"/);
  assert.match(routeDetailSource, /<span style=\{routeNumberMarkerGlyphStyle\}>\{stop\.stop\}<\/span>/);
  assert.match(routeDetailSource, /<span style=\{\{ \.\.\.childRouteTableStopMarkerStyle, background: row\.sourceRouteColor \?\? routeLineColor \}\}><span style=\{childRouteTableStopMarkerTextStyle\}>\{row\.stop\}<\/span><\/span>/);
  assert.doesNotMatch(routeDetailSource, /textBox:/);
});

test("Items and Attributes use hover and click disclosures above their trigger", () => {
  assert.match(routeDetailSource, /const CHILD_ORDER_DISCLOSURE_GAP = 2;/);
  assert.match(routeDetailSource, /createPortal/);
  assert.match(routeDetailSource, /position: "fixed"/);
  assert.match(routeDetailSource, /function getChildOrderDisclosurePopoverPosition\(rect, popoverSize = \{\}\)/);
  assert.match(routeDetailSource, /popoverSize\.height \?\? CHILD_ORDER_DISCLOSURE_HEIGHT/);
  assert.match(routeDetailSource, /const top = Math\.max\([\s\S]*rect\.top - height - CHILD_ORDER_DISCLOSURE_GAP/);
  assert.match(routeDetailSource, /childOrderDisclosurePopoverRef\.current[\s\S]*popoverNode\.offsetHeight[\s\S]*popoverNode\.offsetWidth/);
  assert.match(routeDetailSource, /window\.addEventListener\("scroll", syncChildOrderDisclosurePopover, true\)/);
  assert.match(routeDetailSource, /setTimeout\([\s\S]*setActiveChildOrderDisclosure[\s\S]*}, 40\);/);
  assert.match(routeDetailSource, /data-child-order-disclosure-trigger="true"/);
  assert.doesNotMatch(routeDetailSource, /<td onMouseLeave=\{handleChildOrderDisclosureMouseLeave\} style=\{childRouteDisclosureCellStyle\}>/);
  assert.match(routeDetailSource, /data-child-order-disclosure-popover="true"/);
  assert.match(routeDetailSource, /onMouseEnter=\{\(event\) => handleChildOrderDisclosureMouseEnter\(event, row\.rowKey, "items"\)\}/);
  assert.match(routeDetailSource, /onMouseEnter=\{\(event\) => handleChildOrderDisclosureMouseEnter\(event, row\.rowKey, "items"\)\}\s+onMouseLeave=\{handleChildOrderDisclosureMouseLeave\}/);
  assert.match(routeDetailSource, /onMouseEnter=\{\(event\) => handleChildOrderDisclosureMouseEnter\(event, row\.rowKey, "attributes"\)\}/);
  assert.match(routeDetailSource, /onMouseEnter=\{\(event\) => handleChildOrderDisclosureMouseEnter\(event, row\.rowKey, "attributes"\)\}\s+onMouseLeave=\{handleChildOrderDisclosureMouseLeave\}/);
  assert.match(routeDetailSource, /onMouseLeave=\{handleChildOrderDisclosureMouseLeave\}/);
  assert.match(routeDetailSource, /onBlur=\{handleChildOrderDisclosureMouseLeave\}/);
  assert.match(routeDetailSource, /aria-haspopup="dialog"/);
  assert.match(routeDetailSource, /event\.key !== "Escape"/);
  assert.match(routeDetailSource, /childOrderDisclosureCloseButtonRef\.current\?\.focus\(\)/);
  assert.match(routeDetailSource, /trigger\?\.focus\(\)/);
  assert.match(routeDetailSource, /renderChildRouteInfoIcon\(\)/);
  assert.match(routeDetailSource, /\{row\.attributesSummary\}/);
  assert.match(routeDetailSource, /role=\{activeChildOrderDisclosure\.mode === "pinned" \? "dialog" : "tooltip"\}/);
  assert.doesNotMatch(routeDetailSource, /childRouteDisclosurePopoverStyle\}>\{row\.(itemsDetail|attributesDetail)\}/);
});

test("materialized child headers stage a complete per-route start date and time for global save", () => {
  assert.match(routeDetailSource, /import \{[\s\S]*RouteStartTimePicker[\s\S]*\} from "\.\.\/features\/delivery\/route-start-time-picker"/);
  assert.match(routeDetailSource, /const \[routeStartTimeDraft, setRouteStartTimeDraft\] = useState/);
  assert.match(routeDetailSource, /aria-label="Change route start time"/);
  assert.match(routeDetailSource, /handleOpenRouteSelector\("startTime"/);
  assert.match(routeDetailSource, /currentTimelineRouteRow\?\.startTimeLabel \?\? routeStartTimeLabel/);
  assert.match(routeDetailSource, /<RouteStartTimePicker[\s\S]*draft=\{routeStartTimeDraft\}[\s\S]*onDraftChange=\{setRouteStartTimeDraft\}/);
  assert.match(routeDetailSource, /routeTitle=\{activeRouteSelector\.routeTitle\}/);
  assert.match(routeDetailSource, /activeRouteSelector\.type === "startTime" \? routeStartTimeDialogStyle : null/);
  assert.doesNotMatch(routeDetailSource, /type="datetime-local"/);
  assert.match(routeDetailSource, /const targetRouteRowId = activeRouteSelector\?\.type === "startTime"/);
  assert.match(routeDetailSource, /setRouteLineEdits\(\(currentEdits\) => \(\{[\s\S]*scheduledStartAt,[\s\S]*startDateTime: routeStartDateTimeDraftValue/);
  assert.match(routeDetailSource, /scheduledStartTimeZone: scheduledStartAt === null \? null : routeStartTimeDraft\.timezone \|\| ianaTimezone/);
  assert.match(routeDetailSource, /scheduledStartAt: routeRow\.scheduledStartAt \?\? null/);
  assert.match(routeDetailSource, />\s*Apply\s*<\/button>/);
  assert.doesNotMatch(routeDetailSource, /formData\.set\("_intent", "saveRouteStartTime"\)/);
  assert.doesNotMatch(routeDetailServerSource, /intent === "saveRouteStartTime"/);
  assert.doesNotMatch(routeDetailServerSource, /updateDeliveryRoutePlanScheduledStart/);
});

test("child detail uses a flat reference-style title area and keeps inventory separate", () => {
  assert.match(routeDetailSource, /const routeChildOverviewHeaderStyle = \{/);
  assert.match(routeDetailSource, /Updated on \{routeUpdatedLabel\}/);
  assert.match(routeDetailSource, /aria-label="Edit child route name"/);
  assert.match(routeDetailSource, /style=\{isMaterializedChildRouteDetail \|\| isRouteGroupDetail \? routeChildOverviewHeaderStyle : routeOverviewHeaderStyle\}/);
  assert.match(routeDetailSource, /onClick=\{handleViewInventory\}[\s\S]*routes\.detail\.sections\.inventory/);
  assert.doesNotMatch(routeDetailSource, /icon="inventory"/);
  assert.doesNotMatch(routeDetailSource, />Inventory<\/button>[\s\S]*role="tab"/);
});

test("route detail tabs keep tracking available for ordinary and grouped child routes", () => {
  const tabsIndex = routeDetailSource.indexOf('routes.detail.sections.accessibilityLabel');
  const timelineIndex = routeDetailSource.indexOf('aria-label="Child route stop timeline"');
  const trackingIndex = routeDetailSource.indexOf('aria-label="Route tracking"');
  const tabHandlerStart = routeDetailSource.indexOf("const handleChildDetailTabChange = (nextTab) => {");
  const tabHandlerEnd = routeDetailSource.indexOf("const handleToggleRoutePolygonEditMode", tabHandlerStart);
  const tabHandlerSource = routeDetailSource.slice(tabHandlerStart, tabHandlerEnd);

  assert.ok(tabsIndex >= 0 && tabsIndex < timelineIndex);
  assert.ok(tabsIndex < trackingIndex);
  assert.match(routeDetailSource, /const \[childDetailTab, setChildDetailTab\] = useState\("stops"\)/);
  assert.match(routeDetailSource, /const trackingRoutePlanId = textOrUndefined\(effectiveRoutePlan\?\.id\)/);
  assert.match(routeDetailSource, /const hasRouteTrackingDetail = Boolean\(trackingRoutePlanId\)/);
  assert.match(routeDetailSource, /const isTrackingMapView = hasRouteTrackingDetail && childDetailTab === "tracking"/);
  assert.doesNotMatch(routeDetailSource, /const routeMapViewKey =/);
  assert.match(routeDetailSource, /role="toolbar"/);
  assert.match(routeDetailSource, /handleChildDetailTabChange\("stops"\)/);
  assert.match(routeDetailSource, /handleChildDetailTabChange\("tracking"\)/);
  assert.match(routeDetailSource, /routes\.detail\.sections\.stops/);
  assert.match(routeDetailSource, /routes\.detail\.sections\.inventory/);
  assert.match(routeDetailSource, /routes\.detail\.sections\.tracking/);
  assert.match(routeDetailSource, /routes\.detail\.sections\.addOrders/);
  assert.match(routeDetailSource, /onClick=\{handleViewInventory\}/);
  assert.match(routeDetailSource, /onClick=\{handleAddOrderToCurrentRoute\}/);
  assert.match(routeDetailSource, /childDetailTab === "stops"/);
  assert.match(routeDetailSource, /childDetailTab === "tracking"/);
  assert.match(routeDetailSource, /ariaLabel=\{isTrackingMapView \? "Recorded GPS tracking map" : "Route stop location map"\}/);
  assert.match(routeDetailSource, /canvasKey=\{mapRenderKey\}/);
  assert.doesNotMatch(routeDetailSource, /key=\{routeMapViewKey\}/);
  assert.doesNotMatch(routeDetailSource, /aria-label="Tracking map legend"|>Planned route<|>GPS tracking</);
  assert.doesNotMatch(routeDetailSource, /aria-label="Tracking date controls"|aria-label="Selected tracking date"|All recorded dates|Available tracking dates|and next day/);
  assert.doesNotMatch(routeDetailSource, />Road-matched GPS|>Unmatched GPS/);
  assert.match(routeDetailSource, /getRouteTrackingServiceDate\(/);
  assert.match(routeDetailSource, /allRecords: false/);
  assert.match(routeDetailSource, /includeNextDay: true/);
  assert.doesNotMatch(routeDetailSource, /aria-label="Current position freshness"|aria-label="Route completion time"|routeTrackingMapDateControlsStyle|routeTrackingMapFreshnessStyle/);
  assert.match(routeDetailSource, /\[mapRenderKey, scheduleMapRecovery\]/);
  assert.doesNotMatch(routeDetailSource, /\[isTrackingMapView, mapRenderKey, scheduleMapRecovery\]/);
  assert.match(
    routeDetailSource,
    /hasInitialRouteMapFitRef\.current = false;\s*hasTrackingGpsFitRef\.current = false;\s*\}, \[effectiveRoutePlan\?\.id, isTrackingMapView, mapRenderKey\]\);/,
  );
  assert.ok(tabHandlerStart >= 0 && tabHandlerEnd > tabHandlerStart);
  assert.doesNotMatch(tabHandlerSource, /clearMapRecoveryTimer|mapLoadedRef|setIsMapReady|setMapStatus/);
  assert.match(routeDetailSource, /syncRouteDetailTrackingVisibility\(map, isTrackingMapView\);\s*bindStopLayerHandlers\(\)/);
  assert.match(routeDetailSource, /if \(mapCanvas\?\.style\.cursor === "pointer"\) mapCanvas\.style\.cursor = "";/);
  assert.match(routeDetailSource, /\{hasRouteTrackingDetail \? \(\s*<div[^>]*aria-label=\{translate\(language, "routes\.detail\.sections\.accessibilityLabel"\)\}/);
  assert.match(routeDetailSource, /\{isTrackingMapView \? \(\s*<section aria-label="Route tracking"/);
  assert.match(routeDetailSource, /\{!isMaterializedChildRouteDetail && !isTrackingMapView \? \(/);
});

test("child detail keeps dispatch, original shipping, schedule validation, and execution evidence semantically separate", () => {
  assert.match(routeDetailSource, /routes\.detail\.dispatchedAccessibilityLabel/);
  assert.match(routeDetailSource, /routes\.detail\.dispatched/);
  assert.match(routeDetailSource, /getRouteStartPlanDateError\(routeStartTimeDraft, routePlanDate\)/);
  assert.match(routeDetailSource, /routes\.detail\.schedule\.planDateMismatch/);
  assert.match(routeDetailSource, /totalShippingPriceAmount: numberOrUndefined\(stop\.totalShippingPriceAmount\)/);
  assert.match(routeDetailSource, /routes\.detail\.originalShippingMissing/);
  assert.match(routeDetailSource, /routes\.detail\.originalShippingMixed/);
  assert.match(routeDetailSource, /routeExecutionEvidence\?\.start/);
  assert.match(routeDetailSource, /routeExecutionEvidence\?\.completion/);
  assert.match(routeDetailSource, /returnToDepotEvidence\?\.status/);
  assert.match(routeDetailSource, /routes\.detail\.tracking\.distanceFromDepot/);
  assert.match(routeDetailSource, /getReturnToDepotEvidenceTitle\(returnToDepotEvidence, ianaTimezone, language\)/);
  assert.doesNotMatch(routeDetailSource, /m from depot \(threshold/);
  assert.doesNotMatch(routeDetailSource, /Linked inventory is not available yet/);
  assert.doesNotMatch(routeDetailSource, /\?\? "Route data could not be fully loaded\."/);
  assert.doesNotMatch(routeDetailSource, /Actual driving time|Total working time|Payroll/);
});

test("Amount shows the order amount, then the expected and received Cash amounts", () => {
  const [row] = buildChildRouteOrderRows([{ currencyCode: "CAD", deliveryStopId: "stop-1", totalPriceAmount: "122.25" }], { ianaTimezone: "America/Toronto" });
  const receipt = (completion = {}) => ({
    completion: { id: "cash-1", currencyCode: "CAD", expectedAmount: "122.25", actualAmount: "122.00", ...completion },
  });

  assert.equal(row.amountLabel, "CA$122.25");
  assert.equal(buildChildRouteOrderRows([{ deliveryStopId: "stop-2" }])[0].amountLabel, "–");
  assert.deepEqual(buildChildRouteAmounts(row), [{ id: "order", expected: "CA$122.25", received: null }]);
  assert.deepEqual(buildChildRouteAmounts(row, []), buildChildRouteAmounts(row));
  assert.deepEqual(buildChildRouteAmounts(row, [receipt()]), [{ id: "cash-1", expected: "CA$122.25", received: "CA$122.00" }]);
  assert.equal(buildChildRouteAmounts(row, [receipt({ expectedAmount: null })])[0].expected, "CA$122.25");
  assert.deepEqual(buildChildRouteAmounts(row, [receipt(), receipt({ id: "cash-2" })]).map((line) => line.id), ["cash-1", "cash-2"]);
});

test("the Amount cell reuses the ETA presentation and has nothing to click or confirm", () => {
  const start = routeDetailSource.indexOf("function renderChildRouteAmount(");
  assert.ok(start > 0, "renderChildRouteAmount is missing");
  const amountSource = routeDetailSource.slice(start, routeDetailSource.indexOf("\n}\n", start));

  assert.match(amountSource, /renderChildRouteEta\(\{/);
  assert.match(amountSource, /buildChildRouteAmounts\(row, receipts\)/);
  assert.doesNotMatch(amountSource, /<button|onClick|Confirm|Unconfirmed/);
  assert.doesNotMatch(routeDetailSource, /CashCell|CashReceiptDialog|handleOpenCashReceipt|Cash receipt|Confirm Cash/);
});

test("endpoint rows and column widths stay aligned with the stop table columns", () => {
  const widths = routeDetailSource.slice(
    routeDetailSource.indexOf("const childRouteOrderColumnWidths = ["),
    routeDetailSource.indexOf("];", routeDetailSource.indexOf("const childRouteOrderColumnWidths = [")),
  );
  const endpointStart = routeDetailSource.indexOf("function renderRouteEndpointOrderRow(");
  const endpointRow = routeDetailSource.slice(endpointStart, routeDetailSource.indexOf("\n}\n", endpointStart));

  assert.equal(widths.match(/"\d+px"/g).length, CHILD_ROUTE_ORDER_COLUMNS.length);
  assert.equal(endpointRow.match(/<td\b/g).length, CHILD_ROUTE_ORDER_COLUMNS.length);
});

const returnDepot = [-79.4748, 43.7637];
const returnPath = (points) => ({
  recordedPath: {
    firstOccurredAt: points[0][0],
    geometry: { type: "LineString", coordinates: points.map(([, longitude, latitude]) => [longitude, latitude]) },
    lastOccurredAt: points.at(-1)[0],
    lastReceivedAt: points.at(-1)[0],
    samples: points.map(([time], index) => ({ eventId: `event-${index}`, occurredAt: time, receivedAt: time })),
    schemaVersion: "route_tracking_geometry.v1",
    sourcePointCount: points.length,
  },
});
const returnTrackingSnapshot = returnPath([
  ["2026-10-08T13:00:00.000Z", -79.4748, 43.7637],
  ["2026-10-08T14:00:00.000Z", -79.4, 43.7],
  ["2026-10-08T16:30:00.000Z", -79.42, 43.72],
  ["2026-10-08T16:50:00.000Z", -79.4749, 43.7638],
  ["2026-10-09T12:06:00.000Z", -79.4748, 43.7637],
]);
const returnInput = (overrides = {}) => ({
  actualArrivalByStopId: { s1: "2026-10-08T14:00:00.000Z", s2: "2026-10-08T16:14:00.000Z" },
  departureLocation: { address: "4475 Chesswood Dr", savedCoordinates: returnDepot },
  executionEvidence: { returnToDepot: { status: "UNAVAILABLE", thresholdMeters: 150 }, routeEndMode: "RETURN_TO_DEPOT" },
  ianaTimezone: "America/Toronto",
  routeMetrics: { durationSeconds: 5_400 },
  routePlan: { routeEndMode: "RETURN_TO_DEPOT", scheduledStartAt: "2026-10-08T13:00:00.000Z" },
  stops: [
    { deliveryStopId: "s1", deliveryStopStatus: "DELIVERED", latitude: 43.7, longitude: -79.4, sequence: 1 },
    { deliveryStopId: "s2", deliveryStopStatus: "DELIVERED", latitude: 43.72, longitude: -79.42, sequence: 2 },
  ],
  trackingSnapshot: returnTrackingSnapshot,
  ...overrides,
});

test("End shows the first GPS return near the depot when the server has no completion evidence", () => {
  const end = buildRouteEndpointPresentation(returnInput()).end;

  assert.equal(end.actualAt, "2026-10-08T16:50:00.000Z");
  assert.equal(end.actualLabel, "Return observed (GPS)");
  assert.equal(end.observedFromGps, true);
  assert.ok(end.observedDistanceMeters > 0 && end.observedDistanceMeters < 30);
  assert.equal(end.observedThresholdMeters, 150);
});

test("End keeps the server's confirmed return and never guesses without full evidence", () => {
  const confirmed = buildRouteEndpointPresentation(returnInput({
    executionEvidence: { returnToDepot: { observedAt: "2026-10-08T16:55:00.000Z", status: "CONFIRMED" }, routeEndMode: "RETURN_TO_DEPOT" },
  })).end;
  assert.equal(confirmed.actualAt, "2026-10-08T16:55:00.000Z");
  assert.equal(confirmed.actualLabel, "Return confirmed");
  assert.equal(confirmed.observedFromGps, false);

  const unobserved = (overrides) => buildRouteEndpointPresentation(returnInput(overrides)).end;
  const lastStop = { deliveryStopId: "s2", deliveryStopStatus: "DELIVERED", latitude: 43.72, longitude: -79.42, sequence: 2 };
  const firstStop = { deliveryStopId: "s1", deliveryStopStatus: "DELIVERED", latitude: 43.7, longitude: -79.4, sequence: 1 };
  for (const [name, overrides] of Object.entries({
    "a stop is not finished": { stops: [firstStop, { ...lastStop, deliveryStopStatus: "ARRIVED" }] },
    "no stop has arrival evidence": { actualArrivalByStopId: {} },
    "the last stop is within the depot radius": { stops: [firstStop, { ...lastStop, latitude: 43.7638, longitude: -79.4749 }] },
    "the depot has no coordinates": { departureLocation: { address: "4475 Chesswood Dr" } },
    "the route ends at the last stop": { executionEvidence: { routeEndMode: "END_AT_LAST_STOP" }, routePlan: { routeEndMode: "END_AT_LAST_STOP", scheduledStartAt: "2026-10-08T13:00:00.000Z" } },
    "no tracking snapshot is loaded": { trackingSnapshot: null },
  })) {
    const end = unobserved(overrides);
    assert.equal(end.observedFromGps, false, name);
    if (name !== "the route ends at the last stop") assert.equal(end.actualAt, null, name);
  }
});

test("a skipped or cancelled stop does not block the observed return", () => {
  const input = returnInput();
  const end = buildRouteEndpointPresentation({
    ...input,
    stops: [...input.stops, { deliveryStopId: "s3", deliveryStopStatus: "CANCELLED", latitude: 43.75, longitude: -79.45, sequence: 3 }],
  }).end;
  assert.equal(end.actualAt, "2026-10-08T16:50:00.000Z");
});

test("a finished stop without arrival evidence is flagged only once arrival evidence has loaded", () => {
  const stops = [
    { deliveryStopId: "s1", deliveryStopStatus: "DELIVERED", estimatedArrivalAt: "2026-10-08T15:00:00.000Z", sequence: 1 },
    { deliveryStopId: "s2", deliveryStopStatus: "DELIVERED", estimatedArrivalAt: "2026-10-08T16:23:00.000Z", sequence: 2 },
    { deliveryStopId: "s3", deliveryStopStatus: "PENDING", estimatedArrivalAt: "2026-10-08T17:00:00.000Z", sequence: 3 },
    { deliveryStopId: "s4", deliveryStopStatus: "CANCELLED", estimatedArrivalAt: "2026-10-08T17:20:00.000Z", sequence: 4 },
  ];
  const options = { actualArrivalByStopId: { s1: "2026-10-08T15:02:00.000Z" }, ianaTimezone: "America/Toronto" };
  const loaded = buildChildRouteOrderRows(stops, { ...options, arrivalEvidenceLoaded: true });
  assert.deepEqual(loaded.map((row) => row.arrivalMissing), [false, true, false, false]);
  assert.deepEqual(buildChildRouteOrderRows(stops, options).map((row) => row.arrivalMissing), [false, false, false, false]);

  const routeRows = [{ id: "route-1", routePlanId: "plan-1", stops }];
  const forThisRoute = buildRouteOrderRows(routeRows, { ...options, actualArrivalRoutePlanId: "plan-1", arrivalEvidenceLoaded: true });
  const forAnotherRoute = buildRouteOrderRows(routeRows, { ...options, actualArrivalRoutePlanId: "plan-2", arrivalEvidenceLoaded: true });
  assert.equal(forThisRoute[1].arrivalMissing, true);
  assert.equal(forAnotherRoute[1].arrivalMissing, false);
});

test("tracking times use one fixed store-time format and the table marks missing evidence instead of faking it", async () => {
  const { formatStoreInstant } = await import("../app/features/shopify/store-date-time.js");
  const { translate } = await import("../app/i18n/i18n.js");
  assert.equal(formatStoreInstant("2026-10-08T18:18:22.000Z", "America/Toronto", { empty: "–", seconds: true }), "2026-10-08 14:18:22 EDT");

  const trackingTimestamp = routeDetailSource.slice(
    routeDetailSource.indexOf("function formatTrackingTimestamp("),
    routeDetailSource.indexOf("function isRouteDispatched("),
  );
  assert.match(trackingTimestamp, /formatStoreInstant\(value, ianaTimezone, \{ empty: ROUTE_EMPTY_LABEL, seconds: true \}\)/);
  assert.doesNotMatch(trackingTimestamp, /Intl\.DateTimeFormat\(undefined/);

  const etaCell = routeDetailSource.slice(
    routeDetailSource.indexOf("function renderChildRouteEta("),
    routeDetailSource.indexOf("// Amount follows the ETA treatment"),
  );
  assert.match(etaCell, /row\?\.arrivalMissing/);
  assert.match(etaCell, /No arrival event was recorded/);

  assert.match(routeDetailSource, /buildRouteEndpointPresentation\(\{[\s\S]*trackingSnapshot: displayedRouteTrackingSnapshot/);
  assert.match(routeDetailSource, /arrivalEvidenceLoaded: Array\.isArray\(displayedRouteTrackingSnapshot\?\.stopArrivals\)/);
  assert.match(routeDetailSource, /routeEndpointPresentation\.end\.observedFromGps/);
  assert.equal(translate("en", "routes.detail.tracking.return.OBSERVED"), "Observed (GPS)");
  assert.equal(translate("ko", "routes.detail.tracking.return.OBSERVED"), "GPS 관측");
});

test("End shows the leg back to the depot so the Drive time column adds up to the route total", () => {
  const stops = [
    { deliveryStopId: "s1", distanceFromPreviousMeters: 9_100, durationFromPreviousSeconds: 840, sequence: 1, serviceMinutes: 5 },
    { deliveryStopId: "s2", distanceFromPreviousMeters: 6_000, durationFromPreviousSeconds: 660, sequence: 2, serviceMinutes: 5 },
    { deliveryStopId: "s3", distanceFromPreviousMeters: 3_100, durationFromPreviousSeconds: 360, sequence: 3, serviceMinutes: 5 },
  ];
  const input = (overrides = {}) => ({
    departureLocation: { address: "4475 Chesswood Dr" },
    executionEvidence: { routeEndMode: "RETURN_TO_DEPOT" },
    ianaTimezone: "America/Toronto",
    routeMetrics: { distanceMeters: 30_600, durationSeconds: 2_880 },
    routePlan: { routeEndMode: "RETURN_TO_DEPOT", scheduledStartAt: "2026-10-08T13:00:00.000Z" },
    stops,
    ...overrides,
  });

  const end = buildRouteEndpointPresentation(input()).end;
  assert.equal(end.returnLegSeconds, 1_020);
  assert.equal(end.returnLegMeters, 12_400);
  assert.equal(end.driveTime, "17 min / 12 km");
  assert.equal(stops.reduce((total, stop) => total + stop.durationFromPreviousSeconds, 0) + end.returnLegSeconds, 2_880);
  assert.equal(buildRouteEndpointPresentation(input()).start.driveTime, undefined);

  assert.equal(buildRouteEndpointPresentation(input({ routeMetrics: { durationSeconds: 2_880 } })).end.driveTime, "17 min");
  assert.equal(buildRouteEndpointPresentation(input({ stops: stops.map((stop, index) => index === 1 ? { ...stop, distanceFromPreviousMeters: undefined } : stop) })).end.driveTime, "17 min");

  const none = (overrides) => buildRouteEndpointPresentation(input(overrides)).end;
  for (const [name, overrides] of Object.entries({
    "the route ends at the last stop": { executionEvidence: { routeEndMode: "END_AT_LAST_STOP" }, routePlan: { routeEndMode: "END_AT_LAST_STOP", scheduledStartAt: "2026-10-08T13:00:00.000Z" } },
    "a stop has no drive duration": { stops: stops.map((stop, index) => index === 0 ? { ...stop, durationFromPreviousSeconds: undefined } : stop) },
    "the route has no metrics": { routeMetrics: null },
    "the total is smaller than the stop legs": { routeMetrics: { distanceMeters: 30_600, durationSeconds: 1_000 } },
    "the total has no return leg": { routeMetrics: { distanceMeters: 18_200, durationSeconds: 1_860 } },
    "there are no stops": { stops: [] },
  })) {
    assert.equal(none(overrides).driveTime, "–", name);
    assert.equal(none(overrides).returnLegSeconds, null, name);
  }
});

test("both End rows print the leg back to the depot in the Drive time column", () => {
  for (const name of ["renderRouteEndpointOrderRow", "renderRouteEndpointTrackingRow"]) {
    const start = routeDetailSource.indexOf(`function ${name}(`);
    const row = routeDetailSource.slice(start, routeDetailSource.indexOf("\n}\n", start));
    assert.match(row, /endpoint\?\.driveTime \?\? ROUTE_EMPTY_LABEL/, name);
  }
});
