import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import { normalizeRouteExecutionStatus } from "../app/features/delivery/route-helpers.js";

const source = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");

function sourceBetween(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const statusHelpers = sourceBetween("function isRouteExecutionLockedForStopMembership(", "function getRouteTotalItems(");
const timelineHelpers = sourceBetween("function getTimelineRouteStopIds(", "function buildTimelineRows(");
const removalHandlers = sourceBetween(
  source.includes("const canRemoveChildStopFromGroup = ") ? "const canRemoveChildStopFromGroup = " : "const removeChildStopFromGroup = ",
  "const handleSendChildStopToRoute = ",
);
const markHandler = sourceBetween("const handleMarkChildStopStatus = ", "const canEditStopRow = ");
const menuStart = source.indexOf('aria-label={`Actions for ${activeChildStopActionsRow.order}`}');
const menuButtonStart = source.indexOf("<button", menuStart);
const menuButtonEnd = source.indexOf('<div style={childStopActionsDividerStyle}', menuButtonStart);
const removalLabel = source.indexOf("Remove from group", menuButtonEnd);
const removalButtonStart = source.lastIndexOf("<button", removalLabel);
const removalButtonEnd = source.indexOf("</button>", removalLabel) + "</button>".length;
const buttonsSource = source.slice(menuButtonStart, menuButtonEnd) + source.slice(removalButtonStart, removalButtonEnd);
const compiledButtons = ts.transpileModule(`const tree = (<div>${buttonsSource}</div>);`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function renderStopActions(sourceStatus, overrides = {}) {
  const readyStop = { id: "ready-stop", deliveryStopId: "delivery-ready", orderId: "order-ready", order: "#1", status: "Ready" };
  const historyStop = { id: "history-stop", deliveryStopId: "delivery-history", orderId: "order-history", order: "#2", status: "Ready" };
  const routeRows = [
    { id: "ready-route", status: "READY", stops: [readyStop] },
    { id: "history-route", status: sourceStatus, stops: [historyStop] },
  ];
  const state = { removedOrderIds: [], routeTimelineOrderByRouteId: {}, preview: { retained: true }, activeMenu: { rowId: historyStop.id }, pending: null, submitted: [], animations: 0 };
  const context = {
    React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) },
    normalizeRouteExecutionStatus,
    timelineRouteRows: routeRows,
    routeRows,
    canAddOrRemoveChildStops: true,
    routeMembershipChangeIsInProgress: false,
    activeChildStopActionsRow: historyStop,
    activeChildStopActions: { actionKey: "action-1" },
    routeGroupActionBusy: false,
    effectiveRoutePlan: { id: "history-route" },
    childStopActionsMenuItemStyle: { cursor: "pointer", opacity: 1 },
    setRoutePreviewByKey: (value) => { state.preview = value; },
    setRemovedOrderIds: (update) => { state.removedOrderIds = update(state.removedOrderIds); },
    animateRouteTimelineChange: (update) => { state.animations += 1; update(); },
    setRouteTimelineOrderByRouteId: (update) => { state.routeTimelineOrderByRouteId = update(state.routeTimelineOrderByRouteId); },
    setActiveChildStopActions: (value) => { state.activeMenu = value; },
    setPendingInProgressRouteChange: (value) => { state.pending = value; },
    submitRouteAction: (...args) => { state.submitted.push(args); },
    ...overrides,
  };
  const run = new Function(...Object.keys(context), `${statusHelpers}\n${timelineHelpers}\n${removalHandlers}\n${markHandler}\n${compiledButtons}\nreturn { tree, handleRemoveChildStopFromGroup, removeChildStopFromGroup };`);
  return { ...run(...Object.values(context)), state, readyStop, historyStop };
}

function text(node) {
  return typeof node === "object" ? node.children.map(text).join("") : String(node);
}

function button(tree, label) {
  return tree.children.find((node) => node.type === "button" && text(node).trim() === label);
}

for (const sourceStatus of ["INCOMPLETE", "COMPLETED", "CANCELLED", "UNKNOWN"]) {
  test(`mixed group ${sourceStatus} child uses the same disabled, style and handler removal guard`, () => {
    const result = renderStopActions(sourceStatus);
    const remove = button(result.tree, "Remove from group");
    assert.equal(remove.props.disabled, true);
    assert.equal(remove.props.style.cursor, "not-allowed");
    assert.equal(remove.props.style.opacity, 0.55);
    // Direct handler invocation must also protect a stale or programmatic click.
    remove.props.onClick();
    result.removeChildStopFromGroup(result.historyStop);
    assert.deepEqual(result.state.removedOrderIds, []);
    assert.deepEqual(result.state.routeTimelineOrderByRouteId, {});
    assert.deepEqual(result.state.preview, { retained: true });
    assert.equal(result.state.animations, 0);
    assert.equal(result.state.pending, null);
  });

  test(`mixed group READY sibling remains removable beside ${sourceStatus}`, () => {
    const fixture = renderStopActions(sourceStatus);
    const result = renderStopActions(sourceStatus, { activeChildStopActionsRow: fixture.readyStop });
    const remove = button(result.tree, "Remove from group");
    assert.equal(remove.props.disabled, false);
    assert.equal(remove.props.style.cursor, "pointer");
    remove.props.onClick();
    assert.deepEqual(result.state.removedOrderIds, ["order-ready"]);
    assert.deepEqual(result.state.routeTimelineOrderByRouteId, { "ready-route": [], "history-route": ["history-stop"] });
    assert.equal(result.state.animations, 1);
    assert.equal(result.state.activeMenu, null);
  });

  test(`${sourceStatus} child retains the existing Mark as administrator correction`, () => {
    const result = renderStopActions(sourceStatus);
    const completed = button(result.tree, "Completed");
    assert.equal(completed.props.disabled, false);
    completed.props.onClick();
    assert.deepEqual(result.state.submitted, [["transitionRouteStop", {
      deliveryStopId: "delivery-history",
      idempotencyKey: "history-route:delivery-history:COMPLETED:action-1",
      status: "COMPLETED",
    }]]);
    assert.equal(result.state.activeMenu, null);
  });
}

test("missing source child and group-wide lock disable removal and reject handler calls", () => {
  for (const overrides of [
    { activeChildStopActionsRow: { id: "missing-stop", orderId: "missing-order" } },
    { canAddOrRemoveChildStops: false },
  ]) {
    const result = renderStopActions("READY", overrides);
    const remove = button(result.tree, "Remove from group");
    assert.equal(remove.props.disabled, true);
    remove.props.onClick();
    assert.equal(result.state.animations, 0);
    assert.deepEqual(result.state.removedOrderIds, []);
  }
});
