import { spawn } from "node:child_process";

const defaults = {
  CLEVER_APP_ID: "clever-route-dev",
  CLEVER_DELIVERY_API_URL: "https://clever-route-api.cleversystem.ai",
  CLEVER_DELIVERY_ONLY_DEPOT_ADDRESS: "서울특별시 동작구 노량진로 10",
  CLEVER_DELIVERY_ONLY_DEPOT_LATITUDE: "37.5124328",
  CLEVER_DELIVERY_ONLY_DEPOT_LONGITUDE: "126.9269873",
  CLEVER_DELIVERY_ONLY_DEPOT_NAME: "CLEVER Seoul Test Depot",
  CLEVER_DELIVERY_ONLY_TIME_ZONE: "Asia/Seoul",
  CLEVER_ORDERS_SOURCE_MODE: "delivery_only",
  SHOPIFY_APP_DISTRIBUTION: "single_merchant",
};

const child = spawn(
  "shopify",
  ["app", "dev", "-c", "dev", ...process.argv.slice(2)],
  {
    env: { ...defaults, ...process.env },
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(`Failed to start Shopify CLI: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
