import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  translate,
} from "./i18n.js";

test("normalizes supported operator languages with English fallback", () => {
  assert.equal(DEFAULT_LANGUAGE, "en");
  assert.deepEqual(SUPPORTED_LANGUAGES.map((language) => language.code), ["en", "ko"]);
  assert.equal(normalizeLanguage("ko"), "ko");
  assert.equal(normalizeLanguage("en"), "en");
  assert.equal(normalizeLanguage("fr"), "en");
  assert.equal(normalizeLanguage(null), "en");
});

test("translates cancelled route-planning exclusions", () => {
  assert.equal(
    translate("en", "orders.routeActions.cancelledOrdersExcluded", { count: 1 }),
    "Cancelled orders (1) were excluded from route planning.",
  );
  assert.equal(
    translate("ko", "orders.routeActions.cancelledOrdersExcluded", { count: 2 }),
    "취소된 주문 2건을 경로 계획에서 제외했습니다.",
  );
  assert.equal(
    translate("en", "orders.routeActions.cancelledOrdersBlockCreation", { count: 1 }),
    "This route includes 1 cancelled order(s). Remove them before creating the route.",
  );
});

test("translates settings copy and interpolates saved departure names", () => {
  assert.equal(translate("en", "settings.title"), "Settings");
  assert.equal(translate("ko", "settings.title"), "설정");
  assert.equal(
    translate("en", "settings.departureLocation.savedWithName", { name: "Depot" }),
    'Departure location "Depot" has been saved.',
  );
  assert.equal(
    translate("ko", "settings.departureLocation.savedWithName", { name: "물류센터" }),
    '출발지 "물류센터"가 저장되었습니다.',
  );
  assert.equal(translate("ko", "unknown.key"), "unknown.key");
});

test("scheduled notice and ETA window labels follow admin language without changing tokens", () => {
  assert.equal(translate("ko", "notifications.variables.etaWindow"), "예상 도착 시간대");
  assert.equal(translate("en", "notifications.variables.etaWindow"), "Estimated arrival window");
  assert.equal(translate("ko", "routes.scheduledNotice.reviewAction"), "배송 예정 알림 검토");
});

test("September route-detail contract copy is available in English and Korean", () => {
  assert.equal(translate("en", "routes.detail.dispatched"), "Dispatched");
  assert.equal(translate("ko", "routes.detail.dispatched"), "배차됨");
  assert.match(translate("en", "routes.detail.originalShippingMissing", { count: 2 }), /2 order/);
  assert.match(translate("ko", "routes.detail.schedule.planDateMismatch", { planDate: "2026-09-11", timeZone: "America/Toronto" }), /2026-09-11/);
  assert.equal(translate("en", "routes.detail.tracking.return.UNCONFIRMED"), "Unconfirmed");
  assert.equal(translate("ko", "orders.filters.serviceType.eveningDelivery"), "저녁 배송");
});
