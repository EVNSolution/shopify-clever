export function isRouteDispatchConfirmed(result, routePlanId) {
  return Boolean(
    routePlanId
    && (result?.errors ?? []).length === 0
    && result?.routePlan?.id === routePlanId
    && result?.dispatch?.routePlanId === routePlanId
    && typeof result.dispatch.publishedAt === "string"
    && Number.isFinite(Date.parse(result.dispatch.publishedAt)),
  );
}

export function getRouteDispatchNotice(result, routePlanId) {
  if (!isRouteDispatchConfirmed(result, routePlanId)) {
    return { message: "Dispatch result could not be confirmed. Refresh the route to check its status.", isError: true };
  }
  if (result.dispatch.notificationStatus === "SENT") {
    return { message: "Route dispatched. Driver notification sent.", isError: false };
  }
  if (result.dispatch.notificationStatus === "SKIPPED") {
    return { message: "Route dispatched, but no driver notification was sent. Check the driver's app and notification settings.", isError: true };
  }
  return { message: "Route dispatched, but the driver notification was not confirmed. Check with the driver before retrying.", isError: true };
}
