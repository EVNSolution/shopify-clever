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
  formatStoreLocalDateTimeInput,
  formatStoreLocalOrderDate,
  isMaterializedChildRouteDetail,
  storeLocalDateTimeToIso,
} from "../app/features/delivery/child-route-detail-presentation.js";

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
    { ianaTimezone: "America/New_York", timezoneAbbreviation: "ET" },
  );

  assert.deepEqual(rows.map((row) => row.order), ["#1001", "#1002"]);
  assert.deepEqual(rows.map((row) => row.stop), [1, 2]);
  assert.deepEqual(rows.map((row) => row.status), ["Ready", "Completed"]);
  assert.equal(rows[1].orderDate, "06.30 14:20");
  assert.equal(rows[1].eta, "12:00 EDT");
  assert.equal(rows[1].driveTime, "16m · 7.4km");
  assert.equal(rows[1].stopTime, "5m");
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
    "Order",
    "Status",
    "Order date",
    "Address",
    "ETA (est.)",
    "Drive time",
    "Stop time",
    "Customer",
    "Items",
    "Method",
    "Payment",
    "Attributes",
    "Actions",
  ]);

  assert.match(routeDetailSource, /aria-label="Child route order stops"/);
  assert.match(routeDetailSource, /CHILD_ROUTE_ORDER_COLUMNS\.map\(\(column\) =>/);
  assert.match(routeDetailSource, /childRouteOrderRows\.map\(\(row\) =>/);
  assert.match(routeDetailSource, /<td style=\{childRouteOrderCellStyle\}>\{row\.payment\}<\/td>/);
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
  assert.match(routeDetailSource, />\s*Edit stop\s*<\/button>/);
  assert.match(routeDetailSource, />\s*Remove from group\s*<\/button>/);
  assert.match(routeDetailSource, />\s*Send to route\s*<\/button>/);
  assert.match(routeDetailSource, />\s*View in Shopify\s*<\/a>/);
  assert.match(routeDetailSource, />\s*Open tracking\s*<\/button>/);
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

test("child stop actions call server intents only for status and CLEVER field edits", () => {
  assert.match(routeDetailSource, /submitRouteAction\("transitionRouteStop"/);
  assert.match(routeDetailSource, /submitRouteAction\("updateRouteStop"/);
  assert.doesNotMatch(routeDetailSource, /\["deliveryArea", "Delivery area"\]/);
  assert.doesNotMatch(routeDetailSource, /\["deliveryNote", "Delivery note"\]/);
  assert.doesNotMatch(routeDetailSource, /\["serviceType", "Service type"\]/);
  assert.match(routeDetailSource, /const canDraftEditChildStopMembership = !isRouteExecutionLockedForStopMembership\(routeExecutionStatus\)/);
  assert.match(routeDetailSource, /disabled=\{!canDraftEditChildStopMembership\}/);
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
  assert.match(routeDetailSource, /onMouseEnter=\{\(event\) => handleChildOrderDisclosureMouseEnter\(event, row\.id, "items"\)\}/);
  assert.match(routeDetailSource, /onMouseEnter=\{\(event\) => handleChildOrderDisclosureMouseEnter\(event, row\.id, "items"\)\}\s+onMouseLeave=\{handleChildOrderDisclosureMouseLeave\}/);
  assert.match(routeDetailSource, /onMouseEnter=\{\(event\) => handleChildOrderDisclosureMouseEnter\(event, row\.id, "attributes"\)\}/);
  assert.match(routeDetailSource, /onMouseEnter=\{\(event\) => handleChildOrderDisclosureMouseEnter\(event, row\.id, "attributes"\)\}\s+onMouseLeave=\{handleChildOrderDisclosureMouseLeave\}/);
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
  assert.match(routeDetailSource, /style=\{isMaterializedChildRouteDetail \? routeChildOverviewHeaderStyle : routeOverviewHeaderStyle\}/);
  assert.match(routeDetailSource, /onClick=\{handleViewInventory\}[\s\S]*View inventory/);
  assert.doesNotMatch(routeDetailSource, />Inventory<\/button>[\s\S]*role="tab"/);
});

test("child detail tabs reuse one map while swapping Stops and Tracking layers", () => {
  const tabsIndex = routeDetailSource.indexOf('aria-label="Child route detail sections"');
  const timelineIndex = routeDetailSource.indexOf('aria-label="Child route stop timeline"');
  const trackingIndex = routeDetailSource.indexOf('aria-label="Child route tracking"');
  const tabHandlerStart = routeDetailSource.indexOf("const handleChildDetailTabChange = (nextTab) => {");
  const tabHandlerEnd = routeDetailSource.indexOf("const handleToggleRoutePolygonEditMode", tabHandlerStart);
  const tabHandlerSource = routeDetailSource.slice(tabHandlerStart, tabHandlerEnd);

  assert.ok(tabsIndex >= 0 && tabsIndex < timelineIndex);
  assert.ok(tabsIndex < trackingIndex);
  assert.match(routeDetailSource, /const \[childDetailTab, setChildDetailTab\] = useState\("stops"\)/);
  assert.match(routeDetailSource, /const isTrackingMapView = isMaterializedChildRouteDetail && childDetailTab === "tracking"/);
  assert.doesNotMatch(routeDetailSource, /const routeMapViewKey =/);
  assert.match(routeDetailSource, /role="tablist"/);
  assert.match(routeDetailSource, /handleChildDetailTabChange\("stops"\)/);
  assert.match(routeDetailSource, /handleChildDetailTabChange\("tracking"\)/);
  assert.match(routeDetailSource, />Stops<\/span>/);
  assert.match(routeDetailSource, />Tracking<\/span>/);
  assert.match(routeDetailSource, /childDetailTab === "stops"/);
  assert.match(routeDetailSource, /childDetailTab === "tracking"/);
  assert.match(routeDetailSource, /ariaLabel=\{isTrackingMapView \? "Recorded GPS tracking map" : "Route stop location map"\}/);
  assert.match(routeDetailSource, /canvasKey=\{mapRenderKey\}/);
  assert.doesNotMatch(routeDetailSource, /key=\{routeMapViewKey\}/);
  assert.match(routeDetailSource, />Planned route</);
  assert.match(routeDetailSource, />Actual GPS tracking</);
  assert.doesNotMatch(routeDetailSource, /Road-matched GPS path|Unconfirmed GPS movement|Current GPS position/);
  assert.match(routeDetailSource, /\[mapRenderKey, scheduleMapRecovery\]/);
  assert.doesNotMatch(routeDetailSource, /\[isTrackingMapView, mapRenderKey, scheduleMapRecovery\]/);
  assert.match(
    routeDetailSource,
    /hasInitialRouteMapFitRef\.current = false;\s*hasTrackingGpsFitRef\.current = false;\s*\}, \[effectiveRoutePlan\?\.id, isTrackingMapView, mapRenderKey\]\);/,
  );
  assert.ok(tabHandlerStart >= 0 && tabHandlerEnd > tabHandlerStart);
  assert.doesNotMatch(tabHandlerSource, /clearMapRecoveryTimer|mapLoadedRef|setIsMapReady|setMapStatus/);
  assert.match(routeDetailSource, /if \(!isTrackingMapView\) bindStopLayerHandlers\(\)/);
  assert.match(routeDetailSource, /if \(mapCanvas\?\.style\.cursor === "pointer"\) mapCanvas\.style\.cursor = "";/);
  assert.match(routeDetailSource, /aria-label="Child route tracking"/);
});
