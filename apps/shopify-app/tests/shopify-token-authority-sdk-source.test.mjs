import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("token authority verifier pins the installed Shopify API source contract", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const verifier = readFileSync(new URL("../scripts/verify-shopify-token-authority-sdk-source.mjs", import.meta.url), "utf8");
  const shopifyServer = readFileSync(new URL("../app/shopify.server.js", import.meta.url), "utf8");
  const sessionStorage = readFileSync(new URL("../app/shopify-token-authority-session-storage.server.js", import.meta.url), "utf8");
  assert.equal(packageJson.scripts["verify:token-authority-sdk-source"], "node scripts/verify-shopify-token-authority-sdk-source.mjs");
  assert.match(verifier, /13\.1\.0/);
  assert.match(verifier, /b951edd7d130ed6e940d5e7e0a08b5eda388a836f9674fc096a31255be775917/);
  assert.match(verifier, /bad0bb8b9a7314d143a876e3e210af03b0a87cc08343c8736065da43b97ff46c/);
  assert.match(verifier, /429daa06bad2e8238138fe734ca3cc5cd495b4fca07dcf8722618863fe81cc98/);
  assert.match(verifier, /71e47ad14522586bd7e6821cee6e77631919981b08c5da90138e9cf6fff70c20/);
  assert.match(shopifyServer, /sessionStorage:\s*new TokenAuthorityPrismaSessionStorage\(prisma\)/);
  assert.match(sessionStorage, /markLegacyOfflineSessionForTokenAuthority\(await super\.loadSession\(id\)\)/);
});
