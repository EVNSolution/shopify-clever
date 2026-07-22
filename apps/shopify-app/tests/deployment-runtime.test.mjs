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
  const kfoodCompose = readRepoFile("infra/compose/docker-compose.shopify-kfood.yml");
  const workflowSource = readRepoFile(".github/workflows/ci-cd.yml");

  for (const composeSource of [mainCompose, devCompose, kfoodCompose]) {
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
  assert.match(deployAction, /--exclude 'backups\/'/);
});

test("manual Shopify deploys reuse a successful main validation instead of running CI again", () => {
  const ciWorkflow = readRepoFile(".github/workflows/ci-cd.yml");
  const deployWorkflow = readRepoFile(".github/workflows/deploy.yml");

  assert.doesNotMatch(ciWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(ciWorkflow, /ec2-shopify-deploy/);
  assert.match(ciWorkflow, /cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}/);
  assert.match(ciWorkflow, /npm ci --prefer-offline --no-audit --no-fund/);

  assert.match(deployWorkflow, /workflow_dispatch:/);
  assert.match(deployWorkflow, /type: choice/);
  assert.match(deployWorkflow, /options:[\s\S]*clever-route[\s\S]*kfood[\s\S]*production/);
  assert.match(deployWorkflow, /actions\/workflows\/ci-cd\.yml\/runs/);
  assert.match(deployWorkflow, /HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(deployWorkflow, /-f head_sha="\$HEAD_SHA"/);
  assert.match(deployWorkflow, /-f status=success/);
  assert.match(deployWorkflow, /\.\/.github\/actions\/ec2-shopify-deploy/);
  assert.doesNotMatch(deployWorkflow, /npm (?:ci|run (?:setup|build|typecheck|test))/);
  assert.doesNotMatch(deployWorkflow, /needs: validate/);
});
