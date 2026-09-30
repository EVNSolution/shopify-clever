import { useRouteLoaderData } from "react-router";

// Supplied by the authenticated app loader, never inferred from the browser.
export function useStoreTimeZone() {
  return useRouteLoaderData("routes/app")?.ianaTimezone || "UTC";
}
