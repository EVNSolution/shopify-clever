/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  activeV2Groups,
  changeV2DateBound,
  clearV2Group,
  datePresetV2,
  labelV2,
  normalizeV2Filters,
  V2_LABELS,
  V2_OPTIONS,
  v2ChipValue,
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
  const anchor = useRef(null),
    panel = useRef(null);
  const local = (en, ko) => (language === "ko" ? ko : en);
  const isV2 = filters.filterVersion === "2";
  const groups = isV2 ? activeV2Groups(filters) : [];
  const close = () => {
    setEditing(null);
    anchor.current?.focus();
  };
  useEffect(() => {
    if (!editing) return undefined;
    const positionPanel = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)),
        top: Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 400)),
      });
    };
    const pointer = (event) => {
      if (
        !panel.current?.contains(event.target) &&
        !anchor.current?.contains(event.target)
      )
        setEditing(null);
    };
    const keyboard = (event) => {
      if (event.key === "Escape") {
        setEditing(null);
        anchor.current?.focus();
      }
    };
    positionPanel();
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("resize", positionPanel);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", positionPanel);
    };
  }, [editing]);
  useEffect(() => {
    if (editing && position)
      panel.current?.querySelector("button, input")?.focus();
  }, [editing, position]);
  const update = (patch) =>
    onChange(normalizeV2Filters({ ...(isV2 ? filters : {}), ...patch }));
  const toggle = (key, value) => {
    const selected = isV2 ? (filters[key] ?? []) : [];
    update({
      [key]: selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
      ...(key === "scheduledWeekdays"
        ? { scheduledDateMissing: undefined }
        : {}),
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
          ]),
        ].map((value) => [value, value, value])
      : (V2_OPTIONS[editing] ?? []);
  const availableOptions = options.filter(
    (option) =>
      !facets ||
      (facets[editing] ?? []).some(
        (item) => item.value === option[0] && item.count > 0,
      ) ||
      (filters[editing] ?? []).includes(option[0]),
  );
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
          checked={isV2 && (filters[key] ?? []).includes(value)}
          onChange={() => toggle(key, value)}
        />
        {local(en, ko)}
      </label>
    ));
  const dateGroup = editing === "received" || editing === "scheduled";
  const prefix = editing === "received" ? "received" : "scheduled";
  const active = groups.length > 0 || Boolean(filters.search) || !isV2;
  return (
    <>
      <span ref={anchor} tabIndex={-1}>
        <s-button commandFor="orders-v2-add-filter">
          {local("Add filter", "필터 추가")}
          {groups.length ? ` (${groups.length})` : ""}
        </s-button>
      </span>
      <s-menu
        id="orders-v2-add-filter"
        accessibilityLabel={local("Add order filter", "주문 필터 추가")}
      >
        {Object.keys(V2_LABELS).map((group) => (
          <s-button key={group} onClick={() => setEditing(group)}>
            {labelV2(V2_LABELS[group], language)}
          </s-button>
        ))}
      </s-menu>
      {!isV2 ? (
        <span style={{ fontSize: 12 }}>
          {local(
            "Legacy link filters retained. Choosing a new condition replaces them.",
            "이전 링크 조건을 유지합니다. 새 조건을 선택하면 이전 조건이 교체됩니다.",
          )}
        </span>
      ) : null}
      {groups.map((group) => (
        <span
          key={group}
          style={{
            display: "inline-flex",
            border: "1px solid #c9cccf",
            borderRadius: 8,
            maxWidth: "100%",
            background: "#fff",
          }}
        >
          <button
            type="button"
            onClick={() => setEditing(group)}
            style={{
              ...buttonStyle,
              border: 0,
              minWidth: 0,
              maxWidth: "100%",
              whiteSpace: "normal",
            }}
          >
            {labelV2(V2_LABELS[group], language)}:{" "}
            {v2ChipValue(filters, group, language)}
          </button>
          <button
            type="button"
            aria-label={`${local("Remove", "삭제")}: ${labelV2(V2_LABELS[group], language)}`}
            style={{ ...buttonStyle, border: 0, minWidth: 28 }}
            onClick={() => onChange(clearV2Group(filters, group))}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={!active}
        style={buttonStyle}
        onClick={() => {
          close();
          onClear();
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
                maxHeight: "min(420px, calc(100vh - 16px))",
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
                  <p>
                    {editing === "received"
                      ? local(
                          "The day Shopify received the order, in the store timezone.",
                          "Shopify 주문 접수일 · 가게 시간대 기준",
                        )
                      : local(
                          "Scheduled date, not actual delivery or pickup completion.",
                          "예정일 기준 · 실제 배송완료·픽업 수령일이 아닙니다.",
                        )}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                        style={buttonStyle}
                        onClick={() =>
                          onChange(datePresetV2(filters, editing, value, today))
                        }
                      >
                        {local(en, ko)}
                      </button>
                    ))}
                  </div>
                  <p>
                    {local(
                      "Custom range · both dates included",
                      "직접 기간 선택 · 시작일과 종료일 포함",
                    )}
                  </p>
                  {[
                    ["From", "시작일", "From"],
                    ["To", "종료일", "To"],
                  ].map(([en, ko, suffix]) => (
                    <label
                      key={suffix}
                      style={{ display: "grid", gap: 4, margin: "8px 0" }}
                    >
                      {local(en, ko)}
                      <input
                        type="date"
                        value={
                          isV2 ? (filters[`${prefix}Date${suffix}`] ?? "") : ""
                        }
                        style={{ ...buttonStyle, minWidth: 0 }}
                        onChange={(event) => {
                          const input = event.currentTarget;
                          if (input instanceof HTMLInputElement)
                            onChange(
                              changeV2DateBound(
                                filters,
                                editing,
                                suffix,
                                input.value,
                              ),
                            );
                        }}
                      />
                    </label>
                  ))}
                  {editing === "scheduled" ? (
                    <>
                      <p>
                        {local(
                          "Narrow by actual scheduled weekday",
                          "예정일의 실제 요일로 좁히기",
                        )}
                      </p>
                      {renderChoices(
                        "scheduledWeekdays",
                        V2_OPTIONS.scheduledWeekdays,
                      )}
                    </>
                  ) : null}
                </>
              ) : editing === "cancelled" ? (
                <>
                  <p>
                    {local(
                      "Upstream order cancellation; independent of payment and delivery status.",
                      "원본 주문 취소 여부 · 결제·배송 상태와 별개",
                    )}
                  </p>
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
                        checked={isV2 && filters.cancelled === value}
                        onChange={() => update({ cancelled: value })}
                      />
                      {local(en, ko)}
                    </label>
                  ))}
                </>
              ) : (
                <>
                  {editing === "paymentStatuses" ? (
                    <p>
                      {local(
                        "CLEVER payment corrections take priority.",
                        "CLEVER 결제 보정값이 우선합니다.",
                      )}
                    </p>
                  ) : null}
                  {editing === "deliveryProgress" ? (
                    <p>
                      {local(
                        "Pickup period ended does not confirm collection.",
                        "픽업 기간 종료는 실제 수령 확인이 아닙니다.",
                      )}
                    </p>
                  ) : null}
                  {renderChoices(editing, availableOptions)}
                  {editing === "areas" ? (
                    <label
                      style={{ display: "flex", gap: 8, padding: "8px 0" }}
                    >
                      <input
                        type="checkbox"
                        checked={isV2 && filters.areaMissing === "true"}
                        onChange={(event) => {
                          const input = event.currentTarget;
                          if (input instanceof HTMLInputElement)
                            update({
                              areaMissing: input.checked ? "true" : undefined,
                            });
                        }}
                      />
                      {local("Area not set", "지역 미정")}
                    </label>
                  ) : null}
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
