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
