// Mirrors the delivery API etaWindow setting: AROUND = ETA ± minutes, BEFORE = ETA - minutes .. ETA, AFTER = ETA .. ETA + minutes.
export const ETA_WINDOW_DIRECTIONS = ["AROUND", "BEFORE", "AFTER"];
export const DEFAULT_ETA_WINDOW = { direction: "AROUND", minutes: 30 };

// Preview ETA matches the example `{{eta}}` value: Aug 5, 2026, 2:30 PM AEST.
const PREVIEW_ETA_MS = Date.UTC(2026, 7, 5, 14, 30);

export function normalizeEtaWindow(value) {
  return {
    direction: ETA_WINDOW_DIRECTIONS.includes(value?.direction) ? value.direction : DEFAULT_ETA_WINDOW.direction,
    minutes: Number.isInteger(value?.minutes) ? value.minutes : DEFAULT_ETA_WINDOW.minutes,
  };
}

// Range checks stay on the server so its 400 message reaches the page.
export function readEtaWindowFormValues(direction, minutes) {
  const text = String(minutes ?? "").trim();
  return { direction: String(direction ?? "").trim(), minutes: text === "" ? null : Number(text) };
}

export function formatPreviewEtaWindow(window) {
  const minutes = Number(window?.minutes);
  const slackMs = (Number.isFinite(minutes) ? minutes : 0) * 60_000;
  const start = window?.direction === "AFTER" ? PREVIEW_ETA_MS : PREVIEW_ETA_MS - slackMs;
  const end = window?.direction === "BEFORE" ? PREVIEW_ETA_MS : PREVIEW_ETA_MS + slackMs;
  return `${formatPreviewTime(start)} - ${formatPreviewTime(end)}`;
}

function formatPreviewTime(ms) {
  const text = new Date(ms).toLocaleString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
  return `${text} AEST`;
}
