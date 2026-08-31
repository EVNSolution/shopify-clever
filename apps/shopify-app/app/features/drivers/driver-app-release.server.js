import { getDriverDownloadLink } from "./phone-normalization.js";

const DRIVER_APP_RELEASE_URL = `${getDriverDownloadLink()}/release/android`;

export async function fetchDriverAppReleaseNotice({ fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(DRIVER_APP_RELEASE_URL, {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const release = payload?.error === null ? payload.data : null;
    const latestVersionCode = Number(release?.latestVersionCode);
    const latestVersionName = typeof release?.latestVersionName === "string"
      ? release.latestVersionName.trim()
      : "";

    if (!Number.isSafeInteger(latestVersionCode) || latestVersionCode <= 0 || !latestVersionName) {
      return null;
    }

    return {
      installUrl: getDriverDownloadLink(release.installUrl),
      latestVersionCode,
      latestVersionName,
    };
  } catch {
    return null;
  }
}
