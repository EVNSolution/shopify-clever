import assert from "node:assert/strict";
import test from "node:test";

import {
  findMigrationRisks,
  validateMigrationRiskReview,
} from "../scripts/prisma-migration-risk.mjs";

test("Prisma migration risk scan leaves additive table creation alone", () => {
  const sql = `
    CREATE TABLE "Session" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "scope" TEXT
    );
  `;

  assert.deepEqual(findMigrationRisks(sql), []);
});

test("Prisma migration risk scan detects destructive and data-sensitive SQL", () => {
  const sql = `
    -- RedefineTables
    ALTER TABLE "Session" RENAME TO "Session_old";
    ALTER TABLE "Session" ADD COLUMN "tenant" TEXT NOT NULL;
    CREATE UNIQUE INDEX "Session_tenant_key" ON "Session"("tenant");
    DROP TABLE "Session_old";
  `;

  assert.deepEqual(findMigrationRisks(sql), [
    "table-rewrite",
    "rename",
    "required-column-without-default",
    "unique-constraint",
    "drop",
  ]);
});

test("risky Prisma migrations require a concrete production review record", () => {
  const riskySql = 'DROP TABLE "Session";';

  assert.throws(
    () =>
      validateMigrationRiskReview({
        migrationName: "20260819000000_drop_session",
        sql: riskySql,
        reviewText: null,
      }),
    /risk-review\.md/,
  );

  assert.throws(
    () =>
      validateMigrationRiskReview({
        migrationName: "20260819000000_drop_session",
        sql: riskySql,
        reviewText: `
issue: https://github.com/EVNSolution/shopify-clever/issues/194
backup: pending
rehearsal: production-sized copy passed
backward-compatible: yes
recovery: restore the verified snapshot
`,
      }),
    /backup/,
  );

  assert.doesNotThrow(() =>
    validateMigrationRiskReview({
      migrationName: "20260819000000_drop_session",
      sql: riskySql,
      reviewText: `
issue: https://github.com/EVNSolution/shopify-clever/issues/194
backup: EBS snapshot snap-verified-before-release
rehearsal: production-sized copy passed on 2026-08-19
backward-compatible: yes
recovery: restore the snapshot and redeploy the previous SHA
`,
    }),
  );
});
