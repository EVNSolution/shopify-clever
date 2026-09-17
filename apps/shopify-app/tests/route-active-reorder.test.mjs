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
    "function countRouteStopsByStatus(",
  );
  return Function(`${helperSource}\nreturn { isRouteExecutionLockedForStopMembership, isRouteExecutionInProgressForStopMembership, isRouteStopReorderAllowed };`)();
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
