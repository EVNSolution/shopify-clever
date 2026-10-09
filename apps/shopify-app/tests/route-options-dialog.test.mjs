import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
// Short failure messages: the sources under test are thousands of lines long.
const has = (source, pattern) => pattern.test(source);
const defaults = {
  deliveryProof: { photoRequired: false, signatureRequired: false },
  tollPolicy: "ALLOW_TOLLS",
};

async function loadComponents() {
  const bundle = await build({
    entryPoints: ["app/features/delivery/route-office-components.jsx"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
  });
  const path = new URL("../.route-office-components-test.mjs", import.meta.url);
  await writeFile(path, bundle.outputFiles[0].text);
  try {
    return await import(path.href);
  } finally {
    await unlink(path);
  }
}

function findAll(node, type, found = []) {
  if (!node || typeof node !== "object") return found;
  if (node.type === type) found.push(node);
  for (const child of [node.props?.children].flat(Infinity)) findAll(child, type, found);
  return found;
}

test("each route option row changes only its own option", async () => {
  const { RouteOptionsFields } = await loadComponents();
  const changes = [];
  const inputs = findAll(
    RouteOptionsFields({ value: defaults, onChange: (next) => changes.push(next) }),
    "input",
  );
  assert.equal(inputs.length, 3);
  for (const input of inputs) input.props.onChange({ target: { checked: true } });
  assert.deepEqual(changes, [
    { ...defaults, deliveryProof: { photoRequired: true, signatureRequired: false } },
    { ...defaults, deliveryProof: { photoRequired: false, signatureRequired: true } },
    { ...defaults, tollPolicy: "AVOID_TOLLS" },
  ]);
  const tolls = { ...defaults, tollPolicy: "AVOID_TOLLS" };
  const [, , toll] = findAll(
    RouteOptionsFields({ value: tolls, onChange: (next) => changes.push(next) }),
    "input",
  );
  assert.equal(toll.props.checked, true);
  toll.props.onChange({ target: { checked: false } });
  assert.deepEqual(changes.at(-1), defaults);
});

test("route options open as a labelled modal popup with a default Done action", async () => {
  const { OfficeDialog, RouteOptionsFields } = await loadComponents();
  const fields = createElement(RouteOptionsFields, { value: defaults, onChange() {} });
  const html = renderToStaticMarkup(createElement(OfficeDialog, { title: "Route options", onClose() {} }, fields));
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  const labelledBy = html.match(/aria-labelledby="([^"]+)"/)[1];
  assert.ok(html.includes(`id="${labelledBy}"`));
  assert.match(html, /<h2[^>]*>Route options<\/h2>/);
  for (const label of ["Require a delivery photo", "Require the customer signature", "Avoid toll roads"])
    assert.ok(html.includes(label), label);
  assert.match(html, />Done<\/button>/);
  assert.doesNotMatch(html, /aria-expanded|aria-controls/);

  const custom = renderToStaticMarkup(
    createElement(OfficeDialog, { title: "Route options", onClose() {}, actions: createElement("button", null, "Save options") }, fields),
  );
  assert.match(custom, />Save options<\/button>/);
  assert.doesNotMatch(custom, />Done<\/button>/);
});

test("Orders keeps the route options trigger outside the Route plan card", () => {
  const source = read("../app/features/orders/orders-page.jsx");
  const cardStart = source.indexOf('className="order-route-plan"');
  const card = source.slice(cardStart, source.indexOf("lower={", cardStart));
  assert.ok(cardStart > 0);
  assert.equal(has(card, /Route options|RouteOptions/), false, "Route plan card still mentions route options");
  const actions = source.slice(source.indexOf("const ordersViewActions ="), source.indexOf("const ordersLayoutNotice ="));
  assert.equal(has(actions, />Route options<\/button>/), true, "top row has no Route options button");
  assert.equal(has(actions, /<OfficeDialog title="Route options"/), true, "top row does not render the popup");
  assert.equal(has(source, /RouteOptionsDisclosure/), false, "inline disclosure is still used");
});

test("Route Detail opens route options from the Edit menu as a popup, not an inline panel", () => {
  const detail = read("../app/routes/app.routes.$routeId.jsx");
  assert.equal(has(detail, /route-options-editor/), false, "Route Detail still wires the inline panel");
  assert.equal(has(detail, /<RouteOptionsEditor /), true, "Route Detail does not render the editor");
  const components = read("../app/features/delivery/route-office-components.jsx");
  const editor = components.slice(
    components.indexOf("export function RouteOptionsEditor"),
    components.indexOf("export function CashAmounts"),
  );
  assert.equal(has(editor, /<OfficeDialog/), true, "editor is not shown in the popup");
  assert.equal(has(editor, /scrollIntoView/), false, "editor still scrolls like an inline panel");
});
