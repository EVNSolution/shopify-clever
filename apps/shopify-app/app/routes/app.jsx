import { useState } from "react";
import {
  Outlet,
  PrefetchPageLinks,
  useLoaderData,
  useNavigate,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
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

export const loader = async ({ request }) => {
  let language = DEFAULT_LANGUAGE;

  if (hasShopifyAdminContext(request)) {
    const { admin } = await authenticate.admin(request);
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
    navigate(href);
  }

  return (
    <AppProvider embedded apiKey={apiKey}>
      {intentPrefetchPage ? (
        <PrefetchPageLinks page={intentPrefetchPage} />
      ) : null}
      <s-app-nav>
        <s-link href="/" rel="home">
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
