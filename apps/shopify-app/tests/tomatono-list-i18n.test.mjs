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

test("Orders Add filter static labels and options have Korean dictionary coverage", () => {
  const expectedTranslations = {
    "orders.filters.orderDate": "주문일",
    "orders.filters.deliveryDate": "배송일",
    "orders.filters.deliveryDay": "배송 요일",
    "orders.filters.type": "유형",
    "orders.filters.area": "지역",
    "orders.filters.state": "상태",
    "orders.filters.serviceType.delivery": "배송",
    "orders.filters.serviceType.pickup": "픽업",
    "orders.filters.weekday.sunday": "일요일",
    "orders.filters.weekday.monday": "월요일",
    "orders.filters.weekday.tuesday": "화요일",
    "orders.filters.weekday.wednesday": "수요일",
    "orders.filters.weekday.thursday": "목요일",
    "orders.filters.weekday.friday": "금요일",
    "orders.filters.weekday.saturday": "토요일",
    "orders.filters.state.unplanned": "미계획",
    "orders.filters.state.planned": "계획됨",
    "orders.filters.state.assignedUndelivered": "배정됨",
    "orders.filters.state.pastDue": "기한 지남",
    "orders.filters.state.delivered": "완료 / 배송 완료",
    "orders.filters.state.fulfilled": "처리 완료",
    "orders.filters.state.unfulfilled": "미처리",
  };

  for (const [key, expected] of Object.entries(expectedTranslations)) {
    assert.equal(translate("ko", key), expected, key);
  }
  const remainingStaticKeys = [
    "orders.filters.aria.orderedDate",
    "orders.filters.aria.deliveryDate",
    "orders.filters.aria.deliveryDay",
    "orders.filters.aria.serviceType",
    "orders.filters.aria.deliveryArea",
    "orders.filters.aria.state",
    "orders.filters.clear.orderedDate",
    "orders.filters.clear.deliveryDate",
    "orders.filters.clear.deliveryDay",
    "orders.filters.clear.serviceType",
    "orders.filters.clear.deliveryArea",
    "orders.filters.clear.state",
  ];
  for (const key of [...Object.keys(expectedTranslations), ...remainingStaticKeys]) {
    assert.notEqual(translate("en", key), key, `${key} English dictionary entry`);
    assert.notEqual(translate("ko", key), translate("en", key), `${key} Korean dictionary entry`);
  }
  assert.equal(
    translate("ko", "orders.filters.datePending", { count: 3 }),
    "날짜 미정 (3)",
  );
  assert.equal(
    translate("en", "orders.filters.datePending", { count: 3 }),
    "Date pending (3)",
  );
  assert.match(ordersPageSource, /ORDER_FILTER_WEEKDAY_KEY_BY_VALUE/);
  assert.match(ordersPageSource, /ORDER_FILTER_STATE_KEY_BY_VALUE/);
  assert.match(ordersPageSource, /translateOrderFilterOptions\(language, ORDER_WEEKDAY_OPTIONS/);
  assert.match(ordersPageSource, /translateOrderFilterOptions\(language, ORDER_DELIVERY_STATE_OPTIONS/);
  assert.match(ordersPageSource, /translate\(language, "orders\.filters\.aria\.orderedDate"\)/);
  assert.match(ordersPageSource, /translate\(language, "orders\.filters\.clear\.state"\)/);
});

test("affected Routes list labels use the app language without adding a Dispatch action", () => {
  assert.equal(translate("ko", "routes.list.selectedCount", { count: 2 }), "2개 선택됨");
  assert.equal(translate("ko", "routes.summary.routes"), "경로");
  assert.equal(translate("ko", "routes.table.totalPrice"), "총 금액");
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
  assert.match(routesPageSource, /translate\(language, "routes\.table\.totalPrice"\)/);
  assert.match(routesPageSource, /const routeGroupById = new Map\(routeGroups\.map/);
  assert.match(routesPageSource, /function formatLocalizedRouteGroupSummary\(language, route, routeGroupById\)/);
  assert.match(routesPageSource, /formatLocalizedRouteGroupSummary\(language, route, routeGroupById\)/);
  assert.doesNotMatch(routesPageSource, /routes\.group\.withoutRoutes|groupsWithoutRoutes/);
  assert.doesNotMatch(routesPageSource, />Dispatch</);
});
