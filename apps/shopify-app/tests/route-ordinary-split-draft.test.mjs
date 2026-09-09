/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const source = readFileSync(join(root, "app/routes/app.routes.$routeId.jsx"), "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function loadOrdinaryRoutePresentationHelper() {
  const helperSource = sourceBetween(
    "function isOrdinaryRouteDetailPresentation(",
    "function buildRouteGroupChildRows(",
  );
  return Function(
    "getVisibleRouteGroupChildren",
    "getRouteGroupChildRoutePlanId",
    `${helperSource}\nreturn isOrdinaryRouteDetailPresentation;`,
  )(
    (routeGroup) => routeGroup?.children ?? [],
    (child) => child?.routePlanId ?? child?.routePlan?.id ?? null,
  );
}

function loadRouteDraftPayloadBuilder() {
  const builderSource = sourceBetween("function getRouteRowDraftKey(", "function renderRouteHeaderMetric(");
  return Function(
    "numberOrUndefined",
    `${builderSource}\nreturn buildRouteDraftPayload;`,
  )((value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  });
}

function loadAddEmptyHandler(overrides = {}) {
  const handlerSource = sourceBetween("const handleAddEmptyRoute = () => {", "const handleReverseCurrentRouteStops = () => {");
  const dependencyNames = [
    "routeGroupActionBusy", "setIsRouteActionsMenuOpen", "canDraftEditChildStopMembership",
    "setRouteGroupClientError", "hasIncompatibleAddEmptyDraft", "isOrdinarySplitDraft",
    "contextRouteRows", "getNextChildRouteDraft", "ROUTE_EMPTY_LABEL", "setClientRouteRows",
    "isOrdinaryRouteDetail", "setIsOrdinarySplitDraft", "routeGroupId", "currentRouteRowsSource",
    "setRouteTimelineOrderByRouteId", "submitRouteGroupAction",
  ];
  const dependencies = {
    ROUTE_EMPTY_LABEL: "–",
    canDraftEditChildStopMembership: true,
    contextRouteRows: [],
    currentRouteRowsSource: [],
    getNextChildRouteDraft: () => ({ color: "#7c3aed", isGeneratedTitle: true, label: "#2", routeIdx: 2, routeIndex: 2 }),
    hasIncompatibleAddEmptyDraft: false,
    isOrdinaryRouteDetail: true,
    isOrdinarySplitDraft: false,
    routeGroupActionBusy: false,
    routeGroupId: null,
    setClientRouteRows: () => {},
    setIsOrdinarySplitDraft: () => {},
    setIsRouteActionsMenuOpen: () => {},
    setRouteGroupClientError: () => {},
    setRouteTimelineOrderByRouteId: () => {},
    submitRouteGroupAction: () => {},
    ...overrides,
  };
  return Function(...dependencyNames, `${handlerSource}\nreturn handleAddEmptyRoute;`)(
    ...dependencyNames.map((name) => dependencies[name]),
  );
}

function loadSaveHandler(overrides = {}) {
  const handlerSource = sourceBetween("const handleSaveRouteDraft = () => {", "const handleSaveRouteDraftAndLeave = () => {");
  const dependencyNames = [
    "canSaveRouteDraft", "isOrdinarySplitDraft", "canDraftEditChildStopMembership",
    "setRouteGroupClientError", "routeGroupId", "ROUTE_SPLIT_SAVE_UNAVAILABLE_MESSAGE",
    "splitSaveExpectationRef", "contextTimelineRouteRows", "deletedRoutePlanIds",
    "setScheduledNoticeRoutePlanId", "setScheduledNoticeGroupRoutePlanIds", "submitRouteGroupAction",
    "buildRouteDraftPayload", "routeGroup", "removedOrderIds",
  ];
  const dependencies = {
    ROUTE_SPLIT_SAVE_UNAVAILABLE_MESSAGE: "Saving split routes is not available yet. Your draft has been kept.",
    buildRouteDraftPayload: () => ({}),
    canDraftEditChildStopMembership: true,
    canSaveRouteDraft: true,
    contextTimelineRouteRows: [],
    deletedRoutePlanIds: [],
    isOrdinarySplitDraft: true,
    removedOrderIds: [],
    routeGroup: null,
    routeGroupId: null,
    setRouteGroupClientError: () => {},
    setScheduledNoticeGroupRoutePlanIds: () => {},
    setScheduledNoticeRoutePlanId: () => {},
    splitSaveExpectationRef: { current: null },
    submitRouteGroupAction: () => {},
    ...overrides,
  };
  return Function(...dependencyNames, `${handlerSource}\nreturn handleSaveRouteDraft;`)(
    ...dependencyNames.map((name) => dependencies[name]),
  );
}

function loadCompleteSplitSaveResponseHelper() {
  const helperSource = sourceBetween("function isCompleteSplitSaveResponse(", "function createScheduledNoticeNavigationState(");
  return Function(
    "textOrUndefined",
    "getVisibleRouteGroupChildren",
    "getRouteGroupChildRoutePlanId",
    `${helperSource}\nreturn isCompleteSplitSaveResponse;`,
  )(
    (value) => typeof value === "string" && value ? value : undefined,
    (routeGroup) => routeGroup?.children ?? [],
    (child) => child?.routePlanId ?? child?.routePlan?.id ?? null,
  );
}

test("standalone and stored-singleton routes use ordinary ungrouped presentation", () => {
  const isOrdinaryRouteDetailPresentation = loadOrdinaryRoutePresentationHelper();

  assert.equal(isOrdinaryRouteDetailPresentation({ id: "route-1" }, null), true);
  assert.equal(isOrdinaryRouteDetailPresentation(
    { id: "route-1" },
    { children: [{ routePlanId: "route-1" }] },
  ), true);
  assert.equal(isOrdinaryRouteDetailPresentation(
    { id: "route-1" },
    { children: [{ routePlanId: "route-1" }, { routePlanId: "route-2" }] },
  ), false);
  assert.equal(isOrdinaryRouteDetailPresentation(null, { children: [] }), false);
  assert.match(source, /const defaultRouteLineColor = isOrdinaryRouteDetail[\s\S]*MAP_MARKER_PALETTE\.plannedOrder\.color/);
});

test("ordinary Add Empty seeds a local allocation with the saved route and temporary route", () => {
  const handler = sourceBetween("const handleAddEmptyRoute = () => {", "const handleReverseCurrentRouteStops = () => {");
  const ordinaryBranch = handler.indexOf("if (isOrdinaryRouteDetail)");


  assert.match(handler, /if \(!canDraftEditChildStopMembership\)[\s\S]*Routes can only be split before the route has started/);
  assert.match(handler, /setClientRouteRows\(\(rows\) => \[\.\.\.rows, routeRow\]\)/);
  assert.match(handler, /setIsOrdinarySplitDraft\(true\)/);
  assert.match(handler, /\[originalRouteRow\.id\]: originalRouteRow\.stops\.map\(\(stop\) => stop\.id\)/);
  assert.match(handler, /\[tempId\]: \[\]/);
  assert.ok(ordinaryBranch >= 0);
  assert.doesNotMatch(handler, /queryNextRouteIdx|submitRouteGroupAction/);
  assert.doesNotMatch(handler, /createRouteGroup|createDeliveryRouteGroup|saveRouteDraft/);
});

test("ordinary Add Empty executes locally twice without losing the saved route allocation", () => {
  const originalRoute = { id: "route-1", stops: [{ id: "stop-1" }, { id: "stop-2" }] };
  let clientRows = [];
  let orderByRouteId = {};
  let submitCount = 0;
  const setters = {
    currentRouteRowsSource: [originalRoute],
    setClientRouteRows: (update) => { clientRows = update(clientRows); },
    setRouteTimelineOrderByRouteId: (update) => { orderByRouteId = update(orderByRouteId); },
    submitRouteGroupAction: () => { submitCount += 1; },
  };

  loadAddEmptyHandler(setters)();
  const firstTempId = clientRows[0].tempId;
  loadAddEmptyHandler({
    ...setters,
    contextRouteRows: [originalRoute, ...clientRows],
    hasIncompatibleAddEmptyDraft: true,
    isOrdinarySplitDraft: true,
  })();

  assert.equal(clientRows.length, 2);
  assert.deepEqual(orderByRouteId["route-1"], ["stop-1", "stop-2"]);
  assert.deepEqual(orderByRouteId[firstTempId], []);
  assert.deepEqual(orderByRouteId[clientRows[1].tempId], []);
  assert.equal(submitCount, 0);
});

test("locked routes do not create split rows and standalone Save never submits", () => {
  let clientRowUpdates = 0;
  let submitCount = 0;
  let savedError = null;
  loadAddEmptyHandler({
    canDraftEditChildStopMembership: false,
    setClientRouteRows: () => { clientRowUpdates += 1; },
  })();
  loadSaveHandler({
    setRouteGroupClientError: (message) => { savedError = message; },
    submitRouteGroupAction: () => { submitCount += 1; },
  })();

  assert.equal(clientRowUpdates, 0);
  assert.equal(submitCount, 0);
  assert.equal(savedError, "Saving split routes is not available yet. Your draft has been kept.");
});

test("existing draft payload keeps the real route identity and local temporary allocation", () => {
  const buildRouteDraftPayload = loadRouteDraftPayloadBuilder();
  const payload = buildRouteDraftPayload([
    {
      color: "#006fbb",
      driverId: "driver-1",
      id: "route-1",
      routeIndex: 1,
      routeKey: "routePlan:route-1",
      routePlanId: "route-1",
      stops: [{ orderId: "order-1" }],
      title: "Route 1",
    },
    {
      color: "#7c3aed",
      driverId: null,
      id: "temp:split-2",
      routeIndex: 2,
      routeKey: "temp:split-2",
      routePlanId: null,
      stops: [{ orderId: "order-2" }],
      tempId: "temp:split-2",
      title: "Route 2",
    },
  ], { includeExistingOptimized: false, mode: "MANUAL_ORDER" });

  assert.equal(payload.mode, "MANUAL_ORDER");
  assert.deepEqual(payload.routes.map(({ orderIds, routeKey, routePlanId, tempId }) => ({
    orderIds,
    routeKey,
    routePlanId,
    tempId,
  })), [
    { orderIds: ["order-1"], routeKey: "routePlan:route-1", routePlanId: "route-1", tempId: null },
    { orderIds: ["order-2"], routeKey: "temp:split-2", routePlanId: null, tempId: "temp:split-2" },
  ]);
});

test("split save requires a matching complete response before clearing the draft", () => {
  const isCompleteSplitSaveResponse = loadCompleteSplitSaveResponseHelper();
  const expectation = {
    existingRoutePlanIds: ["route-1"],
    routeGroupId: "group-1",
    tempRouteCount: 2,
  };

  assert.equal(isCompleteSplitSaveResponse({
    id: "group-1",
    children: [{ routePlanId: "route-1" }, { routePlanId: "route-2" }, { routePlanId: "route-3" }],
  }, expectation), true);
  assert.equal(isCompleteSplitSaveResponse({
    id: "group-1",
    children: [{ routePlanId: "route-1" }, { routePlanId: "route-2" }],
  }, expectation), false);
  assert.equal(isCompleteSplitSaveResponse({
    id: "group-1",
    children: [{ routePlanId: "route-1" }, { routePlanId: "route-2" }, { routePlanId: "route-2" }],
  }, expectation), false);
  assert.equal(isCompleteSplitSaveResponse({
    id: "group-2",
    children: [{ routePlanId: "route-1" }, { routePlanId: "route-2" }, { routePlanId: "route-3" }],
  }, expectation), false);

  const saveEffect = sourceBetween(
    'if (lastRouteActionIntentRef.current !== "saveRouteDraft") return;',
    "}, [deletedRoutePlanIds,",
  );
  assert.match(saveEffect, /const responseRouteGroup = routeActionFetcher\.data\?\.routeGroup \?\? null/);
  assert.ok(saveEffect.indexOf("isCompleteSplitSaveResponse") < saveEffect.indexOf("resetRouteDraftChanges()"));
  assert.match(saveEffect, /setRouteGroupClientError\(ROUTE_SPLIT_SAVE_UNCONFIRMED_MESSAGE\);\s+return;/);
});

test("ordinary split Save and Save-and-leave fail closed while Revert and discard cancel locally", () => {
  const saveHandler = sourceBetween("const handleSaveRouteDraft = () => {", "const handleSaveRouteDraftAndLeave = () => {");
  const saveAndLeaveHandler = sourceBetween("const handleSaveRouteDraftAndLeave = () => {", "const handleDiscardRouteDraftAndLeave = () => {");
  const resetHandler = sourceBetween("const resetRouteDraftChanges = useCallback(() => {", "const handleAddEmptyRoute = () => {");
  const discardHandler = sourceBetween("const handleDiscardRouteDraftAndLeave = () => {", "const requestRouteNavigation = (href) => {");

  const standaloneSaveGuard = saveHandler.indexOf("if (isOrdinarySplitDraft && !routeGroupId)");
  assert.ok(standaloneSaveGuard >= 0);
  assert.ok(standaloneSaveGuard < saveHandler.indexOf('submitRouteGroupAction("saveRouteDraft"'));
  assert.match(saveHandler, /setRouteGroupClientError\(ROUTE_SPLIT_SAVE_UNAVAILABLE_MESSAGE\);\s+return;/);
  const saveAndLeaveGuard = saveAndLeaveHandler.indexOf("if (isOrdinarySplitDraft &&");
  assert.ok(saveAndLeaveGuard >= 0);
  assert.ok(saveAndLeaveGuard < saveAndLeaveHandler.indexOf("navigateAfterRouteDraftSaveRef.current ="));
  assert.match(resetHandler, /setIsOrdinarySplitDraft\(false\)/);
  assert.match(discardHandler, /resetRouteDraftChanges\(\)[\s\S]*navigate\(destination\)/);
  assert.match(saveHandler, /if \(isOrdinarySplitDraft && !canDraftEditChildStopMembership\)[\s\S]*Your draft has been kept/);
  assert.match(source, /ROUTE_SPLIT_SAVE_UNAVAILABLE_MESSAGE = "Saving split routes is not available yet\. Your draft has been kept\."/);
});

test("ordinary Add Empty is available without inventing an ordinary Copy contract", () => {
  assert.match(source, /\{routeGroupId \|\| isOrdinaryRouteDetail \? \([\s\S]*onClick=\{handleAddEmptyRoute\}/);
  assert.match(source, /\{isRouteGroupDetail \? \([\s\S]*onClick=\{handleCopyRouteGroup\}/);
  assert.doesNotMatch(source, /handleCopyOrdinaryRoute|copyRoutePlan/);
});


test("grouped Add Empty performs no server request", () => {
  let calls = 0;
  let rows = [];
  loadAddEmptyHandler({
    routeGroupId: "group-1", isOrdinaryRouteDetail: false,
    setClientRouteRows: update => { rows = update(rows); },
    submitRouteGroupAction: () => { calls += 1; },
  })();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].routePlanId, null);
  assert.ok(rows[0].tempId);
  assert.equal(calls, 0);
});

test("new draft routes omit final numbering while existing IDs and renamed labels survive", () => {
  const build = loadRouteDraftPayloadBuilder();
  const rows = [
    { routePlanId: "existing", id: "existing", routeIdx: 123, routeIndex: 1, title: "Existing", stops: [{orderId: "one"}] },
    { routePlanId: null, id: "temp:new", tempId: "temp:new", routeIdx: 124, routeIndex: 2, title: "#124", isGeneratedTitle: true, stops: [{orderId: "two"}] },
    { routePlanId: null, id: "temp:renamed", tempId: "temp:renamed", routeIdx: 125, routeIndex: 3, title: "West", isGeneratedTitle: false, stops: [] },
  ];
  const original = structuredClone(rows);
  const payload = build(rows, {mode: "MANUAL_ORDER", includeExistingOptimized: false});
  assert.equal(payload.routes[0].routeIdx, 123);
  assert.equal(Object.hasOwn(payload.routes[1], "routeIdx"), false);
  assert.equal(Object.hasOwn(payload.routes[2], "routeIdx"), false);
  assert.equal(payload.routes[1].label, null);
  assert.equal(payload.routes[2].label, "West");
  assert.equal(payload.routes[1].tempId, "temp:new");
  assert.deepEqual(payload.routes[1].orderIds, ["two"]);
  assert.deepEqual(rows, original);
});
