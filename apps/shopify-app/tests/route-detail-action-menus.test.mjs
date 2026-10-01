import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
const stylesSource = source.slice(source.indexOf("const routeMetaActionsStyle ="), source.indexOf("const routeHeaderActionsStyle ="));
const styles = new Function(`${stylesSource}; return { ${[...stylesSource.matchAll(/const (\w+) =/g)].map((match) => match[1]).join(",")} };`)();
const actionsStart = source.indexOf('<section style={routeMetaActionsStyle}>');
const actionsEnd = source.indexOf('{isMaterializedChildRouteDetail && childDetailTab === "stops"', actionsStart);
const actionsSource = source.slice(actionsStart, actionsEnd);
const actionsJsx = actionsSource.slice(0, actionsSource.lastIndexOf("</section>") + "</section>".length);
const compiled = ts.transpileModule(`const tree = (${actionsJsx});`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function renderActions(overrides = {}) {
  const context = {
    ...styles,
    React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child !== null && child !== false && child !== undefined) }) },
    departureLocation: { address: "Test depot" },
    routeDetail: { deliveryDate: "Test date" },
    translate: () => "Add Empty Route",
    language: "en",
    isTrackingMapView: false,
    isMaterializedChildRouteDetail: false,
    isOrdinaryRouteDetail: false,
    isRouteGroupDetail: true,
    routeGroupId: "group-1",
    routeGroupActionBusy: false,
    routeActionsMenu: null,
    hasEditableRouteRows: true,
    reOptimizeRouteGroupBusy: false,
    refreshRouteOrdersBusy: false,
    canRefreshRouteOrders: true,
    hasRouteAllocationDraft: false,
    deleteRouteBusy: false,
    deletedRoutePlanIds: [],
    effectiveRoutePlan: { id: "route-1" },
    setRouteActionsMenu: () => {},
    handleAddOrderToCurrentRoute: () => {},
    handleAddEmptyRoute: () => {},
    handleReverseCurrentRouteStops: () => {},
    handlePreviewRouteOptimization: () => {},
    handleRefreshRouteOrders: () => {},
    handleDeleteRoute: () => {},
    ...overrides,
  };
  return { tree: new Function(...Object.keys(context), `${compiled}; return tree;`)(...Object.values(context)), context };
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...tree.children.flatMap(nodes)];
}
function text(node) {
  return typeof node === "object" ? node.children.map(text).join("") : String(node);
}
function button(tree, label) {
  return nodes(tree).find((node) => node.type === "button" && text(node) === label);
}

test("route actions group existing operations into mutually exclusive Add, Edit and More menus", () => {
  const closed = renderActions().tree;
  assert.deepEqual(nodes(closed).filter((node) => node.type === "button").map(text), ["Add ▾", "Edit ▾", "…"]);
  for (const menu of ["add", "edit", "more"]) {
    const { tree } = renderActions({ routeActionsMenu: menu });
    assert.equal(nodes(tree).filter((node) => node.props.role === "menu").length, 1);
  }
  const { tree, context } = renderActions({ routeActionsMenu: "add" });
  assert.equal(button(tree, "Add order").props.onClick, context.handleAddOrderToCurrentRoute);
  assert.equal(button(tree, "Add Empty Route").props.onClick, context.handleAddEmptyRoute);
  assert.equal(button(tree, "Re-optimize"), undefined);
});

test("ordinary, materialized child and multiple-route groups retain the existing Add and Reverse conditions", () => {
  for (const groupId of ["single-route-group", "multiple-route-group"]) {
    const add = renderActions({ routeGroupId: groupId, routeActionsMenu: "add" }).tree;
    assert.ok(button(add, "Add order"));
    assert.ok(button(add, "Add Empty Route"));
    assert.equal(button(renderActions({ routeGroupId: groupId, routeActionsMenu: "edit" }).tree, "Reverse stops"), undefined);
  }
  for (const variant of [
    { isOrdinaryRouteDetail: true, routeGroupId: null },
    { isMaterializedChildRouteDetail: true, isRouteGroupDetail: false },
  ]) {
    const add = renderActions({ ...variant, routeActionsMenu: "add" }).tree;
    assert.equal(button(add, "Add order"), undefined);
    assert.ok(button(add, "Add Empty Route"));
  }
  const { tree, context } = renderActions({ isMaterializedChildRouteDetail: true, routeActionsMenu: "edit" });
  assert.equal(button(tree, "Reverse stops").props.onClick, context.handleReverseCurrentRouteStops);
});

test("busy and unsaved states preserve existing disabled guards without executing operations", () => {
  const busyAdd = renderActions({ routeGroupActionBusy: true, routeActionsMenu: "add" }).tree;
  assert.equal(button(busyAdd, "Add order").props.disabled, true);
  assert.equal(button(busyAdd, "Add Empty Route").props.disabled, true);
  assert.equal(button(renderActions({ hasEditableRouteRows: false, routeActionsMenu: "edit" }).tree, "Re-optimize").props.disabled, true);
  for (const guard of [{ routeGroupActionBusy: true }, { hasRouteAllocationDraft: true }]) {
    const more = renderActions({ ...guard, routeActionsMenu: "more" }).tree;
    assert.equal(button(more, "Update routes").props.disabled, true);
    assert.equal(button(more, "Delete route").props.disabled, true);
  }
  assert.equal(button(renderActions({ canRefreshRouteOrders: false, routeActionsMenu: "more" }).tree, "Update routes").props.disabled, true);
  assert.equal(button(renderActions({ deletedRoutePlanIds: ["route-1"], routeActionsMenu: "more" }).tree, "Delete pending").props.disabled, true);
});

test("Tracking keeps update/delete available while hiding addition and editing actions", () => {
  const { tree, context } = renderActions({ isTrackingMapView: true, routeActionsMenu: "more", isRouteGroupDetail: false });
  assert.equal(button(tree, "Add ▾"), undefined);
  assert.equal(button(tree, "Edit ▾"), undefined);
  assert.equal(button(tree, "Update route").props.onClick, context.handleRefreshRouteOrders);
  assert.equal(button(tree, "Delete route").props.onClick, context.handleDeleteRoute);
});

test("action row wraps and menu width stays bounded for narrow layouts", () => {
  assert.equal(styles.routeMetaActionsStyle.flexWrap, "wrap");
  assert.equal(styles.routeActionColumnStyle.display, "flex");
  assert.equal(styles.routeActionColumnStyle.flexWrap, "wrap");
  assert.equal(styles.routeActionsMenuStyle.maxWidth, "calc(100vw - 32px)");
});


test("menu triggers toggle one menu, blur closes it and Escape returns focus", () => {
  let menu = null;
  const { tree } = renderActions({ setRouteActionsMenu: (next) => { menu = typeof next === "function" ? next(menu) : next; } });
  button(tree, "Add ▾").props.onClick();
  assert.equal(menu, "add");
  button(tree, "Edit ▾").props.onClick();
  assert.equal(menu, "edit");
  button(tree, "Edit ▾").props.onClick();
  assert.equal(menu, null);
  const toolbar = nodes(tree).find((node) => node.props.role === "toolbar");
  let focused = false;
  toolbar.props.onKeyDown({ key: "Escape", currentTarget: { querySelector: () => ({ focus: () => { focused = true; } }) } });
  assert.equal(focused, true);
  assert.equal(menu, null);
  menu = "more";
  toolbar.props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null });
  assert.equal(menu, null);
});

const controlsStart = source.indexOf('<section aria-label="Route schedule and dispatch"');
const controlsJsx = source.slice(controlsStart, source.indexOf("</section>", controlsStart) + "</section>".length);
const controlsCompiled = ts.transpileModule(`const tree = (${controlsJsx});`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const selectionStylesSource = source.slice(source.indexOf("const routeChildSelectionBarStyle ="), source.indexOf("const routeChildTrackingStyle ="));
const selectionStyles = new Function(`${selectionStylesSource}; return { ${[...selectionStylesSource.matchAll(/const (\w+) =/g)].map((match) => match[1]).join(",")} };`)();
function renderControls(overrides = {}) {
  const base = renderActions().context;
  const context = { ...base, ...selectionStyles,
    isRouteGroupDetail: false, isMaterializedChildRouteDetail: false,
    canDispatchRoute: true, routeGroupActionIntent: null, routeDriverId: "driver-1",
    routeDisabledActionButtonStyle: {}, routeExecutionStatus: "READY", routeDriverSummary: "Test driver",
    currentTimelineRouteRow: { routePlanId: "route-1", startTimeLabel: "09:00", driverLabel: "Test driver" },
    routeStartDateTimeValue: "2026-10-01T09:00", routeStartTimeLabel: "09:00", routeDetailTitle: "Test route", ROUTE_EMPTY_LABEL: "—",
    isRouteExecutionLockedForStopMembership: (status) => ["COMPLETED", "IN_PROGRESS"].includes(status),
    renderRouteEditableChevron: () => "▾", renderRouteHeaderMetric: (label, value) => `${label}: ${value}`,
    handleDispatchRoute: () => {}, handleOpenRouteSelector: () => {}, ...overrides };
  return { tree: new Function(...Object.keys(context), `${controlsCompiled}; return tree;`)(...Object.values(context)), context };
}

test("schedule and driver sit under tabs before the map, Dispatch retains its handler and guards", () => {
  assert.ok(source.indexOf('role="toolbar" style={routeChildTabsStyle}') < controlsStart);
  assert.ok(controlsStart < source.indexOf("<MapPanel", controlsStart));
  assert.ok(source.indexOf('<h1 className="route-detail-title"') < source.indexOf('aria-label="Route detail actions"'));
  const { tree, context } = renderControls();
  assert.equal(button(tree, "Dispatch").props.onClick, context.handleDispatchRoute);
  assert.match(text(tree), /Delivery date: Test date.*Driver: Test driver/);
  for (const guards of [{ canDispatchRoute: false }, { routeGroupActionBusy: true }, { hasRouteAllocationDraft: true }]) {
    assert.equal(button(renderControls(guards).tree, "Dispatch").props.disabled, true);
  }
  for (const routeExecutionStatus of ["READY", "COMPLETED", "IN_PROGRESS"]) {
    const controls = renderControls({ isMaterializedChildRouteDetail: true, routeExecutionStatus }).tree;
    const driver = nodes(controls).find((node) => node.props["aria-label"] === "Change route driver");
    assert.equal(driver.props.disabled, routeExecutionStatus !== "READY");
  }
  assert.equal(selectionStyles.routeChildSelectionBarStyle.flexWrap, "wrap");
  assert.equal(selectionStyles.routeChildSelectionGroupStyle.flexWrap, "wrap");
  assert.equal(selectionStyles.routeChildSelectionGroupStyle.minWidth, 0);
  assert.equal(selectionStyles.routeChildSelectionButtonStyle.maxWidth, "100%");
});


test("Copy keeps its duplicate icon and appears only for a single distinct route", () => {
  const headerStart = source.indexOf('<div aria-label="Route detail actions"');
  const copyEnd = source.indexOf('<div aria-label="Route utilities"', headerStart);
  const copyJsx = `${source.slice(headerStart, copyEnd)}</div>`;
  const copyCompiled = ts.transpileModule(`const tree = (${copyJsx});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const copyConditionStart = source.indexOf("const canShowRouteCopy =");
  const copyCondition = source.slice(copyConditionStart, source.indexOf(";", copyConditionStart) + 1);
  for (const ids of [["route-1"], ["route-1", "route-2"], ["route-1", "route-1"]]) {
    const context = { ...renderActions().context, routeHeaderActionsStyle: {}, routeDisabledActionButtonStyle: {},
      canCopyOrdinaryRoute: true, copyRoutePlanBusy: false, copyRouteGroupBusy: false,
      routeGroup: ids, getVisibleRouteGroupChildren: (group) => group, getRouteGroupChildRoutePlanId: (id) => id,
      handleCopyOrdinaryRoute: () => {}, handleCopyRouteGroup: () => {} };
    const tree = new Function(...Object.keys(context), `${copyCondition}; ${copyCompiled}; return tree;`)(...Object.values(context));
    const copy = button(tree, "Copy Route");
    if (new Set(ids).size > 1) assert.equal(copy, undefined);
    else {
      assert.equal(copy.props.onClick, context.handleCopyRouteGroup);
      assert.ok(nodes(copy).some((node) => node.type === "s-icon" && node.props.type === "duplicate" && node.props["aria-hidden"] === "true"));
    }
  }
});
