import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  addCurrentRelease,
  createDeployFixture,
  read,
} from "./helpers/shopify-deploy-harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const deployScript = join(
  here,
  "../../../.github/actions/ec2-shopify-deploy/remote-deploy.sh",
);
const oldSha = "1".repeat(40);
const newSha = "2".repeat(40);

test("the workflow passes an exact SHA into target-scoped immutable staging", () => {
  const workflow = readFileSync(join(here, "../../../.github/workflows/deploy.yml"), "utf8");
  const action = readFileSync(
    join(here, "../../../.github/actions/ec2-shopify-deploy/action.yml"),
    "utf8",
  );
  const remote = readFileSync(deployScript, "utf8");

  assert.match(workflow, /group: shopify-clever-ec2-deploy-\$\{\{ inputs\.target \}\}/);
  assert.match(workflow, /release-sha: \$\{\{ github\.sha \}\}/);
  assert.match(action, /targets\/\$\{\{ inputs\.target \}\}\/incoming/);
  assert.doesNotMatch(action, /:\$\{\{ inputs\.deploy-path \}\}\/"/);
  assert.match(remote, /flock 9/);
  assert.match(remote, /image="shopify-clever-\$target:\$release_sha"/);
  assert.match(remote, /atomic_link "\$current_link" "releases\/\$release_sha"/);
});

function runDeploy(fixture, { target = "kfood", sha = newSha, env = {} } = {}) {
  const child = spawn(
    "bash",
    [
      deployScript,
      "--deploy-path",
      fixture.deployPath,
      "--target",
      target,
      "--release-sha",
      sha,
      "--incoming-path",
      fixture.incoming,
      "--compose-file",
      "infra/compose/deploy.yml",
      "--service",
      "app",
      "--sqlite-path",
      fixture.sqlitePath,
      "--env-file",
      "infra/env/runtime.env",
      "--smoke-url",
      `https://${target}.invalid/auth/login`,
      "--run-id",
      "test-run",
    ],
    { env: { ...fixture.env, ...env } },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  return new Promise((resolve) => {
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function freshFixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "shopify-deploy-"));
  return createDeployFixture(root, { sha: newSha, ...options });
}

for (const stage of ["migration", "restart", "smoke"]) {
  test(`${stage} failure restores the WAL-aware database and previous release`, async () => {
    const fixture = await freshFixture();
    await addCurrentRelease(fixture, { sha: oldSha });

    const result = await runDeploy(fixture, { env: { FAIL_STAGE: stage } });

    assert.notEqual(result.code, 0, result.stdout + result.stderr);
    assert.equal(await read(fixture.sqlitePath), "BASE|WAL");
    assert.equal(
      await readlink(join(fixture.deployPath, "targets/kfood/current")),
      `releases/${oldSha}`,
    );
    assert.match(await read(fixture.runningFile), new RegExp(`rollback|${oldSha}`));
    assert.match(result.stdout + result.stderr, /ROLLBACK_SMOKE=passed/);
  });
}

test("a failed first deployment restores the database without inventing a previous service", async () => {
  const fixture = await freshFixture();
  await rm(fixture.runningFile);

  const result = await runDeploy(fixture, { env: { FAIL_STAGE: "migration" } });

  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.equal(await read(fixture.sqlitePath), "BASE|WAL");
  await assert.rejects(access(join(fixture.deployPath, "targets/kfood/current")));
  await assert.rejects(access(fixture.runningFile));
  assert.match(result.stdout + result.stderr, /ROLLBACK_SMOKE=skipped_no_previous_service/);
});

test("a successful first legacy deploy publishes only the exact SHA after smoke", async () => {
  const fixture = await freshFixture();

  const result = await runDeploy(fixture);

  assert.equal(result.code, 0, result.stdout + result.stderr);
  const targetRoot = join(fixture.deployPath, "targets/kfood");
  assert.equal(await readlink(join(targetRoot, "current")), `releases/${newSha}`);
  await assert.rejects(access(join(targetRoot, "previous")));
  assert.match(await read(fixture.runningFile), new RegExp(`:${newSha}`));
  assert.equal(await read(fixture.sqlitePath), "BASE|WAL|MIGRATED");
  assert.match(await read(fixture.log), new RegExp(`build[\\s\\S]*:${newSha}`));
});

test("same-target executions serialize while different targets use independent locks", async () => {
  const sameRoot = await mkdtemp(join(tmpdir(), "shopify-deploy-lock-"));
  const first = await createDeployFixture(sameRoot, { target: "kfood", sha: newSha });
  const secondSha = "3".repeat(40);
  const secondIncoming = join(
    first.deployPath,
    "targets/kfood/incoming",
    `${secondSha}-run`,
  );
  await mkdir(join(secondIncoming, "infra/compose"), { recursive: true });
  await mkdir(join(secondIncoming, "apps/shopify-app"), { recursive: true });
  await writeFile(
    join(secondIncoming, "infra/compose/deploy.yml"),
    "name: fake-kfood\nservices:\n  app:\n    image: mutable:local\n",
  );
  await writeFile(join(secondIncoming, "apps/shopify-app/Dockerfile"), "FROM scratch\n");
  const second = { ...first, incoming: secondIncoming };
  const activeDir = join(sameRoot, "active");
  const overlap = join(sameRoot, "overlap");
  const lockEnv = {
    FAKE_ACTIVE_DIR: activeDir,
    FAKE_OVERLAP_FILE: overlap,
    FAKE_BUILD_SLEEP_SECONDS: "0.2",
  };
  const [firstResult, secondResult] = await Promise.all([
    runDeploy(first, { env: lockEnv }),
    runDeploy(second, { sha: secondSha, env: lockEnv }),
  ]);
  assert.equal(firstResult.code, 0, firstResult.stdout + firstResult.stderr);
  assert.equal(secondResult.code, 0, secondResult.stdout + secondResult.stderr);
  await assert.rejects(access(overlap), "same target builds must not overlap");

  const crossRoot = await mkdtemp(join(tmpdir(), "shopify-deploy-cross-lock-"));
  const kfood = await createDeployFixture(crossRoot, { target: "kfood", sha: newSha });
  const production = await createDeployFixture(crossRoot, {
    target: "production",
    sha: secondSha,
  });
  const crossOverlap = join(crossRoot, "overlap");
  const crossEnv = {
    FAKE_ACTIVE_DIR: join(crossRoot, "active"),
    FAKE_OVERLAP_FILE: crossOverlap,
    FAKE_BUILD_SLEEP_SECONDS: "0.2",
  };
  const [kfoodResult, productionResult] = await Promise.all([
    runDeploy(kfood, { env: crossEnv }),
    runDeploy(production, {
      target: "production",
      sha: secondSha,
      env: crossEnv,
    }),
  ]);
  assert.equal(kfoodResult.code, 0, kfoodResult.stdout + kfoodResult.stderr);
  assert.equal(productionResult.code, 0, productionResult.stdout + productionResult.stderr);
  assert.equal((await lstat(crossOverlap)).isFile(), true);
});

test("pruning deletes only marked stale releases and preserves current, previous, and unmarked data", async () => {
  const fixture = await freshFixture();
  const targetRoot = join(fixture.deployPath, "targets/kfood");
  await addCurrentRelease(fixture, { sha: oldSha });
  for (let index = 3; index <= 9; index += 1) {
    const sha = String(index).repeat(40);
    const release = join(targetRoot, "releases", sha);
    await mkdir(release, { recursive: true });
    await writeFile(join(release, ".shopify-release"), `target=kfood\nsha=${sha}\n`);
  }
  const unmarked = join(targetRoot, "releases", "manual-keep");
  await mkdir(unmarked, { recursive: true });
  await writeFile(join(unmarked, "operator-note"), "do not remove\n");

  const result = await runDeploy(fixture);

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal((await lstat(unmarked)).isDirectory(), true);
  assert.equal((await lstat(join(targetRoot, "releases", oldSha))).isDirectory(), true);
  assert.equal((await lstat(join(targetRoot, "releases", newSha))).isDirectory(), true);
});
