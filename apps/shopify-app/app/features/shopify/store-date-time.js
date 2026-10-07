// Date-only business values are calendar dates; instants always use an explicit IANA zone.
function isDateOnly(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function getStoreDate(value, timeZone = "UTC") {
  if (isDateOnly(value)) return value;
  const parts = getStoreDateTimeParts(value, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" });
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

export function getStoreDateTimeParts(value, timeZone = "UTC", options = {}) {
  if (value == null || value === "") return null;
  // An offset-free date-time would be interpreted in the browser's timezone.
  if (typeof value === "string" && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      ...options, timeZone: timeZone || "UTC", hourCycle: "h23",
    }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  } catch { return null; }
}

export function formatStoreInstant(value, timeZone = "UTC", { empty = "—", seconds = false } = {}) {
  if (isDateOnly(value)) return value;
  const parts = getStoreDateTimeParts(value, timeZone, {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}), timeZoneName: "short",
  });
  return parts ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}${seconds ? `:${parts.second}` : ""} ${parts.timeZoneName}` : empty;
}

export function formatStoreTime(value, timeZone = "UTC", { empty = "—" } = {}) {
  const parts = getStoreDateTimeParts(value, timeZone, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  return parts ? `${parts.hour}:${parts.minute} ${parts.timeZoneName}` : empty;
}
