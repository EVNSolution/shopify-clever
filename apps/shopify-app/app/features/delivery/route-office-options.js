import { readStopTimeMinutes } from "./route-helpers.js";

export function normalizeRouteOptions(route = {}) {
  return {
    deliveryProof: {
      photoRequired: route?.deliveryProof?.photoRequired === true,
      signatureRequired: route?.deliveryProof?.signatureRequired === true,
    },
    tollPolicy:
      route?.tollPolicy === "AVOID_TOLLS" ? "AVOID_TOLLS" : "ALLOW_TOLLS",
  };
}

export function readRouteOptionsForm(form) {
  const tollPolicy = form.get("tollPolicy") ?? "ALLOW_TOLLS";
  if (!["ALLOW_TOLLS", "AVOID_TOLLS"].includes(tollPolicy))
    throw new Error("Choose a valid toll policy.");
  for (const key of ["photoRequired", "signatureRequired"]) {
    if (form.has(key) && !["true", "false"].includes(form.get(key)))
      throw new Error("Choose valid delivery proof options.");
  }
  return {
    deliveryProof: {
      photoRequired: form.get("photoRequired") === "true",
      signatureRequired: form.get("signatureRequired") === "true",
    },
    tollPolicy,
  };
}

// The unified Stop time of a new route. It is optional; the options of an existing route never carry it.
export function readInitialStopTime(form) {
  const text = String(form.get("serviceMinutes") ?? "").trim();
  if (text === "") return {};
  const serviceMinutes = readStopTimeMinutes(text);
  if (serviceMinutes === null)
    throw new Error("Enter whole minutes from 0 to 1440 for the Stop time.");
  return { serviceMinutes };
}

export function canEditRouteOptions(route) {
  return (
    Boolean(route?.updatedAt) &&
    ["DRAFT", "PREPARING", "READY"].includes(route?.status) &&
    !route?.publishedAt &&
    !route?.driverId &&
    !route?.driver?.id &&
    !route?.assignment?.driverId
  );
}

export function normalizeCashAmount(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

export function formatCashAmount(amount, currency) {
  if (
    amount === null ||
    amount === undefined ||
    amount === "" ||
    !currency ||
    !Number.isFinite(Number(amount))
  )
    return "Unknown";
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

export function getOfficeErrorMessage(error) {
  if (error?.code === "DELIVERY_PROOF_ROLLOUT_DISABLED") {
    return "Required delivery proof will be available after the new driver app rollout. Keep photo and signature optional until then.";
  }
  if (error?.code === "DELIVERY_PROOF_DRIVER_UPDATE_REQUIRED") {
    return "Update the driver app before requiring a delivery photo or customer signature.";
  }
  return error?.message ?? "The request failed. Try again.";
}
