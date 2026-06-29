import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { AppDistribution } from "@shopify/shopify-app-react-router/server";
import { resolveShopifyAppDistribution } from "../app/shopify-distribution.server.js";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const shopifyServerSource = readFileSync(join(root, "app/shopify.server.js"), "utf8");
const publicEnvExample = readFileSync(join(root, "../../infra/env/shopify-app.env.example"), "utf8");
const devEnvExample = readFileSync(
  join(root, "../../infra/env/shopify-app-clever-route.env.example"),
  "utf8",
);
const kfoodEnvExample = readFileSync(join(root, "../../infra/env/shopify-app-kfood.env.example"), "utf8");
const publicShopifyAppConfig = readFileSync(join(root, "shopify.app.toml"), "utf8");
const devShopifyAppConfig = readFileSync(join(root, "shopify.app.dev.toml"), "utf8");
const kfoodShopifyAppConfig = readFileSync(join(root, "shopify.app.kfood.toml"), "utf8");

function readTomlString(source, key) {
  const match = source.match(new RegExp(`^${key} = "([^"]+)"$`, "m"));
  return match?.[1] ?? "";
}

test("Shopify app distribution defaults to App Store for the public app", () => {
  assert.equal(resolveShopifyAppDistribution(), AppDistribution.AppStore);
  assert.equal(resolveShopifyAppDistribution(""), AppDistribution.AppStore);
  assert.equal(resolveShopifyAppDistribution("unknown"), AppDistribution.AppStore);
});

test("Shopify app distribution supports dev/custom-store SingleMerchant runtime", () => {
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

test("public, dev/custom-store, and KFood env examples declare their intended distributions", () => {
  assert.match(publicEnvExample, /^SHOPIFY_APP_DISTRIBUTION=app_store$/m);
  assert.match(devEnvExample, /^SHOPIFY_APP_DISTRIBUTION=single_merchant$/m);
  assert.match(kfoodEnvExample, /^SHOPIFY_APP_DISTRIBUTION=single_merchant$/m);
  assert.match(kfoodEnvExample, /^CLEVER_APP_ID=clever-route-kfood$/m);
});

test("Shopify app configs have explicit distinct production, dev, and KFood identities", () => {
  assert.equal(readTomlString(publicShopifyAppConfig, "client_id"), "6994f8bd771cebdac03a800f20e1de86");
  assert.equal(readTomlString(publicShopifyAppConfig, "name"), "CLEVER");
  assert.equal(readTomlString(publicShopifyAppConfig, "handle"), "clever-route");
  assert.equal(
    readTomlString(publicShopifyAppConfig, "application_url"),
    "https://clever-admin.cleversystem.ai",
  );

  assert.equal(readTomlString(devShopifyAppConfig, "client_id"), "9be6895e1de376bf056787803e863a4d");
  assert.equal(readTomlString(devShopifyAppConfig, "name"), "CleverRoute Dev");
  assert.equal(readTomlString(devShopifyAppConfig, "handle"), "clever-route-dev");
  assert.equal(
    readTomlString(devShopifyAppConfig, "application_url"),
    "https://clever-route-app.cleversystem.ai",
  );

  assert.equal(readTomlString(kfoodShopifyAppConfig, "client_id"), "0f23bdf915ecb9f0f40383c13f8fa3e1");
  assert.equal(readTomlString(kfoodShopifyAppConfig, "name"), "CLEVER K-Food");
  assert.equal(readTomlString(kfoodShopifyAppConfig, "handle"), "clever-route-kfood");
  assert.equal(
    readTomlString(kfoodShopifyAppConfig, "application_url"),
    "https://clever-kfood-app.cleversystem.ai",
  );

  assert.notEqual(
    readTomlString(publicShopifyAppConfig, "client_id"),
    readTomlString(devShopifyAppConfig, "client_id"),
  );
  assert.notEqual(
    readTomlString(publicShopifyAppConfig, "handle"),
    readTomlString(devShopifyAppConfig, "handle"),
  );
  assert.notEqual(
    readTomlString(kfoodShopifyAppConfig, "handle"),
    readTomlString(devShopifyAppConfig, "handle"),
  );
});

test("Shopify app URLs stay domain-rooted with only auth callback redirect URLs", () => {
  [
    publicShopifyAppConfig,
    devShopifyAppConfig,
    kfoodShopifyAppConfig,
  ].forEach((configSource) => {
    assert.match(configSource, /^embedded = true$/m);
    assert.match(configSource, /^application_url = "https:\/\/[^/"]+"$/m);
    assert.match(configSource, /redirect_urls = \[ "https:\/\/[^/"]+\/auth\/callback" \]/);
    assert.doesNotMatch(configSource, /\/app\/orders/);
    assert.doesNotMatch(configSource, /\/app"/);
  });
});

test("Shopify CLI scripts select explicit dev and production app configs", () => {
  assert.equal(packageJson.scripts.dev, "shopify app dev -c dev");
  assert.equal(packageJson.scripts.deploy, "npm run deploy:prod");
  assert.equal(packageJson.scripts["deploy:prod"], "shopify app deploy -c shopify.app.toml");
  assert.equal(packageJson.scripts["deploy:dev"], "shopify app deploy -c dev");
  assert.equal(packageJson.scripts["deploy:kfood"], "shopify app deploy -c shopify.app.kfood.toml");
  assert.equal(packageJson.scripts["config:validate:prod"], "shopify app config validate -c shopify.app.toml");
  assert.equal(packageJson.scripts["config:validate:dev"], "shopify app config validate -c dev");
  assert.equal(packageJson.scripts["config:validate:kfood"], "shopify app config validate -c shopify.app.kfood.toml");
  assert.match(packageJson.scripts["config:link"], /config:link:prod, npm run config:link:dev, or npm run config:link:kfood/);
  assert.equal(packageJson.scripts["config:link:prod"], "shopify app config link -c shopify.app.toml");
  assert.equal(packageJson.scripts["config:link:dev"], "shopify app config link -c dev");
  assert.equal(packageJson.scripts["config:link:kfood"], "shopify app config link -c shopify.app.kfood.toml");
  assert.notEqual(packageJson.scripts.deploy, "shopify app deploy");
});
