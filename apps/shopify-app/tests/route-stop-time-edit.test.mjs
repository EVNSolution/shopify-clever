/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { STOP_TIME_MAX_MINUTES, readStopTimeMinutes } from "../app/features/delivery/route-helpers.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

async function loadCell() {
  const bundle = await build({
    entryPoints: ["app/features/delivery/route-stop-time-cell.jsx"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
  });
  const path = new URL("../.route-stop-time-cell-test.mjs", import.meta.url);
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
  canEdit: true,
  draft: null,
  label: "5 min",
  onCancel() {},
  onChange() {},
  onEdit() {},
  onSave() {},
  ...overrides,
});

test("Stop time accepts whole minutes from 0 to a day and nothing else", () => {
  assert.equal(STOP_TIME_MAX_MINUTES, 1440);
  assert.equal(readStopTimeMinutes("0"), 0);
  assert.equal(readStopTimeMinutes(" 15 "), 15);
  assert.equal(readStopTimeMinutes("007"), 7);
  assert.equal(readStopTimeMinutes(1440), 1440);
  for (const bad of ["", " ", "abc", "-1", "1.5", "1441", "1e2", "٣", "+5", null, undefined, 5.5, Number.NaN]) {
    assert.equal(readStopTimeMinutes(bad), null, `${String(bad)} must be rejected`);
  }
});

test("the Stop time cell shows a pencil only when the stop can be edited", async () => {
  const { StopTimeCell } = await loadCell();
  const html = (overrides) => renderToStaticMarkup(createElement(StopTimeCell, cellProps(overrides)));

  const editable = html();
  assert.match(editable, />5 min</);
  assert.match(editable, /<button[^>]*aria-label="Edit stop time"[^>]*class="stop-time-cell__edit"/);

  const locked = html({ canEdit: false });
  assert.match(locked, />5 min</);
  assert.doesNotMatch(locked, /<button/);
  assert.doesNotMatch(html({ canEdit: false, draft: "7" }), /<input/);
});

test("the pencil opens the editor and the editor is a whole-minute number field", async () => {
  const { StopTimeCell } = await loadCell();
  let opened = 0;
  const [pencil] = findAll(StopTimeCell(cellProps({ onEdit: () => { opened += 1; } })), "button");
  pencil.props.onClick();
  assert.equal(opened, 1);

  const html = renderToStaticMarkup(createElement(StopTimeCell, cellProps({ draft: "7" })));
  assert.match(html, /<input[^>]*aria-label="Stop time in minutes"/);
  assert.match(html, /type="number"/);
  assert.match(html, /min="0"/);
  assert.match(html, /max="1440"/);
  assert.match(html, /step="1"/);
  assert.match(html, /value="7"/);
  assert.doesNotMatch(html, /aria-label="Edit stop time"/);
});

test("Enter and the check button save a valid value, Escape and the cross button cancel", async () => {
  const { StopTimeCell } = await loadCell();
  const events = [];
  const props = (draft, overrides) => cellProps({
    draft,
    onCancel: () => events.push("cancel"),
    onChange: (value) => events.push(`change:${value}`),
    onSave: () => events.push("save"),
    ...overrides,
  });
  const parts = (draft, overrides) => {
    const tree = StopTimeCell(props(draft, overrides));
    const [input] = findAll(tree, "input");
    const buttons = findAll(tree, "button");
    return { input, save: buttons.find((button) => button.props["aria-label"] === "Save stop time"), cancel: buttons.find((button) => button.props["aria-label"] === "Cancel") };
  };
  const key = (name) => ({ key: name, preventDefault: () => events.push(`prevent:${name}`) });

  const valid = parts("12");
  valid.input.props.onChange({ target: { value: "9" } });
  valid.input.props.onKeyDown(key("Enter"));
  valid.save.props.onClick();
  valid.input.props.onKeyDown(key("Escape"));
  valid.cancel.props.onClick();
  assert.deepEqual(events, ["change:9", "prevent:Enter", "save", "save", "cancel", "cancel"]);
  assert.equal(valid.save.props.disabled, false);

  events.length = 0;
  for (const draft of ["", "abc", "1441", "2.5"]) {
    const invalid = parts(draft);
    invalid.input.props.onKeyDown(key("Enter"));
    assert.equal(invalid.save.props.disabled, true, `${draft} cannot be saved`);
    assert.equal(invalid.input.props["aria-invalid"], true);
  }
  assert.ok(!events.includes("save"), "an invalid value never reaches save");

  const busy = parts("12", { busy: true });
  assert.equal(busy.save.props.disabled, true);
  assert.equal(busy.input.props.readOnly, true, "the value cannot change while it is being saved");
  events.length = 0;
  busy.input.props.onKeyDown(key("Enter"));
  assert.ok(!events.includes("save"), "Enter does nothing while another action is running");
});

test("the cell can name its subject and save an empty value, and keeps the Routes wording by default", async () => {
  const { StopTimeCell } = await loadCell();
  const html = (overrides) => renderToStaticMarkup(createElement(StopTimeCell, cellProps(overrides)));

  const labelled = html({ orderLabel: "Kim", subject: "average stop time" });
  assert.match(labelled, /aria-label="Edit average stop time for Kim"/);
  assert.match(labelled, /title="Edit average stop time"/);
  const editing = html({ allowEmpty: true, draft: "", orderLabel: "Kim", subject: "average stop time" });
  assert.match(editing, /aria-label="Average stop time in minutes for Kim"/);
  assert.match(editing, /aria-label="Save average stop time"/);
  assert.match(editing, /title="Whole minutes, 0 to 1440; leave empty to remove it"/);

  assert.match(html(), /aria-label="Edit stop time"/);
  assert.match(html({ draft: "7" }), /aria-label="Stop time in minutes"/);
  assert.match(html({ draft: "7" }), /aria-label="Save stop time"/);
  assert.doesNotMatch(html({ draft: "7" }), /leave empty/);

  const parts = (overrides) => {
    const tree = StopTimeCell(cellProps(overrides));
    return { input: findAll(tree, "input")[0], save: findAll(tree, "button").find((button) => button.props["aria-label"].startsWith("Save")) };
  };
  assert.equal(parts({ allowEmpty: true, draft: "" }).save.props.disabled, false, "an empty value can be saved when it removes the time");
  assert.equal(parts({ allowEmpty: true, draft: "" }).input.props["aria-invalid"], false);
  assert.equal(parts({ draft: "" }).save.props.disabled, true, "an empty value is still invalid for a stop");
  assert.equal(parts({ allowEmpty: true, draft: "abc" }).save.props.disabled, true);
  assert.equal(parts({ allowEmpty: true, draft: "1441" }).save.props.disabled, true);
});

function loadAction(calls) {
  const source = read("../app/features/delivery/route-detail.server.js");
  const start = source.indexOf("export const routeDetailAction = ");
  const end = source.indexOf("\nexport async function refreshRouteOrders", start);
  const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  return vm.runInNewContext(`(${source.slice(start + "export const routeDetailAction = ".length, end).trim().replace(/;$/, "")})`, {
    authenticate: { admin: async () => ({ admin: {}, session: { shop: "fixture.myshopify.com" } }) },
    cleanRoutePathParam: text,
    logRouteDetailPerformance() {},
    readStopTimeMinutes,
    STOP_TIME_MAX_MINUTES,
    textOrUndefined: text,
    updateDeliveryRoutePlanStop: async (_request, routePlanId, deliveryStopId, payload) => {
      calls.push({ deliveryStopId, payload, routePlanId });
      return { routePlan: { id: routePlanId }, stop: null, errors: [] };
    },
  });
}

const submit = (action, fields) => {
  const form = new FormData();
  form.set("_intent", "updateRouteStopTime");
  form.set("shopifySessionToken", "fixture");
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return action({ params: { routeId: "route-1" }, request: new Request("https://fixture.invalid", { method: "POST", body: form }) });
};

test("saving a Stop time writes only the Stop time of that stop", async () => {
  const calls = [];
  const action = loadAction(calls);

  const result = await submit(action, { deliveryStopId: "stop-1", serviceMinutes: " 12 " });

  // The action runs in its own vm realm, so compare plain JSON instead of objects with another prototype.
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ deliveryStopId: "stop-1", payload: { serviceMinutes: 12 }, routePlanId: "route-1" }]);
  assert.deepEqual(result.errors, []);
});

test("an invalid Stop time never reaches the delivery API", async () => {
  const calls = [];
  const action = loadAction(calls);

  for (const serviceMinutes of ["", "abc", "-3", "2.5", "1441"]) {
    const result = await submit(action, { deliveryStopId: "stop-1", serviceMinutes });
    assert.equal(result.errors.length, 1, `${serviceMinutes} is rejected`);
    assert.match(result.errors[0].message, /whole minutes/i);
  }
  const missing = await submit(action, { deliveryStopId: "stop-1" });
  assert.equal(missing.errors.length, 1);
  assert.deepEqual(calls, []);
});

test("Route Detail wires the pencil to Ready single routes and keeps the Tracking table read-only", () => {
  const page = read("../app/routes/app.routes.$routeId.jsx");
  const cssSource = read("../app/styles/global.css");

  assert.match(page, /import \{ StopTimeCell \} from "\.\.\/features\/delivery\/route-stop-time-cell"/);
  assert.match(page, /import \{[^}]*readStopTimeMinutes[^}]*\} from "\.\.\/features\/delivery\/route-helpers"/);
  assert.match(page, /const canEditStopTime = \(row\) => !liveChangeActive && !isRouteGroupDetail && Boolean\(row\?\.deliveryStopId\)\s*&& normalizeRouteExecutionStatus\(getStopRowRouteStatus\(row\)\) === "READY";/);
  assert.match(page, /submitRouteAction\("updateRouteStopTime", \{ deliveryStopId: row\.deliveryStopId, serviceMinutes \}\)/);
  assert.match(page, /\["transitionRouteStop", "updateRouteStop", "updateRouteStopTime", "transitionRouteStops"\]\.includes\(lastRouteActionIntentRef\.current\)/);
  // The editor closes only after the server accepted the value, so a failed save keeps what was typed.
  assert.match(page, /if \(intent === "updateRouteStopTime"\) \{[^}]*setStopTimeDraft\(null\);[^}]*\}\s*revalidator\.revalidate\(\);/);
  assert.doesNotMatch(page, /submitRouteAction\("updateRouteStopTime"[^;]*;\s*setStopTimeDraft\(null\)/);

  const stopsTable = page.slice(page.indexOf('aria-label="Child route order stops"'), page.indexOf('aria-label="Child route tracking stops"'));
  assert.match(stopsTable, /<td className="stop-time-td" style=\{childRouteStopTimeCellStyle\}>\s*<StopTimeCell/);
  assert.match(stopsTable, /canEdit=\{canEditStopTime\(row\)\}/);
  assert.doesNotMatch(stopsTable, />\{row\.stopTime\}</);

  const trackingTable = page.slice(page.indexOf('aria-label="Child route tracking stops"'));
  assert.match(trackingTable, /<td style=\{childRouteOrderCellStyle\}>\{row\.stopTime\}<\/td>/);
  assert.doesNotMatch(trackingTable.slice(0, trackingTable.indexOf("</table>")), /StopTimeCell/);

  assert.match(page, /const childRouteOrderColumnWidths = \[\s*"56px",\s*"104px",\s*"104px",\s*"112px",\s*"190px",\s*"104px",\s*"104px",\s*"104px",\s*"142px"/);

  assert.match(cssSource, /\.stop-time-td \.stop-time-cell__edit \{[^}]*opacity: 0;/);
  assert.match(cssSource, /\.stop-time-td:hover \.stop-time-cell__edit,\s*\.stop-time-cell__edit:focus-visible \{[^}]*opacity: 1;/);
});
