import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const rootSource = readFileSync(join(root, "app/root.jsx"), "utf8");
const globalCssPath = join(root, "app/styles/global.css");

test("root document uses Korean language and project font stylesheet", () => {
  assert.match(rootSource, /<html lang="ko">/);
  assert.match(rootSource, /import globalStyles from "\.\/styles\/global\.css\?url";/);
  assert.match(rootSource, /\{ rel: "stylesheet", href: "\/vendor\/maplibre-gl\.css" \}/);
  assert.doesNotMatch(rootSource, /static\/fonts\/inter/);
});

test("root document does not reference removed public icon assets", () => {
  assert.doesNotMatch(rootSource, /clever-app-icon\.svg/);
  assert.doesNotMatch(rootSource, /rel="icon"/);
});

test("global stylesheet defines Korean-friendly app font stack", () => {
  assert.equal(existsSync(globalCssPath), true);
  const css = readFileSync(globalCssPath, "utf8");

  assert.match(css, /Apple SD Gothic Neo/);
  assert.match(css, /Noto Sans KR/);
  assert.match(css, /Malgun Gothic/);
  assert.match(css, /--p-font-family-sans/);
  assert.match(css, /body,\s*button,\s*input,\s*textarea,\s*select/);
});
