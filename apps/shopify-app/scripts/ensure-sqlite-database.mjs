import {
  access,
  chmod,
  copyFile,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const dataDirectory = join(appRoot, "data");
const databasePath = join(dataDirectory, "dev.sqlite");
const legacyDatabasePath = join(appRoot, "prisma", "dev.sqlite");
const legacySidecarPaths = ["-journal", "-wal", "-shm"].map(
  (suffix) => `${legacyDatabasePath}${suffix}`,
);

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

await mkdir(dataDirectory, { recursive: true, mode: 0o700 });

if (!(await exists(databasePath))) {
  const legacySidecars = [];
  for (const path of legacySidecarPaths) {
    if (await exists(path)) legacySidecars.push(path);
  }

  if (legacySidecars.length > 0) {
    throw new Error(
      `Legacy SQLite sidecar files must be reconciled before moving the database: ${legacySidecars.join(", ")}`,
    );
  }

  if (await exists(legacyDatabasePath)) {
    await copyFile(
      legacyDatabasePath,
      databasePath,
      constants.COPYFILE_EXCL,
    );
    process.stdout.write("Copied the legacy local SQLite database to data/.\n");
  } else {
    await writeFile(databasePath, "", { flag: "wx", mode: 0o600 });
  }
}

await chmod(databasePath, 0o600);
