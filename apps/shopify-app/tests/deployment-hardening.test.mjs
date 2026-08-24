import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readlink, rm, symlink, utimes, writeFile } from "node:fs/promises";
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
  assert.match(action, /inputs\.deploy-path \}\}" == \/srv\/shopify-clever/);
  assert.ok(
    action.indexOf("== /srv/shopify-clever") < action.indexOf("mkdir -p %q"),
    "approved-root validation must precede remote staging writes",
  );
  assert.doesNotMatch(action, /:\$\{\{ inputs\.deploy-path \}\}\/"/);
  assert.match(remote, /flock 9/);
  assert.match(remote, /image="shopify-clever-\$target:\$release_sha"/);
  assert.match(remote, /atomic_link "\$current_link" "releases\/\$release_sha"/);
  assert.match(remote, /mv_flavor=gnu/);
  assert.match(remote, /mv -Tf "\$temporary" "\$link_path"/);
  assert.match(remote, /mv -fh "\$temporary" "\$link_path"/);
  assert.match(remote, /release pointer atomic rename postcondition failed/);
  assert.match(remote, /removed < 10/);
  assert.match(remote, /removed < 5/);
});

function runDeploy(
  fixture,
  {
    target = "kfood",
    sha = newSha,
    env = {},
    deployPath = fixture.deployPath,
    incoming = fixture.incoming,
  } = {},
) {
  const child = spawn(
    "bash",
    [
      deployScript,
      "--deploy-path",
      deployPath,
      "--target",
      target,
      "--release-sha",
      sha,
      "--incoming-path",
      incoming,
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

test("an already-current SHA is a verified no-op that keeps the running image pin", async () => {
  const fixture = await freshFixture();
  await addCurrentRelease(fixture, { sha: newSha });

  const result = await runDeploy(fixture, { env: { FAKE_CURRENT_TAG_MATCH: "1" } });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(await read(fixture.runningFile), "legacy-image\n");
  const log = await read(fixture.log);
  assert.match(log, /image tag sha256:legacy-image shopify-clever-kfood:rollback-test-run/);
  assert.doesNotMatch(log, /^build /m);
  assert.doesNotMatch(log, / stop app$/m);
  assert.doesNotMatch(log, / up -d /m);
  assert.match(result.stdout, /DEPLOYMENT_ALREADY_CURRENT/);
});

test("a build failure after snapshot cleans artifacts without touching the healthy runtime", async () => {
  const fixture = await freshFixture();
  await addCurrentRelease(fixture, { sha: oldSha });

  const result = await runDeploy(fixture, { env: { FAIL_STAGE: "build" } });

  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.equal(await read(fixture.runningFile), "legacy-image\n");
  assert.equal(await read(fixture.sqlitePath), "BASE");
  const log = await read(fixture.log);
  assert.match(log, /^build /m);
  assert.doesNotMatch(log, / stop app$/m);
  assert.doesNotMatch(log, / up -d /m);
  assert.doesNotMatch(log, /^-sS -L /m);
  assert.doesNotMatch(result.stdout + result.stderr, /ROLLBACK_STARTED/);
});

test("a partially failing stop still restarts and verifies the prior runtime", async () => {
  const fixture = await freshFixture();
  await addCurrentRelease(fixture, { sha: oldSha });

  const result = await runDeploy(fixture, { env: { FAIL_STAGE: "stop" } });

  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.equal(await read(fixture.sqlitePath), "BASE");
  assert.match(await read(fixture.runningFile), /rollback-test-run/);
  assert.match(result.stdout + result.stderr, /ROLLBACK_SMOKE=passed/);
});

test("a missing rollback tag fails before build and leaves the live runtime untouched", async () => {
  const fixture = await freshFixture();
  await addCurrentRelease(fixture, { sha: oldSha });

  const result = await runDeploy(fixture, { env: { FAIL_STAGE: "tag-missing" } });

  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.equal(await read(fixture.runningFile), "legacy-image\n");
  assert.equal(await read(fixture.sqlitePath), "BASE");
  assert.doesNotMatch(await read(fixture.log), /^build /m);
});

test("disk exhaustion fails before build, stop, or database mutation", async () => {
  const fixture = await freshFixture();

  const result = await runDeploy(fixture, { env: { FAKE_DISK_FREE_KB: "1024" } });

  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /insufficient disk space/);
  assert.equal(await read(fixture.runningFile), "legacy-image\n");
  assert.equal(await read(fixture.sqlitePath), "BASE");
  assert.doesNotMatch(await read(fixture.log), /^build /m);
});

test("deploy path traversal is rejected before any filesystem or runtime write", async () => {
  const fixture = await freshFixture();
  const unsafePath = `${fixture.deployPath}/../escape`;

  const result = await runDeploy(fixture, {
    deployPath: unsafePath,
    incoming: `${unsafePath}/targets/kfood/incoming/${newSha}-test-run`,
  });

  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /deploy path/);
  assert.equal(await read(fixture.log), "");
  assert.equal(await read(fixture.runningFile), "legacy-image\n");
});

test("termination during migration restores the database and prior runtime", async () => {
  const fixture = await freshFixture();
  await addCurrentRelease(fixture, { sha: oldSha });

  const result = await runDeploy(fixture, { env: { FAIL_STAGE: "signal" } });

  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.equal(await read(fixture.sqlitePath), "BASE|WAL");
  assert.match(await read(fixture.runningFile), /rollback-test-run/);
  assert.match(result.stdout + result.stderr, /ROLLBACK_SMOKE=passed/);
});

test("termination after the current pointer rename finishes a consistent pointer commit", async () => {
  const fixture = await freshFixture();
  await addCurrentRelease(fixture, { sha: oldSha });

  const result = await runDeploy(fixture, { env: { FAKE_SIGNAL_AFTER_CURRENT: "1" } });

  assert.equal(result.code, 143, result.stdout + result.stderr);
  const targetRoot = join(fixture.deployPath, "targets/kfood");
  assert.equal(await readlink(join(targetRoot, "current")), `releases/${newSha}`);
  assert.equal(await readlink(join(targetRoot, "previous")), `releases/${oldSha}`);
  assert.equal(await read(fixture.sqlitePath), "BASE|WAL|MIGRATED");
  assert.match(await read(fixture.runningFile), new RegExp(`:${newSha}`));
  assert.doesNotMatch(result.stdout + result.stderr, /ROLLBACK_STARTED/);
});

test("a live legacy runtime without a provable compose rollback fails closed before build or stop", async () => {
  const fixture = await freshFixture();
  await rm(join(fixture.deployPath, "infra/compose/deploy.yml"));

  const result = await runDeploy(fixture);

  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.equal(await read(fixture.sqlitePath), "BASE");
  assert.equal(await read(fixture.runningFile), "legacy-image\n");
  assert.doesNotMatch(await read(fixture.log), /^build /m);
  assert.doesNotMatch(await read(fixture.log), / stop app$/m);
});

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

test("pointer publication succeeds with GNU mv no-dereference semantics", async () => {
  const fixture = await freshFixture();

  const result = await runDeploy(fixture, { env: { FAKE_MV_FLAVOR: "gnu" } });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(
    await readlink(join(fixture.deployPath, "targets/kfood/current")),
    `releases/${newSha}`,
  );
});

test("a directory at a release pointer path fails closed before runtime mutation", async () => {
  const fixture = await freshFixture();
  const current = join(fixture.deployPath, "targets/kfood/current");
  await mkdir(current, { recursive: true });

  const result = await runDeploy(fixture);

  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /release pointer path must be a symlink/);
  assert.equal(await read(fixture.runningFile), "legacy-image\n");
  assert.equal(await read(fixture.sqlitePath), "BASE");
  assert.doesNotMatch(await read(fixture.log), /^compose |^build |^sqlite3 /m);
});

test("a GNU pointer rename failure never falls back to BSD and restores the prior state", async () => {
  const fixture = await freshFixture();
  await addCurrentRelease(fixture, { sha: oldSha });

  const result = await runDeploy(fixture, {
    env: { FAKE_MV_FLAVOR: "gnu", FAIL_STAGE: "pointer-rename" },
  });

  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.equal(
    await readlink(join(fixture.deployPath, "targets/kfood/current")),
    `releases/${oldSha}`,
  );
  await assert.rejects(access(join(fixture.deployPath, "targets/kfood/previous")));
  assert.equal(await read(fixture.sqlitePath), "BASE|WAL");
  assert.match(await read(fixture.runningFile), /rollback-test-run/);
  assert.match(result.stdout + result.stderr, /ROLLBACK_SMOKE=passed/);
  const log = await read(fixture.log);
  assert.match(log, /mv -Tf /);
  assert.doesNotMatch(log, /mv -fh /);
});

test("a post-rename pointer verification failure restores pointers before runtime rollback", async () => {
  const fixture = await freshFixture();
  await addCurrentRelease(fixture, { sha: oldSha });

  const result = await runDeploy(fixture, { env: { FAIL_STAGE: "pointer-postcondition" } });

  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  const targetRoot = join(fixture.deployPath, "targets/kfood");
  assert.equal(await readlink(join(targetRoot, "current")), `releases/${oldSha}`);
  await assert.rejects(access(join(targetRoot, "previous")));
  assert.equal(await read(fixture.sqlitePath), "BASE|WAL");
  assert.match(await read(fixture.runningFile), /rollback-test-run/);
  assert.match(result.stdout + result.stderr, /POINTER_SNAPSHOT_RESTORED/);
  assert.match(result.stdout + result.stderr, /ROLLBACK_SMOKE=passed/);
  const log = await read(fixture.log);
  assert.doesNotMatch(log, new RegExp(`IMAGE_PRUNED[^\\n]*${oldSha}`));
});

test("a failed previous snapshot verification republishes the complete candidate pointer set", async () => {
  const fixture = await freshFixture();
  await addCurrentRelease(fixture, { sha: oldSha });
  const targetRoot = join(fixture.deployPath, "targets/kfood");
  const olderSha = "4".repeat(40);
  await mkdir(join(targetRoot, "releases", olderSha), { recursive: true });
  await writeFile(
    join(targetRoot, "releases", olderSha, ".shopify-release"),
    `target=kfood\nsha=${olderSha}\n`,
  );
  await symlink(`releases/${olderSha}`, join(targetRoot, "previous"));

  const result = await runDeploy(fixture, { env: { FAIL_STAGE: "pointer-restore-previous" } });

  assert.equal(result.code, 71, result.stdout + result.stderr);
  assert.equal(await readlink(join(targetRoot, "current")), `releases/${newSha}`);
  assert.equal(await readlink(join(targetRoot, "previous")), `releases/${oldSha}`);
  assert.equal(await read(fixture.sqlitePath), "BASE|WAL|MIGRATED");
  assert.match(await read(fixture.runningFile), new RegExp(newSha));
  assert.match(result.stdout + result.stderr, /POINTER_CANDIDATE_REPUBLISHED/);
  assert.match(result.stdout + result.stderr, /POINTER_RESTORE_FAIL_STOP/);
  assert.doesNotMatch(result.stdout + result.stderr, /ROLLBACK_STARTED/);
  assert.doesNotMatch(await read(fixture.log), /IMAGE_PRUNED/);
});

test("a failed current snapshot verification republishes previous before current and preserves candidate state", async () => {
  const fixture = await freshFixture();
  await addCurrentRelease(fixture, { sha: oldSha });

  const result = await runDeploy(fixture, { env: { FAIL_STAGE: "pointer-restore-current" } });

  assert.equal(result.code, 71, result.stdout + result.stderr);
  const targetRoot = join(fixture.deployPath, "targets/kfood");
  assert.equal(await readlink(join(targetRoot, "current")), `releases/${newSha}`);
  assert.equal(await readlink(join(targetRoot, "previous")), `releases/${oldSha}`);
  assert.equal(await read(fixture.sqlitePath), "BASE|WAL|MIGRATED");
  assert.match(await read(fixture.runningFile), new RegExp(newSha));
  assert.match(result.stdout + result.stderr, /POINTER_CANDIDATE_REPUBLISHED/);
  assert.match(result.stdout + result.stderr, /POINTER_RESTORE_FAIL_STOP/);
  assert.doesNotMatch(result.stdout + result.stderr, /ROLLBACK_STARTED/);
  const log = await read(fixture.log);
  const previousPublish = log.lastIndexOf(
    `${join(targetRoot, "previous")}.tmp-test-run ${join(targetRoot, "previous")}`,
  );
  const currentPublish = log.lastIndexOf(
    `${join(targetRoot, "current")}.tmp-test-run ${join(targetRoot, "current")}`,
  );
  assert.ok(previousPublish >= 0 && currentPublish > previousPublish, log);
  assert.doesNotMatch(log, /IMAGE_PRUNED/);
});

test("a missing previous SHA tag is restored before success and survives a later rollback", async () => {
  const fixture = await freshFixture();
  await addCurrentRelease(fixture, { sha: oldSha });

  const first = await runDeploy(fixture);

  assert.equal(first.code, 0, first.stdout + first.stderr);
  assert.match(first.stdout, new RegExp(`PREVIOUS_IMAGE_PINNED target=kfood release=${oldSha}`));
  const oldTagState = join(fixture.imageStateDir, `shopify-clever-kfood:${oldSha}`);
  assert.equal(await read(oldTagState), "sha256:legacy-image\n");

  const nextSha = "3".repeat(40);
  const nextIncoming = join(
    fixture.deployPath,
    "targets/kfood/incoming",
    `${nextSha}-test-run`,
  );
  await mkdir(join(nextIncoming, "infra/compose"), { recursive: true });
  await mkdir(join(nextIncoming, "apps/shopify-app"), { recursive: true });
  await writeFile(
    join(nextIncoming, "infra/compose/deploy.yml"),
    "name: fake-kfood\nservices:\n  app:\n    image: mutable:local\n",
  );
  await writeFile(join(nextIncoming, "apps/shopify-app/Dockerfile"), "FROM scratch\n");
  await writeFile(
    join(nextIncoming, ".shopify-incoming"),
    `target=kfood\nsha=${nextSha}\nrun_id=test-run\n`,
  );

  const second = await runDeploy(fixture, {
    sha: nextSha,
    incoming: nextIncoming,
    env: { FAIL_STAGE: "smoke", FAKE_NEW_SHA: nextSha },
  });

  assert.notEqual(second.code, 0, second.stdout + second.stderr);
  const targetRoot = join(fixture.deployPath, "targets/kfood");
  assert.equal(await readlink(join(targetRoot, "current")), `releases/${newSha}`);
  assert.equal(await readlink(join(targetRoot, "previous")), `releases/${oldSha}`);
  assert.equal(await read(oldTagState), "sha256:legacy-image\n");
  assert.match(second.stdout + second.stderr, /ROLLBACK_SMOKE=passed/);
});

test("same-target executions serialize while different targets use independent locks", async () => {
  const sameRoot = await mkdtemp(join(tmpdir(), "shopify-deploy-lock-"));
  const first = await createDeployFixture(sameRoot, { target: "kfood", sha: newSha });
  const secondSha = "3".repeat(40);
  const secondIncoming = join(
    first.deployPath,
    "targets/kfood/incoming",
    `${secondSha}-test-run`,
  );
  await mkdir(join(secondIncoming, "infra/compose"), { recursive: true });
  await mkdir(join(secondIncoming, "apps/shopify-app"), { recursive: true });
  await writeFile(
    join(secondIncoming, "infra/compose/deploy.yml"),
    "name: fake-kfood\nservices:\n  app:\n    image: mutable:local\n",
  );
  await writeFile(join(secondIncoming, "apps/shopify-app/Dockerfile"), "FROM scratch\n");
  await writeFile(
    join(secondIncoming, ".shopify-incoming"),
    `target=kfood\nsha=${secondSha}\nrun_id=test-run\n`,
  );
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
  const log = await read(fixture.log);
  assert.match(log, /image rm shopify-clever-kfood:/);
  assert.doesNotMatch(log, new RegExp(`image rm shopify-clever-kfood:(?:${oldSha}|${newSha})`));
});

test("orphan cleanup removes aged overrides and unused labeled images but preserves protected SHAs", async () => {
  const fixture = await freshFixture();
  const targetRoot = join(fixture.deployPath, "targets/kfood");
  await addCurrentRelease(fixture, { sha: oldSha });
  const orphanSha = "6".repeat(40);
  const orphanOverride = join(targetRoot, "runtime", `${orphanSha}.override.yml`);
  await writeFile(orphanOverride, "services: {}\n");
  const oldTime = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  await utimes(orphanOverride, oldTime, oldTime);

  const result = await runDeploy(fixture, {
    env: {
      FAKE_IMAGE_LIST: [
        `shopify-clever-kfood:${orphanSha}`,
        `shopify-clever-kfood:${oldSha}`,
        `shopify-clever-kfood:${newSha}`,
      ].join("\n"),
    },
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  await assert.rejects(access(orphanOverride));
  const log = await read(fixture.log);
  assert.match(log, new RegExp(`image rm shopify-clever-kfood:${orphanSha}`));
  assert.doesNotMatch(log, new RegExp(`image rm shopify-clever-kfood:(?:${oldSha}|${newSha})`));
});

test("stale incoming cleanup removes only old target-marked staging directories", async () => {
  const fixture = await freshFixture();
  const incomingRoot = join(fixture.deployPath, "targets/kfood/incoming");
  const marked = join(incomingRoot, `${"4".repeat(40)}-stale-run`);
  const unmarked = join(incomingRoot, "operator-staging");
  await mkdir(marked, { recursive: true });
  await mkdir(unmarked, { recursive: true });
  await writeFile(
    join(marked, ".shopify-incoming"),
    `target=kfood\nsha=${"4".repeat(40)}\nrun_id=stale-run\n`,
  );
  const oldTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await utimes(marked, oldTime, oldTime);
  await utimes(unmarked, oldTime, oldTime);

  const result = await runDeploy(fixture);

  assert.equal(result.code, 0, result.stdout + result.stderr);
  await assert.rejects(access(marked));
  assert.equal((await lstat(unmarked)).isDirectory(), true);
});
