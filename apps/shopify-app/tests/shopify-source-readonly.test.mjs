import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import test from "node:test";

const root = process.cwd();
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const forbiddenSourceMutations = [
  "customerCreate",
  "customerDelete",
  "customerUpdate",
  "draftOrderComplete",
  "draftOrderCreate",
  "draftOrderDelete",
  "draftOrderUpdate",
  "orderCancel",
  "orderClose",
  "orderEditBegin",
  "orderEditCommit",
  "orderMarkAsPaid",
  "orderOpen",
  "orderUpdate",
];

test("Shopify order and customer source mutation paths stay absent", () => {
  assert.equal(existsSync(join(root, "scripts/seed-shopify-demo-data.mjs")), false);

  for (const filePath of sourceFiles(join(root, "app"), join(root, "scripts"))) {
    const source = readFileSync(filePath, "utf8");

    for (const operation of forbiddenSourceMutations) {
      assert.doesNotMatch(source, new RegExp(`\\b${operation}\\s*\\(`), filePath);
    }
  }
});

function sourceFiles(...directories) {
  const files = [];

  for (const directory of directories) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...sourceFiles(path));
      } else if (
        sourceExtensions.has(extname(entry.name)) &&
        !entry.name.includes(".test.")
      ) {
        files.push(path);
      }
    }
  }

  return files;
}
