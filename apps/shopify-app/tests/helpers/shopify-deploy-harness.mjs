import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const fakeDocker = String.raw`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_LOG"

if [[ "§{1:-}" == "build" ]]; then
  if [[ -n "§{FAKE_ACTIVE_DIR:-}" ]]; then
    if ! mkdir "$FAKE_ACTIVE_DIR" 2>/dev/null; then
      : > "$FAKE_OVERLAP_FILE"
    fi
    sleep "§{FAKE_BUILD_SLEEP_SECONDS:-0}"
    rmdir "$FAKE_ACTIVE_DIR" 2>/dev/null || true
  fi
  exit 0
fi

if [[ "§{1:-}" == "inspect" ]]; then
  if [[ "$*" == *'Config.Labels'* ]]; then
    reference="§{!#}"
    target_and_sha="§{reference#shopify-clever-}"
    printf 'true|%s|%s\n' "§{target_and_sha%%:*}" "§{target_and_sha#*:}"
  else
    printf '%s\n' 'sha256:legacy-image'
  fi
  exit 0
fi

if [[ "§{1:-}" == "image" && "§{2:-}" == "inspect" ]]; then
  reference="§{!#}"
  if [[ "$*" == *'Config.Labels'* ]]; then
    if [[ "$reference" == sha256:candidate-* ]]; then
      printf 'true|%s|%s\n' "$FAKE_TARGET" "§{reference#sha256:candidate-}"
    else
      target_and_sha="§{reference#shopify-clever-}"
      printf 'true|%s|%s\n' "§{target_and_sha%%:*}" "§{target_and_sha#*:}"
    fi
  elif [[ "$reference" == *rollback* ]]; then
    printf '%s\n' 'sha256:legacy-image'
  elif [[ "$reference" == shopify-clever-*:* ]]; then
    printf 'sha256:candidate-%s\n' "§{reference#*:}"
  else
    printf '%s\n' "$reference"
  fi
  exit 0
fi

if [[ "§{1:-}" == "image" && "§{2:-}" == "ls" ]]; then
  [[ -z "§{FAKE_IMAGE_LIST:-}" ]] || printf '%s\n' "$FAKE_IMAGE_LIST"
  exit 0
fi

if [[ "§{1:-}" == "image" && "§{2:-}" == "tag" ]]; then
  if [[ "§{FAIL_STAGE:-}" == "tag-missing" ]]; then
    exit 43
  fi
  exit 0
fi

if [[ "§{1:-}" == "image" && "§{2:-}" == "rm" ]]; then
  exit 0
fi

if [[ "§{1:-}" != "compose" ]]; then
  exit 0
fi

override=''
operation=''
for ((index = 2; index <= $#; index += 1)); do
  value="§{!index}"
  if [[ "$value" == "-f" ]]; then
    next=$((index + 1))
    override="§{!next}"
  fi
  case "$value" in
    config|ps|stop|run|up) operation="$value" ;;
  esac
done

case "$operation" in
  config) exit 0 ;;
  ps)
    if [[ -f "$FAKE_RUNNING_FILE" ]]; then
      printf '%s\n' fake-container
    fi
    ;;
  stop)
    rm -f "$FAKE_RUNNING_FILE"
    if [[ "§{FAIL_STAGE:-}" == "stop" ]]; then
      exit 42
    fi
    ;;
  run)
    if [[ "$*" == *"prisma:migrate:deploy"* ]]; then
      printf '%s' '|MIGRATED' >> "$FAKE_SQLITE_PATH"
      if [[ "§{FAIL_STAGE:-}" == "signal" ]]; then
        kill -TERM "$PPID"
        sleep 0.2
        exit 143
      fi
      if [[ "§{FAIL_STAGE:-}" == "migration" ]]; then
        exit 40
      fi
    fi
    ;;
  up)
    if [[ "§{FAIL_STAGE:-}" == "restart" ]] && grep -q "$FAKE_NEW_SHA" "$override"; then
      exit 41
    fi
    image="$(awk '/image:/ { print $2; exit }' "$override")"
    printf '%s\n' "$image" > "$FAKE_RUNNING_FILE"
    ;;
esac
`.replaceAll("§", "$");

const fakeSqlite = String.raw`#!/usr/bin/env bash
set -euo pipefail
database="$1"
command="§{2:-}"
printf 'sqlite3 %s %s\n' "$database" "$command" >> "$FAKE_LOG"
case "$command" in
  *wal_checkpoint*)
    if [[ -f "$database-wal" ]]; then
      cat "$database-wal" >> "$database"
      rm -f "$database-wal" "$database-shm"
    fi
    printf '%s\n' '0|0|0'
    ;;
  .backup*)
    destination="§{command#".backup '"}"
    destination="§{destination%\'}"
    cp "$database" "$destination"
    ;;
  *quick_check*) printf '%s\n' ok ;;
  *) : ;;
esac
`.replaceAll("§", "$");

const fakeCurl = String.raw`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_LOG"
running="$(cat "$FAKE_RUNNING_FILE" 2>/dev/null || true)"
if [[ "§{FAIL_STAGE:-}" == "smoke" && "$running" == *"$FAKE_NEW_SHA"* ]]; then
  exit 22
fi
body=''
while (($#)); do
  if [[ "$1" == "-o" ]]; then
    body="$2"
    shift 2
    continue
  fi
  shift
done
printf '%s\n' '<meta name="shopify-api-key"><p>Store context required</p>' > "$body"
printf '%s' 200
`.replaceAll("§", "$");

const fakeSudo = String.raw`#!/usr/bin/env bash
set -euo pipefail
exec "$@"
`;

const fakeFlock = String.raw`#!/usr/bin/env bash
set -euo pipefail
exec python3 - "$1" <<'PY'
import fcntl
import sys

fcntl.flock(int(sys.argv[1]), fcntl.LOCK_EX)
PY
`;

const fakeStat = String.raw`#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "-c" && "$2" == "%a" ]]; then
  printf '%s\n' 600
  exit 0
fi
if [[ "$1" == "-c" && "$2" == "%s" ]]; then
  wc -c < "$3" | tr -d '[:space:]'
  printf '\n'
  exit 0
fi
exec /usr/bin/stat "$@"
`;

const fakeDf = String.raw`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf 'fake 99999999 1 %s 1%% /\n' "§{FAKE_DISK_FREE_KB:-99999998}"
`.replaceAll("§", "$");

const fakeSha256sum = String.raw`#!/usr/bin/env bash
set -euo pipefail
shasum -a 256 "$@"
`;

const fakeMv = String.raw`#!/usr/bin/env bash
set -euo pipefail
if [[ "§{1:-}" == "-Tf" ]]; then
  shift
  exec /bin/mv -fh "$@"
fi
exec /bin/mv "$@"
`.replaceAll("§", "$");

async function executable(path, source) {
  await writeFile(path, source);
  await chmod(path, 0o755);
}

async function createReleaseTree(path, target, sha) {
  await mkdir(join(path, "infra/compose"), { recursive: true });
  await mkdir(join(path, "apps/shopify-app"), { recursive: true });
  await writeFile(
    join(path, "infra/compose/deploy.yml"),
    `name: fake-${target}\nservices:\n  app:\n    image: mutable:local\n`,
  );
  await writeFile(join(path, "apps/shopify-app/Dockerfile"), "FROM scratch\n");
  if (sha) {
    await writeFile(join(path, ".shopify-release"), `target=${target}\nsha=${sha}\n`);
  }
}

export async function createDeployFixture(root, { target = "kfood", sha }) {
  const deployPath = join(root, "deploy");
  const incoming = join(
    deployPath,
    "targets",
    target,
    "incoming",
    `${sha}-test-run`,
  );
  const sqlitePath = join(root, `${target}.sqlite`);
  const bin = join(root, "bin");
  const log = join(root, "commands.log");
  const runningFile = join(root, `${target}.running`);
  await mkdir(bin, { recursive: true });
  await mkdir(join(deployPath, "infra/env"), { recursive: true });
  await createReleaseTree(incoming, target);
  await writeFile(
    join(incoming, ".shopify-incoming"),
    `target=${target}\nsha=${sha}\nrun_id=test-run\n`,
  );
  await writeFile(join(deployPath, "infra/env/runtime.env"), "SECRET=preserved\n", {
    mode: 0o600,
  });
  await writeFile(sqlitePath, "BASE");
  await writeFile(`${sqlitePath}-wal`, "|WAL");
  await writeFile(`${sqlitePath}-shm`, "shm");
  await writeFile(runningFile, "legacy-image\n");
  await writeFile(log, "");
  await executable(join(bin, "docker"), fakeDocker);
  await executable(join(bin, "sqlite3"), fakeSqlite);
  await executable(join(bin, "curl"), fakeCurl);
  await executable(join(bin, "sudo"), fakeSudo);
  await executable(join(bin, "flock"), fakeFlock);
  await executable(join(bin, "stat"), fakeStat);
  await executable(join(bin, "df"), fakeDf);
  await executable(join(bin, "sha256sum"), fakeSha256sum);
  await executable(join(bin, "mv"), fakeMv);
  await createReleaseTree(deployPath, target);

  return {
    deployPath,
    incoming,
    sqlitePath,
    log,
    runningFile,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_LOG: log,
      FAKE_RUNNING_FILE: runningFile,
      FAKE_SQLITE_PATH: sqlitePath,
      FAKE_NEW_SHA: sha,
      FAKE_TARGET: target,
      SHOPIFY_DEPLOY_TEST_MODE: "1",
      SHOPIFY_DEPLOY_TEST_ROOT: deployPath,
      SHOPIFY_DEPLOY_SMOKE_ATTEMPTS: "1",
      SHOPIFY_DEPLOY_SMOKE_DELAY_SECONDS: "0",
    },
  };
}

export async function addCurrentRelease(fixture, { target = "kfood", sha }) {
  const targetRoot = join(fixture.deployPath, "targets", target);
  const release = join(targetRoot, "releases", sha);
  await createReleaseTree(release, target, sha);
  await mkdir(join(targetRoot, "runtime"), { recursive: true });
  await writeFile(
    join(targetRoot, "runtime", `${sha}.override.yml`),
    `services:\n  app:\n    image: shopify-clever-${target}:${sha}\n    build: null\n`,
  );
  await symlink(`releases/${sha}`, join(targetRoot, "current"));
  return release;
}

export async function read(path) {
  return readFile(path, "utf8");
}
