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
    "routeGroupActionBusy", "ordinaryMutationPendingRef", "setIsRouteActionsMenuOpen", "canDraftEditChildStopMembership",
    "setRouteGroupClientError", "hasIncompatibleAddEmptyDraft", "isOrdinarySplitDraft",
    "contextRouteRows", "getNextChildRouteDraft", "ROUTE_EMPTY_LABEL", "setClientRouteRows",
    "isOrdinaryRouteDetail", "setIsOrdinarySplitDraft", "routeGroupId", "currentRouteRowsSource",
    "setRouteTimelineOrderByRouteId", "submitRouteGroupAction", "ordinarySplitRevisionRef", "effectiveRoutePlan",
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
    effectiveRoutePlan: { updatedAt: "2026-09-09T00:00:00.000Z" },
    ordinaryMutationPendingRef: { current: false },
    ordinarySplitRevisionRef: { current: null },
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
    "setRouteGroupClientError", "routeGroupId", "effectiveRoutePlan", "ordinarySplitRevisionRef",
    "ordinaryMutationPendingRef", "ordinaryMutationUncertain", "setOrdinaryMutationPending",
    "navigateAfterRouteDraftSaveRef",
    "splitSaveExpectationRef", "contextTimelineRouteRows", "deletedRoutePlanIds",
    "setScheduledNoticeRoutePlanId", "setScheduledNoticeGroupRoutePlanIds", "submitRouteGroupAction", "submitRouteAction",
    "buildRouteDraftPayload", "routeGroup", "removedOrderIds",
  ];
  const dependencies = {
    buildRouteDraftPayload: () => ({}),
    canDraftEditChildStopMembership: true,
    canSaveRouteDraft: true,
    contextTimelineRouteRows: [],
    deletedRoutePlanIds: [],
    effectiveRoutePlan: { id: "route-copy", status: "READY", updatedAt: "2026-09-09T00:00:00.000Z" },
    isOrdinarySplitDraft: true,
    ordinarySplitRevisionRef: { current: "2026-09-09T00:00:00.000Z" },
    ordinaryMutationPendingRef: { current: false },
    ordinaryMutationUncertain: false,
    navigateAfterRouteDraftSaveRef: { current: null },
    removedOrderIds: [],
    routeGroup: null,
    routeGroupId: null,
    setRouteGroupClientError: () => {},
    setOrdinaryMutationPending: () => {},
    setScheduledNoticeGroupRoutePlanIds: () => {},
    setScheduledNoticeRoutePlanId: () => {},
    splitSaveExpectationRef: { current: null },
    submitRouteGroupAction: () => {},
    submitRouteAction: () => {},
    ...overrides,
  };
  return Function(...dependencyNames, `${handlerSource}\nreturn handleSaveRouteDraft;`)(
    ...dependencyNames.map((name) => dependencies[name]),
  );
}

function loadCompleteSplitSaveResponseHelper() {
  const helperSource = sourceBetween("function isCompleteSplitSaveResponse(", "function createCustomerEmailDialogOpenState(");
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

function loadValidOrdinaryRouteCopyHelper() {
  const helperSource = sourceBetween("function isValidOrdinaryRouteCopy(", "function createCustomerEmailDialogOpenState(");
  return Function(
    "textOrUndefined",
    `${helperSource}\nreturn isValidOrdinaryRouteCopy;`,
  )((value) => typeof value === "string" && value ? value : undefined);
}

function loadShouldRevalidateHelper() {
  const helperSource = sourceBetween("export function shouldRevalidate(", "function buildRouteDetail(");
  return Function(`${helperSource.replace("export ", "")}\nreturn shouldRevalidate;`)();
}

function loadSubmitRouteAction(overrides = {}) {
  const handlerSource = sourceBetween("const submitRouteAction = async (intent, fields = {}) => {", "const submitCustomerEmailAction = async (intent) => {");
  const dependencyNames = [
    "ordinaryMutationPendingRef", "setRouteGroupClientError", "shopify", "FormData",
    "routeGroupId", "routeActionFetcher",
  ];
  const dependencies = {
    FormData,
    ordinaryMutationPendingRef: { current: false },
    routeActionFetcher: { submit: () => {} },
    routeGroupId: null,
    setRouteGroupClientError: () => {},
    shopify: { idToken: async () => "session-token" },
    ...overrides,
  };
  return Function(...dependencyNames, `${handlerSource}\nreturn submitRouteAction;`)(
    ...dependencyNames.map((name) => dependencies[name]),
  );
}

function loadCopyOrdinaryRouteHandler(overrides = {}) {
  const handlerSource = sourceBetween("const handleCopyOrdinaryRoute = async () => {", "const handleCopyRouteGroup = () => {");
  const dependencyNames = [
    "canCopyOrdinaryRoute", "routeGroupActionBusy", "hasRouteAllocationDraft",
    "ordinaryMutationPendingRef", "setOrdinaryMutationPending", "copySourceRoutePlanIdRef",
    "effectiveRoutePlan", "submitRouteAction",
  ];
  const dependencies = {
    canCopyOrdinaryRoute: true,
    copySourceRoutePlanIdRef: { current: null },
    effectiveRoutePlan: { id: "route-source", updatedAt: "2026-09-09T00:00:00.000Z" },
    hasRouteAllocationDraft: false,
    ordinaryMutationPendingRef: { current: false },
    routeGroupActionBusy: false,
    setOrdinaryMutationPending: () => {},
    submitRouteAction: async () => true,
    ...overrides,
  };
  return Function(...dependencyNames, `${handlerSource}\nreturn handleCopyOrdinaryRoute;`)(
    ...dependencyNames.map((name) => dependencies[name]),
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
  const revisionRef = { current: null };
  const setters = {
    currentRouteRowsSource: [originalRoute],
    setClientRouteRows: (update) => { clientRows = update(clientRows); },
    setRouteTimelineOrderByRouteId: (update) => { orderByRouteId = update(orderByRouteId); },
    submitRouteGroupAction: () => { submitCount += 1; },
    ordinarySplitRevisionRef: revisionRef,
  };

  loadAddEmptyHandler(setters)();
  const firstTempId = clientRows[0].tempId;
  loadAddEmptyHandler({
    ...setters,
    contextRouteRows: [originalRoute, ...clientRows],
    effectiveRoutePlan: { updatedAt: "2026-09-09T00:05:00.000Z" },
    hasIncompatibleAddEmptyDraft: true,
    isOrdinarySplitDraft: true,
  })();

  assert.equal(clientRows.length, 2);
  assert.deepEqual(orderByRouteId["route-1"], ["stop-1", "stop-2"]);
  assert.deepEqual(orderByRouteId[firstTempId], []);
  assert.deepEqual(orderByRouteId[clientRows[1].tempId], []);
  assert.equal(submitCount, 0);
  assert.equal(revisionRef.current, "2026-09-09T00:00:00.000Z");
});

test("locked routes do not create split rows or submit a split save", async () => {
  let clientRowUpdates = 0;
  let submitCount = 0;
  let savedError = null;
  loadAddEmptyHandler({
    canDraftEditChildStopMembership: false,
    setClientRouteRows: () => { clientRowUpdates += 1; },
  })();
  await loadSaveHandler({
    canDraftEditChildStopMembership: false,
    setRouteGroupClientError: (message) => { savedError = message; },
    submitRouteGroupAction: () => { submitCount += 1; },
    submitRouteAction: async () => { submitCount += 1; return true; },
  })();

  assert.equal(clientRowUpdates, 0);
  assert.equal(submitCount, 0);
  assert.equal(savedError, "Split routes can only be saved before the route has started. Your draft has been kept.");
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

test("new split save accepts only an exact complete group that preserves the copied route", () => {
  const isCompleteSplitSaveResponse = loadCompleteSplitSaveResponseHelper();
  const expectation = {
    existingRoutePlanIds: ["route-1"],
    routeGroupId: null,
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
    id: "group-1",
    children: [{ routePlanId: "route-1" }, { routePlanId: "route-2" }, { routePlanId: "route-3" }, { routePlanId: "route-4" }],
  }, expectation), false);
  assert.equal(isCompleteSplitSaveResponse({
    id: "group-1",
    children: [{ routePlanId: "other-route" }, { routePlanId: "route-2" }, { routePlanId: "route-3" }],
  }, expectation), false);
  assert.equal(isCompleteSplitSaveResponse({
    id: "group-1",
    children: [{ routePlanId: "route-1" }, { routePlanId: "route-2" }, {}],
  }, expectation), false);

  const saveEffect = sourceBetween(
    'if (lastRouteActionIntentRef.current !== "saveRouteDraft") return;',
    "}, [deletedRoutePlanIds,",
  );
  assert.match(saveEffect, /const responseRouteGroup = routeActionFetcher\.data\?\.routeGroup \?\? null/);
  assert.ok(saveEffect.indexOf("isCompleteSplitSaveResponse") < saveEffect.indexOf("resetRouteDraftChanges()"));
  assert.match(saveEffect, /setRouteGroupClientError\(ROUTE_SPLIT_SAVE_UNCONFIRMED_MESSAGE\);\s+return;/);
  assert.match(saveEffect, /const selectedRoutePlanId = splitSaveExpectation\.existingRoutePlanIds\[0\]/);
  assert.match(saveEffect, /navigate\(navigateAfterSave \?\? routeGroupChildPath\(responseRouteGroup\.id, selectedRoutePlanId\)\)/);
});

test("ordinary split Save submits one atomic request while Revert and discard remain local", async () => {
  const saveHandler = sourceBetween("const handleSaveRouteDraft = () => {", "const handleSaveRouteDraftAndLeave = () => {");
  const saveAndLeaveHandler = sourceBetween("const handleSaveRouteDraftAndLeave = () => {", "const handleDiscardRouteDraftAndLeave = () => {");
  const resetHandler = sourceBetween("const resetRouteDraftChanges = useCallback(() => {", "const handleAddEmptyRoute = () => {");
  const discardHandler = sourceBetween("const handleDiscardRouteDraftAndLeave = () => {", "const requestRouteNavigation = (href) => {");

  assert.match(saveHandler, /const isStandaloneSplitSave = isOrdinarySplitDraft && !routeGroupId/);
  assert.match(saveHandler, /expectedRoutePlanUpdatedAt: ordinarySplitRevisionRef\.current/);
  assert.match(saveHandler, /if \(isStandaloneSplitSave\)[\s\S]*submitRouteAction\("saveRouteDraft", fields\)/);
  assert.match(saveHandler, /else \{\s+submitRouteGroupAction\("saveRouteDraft", fields\)/);
  assert.doesNotMatch(saveAndLeaveHandler, /!routeGroupId/);
  assert.match(saveAndLeaveHandler, /navigateAfterRouteDraftSaveRef\.current = pendingRouteDraftHref \?\? routesListHref/);
  assert.match(resetHandler, /setIsOrdinarySplitDraft\(false\)/);
  assert.match(discardHandler, /resetRouteDraftChanges\(\)[\s\S]*navigate\(destination\)/);
  assert.match(saveHandler, /if \(isOrdinarySplitDraft && !canDraftEditChildStopMembership\)[\s\S]*Your draft has been kept/);

  let submission = null;
  const expectationRef = { current: null };
  await loadSaveHandler({
    buildRouteDraftPayload: () => ({ mode: "MANUAL_ORDER", routes: [{ routePlanId: "route-copy" }, { tempId: "temp:2" }] }),
    contextTimelineRouteRows: [{ routePlanId: "route-copy" }, { routePlanId: null, tempId: "temp:2" }],
    splitSaveExpectationRef: expectationRef,
    submitRouteAction: async (intent, fields) => { submission = { fields, intent }; return true; },
  })();
  assert.equal(submission.intent, "saveRouteDraft");
  assert.equal(submission.fields.expectedRoutePlanUpdatedAt, "2026-09-09T00:00:00.000Z");
  assert.deepEqual(JSON.parse(submission.fields.draft).routes, [{ routePlanId: "route-copy" }, { tempId: "temp:2" }]);
  assert.deepEqual(expectationRef.current, {
    existingRoutePlanIds: ["route-copy"],
    routeGroupId: null,
    tempRouteCount: 1,
  });
});

test("ordinary READY route exposes direct Copy and keeps Add Empty local", () => {
  assert.match(source, /\{routeGroupId \|\| isOrdinaryRouteDetail \? \([\s\S]*onClick=\{handleAddEmptyRoute\}/);
  assert.match(source, /const handleCopyOrdinaryRoute = async \(\) => \{/);
  assert.match(source, /effectiveRoutePlan\?\.status[\s\S]*READY/);
  assert.match(source, /submitRouteAction\("copyRoutePlan", \{[\s\S]*expectedRoutePlanUpdatedAt: effectiveRoutePlan\.updatedAt/);
  assert.match(source, /onClick=\{handleCopyOrdinaryRoute\}/);
  assert.match(source, /\{copyRoutePlanBusy \? "Copying…" : "Copy"\}/);
});

test("ordinary Copy navigates only after a confirmed standalone READY route response", () => {
  const isValidOrdinaryRouteCopy = loadValidOrdinaryRouteCopyHelper();
  assert.equal(isValidOrdinaryRouteCopy({
    id: "route-copy",
    status: "READY",
    updatedAt: "2026-09-09T01:00:00.000Z",
  }, "route-source"), true);
  assert.equal(isValidOrdinaryRouteCopy({
    id: "route-source",
    status: "READY",
    updatedAt: "2026-09-09T01:00:00.000Z",
  }, "route-source"), false);
  assert.equal(isValidOrdinaryRouteCopy({
    id: "route-copy",
    routeGroupingChild: { groupingId: "group-1" },
    status: "READY",
    updatedAt: "2026-09-09T01:00:00.000Z",
  }, "route-source"), false);

  const copyEffect = sourceBetween(
    'if (lastRouteActionIntentRef.current !== "copyRoutePlan") return;',
    'if (lastRouteActionIntentRef.current !== "copyRouteGroup") return;',
  );

  assert.match(copyEffect, /routeActionFetcher\.data\?\.routePlan/);
  assert.match(copyEffect, /isValidOrdinaryRouteCopy\(copiedRoutePlan, copySourceRoutePlanIdRef\.current\)/);
  assert.match(copyEffect, /navigate\(routePlanPath\(copiedRoutePlan\.id\)\)/);
  assert.ok(copyEffect.indexOf("isValidOrdinaryRouteCopy") < copyEffect.indexOf("navigate(routePlanPath(copiedRoutePlan.id))"));
});

test("copy and split save responses reconcile before route loader revalidation", () => {
  const shouldRevalidate = loadShouldRevalidateHelper();
  const formDataFor = (intent) => new Map([["_intent", intent]]);

  assert.equal(shouldRevalidate({ formData: formDataFor("copyRoutePlan"), defaultShouldRevalidate: true }), false);
  assert.equal(shouldRevalidate({ formData: formDataFor("saveRouteDraft"), defaultShouldRevalidate: true }), false);
  assert.equal(shouldRevalidate({ formData: formDataFor("deleteRoute"), defaultShouldRevalidate: true }), true);
});

test("an ordinary mutation lock acquired while awaiting a token blocks an unrelated submission", async () => {
  let resolveToken;
  let submitCount = 0;
  const ordinaryMutationPendingRef = { current: false };
  const tokenPromise = new Promise((resolve) => { resolveToken = resolve; });
  const submitRouteAction = loadSubmitRouteAction({
    ordinaryMutationPendingRef,
    routeActionFetcher: { submit: () => { submitCount += 1; } },
    shopify: { idToken: () => tokenPromise },
  });

  const resultPromise = submitRouteAction("dispatchRoute");
  ordinaryMutationPendingRef.current = true;
  resolveToken("session-token");

  assert.equal(await resultPromise, false);
  assert.equal(submitCount, 0);
});

test("an ordinary mutation lock keeps its owning Copy and Save submissions available", async () => {
  const submittedIntents = [];
  const submitRouteAction = loadSubmitRouteAction({
    ordinaryMutationPendingRef: { current: true },
    routeActionFetcher: {
      submit: (formData) => { submittedIntents.push(formData.get("_intent")); },
    },
  });

  assert.equal(await submitRouteAction("copyRoutePlan"), true);
  assert.equal(await submitRouteAction("saveRouteDraft"), true);
  assert.equal(await submitRouteAction("deleteRoute"), false);
  assert.deepEqual(submittedIntents, ["copyRoutePlan", "saveRouteDraft"]);
});

test("double-clicking ordinary Copy starts only one request", async () => {
  let resolveSubmission;
  let submitCount = 0;
  const ordinaryMutationPendingRef = { current: false };
  const pendingSubmission = new Promise((resolve) => { resolveSubmission = resolve; });
  const handleCopyOrdinaryRoute = loadCopyOrdinaryRouteHandler({
    ordinaryMutationPendingRef,
    submitRouteAction: () => {
      submitCount += 1;
      return pendingSubmission;
    },
  });

  const firstClick = handleCopyOrdinaryRoute();
  const secondClick = handleCopyOrdinaryRoute();
  assert.equal(submitCount, 1);

  resolveSubmission(true);
  await Promise.all([firstClick, secondClick]);
  assert.equal(ordinaryMutationPendingRef.current, true);
});

test("ordinary mutation pending state disables shared actions and rechecks delete after token acquisition", () => {
  assert.match(source, /const routeGroupActionBusy = routeActionFetcher\.state !== "idle" \|\| ordinaryMutationPending/);
  const deleteHandler = sourceBetween("const handleDeleteRoute = async () => {", "  useEffect(() => {\n    if (routeGroupActionIntent)");
  assert.match(deleteHandler, /const sessionToken = await shopify\.idToken\(\);\s+if \(ordinaryMutationPendingRef\.current\) return;/);
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
