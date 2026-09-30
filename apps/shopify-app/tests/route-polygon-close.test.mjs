/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync("app/routes/app.routes.$routeId.jsx", "utf8");

function cornerRelease(points, pointIndex, moved, closed = false) {
  const start = source.indexOf("const handlePolygonCornerDragEnd = (event) => {");
  const end = source.indexOf("\n    };", start);
  const pointsRef = { current: points };
  const closedRef = { current: closed };
  const result = { points, closed };
  const release = vm.runInNewContext(`(${source.slice(start + "const handlePolygonCornerDragEnd = ".length, end + 6).replace(/;$/, "")})`, {
    routePolygonCornerDragIndexRef: { current: pointIndex },
    routePolygonPointsRef: pointsRef, routePolygonClosedRef: closedRef,
    polygonCornerMoved: moved, polygonCornerStartPoint: null,
    preventMapGesture() {}, cancelPendingPolygonDrag() {}, restoreDragPan() {}, canvas: null,
    syncDraggedPolygonPoint: () => pointsRef.current,
    setRoutePolygonDraftPoints: (next) => { result.points = next; },
    setRoutePolygonClosed: (next) => { closedRef.current = next; result.closed = next; },
    setIsPolygonTargetPickerOpen() {}, syncRouteEditPolygon() {}, map: {},
  });
  release({});
  return result;
}

test("clicking the first corner closes a three-point polygon without appending a duplicate", () => {
  const points = [[-79.4, 43.7], [-79.3, 43.7], [-79.3, 43.8]];
  assert.deepEqual(cornerRelease(points, 0, false), { points, closed: true });
});

test("other corners, incomplete polygons and dragging the first corner do not close", () => {
  const points = [[-79.4, 43.7], [-79.3, 43.7], [-79.3, 43.8]];
  assert.equal(cornerRelease(points, 1, false).closed, false);
  assert.equal(cornerRelease(points.slice(0, 2), 0, false).closed, false);
  assert.equal(cornerRelease(points, 0, true).closed, false);
  assert.equal(cornerRelease(points, 0, false, true).closed, true);
});
