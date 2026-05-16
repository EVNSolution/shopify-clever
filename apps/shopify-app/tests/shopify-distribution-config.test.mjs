import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { AppDistribution } from "@shopify/shopify-app-react-router/server";
import { resolveShopifyAppDistribution } from "../app/shopify-distribution.server.js";

const root = process.cwd();
const shopifyServerSource = readFileSync(join(root, "app/shopify.server.js"), "utf8");
const publicEnvExample = readFileSync(join(root, "../../infra/env/shopify-app.env.example"), "utf8");
const cleverRouteEnvExample = readFileSync(
  join(root, "../../infra/env/shopify-app-clever-route.env.example"),
  "utf8",
);

test("Shopify app distribution defaults to App Store for the public app", () => {
  assert.equal(resolveShopifyAppDistribution(), AppDistribution.AppStore);
  assert.equal(resolveShopifyAppDistribution(""), AppDistribution.AppStore);
  assert.equal(resolveShopifyAppDistribution("unknown"), AppDistribution.AppStore);
});

test("Shopify app distribution supports clever-route SingleMerchant runtime", () => {
  assert.equal(resolveShopifyAppDistribution("single_merchant"), AppDistribution.SingleMerchant);
  assert.equal(resolveShopifyAppDistribution("single-merchant"), AppDistribution.SingleMerchant);
  assert.equal(resolveShopifyAppDistribution(" SINGLE_MERCHANT "), AppDistribution.SingleMerchant);
});

test("Shopify app distribution keeps Shopify admin mode opt-in only", () => {
  assert.equal(resolveShopifyAppDistribution("shopify_admin"), AppDistribution.ShopifyAdmin);
});

test("shopify.server uses env-selected distribution instead of a hard-coded runtime", () => {
  assert.match(shopifyServerSource, /resolveShopifyAppDistribution\(\)/);
  assert.doesNotMatch(shopifyServerSource, /distribution:\s*AppDistribution\.AppStore/);
  assert.doesNotMatch(shopifyServerSource, /distribution:\s*AppDistribution\.SingleMerchant/);
});

test("public and clever-route env examples declare their intended distributions", () => {
  assert.match(publicEnvExample, /^SHOPIFY_APP_DISTRIBUTION=app_store$/m);
  assert.match(cleverRouteEnvExample, /^SHOPIFY_APP_DISTRIBUTION=single_merchant$/m);
});
