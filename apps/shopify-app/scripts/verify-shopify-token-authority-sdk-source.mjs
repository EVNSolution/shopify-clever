import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const EXPECTED_VERSION = "13.1.0";
// Public package file checksums, not application credentials.
const SOURCE_HASHES = [
  {
    path: "dist/esm/lib/auth/oauth/token-exchange.mjs",
    sha256: "b951edd7d130ed6e940d5e7e0a08b5eda388a836f9674fc096a31255be775917",
  },
  {
    path: "dist/esm/lib/auth/oauth/refresh-token.mjs",
    sha256: "bad0bb8b9a7314d143a876e3e210af03b0a87cc08343c8736065da43b97ff46c",
  },
  {
    path: "dist/esm/lib/auth/oauth/create-session.mjs",
    sha256: "429daa06bad2e8238138fe734ca3cc5cd495b4fca07dcf8722618863fe81cc98",
  },
  {
    path: "dist/esm/runtime/http/index.mjs",
    sha256: "71e47ad14522586bd7e6821cee6e77631919981b08c5da90138e9cf6fff70c20",
  },
];

const root = new URL("../", import.meta.url);
const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
assert.equal(lock.packages["node_modules/@shopify/shopify-api"].version, EXPECTED_VERSION);

for (const { path, sha256 } of SOURCE_HASHES) {
  const source = await readFile(new URL(`node_modules/@shopify/shopify-api/${path}`, root));
  assert.equal(createHash("sha256").update(source).digest("hex"), sha256, path);
}

console.log(`@shopify/shopify-api@${EXPECTED_VERSION} token authority source contract verified`);
