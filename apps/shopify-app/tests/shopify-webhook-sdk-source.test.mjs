import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("clean-install verifier pins Shopify React Router 1.2.1 integrity and reviewed source hashes", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const locked = lock.packages["node_modules/@shopify/shopify-app-react-router"];
  const verifier = readFileSync(join(root, "scripts/verify-shopify-webhook-sdk-source.mjs"), "utf8");

  assert.equal(packageJson.dependencies["@shopify/shopify-app-react-router"], "1.2.1");
  assert.equal(locked.version, "1.2.1");
  assert.equal(locked.integrity, "sha512-37FtkGoHkvXFUsBU/ibhTrlAGoogfq0VodyEckkggi35lrjZfOGX7xKzMWW13QyD6q8bGg/wCBNOW4WANvewEA==");
  assert.match(verifier, /5dfa1fba8890af485576e43c29554aa6b909fbc8c0f22e851f5f67a21df1abda/);
  assert.match(verifier, /651def64ecf84ba756dec8b33c8afa5b99a72373299a1d7637e640a9d0304008/);
  assert.match(verifier, /fetch\(locked\.resolved\)/);
  assert.match(verifier, /createHash\("sha512"\)/);
  assert.match(verifier, /createHash\("sha256"\)/);
});
