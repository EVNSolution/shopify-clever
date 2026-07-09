import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const monorepoRoot = join(process.cwd(), "../..");

function readRepoFile(relativePath) {
  return readFileSync(join(monorepoRoot, relativePath), "utf8");
}

test("Shopify compose files run only the app containers on the route-server network", () => {
  const mainCompose = readRepoFile("infra/compose/docker-compose.shopify-main.yml");
  const devCompose = readRepoFile("infra/compose/docker-compose.shopify-dev.yml");
  const workflowSource = readRepoFile(".github/workflows/ci-cd.yml");

  for (const composeSource of [mainCompose, devCompose]) {
    assert.match(composeSource, /context: \.\.\/\.\.\/apps\/shopify-app/);
    assert.match(composeSource, /CLEVER_DELIVERY_API_URL: http:\/\/clever-route-api:3000/);
    assert.match(composeSource, /route-server:[\s\S]*external: true/);
    assert.doesNotMatch(composeSource, /context: \.\.\/\.\.\/apps\/delivery-api/);
    assert.doesNotMatch(composeSource, /postgres/);
    assert.doesNotMatch(composeSource, /caddy/);
  }

  assert.match(workflowSource, /docker-compose\.shopify-main\.yml/);
  assert.match(workflowSource, /docker-compose\.shopify-dev\.yml/);
  assert.doesNotMatch(workflowSource, /delivery-api-migrate/);
  assert.doesNotMatch(workflowSource, /up -d postgres/);
  const deployAction = readRepoFile(".github/actions/ec2-shopify-deploy/action.yml");
  assert.match(deployAction, /up -d --remove-orphans/);
});
