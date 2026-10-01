/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  activeV2Groups,
  changeV2DateRange,
  clearV2Group,
  datePresetV2,
  filterV2Options,
  getDatePresetV2,
  labelV2,
  normalizeV2Filters,
  V2_LABELS,
  V2_OPTIONS,
  v2ChipValue,
  v2CompactChipValue,
} from "./order-filters-v2.js";

export function OrderFilterBar({
  filters,
  facets,
  language,
  today,
  onChange,
  onClear,
  buttonStyle,
}) {
  const [editing, setEditing] = useState(null);
  const [position, setPosition] = useState(null);
  const [weekdayOpen, setWeekdayOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(() =>
    normalizeV2Filters({}),
  );
  const anchor = useRef(null),
    addFilterAnchor = useRef(null),
    panel = useRef(null);
  const local = (en, ko) => (language === "ko" ? ko : en);
  const compactGroupLabel = (group) =>
    group === "received"
      ? local("Order", "주문")
      : group === "scheduled"
        ? local("Delivery", "배송")
        : labelV2(V2_LABELS[group], language);
  const isV2 = filters.filterVersion === "2";
  const groups = isV2 ? activeV2Groups(filters) : [];
  const close = () => {
    setEditing(null);
    setPosition(null);
    anchor.current?.focus();
  };
  const focusAddFilter = () =>
    requestAnimationFrame(() => addFilterAnchor.current?.focus());
  const applyAndClose = (nextFilters) => {
    const previousAnchor = anchor.current;
    onChange(nextFilters);
    setEditing(null);
    setPosition(null);
    requestAnimationFrame(() =>
      (previousAnchor?.isConnected
        ? previousAnchor
        : addFilterAnchor.current
      )?.focus(),
    );
  };
  const clearGroup = (group) => {
    if (!isV2) {
      close();
      return;
    }
    onChange(clearV2Group(filters, group));
    setEditing(null);
    setPosition(null);
    focusAddFilter();
  };
  const panelPosition = (target) => {
    const rect = target?.getBoundingClientRect();
    if (!rect) return null;
    const gap = 6;
    const viewportMargin = 8;
    const below = window.innerHeight - rect.bottom - gap - viewportMargin;
    const above = rect.top - gap - viewportMargin;
    const placeAbove = below < 180 && above > below;
    const maxHeight = Math.max(80, Math.min(420, placeAbove ? above : below));
    return {
      left: Math.max(
        viewportMargin,
        Math.min(rect.left, window.innerWidth - 320 - viewportMargin),
      ),
      ...(placeAbove
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
      maxHeight,
    };
  };
  const openEditor = (group, target) => {
    if (!target) return;
    anchor.current = target;
    setPosition(panelPosition(target));
    setDraftFilters(
      normalizeV2Filters(filters.filterVersion === "2" ? filters : {}),
    );
    setWeekdayOpen(
      group === "scheduled" && (filters.scheduledWeekdays ?? []).length > 0,
    );
    setEditing(group);
  };
  useEffect(() => {
    if (!editing) return undefined;
    const positionPanel = () => {
      const next = panelPosition(anchor.current);
      if (next) setPosition(next);
    };
    const pointer = (event) => {
      if (
        !panel.current?.contains(event.target) &&
        !anchor.current?.contains(event.target)
      ) {
        setEditing(null);
        setPosition(null);
      }
    };
    const keyboard = (event) => {
      if (event.key === "Escape") {
        setEditing(null);
        setPosition(null);
        anchor.current?.focus();
      }
    };
    positionPanel();
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [editing]);
  useEffect(() => {
    if (editing) panel.current?.querySelector("button, input")?.focus();
  }, [editing]);
  const toggle = (key, value) => {
    setDraftFilters((current) => {
      const selected = current[key] ?? [];
      return normalizeV2Filters({
        ...current,
        [key]: selected.includes(value)
          ? selected.filter((item) => item !== value)
          : [...selected, value],
        ...(key === "scheduledWeekdays"
          ? { scheduledDateMissing: undefined }
          : {}),
      });
    });
  };
  const options =
    editing === "areas"
      ? [
          ...new Set([
            ...(facets?.areas ?? [])
              .filter((item) => item.count > 0 && item.value !== "__MISSING__")
              .map((item) => item.value),
            ...(filters.areas ?? []),
            ...(draftFilters.areas ?? []),
          ]),
        ].map((value) => [value, value, value])
      : (V2_OPTIONS[editing] ?? []);
  const availableOptions = filterV2Options(options, facets?.[editing], [
    ...(filters[editing] ?? []),
    ...(draftFilters[editing] ?? []),
  ]);
  const showAreaMissing =
    filterV2Options(
      [["__MISSING__"]],
      facets?.areas,
      filters.areaMissing === "true" || draftFilters.areaMissing === "true"
        ? ["__MISSING__"]
        : [],
    ).length > 0;
  const renderChoices = (key, choices) =>
    choices.map(([value, en, ko]) => (
      <label
        key={value}
        style={{
          display: "flex",
          gap: 8,
          padding: "6px 0",
          alignItems: "center",
        }}
      >
        <input
          type="checkbox"
          checked={(draftFilters[key] ?? []).includes(value)}
          onChange={() => toggle(key, value)}
        />
        {local(en, ko)}
      </label>
    ));
  const dateGroup = editing === "received" || editing === "scheduled";
  const prefix = editing === "received" ? "received" : "scheduled";
  const dateFrom = draftFilters[`${prefix}DateFrom`];
  const dateTo = draftFilters[`${prefix}DateTo`];
  const dateRangeValue =
    dateFrom && dateTo ? `${dateFrom}--${dateTo}` : undefined;
  const selectedDatePreset = dateGroup
    ? getDatePresetV2(draftFilters, editing, today)
    : undefined;
  const scheduledWeekdaysChanged =
    editing === "scheduled" &&
    JSON.stringify(draftFilters.scheduledWeekdays ?? []) !==
      JSON.stringify((isV2 ? filters.scheduledWeekdays : []) ?? []);
  const active = groups.length > 0 || Boolean(filters.search) || !isV2;
  return (
    <>
      {groups.map((group) => (
        <span
          key={group}
          style={{
            display: "inline-flex",
            alignItems: "center",
            border: "1px solid #c9cccf",
            borderRadius: 8,
            maxWidth: 180,
            height: 28,
            overflow: "hidden",
            background: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          <button
            type="button"
            title={`${labelV2(V2_LABELS[group], language)}: ${v2ChipValue(filters, group, language)}`}
            aria-label={`${labelV2(V2_LABELS[group], language)}: ${v2ChipValue(filters, group, language)}`}
            onClick={(event) => openEditor(group, event.currentTarget)}
            style={{
              ...buttonStyle,
              border: 0,
              minWidth: 0,
              maxWidth: 156,
              height: 26,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              padding: "3px 6px",
              fontSize: 12,
              lineHeight: "18px",
            }}
          >
            {compactGroupLabel(group)}:{" "}
            {v2CompactChipValue(filters, group, language, today)}
          </button>
          <button
            type="button"
            aria-label={`${local("Remove", "삭제")}: ${labelV2(V2_LABELS[group], language)}`}
            style={{
              ...buttonStyle,
              border: 0,
              minWidth: 24,
              width: 24,
              height: 26,
              padding: 0,
              fontSize: 16,
              lineHeight: "20px",
            }}
            onClick={() => clearGroup(group)}
          >
            ×
          </button>
        </span>
      ))}
      {filters.search ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            border: "1px solid #c9cccf",
            borderRadius: 8,
            maxWidth: 180,
            height: 28,
            overflow: "hidden",
            background: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          <span
            title={`${local("Search", "검색")}: ${filters.search}`}
            style={{
              ...buttonStyle,
              border: 0,
              minWidth: 0,
              maxWidth: 156,
              height: 26,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              padding: "3px 6px",
              fontSize: 12,
              lineHeight: "18px",
            }}
          >
            {local("Search", "검색")}: {filters.search}
          </span>
          <button
            type="button"
            aria-label={local("Remove search", "검색 삭제")}
            style={{
              ...buttonStyle,
              border: 0,
              minWidth: 24,
              width: 24,
              height: 26,
              padding: 0,
              fontSize: 16,
              lineHeight: "20px",
            }}
            onClick={() => {
              onChange({ ...filters, search: undefined });
              focusAddFilter();
            }}
          >
            ×
          </button>
        </span>
      ) : null}
      <s-button
        ref={addFilterAnchor}
        commandFor="orders-v2-add-filter"
        onClick={() => {
          if (editing) {
            setEditing(null);
            setPosition(null);
          }
        }}
      >
        {local("Add filter", "필터 추가")}
        {groups.length ? ` (${groups.length})` : ""}
      </s-button>
      <s-menu
        id="orders-v2-add-filter"
        accessibilityLabel={local("Add order filter", "주문 필터 추가")}
      >
        {Object.keys(V2_LABELS).map((group) => (
          <s-button
            key={group}
            onClick={() => openEditor(group, addFilterAnchor.current)}
          >
            {labelV2(V2_LABELS[group], language)}
          </s-button>
        ))}
      </s-menu>
      <button
        type="button"
        disabled={!active}
        style={buttonStyle}
        onClick={() => {
          setEditing(null);
          setPosition(null);
          onClear();
          focusAddFilter();
        }}
      >
        {local("Clear all", "모두 지우기")}
      </button>
      {editing && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panel}
              role="dialog"
              aria-label={labelV2(V2_LABELS[editing], language)}
              style={{
                position: "fixed",
                ...position,
                width: "min(320px, calc(100vw - 16px))",
                maxHeight: position.maxHeight,
                overflowY: "auto",
                padding: 16,
                boxSizing: "border-box",
                zIndex: 1100,
                border: "1px solid #c9cccf",
                borderRadius: 8,
                background: "white",
                boxShadow: "0 8px 24px #0002",
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <strong>{labelV2(V2_LABELS[editing], language)}</strong>
                <button
                  type="button"
                  aria-label={local("Close filter", "필터 닫기")}
                  style={buttonStyle}
                  onClick={close}
                >
                  ×
                </button>
              </div>
              {dateGroup ? (
                <>
                  {editing === "scheduled" ? (
                    <p>
                      {local(
                        "Scheduled delivery or pickup date",
                        "예정 배송·픽업일",
                      )}
                    </p>
                  ) : null}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      margin: "10px 0",
                    }}
                  >
                    {(editing === "received"
                      ? [
                          ["today", "Today", "오늘"],
                          ["yesterday", "Yesterday", "어제"],
                          ["last7", "Last 7 days", "지난 7일"],
                        ]
                      : [
                          ["today", "Today", "오늘"],
                          ["tomorrow", "Tomorrow", "내일"],
                          ["next7", "Next 7 days", "앞으로 7일"],
                          ["past", "Past dates", "과거 날짜"],
                          ["missing", "No date", "날짜없음"],
                        ]
                    ).map(([value, en, ko]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selectedDatePreset === value}
                        style={buttonStyle}
                        onClick={() =>
                          applyAndClose(
                            datePresetV2(draftFilters, editing, value, today),
                          )
                        }
                      >
                        {local(en, ko)}
                      </button>
                    ))}
                  </div>
                  <s-date-picker
                    type="range"
                    value={dateRangeValue}
                    defaultView={(dateFrom ?? dateTo ?? today).slice(0, 7)}
                    onChange={(event) => {
                      const range = event.currentTarget.value;
                      if (!range.split("--")[1]) return;
                      applyAndClose(
                        changeV2DateRange(draftFilters, editing, range),
                      );
                    }}
                  />
                  {editing === "scheduled" ? (
                    <details
                      open={weekdayOpen}
                      onToggle={(event) =>
                        setWeekdayOpen(event.currentTarget.open)
                      }
                      style={{ marginTop: 10 }}
                    >
                      <summary>{local("Weekday", "요일")}</summary>
                      {renderChoices(
                        "scheduledWeekdays",
                        V2_OPTIONS.scheduledWeekdays,
                      )}
                    </details>
                  ) : null}
                </>
              ) : editing === "cancelled" ? (
                <>
                  {[
                    ["false", "Not cancelled", "취소되지 않음"],
                    ["true", "Cancelled", "취소됨"],
                  ].map(([value, en, ko]) => (
                    <label
                      key={value}
                      style={{ display: "flex", gap: 8, padding: "8px 0" }}
                    >
                      <input
                        type="radio"
                        name="orders-cancelled"
                        checked={draftFilters.cancelled === value}
                        onChange={() =>
                          setDraftFilters((current) =>
                            normalizeV2Filters({
                              ...current,
                              cancelled: value,
                            }),
                          )
                        }
                      />
                      {local(en, ko)}
                    </label>
                  ))}
                </>
              ) : (
                <>
                  {renderChoices(editing, availableOptions)}
                  {editing !== "areas" && availableOptions.length === 0 ? (
                    <p>
                      {local(
                        "No matching options",
                        "선택 가능한 항목이 없습니다",
                      )}
                    </p>
                  ) : null}
                  {editing === "areas" ? (
                    <>
                      {availableOptions.length === 0 && !showAreaMissing ? (
                        <p>
                          {local(
                            "No areas available",
                            "사용 가능한 지역이 없습니다",
                          )}
                        </p>
                      ) : null}
                      {showAreaMissing ? (
                        <label
                          style={{ display: "flex", gap: 8, padding: "8px 0" }}
                        >
                          <input
                            type="checkbox"
                            checked={draftFilters.areaMissing === "true"}
                            onChange={(event) => {
                              const input = event.currentTarget;
                              if (input instanceof HTMLInputElement)
                                setDraftFilters((current) =>
                                  normalizeV2Filters({
                                    ...current,
                                    areaMissing: input.checked
                                      ? "true"
                                      : undefined,
                                  }),
                                );
                            }}
                          />
                          {local("Area not set", "지역 미정")}
                        </label>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 6,
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: "1px solid #e1e3e5",
                }}
              >
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => clearGroup(editing)}
                >
                  {local("Clear filter", "필터 지우기")}
                </button>
                {!dateGroup ||
                (editing === "scheduled" &&
                  (weekdayOpen || scheduledWeekdaysChanged)) ? (
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => applyAndClose(draftFilters)}
                  >
                    {local("Add filter", "필터 추가")}
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
