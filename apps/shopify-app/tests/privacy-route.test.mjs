import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const privacyRoutePath = join(root, "app/routes/privacy.jsx");
const privacyPolicyRedirectPath = join(root, "app/routes/privacy-policy.jsx");

test("public privacy route is available without Shopify authentication", () => {
  assert.equal(existsSync(privacyRoutePath), true, "app/routes/privacy.jsx should exist");

  const source = readFileSync(privacyRoutePath, "utf8");
  assert.match(source, /export const meta = \(\) =>/);
  assert.match(source, /Clever Privacy Policy/);
  assert.match(source, /개인정보 처리방침/);
  assert.match(source, /Shopify orders/);
  assert.match(source, /shipping address/);
  assert.match(source, /driver phone numbers/);
  assert.match(source, /customers\/redact/);
  assert.match(source, /shop\/redact/);
  assert.match(source, /hdgim1240@gmail\.com/);
  assert.doesNotMatch(source, /authenticate\.admin|login\(/);
  assert.doesNotMatch(source, /\[[A-Z _]+\]/);
  assert.doesNotMatch(source, /천하운수|CLEVER_CH/);
});

test("legacy privacy-policy URL redirects to the public privacy page", () => {
  assert.equal(existsSync(privacyPolicyRedirectPath), true, "app/routes/privacy-policy.jsx should exist");

  const source = readFileSync(privacyPolicyRedirectPath, "utf8");
  assert.match(source, /redirect\("\/privacy"\)/);
});
