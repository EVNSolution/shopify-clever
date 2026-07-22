import {
  getRouteGroupChildRoutePlanId,
  textOrUndefined,
} from "./route-helpers.js";

export function getRoutePlanIdsForOrderRefresh(routeGroup) {
  return [...new Set((routeGroup?.children ?? []).map(getRouteGroupChildRoutePlanId).filter(Boolean))];
}

export function collectRouteRefreshOrderGids(routeDetails) {
  return [...new Set((routeDetails ?? [])
    .flatMap((detail) => detail?.stops ?? [])
    .map((stop) => textOrUndefined(stop?.shopifyOrderGid))
    .filter(Boolean))];
}
