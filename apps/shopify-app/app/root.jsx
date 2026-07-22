import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";
import globalStyles from "./styles/global.css?url";

export const meta = () => [{ title: "clever" }];

export const links = () => [
  { rel: "stylesheet", href: globalStyles },
  { rel: "stylesheet", href: "/vendor/maplibre-gl.css" },
];

export const loader = () => ({
  // eslint-disable-next-line no-undef
  shopifyApiKey: process.env.SHOPIFY_API_KEY || "",
});

export default function App() {
  const { shopifyApiKey } = useLoaderData();
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="shopify-api-key" content={shopifyApiKey} />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link rel="preconnect" href="https://tiles.openfreemap.org/" crossOrigin="" />
        <link rel="preconnect" href="https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/" crossOrigin="" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
