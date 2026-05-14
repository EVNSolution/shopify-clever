import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import globalStyles from "./styles/global.css?url";

export const meta = () => [{ title: "clever" }];

export const links = () => [{ rel: "stylesheet", href: globalStyles }];

export default function App() {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
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
