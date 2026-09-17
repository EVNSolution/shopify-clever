import { numberOrUndefined, textOrUndefined } from "./route-helpers.js";
import { updateDeliveryRoutePlanStops } from "./route-plans.server.js";

export function readRouteStopsPayload(value) {
  try {
    const parsedStops = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsedStops)) return [];
    return parsedStops.flatMap((stop, index) => {
      const deliveryStopId = textOrUndefined(stop?.deliveryStopId) ?? null;
      const shopifyOrderGid = textOrUndefined(stop?.shopifyOrderGid) ?? null;
      if (!deliveryStopId && !shopifyOrderGid) return [];
      return [{ deliveryStopId, shopifyOrderGid, sequence: numberOrUndefined(stop?.sequence) ?? index + 1 }];
    });
  } catch {
    return [];
  }
}

export async function saveRouteStopOrder(request, routeId, value, options = {}) {
  const stops = readRouteStopsPayload(value);
  if (stops.length === 0) {
    return { routePlan: null, stops: [], errors: [{ message: "저장할 route stop이 없습니다." }] };
  }
  const updateStops = options.updateStops ?? updateDeliveryRoutePlanStops;
  return updateStops(request, routeId, { stops }, options);
}
