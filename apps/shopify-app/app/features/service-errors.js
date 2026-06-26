export const SERVICE_ERROR_CODES = Object.freeze({
  PROTECTED_ORDER_ACCESS: "PROTECTED_ORDER_ACCESS",
});

export const SERVICE_ERROR_NOTICES = Object.freeze({
  PROTECTED_ORDER_ACCESS:
    "Shopify Order 보호 고객 데이터 접근이 아직 활성화되지 않았습니다. Dev Dashboard의 Protected customer data access에서 Protected customer data와 필요한 고객 필드(Name, Address, Phone)를 저장한 뒤 앱을 다시 열어주세요.",
});

const reportedServiceErrorKeys = new Set();

export function collectServiceErrors(payloads = [], options = {}) {
  const ignoredCodes = new Set(options.ignoredCodes ?? []);
  const payloadList = normalizePayloadList(payloads);
  const sources = isErrorList(payloadList) ? [payloadList] : payloadList;

  return sources
    .flatMap(normalizeErrorList)
    .filter((error) => error?.message)
    .filter((error) => !ignoredCodes.has(error?.code));
}

export function getServiceErrorNotice(payloads = [], options = {}) {
  const errors = collectServiceErrors(payloads, options);

  reportServiceErrorDiagnostics(errors, options);

  if (errors.some((error) => error?.code === SERVICE_ERROR_CODES.PROTECTED_ORDER_ACCESS)) {
    return SERVICE_ERROR_NOTICES.PROTECTED_ORDER_ACCESS;
  }

  return errors[0]?.message ?? null;
}

export function normalizeGraphqlErrors(errors, options = {}) {
  if (!Array.isArray(errors)) return [];

  return errors.map((error) =>
    options.mapError?.(error) ?? {
      code: error?.extensions?.code ?? error?.code,
      message: getServiceErrorMessage(error, options.fallbackMessage),
      path: Array.isArray(error?.path) ? error.path.join(".") : error?.path,
    },
  );
}

export function normalizeCaughtServiceError(error, fallbackMessage) {
  return [{
    code: error?.code,
    message: getServiceErrorMessage(error, fallbackMessage),
    status: error?.status,
  }];
}

export function getServiceErrorMessage(error, fallbackMessage = "Unknown service error.") {
  if (typeof error === "string") return error;

  const message = [
    error?.message,
    error?.body?.errors?.message,
    ...(Array.isArray(error?.body?.errors?.graphQLErrors)
      ? error.body.errors.graphQLErrors.map((graphQLError) => graphQLError?.message)
      : []),
    ...(Array.isArray(error?.body?.errors)
      ? error.body.errors.map((graphqlError) => graphqlError?.message)
      : []),
  ]
    .filter(Boolean)
    .join("\n");

  return message || fallbackMessage;
}

function normalizePayloadList(payloads) {
  if (payloads == null) return [];
  return Array.isArray(payloads) ? payloads : [payloads];
}

function normalizeErrorList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.errors)) return payload.errors;
  return [];
}

function isErrorList(values) {
  return values.some((value) => value?.message || value?.code) &&
    values.every((value) => value == null || !Array.isArray(value?.errors));
}

function reportServiceErrorDiagnostics(errors, options) {
  if (!options.context || errors.length === 0) return;

  const diagnostics = errors.map((error) => ({
    code: error?.code ?? "UNKNOWN",
    message: error?.message,
    path: error?.path,
    status: error?.status,
  }));
  const reportKey = JSON.stringify({ context: options.context, diagnostics });

  if (reportedServiceErrorKeys.has(reportKey)) return;
  reportedServiceErrorKeys.add(reportKey);
  if (reportedServiceErrorKeys.size > 50) reportedServiceErrorKeys.clear();

  const logger = options.logger ?? console;
  logger.warn?.("clever_service_errors", {
    context: options.context,
    errors: diagnostics,
  });
}
