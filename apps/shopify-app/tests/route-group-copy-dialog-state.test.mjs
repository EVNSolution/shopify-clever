/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  beginRouteGroupCopySubmit,
  createRouteGroupCopyDialogState,
  failRouteGroupCopySubmit,
  openRouteGroupCopyDialog,
  selectRouteGroupCopyMode,
  succeedRouteGroupCopySubmit,
} from "../app/features/delivery/route-group-copy-dialog-state.js";

test("copy dialog opens without a dangerous default mode", () => {
  const state = openRouteGroupCopyDialog(createRouteGroupCopyDialogState());

  assert.deepEqual(state, {
    error: null,
    isOpen: true,
    isSubmitting: false,
    mode: null,
    requestId: null,
  });
  assert.equal(beginRouteGroupCopySubmit(state).accepted, false);
});

test("copy dialog accepts only one rapid submit", () => {
  const selected = selectRouteGroupCopyMode(openRouteGroupCopyDialog(), "VIRTUAL");
  const first = beginRouteGroupCopySubmit(selected);
  const second = beginRouteGroupCopySubmit(first.state);

  assert.equal(first.accepted, true);
  assert.equal(first.state.isSubmitting, true);
  assert.equal(second.accepted, false);
  assert.equal(second.state, first.state);
});

test("copy failure keeps the selected dialog open with its error", () => {
  const started = beginRouteGroupCopySubmit(
    selectRouteGroupCopyMode(openRouteGroupCopyDialog(), "REFERENCE"),
  ).state;
  const failed = failRouteGroupCopySubmit(started, "Route changed");

  assert.deepEqual(failed, {
    error: "Route changed",
    isOpen: true,
    isSubmitting: false,
    mode: "REFERENCE",
    requestId: started.requestId,
  });
});

test("Copy keeps its logical request key through response loss, and a new dialog starts a fresh request", () => {
  const state = selectRouteGroupCopyMode(openRouteGroupCopyDialog(), "REFERENCE");
  const first = beginRouteGroupCopySubmit(state, "11111111-1111-4111-8111-111111111111");
  const retry = beginRouteGroupCopySubmit(failRouteGroupCopySubmit(first.state, "Response lost"), "22222222-2222-4222-8222-222222222222");
  assert.equal(retry.state.requestId, first.state.requestId);
  const fresh = beginRouteGroupCopySubmit(selectRouteGroupCopyMode(openRouteGroupCopyDialog(), "REFERENCE"), "22222222-2222-4222-8222-222222222222");
  assert.notEqual(fresh.state.requestId, first.state.requestId);
});

test("copy success closes and resets the dialog", () => {
  const started = beginRouteGroupCopySubmit(
    selectRouteGroupCopyMode(openRouteGroupCopyDialog(), "VIRTUAL"),
  ).state;

  assert.deepEqual(succeedRouteGroupCopySubmit(started), createRouteGroupCopyDialogState());
});
