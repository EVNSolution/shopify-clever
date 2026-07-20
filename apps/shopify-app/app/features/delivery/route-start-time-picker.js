import { createElement as h, useEffect, useMemo, useRef, useState } from "react";

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
const PERIODS = ["AM", "PM"];

function isValidDateText(value) {
  if (!DATE_PATTERN.test(String(value ?? ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function normalizeNumericText(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 2);
}

function normalizeDraft(date, hour, minute, period = "AM", timezone = "") {
  const nextDate = isValidDateText(date) ? date : "";
  const nextHour = normalizeNumericText(hour);
  const nextMinute = normalizeNumericText(minute);
  const nextPeriod = PERIODS.includes(period) ? period : "AM";
  const nextTimezone = String(timezone ?? "").trim();
  const value = buildRouteStartDateTimeValue({
    date: nextDate,
    hour: nextHour,
    minute: nextMinute,
    period: nextPeriod,
  });

  return {
    date: nextDate,
    hour: nextHour,
    isBlank: nextDate === "" && nextHour === "" && nextMinute === "",
    isComplete: value !== null && value !== "",
    minute: nextMinute,
    period: nextPeriod,
    timezone: nextTimezone,
    value: value === null ? "" : value,
  };
}

export function buildRouteStartDateTimeValue(draft) {
  const date = String(draft?.date ?? "");
  const hour = String(draft?.hour ?? "");
  const minute = String(draft?.minute ?? "");
  if (date === "" && hour === "" && minute === "") return "";
  if (!isValidDateText(date) || !/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute)) return null;

  const numericHour = Number(hour);
  const numericMinute = Number(minute);
  const period = PERIODS.includes(draft?.period) ? draft.period : "AM";
  if (numericHour < 1 || numericHour > 12 || numericMinute < 0 || numericMinute > 59) return null;

  const hour24 = (numericHour % 12) + (period === "PM" ? 12 : 0);
  return `${date}T${String(hour24).padStart(2, "0")}:${String(numericMinute).padStart(2, "0")}`;
}

export function buildRouteStartDraft(value, defaultTimezone = "") {
  if (value && typeof value === "object") {
    return normalizeDraft(
      value.date,
      value.hour,
      value.minute,
      value.period,
      value.timezone || defaultTimezone,
    );
  }

  const match = String(value ?? "").match(DATE_TIME_PATTERN);
  if (!match) return normalizeDraft("", "", "", "AM", defaultTimezone);

  const hour24 = Number(match[2]);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return normalizeDraft(match[1], String(hour12).padStart(2, "0"), match[3], period, defaultTimezone);
}

export function isRouteStartDraftSavable(draft, currentValue, currentTimezone = "") {
  const value = buildRouteStartDateTimeValue(draft);
  if (value === null) return false;
  if (value === "" && !currentValue) return false;
  return value !== currentValue || (value !== "" && draft?.timezone !== currentTimezone);
}

export function getRouteStartPickerSummary(draft) {
  const value = buildRouteStartDateTimeValue(draft);
  if (value === "") return "No start time selected";
  if (value === null) return "Select date and time";
  return `${draft.date} · ${String(Number(draft.hour)).padStart(2, "0")}:${String(Number(draft.minute)).padStart(2, "0")} ${draft.period}`;
}

export function getRouteStartTimezoneOptions(defaultTimezone = "") {
  const supportedTimezones = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];
  return Array.from(new Set([defaultTimezone, ...supportedTimezones].filter(Boolean)));
}

export function getRouteStartTimezoneSourceLabel(source) {
  if (source === "coordinates") return "Map marker";
  if (source === "address") return "Address fallback";
  if (source === "manual") return "Manual";
  return "Store setting";
}

export function buildRouteStartCalendarMonth(year, month) {
  const normalizedYear = Number(year);
  const normalizedMonth = Number(month);
  if (!Number.isInteger(normalizedYear) || !Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) {
    throw new RangeError("Calendar month must use a numeric year and 1-12 month.");
  }

  const firstDay = new Date(Date.UTC(normalizedYear, normalizedMonth - 1, 1));
  const daysInMonth = new Date(Date.UTC(normalizedYear, normalizedMonth, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: firstDay.getUTCDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      return {
        date: `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        day,
        isCurrentMonth: true,
      };
    }),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return {
    label: MONTH_FORMATTER.format(firstDay),
    month: normalizedMonth,
    weeks,
    year: normalizedYear,
  };
}

function getInitialVisibleMonth(draft) {
  const date = isValidDateText(draft?.date) ? draft.date : new Date().toISOString().slice(0, 10);
  const [year, month] = date.split("-").map(Number);
  return { month, year };
}

function shiftVisibleMonth(visibleMonth, delta) {
  const date = new Date(Date.UTC(visibleMonth.year, visibleMonth.month - 1 + delta, 1));
  return {
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

function selectDate(draft, date) {
  return normalizeDraft(date, draft.hour, draft.minute, draft.period, draft.timezone);
}

function selectHour(draft, hour) {
  return normalizeDraft(draft.date, hour, draft.minute, draft.period, draft.timezone);
}

function selectMinute(draft, minute) {
  return normalizeDraft(draft.date, draft.hour, minute, draft.period, draft.timezone);
}

function selectPeriod(draft, period) {
  return normalizeDraft(draft.date, draft.hour, draft.minute, period, draft.timezone);
}

function selectTimezone(draft, timezone) {
  return normalizeDraft(draft.date, draft.hour, draft.minute, draft.period, timezone);
}

export function RouteStartTimePicker({
  disabled = false,
  draft,
  onClear,
  onDraftChange,
  routeTitle,
  storeTimezone,
  timezoneAbbreviation,
  timezoneSource,
}) {
  const normalizedDraft = buildRouteStartDraft(draft, storeTimezone);
  const [visibleMonth, setVisibleMonth] = useState(() => getInitialVisibleMonth(normalizedDraft));
  const calendar = useMemo(
    () => buildRouteStartCalendarMonth(visibleMonth.year, visibleMonth.month),
    [visibleMonth.month, visibleMonth.year],
  );
  const summary = getRouteStartPickerSummary(normalizedDraft);
  const timezoneOptions = useMemo(
    () => getRouteStartTimezoneOptions(storeTimezone),
    [storeTimezone],
  );
  const [isTimezoneOpen, setIsTimezoneOpen] = useState(false);
  const [timezoneQuery, setTimezoneQuery] = useState("");
  const timezonePickerRef = useRef(null);
  const visibleTimezoneOptions = useMemo(() => {
    const query = timezoneQuery.trim().toLowerCase();
    if (!query) return timezoneOptions;
    return timezoneOptions.filter((timezone) => timezone.toLowerCase().includes(query));
  }, [timezoneOptions, timezoneQuery]);

  useEffect(() => {
    if (!isTimezoneOpen) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (!timezonePickerRef.current?.contains(event.target)) setIsTimezoneOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsTimezoneOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isTimezoneOpen]);

  const changeDraft = (nextDraft) => {
    onDraftChange?.(nextDraft);
  };
  const clearDraft = () => {
    const blankDraft = buildRouteStartDraft("", normalizedDraft.timezone || storeTimezone);
    onDraftChange?.(blankDraft);
    onClear?.(blankDraft);
  };

  return h("div", { className: "route-start-time-picker" }, [
    h("div", { className: "route-start-time-picker__summary", key: "summary" }, [
      h("strong", { className: "route-start-time-picker__summary-route", key: "route-value" }, routeTitle || "Route"),
      h("span", { className: "route-start-time-picker__summary-start", key: "start-value" }, summary),
    ]),
    h("div", { className: "route-start-time-picker__body", key: "body" }, [
      h("div", { className: "route-start-time-picker__date-panel", key: "date-panel" }, [
        h("div", { className: "route-start-time-picker__calendar-header", key: "calendar-header" }, [
          h(
            "button",
            {
              "aria-label": "Previous month",
              className: "route-start-time-picker__month-button",
              disabled,
              key: "previous",
              onClick: () => setVisibleMonth((current) => shiftVisibleMonth(current, -1)),
              type: "button",
            },
            "<",
          ),
          h("span", { className: "route-start-time-picker__month-label", key: "label" }, calendar.label),
          h(
            "button",
            {
              "aria-label": "Next month",
              className: "route-start-time-picker__month-button",
              disabled,
              key: "next",
              onClick: () => setVisibleMonth((current) => shiftVisibleMonth(current, 1)),
              type: "button",
            },
            ">",
          ),
        ]),
        h("div", { className: "route-start-time-picker__calendar", key: "calendar", role: "grid" }, [
          ...DAY_LABELS.map((label) => (
            h("div", { className: "route-start-time-picker__weekday", key: `weekday-${label}`, role: "columnheader" }, label)
          )),
          ...calendar.weeks.flatMap((week, weekIndex) => week.map((day, dayIndex) => (
            day
              ? h(
                "button",
                {
                  "aria-label": `Select ${day.date}`,
                  "aria-selected": normalizedDraft.date === day.date,
                  className: normalizedDraft.date === day.date
                    ? "route-start-time-picker__day route-start-time-picker__day--selected"
                    : "route-start-time-picker__day",
                  disabled,
                  key: day.date,
                  onClick: () => changeDraft(selectDate(normalizedDraft, day.date)),
                  role: "gridcell",
                  type: "button",
                },
                String(day.day),
              )
              : h("span", {
                "aria-hidden": "true",
                className: "route-start-time-picker__day route-start-time-picker__day--empty",
                key: `empty-${weekIndex}-${dayIndex}`,
                role: "gridcell",
              })
          ))),
        ]),
      ]),
      h("div", { className: "route-start-time-picker__time-panel", key: "time-panel" }, [
        h("div", { className: "route-start-time-picker__timezone-picker", key: "timezone-field", ref: timezonePickerRef }, [
          h("div", { className: "route-start-time-picker__timezone-heading", key: "timezone-heading" }, [
            h("span", { key: "timezone-label" }, "Timezone"),
            h(
              "small",
              { key: "timezone-source" },
              getRouteStartTimezoneSourceLabel(
                normalizedDraft.timezone !== storeTimezone ? "manual" : timezoneSource,
              ),
            ),
          ]),
          h(
            "button",
            {
              "aria-label": "Route start timezone",
              "aria-expanded": isTimezoneOpen,
              "aria-haspopup": "listbox",
              className: "route-start-time-picker__timezone-trigger",
              disabled,
              key: "timezone-trigger",
              onClick: () => setIsTimezoneOpen((open) => !open),
              type: "button",
            },
            [
              h("span", { key: "timezone-value" }, normalizedDraft.timezone || "Select timezone"),
              timezoneAbbreviation && normalizedDraft.timezone === storeTimezone
                ? h("small", { key: "timezone-abbreviation" }, timezoneAbbreviation)
                : null,
              h("span", { "aria-hidden": "true", className: "route-start-time-picker__timezone-chevron", key: "timezone-chevron" }, "⌄"),
            ],
          ),
          isTimezoneOpen ? h("div", { className: "route-start-time-picker__timezone-popover", key: "timezone-popover" }, [
            h("input", {
              "aria-label": "Search timezones",
              autoFocus: true,
              className: "route-start-time-picker__timezone-search",
              key: "timezone-search",
              onChange: (event) => setTimezoneQuery(event.currentTarget.value),
              placeholder: "Search timezone",
              type: "search",
              value: timezoneQuery,
            }),
            h("div", { className: "route-start-time-picker__timezone-options", key: "timezone-options", role: "listbox" }, visibleTimezoneOptions.length > 0
              ? visibleTimezoneOptions.map((timezone) => h(
                "button",
                {
                  "aria-selected": normalizedDraft.timezone === timezone,
                  className: normalizedDraft.timezone === timezone
                    ? "route-start-time-picker__timezone-option route-start-time-picker__timezone-option--selected"
                    : "route-start-time-picker__timezone-option",
                  key: timezone,
                  onClick: () => {
                    changeDraft(selectTimezone(normalizedDraft, timezone));
                    setIsTimezoneOpen(false);
                    setTimezoneQuery("");
                  },
                  role: "option",
                  type: "button",
                },
                timezone,
              ))
              : h("div", { className: "route-start-time-picker__timezone-empty", key: "timezone-empty" }, "No matching timezone")),
          ]) : null,
        ]),
        h("div", { "aria-label": "AM or PM", className: "route-start-time-picker__period", key: "period", role: "group" }, PERIODS.map((period) => h(
          "button",
          {
            "aria-pressed": normalizedDraft.period === period,
            className: normalizedDraft.period === period
              ? "route-start-time-picker__period-button route-start-time-picker__period-button--selected"
              : "route-start-time-picker__period-button",
            disabled,
            key: period,
            onClick: () => changeDraft(selectPeriod(normalizedDraft, period)),
            type: "button",
          },
          period,
        ))),
        h("div", { className: "route-start-time-picker__time-inputs", key: "time" }, [
          h("input", {
            "aria-label": "Route start hour",
            disabled,
            inputMode: "numeric",
            key: "hour",
            maxLength: 2,
            onChange: (event) => changeDraft(selectHour(normalizedDraft, event.currentTarget.value)),
            placeholder: "HH",
            type: "text",
            value: normalizedDraft.hour,
          }),
          h("span", { "aria-hidden": "true", key: "separator" }, ":"),
          h("input", {
            "aria-label": "Route start minute",
            disabled,
            inputMode: "numeric",
            key: "minute",
            maxLength: 2,
            onChange: (event) => changeDraft(selectMinute(normalizedDraft, event.currentTarget.value)),
            placeholder: "MM",
            type: "text",
            value: normalizedDraft.minute,
          }),
        ]),
        h(
          "button",
          {
            className: "route-start-time-picker__clear",
            disabled,
            key: "clear",
            onClick: clearDraft,
            type: "button",
          },
          "Clear start time",
        ),
      ]),
    ]),
  ]);
}
