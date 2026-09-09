import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRouteRows } from "../app/features/delivery/route-list-rows.js";
const source=readFileSync(new URL('../app/routes/app.routes.jsx',import.meta.url),'utf8');

test('flat route summary counts actual routes and never includes a childless group inventory',()=>{
  const helpers=source.slice(source.indexOf('function numberOrNull('),source.indexOf('function formatLocalizedRouteGroupSummary('));
  const summarize=Function(helpers+'\nreturn buildRoutesSummary;')();
  const rows=buildRouteRows([{id:'ordinary',stopsCount:4}], [
    {id:'group',totalOrders:50,children:[{routePlanId:'one',routePlan:{id:'one',stopsCount:2}},{routePlanId:'two',routePlan:{id:'two',stopsCount:3}}]},
    {id:'childless',totalOrders:80,children:[]},
  ]);
  const summary=summarize(rows);
  assert.equal(summary.find(x=>x.labelKey==='routes.summary.routes').value,'3');
  assert.equal(summary.find(x=>x.labelKey==='routes.summary.stops').value,'9');
});

test("childless groups stay out of the Routes UI and ordinary rows never expose parent management names", () => {
  const header = source.slice(source.indexOf("<header"), source.indexOf("</header>"));
  const table = source.slice(source.indexOf("<table"), source.indexOf("</table>"));
  assert.doesNotMatch(header, /groupsWithoutRoutes|routes\.group\.withoutRoutes|routes\.list\.actions/);
  assert.doesNotMatch(table, /groupManagementHref|routeGroupHeader|group.name/);
});
