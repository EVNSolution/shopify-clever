import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const routesDir = path.resolve("app/routes");

function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath);
    return entry.isFile() && /\.[jt]sx?$/.test(entry.name) ? [fullPath] : [];
  });
}

test("routes that authenticate admin requests export Shopify boundary helpers", () => {
  const authenticatedRouteFiles = walkFiles(routesDir).filter((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    return source.includes("authenticate.admin(");
  });

  assert.ok(authenticatedRouteFiles.length > 0, "expected authenticated route coverage");

  const missingBoundaryExports = authenticatedRouteFiles
    .map((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      const relative = path.relative(process.cwd(), filePath);
      const missing = [];

      if (!/useRouteError/.test(source)) missing.push("useRouteError");
      if (!/boundary\.error\(useRouteError\(\)\)/.test(source)) {
        missing.push("ErrorBoundary");
      }
      if (!/boundary\.headers\(headersArgs\)/.test(source)) missing.push("headers");

      return missing.length > 0 ? `${relative}: ${missing.join(", ")}` : null;
    })
    .filter(Boolean);

  assert.deepEqual(missingBoundaryExports, []);
});
