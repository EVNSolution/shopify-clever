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

// Delivery scheduled is sent by hand with Send Notification, so Dispatch never sends it.
export const DISPATCH_MANUAL_EMAIL_SIGNAL = "DELIVERY_SCHEDULED";

export function isValidCustomerEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** One row per order stop of the route. Rows without a valid email cannot get email. */
export function getDispatchEmailRows(stops = []) {
  return stops
    .filter((stop) => stop?.deliveryStopId && !stop.isCustomStop)
    .map((stop) => ({
      deliveryStopId: stop.deliveryStopId,
      customerName: stop.recipientName ?? stop.recipient ?? "Unknown recipient",
      eligible: isValidCustomerEmail(stop.email),
      email: stop.email ?? null,
      order: stop.order ?? null,
      stop: stop.stop ?? null,
    }));
}

/**
 * The selection saved at Dispatch. ALL_ELIGIBLE keeps future event emails active for eligible stops added later.
 * The initial stop IDs preserve the Dispatch snapshot. Delivery scheduled is always left out for manual sending.
 */
export function getAutomaticEmailSelection(stops, enabledSignals = []) {
  return {
    mode: "ALL_ELIGIBLE",
    signals: enabledSignals.filter((signal) => signal !== DISPATCH_MANUAL_EMAIL_SIGNAL),
    deliveryStopIds: getDispatchEmailRows(stops).filter((row) => row.eligible).map((row) => row.deliveryStopId),
  };
}

const SEND_NOTIFICATION_ITEMS = [
  { emailName: "Delivery scheduled", label: "Scheduled", signal: "DELIVERY_SCHEDULED" },
];

/**
 * The Send notifications menu opens for any saved route, so each item can say why it cannot be sent yet.
 * enabledSignals is null when the template settings could not be loaded; then no item is blocked on templates.
 */
export function getSendNotificationMenu({ busy, dispatched, enabledSignals = null, hasRoute }) {
  return {
    enabled: Boolean(hasRoute) && !busy,
    items: SEND_NOTIFICATION_ITEMS.map((item) => ({
      ...item,
      disabledReason: !dispatched
        ? "Dispatch this route first."
        : enabledSignals && !enabledSignals.includes(item.signal)
          ? "This email is turned off in your templates."
          : null,
    })),
  };
}
