function textOrUndefined(value) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text === "" ? undefined : text;
}

function nullableText(value) {
  return value === null ? null : textOrUndefined(value);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringArray(value) {
  return Array.isArray(value) ? value.map(textOrUndefined).filter(Boolean) : [];
}

function readRouteDraftRow(route) {
  const row = route && typeof route === "object" && !Array.isArray(route) ? route : {};
  return {
    branchId: nullableText(row.branchId) ?? null,
    color: nullableText(row.color) ?? null,
    ...(row.driverId === undefined ? {} : { driverId: nullableText(row.driverId) ?? null }),
    ...(row.expectedChildUpdatedAt === undefined ? {} : { expectedChildUpdatedAt: textOrUndefined(row.expectedChildUpdatedAt) }),
    ...(row.expectedRoutePlanUpdatedAt === undefined ? {} : { expectedRoutePlanUpdatedAt: textOrUndefined(row.expectedRoutePlanUpdatedAt) }),
    label: nullableText(row.label) ?? null,
    ...(row.optimized === undefined ? {} : { optimized: row.optimized && typeof row.optimized === "object" ? row.optimized : null }),
    orderIds: stringArray(row.orderIds),
    ...(row.routeIdx === undefined ? {} : { routeIdx: finiteNumber(row.routeIdx) }),
    ...(row.routeKey === undefined ? {} : { routeKey: textOrUndefined(row.routeKey) }),
    routePlanId: nullableText(row.routePlanId) ?? null,
    ...(row.scheduledStartAt === undefined ? {} : { scheduledStartAt: nullableText(row.scheduledStartAt) ?? null }),
    ...(row.scheduledStartTimeZone === undefined ? {} : { scheduledStartTimeZone: nullableText(row.scheduledStartTimeZone) ?? null }),
    ...(row.sortOrder === undefined ? {} : { sortOrder: finiteNumber(row.sortOrder) }),
    tempId: nullableText(row.tempId) ?? null,
  };
}

export function readRouteDraftPayload(value) {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    if (!Array.isArray(parsed?.routes)) return { routes: [] };
    return {
      deletedRoutePlanIds: stringArray(parsed.deletedRoutePlanIds),
      ...(parsed.expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt: textOrUndefined(parsed.expectedUpdatedAt) }),
      mode: textOrUndefined(parsed.mode),
      removedOrderIds: stringArray(parsed.removedOrderIds),
      routes: parsed.routes.map(readRouteDraftRow),
    };
  } catch {
    return { routes: [] };
  }
}
