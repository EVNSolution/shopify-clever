import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeDetailSource = readFileSync(
  new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url),
  "utf8",
);
const routeDetailServerSource = readFileSync(
  new URL("../app/features/delivery/route-detail.server.js", import.meta.url),
  "utf8",
);

function sourceBetween(start, end) {
  const startIndex = routeDetailSource.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source start: ${start}`);
  const endIndex = routeDetailSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source end: ${end}`);
  return routeDetailSource.slice(startIndex, endIndex);
}

function loadStatusHelpers() {
  const helperSource = sourceBetween(
    "function isRouteExecutionLockedForStopMembership(",
    "function getRouteTotalItems(",
  );
  return Function(`${helperSource}\nreturn { isRouteExecutionLockedForStopMembership, isRouteExecutionInProgressForStopMembership, isRouteStopReorderAllowed, isRouteTimelineStopMoveAllowed, hasTerminalRouteStopDraft };`)();
}

function loadReorderPayloadBuilder() {
  const helperSource = sourceBetween(
    "function buildRouteStopReorderPayload(",
    "function renderRouteHeaderMetric(",
  );
  return Function(`${helperSource}\nreturn buildRouteStopReorderPayload;`)();
}

test("started routes allow same-route reordering while terminal routes stay locked", () => {
  const {
    isRouteExecutionInProgressForStopMembership,
    isRouteExecutionLockedForStopMembership,
    isRouteStopReorderAllowed,
  } = loadStatusHelpers();

  assert.equal(isRouteStopReorderAllowed("READY"), true);
  assert.equal(isRouteStopReorderAllowed("IN_PROGRESS"), true);
  assert.equal(isRouteStopReorderAllowed("EN-ROUTE"), true);
  assert.equal(isRouteStopReorderAllowed("COMPLETED"), false);
  assert.equal(isRouteStopReorderAllowed("CANCELLED"), false);
  assert.equal(isRouteExecutionInProgressForStopMembership("IN_PROGRESS"), true);
  assert.equal(isRouteExecutionInProgressForStopMembership("In progress"), true);
  assert.equal(isRouteExecutionLockedForStopMembership("IN_PROGRESS"), true);
  assert.equal(isRouteExecutionLockedForStopMembership("In progress"), true);
});

test("standalone reorder payload preserves the exact saved stop set", () => {
  const buildRouteStopReorderPayload = loadReorderPayloadBuilder();
  const first = {
    deliveryStopId: "stop-1",
    id: "stop-1",
    shopifyOrderGid: "gid://shopify/Order/1",
  };
  const second = {
    deliveryStopId: "stop-2",
    id: "stop-2",
    shopifyOrderGid: "gid://shopify/Order/2",
  };

  assert.deepEqual(buildRouteStopReorderPayload([second, first], [first, second]), [
    { deliveryStopId: "stop-2", shopifyOrderGid: "gid://shopify/Order/2", sequence: 1 },
    { deliveryStopId: "stop-1", shopifyOrderGid: "gid://shopify/Order/1", sequence: 2 },
  ]);
  assert.equal(buildRouteStopReorderPayload([first], [first, second]), null);
  assert.equal(buildRouteStopReorderPayload([first, { ...second, deliveryStopId: "stop-3", id: "stop-3" }], [first, second]), null);
});

test("incomplete routes keep membership and reorder terminal guards", () => {
  const helpers = loadStatusHelpers();
  assert.equal(helpers.isRouteExecutionLockedForStopMembership("INCOMPLETE"), true);
  assert.equal(helpers.isRouteExecutionInProgressForStopMembership("INCOMPLETE"), false);
  assert.equal(helpers.isRouteStopReorderAllowed("INCOMPLETE"), false);
});

test("mixed route groups protect incomplete source and destination while ready routes remain editable", () => {
  const { isRouteTimelineStopMoveAllowed } = loadStatusHelpers();
  const ready = { id: "ready", status: "Ready" };
  const anotherReady = { id: "another-ready", status: "READY" };
  const incomplete = { id: "incomplete", status: "Incomplete" };
  assert.equal(isRouteTimelineStopMoveAllowed(ready, ready), true);
  assert.equal(isRouteTimelineStopMoveAllowed(ready, anotherReady), true);
  assert.equal(isRouteTimelineStopMoveAllowed(incomplete, incomplete), false);
  assert.equal(isRouteTimelineStopMoveAllowed(incomplete, ready), false);
  assert.equal(isRouteTimelineStopMoveAllowed(ready, incomplete), false);
  assert.equal(isRouteTimelineStopMoveAllowed(undefined, ready), false);
  const active = { id: "active", status: "IN_PROGRESS" };
  assert.equal(isRouteTimelineStopMoveAllowed(active, active), true);
  assert.equal(isRouteTimelineStopMoveAllowed(active, ready), false);
});

test("mixed-group drag, send, polygon, removal, and save handlers apply row-level guards", () => {
  assert.match(sourceBetween("const moveDraggedTimelineStop = ", "const handleRouteTimelineDragStart = "), /isRouteTimelineStopMoveAllowed\(sourceRouteRow, targetRouteRow\)/);
  assert.match(sourceBetween("const handleRouteTimelineDragStart = ", "const handleRouteTimelineStopClick = "), /isRouteStopReorderAllowed\(routeRow.status\)/);
  assert.match(sourceBetween("const handleSendChildStopToRoute = ", "const handleOpenChildStopSendTargets = "), /isRouteTimelineStopMoveAllowed\(sourceRouteRow, targetRouteRow\)/);
  assert.match(sourceBetween("const removeChildStopFromGroup = ", "const handleRemoveChildStopFromGroup = "), /isRouteExecutionLockedForStopMembership\(sourceRouteRow.status\)/);
  assert.match(sourceBetween("const handleRouteTimelineRemoveDrop = ", "const submitRouteAction = "), /isRouteExecutionLockedForStopMembership\(sourceRouteRow.status\)/);
  assert.match(sourceBetween("const handleAssignPolygonToRoute = ", "const handleOpenRouteSelector = "), /isRouteTimelineStopMoveAllowed\(routeRow, targetRouteRow\)/);
  assert.match(sourceBetween("const canSaveRouteDraft = ", "const routePolygonSourceStops = "), /hasTerminalRouteStopDraft\(contextRouteRows, routeTimelineOrderByRouteId\)/);
});

test("ready child reorder remains saveable beside an unchanged incomplete sibling", () => {
  const { hasTerminalRouteStopDraft } = loadStatusHelpers();
  const source = sourceBetween("function getTimelineRouteStopIds(", "function buildTimelineRows(");
  const moveTimelineStop = Function(`${source}\nreturn moveTimelineStop;`)();
  const rows = [
    { id: "ready", status: "READY", stops: [{ id: "a" }, { id: "b" }] },
    { id: "history", status: "INCOMPLETE", stops: [{ id: "c" }, { id: "d" }] },
  ];
  const draft = moveTimelineStop(rows, {}, { stopId: "a" }, "ready");
  assert.deepEqual(draft, { ready: ["b", "a"], history: ["c", "d"] });
  assert.equal(hasTerminalRouteStopDraft(rows, draft), false);
  assert.equal(hasTerminalRouteStopDraft(rows, { ...draft, history: ["d", "c"] }), true);
  assert.equal(hasTerminalRouteStopDraft(rows, { ...draft, history: ["c"] }), true);
});

test("active drag and save paths keep membership and driver assignment protected", () => {
  const moveHandler = sourceBetween(
    "const moveDraggedTimelineStop = useCallback(",
    "const handleRouteTimelineDragStart = ",
  );
  const removeHandler = sourceBetween(
    "const handleRouteTimelineRemoveDrop = ",
    "const submitRouteAction = ",
  );
  const driverHandler = sourceBetween(
    "const handleOpenRouteSelector = ",
    "const handleSelectRouteDriver = ",
  );
  const saveHandler = sourceBetween(
    "const handleSaveRouteDraft = ",
    "const handleSaveRouteDraftAndLeave = ",
  );

  assert.match(moveHandler, /routeMembershipChangeIsInProgress[\s\S]*targetRouteId !== drag\.routeId[\s\S]*return/);
  assert.match(removeHandler, /if \(!canDraftEditChildStopMembership\) return/);
  assert.match(driverHandler, /selectorType === "driver"[\s\S]*isRouteExecutionLockedForStopMembership/);
  assert.match(saveHandler, /const isStandaloneRouteReorder = !routeGroupId && !isOrdinarySplitDraft && routeMembershipChangeIsInProgress/);
  assert.match(saveHandler, /submitRouteAction\("saveRouteStops", \{[\s\S]*stops: JSON\.stringify\(standaloneReorderStops\)/);
  assert.match(routeDetailSource, /draggable=\{canReorderRouteStops/);
});

test("standalone Save reaches the stop endpoint and Dispatch remains a separate explicit action", () => {
  assert.match(routeDetailServerSource, /import \{ saveRouteStopOrder \} from "\.\/route-stop-order\.server"/);
  assert.match(routeDetailServerSource, /intent === "saveRouteStops"/);
  assert.match(routeDetailServerSource, /saveRouteStopOrder\([\s\S]*routeId,[\s\S]*formData\.get\("stops"\)/);
  assert.match(routeDetailSource, /const handleDispatchRoute = \(\) => submitRouteAction\("dispatchRoute"\)/);
});
