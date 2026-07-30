import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeDetailSource = await readFile(
  new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url),
  "utf8",
);

test("route detail keeps expensive route and timeline derived arrays memoized", () => {
  for (const bindingName of [
    "currentRouteRowsSource",
    "groupRouteRowsSource",
    "displayRouteRowsSource",
    "contextRouteRowsSource",
    "routeRows",
    "contextRouteRows",
    "timelineRouteRows",
    "contextTimelineRouteRows",
    "childRouteOrderRows",
    "routePolygonSourceStops",
    "polygonCandidateStops",
    "polygonCandidateOrderIds",
    "routeGeometryStopPoints",
  ]) {
    assert.match(
      routeDetailSource,
      new RegExp(`const\\s+${bindingName}\\s*=\\s*useMemo\\b`),
      `${bindingName} should be memoized to keep route/map sync inputs stable`,
    );
  }
});

test("polygon map click handlers do not rebind for every polygon point update", () => {
  const handlerStart = routeDetailSource.indexOf("const handleMapClick = (event) => {");
  const handlerEnd = routeDetailSource.indexOf("}, [isMapReady, isRoutePolygonEditMode]);", handlerStart);
  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);
  const polygonClickEffectSource = routeDetailSource.slice(handlerStart, handlerEnd + 42);

  assert.match(
    polygonClickEffectSource,
    /map\.on\("click", handleMapClick\);[\s\S]*?\}, \[isMapReady, isRoutePolygonEditMode\]\);/,
  );
  assert.match(polygonClickEffectSource, /routePolygonPointsRef\.current/);
  assert.match(polygonClickEffectSource, /routePolygonClosedRef\.current/);
  assert.doesNotMatch(polygonClickEffectSource.split("\n").at(-2), /routePolygonPoints|isRoutePolygonClosed/);
});

test("main map handlers read current child rows and actions without rebinding", () => {
  const mainMapEffectStart = routeDetailSource.indexOf(
    "  useEffect(() => {\n    if (!isMapReady || !mapRef.current || !mapLibraryRef.current) return undefined;",
  );
  const mainMapEffectEnd = routeDetailSource.indexOf(
    "\n\n  useEffect(() => {\n    if (!isTrackingMapView || !isMapReady || !routeMapRef.current) return undefined;",
    mainMapEffectStart,
  );
  assert.notEqual(mainMapEffectStart, -1);
  assert.notEqual(mainMapEffectEnd, -1);

  const childRowsBinding = routeDetailSource.indexOf("const childRouteOrderRows = useMemo(");
  const childRowsRefSync = routeDetailSource.indexOf(
    "childRouteOrderRowsRef.current = childRouteOrderRows;",
  );
  const toggleHandlerBinding = routeDetailSource.indexOf(
    "const handleToggleChildStopActions = (event, rowId) => {",
  );
  const toggleHandlerRefSync = routeDetailSource.indexOf(
    "handleToggleChildStopActionsRef.current = handleToggleChildStopActions;",
  );

  assert.match(routeDetailSource, /const childRouteOrderRowsRef = useRef\(\[\]\)/);
  assert.match(routeDetailSource, /const handleToggleChildStopActionsRef = useRef\(null\)/);
  assert.ok(childRowsRefSync > childRowsBinding && childRowsRefSync < mainMapEffectStart);
  assert.ok(toggleHandlerRefSync > toggleHandlerBinding && toggleHandlerRefSync < mainMapEffectStart);

  const mainMapEffectSource = routeDetailSource.slice(mainMapEffectStart, mainMapEffectEnd);
  assert.match(mainMapEffectSource, /childRouteOrderRowsRef\.current\.find/);
  assert.match(
    mainMapEffectSource,
    /handleToggleChildStopActionsRef\.current\?\.\(event, row\.id\)/,
  );
  assert.doesNotMatch(mainMapEffectSource, /childRouteOrderRows\.find/);
  assert.doesNotMatch(mainMapEffectSource, /handleToggleChildStopActions\(event, row\.id\)/);

  const dependencySource = mainMapEffectSource.slice(mainMapEffectSource.lastIndexOf("}, ["));
  assert.doesNotMatch(dependencySource, /childRouteOrderRows|handleToggleChildStopActions/);
});
