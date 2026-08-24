import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PACKAGE = "@shopify/shopify-app-react-router";
const VERSION = "1.2.1";
const EXPECTED_INTEGRITY = "sha512-37FtkGoHkvXFUsBU/ibhTrlAGoogfq0VodyEckkggi35lrjZfOGX7xKzMWW13QyD6q8bGg/wCBNOW4WANvewEA==";
const SOURCE_HASHES = new Map([
  ["src/server/authenticate/webhooks/authenticate.ts", "5dfa1fba8890af485576e43c29554aa6b909fbc8c0f22e851f5f67a21df1abda"],
  ["src/server/helpers/ensure-offline-token-is-not-expired.ts", "651def64ecf84ba756dec8b33c8afa5b99a72373299a1d7637e640a9d0304008"],
]);

const root = new URL("../", import.meta.url);
const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
const locked = lock.packages[`node_modules/${PACKAGE}`];
assert.equal(locked.version, VERSION);
assert.equal(locked.integrity, EXPECTED_INTEGRITY);

const work = await mkdtemp(join(tmpdir(), "clever-shopify-sdk-"));
try {
  const response = await fetch(locked.resolved);
  assert.equal(response.ok, true, `Unable to download ${locked.resolved}: ${response.status}`);
  const tarball = new Uint8Array(await response.arrayBuffer());
  const actualIntegrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  assert.equal(actualIntegrity, EXPECTED_INTEGRITY);
  const archive = join(work, "package.tgz");
  await writeFile(archive, tarball);
  const tar = spawnSync("tar", ["-xzf", archive, "-C", work], { encoding: "utf8" });
  assert.equal(tar.status, 0, tar.stderr);

  for (const [path, expected] of SOURCE_HASHES) {
    const source = await readFile(join(work, "package", path));
    assert.equal(createHash("sha256").update(source).digest("hex"), expected, path);
  }
  console.log(`${PACKAGE}@${VERSION} lock integrity and source hashes verified`);
} finally {
  await rm(work, { force: true, recursive: true });
}
