export const STALE_BUNDLE_RECOVERY_KEY = "clever:stale-bundle-recovery";
const DEFAULT_STALE_BUNDLE_COOLDOWN_MS = 60_000;

function getFailureFingerprint(event, pathname) {
  const message = event?.payload?.message;
  const candidate = typeof message === "string"
    ? message.match(/(?:https?:\/\/|\/)[^\s)'"\]]+/u)?.[0]
    : null;
  let chunk = "vite-preload-error";
  if (candidate) {
    try {
      chunk = new URL(candidate, "https://app.invalid").pathname.slice(0, 500);
    } catch {
      chunk = candidate.split(/[?#]/u, 1)[0].slice(0, 500);
    }
  }
  return `${pathname || "app"}::${chunk}`;
}

function getDefaultSessionStorage() {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function readRecoveryAttempt(storage, memoryRecoveryAttempt) {
  try {
    if (!storage?.getItem) return memoryRecoveryAttempt;
    const value = storage?.getItem?.(STALE_BUNDLE_RECOVERY_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value);
    return typeof parsed?.fingerprint === "string" && Number.isFinite(parsed?.attemptedAt)
      ? parsed
      : null;
  } catch {
    return memoryRecoveryAttempt;
  }
}

function writeRecoveryAttempt(storage, attempt) {
  try {
    storage?.setItem?.(STALE_BUNDLE_RECOVERY_KEY, JSON.stringify(attempt));
  } catch {
    // The in-memory marker still prevents a reload loop when storage is unavailable.
  }
}

function renderDefaultFallback() {
  if (typeof document === "undefined") return;

  const main = document.createElement("main");
  main.setAttribute("role", "alert");
  main.style.cssText = "font-family:system-ui,sans-serif;margin:48px auto;max-width:520px;padding:24px";

  const title = document.createElement("h1");
  title.textContent = "The app was updated";
  const message = document.createElement("p");
  message.textContent = "Reload the page. If it still fails, reopen CLEVER from Shopify Admin.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Reload";
  button.addEventListener("click", () => globalThis.location?.reload());

  main.append(title, message, button);
  document.body.replaceChildren(main);
}

export function createStaleBundleRecoveryHandler({
  cooldownMs = DEFAULT_STALE_BUNDLE_COOLDOWN_MS,
  now = Date.now,
  reload = () => globalThis.location?.reload(),
  renderFallback = renderDefaultFallback,
  storage = getDefaultSessionStorage(),
} = {}) {
  let memoryRecoveryAttempt = null;

  return function handleStaleBundlePreloadError(event) {
    event?.preventDefault?.();

    const attemptedAt = now();
    const fingerprint = getFailureFingerprint(event, globalThis.location?.pathname);
    const previousAttempt = readRecoveryAttempt(storage, memoryRecoveryAttempt);
    const repeatedWithinCooldown =
      Number.isFinite(previousAttempt?.attemptedAt) &&
      attemptedAt - previousAttempt.attemptedAt < cooldownMs;

    if (repeatedWithinCooldown) {
      renderFallback();
      return;
    }

    const nextAttempt = { attemptedAt, fingerprint };
    memoryRecoveryAttempt = nextAttempt;
    writeRecoveryAttempt(storage, nextAttempt);
    reload();
  };
}

export function installStaleBundleRecovery(options) {
  if (typeof window === "undefined") return () => {};

  const handler = createStaleBundleRecoveryHandler(options);
  window.addEventListener("vite:preloadError", handler);

  return () => window.removeEventListener("vite:preloadError", handler);
}
