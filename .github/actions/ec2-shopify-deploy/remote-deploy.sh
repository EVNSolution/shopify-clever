#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage: remote-deploy.sh \
  --deploy-path PATH --target TARGET --release-sha SHA \
  --incoming-path PATH --compose-file FILE --service SERVICE \
  --sqlite-path PATH --env-file FILE --smoke-url URL --run-id ID
EOF
}

fail() {
  printf 'shopify deploy: %s\n' "$*" >&2
  exit 1
}

require_value() {
  [[ $# -ge 2 && -n "$2" ]] || fail "missing value for $1"
}

deploy_path=''
target=''
release_sha=''
incoming_path=''
compose_file=''
service=''
sqlite_path=''
env_file=''
smoke_url=''
run_id=''

while (($#)); do
  require_value "$@"
  case "$1" in
    --deploy-path) deploy_path="$2" ;;
    --target) target="$2" ;;
    --release-sha) release_sha="$2" ;;
    --incoming-path) incoming_path="$2" ;;
    --compose-file) compose_file="$2" ;;
    --service) service="$2" ;;
    --sqlite-path) sqlite_path="$2" ;;
    --env-file) env_file="$2" ;;
    --smoke-url) smoke_url="$2" ;;
    --run-id) run_id="$2" ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
  shift 2
done

if [[ "${SHOPIFY_DEPLOY_TEST_MODE:-0}" == 1 && "${SHOPIFY_DEPLOY_TEST_ROOT:-}" == "$deploy_path" ]]; then
  [[ "$deploy_path" == /* && "$deploy_path" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "unsafe test deploy path"
  [[ "$deploy_path" != *'/../'* && "$deploy_path" != */.. && "$deploy_path" != *'//'* ]] || fail "unsafe test deploy path traversal"
else
  [[ "$deploy_path" == /srv/shopify-clever ]] || fail "deploy path must be the approved /srv/shopify-clever root"
fi
[[ "$target" =~ ^[a-z0-9][a-z0-9-]{0,39}$ ]] || fail "unsafe target"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || fail "release SHA must be 40 lowercase hex characters"
[[ "$compose_file" =~ ^[A-Za-z0-9._/-]+$ && "$compose_file" != /* && "$compose_file" != *'..'* ]] || fail "unsafe compose file"
[[ "$env_file" =~ ^[A-Za-z0-9._/-]+$ && "$env_file" != /* && "$env_file" != *'..'* ]] || fail "unsafe env file"
[[ "$service" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$ ]] || fail "unsafe service"
[[ "$sqlite_path" == /* && "$sqlite_path" =~ ^/[A-Za-z0-9._/-]+$ && "$sqlite_path" != *'/../'* ]] || fail "unsafe SQLite path"
[[ "$smoke_url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/ ]] || fail "smoke URL must use HTTPS"
[[ "$run_id" =~ ^[A-Za-z0-9._-]{1,100}$ ]] || fail "unsafe run id"

target_root="$deploy_path/targets/$target"
release_root="$target_root/releases"
release_path="$release_root/$release_sha"
runtime_root="$target_root/runtime"
backup_root="$target_root/backups"
lock_root="$deploy_path/locks"
current_link="$target_root/current"
previous_link="$target_root/previous"
release_marker="$release_path/.shopify-release"
image="shopify-clever-$target:$release_sha"
override_path="$runtime_root/$release_sha.override.yml"
shared_env_dir="$deploy_path/infra/env"
smoke_attempts="${SHOPIFY_DEPLOY_SMOKE_ATTEMPTS:-12}"
smoke_delay_seconds="${SHOPIFY_DEPLOY_SMOKE_DELAY_SECONDS:-5}"

mv_version="$(mv --version 2>/dev/null || true)"
mv_help="$(mv -h 2>&1 || true)"
if grep -qi 'GNU coreutils' <<<"$mv_version"; then
  mv_flavor=gnu
elif grep -qi 'usage' <<<"$mv_help"; then
  mv_flavor=bsd
else
  fail "mv lacks a supported no-dereference rename mode"
fi

case "$incoming_path" in
  "$target_root"/incoming/*) ;;
  *) fail "incoming path is outside the target staging root" ;;
esac
[[ "$incoming_path" == /* && "$incoming_path" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "unsafe incoming path"
[[ "$incoming_path" != *'/../'* && "$incoming_path" != */.. ]] || fail "unsafe incoming path traversal"
expected_incoming_path="$target_root/incoming/$release_sha-$run_id"
[[ "$incoming_path" == "$expected_incoming_path" ]] || fail "incoming path does not match the derived release path"
[[ -d "$incoming_path" ]] || fail "incoming release does not exist"
[[ ! -L "$incoming_path" ]] || fail "incoming release must not be a symlink"
incoming_marker="$incoming_path/.shopify-incoming"
[[ -f "$incoming_marker" ]] || fail "incoming ownership marker is missing"
grep -Fxq "target=$target" "$incoming_marker" || fail "incoming target marker mismatch"
grep -Fxq "sha=$release_sha" "$incoming_marker" || fail "incoming SHA marker mismatch"
grep -Fxq "run_id=$run_id" "$incoming_marker" || fail "incoming run marker mismatch"
[[ -f "$incoming_path/$compose_file" ]] || fail "staged compose file is missing"
[[ -f "$incoming_path/apps/shopify-app/Dockerfile" ]] || fail "staged Shopify Dockerfile is missing"
[[ -f "$deploy_path/$env_file" ]] || fail "shared runtime env file is missing"
[[ "$smoke_attempts" =~ ^[1-9][0-9]?$ ]] || fail "invalid smoke attempt count"
[[ "$smoke_delay_seconds" =~ ^[0-9]{1,2}$ ]] || fail "invalid smoke delay"
for pointer_path in "$current_link" "$previous_link"; do
  if [[ -e "$pointer_path" && ! -L "$pointer_path" ]]; then
    fail "release pointer path must be a symlink"
  fi
done

mkdir -p "$lock_root" "$release_root" "$runtime_root" "$backup_root"
exec 9>"$lock_root/shopify-$target.lock"
flock 9
printf 'LOCK_ACQUIRED target=%s release=%s\n' "$target" "$release_sha"

prune_stale_incoming() {
  local candidate name removed=0
  while IFS= read -r candidate; do
    ((removed < 10)) || break
    [[ "$candidate" != "$incoming_path" ]] || continue
    name="${candidate##*/}"
    [[ "$name" =~ ^[0-9a-f]{40}-[A-Za-z0-9._-]{1,100}$ ]] || continue
    [[ -f "$candidate/.shopify-incoming" ]] || continue
    grep -Fxq "target=$target" "$candidate/.shopify-incoming" || continue
    grep -Fxq "sha=${name%%-*}" "$candidate/.shopify-incoming" || continue
    grep -Fxq "run_id=${name#*-}" "$candidate/.shopify-incoming" || continue
    rm -rf "$candidate"
    removed=$((removed + 1))
    printf 'STALE_INCOMING_PRUNED target=%s path=%s\n' "$target" "$candidate"
  done < <(find "$target_root/incoming" -mindepth 1 -maxdepth 1 -type d -mmin +1440 -print 2>/dev/null | sort)
}

check_disk_space() {
  local available_kb database_bytes required_kb minimum_kb
  minimum_kb="${SHOPIFY_DEPLOY_MIN_FREE_KB:-2097152}"
  [[ "$minimum_kb" =~ ^[1-9][0-9]{3,9}$ ]] || fail "invalid minimum free disk configuration"
  available_kb="$(df -Pk "$deploy_path" | awk 'NR == 2 { print $4 }')"
  [[ "$available_kb" =~ ^[0-9]+$ ]] || fail "could not read available disk space"
  database_bytes=0
  [[ ! -f "$sqlite_path" ]] || database_bytes="$(stat -c '%s' "$sqlite_path")"
  required_kb=$((minimum_kb + ((database_bytes * 3 + 1023) / 1024)))
  ((available_kb >= required_kb)) || fail "insufficient disk space for image and rollback backup"
  printf 'DISK_PREFLIGHT available_kb=%s required_kb=%s\n' "$available_kb" "$required_kb"
}

prune_stale_incoming
check_disk_space

if [[ -e "$release_path" ]]; then
  [[ ! -L "$release_path" ]] || fail "existing release must not be a symlink"
  [[ -f "$release_marker" ]] || fail "existing release is missing its ownership marker"
  grep -Fxq "target=$target" "$release_marker" || fail "existing release target marker mismatch"
  grep -Fxq "sha=$release_sha" "$release_marker" || fail "existing release SHA marker mismatch"
  rm -rf "$incoming_path"
else
  rm -f "$incoming_marker"
  printf 'target=%s\nsha=%s\n' "$target" "$release_sha" > "$incoming_path/.shopify-release"
  mv "$incoming_path" "$release_path"
fi

[[ -f "$release_path/$compose_file" ]] || fail "compose file is absent from release"
[[ -f "$release_path/apps/shopify-app/Dockerfile" ]] || fail "Shopify Dockerfile is absent from release"
chmod 600 "$deploy_path/$env_file"

# Releases never own secrets. Compose files retain their normal ../env relative path,
# backed by the deploy root's persistent, non-rsynced env directory.
rm -rf "$release_path/infra/env"
ln -s "$shared_env_dir" "$release_path/infra/env"

cat > "$override_path" <<EOF
services:
  $service:
    image: $image
    build: null
EOF

compose=(docker compose -f "$release_path/$compose_file" -f "$override_path")
"${compose[@]}" config --quiet

old_current_target=''
old_release_path=''
old_override_path=''
old_sha=''
rollback_compose_file=''
rollback_override_path=''
rollback_image=''
prior_container=''
prior_image_id=''
if [[ -L "$current_link" ]]; then
  old_current_target="$(readlink "$current_link")"
  [[ "$old_current_target" =~ ^releases/[0-9a-f]{40}$ ]] || fail "current release link is unsafe"
  old_release_path="$target_root/$old_current_target"
  old_sha="${old_current_target#releases/}"
  [[ -f "$old_release_path/.shopify-release" ]] || fail "current release marker is missing"
  grep -Fxq "target=$target" "$old_release_path/.shopify-release" || fail "current release target marker mismatch"
  grep -Fxq "sha=$old_sha" "$old_release_path/.shopify-release" || fail "current release SHA marker mismatch"
  old_override_path="$runtime_root/$old_sha.override.yml"
  [[ -f "$old_override_path" ]] || fail "current release runtime override is missing"
  rollback_compose_file="$old_release_path/$compose_file"
  [[ -f "$rollback_compose_file" ]] || fail "current release compose file is missing"
else
  rollback_compose_file="$deploy_path/$compose_file"
  [[ -f "$rollback_compose_file" ]] || rollback_compose_file=''
fi

prior_container="$("${compose[@]}" ps -q "$service" | head -n 1)"
if [[ -n "$prior_container" ]]; then
  [[ -n "$rollback_compose_file" ]] || fail "live runtime has no provable rollback compose file"
  rollback_image="shopify-clever-$target:rollback-$run_id"
  prior_image_id="$(docker inspect --format '{{.Image}}' "$prior_container")"
  [[ "$prior_image_id" =~ ^sha256:[0-9A-Za-z._-]+$ ]] || fail "could not resolve prior container image"
  docker image tag "$prior_image_id" "$rollback_image"
  if [[ "$(docker image inspect --format '{{.Id}}' "$rollback_image")" != "$prior_image_id" ]]; then
    docker image rm "$rollback_image" >/dev/null 2>&1 || true
    fail "rollback image snapshot verification failed"
  fi
  rollback_override_path="$runtime_root/rollback-$run_id.override.yml"
  cat > "$rollback_override_path" <<EOF
services:
  $service:
    image: $rollback_image
    build: null
EOF
  rollback_compose=(docker compose -f "$rollback_compose_file" -f "$rollback_override_path")
  if ! "${rollback_compose[@]}" config --quiet; then
    docker image rm "$rollback_image" >/dev/null 2>&1 || true
    rm -f "$rollback_override_path"
    fail "rollback compose snapshot validation failed"
  fi
fi

backup_ready=0
published=0
recovery_required=0
candidate_image_id=''
build_attempted=0
backup_dir=''
backup_database=''
database_mode=''

smoke() {
  local body status attempt
  body="$(mktemp)"
  for ((attempt = 1; attempt <= smoke_attempts; attempt += 1)); do
    status="$(curl -sS -L -o "$body" -w '%{http_code}' "$smoke_url" || true)"
    if [[ "$status" == 200 ]] \
      && grep -q 'name="shopify-api-key"' "$body" \
      && grep -q 'Store context required' "$body" \
      && ! grep -q 'https://cdn.shopify.com/shopifycloud/app-bridge.js' "$body"; then
      rm -f "$body"
      return 0
    fi
    sleep "$smoke_delay_seconds"
  done
  sed -n '1,80p' "$body" >&2 || true
  rm -f "$body"
  return 1
}

restore_database() {
  local restore_tmp
  ((backup_ready == 1)) || return 0
  restore_tmp="$sqlite_path.restore-$run_id"
  rm -f "$sqlite_path-wal" "$sqlite_path-shm" "$restore_tmp"
  cp "$backup_database" "$restore_tmp"
  chmod "$database_mode" "$restore_tmp"
  mv -f "$restore_tmp" "$sqlite_path"
  [[ "$(sqlite3 "$sqlite_path" 'PRAGMA quick_check;')" == ok ]]
  printf 'DATABASE_RESTORED sha256=%s mode=%s\n' \
    "$(sha256sum "$sqlite_path" | awk '{print $1}')" "$database_mode"
}

remove_labeled_image() {
  local reference="$1" expected_sha="$2" details image_id
  [[ -n "$reference" ]] || return 0
  details="$(docker image inspect --format '{{ index .Config.Labels "ai.cleversystem.shopify-release" }}|{{ index .Config.Labels "ai.cleversystem.shopify-target" }}|{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$reference" 2>/dev/null || true)"
  [[ "$details" == "true|$target|$expected_sha" ]] || return 0
  image_id="$(docker image inspect --format '{{.Id}}' "$reference")"
  if [[ -n "$(docker ps -q --filter "ancestor=$image_id")" ]]; then
    printf 'IMAGE_PRUNE_SKIPPED_RUNNING target=%s image=%s\n' "$target" "$reference"
    return 0
  fi
  if docker image rm "$reference" >/dev/null 2>&1; then
    printf 'IMAGE_PRUNED target=%s image=%s\n' "$target" "$reference"
  else
    printf 'IMAGE_PRUNE_SKIPPED_IN_USE target=%s image=%s\n' "$target" "$reference"
  fi
}

cleanup_failed_artifacts() {
  if ((build_attempted == 1)); then
    remove_labeled_image "$image" "$release_sha"
  fi
  if ((build_attempted == 1)) && [[ "$old_sha" == "$release_sha" && -n "$prior_image_id" ]]; then
    docker image tag "$prior_image_id" "$image"
  fi
  if [[ -n "$candidate_image_id" && "$candidate_image_id" != "$prior_image_id" ]]; then
    remove_labeled_image "$candidate_image_id" "$release_sha"
  fi
  if [[ -n "$rollback_image" ]]; then
    docker image rm "$rollback_image" >/dev/null 2>&1 || true
  fi
  [[ -z "$rollback_override_path" ]] || rm -f "$rollback_override_path"
}

rollback() {
  local rollback_compose=()
  printf 'ROLLBACK_STARTED target=%s release=%s\n' "$target" "$release_sha" >&2
  "${compose[@]}" stop "$service" >/dev/null 2>&1 || true
  restore_database
  if [[ -n "$prior_container" && -n "$rollback_compose_file" && -n "$rollback_override_path" ]]; then
    rollback_compose=(docker compose -f "$rollback_compose_file" -f "$rollback_override_path")
    "${rollback_compose[@]}" config --quiet
    "${rollback_compose[@]}" up -d --no-build "$service"
    if smoke; then
      printf 'ROLLBACK_SMOKE=passed target=%s\n' "$target"
    else
      printf 'ROLLBACK_SMOKE=failed target=%s\n' "$target" >&2
      return 1
    fi
    cleanup_failed_artifacts
  else
    printf 'ROLLBACK_SMOKE=skipped_no_previous_service target=%s\n' "$target"
    cleanup_failed_artifacts
  fi
  printf 'ROLLBACK_COMPLETED target=%s\n' "$target"
}

on_exit() {
  local status=$?
  trap - EXIT
  if ((status != 0 && published == 0 && recovery_required == 1)); then
    if ! rollback; then
      printf 'ROLLBACK_FAILED original_status=%s target=%s release=%s\n' \
        "$status" "$target" "$release_sha" >&2
      exit 70
    fi
  elif ((status != 0 && published == 0)); then
    cleanup_failed_artifacts
  fi
  [[ -d "$incoming_path" ]] && rm -rf "$incoming_path"
  exit "$status"
}
trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ -n "$prior_container" && "$old_sha" == "$release_sha" ]]; then
  current_image_id="$(docker image inspect --format '{{.Id}}' "$image")"
  [[ "$current_image_id" == "$prior_image_id" ]] || fail "current SHA tag does not match the running image"
  smoke
  published=1
  cleanup_failed_artifacts
  printf 'DEPLOYMENT_ALREADY_CURRENT target=%s release=%s image_id=%s\n' \
    "$target" "$release_sha" "$prior_image_id"
  exit 0
fi
build_attempted=1
docker build \
  --label "ai.cleversystem.shopify-release=true" \
  --label "ai.cleversystem.shopify-target=$target" \
  --label "org.opencontainers.image.revision=$release_sha" \
  --tag "$image" \
  "$release_path/apps/shopify-app"
candidate_image_id="$(docker image inspect --format '{{.Id}}' "$image")"
[[ -n "$candidate_image_id" ]] || fail "candidate image ID is missing after build"
check_disk_space

sudo mkdir -p "$(dirname "$sqlite_path")"
sudo touch "$sqlite_path"
sudo chown "$(id -u):$(id -g)" "$sqlite_path"
chmod 600 "$sqlite_path"
[[ -r "$sqlite_path" && -w "$sqlite_path" ]] || fail "SQLite database is not readable and writable"

if [[ -n "$prior_container" ]]; then
  # From this point onward a failed or partially successful stop requires live recovery.
  recovery_required=1
  "${compose[@]}" stop "$service"
fi

sqlite3 "$sqlite_path" 'PRAGMA wal_checkpoint(FULL);' >/dev/null
[[ "$(sqlite3 "$sqlite_path" 'PRAGMA quick_check;')" == ok ]] || fail "source database quick_check failed"
database_mode="$(stat -c '%a' "$sqlite_path")"
backup_dir="$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-$release_sha-$run_id"
mkdir -p "$backup_dir"
backup_database="$backup_dir/dev.sqlite"
sqlite3 "$sqlite_path" ".backup '$backup_database'"
chmod "$database_mode" "$backup_database"
[[ "$(sqlite3 "$backup_database" 'PRAGMA quick_check;')" == ok ]] || fail "backup database quick_check failed"
backup_sha256="$(sha256sum "$backup_database" | awk '{print $1}')"
cat > "$backup_dir/metadata" <<EOF
target=$target
release_sha=$release_sha
database_sha256=$backup_sha256
database_mode=$database_mode
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
printf 'target=%s\nsha=%s\nrun_id=%s\n' "$target" "$release_sha" "$run_id" > "$backup_dir/.shopify-backup"
backup_ready=1
recovery_required=1
printf 'DATABASE_BACKUP_READY sha256=%s mode=%s path=%s\n' \
  "$backup_sha256" "$database_mode" "$backup_dir"

"${compose[@]}" run --rm --no-deps "$service" npm run prisma:migrate:deploy
"${compose[@]}" run --rm --no-deps "$service" npm run prisma:migrate:status
"${compose[@]}" run --rm --no-deps "$service" npm run prisma:migrate:drift
"${compose[@]}" up -d --no-build "$service"
smoke

if [[ -n "$old_sha" && -n "$prior_image_id" ]]; then
  previous_image="shopify-clever-$target:$old_sha"
  docker image tag "$prior_image_id" "$previous_image"
  [[ "$(docker image inspect --format '{{.Id}}' "$previous_image")" == "$prior_image_id" ]] \
    || fail "previous release image tag restoration failed"
  printf 'PREVIOUS_IMAGE_PINNED target=%s release=%s image_id=%s\n' \
    "$target" "$old_sha" "$prior_image_id"
fi

atomic_link() {
  local link_path="$1" link_target="$2" temporary
  temporary="$link_path.tmp-$run_id"
  rm -f "$temporary"
  ln -s "$link_target" "$temporary"
  if [[ "$mv_flavor" == gnu ]]; then
    mv -Tf "$temporary" "$link_path"
  else
    mv -fh "$temporary" "$link_path"
  fi
  [[ -L "$link_path" && "$(readlink "$link_path")" == "$link_target" ]] \
    || fail "release pointer atomic rename postcondition failed"
}

publish_signal_status=0
trap 'publish_signal_status=129' HUP
trap 'publish_signal_status=130' INT
trap 'publish_signal_status=143' TERM
if [[ -n "$old_current_target" ]]; then
  atomic_link "$previous_link" "$old_current_target"
fi
atomic_link "$current_link" "releases/$release_sha"
published=1
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'RELEASE_PUBLISHED target=%s release=%s image=%s\n' "$target" "$release_sha" "$image"
if [[ -n "$rollback_image" ]]; then
  docker image rm "$rollback_image" >/dev/null 2>&1 || true
  rm -f "$rollback_override_path"
fi
if ((publish_signal_status != 0)); then
  exit "$publish_signal_status"
fi

is_protected_release() {
  local candidate="$1" linked
  for linked in "$current_link" "$previous_link"; do
    if [[ -L "$linked" && "$target_root/$(readlink "$linked")" == "$candidate" ]]; then
      return 0
    fi
  done
  return 1
}

prune_marked_releases() {
  local candidate name marked_count=0
  local -a candidates=()
  while IFS= read -r candidate; do
    candidates+=("$candidate")
  done < <(find "$release_root" -mindepth 1 -maxdepth 1 -type d -print0 \
    | xargs -0 -r ls -1dt 2>/dev/null || true)

  for candidate in "${candidates[@]}"; do
    name="${candidate##*/}"
    [[ "$name" =~ ^[0-9a-f]{40}$ ]] || continue
    [[ -f "$candidate/.shopify-release" ]] || continue
    grep -Fxq "target=$target" "$candidate/.shopify-release" || continue
    grep -Fxq "sha=$name" "$candidate/.shopify-release" || continue
    if is_protected_release "$candidate"; then
      continue
    fi
    marked_count=$((marked_count + 1))
    if ((marked_count > 3)); then
      remove_labeled_image "shopify-clever-$target:$name" "$name"
      rm -rf "$candidate"
      printf 'RELEASE_PRUNED target=%s release=%s\n' "$target" "$name"
    fi
  done
}

prune_orphaned_overrides() {
  local candidate name sha removed=0
  while IFS= read -r candidate; do
    ((removed < 10)) || break
    name="${candidate##*/}"
    [[ "$name" =~ ^[0-9a-f]{40}\.override\.yml$ ]] || continue
    sha="${name%.override.yml}"
    [[ ! -d "$release_root/$sha" ]] || continue
    if [[ -L "$current_link" && "$(readlink "$current_link")" == "releases/$sha" ]]; then
      continue
    fi
    if [[ -L "$previous_link" && "$(readlink "$previous_link")" == "releases/$sha" ]]; then
      continue
    fi
    rm -f "$candidate"
    removed=$((removed + 1))
    printf 'ORPHAN_OVERRIDE_PRUNED target=%s path=%s\n' "$target" "$candidate"
  done < <(find "$runtime_root" -mindepth 1 -maxdepth 1 -type f -name '*.override.yml' -mmin +10080 -print 2>/dev/null | sort)
}

prune_orphaned_labeled_images() {
  local reference sha removed=0
  while IFS= read -r reference; do
    ((removed < 5)) || break
    [[ "$reference" =~ ^shopify-clever-$target:([0-9a-f]{40})$ ]] || continue
    sha="${BASH_REMATCH[1]}"
    [[ ! -d "$release_root/$sha" ]] || continue
    remove_labeled_image "$reference" "$sha"
    removed=$((removed + 1))
  done < <(docker image ls \
    --filter "label=ai.cleversystem.shopify-release=true" \
    --filter "label=ai.cleversystem.shopify-target=$target" \
    --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | sort || true)
}

prune_marked_backups() {
  local candidate marked_count=0
  local -a candidates=()
  while IFS= read -r candidate; do
    candidates+=("$candidate")
  done < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -print0 \
    | xargs -0 -r ls -1dt 2>/dev/null || true)
  for candidate in "${candidates[@]}"; do
    [[ -f "$candidate/.shopify-backup" ]] || continue
    grep -Fxq "target=$target" "$candidate/.shopify-backup" || continue
    marked_count=$((marked_count + 1))
    if ((marked_count > 10)); then
      rm -rf "$candidate"
      printf 'BACKUP_PRUNED target=%s path=%s\n' "$target" "$candidate"
    fi
  done
}

prune_marked_releases
prune_marked_backups
prune_orphaned_overrides
prune_orphaned_labeled_images
printf 'DEPLOYMENT_COMPLETE target=%s release=%s backup_sha256=%s\n' \
  "$target" "$release_sha" "$backup_sha256"
