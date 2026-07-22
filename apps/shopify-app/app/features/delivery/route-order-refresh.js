import {
  getRouteGroupChildRoutePlanId,
  textOrUndefined,
} from "./route-helpers.js";

const READY_COMPATIBILITY_STATUSES = new Set([
  "READY",
  "DRAFT",
  "PUBLISHED",
  "OPTIMIZED",
  "ASSIGNED",
]);

export function getRoutePlanIdsForOrderRefresh(routeGroup) {
  return [...new Set((routeGroup?.children ?? []).map(getRouteGroupChildRoutePlanId).filter(Boolean))];
}

export function collectRouteRefreshOrderGids(routeDetails) {
  return [...new Set((routeDetails ?? [])
    .flatMap((detail) => detail?.stops ?? [])
    .map((stop) => textOrUndefined(stop?.shopifyOrderGid))
    .filter(Boolean))];
}

export function getBulkRefreshRoutePlanIds(routePlans) {
  return [...new Set((routePlans ?? [])
    .filter((routePlan) => isRefreshableRouteStatus(routePlan?.status, false))
    .map((routePlan) => textOrUndefined(routePlan?.id))
    .filter(Boolean))];
}

export function partitionRefreshableRouteDetails(routeDetails, options = {}) {
  const allowInProgress = options.allowInProgress !== false;
  const refreshable = [];
  const skipped = [];

  for (const detail of routeDetails ?? []) {
    const routePlan = detail?.routePlan ?? detail;
    const routePlanId = textOrUndefined(routePlan?.id ?? detail?.routePlanId);
    const status = textOrUndefined(routePlan?.status) ?? "UNKNOWN";
    if (routePlanId && isRefreshableRouteStatus(status, allowInProgress)) {
      refreshable.push(detail);
    } else {
      skipped.push({ routePlanId, status });
    }
  }

  return { refreshable, skipped };
}

function isRefreshableRouteStatus(status, allowInProgress) {
  const normalized = textOrUndefined(status)?.toUpperCase();
  return READY_COMPATIBILITY_STATUSES.has(normalized) || (allowInProgress && normalized === "IN_PROGRESS");
}
