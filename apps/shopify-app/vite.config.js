import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;
const SHOPIFY_DEV_TUNNEL_HOST = ".trycloudflare.com";
let hmrConfig;

if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT) || 8002,
    clientPort: 443,
  };
}

function isRoutesDocumentRequest(req) {
  const [pathname] = (req.url || "").split("?");
  if (pathname !== "/app/routes") return false;

  const accept = String(req.headers.accept || "");
  const fetchDest = req.headers["sec-fetch-dest"];
  const fetchMode = req.headers["sec-fetch-mode"];

  if (/\b(?:text|application)\/javascript\b/.test(accept)) return false;

  return (
    String(fetchDest) === "document" ||
    String(fetchMode) === "navigate" ||
    accept.includes("text/html") ||
    accept === "*/*" ||
    accept === ""
  );
}


function routesDocumentFallbackPlugin() {
  return {
    name: "clever-routes-document-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (isRoutesDocumentRequest(req)) {
          req.headers.accept = "text/html";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host, SHOPIFY_DEV_TUNNEL_HOST],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [routesDocumentFallbackPlugin(), reactRouter(), tsconfigPaths()],
  build: {
    assetsInlineLimit: 0,
    // MapLibre is loaded only by the Orders map via dynamic import.
    // Keep Vite's chunk warning useful for initial app code while allowing
    // the intentionally lazy map vendor chunk.
    chunkSizeWarningLimit: 1200,
  },
  optimizeDeps: {
    include: [
      "@shopify/app-bridge-react",
      // Route modules include server-only Shopify/Prisma imports for loaders
      // and lazy-load MapLibre/PMTiles on the client. Pre-optimize the first
      // dependencies Vite discovers during hydration so it does not rewrite
      // optimized dependency hashes inside the Shopify Admin iframe.
      "@shopify/shopify-app-react-router/adapters/node",
      "@shopify/shopify-app-react-router/react",
      "@shopify/shopify-app-react-router/server",
      "@shopify/shopify-app-session-storage-prisma",
      "@prisma/client",
      "maplibre-gl",
      "pmtiles",
    ],
  },
});
