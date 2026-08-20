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
