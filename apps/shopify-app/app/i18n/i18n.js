export const DEFAULT_LANGUAGE = "en";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
];

const TRANSLATIONS = {
  en: {
    "nav.home": "Home",
    "nav.orders": "Orders",
    "nav.routes": "Routes",
    "nav.analytics": "Analytics",
    "nav.drivers": "Drivers",
    "nav.settings": "Settings",
    "settings.title": "Settings",
    "settings.general.title": "General",
    "settings.general.language": "Language",
    "settings.deliveryCycle.title": "Delivery cycle",
    "settings.deliveryCycle.description": "Orders placed after this cutoff move to the next delivery week. Delivery days stay Thursday, Friday, and Saturday.",
    "settings.deliveryCycle.cutoffWeekday": "Cutoff weekday",
    "settings.deliveryCycle.cutoffTime": "Cutoff time",
    "settings.departureLocation.title": "Departure location",
    "settings.departureLocation.name": "Name",
    "settings.departureLocation.address": "Address",
    "settings.departureLocation.latitude": "Latitude",
    "settings.departureLocation.longitude": "Longitude",
    "settings.departureLocation.checkAddress": "Check address",
    "settings.departureLocation.geocodeError": "Unable to geocode departure address.",
    "settings.departureLocation.saved": "Departure location has been saved.",
    "settings.departureLocation.savedWithName": 'Departure location "{name}" has been saved.',
    "settings.actions.reset": "Reset changes",
    "settings.actions.save": "Save",
    "settings.errors.unableToSave": "Unable to save settings.",
  },
  ko: {
    "nav.home": "홈",
    "nav.orders": "주문",
    "nav.routes": "경로",
    "nav.analytics": "분석",
    "nav.drivers": "배송원",
    "nav.settings": "설정",
    "settings.title": "설정",
    "settings.general.title": "일반",
    "settings.general.language": "언어",
    "settings.deliveryCycle.title": "배송 사이클",
    "settings.deliveryCycle.description": "이 경계 이후 주문은 다음 배송 주차로 넘어갑니다. 배송일은 목·금·토로 유지됩니다.",
    "settings.deliveryCycle.cutoffWeekday": "경계 요일",
    "settings.deliveryCycle.cutoffTime": "경계 시간",
    "settings.departureLocation.title": "출발지",
    "settings.departureLocation.name": "이름",
    "settings.departureLocation.address": "주소",
    "settings.departureLocation.latitude": "위도",
    "settings.departureLocation.longitude": "경도",
    "settings.departureLocation.checkAddress": "주소 확인",
    "settings.departureLocation.geocodeError": "출발지 주소의 좌표를 찾지 못했습니다.",
    "settings.departureLocation.saved": "출발지가 저장되었습니다.",
    "settings.departureLocation.savedWithName": '출발지 "{name}"가 저장되었습니다.',
    "settings.actions.reset": "변경값 초기화",
    "settings.actions.save": "저장",
    "settings.errors.unableToSave": "설정을 저장하지 못했습니다.",
  },
};

export function normalizeLanguage(value) {
  const language = String(value ?? "").trim().toLowerCase();

  return SUPPORTED_LANGUAGES.some((option) => option.code === language)
    ? language
    : DEFAULT_LANGUAGE;
}

export function translate(language, key, params = {}) {
  const normalizedLanguage = normalizeLanguage(language);
  const template =
    TRANSLATIONS[normalizedLanguage]?.[key] ??
    TRANSLATIONS[DEFAULT_LANGUAGE]?.[key] ??
    key;

  return Object.entries(params).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}
