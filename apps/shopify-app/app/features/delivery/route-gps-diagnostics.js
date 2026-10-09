import { storeLocalDateTimeToIso } from "./child-route-detail-presentation.js";

export function gpsDiagnosticSearchParams(current, open) {
  const next = new URLSearchParams(current);
  if (open) next.set("gpsPoints", "raw");
  else next.delete("gpsPoints");
  return next;
}

export function formatGpsDiagnosticTimestamp(value, timeZone) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not provided";
  let zone = timeZone || "UTC";
  const options = { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "longOffset" };
  try {
    return `${new Intl.DateTimeFormat("en-CA", { ...options, timeZone: zone }).format(new Date(value))} (${zone})`;
  } catch {
    zone = "UTC";
    return `${new Intl.DateTimeFormat("en-CA", { ...options, timeZone: zone }).format(new Date(value))} (${zone})`;
  }
}

export function initialOriginalObservationsWindow(serviceDate, timeZone, now = new Date()) {
  const from = storeLocalDateTimeToIso(`${serviceDate}T00:00`, timeZone)
    ?? `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  return { from, to: new Date(Date.parse(from) + 86_400_000).toISOString(), limit: 200 };
}
