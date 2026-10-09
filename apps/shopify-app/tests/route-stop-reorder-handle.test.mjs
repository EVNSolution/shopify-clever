/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyDraftOrderToOrderRows } from "../app/features/delivery/child-route-detail-presentation.js";
import { getRowDropAfterStopId } from "../app/features/delivery/route-draft.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../app/routes/app.routes.$routeId.jsx");
const css = read("../app/styles/global.css");

async function loadSelection() {
  const bundle = await build({
    entryPoints: ["app/features/delivery/route-stop-selection.jsx"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
  });
  const path = new URL("../.route-stop-reorder-handle-test.mjs", import.meta.url);
  await writeFile(path, bundle.outputFiles[0].text);
  try {
    return await import(path.href);
  } finally {
    await unlink(path);
  }
}

function sourceBetween(start, end) {
  const startIndex = page.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source start: ${start}`);
  const endIndex = page.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source end: ${end}`);
  return page.slice(startIndex, endIndex);
}

const rowRect = { height: 40, top: 100 };
const dropAfter = (draggedStopId, rowId, pointerY, orderedStopIds = ["a", "b", "c", "d"]) =>
  getRowDropAfterStopId({ draggedStopId, orderedStopIds, pointerY, rowId, rowRect });

test("the lower half of a row puts the dragged stop after it and the upper half before it", () => {
  assert.equal(dropAfter("b", "c", 130), "c", "lower half of c: after c");
  assert.equal(dropAfter("b", "c", 110), "a", "upper half of c: after the stop that precedes c without b");
  assert.equal(dropAfter("c", "a", 105), "__start__", "upper half of the first row: first place");
  assert.equal(dropAfter("c", "a", 135), "a");
  assert.equal(dropAfter("a", "d", 139), "d", "lower half of the last row: last place");
  assert.equal(dropAfter("b", "c", 120), "c", "the middle line counts as the lower half");
});

test("a pointer over the dragged stop or a row outside the order moves nothing", () => {
  assert.equal(dropAfter("b", "b", 130), undefined);
  assert.equal(dropAfter("b", "gone", 130), undefined);
  assert.equal(dropAfter("b", "c", 130, null), undefined, "no order at all");
  assert.equal(dropAfter("b", "c", 130, []), undefined);
});

test("the stop does not flicker: after it moved down one row, only the upper half of the row above brings it back", () => {
  // d is dragged; the order is a b c d. Crossing the middle of c moves it after c, so a row never swaps twice in one pass.
  assert.equal(dropAfter("d", "c", 125), "c", "d is already after c: the drop point stays after c");
  assert.equal(dropAfter("d", "c", 115), "b", "the upper half of c puts d before c");
  assert.equal(dropAfter("d", "b", 130), "b", "the lower half of b puts d after b, that is before c");
});

const savedRows = ["a", "b", "c", "d"].map((id, index) => ({
  driveTime: `${index + 5} min / 2 km`, expectedArrival: `1${index}:00`, id, rowKey: `route:${id}`, stop: index + 1,
}));
const shown = (rows) => rows.map((row) => `${row.stop}${row.id}:${row.expectedArrival}|${row.driveTime}`);

test("the table lists the stops in the unsaved order and numbers them again", () => {
  const rows = applyDraftOrderToOrderRows(savedRows, ["c", "a", "b", "d"]);

  assert.deepEqual(rows.map((row) => [row.stop, row.id, row.rowKey]), [[1, "c", "route:c"], [2, "a", "route:a"], [3, "b", "route:b"], [4, "d", "route:d"]]);
  assert.deepEqual(savedRows.map((row) => row.id), ["a", "b", "c", "d"], "the saved rows are not changed");
});

test("ETA and Drive time stay empty from the first moved stop on, because they describe the saved order", () => {
  const empty = "–";
  assert.deepEqual(shown(applyDraftOrderToOrderRows(savedRows, ["a", "b", "d", "c"])), [
    "1a:10:00|5 min / 2 km", "2b:11:00|6 min / 2 km", `3d:${empty}|${empty}`, `4c:${empty}|${empty}`,
  ]);
  assert.deepEqual(shown(applyDraftOrderToOrderRows(savedRows, ["d", "a", "b", "c"])).map((text) => text.endsWith(`${empty}|${empty}`)), [true, true, true, true]);
  assert.deepEqual(applyDraftOrderToOrderRows(savedRows, ["a", "b", "d", "c"]).map((row) => row.estimateStale === true), [false, false, true, true], "the page empties the End row from this flag");
  assert.equal(applyDraftOrderToOrderRows(savedRows, ["a", "b", "c", "d"]).some((row) => row.estimateStale), false);
});

test("an order that did not change, or only lost stops, keeps every estimate", () => {
  assert.deepEqual(shown(applyDraftOrderToOrderRows(savedRows, ["a", "b", "c", "d"])), shown(savedRows));
  const withoutC = savedRows.filter((row) => row.id !== "c");
  assert.deepEqual(shown(applyDraftOrderToOrderRows(withoutC, ["a", "b", "d"])), ["1a:10:00|5 min / 2 km", "2b:11:00|6 min / 2 km", "3d:13:00|8 min / 2 km"]);
  assert.deepEqual(applyDraftOrderToOrderRows(savedRows, undefined), [], "no order, no rows");
});

test("a stop that is not in the draft order is left out and one that is not in the table is ignored", () => {
  assert.deepEqual(applyDraftOrderToOrderRows(savedRows, ["b", "a", "x"]).map((row) => row.id), ["b", "a"]);
});

test("the Stops table of a single route follows an unsaved order and Tracking keeps the saved one", () => {
  assert.match(page, /const stopsTableRows = useMemo\(\(\) => \{[\s\S]*routeTimelineOrderByRouteId\[currentTimelineRouteRow\.id\][\s\S]*if \(isRouteGroupDetail \|\| !Array\.isArray\(draftStopIds\)\) return routeOrderRows;[\s\S]*applyDraftOrderToOrderRows\(routeOrderRows, currentTimelineRouteRow\.stops\.map\(\(stop\) => stop\.id\)\)/);
  assert.match(page, /const stopsTableEstimatesStale = stopsTableRows\.some\(\(row\) => row\.estimateStale === true\);/);
  assert.match(page, /endpoint: stopsTableEstimatesStale\s*\? \{ \.\.\.routeEndpointPresentation\.end, driveTime: null, plannedAt: null \}\s*: routeEndpointPresentation\.end,/);
  assert.match(page, /getStopSelection\(isRouteGroupDetail \? \[\] : stopsTableRows, selectedStopKeys\)/);
  assert.match(page, /setSelectedStopKeys\(checked \? stopsTableRows\.map\(\(row\) => row\.rowKey\) : \[\]\)/);

  const stopsTable = page.slice(page.indexOf('aria-label="Child route order stops"'), page.indexOf('aria-label="Child route tracking stops"'));
  assert.match(stopsTable, /\{stopsTableRows\.map\(\(row\) => \(/);
  assert.doesNotMatch(stopsTable, /routeOrderRows\.map/);
  const trackingTable = page.slice(page.indexOf('aria-label="Child route tracking stops"'));
  assert.match(trackingTable.slice(0, trackingTable.indexOf("</table>")), /routeOrderRows\.map/);
});

test("the handle is a draggable grip for a stop that can move and an empty space of the same size for one that cannot", async () => {
  const { StopDragHandle } = await loadSelection();
  const handlers = { onDragEnd() {}, onDragStart() {} };

  const idle = StopDragHandle({ draggable: false, label: "Drag to reorder #2330", ...handlers });
  assert.equal(idle.props["aria-hidden"], "true");
  assert.match(idle.props.className, /stop-drag-handle--idle/);
  assert.equal(idle.props.draggable, undefined);
  assert.equal(idle.props.onDragStart, undefined);
  assert.equal(idle.props.children, undefined, "nothing to see or to grab");

  const grip = StopDragHandle({ draggable: true, label: "Drag to reorder #2330", ...handlers });
  assert.equal(grip.props.draggable, true);
  assert.equal(grip.props["aria-label"], "Drag to reorder #2330");
  assert.equal(grip.props.role, "img");
  assert.equal(grip.props.onDragStart, handlers.onDragStart);
  assert.equal(grip.props.onDragEnd, handlers.onDragEnd);
  assert.doesNotMatch(grip.props.className, /idle/);

  const html = renderToStaticMarkup(createElement(StopDragHandle, { draggable: true, label: "Drag to reorder #2330", ...handlers }));
  assert.match(html, /draggable="true"/);
  assert.equal(html.match(/<circle/g).length, 6, "two columns of three dots");
  assert.doesNotMatch(renderToStaticMarkup(createElement(StopDragHandle, { draggable: false })), /draggable|<svg/);
});

test("the page imports the handle and the drop rule and passes the drag source", () => {
  assert.match(page, /import \{ getRowDropAfterStopId, reverseRouteStopIds \} from "\.\.\/features\/delivery\/route-draft";/);
  assert.match(page, /import \{ StopDragHandle, [^}]*\} from "\.\.\/features\/delivery\/route-stop-selection";/);
  assert.match(page, /const handleRouteTimelineDragStart = \(event, routeRow, stop, source = "timeline"\) => \{/);
  assert.match(page, /const drag = \{ routeId: routeRow\.id, source, stopId: stop\.id \};/);
  assert.equal(page.match(/handleRouteTimelineDragStart\(event, routeRow, stop\)/g)?.length, 2, "both timelines keep the default source");
});

test("a handle starts the shared drag with the same guards and only the table's own drag reaches the table handlers", () => {
  const handlers = sourceBetween("const canDragStopRow = ", "const submitRouteAction = ");

  assert.match(handlers, /canDragTimelineStop\(currentTimelineRouteRow, row\)/);
  assert.match(handlers, /handleRouteTimelineDragStart\(event, currentTimelineRouteRow, row, "table"\)/);
  assert.match(handlers, /const isStopRowDrag = \(\) => routeTimelineDragRef\.current\?\.source === "table";/);
  for (const name of ["handleStopRowDragOver", "handleStopTableDragEnter", "handleStopTableDragOver", "handleStopTableDragLeave", "handleStopTableDrop"]) {
    const body = handlers.slice(handlers.indexOf(`const ${name} = `));
    assert.match(body.slice(0, 260), /isStopRowDrag\(\)/, `${name} ignores a drag that did not start from a handle`);
  }
  assert.match(handlers, /moveDraggedTimelineStop\(drag\.routeId, afterStopId\)/, "the move reuses the timeline guards, live change rule and draft");
  assert.match(handlers, /handleRouteTimelineRouteDrop\(event, currentTimelineRouteRow\)/);
});

test("the table handlers move the stop by the pointer position and ignore other drags", () => {
  const handlers = sourceBetween("const canDragStopRow = ", "const submitRouteAction = ");
  const getTimelineRouteStopIds = Function(`${sourceBetween("function getTimelineRouteStopIds(", "function areTimelineOrdersEqual(")}\nreturn getTimelineRouteStopIds;`)();
  const moves = [];
  const dragRef = { current: null };
  const row = { id: "stop-c" };
  const target = (top) => ({ getBoundingClientRect: () => ({ height: 40, top }) });
  const { handleStopRowDragOver } = Function(
    "canDragTimelineStop", "currentTimelineRouteRow", "getRowDropAfterStopId", "getTimelineRouteStopIds", "handleRouteTimelineDragEnd",
    "handleRouteTimelineDragLeave", "handleRouteTimelineDragOver", "handleRouteTimelineDragStart", "handleRouteTimelineRouteDrop",
    "moveDraggedTimelineStop", "routeRows", "routeTimelineDragRef", "routeTimelineOrderByRouteIdRef", "setStopDragImage",
    `${handlers.slice(0, handlers.indexOf("const submitRouteAction"))}\nreturn { handleStopRowDragOver };`,
  )(
    () => true, { id: "route-1" }, getRowDropAfterStopId, getTimelineRouteStopIds, () => {},
    () => {}, () => {}, () => {}, () => {},
    (routeId, afterStopId) => moves.push([routeId, afterStopId]),
    [{ id: "route-1", stops: ["stop-a", "stop-b", "stop-c", "stop-d"].map((id) => ({ id })) }],
    dragRef, { current: {} }, () => {},
  );

  handleStopRowDragOver({ clientY: 130, currentTarget: target(100) }, row);
  assert.deepEqual(moves, [], "no drag: nothing moves");

  dragRef.current = { routeId: "route-1", source: "timeline", stopId: "stop-b" };
  handleStopRowDragOver({ clientY: 130, currentTarget: target(100) }, row);
  assert.deepEqual(moves, [], "a timeline drag is not the table's business");

  dragRef.current = { routeId: "route-1", source: "table", stopId: "stop-b" };
  handleStopRowDragOver({ clientY: 130, currentTarget: target(100) }, row);
  handleStopRowDragOver({ clientY: 105, currentTarget: target(100) }, row);
  handleStopRowDragOver({ clientY: 130, currentTarget: target(100) }, { id: "stop-b" });
  assert.deepEqual(moves, [["route-1", "stop-c"], ["route-1", "stop-a"]], "lower half: after c; upper half: after a; over itself: nothing");
});

test("the Stops table of a single route shows the handle before each checkbox and nowhere else", () => {
  const stopsTable = page.slice(page.indexOf('aria-label="Child route order stops"'), page.indexOf('aria-label="Child route tracking stops"'));

  assert.match(stopsTable, /<StopDragHandle draggable=\{false\} \/>/, "the header keeps a blank space of the same size");
  assert.match(stopsTable, /draggable=\{canDragStopRow\(row\)\}/);
  assert.match(stopsTable, /label=\{`Drag to reorder \$\{row\.order\}`\}/);
  assert.match(stopsTable, /onDragEnd=\{handleRouteTimelineDragEnd\}/);
  assert.match(stopsTable, /onDragStart=\{\(event\) => handleStopRowDragStart\(event, row\)\}/);
  assert.match(stopsTable, /onDragOver=\{isRouteGroupDetail \? undefined : \(event\) => handleStopRowDragOver\(event, row\)\}/);
  assert.match(stopsTable, /routeTimelineDrag\?\.source === "table" && routeTimelineDrag\.stopId === row\.id \? childRouteDraggingRowStyle : null/);
  assert.equal(stopsTable.match(/<StopDragHandle/g)?.length, 2, "header and rows, never the Start and End rows");

  const frame = page.slice(page.lastIndexOf("<div", page.indexOf('aria-label="Child route order stops"')), page.indexOf('aria-label="Child route order stops"'));
  assert.match(frame, /onDragEnter=\{handleStopTableDragEnter\}/);
  assert.match(frame, /onDragLeave=\{handleStopTableDragLeave\}/);
  assert.match(frame, /onDragOver=\{handleStopTableDragOver\}/);
  assert.match(frame, /onDrop=\{handleStopTableDrop\}/);

  const endpointRow = page.slice(page.indexOf("function renderRouteEndpointOrderRow("), page.indexOf("function renderRouteEndpointTrackingRow("));
  assert.doesNotMatch(endpointRow, /StopDragHandle/);
  const trackingTable = page.slice(page.indexOf('aria-label="Child route tracking stops"'));
  assert.doesNotMatch(trackingTable.slice(0, trackingTable.indexOf("</table>")), /StopDragHandle/);
});

test("the first column is wide enough for the handle and the checkbox and the bar lines up with them", () => {
  const padding = Number(css.match(/\.stop-select-cell \{[^}]*padding-left: (\d+)px;/)?.[1]);
  const gap = Number(css.match(/\.stop-select-cell \{[^}]*gap: (\d+)px;/)?.[1]);
  const handle = Number(css.match(/\.stop-drag-handle \{[^}]*width: (\d+)px;/)?.[1]);
  const checkbox = Number(css.match(/\.stop-select-checkbox \{[^}]*width: (\d+)px;/)?.[1]);
  const barPadding = Number(css.match(/\.stop-selection-bar \{[^}]*padding: 0 \d+px 0 (\d+)px;/)?.[1]);
  const column = Number(page.match(/\["(\d+)px", \.\.\.childRouteOrderColumnWidths\]\)/)?.[1]);

  assert.equal(barPadding, padding + handle + gap, "the bar's checkbox sits where the row checkbox sits");
  assert.ok(column >= padding + handle + gap + checkbox, "the column holds the handle and the checkbox");
  assert.match(css, /\.stop-drag-handle \{[^}]*cursor: grab;/);
  assert.match(css, /\.stop-drag-handle--idle \{ cursor: default; \}/);
});
