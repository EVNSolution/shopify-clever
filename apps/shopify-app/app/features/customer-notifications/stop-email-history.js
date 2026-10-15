// One stop's customer email history, grouped by email in route order. Every send is listed, newest first,
// because Delivery scheduled can be sent again by hand.
export const STOP_EMAIL_HISTORY_SIGNALS = [
  ["DELIVERY_SCHEDULED", "Delivery scheduled"],
  ["OUT_FOR_DELIVERY", "Out for delivery"],
  ["DRIVER_NEARBY", "Driver is nearby"],
  ["DELIVERED", "Delivered"],
  ["MISSED_DELIVERY", "Missed delivery"],
];

export function groupStopEmailHistory(events) {
  const list = Array.isArray(events) ? events : [];
  return STOP_EMAIL_HISTORY_SIGNALS.map(([signal, label]) => ({
    events: list.filter((event) => event?.signal === signal),
    label,
    signal,
  }));
}

// Same shape as the email ETA text, for example "Wed, Oct 14, 9:30 AM EDT". Without a route timezone the browser zone is used.
export function formatStopEmailHistoryTime(iso, timezone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const options = { day: "numeric", hour: "numeric", minute: "2-digit", month: "short", timeZoneName: "short", weekday: "short" };
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, ...(timezone ? { timeZone: timezone } : {}) })
      .format(date)
      .replace(/\u202f/gu, " ");
  } catch {
    return new Intl.DateTimeFormat("en-US", options).format(date).replace(/\u202f/gu, " ");
  }
}

const STATUS_LABELS = { FAILED: "Failed", PENDING: "Sending", SENT: "Sent", SKIPPED: "Not sent" };

export function describeStopEmailHistoryEvent(event, timezone) {
  const parts = [formatStopEmailHistoryTime(event.at, timezone)];
  if (event.recipientEmail) parts.push(event.recipientEmail);
  parts.push(event.source === "AUTOMATIC" ? "Automatic" : "Manual");
  // Provider statuses arrive as words like "delivered" or "hard_bounce".
  if (event.status === "SENT" && event.providerStatus) {
    const providerStatus = String(event.providerStatus).replace(/_/gu, " ");
    parts.push(providerStatus.charAt(0).toUpperCase() + providerStatus.slice(1));
  }
  return {
    detail: parts.join(" — "),
    error: event.status === "SENT" ? null : event.errorMessage || null,
    status: STATUS_LABELS[event.status] ?? "Unknown",
  };
}
