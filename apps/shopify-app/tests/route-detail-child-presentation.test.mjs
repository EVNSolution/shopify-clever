/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  CHILD_ROUTE_ORDER_COLUMNS,
  buildChildRouteOrderRows,
  formatChildDriveTimeLabel,
  formatChildEtaLabel,
  formatChildOrderStatus,
  formatChildStopTimeLabel,
  formatStoreLocalOrderDate,
  isMaterializedChildRouteDetail,
} from "../app/features/delivery/child-route-detail-presentation.js";

const root = process.cwd();
const routeDetailSource = readFileSync(join(root, "app/routes/app.routes.$routeId.jsx"), "utf8");

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
  assert.equal(formatChildOrderStatus("preparing"), "Preparing");
  assert.equal(formatChildOrderStatus("ready"), "Preparing");
  assert.equal(formatChildOrderStatus("in_progress"), "In progress");
  assert.equal(formatChildOrderStatus("completed"), "Completed");
  assert.equal(formatChildOrderStatus("DRAFT"), "Preparing");
  assert.equal(formatChildOrderStatus("PUBLISHED"), "Preparing");
});

test("child row date and ETA formatting uses store-local time and dynamic timezone abbreviation", () => {
  assert.equal(
    formatStoreLocalOrderDate("2026-06-30T18:20:00.000Z", "America/New_York"),
    "06.30 14:20",
  );
  assert.equal(
    formatChildEtaLabel("2026-01-15T16:00:00.000Z", "America/New_York", "ET"),
    "11:00 EST",
  );
  assert.equal(
    formatChildEtaLabel("2026-07-15T16:00:00.000Z", "America/New_York", "ET"),
    "12:00 EDT",
  );
});

test("child route compact metrics use read-only drive and stop labels", () => {
  assert.equal(formatChildDriveTimeLabel(960, 7400), "16m · 7.4km");
  assert.equal(formatChildDriveTimeLabel(60, 80), "1m · 80m");
  assert.equal(formatChildStopTimeLabel(5), "5m");
});

test("child order rows follow actual child sequence and use delivery serviceType only", () => {
  const rows = buildChildRouteOrderRows(
    [
      {
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
        paymentMethodTitle: "Cash",
      },
    ],
    { ianaTimezone: "America/New_York", timezoneAbbreviation: "ET" },
  );

  assert.deepEqual(rows.map((row) => row.order), ["#1001", "#1002"]);
  assert.deepEqual(rows.map((row) => row.stop), [1, 2]);
  assert.deepEqual(rows.map((row) => row.status), ["Preparing", "Completed"]);
  assert.equal(rows[1].orderDate, "06.30 14:20");
  assert.equal(rows[1].eta, "12:00 EDT");
  assert.equal(rows[1].driveTime, "16m · 7.4km");
  assert.equal(rows[1].stopTime, "5m");
  assert.equal(rows[1].customer, "Second Customer");
  assert.equal(rows[1].itemsSummary, "2 items");
  assert.equal(rows[1].method, "EVENING_DELIVERY");
  assert.notEqual(rows[1].method, "Visa");
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

test("child order table columns are exact and excluded columns stay out of the child branch", () => {
  assert.deepEqual(CHILD_ROUTE_ORDER_COLUMNS.map((column) => column.label), [
    "Stop",
    "Order",
    "Status",
    "Order date",
    "Address",
    "ETA",
    "Drive time",
    "Stop time",
    "Customer",
    "Items",
    "Method",
    "Attributes",
  ]);

  assert.match(routeDetailSource, /aria-label="Child route order stops"/);
  assert.match(routeDetailSource, /CHILD_ROUTE_ORDER_COLUMNS\.map\(\(column\) =>/);
  assert.match(routeDetailSource, /childRouteOrderRows\.map\(\(row\) =>/);
  assert.doesNotMatch(routeDetailSource, /aria-label="Open Shopify order"/);
  assert.doesNotMatch(routeDetailSource, /aria-label="Remove order from route"/);
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

test("child timeline renders distinct circular Start and End markers", () => {
  assert.match(routeDetailSource, /function renderChildRouteTimelineStartMarker\(\)/);
  assert.match(routeDetailSource, /function renderChildRouteTimelineEndMarker\(\)/);
  assert.match(routeDetailSource, /aria-label="Route start"/);
  assert.match(routeDetailSource, /aria-label="Route end"/);
  assert.match(routeDetailSource, /childRouteTimelineEndStyle/);
  assert.match(routeDetailSource, />End<\/span>/);
  assert.match(routeDetailSource, /childRouteTimelineOrderLabelStyle/);
  assert.match(routeDetailSource, /<span style=\{childRouteTimelineOrderLabelStyle\}>\{stop\.order\}<\/span>/);
  assert.doesNotMatch(routeDetailSource, /position: "sticky"/);
  assert.match(routeDetailSource, /onDragStart=\{\(event\) => handleRouteTimelineDragStart\(event, routeRow, stop\)\}/);
  assert.match(routeDetailSource, /onClick=\{handleSaveRouteDraft\}/);
  assert.match(routeDetailSource, /Drop orders here to remove them from the route/);
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
  assert.match(routeDetailSource, /<th key=\{column\.key\} style=\{childRouteOrderHeaderCellStyle\}>\{column\.label\}<\/th>/);
});

test("child timeline keeps breathing room and stop digits share a browser-neutral optical correction", () => {
  assert.match(routeDetailSource, /const childRouteTimelineStyle = \{[\s\S]*padding: "8px 8px 16px"/);
  assert.match(routeDetailSource, /aria-label="Child route stop timeline"[\s\S]*style=\{childRouteTimelineStyle\}/);
  assert.match(routeDetailSource, /const childRouteTableStopMarkerStyle = \{[\s\S]*display: "flex"[\s\S]*margin: "0 auto"/);
  assert.match(routeDetailSource, /const routeNumberMarkerGlyphStyle = \{[\s\S]*lineHeight: 1[\s\S]*transform: "translateY\(0\.1em\)"/);
  assert.match(routeDetailSource, /const childRouteTableStopMarkerTextStyle = \{[\s\S]*\.\.\.routeNumberMarkerGlyphStyle[\s\S]*fontSize: "11px"[\s\S]*fontWeight: 700/);
  assert.match(routeDetailSource, /<span style=\{routeNumberMarkerGlyphStyle\}>\{stop\.stop\}<\/span>/);
  assert.match(routeDetailSource, /<span style=\{childRouteTableStopMarkerStyle\}><span style=\{childRouteTableStopMarkerTextStyle\}>\{row\.stop\}<\/span><\/span>/);
  assert.doesNotMatch(routeDetailSource, /textBox:/);
});

test("Items and Attributes use hover and click disclosures in a fixed portal overlay", () => {
  assert.match(routeDetailSource, /createPortal/);
  assert.match(routeDetailSource, /position: "fixed"/);
  assert.match(routeDetailSource, /data-child-order-disclosure-trigger="true"/);
  assert.match(routeDetailSource, /data-child-order-disclosure-popover="true"/);
  assert.match(routeDetailSource, /onMouseEnter=\{\(event\) => handleChildOrderDisclosureMouseEnter\(event, row\.id, "items"\)\}/);
  assert.match(routeDetailSource, /onMouseEnter=\{\(event\) => handleChildOrderDisclosureMouseEnter\(event, row\.id, "attributes"\)\}/);
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
