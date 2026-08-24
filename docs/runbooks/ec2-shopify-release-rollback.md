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

## Transaction boundary

The deployment holds `${DEPLOY_PATH}/locks/shopify-<target>.lock` while it:

1. validates an immutable release staged under the exact Git commit SHA;
2. builds `shopify-clever-<target>:<commit-sha>` and validates Compose config;
3. stops the live target, checkpoints SQLite WAL, and creates a SQLite `.backup`;
4. records `quick_check`, SHA-256, and file-mode evidence for that backup;
5. runs migration deploy, migration status, and schema drift checks;
6. starts only the exact-SHA image and runs the context-free login smoke;
7. switches `previous` and `current` atomically after the smoke passes; and
8. prunes only old directories carrying valid target/SHA ownership markers.

Targets use separate locks, so K-food and production do not block each other.
Two deployments of the same target serialize even if workflow runs overlap.

## Automatic rollback

Migration, restart, or smoke failure before publication stops the candidate,
restores the verified SQLite backup (including checkpointed WAL data), restarts
the prior exact image/release, and repeats the endpoint smoke. A failed rollback
smoke exits with status `70` so the workflow cannot conceal the recovery failure.
The `current` pointer is never moved before the candidate smoke succeeds.

On the first hardened deployment, the script snapshots the image used by the
legacy container and uses the existing `${DEPLOY_PATH}` Compose file for rollback.
After a successful first deployment, subsequent rollbacks use `current` directly.

Useful workflow evidence strings are `DATABASE_BACKUP_READY`,
`RELEASE_PUBLISHED`, `ROLLBACK_SMOKE`, and `DEPLOYMENT_COMPLETE`. They contain
release and checksum metadata, not env contents or Shopify credentials.
