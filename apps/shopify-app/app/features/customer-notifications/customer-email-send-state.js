const CUSTOMER_EMAIL_SIGNAL_LABELS = {
  DELIVERED: "Delivered",
  DELIVERY_SCHEDULED: "Delivery scheduled",
  DRIVER_NEARBY: "Driver is nearby",
  MISSED_DELIVERY: "Missed delivery",
  OUT_FOR_DELIVERY: "Out for delivery",
};

export function getCustomerEmailDefaultSignal(routeExecutionStatus) {
  if (routeExecutionStatus === "COMPLETED") return "DELIVERED";
  if (routeExecutionStatus === "IN_PROGRESS") return "OUT_FOR_DELIVERY";
  return "DELIVERY_SCHEDULED";
}

export function getCustomerEmailPreviewEmptyState({ preview, routeExecutionStatus, signal }) {
  if (!preview || (Array.isArray(preview.recipients) && preview.recipients.length > 0)) return null;

  const exclusions = Array.isArray(preview.exclusions) ? preview.exclusions : [];
  const statusExcludedCount = Math.max(
    nonNegativeCount(preview?.counts?.statusExcluded),
    exclusions.reduce((total, exclusion) => total + nonNegativeCount(exclusion?.count), 0),
  );
  const skippedCount = Math.max(
    nonNegativeCount(preview?.counts?.skipped),
    Array.isArray(preview.skipped) ? preview.skipped.length : 0,
  );
  if (statusExcludedCount > 0 || skippedCount > 0) {
    const details = [
      ...exclusions.map((exclusion) => exclusion?.message).filter(Boolean),
      skippedCount > 0
        ? `${skippedCount} matching stop${skippedCount === 1 ? " was" : "s were"} skipped. Review the recipient reasons.`
        : null,
    ].filter(Boolean);
    return {
      detail: details.join(" "),
      title: "No sendable recipients",
    };
  }

  const signalLabel = CUSTOMER_EMAIL_SIGNAL_LABELS[signal] ?? "this message";
  const totalStops = nonNegativeCount(preview?.counts?.totalStops);
  const defaultSignal = getCustomerEmailDefaultSignal(routeExecutionStatus);
  if (totalStops > 0 && defaultSignal !== signal) {
    const routeStatusLabel = routeExecutionStatus === "COMPLETED" ? "Completed" : "In-progress";
    return {
      detail: `${routeStatusLabel} routes usually use ${CUSTOMER_EMAIL_SIGNAL_LABELS[defaultSignal]}. Change the message and preview again.`,
      title: `No stops match ${signalLabel}`,
    };
  }

  return {
    detail: totalStops > 0
      ? "No stops currently match this message. Choose another message and preview again."
      : "This route has no stops available for customer email.",
    title: `No stops match ${signalLabel}`,
  };
}

export function getCustomerEmailSendReadiness({
  confirmed,
  hasMissingValues,
  hasPriorSends,
  missingValuesConfirmed,
  previewReady,
  resendConfirmed,
  selectionCount,
}) {
  if (!previewReady) {
    return {
      blockers: ["Preview recipients before sending."],
      ready: false,
    };
  }

  if (selectionCount <= 0) {
    return {
      blockers: ["Select at least one sendable recipient."],
      ready: false,
    };
  }

  const blockers = [];
  if (!confirmed) blockers.push("Confirm this manual send.");
  if (hasMissingValues && !missingValuesConfirmed) {
    blockers.push("Confirm recipients with missing template values.");
  }
  if (hasPriorSends && !resendConfirmed) {
    blockers.push("Confirm recipients with prior send history.");
  }

  return {
    blockers,
    ready: blockers.length === 0,
  };
}

export function hasCustomerEmailPreviewConflict(errors) {
  return Array.isArray(errors) && errors.some((error) => (
    error?.code === "CUSTOMER_EMAIL_PREVIEW_CONFLICT"
    || error?.errorCode === "CUSTOMER_EMAIL_PREVIEW_CONFLICT"
  ));
}

function nonNegativeCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function summarizeCustomerEmailSendResult(dispatch) {
  const results = getDispatchResults(dispatch);
  const statuses = results.map(getDispatchResultStatus);
  const counts = {
    accepted: getDispatchCount(dispatch, "sent", statuses, "SENT"),
    duplicate: getDispatchCount(dispatch, "duplicate", statuses, "DUPLICATE"),
    failed: getDispatchCount(dispatch, "failed", statuses, "FAILED"),
    skipped: getDispatchCount(dispatch, "skipped", statuses, "SKIPPED"),
    unknown: statuses.filter((status) => !KNOWN_DISPATCH_STATUSES.has(status)).length,
  };
  const duplicateRequest = dispatch?.duplicate === true || counts.duplicate > 0;

  return {
    counts,
    details: results.flatMap((result, index) => {
      const status = statuses[index];
      if (status === "SENT" || status === "DUPLICATE") return [];
      const displayedStatus = KNOWN_DISPATCH_STATUSES.has(status) ? status : "UNKNOWN";
      return [{
        label: `${getDispatchResultIdentity(result, index)} - ${displayedStatus}`,
        reason: getDispatchResultReason(result, displayedStatus),
      }];
    }),
    duplicateRequest,
    originalOutcomeAvailable: !duplicateRequest || results.some(hasOriginalDispatchOutcome),
  };
}

const KNOWN_DISPATCH_STATUSES = new Set(["DUPLICATE", "FAILED", "SENT", "SKIPPED"]);

function getDispatchResults(dispatch) {
  for (const value of [dispatch?.results, dispatch?.recipients, dispatch?.items, dispatch?.deliveries, dispatch?.messages]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function getDispatchResultStatus(result) {
  const value = result?.status ?? result?.lastStatus ?? result?.deliveryStatus;
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "UNKNOWN";
}

function getDispatchCount(dispatch, key, statuses, status) {
  const value = dispatch?.counts?.[key];
  return Number.isInteger(value) && value >= 0
    ? value
    : statuses.filter((candidate) => candidate === status).length;
}

function getDispatchResultIdentity(result, index) {
  return [result?.orderNumber, result?.orderId, result?.email, result?.recipientEmail, result?.deliveryStopId]
    .find((value) => typeof value === "string" && value.trim()) ?? `Recipient ${index + 1}`;
}

function getDispatchResultReason(result, status) {
  for (const value of [result?.errorMessage, result?.reason, result?.message, result?.errorCode, result?.code]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return status === "UNKNOWN" ? "Outcome unavailable" : "No reason provided";
}

function hasOriginalDispatchOutcome(result) {
  for (const value of [result?.originalStatus, result?.providerStatus, result?.lastStatus]) {
    if (typeof value === "string" && value.trim() && value.trim().toUpperCase() !== "DUPLICATE") return true;
  }
  return false;
}
