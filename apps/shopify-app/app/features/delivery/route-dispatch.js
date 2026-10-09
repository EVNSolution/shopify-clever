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

/**
 * The header Dispatch button. A KFood route in progress publishes its saved changes;
 * every other route keeps the standard dispatch.
 */
export function getRouteDispatchControl({ busy, canDispatch, dispatching, hasDriver, hasUnsavedDraft, live = null }) {
  const enabled = !busy && !hasUnsavedDraft && (live ? live.canDispatch : canDispatch);
  const title = live
    ? live.canDispatch
      ? "Publish the saved changes and notify the assigned driver. The driver still has to apply them."
      : live.localDirty
        ? "Save route changes before dispatching."
        : live.locationIssues.length > 0
          ? "Confirm the location of every changed address before dispatching."
          : "Change a future stop and save it before dispatching."
    : hasDriver
      ? "Publish this route and notify the assigned driver. This does not start the route or send customer email."
      : "Assign a driver before dispatching this route.";
  return { enabled, label: dispatching ? "Dispatching…" : "Dispatch", title };
}
