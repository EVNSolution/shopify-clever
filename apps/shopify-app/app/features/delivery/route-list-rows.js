import {
  formatRouteDeliveryScope,
  getRouteGroupChildRouteName,
  getRouteGroupChildRoutePlanId,
  getVisibleRouteGroupChildren,
} from "./route-helpers.js";
import { routeGroupChildPath, routeGroupPath, routePlanPath } from "./route-paths.js";

const ROUTE_GROUP_ACCENT_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#e11d48"];

function getRouteGroupAccentColor(routeGroupId) {
  const text = String(routeGroupId ?? "");
  if (!text) return null;

  let hash = 0;
  for (const character of text) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return ROUTE_GROUP_ACCENT_COLORS[hash % ROUTE_GROUP_ACCENT_COLORS.length];
}

function formatRouteValues(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "-";
}

function formatRouteDate(value) {
  if (!value) return "-";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toISOString().slice(0, 10);
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number != null) return number;
  }

  return null;
}

function sumOptionalNumbers(values) {
  let hasValue = false;
  const total = values.reduce((sum, value) => {
    const number = numberOrNull(value);
    if (number == null) return sum;

    hasValue = true;
    return sum + number;
  }, 0);

  return hasValue ? total : null;
}

function readRouteMetrics(routePlan) {
  const routeMetrics = routePlan?.routeMetrics ?? null;
  return {
    distanceMeters: firstNumber(routeMetrics?.distanceMeters),
    durationSeconds: firstNumber(routeMetrics?.durationSeconds),
  };
}

function readRouteChildMetrics(child) {
  const routePlan = child?.routePlan ?? {};
  return readRouteMetrics({ ...routePlan, routeMetrics: child?.routeMetrics ?? routePlan.routeMetrics });
}

function readRouteGroupMetrics(children) {
  const childMetrics = children.map(readRouteChildMetrics);
  return {
    distanceMeters: sumOptionalNumbers(childMetrics.map((routeMetrics) => routeMetrics.distanceMeters)),
    durationSeconds: sumOptionalNumbers(childMetrics.map((routeMetrics) => routeMetrics.durationSeconds)),
  };
}

function formatRouteTableDate(routePlan) {
  const deliveryScope = formatRouteDeliveryScope(routePlan);
  return deliveryScope !== "-" ? deliveryScope : formatRouteDate(routePlan?.planDate);
}

function formatRouteDriver(driver) {
  const displayName = String(driver?.displayName ?? "").trim();
  const phone = String(driver?.phone ?? "").trim();

  return displayName || phone || "-";
}

function getRouteGroupTotalOrders(routeGroup) {
  return Number(routeGroup?.totalOrders ?? routeGroup?.ordersCount ?? routeGroup?.assignments?.length ?? 0) || 0;
}

function formatRouteGroupDate(routeGroup) {
  const start = routeGroup?.dateRangeStart ?? routeGroup?.planDate;
  const end = routeGroup?.dateRangeEnd ?? start;
  if (!start) return "-";
  return start === end ? start : `${start} ~ ${end}`;
}

function getRouteDeleteKey(route) {
  const routeGroupId = route?.routeGroupingChild?.groupingId;
  if (routeGroupId) return `routeGroup:${routeGroupId}`;
  return route?.isRouteGroup ? `routeGroup:${route.id}` : `routePlan:${route.id}`;
}

function getRouteGroupChildDeleteKey(routeGroupId, routePlanId) {
  return `routeGroupChild:${encodeURIComponent(routeGroupId)}:${encodeURIComponent(routePlanId)}`;
}

function getRouteCreatedAtMs(route) {
  const createdAt = route?.createdAt ?? route?.created_at;
  if (!createdAt) return null;
  const time = Date.parse(createdAt);
  return Number.isFinite(time) ? time : null;
}

function getRouteGroupingChildGroupId(routePlan) {
  const routeGroupId = routePlan?.routeGroupingChild?.groupingId;
  return routeGroupId == null ? null : String(routeGroupId);
}

function compareRouteRowBundles(left, right) {
  if (left.createdAtMs != null && right.createdAtMs != null && left.createdAtMs !== right.createdAtMs) {
    return left.createdAtMs - right.createdAtMs;
  }
  if (left.createdAtMs != null && right.createdAtMs == null) return -1;
  if (left.createdAtMs == null && right.createdAtMs != null) return 1;
  return left.index - right.index;
}

function getRouteChildRows(routeRows, routeGroupDeleteKey) {
  return routeRows.filter((routeRow) => routeRow.routeGroupDeleteKey === routeGroupDeleteKey);
}

export function getExpandedRouteDeleteKeys(routeRows, checkedDeleteKeys) {
  const checkedDeleteKeySet = new Set(checkedDeleteKeys);

  for (const routeRow of routeRows) {
    if (routeRow.routeGroupDeleteKey && checkedDeleteKeySet.has(routeRow.routeGroupDeleteKey)) {
      checkedDeleteKeySet.add(routeRow.deleteKey);
    }
  }

  return Array.from(checkedDeleteKeySet);
}

export function getPrimaryRouteSelectionKeys(routeRows) {
  const visibleDeleteKeySet = new Set(routeRows.map((routeRow) => routeRow.deleteKey).filter(Boolean));
  return routeRows
    .filter((routeRow) => routeRow.deleteKey && !(routeRow.routeGroupDeleteKey && visibleDeleteKeySet.has(routeRow.routeGroupDeleteKey)))
    .map((routeRow) => routeRow.deleteKey);
}

export function getRouteDeletePayloadKeys(routeRows, checkedDeleteKeys) {
  const routeRowByDeleteKey = new Map(routeRows.map((routeRow) => [routeRow.deleteKey, routeRow]));
  const checkedDeleteKeySet = new Set(checkedDeleteKeys);
  const checkedGroupDeleteKeySet = new Set(
    routeRows
      .filter((routeRow) => routeRow.isRouteGroup && checkedDeleteKeySet.has(routeRow.deleteKey))
      .map((routeRow) => routeRow.deleteKey),
  );

  return Array.from(checkedDeleteKeySet).filter((deleteKey) => {
    const routeRow = routeRowByDeleteKey.get(deleteKey);
    return !(routeRow?.routeGroupDeleteKey && checkedGroupDeleteKeySet.has(routeRow.routeGroupDeleteKey));
  });
}

export function toggleRouteSelection(routeRows, checkedDeleteKeys, route) {
  const checkedDeleteKeySet = new Set(checkedDeleteKeys);
  if (!route?.deleteKey) return Array.from(checkedDeleteKeySet);

  if (route.isRouteGroup) {
    const childRows = getRouteChildRows(routeRows, route.deleteKey);

    if (checkedDeleteKeySet.has(route.deleteKey)) {
      checkedDeleteKeySet.delete(route.deleteKey);
    } else {
      checkedDeleteKeySet.add(route.deleteKey);
    }

    for (const childRow of childRows) checkedDeleteKeySet.delete(childRow.deleteKey);
    return Array.from(checkedDeleteKeySet);
  }

  if (route.routeGroupDeleteKey && checkedDeleteKeySet.has(route.routeGroupDeleteKey)) {
    checkedDeleteKeySet.delete(route.routeGroupDeleteKey);
    for (const childRow of getRouteChildRows(routeRows, route.routeGroupDeleteKey)) {
      if (childRow.deleteKey !== route.deleteKey) checkedDeleteKeySet.add(childRow.deleteKey);
    }
    checkedDeleteKeySet.delete(route.deleteKey);
    return Array.from(checkedDeleteKeySet);
  }

  if (checkedDeleteKeySet.has(route.deleteKey)) {
    checkedDeleteKeySet.delete(route.deleteKey);
  } else {
    checkedDeleteKeySet.add(route.deleteKey);
  }

  return Array.from(checkedDeleteKeySet);
}

function buildRouteChildRows(routeGroup, children = getVisibleRouteGroupChildren(routeGroup), groupAccentColor = null) {
  return children.map((child, index) => {
    const routePlanId = getRouteGroupChildRoutePlanId(child);
    const routeGroupDeleteKey = `routeGroup:${routeGroup.id}`;
    const routePlan = child.routePlan ?? {};
    const routeMetrics = readRouteChildMetrics(child);
    const stopsCount = child.stopsCount ?? routePlan.stopsCount ?? 0;
    const missingCoordinates = routePlan.missingCoordinates ?? 0;
    const locatedCount = Math.max(stopsCount - missingCoordinates, 0);

    return {
      id: routePlanId,
      rowKey: `routePlan:${routePlanId}`,
      href: routeGroupChildPath(routeGroup.id, routePlanId),
      isClickable: true,
      isDeletable: true,
      deleteKey: getRouteGroupChildDeleteKey(routeGroup.id, routePlanId),
      routeGroupDeleteKey,
      routeGroupId: routeGroup.id,
      groupAccentColor,
      route: getRouteGroupChildRouteName(routeGroup, child, routePlan, index),
      status: child.displayStatus ?? routePlan.status ?? "DRAFT",
      orders: stopsCount,
      coordinates: `${locatedCount}/${stopsCount}`,
      delivered: 0,
      attempted: 0,
      missingCoordinates,
      date: formatRouteTableDate(routePlan),
      deliveryArea: formatRouteValues(routePlan.deliveryAreas),
      driver: formatRouteDriver({ displayName: child.driverName }),
      driverId: child.driverId ?? routePlan.driverId ?? null,
      driveTimeSeconds: routeMetrics.durationSeconds,
      distanceMeters: routeMetrics.distanceMeters,
      isSummaryRoute: true,
    };
  });
}

export function buildRouteRows(routePlans, routeGroups = []) {
  const safeRouteGroups = Array.isArray(routeGroups) ? routeGroups : [];
  const routeGroupEntries = safeRouteGroups.map((routeGroup, index) => {
    const children = getVisibleRouteGroupChildren(routeGroup);
    const groupAccentColor = getRouteGroupAccentColor(routeGroup.id);
    return {
      childRows: children.length > 1 ? buildRouteChildRows(routeGroup, children, groupAccentColor) : [],
      children,
      groupAccentColor,
      index,
      routeGroup,
      routeMetrics: readRouteGroupMetrics(children),
    };
  });
  const childRoutePlanIds = new Set(
    routeGroupEntries.flatMap(({ children }) => children.map(getRouteGroupChildRoutePlanId).filter(Boolean)),
  );
  const routeGroupIds = new Set(safeRouteGroups.map((routeGroup) => routeGroup?.id).filter(Boolean).map(String));
  const standaloneRoutePlans = Array.isArray(routePlans)
    ? routePlans.filter((routePlan) => {
        const routeGroupId = getRouteGroupingChildGroupId(routePlan);
        return !childRoutePlanIds.has(routePlan.id) && !(routeGroupId && routeGroupIds.has(routeGroupId));
      })
    : [];
  const routeGroupRows = routeGroupEntries.map(({ childRows, groupAccentColor, routeGroup, routeMetrics }) => {
    return {
      id: routeGroup.id,
      rowKey: `routeGroup:${routeGroup.id}`,
      routeGroupId: routeGroup.id,
      groupAccentColor,
      href: routeGroupPath(routeGroup.id),
      isClickable: true,
      isDeletable: true,
      isRouteGroup: true,
      isSummaryRoute: childRows.length === 0,
      deleteKey: getRouteDeleteKey({ ...routeGroup, isRouteGroup: true }),
      route: routeGroup.name ?? routeGroup.id,
      status: routeGroup.displayStatus ?? routeGroup.status ?? "DRAFT",
      orders: getRouteGroupTotalOrders(routeGroup),
      coordinates: "-",
      delivered: 0,
      attempted: 0,
      missingCoordinates: 0,
      date: formatRouteGroupDate(routeGroup),
      deliveryArea: "-",
      driver: "-",
      driverId: null,
      driveTimeSeconds: routeMetrics.durationSeconds ?? null,
      distanceMeters: routeMetrics.distanceMeters ?? null,
    };
  });

  if (standaloneRoutePlans.length === 0 && routeGroupRows.length === 0) {
    return [
      {
        id: "empty-route-plans",
        isClickable: false,
        isDeletable: false,
        route: "No routes",
        status: "Waiting",
        orders: 0,
        date: "-",
        deliveryArea: "-",
        driver: "-",
        driverId: null,
        driveTimeSeconds: null,
        distanceMeters: null,
      },
    ];
  }

  const routePlanRows = standaloneRoutePlans.map((routePlan) => {
    const routeMetrics = readRouteMetrics(routePlan);
    const stopsCount = routePlan.stopsCount ?? 0;
    const missingCoordinates = routePlan.missingCoordinates ?? 0;
    const locatedCount = Math.max(stopsCount - missingCoordinates, 0);
    const delivered = firstNumber(
      routePlan.deliveredCount,
      routePlan.deliveredStopsCount,
      routePlan.metrics?.deliveredCount,
      routePlan.metrics?.deliveredStopsCount,
    ) ?? 0;
    const attempted = firstNumber(
      routePlan.attemptedCount,
      routePlan.attemptedStopsCount,
      routePlan.metrics?.attemptedCount,
      routePlan.metrics?.attemptedStopsCount,
    ) ?? 0;

    return {
      id: routePlan.id,
      rowKey: `routePlan:${routePlan.id}`,
      href: routePlanPath(routePlan.id),
      isClickable: true,
      isDeletable: true,
      isSummaryRoute: true,
      deleteKey: getRouteDeleteKey(routePlan),
      route: routePlan.name ?? routePlan.id,
      status: routePlan.status ?? "DRAFT",
      orders: stopsCount,
      coordinates: `${locatedCount}/${stopsCount}`,
      delivered,
      attempted,
      missingCoordinates,
      date: formatRouteTableDate(routePlan),
      deliveryArea: formatRouteValues(routePlan.deliveryAreas),
      driver: formatRouteDriver(routePlan.driver),
      driverId: routePlan.driverId ?? routePlan.driver?.id ?? null,
      driveTimeSeconds: routeMetrics.durationSeconds,
      distanceMeters: routeMetrics.distanceMeters,
    };
  });
  const routeGroupBundles = routeGroupEntries.map(({ childRows, index, routeGroup }) => ({
    createdAtMs: getRouteCreatedAtMs(routeGroup),
    index,
    rows: [routeGroupRows[index], ...childRows],
  }));
  const routePlanBundles = routePlanRows.map((routeRow, index) => ({
    createdAtMs: getRouteCreatedAtMs(standaloneRoutePlans[index]),
    index: safeRouteGroups.length + index,
    rows: [routeRow],
  }));

  return [...routeGroupBundles, ...routePlanBundles]
    .sort(compareRouteRowBundles)
    .flatMap((bundle) => bundle.rows);
}
