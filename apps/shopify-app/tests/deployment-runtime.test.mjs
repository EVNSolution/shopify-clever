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
    assert.match(
      composeSource,
      /\/srv\/shopify-clever(?:-dev|-kfood)?\/data\/shopify:\/app\/data/,
    );
    assert.doesNotMatch(composeSource, /:\/app\/prisma\/dev\.sqlite/);
  }

  assert.match(workflowSource, /docker-compose\.shopify-main\.yml/);
  assert.match(workflowSource, /docker-compose\.shopify-dev\.yml/);
  assert.match(kfoodCompose, /CLEVER_ORDERS_BACKGROUND_RECONCILIATION: "1"/);
  assert.match(kfoodCompose, /CLEVER_ORDERS_SERVER_PAGINATION: "1"/);
  assert.doesNotMatch(workflowSource, /delivery-api-migrate/);
  assert.doesNotMatch(workflowSource, /up -d postgres/);
  const deployAction = readRepoFile(".github/actions/ec2-shopify-deploy/action.yml");
  assert.match(deployAction, /up -d --remove-orphans/);
  assert.match(deployAction, /--exclude 'backups\/'/);
  assert.match(deployAction, /--exclude 'apps\/delivery-api\/'/);
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

test("Prisma migrations are verified before a new Shopify container replaces the live service", () => {
  const packageManifest = JSON.parse(readRepoFile("apps/shopify-app/package.json"));
  const dockerfile = readRepoFile("apps/shopify-app/Dockerfile");
  const dockerignore = readRepoFile("apps/shopify-app/.dockerignore");
  const shopifyWeb = readRepoFile("apps/shopify-app/shopify.web.toml");
  const schema = readRepoFile("apps/shopify-app/prisma/schema.prisma");
  const migrationCheck = readRepoFile(
    "apps/shopify-app/scripts/check-prisma-migrations.mjs",
  );
  const ciWorkflow = readRepoFile(".github/workflows/ci-cd.yml");
  const deployAction = readRepoFile(
    ".github/actions/ec2-shopify-deploy/action.yml",
  );

  assert.equal(
    packageManifest.scripts["prisma:migrate:check"],
    "node scripts/check-prisma-migrations.mjs",
  );
  assert.equal(
    packageManifest.scripts["docker-start"],
    "npm run prisma:migrate:status && npm run prisma:migrate:drift && npm run start",
  );
  assert.equal(
    packageManifest.scripts["prisma:migrate:status"],
    "npm run prisma:database:prepare && prisma migrate status",
  );
  assert.equal(
    packageManifest.scripts["prisma:migrate:drift"],
    "npm run prisma:database:prepare && prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code",
  );
  assert.match(schema, /url\s*=\s*"file:\.\.\/data\/dev\.sqlite"/);
  assert.equal(
    packageManifest.scripts["prisma:database:prepare"],
    "node scripts/ensure-sqlite-database.mjs",
  );
  assert.match(
    packageManifest.scripts["prisma:migrate:deploy"],
    /^npm run prisma:database:prepare && prisma migrate deploy$/,
  );
  assert.match(shopifyWeb, /dev = "npm run prisma:migrate:deploy/);
  assert.match(dockerfile, /RUN mkdir -p \/app\/data/);
  assert.match(dockerfile, /RUN npm run prisma:generate && npm run build/);
  assert.doesNotMatch(dockerfile, /migrate deploy/);
  assert.match(dockerignore, /^prisma\/dev\.sqlite\*$/m);
  assert.match(dockerignore, /^data\/dev\.sqlite\*$/m);

  assert.match(migrationCheck, /mkdtemp/);
  assert.match(migrationCheck, /migrate["'],\s*["']deploy/);
  assert.match(migrationCheck, /migrate["'],\s*["']status/);
  assert.match(migrationCheck, /migrate["'],\s*["']diff/);
  assert.match(migrationCheck, /--exit-code/);

  assert.match(
    ciWorkflow,
    /name: Validate Prisma migrations[\s\S]*working-directory: apps\/shopify-app[\s\S]*run: npm run prisma:migrate:check/,
  );

  const deployIndex = deployAction.indexOf("npm run prisma:migrate:deploy");
  const statusIndex = deployAction.indexOf("npm run prisma:migrate:status");
  const driftIndex = deployAction.indexOf("npm run prisma:migrate:drift");
  const replaceIndex = deployAction.indexOf("up -d --remove-orphans");
  assert.ok(deployIndex >= 0, "deploy action must apply migrations explicitly");
  assert.ok(statusIndex > deployIndex, "migration status must follow deploy");
  assert.ok(driftIndex > statusIndex, "schema drift must be checked after status");
  assert.ok(
    replaceIndex > driftIndex,
    "the live service must only be replaced after migration verification",
  );
  assert.match(deployAction, /run --rm --no-deps/);
});
