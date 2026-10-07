import assert from "node:assert/strict";
import test from "node:test";
import { createLiveRouteFixture, FIXTURE_IDS } from "../scripts/live-route-change-fixture-state.mjs";

let nextCommand = 0;
const guard = (fixture) => {
  const { revision, assignmentGeneration, ids } = fixture.state();
  return { commandId: `80000000-0000-4000-8000-${String(++nextCommand).padStart(12, "0")}`,
    expectedAssignmentGeneration: assignmentGeneration, expectedRouteVersionId: ids.child, expectedRevision: revision };
};
const save = (fixture, stop = 7, address = "700 Synthetic Avenue") => fixture.command("liveChangeSave", {
  ...guard(fixture), stopOverrides: [{ deliveryStopId: FIXTURE_IDS.stop(stop), address1: address, latitude: 43.7, longitude: -79.4 }],
});

test("synthetic fixture keeps stop 2 current and Save private until Dispatch", () => {
  const fixture = createLiveRouteFixture();
  const baseline = fixture.state().published;
  assert.equal(fixture.plan().stops[0].status, "DELIVERED");
  assert.equal(fixture.plan().stops[1].status, "ARRIVED");
  assert.equal(fixture.detail(FIXTURE_IDS.child).routePlan.id, FIXTURE_IDS.route);
  assert.notEqual(FIXTURE_IDS.child, FIXTURE_IDS.route);
  assert.deepEqual(fixture.read().body.data.editableFutureStopIds, [3, 4, 5, 6, 7, 8].map(FIXTURE_IDS.stop));
  assert.equal(save(fixture).status, 200);
  assert.deepEqual(fixture.state().published, baseline);
  assert.equal(fixture.state().hasUnpublishedChanges, true);
  assert.equal(fixture.command("liveChangeDispatch", guard(fixture)).body.data.changed, true);
  assert.equal(fixture.state().published.stops[6].address1, "700 Synthetic Avenue");
  assert.equal(fixture.state().counters.logicalNotifications, 1);
});

test("synthetic fixture rejects a blocked draft and supports explicit Discard recovery", () => {
  const fixture = createLiveRouteFixture();
  save(fixture);
  fixture.control("driver-current", 7);
  assert.equal(fixture.command("liveChangeDispatch", guard(fixture)).body.error.code, "STOP_NOT_FUTURE");
  assert.equal(fixture.read().body.data.hasUnpublishedChanges, true);
  assert.equal(fixture.command("liveChangeDiscard", guard(fixture)).status, 200);
  assert.equal(fixture.state().revision, 2);
  assert.equal(fixture.state().hasUnpublishedChanges, false);
  assert.equal(save(fixture, 8).status, 200);
  assert.equal(fixture.command("liveChangeDispatch", guard(fixture)).status, 200);
});

test("synthetic receipts replay the original body and revision after newer state", () => {
  const fixture = createLiveRouteFixture();
  const body = { ...guard(fixture), stopOverrides: [{ deliveryStopId: FIXTURE_IDS.stop(7), address1: "Saved without coordinates" }] };
  const original = fixture.command("liveChangeSave", body);
  assert.equal(original.body.data.draft.stops[6].latitude, null);
  assert.equal(fixture.command("liveChangeDispatch", guard(fixture)).body.error.code, "STOP_LOCATION_NOT_ROUTEABLE");
  fixture.control("admin-edit");
  assert.equal(fixture.command("liveChangeSave", body).body.data.revision, 1);
  assert.equal(fixture.read().body.data.revision, 2);
  assert.equal(fixture.state().counters.receiptReplays, 1);
  assert.equal(fixture.command("liveChangeSave", { ...body, expectedRevision: 2 }).body.error.code, "IDEMPOTENCY_CONFLICT");
});

test("synthetic Dispatch retry preserves publication and retries failed side effects", () => {
  const fixture = createLiveRouteFixture();
  save(fixture);
  fixture.control("delivery-failure", true);
  const body = guard(fixture);
  const original = fixture.command("liveChangeDispatch", body).body.data;
  assert.equal(original.geometry.status, "failed");
  assert.equal(original.notification.status, "FAILED");
  fixture.control("delivery-failure", false);
  const retry = fixture.command("liveChangeDispatch", body).body.data;
  assert.equal(retry.publicationVersionId, original.publicationVersionId);
  assert.equal(retry.notification.status, "SENT");
  assert.equal(retry.notification.attemptCount, 2);
  const unchanged = fixture.command("liveChangeDispatch", guard(fixture)).body.data;
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.publicationVersionId, original.publicationVersionId);
  assert.equal(fixture.state().counters.publications, 1);
  assert.equal(fixture.state().counters.logicalNotifications, 1);
});

test("synthetic revision, assignment and session scope changes reject stale office commands", () => {
  const fixture = createLiveRouteFixture();
  const body = { ...guard(fixture), stopOverrides: [] };
  fixture.control("admin-edit");
  assert.equal(fixture.command("liveChangeSave", body).body.error.code, "REVISION_CONFLICT");
  fixture.control("assignment");
  assert.equal(fixture.command("liveChangeSave", body).body.error.code, "ASSIGNMENT_CHANGED");
  const scope = fixture.scopeKey();
  fixture.control("scope");
  assert.equal(fixture.read(scope).body.error.code, "LIVE_CHANGE_SCOPE_CHANGED");
  fixture.control("forbidden", true);
  assert.equal(fixture.command("liveChangeSave", guard(fixture)).status, 403);
  assert.equal(fixture.state().counters.publications, 0);
});

test("synthetic future order requires every future ID and fixes current/completed positions", () => {
  const fixture = createLiveRouteFixture();
  assert.equal(save(fixture, 2).body.error.code, "STOP_NOT_FUTURE");
  assert.equal(save(fixture, 1).body.error.code, "STOP_NOT_FUTURE");
  const order = [7, 3, 4, 5, 6, 8].map(FIXTURE_IDS.stop);
  assert.equal(fixture.command("liveChangeSave", { ...guard(fixture), futureStopOrder: order }).body.error.code, "INVALID_INPUT");
  assert.equal(fixture.command("liveChangeSave", { ...guard(fixture), stopOverrides: [], futureStopOrder: order.slice(1) }).body.error.code, "INVALID_INPUT");
  assert.equal(fixture.command("liveChangeSave", { ...guard(fixture), stopOverrides: [], futureStopOrder: order }).status, 200);
  assert.deepEqual(fixture.state().draft.stops.map((stop) => stop.deliveryStopId), [FIXTURE_IDS.stop(1), FIXTURE_IDS.stop(2), ...order]);
  assert.deepEqual(fixture.state().draft.stops.map((stop) => stop.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("deterministic lost response preserves the commit and requires an authorized original retry", () => {
  const fixture = createLiveRouteFixture();
  save(fixture);
  const body = guard(fixture);
  const committed = fixture.command("liveChangeDispatch", body);
  const lost = fixture.loseCommittedResponse("liveChangeDispatch", committed);
  assert.equal(lost.status, 503);
  assert.equal(lost.body.outcomeUnknown, true);
  assert.equal(lost.body.data, null);
  assert.equal(fixture.state().publishedVersionId, committed.body.data.publicationVersionId);
  assert.equal(fixture.state().counters.publications, 1);
  fixture.control("forbidden", true);
  assert.equal(fixture.command("liveChangeDispatch", body).status, 403);
  assert.equal(fixture.state().counters.receiptReplays, 0);
  fixture.control("forbidden", false);
  const retried = fixture.command("liveChangeDispatch", body);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.data.publicationVersionId, committed.body.data.publicationVersionId);
  assert.equal(fixture.state().counters.publications, 1);
  assert.equal(fixture.state().counters.logicalNotifications, 1);
  assert.equal(fixture.state().counters.receiptReplays, 1);
  assert.equal(fixture.state().log.filter((entry) => entry.kind === "response-lost-after-commit").length, 1);
});
