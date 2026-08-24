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

[[ "$deploy_path" == /* && "$deploy_path" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "unsafe deploy path"
[[ "$deploy_path" != *'/../'* && "$deploy_path" != */.. ]] || fail "unsafe deploy path traversal"
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

case "$incoming_path" in
  "$target_root"/incoming/*) ;;
  *) fail "incoming path is outside the target staging root" ;;
esac
[[ "$incoming_path" == /* && "$incoming_path" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "unsafe incoming path"
[[ "$incoming_path" != *'/../'* && "$incoming_path" != */.. ]] || fail "unsafe incoming path traversal"
[[ -d "$incoming_path" ]] || fail "incoming release does not exist"
[[ ! -L "$incoming_path" ]] || fail "incoming release must not be a symlink"
[[ -f "$incoming_path/$compose_file" ]] || fail "staged compose file is missing"
[[ -f "$incoming_path/apps/shopify-app/Dockerfile" ]] || fail "staged Shopify Dockerfile is missing"
[[ -f "$deploy_path/$env_file" ]] || fail "shared runtime env file is missing"
[[ "$smoke_attempts" =~ ^[1-9][0-9]?$ ]] || fail "invalid smoke attempt count"
[[ "$smoke_delay_seconds" =~ ^[0-9]{1,2}$ ]] || fail "invalid smoke delay"

mkdir -p "$lock_root" "$release_root" "$runtime_root" "$backup_root"
exec 9>"$lock_root/shopify-$target.lock"
flock 9
printf 'LOCK_ACQUIRED target=%s release=%s\n' "$target" "$release_sha"

if [[ -e "$release_path" ]]; then
  [[ ! -L "$release_path" ]] || fail "existing release must not be a symlink"
  [[ -f "$release_marker" ]] || fail "existing release is missing its ownership marker"
  grep -Fxq "target=$target" "$release_marker" || fail "existing release target marker mismatch"
  grep -Fxq "sha=$release_sha" "$release_marker" || fail "existing release SHA marker mismatch"
  rm -rf "$incoming_path"
else
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
docker build \
  --label "ai.cleversystem.shopify-release=true" \
  --label "ai.cleversystem.shopify-target=$target" \
  --label "org.opencontainers.image.revision=$release_sha" \
  --tag "$image" \
  "$release_path/apps/shopify-app"

old_current_target=''
old_release_path=''
old_override_path=''
rollback_compose_file=''
rollback_override_path=''
rollback_image=''
legacy_container=''
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
  rollback_override_path="$old_override_path"
else
  rollback_compose_file="$deploy_path/$compose_file"
  [[ -f "$rollback_compose_file" ]] || rollback_compose_file=''
fi

legacy_container="$("${compose[@]}" ps -q "$service" | head -n 1)"
if [[ -n "$legacy_container" && -z "$rollback_override_path" ]]; then
  rollback_image="shopify-clever-$target:rollback-$run_id"
  legacy_image_id="$(docker inspect --format '{{.Image}}' "$legacy_container")"
  [[ -n "$legacy_image_id" ]] || fail "could not resolve legacy container image"
  docker image tag "$legacy_image_id" "$rollback_image"
  rollback_override_path="$runtime_root/rollback-$run_id.override.yml"
  cat > "$rollback_override_path" <<EOF
services:
  $service:
    image: $rollback_image
    build: null
EOF
fi

stopped=0
backup_ready=0
published=0
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

rollback() {
  local rollback_compose=()
  printf 'ROLLBACK_STARTED target=%s release=%s\n' "$target" "$release_sha" >&2
  "${compose[@]}" stop "$service" >/dev/null 2>&1 || true
  restore_database
  if [[ -n "$legacy_container" && -n "$rollback_compose_file" && -n "$rollback_override_path" ]]; then
    rollback_compose=(docker compose -f "$rollback_compose_file" -f "$rollback_override_path")
    "${rollback_compose[@]}" config --quiet
    "${rollback_compose[@]}" up -d --no-build "$service"
    if smoke; then
      printf 'ROLLBACK_SMOKE=passed target=%s\n' "$target"
    else
      printf 'ROLLBACK_SMOKE=failed target=%s\n' "$target" >&2
      return 1
    fi
  elif [[ -n "$legacy_container" ]]; then
    printf 'ROLLBACK_SMOKE=failed reason=missing_legacy_runtime target=%s\n' "$target" >&2
    return 1
  else
    printf 'ROLLBACK_SMOKE=skipped_no_previous_service target=%s\n' "$target"
  fi
  printf 'ROLLBACK_COMPLETED target=%s\n' "$target"
}

on_exit() {
  local status=$?
  trap - EXIT
  if ((status != 0 && published == 0 && (stopped == 1 || backup_ready == 1))); then
    if ! rollback; then
      printf 'ROLLBACK_FAILED original_status=%s target=%s release=%s\n' \
        "$status" "$target" "$release_sha" >&2
      exit 70
    fi
  fi
  [[ -d "$incoming_path" ]] && rm -rf "$incoming_path"
  exit "$status"
}
trap on_exit EXIT

sudo mkdir -p "$(dirname "$sqlite_path")"
sudo touch "$sqlite_path"
sudo chown "$(id -u):$(id -g)" "$sqlite_path"
chmod 600 "$sqlite_path"
[[ -r "$sqlite_path" && -w "$sqlite_path" ]] || fail "SQLite database is not readable and writable"

if [[ -n "$legacy_container" ]]; then
  "${compose[@]}" stop "$service"
  stopped=1
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
printf 'DATABASE_BACKUP_READY sha256=%s mode=%s path=%s\n' \
  "$backup_sha256" "$database_mode" "$backup_dir"

"${compose[@]}" run --rm --no-deps "$service" npm run prisma:migrate:deploy
"${compose[@]}" run --rm --no-deps "$service" npm run prisma:migrate:status
"${compose[@]}" run --rm --no-deps "$service" npm run prisma:migrate:drift
"${compose[@]}" up -d --no-build "$service"
stopped=1
smoke

atomic_link() {
  local link_path="$1" link_target="$2" temporary
  temporary="$link_path.tmp-$run_id"
  rm -f "$temporary"
  ln -s "$link_target" "$temporary"
  mv -Tf "$temporary" "$link_path"
}

if [[ -n "$old_current_target" ]]; then
  atomic_link "$previous_link" "$old_current_target"
fi
atomic_link "$current_link" "releases/$release_sha"
published=1
printf 'RELEASE_PUBLISHED target=%s release=%s image=%s\n' "$target" "$release_sha" "$image"
if [[ -n "$rollback_image" ]]; then
  docker image rm "$rollback_image" >/dev/null 2>&1 || true
  rm -f "$rollback_override_path"
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
      rm -rf "$candidate"
      printf 'RELEASE_PRUNED target=%s release=%s\n' "$target" "$name"
    fi
  done
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
printf 'DEPLOYMENT_COMPLETE target=%s release=%s backup_sha256=%s\n' \
  "$target" "$release_sha" "$backup_sha256"
