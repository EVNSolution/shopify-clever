import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { validateMigrationRiskReview } from "./prisma-migration-risk.mjs";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceSchema = join(appRoot, "prisma", "schema.prisma");
const sourceMigrations = join(appRoot, "prisma", "migrations");
const prismaCli = join(appRoot, "node_modules", "prisma", "build", "index.js");
const tempRoot = await mkdtemp(join(tmpdir(), "clever-prisma-migrations-"));
const tempSchema = join(tempRoot, "prisma", "schema.prisma");
const tempMigrations = join(tempRoot, "prisma", "migrations");
const tempDatabase = join(tempRoot, "data", "dev.sqlite");

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: appRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Prisma command failed (${result.status}): prisma ${args.join(" ")}`,
    );
  }
}

async function readOptionalFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function validateMigrationRiskReviews() {
  const entries = await readdir(sourceMigrations, { withFileTypes: true });
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const migrationDirectory = join(sourceMigrations, entry.name);
    const sql = await readFile(join(migrationDirectory, "migration.sql"), "utf8");
    const reviewText = await readOptionalFile(
      join(migrationDirectory, "risk-review.md"),
    );
    validateMigrationRiskReview({
      migrationName: entry.name,
      sql,
      reviewText,
    });
  }
}

try {
  await validateMigrationRiskReviews();
  await mkdir(dirname(tempSchema), { recursive: true });
  await mkdir(dirname(tempDatabase), { recursive: true });
  await copyFile(sourceSchema, tempSchema);
  await cp(sourceMigrations, tempMigrations, { recursive: true });
  await writeFile(tempDatabase, "", { flag: "wx" });

  runPrisma(["validate", "--schema", tempSchema]);
  runPrisma(["migrate", "deploy", "--schema", tempSchema]);
  runPrisma(["migrate", "status", "--schema", tempSchema]);
  runPrisma([
    "migrate",
    "diff",
    "--from-url",
    `file:${tempDatabase}`,
    "--to-schema-datamodel",
    sourceSchema,
    "--exit-code",
  ]);

  process.stdout.write(
    "Prisma migration replay and schema parity check passed.\n",
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
