import { getOrderFiltersFromSearchParams } from "./order-filters.js";
export const V2_FILTER_KEYS = [
  "filterVersion",
  "receivedDateFrom",
  "receivedDateTo",
  "scheduledDateFrom",
  "scheduledDateTo",
  "scheduledDateMissing",
  "scheduledWeekdays",
  "serviceTypes",
  "deliveryProgress",
  "fulfillmentStatuses",
  "paymentStatuses",
  "cancelled",
  "areas",
  "areaMissing",
  "search",
];
export const V2_ARRAY_KEYS = [
  "scheduledWeekdays",
  "serviceTypes",
  "deliveryProgress",
  "fulfillmentStatuses",
  "paymentStatuses",
  "areas",
];
export const V2_GROUPS = {
  received: ["receivedDateFrom", "receivedDateTo"],
  scheduled: [
    "scheduledDateFrom",
    "scheduledDateTo",
    "scheduledDateMissing",
    "scheduledWeekdays",
  ],
  serviceTypes: ["serviceTypes"],
  deliveryProgress: ["deliveryProgress"],
  fulfillmentStatuses: ["fulfillmentStatuses"],
  paymentStatuses: ["paymentStatuses"],
  cancelled: ["cancelled"],
  areas: ["areas", "areaMissing"],
};
export const V2_OPTIONS = {
  serviceTypes: [
    ["DELIVERY", "Delivery", "일반 배송"],
    ["EVENING_DELIVERY", "Evening delivery", "저녁 배송"],
    ["PICKUP", "Pickup", "픽업"],
    ["UNKNOWN", "Unknown", "미확인"],
  ],
  deliveryProgress: [
    ["unplanned", "Unplanned", "미배차"],
    ["planned", "Planned", "배차됨"],
    ["assigned_in_progress", "Assigned / in progress", "배정·진행중"],
    ["delivered", "Delivered", "배송완료"],
    ["failed", "Failed", "배송실패"],
    ["skipped", "Skipped", "건너뜀"],
    ["cancelled", "Delivery cancelled", "배송 취소"],
    ["pickup_elapsed", "Pickup period ended", "픽업 기간 종료"],
    ["unknown", "Unknown", "미확인"],
  ],
  fulfillmentStatuses: [
    ["UNFULFILLED", "Unfulfilled", "미처리"],
    ["PARTIALLY_FULFILLED", "Partial", "일부 처리"],
    ["FULFILLED", "Fulfilled", "처리 완료"],
    ["IN_PROGRESS", "In progress", "처리중"],
    ["ON_HOLD", "On hold", "보류"],
    ["SCHEDULED", "Scheduled", "처리 예정"],
    ["REQUEST_DECLINED", "Request declined", "요청 거절"],
    ["FULFILLMENT_NOT_REQUIRED", "Not required", "처리 불필요"],
    ["UNKNOWN", "Unknown", "미확인"],
  ],
  paymentStatuses: [
    ["PAID", "Paid", "결제완료"],
    ["PENDING", "Payment pending", "결제대기"],
    ["PARTIALLY_PAID", "Partially paid", "일부 결제"],
    ["REFUNDED", "Refunded", "환불"],
    ["PARTIALLY_REFUNDED", "Partially refunded", "일부 환불"],
    ["AUTHORIZED", "Authorized", "승인"],
    ["EXPIRED", "Expired", "만료"],
    ["VOIDED", "Voided", "무효"],
    ["UNKNOWN", "Unknown", "미확인"],
  ],
  scheduledWeekdays: [
    ["MONDAY", "Monday", "월요일"],
    ["TUESDAY", "Tuesday", "화요일"],
    ["WEDNESDAY", "Wednesday", "수요일"],
    ["THURSDAY", "Thursday", "목요일"],
    ["FRIDAY", "Friday", "금요일"],
    ["SATURDAY", "Saturday", "토요일"],
    ["SUNDAY", "Sunday", "일요일"],
  ],
};
export const V2_LABELS = {
  serviceTypes: ["Stop type", "배송 유형"],
  deliveryProgress: ["Delivery status", "배송 상태"],
  received: ["Order date", "주문일"],
  scheduled: ["Delivery date", "배송·픽업일"],
  paymentStatuses: ["Payment", "결제 상태"],
  fulfillmentStatuses: ["Fulfillment", "주문 처리상태"],
  cancelled: ["Cancellation", "취소 여부"],
  areas: ["Area", "지역"],
};
export const labelV2 = (labels, language) => labels[language === "ko" ? 1 : 0];
export function filterV2Options(options, facetValues, selectedValues = []) {
  if (!Array.isArray(facetValues)) return options;
  const available = new Set(
    facetValues.filter(({ count }) => count > 0).map(({ value }) => value),
  );
  return options.filter(
    ([value]) => available.has(value) || selectedValues.includes(value),
  );
}
export function normalizeV2Filters(filters = {}) {
  const result = { filterVersion: "2" };
  for (const key of V2_FILTER_KEYS) {
    if (key === "filterVersion") continue;
    const value = filters[key];
    if (V2_ARRAY_KEYS.includes(key)) {
      const values = [
        ...new Set(
          (Array.isArray(value) ? value : value ? [value] : [])
            .map(String)
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ].sort();
      if (values.length) result[key] = values;
    } else if (
      ["scheduledDateMissing", "areaMissing", "cancelled"].includes(key)
    ) {
      if (value === true || value === "true") result[key] = "true";
      if (value === false || value === "false") result[key] = "false";
    } else if (typeof value === "string" && value.trim())
      result[key] = value.trim();
  }
  for (const prefix of ["received", "scheduled"]) {
    const from = `${prefix}DateFrom`,
      to = `${prefix}DateTo`;
    if (result[from] && result[to] && result[from] > result[to])
      [result[from], result[to]] = [result[to], result[from]];
  }
  if (result.scheduledDateMissing === "true")
    for (const key of [
      "scheduledDateFrom",
      "scheduledDateTo",
      "scheduledWeekdays",
    ])
      delete result[key];
  return result;
}
export function readV2Filters(params) {
  const filters = Object.fromEntries(params);
  for (const key of V2_ARRAY_KEYS) filters[key] = params.getAll(key);
  return normalizeV2Filters(filters);
}
export function writeV2Filters(params, filters) {
  for (const key of V2_FILTER_KEYS) params.delete(key);
  for (const [key, value] of Object.entries(normalizeV2Filters(filters))) {
    for (const item of Array.isArray(value) ? value : [value])
      params.append(key, item);
  }
  for (const key of ["after", "before", "page", "readWatermark"])
    params.delete(key);
  return params;
}
export function clearV2Group(filters, group) {
  const result = { ...filters };
  for (const key of V2_GROUPS[group] ?? []) delete result[key];
  return normalizeV2Filters(result);
}
export function activeV2Groups(filters) {
  return Object.keys(V2_GROUPS).filter((group) =>
    V2_GROUPS[group].some((key) =>
      Array.isArray(filters[key])
        ? filters[key].length > 0
        : filters[key] !== undefined &&
          filters[key] !== "" &&
          !(key !== "cancelled" && filters[key] === "false"),
    ),
  );
}
export function shiftV2Date(date, days) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
export function changeV2DateBound(filters, group, bound, value) {
  const prefix = group === "received" ? "received" : "scheduled";
  return normalizeV2Filters({
    ...(filters.filterVersion === "2" ? filters : {}),
    [`${prefix}Date${bound}`]: value,
    ...(group === "scheduled" ? { scheduledDateMissing: undefined } : {}),
  });
}
export function changeV2DateRange(filters, group, value) {
  const [from, to] = String(value ?? "").split("--");
  if (!from || !to) return normalizeV2Filters(filters);
  const prefix = group === "received" ? "received" : "scheduled";
  return normalizeV2Filters({
    ...(filters.filterVersion === "2" ? filters : {}),
    [`${prefix}DateFrom`]: from,
    [`${prefix}DateTo`]: to,
    ...(group === "scheduled" ? { scheduledDateMissing: undefined } : {}),
  });
}
export function datePresetV2(filters, group, preset, today) {
  const weekdays =
    group === "scheduled" && preset !== "missing"
      ? filters.scheduledWeekdays
      : undefined;
  const result = clearV2Group(
    filters.filterVersion === "2" ? filters : {},
    group,
  );
  const prefix = group === "received" ? "received" : "scheduled";
  if (preset === "missing") return { ...result, scheduledDateMissing: "true" };
  if (preset === "past")
    return {
      ...result,
      ...(weekdays?.length ? { scheduledWeekdays: weekdays } : {}),
      scheduledDateTo: shiftV2Date(today, -1),
    };
  const from =
    preset === "yesterday"
      ? shiftV2Date(today, -1)
      : preset === "last7"
        ? shiftV2Date(today, -6)
        : preset === "tomorrow"
          ? shiftV2Date(today, 1)
          : today;
  return {
    ...result,
    ...(weekdays?.length ? { scheduledWeekdays: weekdays } : {}),
    [`${prefix}DateFrom`]: from,
    [`${prefix}DateTo`]:
      preset === "next7"
        ? shiftV2Date(today, 6)
        : preset === "last7"
          ? today
          : from,
  };
}
export function getDatePresetV2(filters, group, today) {
  if (group === "scheduled" && filters.scheduledDateMissing === "true")
    return "missing";
  const prefix = group === "received" ? "received" : "scheduled";
  const from = filters[`${prefix}DateFrom`];
  const to = filters[`${prefix}DateTo`];
  if (!from && !to) return undefined;
  const exact = (date) => from === date && to === date;
  if (exact(today)) return "today";
  if (group === "received") {
    if (exact(shiftV2Date(today, -1))) return "yesterday";
    if (from === shiftV2Date(today, -6) && to === today) return "last7";
  } else {
    if (exact(shiftV2Date(today, 1))) return "tomorrow";
    if (from === today && to === shiftV2Date(today, 6)) return "next7";
    if (!from && to === shiftV2Date(today, -1)) return "past";
  }
  return "custom";
}
export function v2ChipValue(filters, group, language) {
  if (group === "received" || group === "scheduled") {
    if (filters.scheduledDateMissing === "true" && group === "scheduled")
      return labelV2(["No date", "날짜없음"], language);
    const prefix = group === "received" ? "received" : "scheduled";
    const from = filters[`${prefix}DateFrom`],
      to = filters[`${prefix}DateTo`];
    const dates = from === to ? from : `${from ?? "…"} – ${to ?? "…"}`;
    const weekdays = (filters.scheduledWeekdays ?? [])
      .map((value) =>
        labelV2(
          V2_OPTIONS.scheduledWeekdays
            .find((option) => option[0] === value)
            ?.slice(1) ?? [value, value],
          language,
        ),
      )
      .join(", ");
    return [from || to ? dates : "", group === "scheduled" ? weekdays : ""]
      .filter(Boolean)
      .join(" · ");
  }
  if (group === "cancelled")
    return labelV2(
      filters.cancelled === "true"
        ? ["Cancelled", "취소됨"]
        : ["Not cancelled", "취소되지 않음"],
      language,
    );
  const values = (filters[group] ?? []).map((value) =>
    labelV2(
      V2_OPTIONS[group]?.find((option) => option[0] === value)?.slice(1) ?? [
        value,
        value,
      ],
      language,
    ),
  );
  if (group === "areas" && filters.areaMissing === "true")
    values.push(labelV2(["Area not set", "지역 미정"], language));
  return values.join(", ");
}

export function v2CompactChipValue(filters, group, language, today) {
  if (group === "received" || group === "scheduled") {
    if (group === "scheduled" && filters.scheduledDateMissing === "true")
      return labelV2(["No date", "날짜없음"], language);
    const prefix = group === "received" ? "received" : "scheduled";
    const from = filters[`${prefix}DateFrom`];
    const to = filters[`${prefix}DateTo`];
    const currentYear = String(today ?? "").slice(0, 4);
    const shortDate = (date) => {
      if (!date) return "…";
      const [year, month, day] = date.split("-");
      return year && year !== currentYear
        ? `${year}/${month}/${day}`
        : `${month}/${day}`;
    };
    const dates =
      from || to
        ? from === to
          ? shortDate(from)
          : `${shortDate(from)}–${shortDate(to)}`
        : "";
    const weekdays = (filters.scheduledWeekdays ?? []).map((value) =>
      labelV2(
        V2_OPTIONS.scheduledWeekdays
          .find((option) => option[0] === value)
          ?.slice(1) ?? [value, value],
        language,
      ),
    );
    const weekdaySummary = weekdays.length
      ? `${weekdays[0]}${weekdays.length > 1 ? ` +${weekdays.length - 1}` : ""}`
      : "";
    return [dates, group === "scheduled" ? weekdaySummary : ""]
      .filter(Boolean)
      .join(" · ");
  }
  if (group === "cancelled") return v2ChipValue(filters, group, language);
  const values = (filters[group] ?? []).map((value) =>
    labelV2(
      V2_OPTIONS[group]?.find((option) => option[0] === value)?.slice(1) ?? [
        value,
        value,
      ],
      language,
    ),
  );
  if (group === "areas" && filters.areaMissing === "true")
    values.push(labelV2(["Area not set", "지역 미정"], language));
  return values.length > 1
    ? `${values[0]} +${values.length - 1}`
    : (values[0] ?? "");
}

export function getOrdersUiFilters(params) {
  if (params.has("filterVersion")) {
    if (params.get("filterVersion") !== "2")
      throw new Error("Unsupported order filter version");
    return readV2Filters(params);
  }
  const legacyKeys = [
    "deliveryArea",
    "deliveryDate",
    "deliveryState",
    "deliveryWeekday",
    "orderedDate",
    "orderedDateFrom",
    "orderedDateTo",
    "serviceCategory",
    "serviceType",
    "scope",
    "tab",
    "planned",
  ];
  return legacyKeys.some((key) => params.has(key))
    ? getOrderFiltersFromSearchParams(params)
    : normalizeV2Filters({ search: params.get("search") ?? params.get("q") });
}
