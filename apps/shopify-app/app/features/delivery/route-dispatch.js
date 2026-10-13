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

// The five customer email templates. Delivery scheduled is sent at Dispatch; the others later, on driver events.
export const DISPATCH_EMAIL_TEMPLATES = [
  { signal: "DELIVERY_SCHEDULED", label: "Delivery scheduled", timing: "Sent now, at Dispatch" },
  { signal: "OUT_FOR_DELIVERY", label: "Out for delivery", timing: "Sent later, when the driver starts" },
  { signal: "DRIVER_NEARBY", label: "Driver is nearby", timing: "Sent later, when the driver is near" },
  { signal: "DELIVERED", label: "Delivered", timing: "Sent later, when the stop is delivered" },
  { signal: "MISSED_DELIVERY", label: "Missed delivery", timing: "Sent later, when the stop is missed" },
];

export function isValidCustomerEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Popup steps. The email step shows only when the shop automatic switch is on. */
export function getDispatchDialogSteps(automaticEnabled) {
  return automaticEnabled === true ? ["confirm", "email"] : ["confirm"];
}

/** One row per order stop of the route. Rows without a valid email cannot be selected. */
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

/** Default selection: every enabled template and every stop with a valid email. */
export function getInitialDispatchEmailSelection(rows, enabledSignals = []) {
  return {
    signals: DISPATCH_EMAIL_TEMPLATES.map((template) => template.signal).filter((signal) => enabledSignals.includes(signal)),
    deliveryStopIds: rows.filter((row) => row.eligible).map((row) => row.deliveryStopId),
  };
}

/** One notice per step of a Dispatch with an email selection: selection, Dispatch, Delivery scheduled email. */
export function getDispatchEmailResultNotices(result, routePlanId, selection) {
  const email = result?.customerEmail ?? {};
  if ((email.selectionErrors ?? []).length > 0) {
    return [{
      isError: true,
      message: `Email selection was not saved, so the route was not dispatched: ${email.selectionErrors[0]?.message ?? "Unknown error"}`,
    }];
  }
  const notices = [{ isError: false, message: "Email selection saved." }];
  if ((result?.errors ?? []).length > 0) {
    notices.push({ isError: true, message: `Dispatch failed: ${result.errors[0]?.message ?? "Unknown error"}` });
    return notices;
  }
  notices.push(getRouteDispatchNotice(result, routePlanId));
  const sendNow = selection?.signals?.includes("DELIVERY_SCHEDULED") && selection?.deliveryStopIds?.length > 0;
  if (!sendNow) {
    notices.push({ isError: false, message: "Delivery scheduled email was not selected, so nothing was sent now." });
  } else if ((email.sendErrors ?? []).length > 0) {
    notices.push({
      isError: true,
      message: `The route was dispatched, but the Delivery scheduled email failed: ${email.sendErrors[0]?.message ?? "Unknown error"}. Use Customer email on this route to retry.`,
    });
  } else {
    const sent = email.send?.counts?.sent;
    const skipped = email.sendSkippedCount ?? 0;
    notices.push({
      isError: false,
      message: [
        email.send ? `Delivery scheduled email sent${Number.isInteger(sent) ? ` to ${sent} customer${sent === 1 ? "" : "s"}` : ""}.` : "No Delivery scheduled email was sent.",
        skipped > 0 ? `${skipped} customer${skipped === 1 ? " was" : "s were"} skipped because they already got it.` : null,
      ].filter(Boolean).join(" "),
    });
  }
  return notices;
}
