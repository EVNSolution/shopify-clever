const SHOP_TIME_ZONE_QUERY = `#graphql
  query CleverShopTimeZone {
    shop {
      ianaTimezone
      timezoneAbbreviation
    }
  }
`;
const DEFAULT_SHOP_TIME_ZONE_CACHE_TTL_MS = 30_000;
const shopTimeZoneCache = new Map();

function textOrUndefined(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function fetchShopifyShopTimeZone(admin, options = {}) {
  const cacheKey = textOrUndefined(options.cacheKey);
  if (!cacheKey) return loadShopifyShopTimeZone(admin);

  const now = Date.now();
  const cached = shopTimeZoneCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise.then(cloneShopTimeZoneResult);
  }

  const cacheEntry = {
    expiresAt: now + DEFAULT_SHOP_TIME_ZONE_CACHE_TTL_MS,
    promise: loadShopifyShopTimeZone(admin).then((result) => {
      if (!result.ianaTimezone && !result.timezoneAbbreviation) {
        shopTimeZoneCache.delete(cacheKey);
      }

      return result;
    }),
  };
  shopTimeZoneCache.set(cacheKey, cacheEntry);

  return cloneShopTimeZoneResult(await cacheEntry.promise);
}

async function loadShopifyShopTimeZone(admin) {
  try {
    const response = await admin.graphql(SHOP_TIME_ZONE_QUERY);
    const payload = await response.json();
    const shop = payload?.data?.shop;

    return {
      ianaTimezone: textOrUndefined(shop?.ianaTimezone),
      timezoneAbbreviation: textOrUndefined(shop?.timezoneAbbreviation),
      errors: [],
    };
  } catch (error) {
    return {
      ianaTimezone: undefined,
      timezoneAbbreviation: undefined,
      errors: [{ message: "Shopify shop timezone 조회에 실패했습니다.", details: error?.message }],
    };
  }
}

function cloneShopTimeZoneResult(result) {
  return { ...result };
}

function getLocalDateForTimeZone(date, timeZone) {
  if (!timeZone) return undefined;

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    }).formatToParts(date);
    const partMap = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );

    if (!partMap.year || !partMap.month || !partMap.day) return undefined;

    return `${partMap.year}-${partMap.month}-${partMap.day}`;
  } catch {
    return undefined;
  }
}

export function getShopLocalDate(shopTimeZoneData, date = new Date()) {
  return (
    getLocalDateForTimeZone(date, shopTimeZoneData?.ianaTimezone) ??
    getLocalDateForTimeZone(date, "UTC") ??
    date.toISOString().slice(0, 10)
  );
}

export function getTimeZoneAbbreviationForInstant(ianaTimezone, instant, fallbackAbbreviation) {
  const timeZone = textOrUndefined(ianaTimezone);
  if (!timeZone) return textOrUndefined(fallbackAbbreviation);

  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return textOrUndefined(fallbackAbbreviation);

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(date);
    return textOrUndefined(parts.find((part) => part.type === "timeZoneName")?.value) ?? textOrUndefined(fallbackAbbreviation);
  } catch {
    return textOrUndefined(fallbackAbbreviation);
  }
}
