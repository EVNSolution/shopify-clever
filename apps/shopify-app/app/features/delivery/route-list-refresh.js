import { isTerminalRouteExecutionStatus, normalizeRouteExecutionStatus } from "./route-helpers.js";

export const ROUTE_LIST_REFRESH_PARAM = "route_status_refresh";
const memoryPending = new Map();
const storageFailures = new Set();

// Session storage survives detail unmounts/reloads without third-party cookies.
// The loader validates the app/shop key before accepting an explicit read request.
export function getRouteListRefreshKey(appId, shop) {
  return `clever:route-list-refresh:${appId}:${shop}`;
}

function validPending(value) {
  return Array.isArray(value) ? value.filter(item =>
    typeof item?.routeId === "string" && item.routeId
    && typeof item.version === "string" && item.version
    && isTerminalRouteExecutionStatus(item.status),
  ) : [];
}

export function readRouteListRefresh(key, storage) {
  if (!key) return [];
  if (storageFailures.has(key)) return memoryPending.get(key) ?? [];
  try {
    const target = storage ?? globalThis.sessionStorage;
    return target ? validPending(JSON.parse(target.getItem(key) ?? "[]")) : memoryPending.get(key) ?? [];
  } catch {
    return memoryPending.get(key) ?? [];
  }
}

export function readRouteListRefreshRequest(key, url) {
  try {
    const request = JSON.parse(url.searchParams.get(ROUTE_LIST_REFRESH_PARAM) ?? "null");
    return request?.key === key ? validPending(request.pending) : [];
  } catch {
    return [];
  }
}

function writeRouteListRefresh(key, pending, storage) {
  memoryPending.set(key, pending);
  try {
    const target = storage ?? globalThis.sessionStorage;
    if (pending.length) target?.setItem(key, JSON.stringify(pending));
    else target?.removeItem(key);
    storageFailures.delete(key);
  } catch {
    storageFailures.add(key);
    // An explicit loader URL still carries the marker if browser storage is blocked.
  }
}

export function rememberRouteListRefresh(key, routeId, status, storage) {
  if (!key || !routeId || !isTerminalRouteExecutionStatus(status)) return;
  const pending = readRouteListRefresh(key, storage);
  const normalizedStatus = normalizeRouteExecutionStatus(status);
  if (pending.some(item => item.routeId === routeId && item.status === normalizedStatus)) return;
  writeRouteListRefresh(key, [
    ...pending.filter(item => item.routeId !== routeId),
    { routeId, status: normalizedStatus, version: globalThis.crypto.randomUUID() },
  ], storage);
}

function sameObservation(left, right) {
  return left.routeId === right.routeId && left.status === right.status && left.version === right.version;
}

export function confirmRouteListRefresh(key, confirmed, storage) {
  if (!key || !confirmed?.length) return;
  const pending = readRouteListRefresh(key, storage);
  const remaining = pending.filter(item => !confirmed.some(match => sameObservation(item, match)));
  if (remaining.length !== pending.length) writeRouteListRefresh(key, remaining, storage);
}

export function getConfirmedRouteListRefresh(pending, rows, errors) {
  if (errors.length) return [];
  return pending.filter(item => rows.some(row =>
    row.id === item.routeId && normalizeRouteExecutionStatus(row.status) === item.status,
  ));
}

export function routeListRefreshWasAttempted(pending, requested) {
  return pending.every(item => requested?.some(attempt => sameObservation(item, attempt)));
}

export function isRouteListRefreshCleanup({ currentUrl, nextUrl, formMethod }) {
  if (formMethod && formMethod.toLowerCase() !== "get") return false;
  if (!currentUrl || !nextUrl || !currentUrl.searchParams.has(ROUTE_LIST_REFRESH_PARAM)
    || nextUrl.searchParams.has(ROUTE_LIST_REFRESH_PARAM)) return false;
  const clean = new URL(currentUrl);
  clean.searchParams.delete(ROUTE_LIST_REFRESH_PARAM);
  return clean.href === nextUrl.href;
}
