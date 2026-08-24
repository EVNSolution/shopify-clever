# EC2 Shopify release and rollback

The manual `Deploy Shopify app` workflow publishes one target at a time. Each
target has its own remote lock, release history, backups, and runtime pointers:

```text
${DEPLOY_PATH}/targets/<target>/
  current -> releases/<commit-sha>
  previous -> releases/<prior-commit-sha>
  releases/<commit-sha>/
  backups/<timestamp>-<commit-sha>-<run-id>/
  runtime/<commit-sha>.override.yml
```

The release directory contains no runtime env file. Its `infra/env` path is a
symlink to the persistent `${DEPLOY_PATH}/infra/env` directory, which is excluded
from source synchronization.

`DEPLOY_PATH` is fail-closed to the approved `/srv/shopify-clever` root. The
workflow validates it before remote directory creation or rsync, and the remote
script independently derives and checks the target/SHA/run staging path.

## Transaction boundary

The deployment holds `${DEPLOY_PATH}/locks/shopify-<target>.lock` while it:

1. validates an immutable release staged under the exact Git commit SHA;
2. pins the running container image ID to a run-unique rollback tag and validates
   that rollback Compose snapshot before building anything;
3. checks free disk for a bounded image budget plus three database copies;
4. builds `shopify-clever-<target>:<commit-sha>` and validates Compose config;
5. stops the live target, checkpoints SQLite WAL, and creates a SQLite `.backup`;
6. records `quick_check`, SHA-256, and file-mode evidence for that backup;
7. runs migration deploy, migration status, and schema drift checks;
8. starts only the exact-SHA image and runs the context-free login smoke;
9. restores and verifies the prior release's exact-SHA image tag from the pinned
   running image ID;
10. switches `previous` and `current` atomically after the smoke passes; and
11. performs bounded cleanup of aged marked staging data, orphaned overrides,
    and unused labeled images, never current, previous, or running images.

If a live container cannot be mapped to a validated legacy or immutable-release
Compose snapshot, deployment stops before build, stop, or database mutation.
Build, image-inspection, and post-build disk failures clean only candidate and
rollback artifacts; live recovery is armed immediately before the stop attempt.

Redispatching the SHA already referenced by `current` is a verified no-op: the
running image ID must still match the exact-SHA tag and the live smoke must pass.
It does not rebuild, stop, migrate, or rotate release pointers.

Targets use separate locks, so K-food and production do not block each other.
Two deployments of the same target serialize even if workflow runs overlap.

## Automatic rollback

Migration, restart, or smoke failure before publication stops the candidate,
restores the verified SQLite backup (including checkpointed WAL data), restarts
the prior exact image/release, and repeats the endpoint smoke. A failed rollback
smoke exits with status `70` so the workflow cannot conceal the recovery failure.
The `current` pointer is never moved before the candidate smoke succeeds.
Signals received while committing `previous` and `current` are deferred until
both pointers and the published state agree, avoiding a half-published rollback.
The script selects GNU `mv -T` or BSD `mv -h` before live mutation, rejects
non-symlink pointer paths, performs no cross-flavor fallback after a rename
failure, and verifies the exact `readlink` value before publication.
If a rename succeeds but pointer verification fails, the original `current` and
`previous` snapshot is restored and verified before DB/runtime rollback. If that
pointer restoration cannot be proven, the script republishes and verifies the
candidate-success pointer set (`previous` = prior `current`, then `current` =
candidate) before fail-stopping without pruning or rolling back its DB/runtime.

On the first hardened deployment, the script snapshots the image used by the
legacy container and uses the existing `${DEPLOY_PATH}` Compose file for rollback.
After a successful first deployment, subsequent rollbacks use `current` directly.

Useful workflow evidence strings are `DATABASE_BACKUP_READY`,
`RELEASE_PUBLISHED`, `ROLLBACK_SMOKE`, and `DEPLOYMENT_COMPLETE`. They contain
release and checksum metadata, not env contents or Shopify credentials.
