import { useEffect, useRef, useState } from "react";
import {
  Outlet,
  PrefetchPageLinks,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { syncShopifyOfflineTokenToDeliveryApi } from "../features/delivery/shopify-token-sync.server";
import { fetchShopifyAppPreferences } from "../features/settings/app-preferences.server";
import { DEFAULT_LANGUAGE, translate } from "../i18n/i18n";
import { authenticate } from "../shopify.server";

const APP_NAV_ITEMS = [
  { href: "/app/orders", labelKey: "nav.orders" },
  { href: "/app/routes", labelKey: "nav.routes" },
  { href: "/app/analytics", labelKey: "nav.analytics" },
  { href: "/app/drivers-vehicles", labelKey: "nav.drivers" },
  { href: "/app/settings", labelKey: "nav.settings" },
];
const PERF_CAPTURE_ENABLED = import.meta.env.DEV;
const PERF_ENDPOINT = "/perf";

function hasShopifyAdminContext(request) {
  const url = new URL(request.url);

  return (
    request.headers.has("authorization") ||
    (url.searchParams.has("shop") && url.searchParams.has("host"))
  );
}

function isAppPath(pathname) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function roundPerfDuration(duration) {
  return Number(duration.toFixed(2));
}

function getAppPageName(path) {
  const [pathname] = path.split(/[?#]/);
  const segments = pathname.split("/").filter(Boolean);

  return segments[0] === "app" ? segments[1] ?? "index" : segments[0] ?? "root";
}

function emitAppNavigationMetric(metric) {
  if (!PERF_CAPTURE_ENABLED || typeof window === "undefined") return;

  const payload = {
    app: "clever-route-app",
    category: "client-route-navigation",
    createdAt: new Date().toISOString(),
    name: "app.page.navigation",
    page: metric.toPage,
    ...metric,
  };

  window.__cleverPerfEvents = window.__cleverPerfEvents ?? [];
  window.__cleverPerfEvents.push(payload);
  console.info(payload.name, payload);

  const serializedPayload = JSON.stringify(payload);

  if (
    !navigator.sendBeacon?.(
      PERF_ENDPOINT,
      new Blob([serializedPayload], { type: "application/json" }),
    )
  ) {
    fetch(PERF_ENDPOINT, {
      body: serializedPayload,
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch(() => {});
  }
}

function useAppNavigationPerformance() {
  const location = useLocation();
  const navigation = useNavigation();
  const currentPath = location.pathname;
  const nextPath = navigation.location?.pathname;
  const lastPathRef = useRef(currentPath);
  const pendingNavigationRef = useRef(null);

  function markNavigationStart(toPath, trigger) {
    if (!PERF_CAPTURE_ENABLED || typeof window === "undefined") return;
    if (lastPathRef.current === toPath) return;

    pendingNavigationRef.current = {
      fromPath: lastPathRef.current,
      startedAt: performance.now(),
      toPath,
      trigger,
    };
  }

  useEffect(() => {
    if (!PERF_CAPTURE_ENABLED || typeof window === "undefined") {
      lastPathRef.current = currentPath;
      return;
    }

    if (navigation.state !== "idle") {
      if (
        nextPath &&
        lastPathRef.current !== nextPath &&
        pendingNavigationRef.current?.toPath !== nextPath
      ) {
        pendingNavigationRef.current = {
          fromPath: lastPathRef.current,
          startedAt: performance.now(),
          toPath: nextPath,
          trigger: "router",
        };
      }

      return;
    }

    if (lastPathRef.current === currentPath) return;

    const pendingNavigation = pendingNavigationRef.current;
    const pendingMatchesCurrentPath = pendingNavigation?.toPath === currentPath;
    const fromPath = pendingMatchesCurrentPath
      ? pendingNavigation.fromPath
      : lastPathRef.current;
    const startedAt = pendingMatchesCurrentPath
      ? pendingNavigation.startedAt
      : performance.now();

    emitAppNavigationMetric({
      durationMs: roundPerfDuration(performance.now() - startedAt),
      fromPage: getAppPageName(fromPath),
      fromPath,
      routerState: navigation.state,
      toPage: getAppPageName(currentPath),
      toPath: currentPath,
      trigger: pendingMatchesCurrentPath ? pendingNavigation.trigger : "history",
    });

    pendingNavigationRef.current = null;
    lastPathRef.current = currentPath;
  }, [currentPath, navigation.state, nextPath]);

  return markNavigationStart;
}

export const loader = async ({ request }) => {
  let language = DEFAULT_LANGUAGE;

  if (hasShopifyAdminContext(request)) {
    const { admin, session } = await authenticate.admin(request);
    await syncShopifyOfflineTokenToDeliveryApi(request, session).catch(() => {});
    const { appPreferences } = await fetchShopifyAppPreferences(admin);
    language = appPreferences.language;
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", language };
};

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}) {
  if (formMethod && formMethod.toLowerCase() !== "get") {
    return defaultShouldRevalidate;
  }

  if (
    currentUrl &&
    nextUrl &&
    isAppPath(currentUrl.pathname) &&
    isAppPath(nextUrl.pathname)
  ) {
    return false;
  }

  return defaultShouldRevalidate;
}

export default function App() {
  const { apiKey, language } = useLoaderData();
  const navigate = useNavigate();
  const markNavigationStart = useAppNavigationPerformance();
  const [intentPrefetchPage, setIntentPrefetchPage] = useState(null);

  function prefetchNavPage(page) {
    setIntentPrefetchPage(page);
  }

  function handleNavClick(event, href) {
    if (event.defaultPrevented) return;
    if (typeof event.button === "number" && event.button !== 0) return;
    if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;

    event.preventDefault();
    prefetchNavPage(href);
    markNavigationStart(href, "sidebar-click");
    navigate(href);
  }

  return (
    <AppProvider embedded apiKey={apiKey}>
      {intentPrefetchPage ? (
        <PrefetchPageLinks page={intentPrefetchPage} />
      ) : null}
      <s-app-nav>
        <s-link
          href="/app/orders"
          rel="home"
          onClick={(event) => handleNavClick(event, "/app/orders")}
          onMouseEnter={() => prefetchNavPage("/app/orders")}
          onFocus={() => prefetchNavPage("/app/orders")}
        >
          {translate(language, "nav.home")}
        </s-link>
        {APP_NAV_ITEMS.map((item) => (
          <s-link
            key={item.href}
            href={item.href}
            onClick={(event) => handleNavClick(event, item.href)}
            onMouseEnter={() => prefetchNavPage(item.href)}
            onFocus={() => prefetchNavPage(item.href)}
          >
            {translate(language, item.labelKey)}
          </s-link>
        ))}
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
