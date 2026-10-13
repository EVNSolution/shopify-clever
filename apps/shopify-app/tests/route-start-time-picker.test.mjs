/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

import {
  buildRouteStartCalendarMonth,
  buildRouteStartDateTimeValue,
  buildRouteStartDraft,
  getRouteStartApplyBlocker,
  getRouteStartPlanDateError,
  getRouteStartPickerSummary,
  getRouteStartTimezoneOptions,
  getRouteStartTimezoneAbbreviation,
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

test("route start validation preserves the selected local date and reports plan-date mismatches", () => {
  assert.equal(getRouteStartPlanDateError(buildRouteStartDraft("2026-09-11T17:30", "America/Toronto"), "2026-09-11"), null);
  assert.equal(getRouteStartPlanDateError(buildRouteStartDraft("2026-09-12T00:30", "America/Toronto"), "2026-09-11"), "plan_date_mismatch");
  assert.equal(getRouteStartPlanDateError(buildRouteStartDraft("2026-09-11T17:30", "America/Toronto"), null), null);
  assert.equal(getRouteStartPlanDateError(buildRouteStartDraft("", "America/Toronto"), "2026-09-11"), null);
});

test("picker timezone abbreviation and calendar month follow the selected date across host timezones", () => {
  const calendarCheck = spawnSync(process.execPath, ["--input-type=module", "-e", 'import { buildRouteStartCalendarMonth } from "./app/features/delivery/route-start-time-picker.js"; console.log(buildRouteStartCalendarMonth(2026, 1).label);'], { encoding: "utf8", env: { ...process.env, TZ: "America/Los_Angeles" } });
  assert.equal(calendarCheck.status, 0, calendarCheck.stderr);
  assert.equal(calendarCheck.stdout.trim(), "January 2026");
  const previousTZ = process.env.TZ;
  try {
    for (const hostTimeZone of ["Asia/Seoul", "UTC", "America/Los_Angeles"]) {
      process.env.TZ = hostTimeZone;
      assert.equal(buildRouteStartCalendarMonth(2026, 1).label, "January 2026");
      assert.equal(getRouteStartTimezoneAbbreviation(buildRouteStartDraft("2026-01-16T09:00", "America/Toronto"), "EDT"), "EST");
      assert.equal(getRouteStartTimezoneAbbreviation(buildRouteStartDraft("2026-07-16T09:00", "America/Toronto"), "EST"), "EDT");
      assert.equal(getRouteStartTimezoneAbbreviation(buildRouteStartDraft("2026-03-08T01:59", "America/Toronto")), "EST");
      assert.equal(getRouteStartTimezoneAbbreviation(buildRouteStartDraft("2026-03-08T03:00", "America/Toronto")), "EDT");
      assert.equal(getRouteStartTimezoneAbbreviation(buildRouteStartDraft("2026-03-08T02:30", "America/Toronto")), undefined);
    }
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test("a route without a start time opens on its delivery date with empty time fields", () => {
  const draft = buildRouteStartDraft("", "Asia/Seoul", "2026-10-15T00:00:00.000Z");
  assert.equal(draft.date, "2026-10-15");
  assert.equal(draft.hour, "");
  assert.equal(draft.minute, "");
  assert.equal(draft.value, "");
  // An existing start time keeps its own date.
  assert.equal(buildRouteStartDraft("2026-10-16T09:00", "Asia/Seoul", "2026-10-15").date, "2026-10-16");
  assert.equal(buildRouteStartDraft("", "Asia/Seoul", "not a date").date, "");
});

test("Apply explains why a draft cannot be saved instead of staying inert", () => {
  const withDate = buildRouteStartDraft("", "Asia/Seoul", "2026-10-15");
  assert.equal(getRouteStartApplyBlocker(withDate, "", "Asia/Seoul").message, "Enter the hour and minute.");
  assert.equal(getRouteStartApplyBlocker(buildRouteStartDraft("", "Asia/Seoul"), "", "Asia/Seoul").kind, "unchanged");
  const bad = { ...withDate, hour: "13", minute: "00" };
  assert.equal(getRouteStartApplyBlocker(bad, "", "Asia/Seoul").kind, "invalid");
  const ok = { ...withDate, hour: "9", minute: "30", period: "AM" };
  assert.equal(getRouteStartApplyBlocker(ok, "", "Asia/Seoul"), null);
  assert.equal(getRouteStartApplyBlocker(ok, "2026-10-15T09:30", "Asia/Seoul").kind, "unchanged");
});
