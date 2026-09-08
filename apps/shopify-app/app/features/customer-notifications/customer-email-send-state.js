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
      blockers: ["Select at least one eligible recipient."],
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
