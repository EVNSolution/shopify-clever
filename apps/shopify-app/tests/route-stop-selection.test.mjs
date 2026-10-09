/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readRouteStopTransitionBatch } from "../app/features/delivery/route-helpers.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

async function load(entry, name) {
  const bundle = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
  });
  const path = new URL(`../.${name}-test.mjs`, import.meta.url);
  await writeFile(path, bundle.outputFiles[0].text);
  try {
    return await import(path.href);
  } finally {
    await unlink(path);
  }
}
const loadSelection = () => load("app/features/delivery/route-stop-selection.jsx", "route-stop-selection");
const loadCell = () => load("app/features/delivery/route-stop-time-cell.jsx", "route-stop-time-cell-selection");

function findAll(node, predicate, found = []) {
  if (!node || typeof node !== "object") return found;
  if (predicate(node)) found.push(node);
  for (const child of [node.props?.children].flat(Infinity)) findAll(child, predicate, found);
  return found;
}
const ofType = (type) => (node) => node.type === type;
const textOf = (node) => (node && typeof node === "object"
  ? [node.props?.children].flat(Infinity).map(textOf).join("")
  : typeof node === "string" || typeof node === "number" ? String(node) : "");
const buttons = (tree) => findAll(tree, ofType("button"));
const buttonLabelled = (tree, label) => buttons(tree).find((button) => textOf(button).trim() === label);

test("the selection keeps table order, ignores stale keys and says whether all or some are selected", async () => {
  const { getStopSelection } = await loadSelection();
  const rows = [{ rowKey: "r:a" }, { rowKey: "r:b" }, { rowKey: "r:c" }];

  assert.deepEqual(getStopSelection(rows, []), { allSelected: false, rows: [], someSelected: false });

  const some = getStopSelection(rows, ["r:c", "r:a", "r:gone"]);
  assert.deepEqual(some.rows.map((row) => row.rowKey), ["r:a", "r:c"]);
  assert.deepEqual([some.allSelected, some.someSelected], [false, true]);

  const all = getStopSelection(rows, ["r:b", "r:a", "r:c"]);
  assert.deepEqual([all.allSelected, all.someSelected], [true, true]);
  assert.deepEqual(getStopSelection([], ["r:a"]), { allSelected: false, rows: [], someSelected: false });
  assert.deepEqual(getStopSelection(undefined, undefined), { allSelected: false, rows: [], someSelected: false });
});

test("each stop has a checkbox named after its order and the header one shows a dash for a partial selection", async () => {
  const { StopSelectAllCheckbox, StopSelectCheckbox } = await loadSelection();
  const changes = [];

  const [row] = findAll(StopSelectCheckbox({ checked: true, label: "Select #2330", onChange: (value) => changes.push(value) }), ofType("input"));
  assert.deepEqual([row.props.type, row.props["aria-label"], row.props.checked], ["checkbox", "Select #2330", true]);
  row.props.onChange({ target: { checked: false } });
  assert.deepEqual(changes, [false]);

  const header = (props) => findAll(StopSelectAllCheckbox({ allSelected: false, disabled: false, onChange: (value) => changes.push(value), someSelected: false, ...props }), ofType("input"))[0];
  const none = header({});
  assert.deepEqual([none.props["aria-label"], none.props.checked, none.props.disabled], ["Select all stops", false, false]);
  none.props.onChange({ target: { checked: true } });
  assert.equal(changes.at(-1), true);

  const node = {};
  header({ someSelected: true }).ref(node);
  assert.equal(node.indeterminate, true, "some selected shows a dash");
  header({ allSelected: true, someSelected: true }).ref(node);
  assert.equal(node.indeterminate, false, "all selected shows a tick");
  assert.doesNotThrow(() => header({}).ref(null));
  assert.equal(header({ disabled: true }).props.disabled, true);
});

const barProps = (overrides = {}) => {
  const calls = [];
  const record = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    props: {
      allSelected: false,
      canEdit: true,
      canMark: true,
      canRemove: true,
      count: 1,
      editTitle: "Only future stops can be edited.",
      markOptions: [
        { disabled: false, label: "Ready", status: "READY" },
        { disabled: true, label: "In progress", status: "IN_PROGRESS" },
        { disabled: false, label: "Completed", status: "COMPLETED" },
      ],
      markTitle: "Wait for the current action to finish.",
      menu: null,
      onClear: record("clear"),
      onEdit: record("edit"),
      onMark: record("mark"),
      onMenuChange: record("menu"),
      onRemove: record("remove"),
      onSend: record("send"),
      removeTitle: "A started route keeps its stops.",
      sendTargets: [{ id: "route-2", title: "Route 2" }],
      sendTitle: "No other route can take these stops.",
      ...overrides,
    },
  };
};

test("the bar shows Edit stop only for one stop and words Remove by the number selected", async () => {
  const { StopSelectionBar } = await loadSelection();
  const one = StopSelectionBar(barProps().props);
  assert.match(textOf(one), /1 selected/);
  assert.deepEqual(buttons(one).map((button) => textOf(button).trim()).filter(Boolean), ["Edit stop", "Remove stop", "Send to route", "Mark as"]);

  const many = StopSelectionBar(barProps({ count: 3 }).props);
  assert.match(textOf(many), /3 selected/);
  assert.deepEqual(buttons(many).map((button) => textOf(button).trim()).filter(Boolean), ["Remove stops", "Send to route", "Mark as"]);
  assert.equal(findAll(many, (node) => node.props?.role === "toolbar").length, 1);
});

test("a button is disabled with its reason when the row menu would be disabled", async () => {
  const { StopSelectionBar } = await loadSelection();
  const bar = StopSelectionBar(barProps({ canEdit: false, canMark: false, canRemove: false, sendTargets: [] }).props);

  const edit = buttonLabelled(bar, "Edit stop");
  const remove = buttonLabelled(bar, "Remove stop");
  const send = buttonLabelled(bar, "Send to route");
  const mark = buttonLabelled(bar, "Mark as");
  assert.deepEqual([edit.props.disabled, remove.props.disabled, send.props.disabled, mark.props.disabled], [true, true, true, true]);
  assert.deepEqual([edit.props.title, remove.props.title, send.props.title, mark.props.title], [
    "Only future stops can be edited.",
    "A started route keeps its stops.",
    "No other route can take these stops.",
    "Wait for the current action to finish.",
  ]);

  const enabled = StopSelectionBar(barProps().props);
  for (const label of ["Edit stop", "Remove stop", "Send to route", "Mark as"]) {
    const button = buttonLabelled(enabled, label);
    assert.equal(button.props.disabled, false, label);
    assert.equal(button.props.title, undefined, `${label} has no reason to give`);
  }
});

test("Edit, Remove and a single Send target act at once, several targets open a list", async () => {
  const { StopSelectionBar } = await loadSelection();
  const single = barProps();
  const bar = StopSelectionBar(single.props);
  buttonLabelled(bar, "Edit stop").props.onClick();
  buttonLabelled(bar, "Remove stop").props.onClick();
  buttonLabelled(bar, "Send to route").props.onClick();
  assert.deepEqual(single.calls, [["edit"], ["remove"], ["send", { id: "route-2", title: "Route 2" }]]);

  const several = barProps({ sendTargets: [{ id: "route-2", title: "Route 2" }, { id: "route-3", title: "Route 3" }] });
  const closed = StopSelectionBar(several.props);
  assert.equal(buttonLabelled(closed, "Send to route").props["aria-haspopup"], "menu");
  buttonLabelled(closed, "Send to route").props.onClick();
  assert.deepEqual(several.calls, [["menu", "send"]]);
  assert.equal(findAll(closed, (node) => node.props?.role === "menu").length, 0);

  const openProps = barProps({ menu: "send", sendTargets: [{ id: "route-2", title: "Route 2" }, { id: "route-3", title: "Route 3" }] });
  const open = StopSelectionBar(openProps.props);
  assert.equal(buttonLabelled(open, "Send to route").props["aria-expanded"], true);
  const items = findAll(open, (node) => node.props?.role === "menuitem");
  assert.deepEqual(items.map(textOf), ["Route 2", "Route 3"]);
  items[1].props.onClick();
  buttonLabelled(open, "Send to route").props.onClick();
  assert.deepEqual(openProps.calls, [["send", { id: "route-3", title: "Route 3" }], ["menu", null]]);
});

test("Mark as opens the status list and sends the chosen status", async () => {
  const { StopSelectionBar } = await loadSelection();
  const closed = barProps();
  buttonLabelled(StopSelectionBar(closed.props), "Mark as").props.onClick();
  assert.deepEqual(closed.calls, [["menu", "mark"]]);

  const open = barProps({ menu: "mark" });
  const bar = StopSelectionBar(open.props);
  assert.equal(buttonLabelled(bar, "Mark as").props["aria-expanded"], true);
  const items = findAll(bar, (node) => node.props?.role === "menuitem");
  assert.deepEqual(items.map(textOf), ["Ready", "In progress", "Completed"]);
  assert.deepEqual(items.map((item) => item.props.disabled), [false, true, false]);
  items[2].props.onClick();
  assert.deepEqual(open.calls, [["mark", "COMPLETED"]]);
});

test("the leading checkbox clears the selection and Escape closes an open menu", async () => {
  const { StopSelectionBar } = await loadSelection();
  const { calls, props } = barProps({ menu: "mark" });
  const bar = StopSelectionBar(props);

  const [leading] = findAll(bar, ofType("input"));
  assert.deepEqual([leading.props.type, leading.props["aria-label"], leading.props.checked], ["checkbox", "Clear stop selection", false]);
  const node = {};
  leading.ref(node);
  assert.equal(node.indeterminate, true, "some of the stops are selected");
  leading.props.onChange();
  assert.deepEqual(calls, [["clear"]]);

  const toolbar = findAll(bar, (candidate) => candidate.props?.role === "toolbar")[0];
  let prevented = 0;
  toolbar.props.onKeyDown({ key: "Escape", preventDefault: () => { prevented += 1; } });
  toolbar.props.onKeyDown({ key: "a", preventDefault: () => { prevented += 1; } });
  assert.deepEqual(calls.slice(1), [["menu", null]]);
  assert.equal(prevented, 1);

  const idle = barProps();
  findAll(StopSelectionBar(idle.props), (candidate) => candidate.props?.role === "toolbar")[0].props.onKeyDown({ key: "Escape", preventDefault() {} });
  assert.deepEqual(idle.calls, [], "Escape does nothing while no menu is open");

  const all = barProps({ allSelected: true, count: 3 });
  const [allLeading] = findAll(StopSelectionBar(all.props), ofType("input"));
  assert.equal(allLeading.props.checked, true);
});

test("the bar renders as markup with its own labels", async () => {
  const { StopSelectionBar } = await loadSelection();
  const html = renderToStaticMarkup(createElement(StopSelectionBar, barProps({ count: 2, menu: "mark" }).props));

  assert.match(html, /role="toolbar"/);
  assert.match(html, /aria-label="Selected stops"/);
  assert.match(html, /2 selected/);
  assert.match(html, /Remove stops/);
  assert.match(html, /role="menu"/);
});

function loadAction(calls, { failAt } = {}) {
  const source = read("../app/features/delivery/route-detail.server.js");
  const start = source.indexOf("export const routeDetailAction = ");
  const end = source.indexOf("\nexport async function refreshRouteOrders", start);
  const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  return vm.runInNewContext(`(${source.slice(start + "export const routeDetailAction = ".length, end).trim().replace(/;$/, "")})`, {
    authenticate: { admin: async () => ({ admin: {}, session: { shop: "fixture.myshopify.com" } }) },
    cleanRoutePathParam: text,
    logRouteDetailPerformance() {},
    readRouteStopTransitionBatch,
    textOrUndefined: text,
    transitionDeliveryRoutePlanStop: async (_request, routePlanId, deliveryStopId, payload) => {
      calls.push({ deliveryStopId, idempotencyKey: payload.idempotencyKey, routePlanId, status: payload.status });
      if (calls.length === failAt) return { routePlan: null, stop: null, errors: [{ message: "Stop cannot move" }] };
      return { routePlan: { id: routePlanId, calls: calls.length }, stop: { deliveryStopId }, errors: [] };
    },
  });
}
const submitStops = (action, stops) => {
  const form = new FormData();
  form.set("_intent", "transitionRouteStops");
  form.set("shopifySessionToken", "fixture");
  form.set("stops", typeof stops === "string" ? stops : JSON.stringify(stops));
  return action({ params: { routeId: "route-1" }, request: new Request("https://fixture.invalid", { method: "POST", body: form }) });
};
const stopsOf = (...ids) => ids.map((id, index) => ({ deliveryStopId: id, idempotencyKey: `key-${index}`, label: `Order ${index + 1}`, status: "COMPLETED" }));

test("marking several stops applies them one after the other and reports how many changed", async () => {
  const calls = [];
  const result = await submitStops(loadAction(calls), stopsOf("stop-1", "stop-2", "stop-3"));

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { deliveryStopId: "stop-1", idempotencyKey: "key-0", routePlanId: "route-1", status: "COMPLETED" },
    { deliveryStopId: "stop-2", idempotencyKey: "key-1", routePlanId: "route-1", status: "COMPLETED" },
    { deliveryStopId: "stop-3", idempotencyKey: "key-2", routePlanId: "route-1", status: "COMPLETED" },
  ]);
  assert.equal(result.completed, 3);
  assert.equal(result.errors.length, 0, "the action runs in its own vm realm, so count instead of comparing arrays");
  assert.equal(result.routePlan.calls, 3, "the answer carries the last route plan");
});

test("marking stops stops at the first failure and says how far it got", async () => {
  const calls = [];
  const result = await submitStops(loadAction(calls, { failAt: 2 }), stopsOf("stop-1", "stop-2", "stop-3"));

  assert.equal(calls.length, 2, "the third stop is not attempted");
  assert.equal(result.completed, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /1 of 3 stops/);
  assert.match(result.errors[0].message, /Order 2/);
  assert.match(result.errors[0].message, /Stop cannot move/);

  const unnamed = await submitStops(loadAction([], { failAt: 2 }), stopsOf("stop-1", "stop-2").map(({ label, ...entry }) => (void label, entry)));
  assert.match(unnamed.errors[0].message, /stop 2/, "without a label the position is named");
});

test("a bad batch never reaches the delivery API", async () => {
  const bad = {
    "not JSON": "{not json",
    "not a list": JSON.stringify({ deliveryStopId: "stop-1", status: "COMPLETED" }),
    "empty list": [],
    "too many": Array.from({ length: 201 }, (_, index) => ({ deliveryStopId: `stop-${index}`, status: "READY" })),
    "unsupported status": [{ deliveryStopId: "stop-1", status: "CANCELLED" }],
    "missing stop": [{ status: "READY" }],
    "same stop twice": [{ deliveryStopId: "stop-1", status: "READY" }, { deliveryStopId: "stop-1", status: "COMPLETED" }],
  };
  for (const [name, stops] of Object.entries(bad)) {
    const calls = [];
    const result = await submitStops(loadAction(calls), stops);
    assert.equal(result.errors.length, 1, name);
    assert.equal(result.completed, 0, name);
    assert.deepEqual(calls, [], name);
  }
  assert.equal(readRouteStopTransitionBatch([]), null);
  assert.deepEqual(readRouteStopTransitionBatch(JSON.stringify([{ deliveryStopId: " stop-1 ", idempotencyKey: " k ", label: " #2345 ", status: "in_progress" }])), [
    { deliveryStopId: "stop-1", idempotencyKey: "k", label: "#2345", status: "IN_PROGRESS" },
  ]);
});

test("the Stop time pencil is named after its order and the editor can hand focus back", async () => {
  const { StopTimeCell } = await loadCell();
  const base = { busy: false, canEdit: true, label: "5 min", onCancel() {}, onChange() {}, onEdit() {}, onSave() {} };

  const [pencil] = findAll(StopTimeCell({ ...base, draft: null, orderLabel: "#2330", stopId: "stop-1" }), ofType("button"));
  assert.equal(pencil.props["aria-label"], "Edit stop time for #2330");
  assert.equal(pencil.props["data-stop-time-edit"], "stop-1");

  const [plain] = findAll(StopTimeCell({ ...base, draft: null }), ofType("button"));
  assert.equal(plain.props["aria-label"], "Edit stop time", "without an order the label is unchanged");

  const [input] = findAll(StopTimeCell({ ...base, draft: "7", orderLabel: "#2330", stopId: "stop-1" }), ofType("input"));
  assert.equal(input.props["aria-label"], "Stop time in minutes for #2330");
});

const page = read("../app/routes/app.routes.$routeId.jsx");
const css = read("../app/styles/global.css");

test("Route Detail adds the Select column and the bar to the Stops table of a single route only", () => {
  assert.match(page, /import \{[^}]*StopSelectionBar[^}]*\} from "\.\.\/features\/delivery\/route-stop-selection"/);
  assert.match(page, /const routeOrderColumns = isRouteGroupDetail\s*\? \[\{ key: "route", label: "Route" \}, \.\.\.CHILD_ROUTE_ORDER_COLUMNS\]\s*: \[\{ key: "select", label: "" \}, \.\.\.CHILD_ROUTE_ORDER_COLUMNS\];/);
  assert.match(page, /\(isRouteGroupDetail \? \["120px", \.\.\.childRouteOrderColumnWidths\] : \["44px", \.\.\.childRouteOrderColumnWidths\]\)/);

  const stopsTable = page.slice(page.indexOf('aria-label="Child route order stops"'), page.indexOf('aria-label="Child route tracking stops"'));
  assert.match(stopsTable, /<thead style=\{selectedStopRows\.length > 0 \? \{ visibility: "hidden" \} : undefined\}>/);
  assert.match(stopsTable, /column\.key === "select"/);
  assert.match(stopsTable, /<StopSelectAllCheckbox/);
  assert.match(stopsTable, /<StopSelectCheckbox/);
  assert.equal(stopsTable.match(/selectColumn: !isRouteGroupDetail/g)?.length, 2, "Start and End rows keep their cells aligned");

  const trackingTable = page.slice(page.indexOf('aria-label="Child route tracking stops"'));
  assert.doesNotMatch(trackingTable.slice(0, trackingTable.indexOf("</table>")), /StopSelect/);

  const endpointRow = page.slice(page.indexOf("function renderRouteEndpointOrderRow("), page.indexOf("function renderRouteEndpointTrackingRow("));
  assert.match(endpointRow, /selectColumn \? <td style=\{childRouteSelectCellStyle\} \/> : null/);
});

test("the bulk handlers sit after the row menu handlers that other tests slice, and reuse their rules", () => {
  const anchor = page.indexOf("const handleOpenChildStopSendTargets = ");
  for (const name of [
    "const handleToggleStopSelected = ",
    "const handleToggleAllStopsSelected = ",
    "const removeChildStopsFromGroup = ",
    "const handleRemoveSelectedStops = ",
    "const handleSendSelectedStopsToRoute = ",
    "const handleMarkSelectedStops = ",
    "const handleEditSelectedStop = ",
  ]) {
    assert.ok(page.indexOf(name) > anchor, `${name} comes after handleOpenChildStopSendTargets`);
  }
  assert.match(page, /const canRemoveSelectedStops = selectedStopRows\.length > 0 && !routeMembershipChangeIsInProgress && selectedStopRows\.every\(canRemoveChildStopFromGroup\);/);
  assert.match(page, /const canEditSelectedStop = selectedStopRows\.length === 1 && Boolean\(selectedStopRows\[0\]\.deliveryStopId\) && canEditStopRow\(selectedStopRows\[0\]\);/);
  assert.match(page, /isRouteTimelineStopMoveAllowed\(currentTimelineRouteRow, routeRow\)/);
  assert.match(page, /submitRouteAction\("transitionRouteStops", \{ stops: JSON\.stringify\(/);
  assert.match(page, /\["transitionRouteStop", "updateRouteStop", "updateRouteStopTime", "transitionRouteStops"\]\.includes\(lastRouteActionIntentRef\.current\)/);
  assert.match(page, /intent === "transitionRouteStops" && routeActionFetcher\.data\?\.completed > 0/);
  assert.match(page, /data-stop-time-edit/, "the page can find the pencil to hand focus back");
  assert.match(page, /orderLabel=\{row\.order\}/);
});

test("the bar is exactly as tall as the header row it covers", () => {
  const barHeight = Number(css.match(/\.stop-selection-bar \{[^}]*height: (\d+)px;/)?.[1]);
  const headerHeight = Number(page.match(/const childRouteSelectHeaderCellStyle = \{[^}]*height: "(\d+)px"/)?.[1]);
  const headerBorder = Number(page.match(/const routesDetailHeaderCellStyle = \{[^}]*borderBottomWidth: "(\d+)px"/)?.[1]);

  assert.equal(barHeight, 36);
  assert.equal(headerHeight + headerBorder, barHeight, "the cell height does not include its bottom border");
});

test("the bar and the checkboxes are styled in the shared stylesheet", () => {
  assert.match(css, /\.stop-selection-bar \{[^}]*position: absolute;/);
  assert.match(css, /\.stop-selection-bar__menu \{[^}]*position: absolute;/);
  assert.match(css, /\.stop-selection-bar__button:disabled \{/);
  assert.match(css, /\.stop-select-checkbox \{/);
});
