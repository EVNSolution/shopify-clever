/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isMaterializedChildRouteDetail } from "../app/features/delivery/child-route-detail-presentation.js";
import { getRouteGroupChildRouteName } from "../app/features/delivery/route-helpers.js";

const routeDetailSource = readFileSync(
  join(process.cwd(), "app/routes/app.routes.$routeId.jsx"),
  "utf8",
);

function extractArrowFunctionBody(name) {
  const declaration = `const ${name} =`;
  const declarationStart = routeDetailSource.indexOf(declaration);
  assert.notEqual(declarationStart, -1, `${name} must exist in the route detail source`);
  const bodyStart = routeDetailSource.indexOf("=> {", declarationStart) + 4;
  const bodyEnd = routeDetailSource.indexOf("\n  };", bodyStart);
  assert.ok(bodyStart > 3 && bodyEnd > bodyStart, `${name} must have an extractable body`);
  return routeDetailSource.slice(bodyStart, bodyEnd);
}

function compileHandler(name, dependencies, argumentNames = []) {
  const dependencyNames = Object.keys(dependencies);
  const executable = new Function(
    ...dependencyNames,
    ...argumentNames,
    extractArrowFunctionBody(name),
  );
  return (...args) => executable(...Object.values(dependencies), ...args);
}

function extractSiblingNavigatorCondition() {
  const match = routeDetailSource.match(
    /\{(isMaterializedChildRouteDetail && routeGroupId && currentSiblingRouteIndex >= 0) \? \(/,
  );
  assert.ok(match, "the sibling navigator condition must remain inspectable");
  return new Function(
    "isMaterializedChildRouteDetail",
    "routeGroupId",
    "currentSiblingRouteIndex",
    `return Boolean(${match[1]});`,
  );
}

test("group child names preserve saved names and only fall back when no name exists", () => {
  const group = { id: "group-1", name: "North" };

  assert.equal(
    getRouteGroupChildRouteName(group, { routeIdx: 3 }, { name: "North — Downtown" }, 0),
    "North — Downtown",
  );
  assert.equal(
    getRouteGroupChildRouteName(group, { routePlan: { name: "Harbour" } }, null, 0),
    "Harbour",
  );
  assert.equal(
    getRouteGroupChildRouteName(group, { label: "Evening route" }, null, 0),
    "Evening route",
  );
  assert.equal(
    getRouteGroupChildRouteName(group, { routeIdx: 7, label: "  " }, null, 0),
    "#7",
  );
});

test("All routes navigation runs through the actual unsaved-draft guard", () => {
  const navigations = [];
  const pendingDestinations = [];
  const dialogStates = [];
  const menuStates = [];
  const requestRouteNavigation = compileHandler("requestRouteNavigation", {
    hasRouteAllocationDraft: true,
    navigate: (href) => navigations.push(href),
    setIsRouteDraftExitDialogOpen: (open) => dialogStates.push(open),
    setPendingRouteDraftHref: (href) => pendingDestinations.push(href),
  }, ["href"]);
  const allRoutesHandlerMatch = routeDetailSource.match(
    /onClick=\{\(\) => \{ (setIsSiblingRouteMenuOpen\(false\); requestRouteNavigation\(routeGroupPath\(routeGroupId\)\);) \}\}/,
  );
  assert.ok(allRoutesHandlerMatch, "All routes must use the guarded navigation function");
  const allRoutesHandler = new Function(
    "requestRouteNavigation",
    "routeGroupPath",
    "routeGroupId",
    "setIsSiblingRouteMenuOpen",
    allRoutesHandlerMatch[1],
  );

  allRoutesHandler(
    requestRouteNavigation,
    (groupId) => `/app/routes/groups/${groupId}`,
    "group-1",
    (open) => menuStates.push(open),
  );

  assert.deepEqual(menuStates, [false]);
  assert.deepEqual(pendingDestinations, ["/app/routes/groups/group-1"]);
  assert.deepEqual(dialogStates, [true]);
  assert.deepEqual(navigations, []);
});

test("sibling navigation stays inside its group and ignores missing or current targets", () => {
  const navigations = [];
  const menuStates = [];
  const handleSiblingRouteChange = compileHandler(
    "handleSiblingRouteChange",
    {
      effectiveRoutePlan: { id: "route-1" },
      requestRouteNavigation: (href) => navigations.push(href),
      routeGroupChildPath: (groupId, routeId) => `/app/routes/groups/${groupId}/routes/${routeId}`,
      routeGroupId: "group-1",
      setIsSiblingRouteMenuOpen: (open) => menuStates.push(open),
    },
    ["routePlanId"],
  );

  handleSiblingRouteChange(null);
  handleSiblingRouteChange("route-1");
  handleSiblingRouteChange("route-2");

  assert.deepEqual(menuStates, [false, false]);
  assert.deepEqual(navigations, ["/app/routes/groups/group-1/routes/route-2"]);
});

test("route table links use child paths only for grouped routes", () => {
  const match = routeDetailSource.match(
    /onClick=\{\(\) => (routeRow\.routePlanId \? requestRouteNavigation\(routeGroupId \? routeGroupChildPath\(routeGroupId, routeRow\.routePlanId\) : routePlanPath\(routeRow\.routePlanId\)\) : undefined)\}/,
  );
  assert.ok(match, "route rows must select a detail path from their actual grouping scope");
  const openRouteRow = new Function(
    "requestRouteNavigation",
    "routeGroupChildPath",
    "routeGroupId",
    "routePlanPath",
    "routeRow",
    `return ${match[1]};`,
  );
  const navigations = [];
  const requestRouteNavigation = (href) => navigations.push(href);
  const routeGroupChildPath = (groupId, routeId) => `/app/routes/groups/${groupId}/routes/${routeId}`;
  const routePlanPath = (routeId) => `/app/routes/${routeId}`;

  openRouteRow(requestRouteNavigation, routeGroupChildPath, "group-1", routePlanPath, { routePlanId: "child-1" });
  openRouteRow(requestRouteNavigation, routeGroupChildPath, null, routePlanPath, { routePlanId: "standalone-1" });
  openRouteRow(requestRouteNavigation, routeGroupChildPath, null, routePlanPath, { routePlanId: null });

  assert.deepEqual(navigations, [
    "/app/routes/groups/group-1/routes/child-1",
    "/app/routes/standalone-1",
  ]);
});

test("one-child groups retain the Group menu while standalone routes expose no split controls", () => {
  const showSiblingNavigator = extractSiblingNavigatorCondition();
  const oneChildGroup = { id: "group-1", children: [{ routePlanId: "route-1" }] };
  const groupedRoute = { id: "route-1", routeGroupingChild: { groupingId: "group-1" } };
  const standaloneRoute = { id: "route-standalone" };

  assert.equal(isMaterializedChildRouteDetail({ routeGroup: oneChildGroup, routePlan: groupedRoute }), true);
  assert.equal(showSiblingNavigator(true, "group-1", 0), true);
  assert.equal(isMaterializedChildRouteDetail({ routeGroup: null, routePlan: standaloneRoute }), false);
  assert.equal(showSiblingNavigator(false, null, -1), false);

  const routeActionsStart = routeDetailSource.indexOf('<div aria-label="Route actions"');
  const routeActionsEnd = routeDetailSource.indexOf('<div\n                  aria-label="Actions"', routeActionsStart);
  const routeActions = routeDetailSource.slice(routeActionsStart, routeActionsEnd);
  assert.equal((routeActions.match(/\{routeGroupId \? \(/g) ?? []).length, 2);
  assert.match(routeActions, /onClick=\{handleAddOrderToCurrentRoute\}/);
  assert.match(routeActions, /onClick=\{handleAddEmptyRoute\}/);
});
