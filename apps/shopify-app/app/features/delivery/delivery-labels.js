const WEEKDAY_INDEX_BY_NAME = {
  friday: 5,
  monday: 1,
  saturday: 6,
  sunday: 0,
  thursday: 4,
  tuesday: 2,
  wednesday: 3,
};

const DELIVERY_OFFSET_FROM_THURSDAY = {
  4: 0,
  5: 1,
  6: 2,
};

const TORONTO_TIME_ZONE = "America/Toronto";

export function formatDeliveryScopeLabel({
  deliveryDate,
  timeWindowEnd,
  timeWindowStart,
} = {}) {
  const dateLabel = formatDateLabel(deliveryDate);
  if (!dateLabel) return undefined;

  const windowLabel = formatTimeWindow(timeWindowStart, timeWindowEnd);
  return windowLabel ? `${dateLabel} · ${windowLabel}` : dateLabel;
}

export function inferDeliveryDateForOrder({
  deliveryDay,
  lineItems,
  orderCreatedAt,
} = {}) {
  return (
    inferDeliveryDateFromLineItems({
      deliveryDay,
      lineItems,
      orderCreatedAt,
    }) ??
    inferDeliveryDateFromOrderCycle({
      deliveryDay,
      orderCreatedAt,
    })
  );
}

export function inferDeliveryDateFromLineItems({
  deliveryDay,
  lineItems,
  orderCreatedAt,
} = {}) {
  const weekdayIndex = getWeekdayIndex(deliveryDay);
  if (weekdayIndex == null) return undefined;

  const range = findDateRangeInLineItems(lineItems, orderCreatedAt);
  if (!range) return undefined;

  for (
    let cursorTime = range.start.getTime();
    cursorTime <= range.end.getTime();
    cursorTime += 24 * 60 * 60 * 1000
  ) {
    const cursorDate = new Date(cursorTime);
    if (cursorDate.getUTCDay() === weekdayIndex) {
      return cursorDate.toISOString().slice(0, 10);
    }
  }

  return undefined;
}

export function inferDeliveryDateFromOrderCycle({
  deliveryDay,
  orderCreatedAt,
} = {}) {
  const weekdayIndex = getWeekdayIndex(deliveryDay);
  const deliveryOffset = DELIVERY_OFFSET_FROM_THURSDAY[weekdayIndex];
  const orderLocalDate = getLocalDateParts(orderCreatedAt, TORONTO_TIME_ZONE);
  if (deliveryOffset == null || !orderLocalDate) return undefined;

  const orderDate = new Date(
    Date.UTC(orderLocalDate.year, orderLocalDate.month - 1, orderLocalDate.day),
  );
  const daysSinceTuesday = (orderDate.getUTCDay() - 2 + 7) % 7;
  const cycleStartTuesday = new Date(orderDate);
  cycleStartTuesday.setUTCDate(orderDate.getUTCDate() - daysSinceTuesday);

  const deliveryThursday = new Date(cycleStartTuesday);
  deliveryThursday.setUTCDate(cycleStartTuesday.getUTCDate() + 9);
  deliveryThursday.setUTCDate(deliveryThursday.getUTCDate() + deliveryOffset);

  return deliveryThursday.toISOString().slice(0, 10);
}

function findDateRangeInLineItems(lineItems, orderCreatedAt) {
  const lineItemTexts = getLineItemTexts(lineItems);
  const defaultYear = getDefaultYear(orderCreatedAt);

  for (const lineItemText of lineItemTexts) {
    const range = parseDateRange(lineItemText, defaultYear);
    if (range) return range;
  }

  return null;
}

function getLineItemTexts(lineItems) {
  const nodes = Array.isArray(lineItems?.nodes) ? lineItems.nodes : [];

  return nodes.flatMap((lineItem) =>
    [lineItem?.title, lineItem?.name, lineItem?.variantTitle, lineItem?.sku]
      .map(textOrUndefined)
      .filter(Boolean),
  );
}

function parseDateRange(text, defaultYear) {
  const match = text.match(
    /(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2})\s*(?:-|~|–)\s*(?:(\d{1,2})[./-])?(\d{1,2})/,
  );
  if (!match) return null;

  const year = Number(match[1] ?? defaultYear);
  const startMonth = Number(match[2]);
  const startDay = Number(match[3]);
  const endMonth = Number(match[4] ?? match[2]);
  const endDay = Number(match[5]);
  if (![year, startMonth, startDay, endMonth, endDay].every(Number.isFinite)) {
    return null;
  }

  const start = new Date(Date.UTC(year, startMonth - 1, startDay));
  const end = new Date(Date.UTC(year, endMonth - 1, endDay));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return start <= end ? { end, start } : null;
}

function getDefaultYear(value) {
  const dateOnly = formatDateOnly(value);
  if (dateOnly) return Number(dateOnly.slice(0, 4));

  return new Date().getUTCFullYear();
}

function getLocalDateParts(value, timeZone) {
  const text = textOrUndefined(value);
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const partMap = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return Number.isFinite(partMap.year) &&
    Number.isFinite(partMap.month) &&
    Number.isFinite(partMap.day)
    ? {
        day: partMap.day,
        month: partMap.month,
        year: partMap.year,
      }
    : null;
}

function getWeekdayIndex(value) {
  const text = textOrUndefined(value)?.toLowerCase();
  if (!text) return undefined;

  for (const [weekday, weekdayIndex] of Object.entries(WEEKDAY_INDEX_BY_NAME)) {
    if (text.includes(weekday)) return weekdayIndex;
  }

  return undefined;
}

function formatDateLabel(value) {
  const dateOnly = formatDateOnly(value);
  if (!dateOnly) return undefined;

  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(date);

  return `${weekday} ${dateOnly.slice(5, 7)}/${dateOnly.slice(8, 10)}`;
}

function formatDateOnly(value) {
  const text = textOrUndefined(value);
  if (!text) return undefined;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.toISOString().slice(0, 10);
}

function formatTimeWindow(start, end) {
  const startLabel = formatClockTime(start);
  const endLabel = formatClockTime(end);
  if (!startLabel || !endLabel) return undefined;

  const sameMeridiem = startLabel.meridiem === endLabel.meridiem;
  const startText = sameMeridiem
    ? startLabel.time
    : `${startLabel.time}${startLabel.meridiem}`;

  return `${startText}–${endLabel.time}${endLabel.meridiem}`;
}

function formatClockTime(value) {
  const text = textOrUndefined(value);
  const match = text?.match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!match) return null;

  const hour24 = Number(match[1]);
  const minutes = match[2] ?? "00";
  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) return null;

  const meridiem = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 || 12;
  const time = minutes === "00" ? String(hour12) : `${hour12}:${minutes}`;

  return { meridiem, time };
}

function textOrUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}
