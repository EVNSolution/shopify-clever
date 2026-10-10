/* eslint-env node */
import assert from "node:assert/strict";
import { unlink, writeFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function loadCell() {
  const bundle = await build({
    entryPoints: ["app/features/delivery/inline-text-cell.jsx"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
  });
  const path = new URL("../.inline-text-cell-test.mjs", import.meta.url);
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

const cellProps = (overrides = {}) => ({
  busy: false,
  draft: null,
  editLabel: "Edit Kim name",
  inputLabel: "Driver name",
  itemId: "driver-1",
  label: "Kim",
  maxLength: 80,
  onCancel() {},
  onChange() {},
  onEdit() {},
  onSave() {},
  saveLabel: "Save driver name",
  ...overrides,
});

const longName = "Alexandria Bartholomew Christopherson-Montgomery Wellington Fairchilds";

test("the cell shows the name on one truncating line, with the full name as title and a pencil", async () => {
  const { InlineTextCell } = await loadCell();
  const html = (overrides) => renderToStaticMarkup(createElement(InlineTextCell, cellProps(overrides)));

  const shown = html({ label: "조흥철님" });
  assert.match(shown, /<span class="inline-text-cell__label" title="조흥철님">조흥철님<\/span>/);
  const [pencil = ""] = shown.match(/<button[^>]*>/) ?? [];
  assert.match(pencil, /aria-label="Edit Kim name"/);
  assert.match(pencil, /class="stop-time-cell__edit"/);
  assert.match(pencil, /data-inline-text-edit="driver-1"/);
  assert.match(pencil, /type="button"/);
  assert.doesNotMatch(shown, /<input/);

  // The title carries the whole text, so a name cut short by the column is still readable on hover.
  assert.equal(longName.length, 70);
  assert.match(html({ label: longName }), new RegExp(`title="${longName}">${longName}</span>`));
});

test("the pencil opens the editor, and the editor is a required text field of at most 80 characters", async () => {
  const { InlineTextCell } = await loadCell();
  let opened = 0;
  const [pencil] = findAll(InlineTextCell(cellProps({ onEdit: () => { opened += 1; } })), "button");
  pencil.props.onClick();
  assert.equal(opened, 1);

  const html = renderToStaticMarkup(createElement(InlineTextCell, cellProps({ draft: "Kim Minsu" })));
  const [field = ""] = html.match(/<input[^>]*>/) ?? [];
  assert.match(field, /aria-label="Driver name"/);
  assert.match(field, /type="text"/);
  assert.match(field, /maxLength="80"/);
  assert.match(field, /required=""/);
  assert.match(field, /value="Kim Minsu"/);
  assert.match(field, /class="stop-time-cell__input inline-text-cell__input"/);
  assert.match(html, /aria-label="Save driver name"/);
  assert.match(html, /aria-label="Cancel"/);
  assert.doesNotMatch(html, /Edit Kim name/);
  assert.doesNotMatch(html, /inline-text-cell__label/);
});

test("Enter and the check button save a valid name, Escape and the cross button cancel", async () => {
  const { InlineTextCell } = await loadCell();
  const events = [];
  const props = (draft, overrides) => cellProps({
    draft,
    onCancel: () => events.push("cancel"),
    onChange: (value) => events.push(`change:${value}`),
    onSave: () => events.push("save"),
    ...overrides,
  });
  const parts = (draft, overrides) => {
    const tree = InlineTextCell(props(draft, overrides));
    const [input] = findAll(tree, "input");
    const buttons = findAll(tree, "button");
    return {
      cancel: buttons.find((button) => button.props["aria-label"] === "Cancel"),
      input,
      save: buttons.find((button) => button.props["aria-label"] === "Save driver name"),
    };
  };
  const key = (name, extra = {}) => ({ key: name, preventDefault: () => events.push(`prevent:${name}`), ...extra });

  const valid = parts("Kim Minsu");
  valid.input.props.onChange({ target: { value: "  Kim  " } });
  valid.input.props.onKeyDown(key("Enter"));
  valid.save.props.onClick();
  valid.input.props.onKeyDown(key("Escape"));
  valid.cancel.props.onClick();
  // The text goes to the page as typed; the page trims it when it saves.
  assert.deepEqual(events, ["change:  Kim  ", "prevent:Enter", "save", "save", "cancel", "cancel"]);
  assert.equal(valid.save.props.disabled, false);
  assert.equal(valid.input.props["aria-invalid"], false);
});

test("an empty, blank or too long name cannot be saved", async () => {
  const { InlineTextCell } = await loadCell();
  const events = [];
  const parts = (draft, overrides) => {
    const tree = InlineTextCell(cellProps({ draft, onSave: () => events.push("save"), ...overrides }));
    return { input: findAll(tree, "input")[0], save: findAll(tree, "button").find((button) => button.props["aria-label"] === "Save driver name") };
  };

  for (const draft of ["", "   ", "\t"]) {
    const invalid = parts(draft);
    invalid.input.props.onKeyDown({ key: "Enter", preventDefault() {} });
    assert.equal(invalid.save.props.disabled, true, `${JSON.stringify(draft)} cannot be saved`);
    assert.equal(invalid.input.props["aria-invalid"], true);
  }
  const tooLong = parts("x".repeat(81));
  tooLong.input.props.onKeyDown({ key: "Enter", preventDefault() {} });
  assert.equal(tooLong.save.props.disabled, true);
  assert.equal(tooLong.input.props["aria-invalid"], true);
  assert.deepEqual(events, [], "an invalid name never reaches save");

  // Spaces around the name do not count toward the limit, because the page trims before it saves.
  const limit = parts(` ${"x".repeat(80)} `);
  assert.equal(limit.save.props.disabled, false);
  assert.equal(parts("x".repeat(80)).input.props["aria-invalid"], false);

  // A cell without a limit only requires text.
  assert.equal(parts("y".repeat(200), { maxLength: undefined }).save.props.disabled, false);
});

test("nothing is saved while another save runs, and Enter during IME composition only confirms the syllable", async () => {
  const { InlineTextCell } = await loadCell();
  const events = [];
  const parts = (overrides) => {
    const tree = InlineTextCell(cellProps({
      draft: "김지은",
      onCancel: () => events.push("cancel"),
      onSave: () => events.push("save"),
      ...overrides,
    }));
    return { input: findAll(tree, "input")[0], save: findAll(tree, "button").find((button) => button.props["aria-label"] === "Save driver name") };
  };

  const busy = parts({ busy: true });
  assert.equal(busy.save.props.disabled, true);
  assert.equal(busy.input.props.readOnly, true, "the name cannot change while it is being saved");
  busy.input.props.onKeyDown({ key: "Enter", preventDefault() {} });
  assert.deepEqual(events, [], "Enter does nothing while another action is running");

  const composing = parts();
  composing.input.props.onKeyDown({ key: "Enter", nativeEvent: { isComposing: true }, preventDefault() { events.push("prevent"); } });
  composing.input.props.onKeyDown({ key: "Escape", nativeEvent: { isComposing: true } });
  assert.deepEqual(events, [], "keys that belong to the input method are left alone");

  // Safari reports the Enter that confirms a syllable after the composition ended, with key code 229.
  composing.input.props.onKeyDown({ key: "Enter", keyCode: 229, nativeEvent: { isComposing: false }, preventDefault() { events.push("prevent"); } });
  assert.deepEqual(events, [], "the Enter that confirms a syllable is not a save");

  composing.input.props.onKeyDown({ key: "Enter", keyCode: 13, nativeEvent: { isComposing: false }, preventDefault() {} });
  assert.deepEqual(events, ["save"]);
});

test("keyboard focus goes back to the pencil of the item whose editor closed, unless focus has moved on", async () => {
  const { focusInlineTextPencil } = await loadCell();
  const focused = [];
  const body = { tag: "body" };
  const node = (id) => ({ dataset: { inlineTextEdit: id }, focus: () => focused.push(id) });
  const saved = { document: globalThis.document, window: globalThis.window };
  const withFocusOn = (activeElement) => {
    globalThis.window = { requestAnimationFrame: (callback) => callback() };
    globalThis.document = {
      activeElement,
      body,
      querySelectorAll: (selector) => (selector === "[data-inline-text-edit]" ? [node("driver-1"), node("driver-2")] : []),
    };
  };
  try {
    // The editor that had focus is gone, so focus rests on the page body.
    withFocusOn(body);
    focusInlineTextPencil("driver-2");
    focusInlineTextPencil("missing");
    // Nothing has focus at all.
    withFocusOn(null);
    focusInlineTextPencil("driver-1");
    // The person is already typing in another field, for example the editor of another driver.
    withFocusOn({ tag: "input" });
    focusInlineTextPencil("driver-2");
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
  }
  assert.deepEqual(focused, ["driver-2", "driver-1"]);
});
