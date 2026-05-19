import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const monorepoRoot = join(process.cwd(), "../..");

function readRepoFile(relativePath) {
  return readFileSync(join(monorepoRoot, relativePath), "utf8");
}

test("production deploy runs delivery API schema push before app startup", () => {
  const composeSource = readRepoFile("infra/compose/docker-compose.prod.yml");
  const workflowSource = readRepoFile(".github/workflows/ci-cd.yml");

  assert.match(composeSource, /delivery-api-migrate:/);
  assert.match(composeSource, /target: build/);
  assert.match(composeSource, /command:\s*\["npm", "exec", "--", "prisma", "db", "push", "--skip-generate"\]/);
  assert.match(composeSource, /delivery-api-migrate:[\s\S]*?condition: service_completed_successfully/);

  assert.match(workflowSource, /up -d postgres/);
  assert.match(workflowSource, /up --force-recreate delivery-api-migrate/);
  assert.match(workflowSource, /up -d shopify-app delivery-api/);
});
