function textOrUndefined(value) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

function normalizePaymentToken(value) {
  return textOrUndefined(value)?.replace(/\s+/g, "_").toUpperCase() ?? "";
}

function getPaymentGatewayNames(order) {
  const values = [
    order?.paymentGatewayNames,
    order?.rawPayload?.paymentGatewayNames,
    order?.shopifyOrderSnapshot?.paymentGatewayNames,
  ].find(Array.isArray) ?? [];

  return values.map(textOrUndefined).filter(Boolean);
}

function formatPaymentGatewayName(value) {
  const searchValue = value.toLowerCase();
  const compactValue = searchValue.replace(/[\s_-]+/g, "");
  if (
    compactValue.includes("etransfer")
    || compactValue.includes("emailtransfer")
    || compactValue.includes("moneytransfer")
  ) {
    return "e-Transfer";
  }
  if (searchValue.includes("cash") || searchValue.includes("cod") || searchValue.includes("현금")) {
    return "Cash";
  }
  if (compactValue === "shopifypayments") return "Shopify Payments";
  if (compactValue === "shopifystorecredit") return "Shopify Store Credit";
  if (compactValue === "manual") return "Manual";
  return value;
}

export function formatInventoryPaymentMethod(order) {
  const methodTitle = textOrUndefined(order?.paymentMethodTitle);
  if (methodTitle) return methodTitle;

  const gatewayNames = getPaymentGatewayNames(order);
  if (gatewayNames.length > 0) {
    return [...new Set(gatewayNames.map(formatPaymentGatewayName))].join(" / ");
  }

  const legacyValue = normalizePaymentToken(
    order?.paymentStatus ?? order?.financialStatus,
  );
  if (legacyValue === "CASH") return "Cash";
  if (legacyValue === "ETRANSFER") return "e-Transfer";
  return "-";
}

export function formatInventoryPaymentStatus(order) {
  const candidates = [
    order?.shopifyPaymentStatus,
    order?.rawPayload?.displayFinancialStatus,
    order?.shopifyOrderSnapshot?.displayFinancialStatus,
    order?.paymentStatus,
    order?.financialStatus,
  ];

  for (const candidate of candidates) {
    const status = normalizePaymentToken(candidate);
    if (status === "PAID") return "Paid";
    if (status === "PENDING") return "Awaiting payment";
    if (status === "PARTIALLY_PAID") return "Partially paid";
    if (status === "AUTHORIZED") return "Authorized";
    if (status === "PARTIALLY_REFUNDED") return "Partially refunded";
    if (status === "REFUNDED") return "Refunded";
    if (status === "VOIDED") return "Voided";
    if (status === "EXPIRED") return "Expired";
    if (status === "UNKNOWN") return "Unknown";
  }

  return "-";
}
