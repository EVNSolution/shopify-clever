import { AppDistribution } from "@shopify/shopify-app-react-router/server";

const DISTRIBUTIONS_BY_ENV = Object.freeze({
  app_store: AppDistribution.AppStore,
  single_merchant: AppDistribution.SingleMerchant,
  shopify_admin: AppDistribution.ShopifyAdmin,
});

export function resolveShopifyAppDistribution(
  distributionName = process.env.SHOPIFY_APP_DISTRIBUTION,
) {
  const normalizedName = String(distributionName || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");

  return DISTRIBUTIONS_BY_ENV[normalizedName] || AppDistribution.AppStore;
}
