export const DEFAULT_ROUTE_PLAN_TITLE = "CLEVER route draft";

export function textOrUndefined(value) {
  if (value == null) return undefined;

  const text = String(value).trim();

  return text.length > 0 ? text : undefined;
}

export function roundPerfDuration(duration) {
  return Number(duration.toFixed(2));
}

export function getSafePerformanceNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

export function withPromiseTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(message)),
      timeoutMs,
    );

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
