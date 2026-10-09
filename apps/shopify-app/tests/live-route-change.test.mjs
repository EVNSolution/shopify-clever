import test from "node:test";
import assert from "node:assert/strict";
import {
  createLiveEditor,
  updateLiveStop,
  confirmLiveLocation,
  reorderLiveFutureStops,
  buildLiveCommand,
  rebaseLiveEditor,
  createLiveCommandRequest,
  isLiveResponseCurrent,
  getLiveLocationIssues,
  applyLiveDraftToStops,
  liveOrderKeepsFixedStops,
} from "../app/features/delivery/live-route-change.js";

const stop = (id, sequence) => ({
  deliveryStopId: id,
  sequence,
  address1: `${id} Road`,
  address2: null,
  city: "Toronto",
  province: "ON",
  postalCode: "M1A 1A1",
  countryCode: "CA",
  latitude: "43.7",
  longitude: "-79.4",
});
const response = (values = {}) => ({
  routePlanId: "actual-route",
  revision: 3,
  assignmentGeneration: "2",
  expectedRouteVersionId: "child-version",
  publishedVersionId: "public-version",
  hasUnpublishedChanges: false,
  editableFutureStopIds: ["stop-3", "stop-7"],
  draft: {
    schemaVersion: 1,
    stops: [
      stop("stop-1", 1),
      stop("stop-2", 2),
      stop("stop-3", 3),
      stop("stop-7", 7),
    ],
  },
  ...values,
});

test("address-only Save clears old coordinates and requires explicit location confirmation", () => {
  let editor = createLiveEditor(response());
  editor = updateLiveStop(editor, "stop-7", "address1", "700 New Avenue");
  assert.deepEqual(getLiveLocationIssues(editor), ["stop-7"]);
  const save = buildLiveCommand(editor, "save", "save-1");
  assert.equal(save.expectedRevision, 3);
  assert.equal(save.expectedAssignmentGeneration, "2");
  assert.equal(save.expectedRouteVersionId, "child-version");
  assert.equal(save.stopOverrides[0].latitude, null);
  assert.equal(save.stopOverrides[0].longitude, null);
  editor = updateLiveStop(editor, "stop-7", "latitude", "43.8");
  editor = updateLiveStop(editor, "stop-7", "longitude", "-79.2");
  assert.deepEqual(getLiveLocationIssues(editor), ["stop-7"]);
  editor = confirmLiveLocation(editor, "stop-7");
  assert.deepEqual(getLiveLocationIssues(editor), []);
  assert.equal(
    buildLiveCommand(editor, "save", "save-2").stopOverrides[0].latitude,
    43.8,
  );
});

test("untouched future stops without coordinates do not block server-authoritative Dispatch", () => {
  const baseline = response({
    hasUnpublishedChanges: true,
    draft: {
      schemaVersion: 1,
      stops: [
        stop("stop-1", 1),
        stop("stop-2", 2),
        stop("stop-3", 3),
        { ...stop("stop-7", 7), latitude: null, longitude: null },
      ],
    },
  });
  const editor = createLiveEditor(baseline);
  assert.deepEqual(getLiveLocationIssues(editor), []);
  assert.deepEqual(buildLiveCommand(editor, "dispatch", "dispatch-1"), {
    commandId: "dispatch-1",
    expectedAssignmentGeneration: "2",
    expectedRouteVersionId: "child-version",
    expectedRevision: 3,
  });
});

test("future order is a full eligible permutation and protected stop edits are rejected", () => {
  const editor = createLiveEditor(response());
  assert.throws(
    () => updateLiveStop(editor, "stop-2", "address1", "Wrong"),
    /STOP_NOT_FUTURE/,
  );
  assert.throws(
    () => reorderLiveFutureStops(editor, ["stop-7"]),
    /INVALID_FUTURE_ORDER/,
  );
  const changed = reorderLiveFutureStops(editor, ["stop-7", "stop-3"]);
  assert.deepEqual(
    buildLiveCommand(changed, "save", "order-1").futureStopOrder,
    ["stop-7", "stop-3"],
  );
  assert.deepEqual(
    buildLiveCommand(changed, "save", "order-1").stopOverrides,
    [],
  );
  assert.deepEqual(
    changed.baseline.draft.stops.map((row) => row.deliveryStopId),
    ["stop-1", "stop-2", "stop-3", "stop-7"],
  );
});

test("explicit rebase preserves input but does not mutate old guards or commands", () => {
  const editor = updateLiveStop(
    createLiveEditor(response()),
    "stop-7",
    "address1",
    "Local input",
  );
  const original = createLiveCommandRequest(editor, "save", "retry-id");
  const fresh = response({
    revision: 8,
    assignmentGeneration: "3",
    expectedRouteVersionId: "new-child",
  });
  const rebased = rebaseLiveEditor(editor, fresh);
  assert.equal(rebased.edits["stop-7"].address1, "Local input");
  assert.equal(buildLiveCommand(rebased, "save", "new-id").expectedRevision, 8);
  assert.equal(
    buildLiveCommand(rebased, "save", "new-id").expectedAssignmentGeneration,
    "3",
  );
  assert.equal(JSON.parse(original.commandBody).expectedRevision, 3);
  assert.equal(
    JSON.parse(original.commandBody).expectedAssignmentGeneration,
    "2",
  );
  assert.equal(original.commandId, "retry-id");
  assert.ok(Object.isFrozen(original));
});

test("rebase refuses a local target that became current; explicit discard has only fresh guards", () => {
  const editor = updateLiveStop(
    createLiveEditor(response()),
    "stop-7",
    "address1",
    "Keep this input",
  );
  const fresh = response({ revision: 9, editableFutureStopIds: ["stop-3"] });
  assert.throws(() => rebaseLiveEditor(editor, fresh), /STOP_NOT_FUTURE/);
  const discard = buildLiveCommand(
    createLiveEditor(fresh),
    "discard",
    "discard-1",
  );
  assert.deepEqual(discard, {
    commandId: "discard-1",
    expectedAssignmentGeneration: "2",
    expectedRouteVersionId: "child-version",
    expectedRevision: 9,
  });
  assert.equal(editor.edits["stop-7"].address1, "Keep this input");
});

test("dispatch requires saved input and a private change; retry request remains immutable", () => {
  assert.throws(
    () =>
      buildLiveCommand(createLiveEditor(response()), "dispatch", "dispatch-1"),
    /NO_PRIVATE_CHANGES/,
  );
  const saved = createLiveEditor(
    response({ hasUnpublishedChanges: true, revision: 4 }),
  );
  const request = createLiveCommandRequest(saved, "dispatch", "dispatch-2");
  assert.equal(request.intent, "liveChangeDispatch");
  assert.equal(JSON.parse(request.commandBody).expectedRevision, 4);
  const edited = updateLiveStop(saved, "stop-7", "address1", "Later");
  assert.throws(
    () => buildLiveCommand(edited, "dispatch", "dispatch-3"),
    /SAVE_REQUIRED/,
  );
  assert.equal(
    request.commandBody,
    createLiveCommandRequest(saved, "dispatch", "dispatch-2").commandBody,
  );
});

test("route, scope and request identity suppress old detail and address-search responses", () => {
  const current = { scopeKey: "shop-B", routePlanId: "route-B", requestId: 9 };
  assert.equal(
    isLiveResponseCurrent(
      { scopeKey: "shop-A", routePlanId: "route-B", requestId: 9 },
      current,
    ),
    false,
  );
  assert.equal(
    isLiveResponseCurrent(
      { scopeKey: "shop-B", routePlanId: "route-A", requestId: 9 },
      current,
    ),
    false,
  );
  assert.equal(
    isLiveResponseCurrent({ ...current, requestId: 8 }, current),
    false,
  );
  assert.equal(isLiveResponseCurrent(current, current), true);
  assert.equal(
    isLiveResponseCurrent({ ...current, epoch: 1 }, { ...current, epoch: 2 }),
    false,
  );
});

test("BFF request retains the exact command, authenticated scope and no-store reads", async () => {
  const { buildLiveBffRequest } =
    await import("../app/features/delivery/live-route-change.js");
  const editor = updateLiveStop(
    createLiveEditor(response()),
    "stop-7",
    "address1",
    "Retained request",
  );
  const command = createLiveCommandRequest(editor, "save", "immutable-save");
  const context = { scopeKey: "session-scope", routePlanId: "actual-route" };
  const first = buildLiveBffRequest(
    "https://local.test/app/routes/group?host=embedded",
    context,
    "token-1",
    command,
  );
  const retry = buildLiveBffRequest(
    "https://local.test/app/routes/group?host=embedded",
    context,
    "token-2",
    command,
  );
  assert.equal(
    first.options.body.get("command"),
    retry.options.body.get("command"),
  );
  assert.equal(first.options.body.get("routePlanId"), "actual-route");
  assert.equal(first.options.body.get("scopeKey"), "session-scope");
  assert.equal(retry.options.headers.Authorization, "Bearer token-2");
  const read = buildLiveBffRequest(
    "https://local.test/app/routes/group?host=embedded",
    context,
    "token-3",
  );
  assert.equal(read.options.cache, "no-store");
  assert.equal(read.url.pathname, "/app/route-live-change/actual-route");
  assert.equal(read.url.searchParams.get("liveChange"), null);
  assert.equal(read.url.searchParams.get("host"), "embedded");
});

test("plaintext authentication failures stop new commands instead of reporting unknown outcomes", async () => {
  const { readLiveBffResponse } =
    await import("../app/features/delivery/live-route-change.js");
  const unauthorized = await readLiveBffResponse(
    new Response("Unauthorized", { status: 401 }),
    "scope",
  );
  assert.equal(unauthorized.error.code, "UNAUTHORIZED");
  assert.equal(unauthorized.outcomeUnknown, false);
  const forbidden = await readLiveBffResponse(
    new Response("Forbidden", { status: 403 }),
    "scope",
  );
  assert.equal(forbidden.error.code, "FORBIDDEN");
  assert.equal(forbidden.outcomeUnknown, false);
});

test("BFF envelope keeps server conflicts, marks transport failures, rejects changed authenticated scope", async () => {
  const { readLiveBffResponse } =
    await import("../app/features/delivery/live-route-change.js");
  const envelope = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const conflict = await readLiveBffResponse(
    envelope(
      {
        data: null,
        errors: [{ code: "REVISION_CONFLICT", message: "Changed" }],
      },
      409,
    ),
    "scope",
  );
  assert.equal(conflict.error.code, "REVISION_CONFLICT");
  const failure = await readLiveBffResponse(
    envelope({ error: { code: "INTERNAL_ERROR" } }, 500),
    "scope",
  );
  assert.equal(failure.outcomeUnknown, true);
  const stale = await readLiveBffResponse(
    envelope({ data: response(), scopeKey: "other-scope" }),
    "scope",
  );
  assert.equal(stale.error.code, "SCOPE_CHANGED");
  assert.equal(stale.data, undefined);
});

test("rebase keeps other office changes to untouched address fields and invalidates old coordinate confirmation", () => {
  let local = updateLiveStop(
    createLiveEditor(response()),
    "stop-7",
    "address2",
    "Unit 12",
  );
  local = updateLiveStop(local, "stop-7", "latitude", "43.8");
  local = updateLiveStop(local, "stop-7", "longitude", "-79.2");
  local = confirmLiveLocation(local, "stop-7");
  const newer = response({ revision: 7 });
  newer.draft.stops[3] = {
    ...newer.draft.stops[3],
    address1: "Another office address",
    city: "Ottawa",
  };
  const rebased = rebaseLiveEditor(local, newer);
  assert.equal(rebased.edits["stop-7"].address1, "Another office address");
  assert.equal(rebased.edits["stop-7"].city, "Ottawa");
  assert.equal(rebased.edits["stop-7"].address2, "Unit 12");
  assert.equal(rebased.edits["stop-7"].locationVerified, false);
  assert.equal(
    buildLiveCommand(rebased, "save", "rebased").stopOverrides[0].latitude,
    null,
  );
});

test("auth rejection of an unknown-outcome retry retains the original command for later receipt recovery", async () => {
  const { livePendingAfterFailure } =
    await import("../app/features/delivery/live-route-change.js");
  const editor = updateLiveStop(
    createLiveEditor(response()),
    "stop-7",
    "address1",
    "Keep command identity",
  );
  const request = createLiveCommandRequest(editor, "save", "original-command");
  const pending = { request, unknown: true };
  const failedRetry = livePendingAfterFailure(
    request,
    { error: { code: "UNAUTHORIZED" }, outcomeUnknown: false },
    pending,
  );
  assert.equal(failedRetry.request, request);
  assert.equal(failedRetry.unknown, true);
  assert.equal(failedRetry.request.commandBody, pending.request.commandBody);
});

test("delivery receipt retries retain later local edits through an unknown transport attempt", async () => {
  const { liveReceiptRefreshMode } =
    await import("../app/features/delivery/live-route-change.js");
  const afterPublication = updateLiveStop(
    createLiveEditor(response()),
    "stop-7",
    "address1",
    "Later unsaved input",
  );
  assert.equal(
    liveReceiptRefreshMode("dispatch", true, afterPublication),
    "review",
  );
  assert.equal(liveReceiptRefreshMode("save", true, afterPublication), "after");
  assert.equal(
    liveReceiptRefreshMode("dispatch", true, createLiveEditor(response())),
    "after",
  );
  assert.equal(
    afterPublication.edits["stop-7"].address1,
    "Later unsaved input",
  );
});

const loaderStop = (id, sequence) => ({
  deliveryStopId: id,
  sequence,
  addressLabel: `${id} Road, Toronto`,
  address: { address1: `${id} Road`, address2: null, city: "Toronto", province: "ON", postalCode: "M1A 1A1", countryCode: "CA" },
  latitude: 43.7,
  longitude: -79.4,
  locationDiagnostic: { issues: [], routeable: true, severity: "NONE" },
});
const loaderStops = () => [loaderStop("stop-1", 1), loaderStop("stop-2", 2), loaderStop("stop-3", 3), loaderStop("stop-7", 7)];

test("draft overlay shows the saved or unsaved future order without touching fixed stops", () => {
  const stops = loaderStops();
  assert.equal(applyLiveDraftToStops(stops, null), stops);
  const editor = reorderLiveFutureStops(createLiveEditor(response()), ["stop-7", "stop-3"]);
  const shown = applyLiveDraftToStops(stops, editor);
  assert.deepEqual(shown.map((row) => row.deliveryStopId), ["stop-1", "stop-2", "stop-7", "stop-3"]);
  assert.deepEqual(shown.map((row) => row.sequence), [1, 2, 3, 7]);
  assert.equal(shown[0], stops[0]);
  assert.equal(shown[1], stops[1]);
  assert.equal(applyLiveDraftToStops(stops, createLiveEditor(response())).map((row) => row.deliveryStopId).join(), "stop-1,stop-2,stop-3,stop-7");
});

test("draft overlay replaces only edited addresses and drops stale labels, coordinates and diagnostics", () => {
  const stops = loaderStops();
  let editor = updateLiveStop(createLiveEditor(response()), "stop-7", "address1", "700 New Avenue");
  let shown = applyLiveDraftToStops(stops, editor);
  const edited = shown.find((row) => row.deliveryStopId === "stop-7");
  assert.equal(edited.address.address1, "700 New Avenue");
  assert.equal(edited.address1, "700 New Avenue");
  assert.equal(edited.address.city, "Toronto");
  assert.equal(edited.addressLabel, undefined);
  assert.equal(edited.locationDiagnostic, undefined);
  assert.equal(edited.latitude, null);
  assert.equal(edited.longitude, null);
  assert.equal(shown.find((row) => row.deliveryStopId === "stop-3"), stops[2]);
  editor = confirmLiveLocation(updateLiveStop(updateLiveStop(editor, "stop-7", "latitude", "43.8"), "stop-7", "longitude", "-79.2"), "stop-7");
  shown = applyLiveDraftToStops(stops, editor);
  assert.deepEqual([shown[3].latitude, shown[3].longitude], [43.8, -79.2]);
});

test("a dragged timeline order may move only future stops", () => {
  const eligible = ["stop-3", "stop-4", "stop-5"];
  const current = ["stop-1", "stop-2", "stop-3", "stop-4", "stop-5"];
  assert.equal(liveOrderKeepsFixedStops(current, ["stop-1", "stop-2", "stop-5", "stop-3", "stop-4"], eligible), true);
  assert.equal(liveOrderKeepsFixedStops(current, ["stop-2", "stop-1", "stop-3", "stop-4", "stop-5"], eligible), false);
  assert.equal(liveOrderKeepsFixedStops(current, ["stop-1", "stop-3", "stop-2", "stop-4", "stop-5"], eligible), false);
  assert.equal(liveOrderKeepsFixedStops(current, ["stop-1", "stop-2", "stop-3", "stop-4"], eligible), false);
  assert.equal(liveOrderKeepsFixedStops(current, ["stop-1", "stop-2", "stop-3", "stop-4", "stop-9"], eligible), false);
});
