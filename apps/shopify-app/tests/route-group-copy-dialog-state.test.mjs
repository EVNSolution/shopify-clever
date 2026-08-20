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
  });
});

test("copy success closes and resets the dialog", () => {
  const started = beginRouteGroupCopySubmit(
    selectRouteGroupCopyMode(openRouteGroupCopyDialog(), "VIRTUAL"),
  ).state;

  assert.deepEqual(succeedRouteGroupCopySubmit(started), createRouteGroupCopyDialogState());
});
