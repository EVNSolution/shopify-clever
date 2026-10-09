/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");

// The markup of one stop between its opening tag (found by an anchor) and the end of its closing tag.
function stopMarkup(anchor) {
  const start = page.lastIndexOf("<span\n", page.indexOf(anchor));
  assert.ok(start > 0, `missing ${anchor}`);
  const end = page.indexOf("</button>", start);
  return page.slice(start, page.indexOf("</span>\n", end) + "</span>\n".length);
}

const childUnit = stopMarkup("style={childRouteTimelineStopUnitStyle}");
const groupUnit = stopMarkup("style={{ ...routeTimelineSegmentStyle");
const motionNode = (markup) => markup.slice(markup.indexOf("<span ref={(node) => setRouteTimelineStopMotionRef(stop.id, node)}"));

test("the reorder slide moves the circle and its label, and the line of a stop stays where it is", () => {
  // Child timeline: the line comes first, then the one node that slides, with the label and the circle in it.
  assert.equal(childUnit.match(/setRouteTimelineStopMotionRef/g)?.length, 1);
  assert.ok(childUnit.indexOf("childRouteTimelineConnectorStyle") < childUnit.indexOf("setRouteTimelineStopMotionRef"), "the line is outside the sliding node");
  const child = motionNode(childUnit);
  assert.match(child, /style=\{childRouteTimelineStopMotionStyle\}/);
  assert.match(child, /childRouteTimelineOrderLabelStyle/);
  assert.match(child, /data-route-timeline-stop-button="true"/);
  assert.doesNotMatch(child, /childRouteTimelineConnectorStyle/, "no line inside the sliding node");

  // Group timeline: the same, with the circle (its label is inside the button).
  assert.equal(groupUnit.match(/setRouteTimelineStopMotionRef/g)?.length, 1);
  assert.ok(groupUnit.indexOf("routeTimelineLineStyle") < groupUnit.indexOf("setRouteTimelineStopMotionRef"), "the line is outside the sliding node");
  const group = motionNode(groupUnit);
  assert.match(group, /style=\{routeTimelineStopMotionStyle\}/);
  assert.match(group, /data-route-timeline-stop-button="true"/);
  assert.doesNotMatch(group, /routeTimelineLineStyle/, "no line inside the sliding node");
});

test("the unit that holds the line is not the node that slides", () => {
  for (const unit of [childUnit, groupUnit]) {
    const opening = unit.slice(0, unit.indexOf(">\n"));
    assert.doesNotMatch(opening, /setRouteTimelineStopMotionRef/);
    assert.match(opening, /onDragOver=\{\(event\) => handleRouteTimelineStopDragOver\(event, routeRow, stop\)\}/, "the unit still takes the drag over");
  }
});

test("the sliding node keeps the rows of the unit it came from, so nothing shifts at rest", () => {
  const unitRows = page.match(/const childRouteTimelineStopUnitStyle = \{[^}]*gridTemplateRows: "(\d+px \d+px)"/)?.[1];
  const motion = page.match(/const childRouteTimelineStopMotionStyle = \{([^}]*)\}/)?.[1] ?? "";

  assert.equal(unitRows, "14px 24px");
  assert.match(motion, /gridTemplateRows: "14px 24px"/);
  assert.match(motion, /gridRow: "1 \/ span 2"/, "it takes both rows of the unit");
  assert.match(motion, /alignItems: "center"/, "the label sits where it sat in the unit");
  assert.match(motion, /gap: "2px"/);
  assert.match(motion, /justifyItems: "center"/);
  assert.match(motion, /width: "100%"/);
  assert.match(page, /const routeTimelineStopMotionStyle = \{[^}]*display: "inline-flex"/);
});

test("the drag over a stop still reads the middle of that stop from the sliding node", () => {
  const start = page.indexOf("const handleRouteTimelineStopDragOver = ");
  const handler = page.slice(start, page.indexOf("const handleRouteTimelineEmptyRouteDragEnter = ", start));
  assert.match(handler, /routeTimelineStopMotionRefs\.current\.get\(stop\.id\)\?\.getBoundingClientRect\(\)/);
  assert.match(handler, /targetRect\.left \+ targetRect\.width \/ 2/);
});
