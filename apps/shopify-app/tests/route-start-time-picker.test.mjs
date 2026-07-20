/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRouteStartCalendarMonth,
  buildRouteStartDateTimeValue,
  buildRouteStartDraft,
  getRouteStartPickerSummary,
  getRouteStartTimezoneOptions,
  getRouteStartTimezoneSourceLabel,
  isRouteStartDraftSavable,
} from "../app/features/delivery/route-start-time-picker.js";

test("route start calendar builds a stable month grid without selecting a date", () => {
  const calendar = buildRouteStartCalendarMonth(2026, 7);

  assert.equal(calendar.label, "July 2026");
  assert.equal(calendar.weeks.length, 5);
  assert.deepEqual(calendar.weeks[0].slice(0, 4).map((day) => day?.date ?? null), [
    null,
    null,
    null,
    "2026-07-01",
  ]);
  assert.equal(calendar.weeks[4][5].date, "2026-07-31");
  assert.equal(calendar.weeks[4][6], null);
});

test("route start draft keeps blank, partial, and complete values distinct", () => {
  assert.deepEqual(buildRouteStartDraft("", "Asia/Seoul"), {
    date: "",
    hour: "",
    isBlank: true,
    isComplete: false,
    minute: "",
    period: "AM",
    timezone: "Asia/Seoul",
    value: "",
  });

  assert.deepEqual(buildRouteStartDraft("2026-07-16T12:30", "Asia/Seoul"), {
    date: "2026-07-16",
    hour: "12",
    isBlank: false,
    isComplete: true,
    minute: "30",
    period: "PM",
    timezone: "Asia/Seoul",
    value: "2026-07-16T12:30",
  });

  assert.equal(buildRouteStartDateTimeValue({ date: "2026-07-16", hour: "", minute: "30", period: "AM" }), null);
  assert.equal(buildRouteStartDateTimeValue({ date: "", hour: "", minute: "" }), "");
  assert.equal(
    buildRouteStartDateTimeValue({ date: "2026-07-16", hour: "12", minute: "30", period: "AM" }),
    "2026-07-16T00:30",
  );
  assert.equal(
    buildRouteStartDateTimeValue({ date: "2026-07-16", hour: "1", minute: "5", period: "PM" }),
    "2026-07-16T13:05",
  );
});

test("route start picker exposes store timezone choices and compact summaries", () => {
  assert.equal(getRouteStartTimezoneOptions("Asia/Seoul")[0], "Asia/Seoul");
  assert.equal(getRouteStartTimezoneSourceLabel("coordinates"), "Map marker");
  assert.equal(getRouteStartTimezoneSourceLabel("address"), "Address fallback");
  assert.equal(getRouteStartTimezoneSourceLabel("manual"), "Manual");
  assert.equal(getRouteStartTimezoneSourceLabel("fallback"), "Store setting");
  assert.equal(
    getRouteStartPickerSummary(buildRouteStartDraft("2026-07-16T12:30", "Asia/Seoul")),
    "2026-07-16 · 12:30 PM",
  );
  assert.equal(getRouteStartPickerSummary(buildRouteStartDraft("", "Asia/Seoul")), "No start time selected");
});

test("route start save state requires both date and time unless clearing", () => {
  assert.equal(isRouteStartDraftSavable(buildRouteStartDraft(""), "2026-07-16T12:30"), true);
  assert.equal(isRouteStartDraftSavable(buildRouteStartDraft(""), ""), false);
  assert.equal(
    isRouteStartDraftSavable({ date: "2026-07-16", hour: "12", minute: "", isBlank: false, isComplete: false, value: "" }, ""),
    false,
  );
  assert.equal(isRouteStartDraftSavable(buildRouteStartDraft("2026-07-16T12:30", "Asia/Seoul"), "2026-07-16T12:30", "Asia/Seoul"), false);
  assert.equal(isRouteStartDraftSavable(buildRouteStartDraft("2026-07-16T12:35", "Asia/Seoul"), "2026-07-16T12:30", "Asia/Seoul"), true);
  assert.equal(isRouteStartDraftSavable(buildRouteStartDraft("2026-07-16T12:30", "America/Toronto"), "2026-07-16T12:30", "Asia/Seoul"), true);
});
