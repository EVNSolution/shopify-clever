import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { translate } from "../app/i18n/i18n.js";
import { SORTABLE_ORDER_COLUMNS } from "../app/features/orders/orders-table-columns.js";

const root = process.cwd();
const ordersPageSource = readFileSync(
  join(root, "app/features/orders/orders-page.jsx"),
  "utf8",
);
const routesPageSource = readFileSync(join(root, "app/routes/app.routes.jsx"), "utf8");

test("affected Orders list controls and columns use the app language", () => {
  assert.equal(translate("ko", "orders.filters.add"), "필터 추가");
  assert.equal(translate("ko", "orders.filters.label"), "주문 필터");
  assert.equal(translate("ko", "orders.table.amount"), "금액");
  assert.ok(
    SORTABLE_ORDER_COLUMNS.every((column) => column.translationKey),
    "every visible Orders column needs an explicit translation key",
  );
  assert.match(ordersPageSource, /useRouteLoaderData\("routes\/app"\)\?\.language/);
  assert.match(ordersPageSource, /translate\(language, "orders\.filters\.add"\)/);
  assert.match(ordersPageSource, /translate\(language, column\.translationKey\)/);
});

test("affected Routes list labels use the app language without adding a Dispatch action", () => {
  assert.equal(translate("ko", "routes.list.selectedCount", { count: 2 }), "2개 선택됨");
  assert.equal(translate("ko", "routes.summary.routes"), "경로");
  assert.equal(translate("ko", "routes.table.amount"), "금액");
  assert.equal(
    translate("ko", "routes.group.summary.many", { routeCount: 2, stopCount: 43 }),
    "경로 2개 - 경유지 43개",
  );
  assert.equal(
    translate("ko", "routes.group.open", { name: "금요일 배송" }),
    "경로 그룹 금요일 배송 열기",
  );
  assert.match(routesPageSource, /useRouteLoaderData\("routes\/app"\)\?\.language/);
  assert.match(routesPageSource, /translate\(language, "routes\.list\.selectedCount", \{ count: selectedRouteCount \}\)/);
  assert.match(routesPageSource, /translate\(language, summaryItem\.labelKey\)/);
  assert.match(routesPageSource, /translate\(language, "routes\.table\.amount"\)/);
  assert.match(routesPageSource, /const routeGroupById = new Map\(routeGroups\.map/);
  assert.match(routesPageSource, /function formatLocalizedRouteGroupSummary\(language, route, routeGroupById\)/);
  assert.match(routesPageSource, /formatLocalizedRouteGroupSummary\(language, route, routeGroupById\)/);
  assert.match(routesPageSource, /translate\(language, "routes\.group\.open", \{ name: route\.route \}\)/);
  assert.doesNotMatch(routesPageSource, />Dispatch</);
});
