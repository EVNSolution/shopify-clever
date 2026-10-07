import timeZoneLookup from "@photostructure/tz-lookup";

import { getRouteGroupChildRoutePlanId } from "./route-helpers.js";
import { geocodeAddress } from "../locations/address-geocoding.server.js";
import {
  fetchShopifyShopTimeZone,
  getTimeZoneAbbreviationForInstant,
} from "../shopify/shop-timezone.server.js";

export function fetchRouteFallbackTimeZone(admin, cacheKey) {
  if (process.env.CLEVER_ORDERS_SOURCE_MODE !== "delivery_only") {
    return fetchShopifyShopTimeZone(admin, { cacheKey });
  }

  const ianaTimezone = process.env.CLEVER_DELIVERY_ONLY_TIME_ZONE || "Asia/Seoul";
  return Promise.resolve({
    errors: [],
    ianaTimezone,
    timezoneAbbreviation: ianaTimezone === "Asia/Seoul" ? "KST" : undefined,
  });
}

function numberOrUndefined(value) {
  if (value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function textOrUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function isValidLatitude(value) {
  return value != null && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return value != null && value >= -180 && value <= 180;
}

function normalizeCoordinates(latitudeValue, longitudeValue) {
  const latitude = numberOrUndefined(latitudeValue);
  const longitude = numberOrUndefined(longitudeValue);
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  return { latitude, longitude };
}

export function getRouteTimeZoneLocation(routePlan, departureLocation) {
  const routeCoordinates = normalizeCoordinates(
    routePlan?.depot?.latitude,
    routePlan?.depot?.longitude,
  );
  const departureCoordinates = Array.isArray(departureLocation?.coordinates)
    ? normalizeCoordinates(departureLocation.coordinates[1], departureLocation.coordinates[0])
    : null;

  return {
    address:
      textOrUndefined(routePlan?.depot?.address) ??
      textOrUndefined(departureLocation?.address),
    coordinates: routeCoordinates ?? departureCoordinates,
  };
}

function lookupCoordinates(coordinates, lookup) {
  if (!coordinates) return undefined;

  try {
    return textOrUndefined(lookup(coordinates.latitude, coordinates.longitude));
  } catch {
    return undefined;
  }
}

function buildResolvedTimeZone(ianaTimezone, source, fallbackTimeZoneData, coordinates = null) {
  const fallbackAbbreviation = ianaTimezone === fallbackTimeZoneData?.ianaTimezone
    ? fallbackTimeZoneData?.timezoneAbbreviation
    : undefined;

  return {
    errors: [],
    ianaTimezone,
    sourceCoordinates: coordinates,
    timezoneAbbreviation: getTimeZoneAbbreviationForInstant(
      ianaTimezone,
      new Date(),
      fallbackAbbreviation,
    ),
    timezoneSource: source,
  };
}

export async function resolveRouteTimeZone(
  { departureLocation, fallbackTimeZoneData = {}, routePlan },
  options = {},
) {
  const lookup = options.timeZoneLookup ?? timeZoneLookup;
  const geocode = options.geocodeAddress ?? geocodeAddress;
  const location = getRouteTimeZoneLocation(routePlan, departureLocation);

  const coordinateTimeZone = lookupCoordinates(location.coordinates, lookup);
  if (coordinateTimeZone) {
    return buildResolvedTimeZone(
      coordinateTimeZone,
      "coordinates",
      fallbackTimeZoneData,
      location.coordinates,
    );
  }

  if (location.address) {
    const geocoded = await geocode(location.address, options.geocodingOptions);
    const geocodedCoordinates = normalizeCoordinates(geocoded?.latitude, geocoded?.longitude);
    const addressTimeZone = lookupCoordinates(geocodedCoordinates, lookup);
    if (addressTimeZone) {
      return buildResolvedTimeZone(
        addressTimeZone,
        "address",
        fallbackTimeZoneData,
        geocodedCoordinates,
      );
    }
  }

  const fallbackTimeZone = textOrUndefined(fallbackTimeZoneData?.ianaTimezone) ?? "UTC";
  return {
    ...buildResolvedTimeZone(fallbackTimeZone, "fallback", fallbackTimeZoneData),
    errors: fallbackTimeZoneData?.errors ?? [],
  };
}

// Resolve each depot once, using the same saved location/fallback as route detail.
export async function resolveRouteListTimeZones(
  { departureLocation, fallbackTimeZoneData, routePlans = [], routeGroups = [] },
  options = {},
) {
  const plans = new Map();
  for (const group of routeGroups ?? []) {
    for (const child of group.children ?? []) {
      const plan = child.routePlan;
      const id = getRouteGroupChildRoutePlanId(child);
      if (id) plans.set(id, plan ?? {});
    }
  }
  for (const plan of routePlans ?? []) {
    if (plan?.id) plans.set(plan.id, { ...plans.get(plan.id), ...plan });
  }
  const resolvedLocations = new Map();
  return Object.fromEntries(await Promise.all(Array.from(plans, async ([id, routePlan]) => {
    const savedTimeZone = textOrUndefined(routePlan.scheduledStartTimeZone);
    if (savedTimeZone) return [id, savedTimeZone];
    const locationKey = JSON.stringify(getRouteTimeZoneLocation(routePlan, departureLocation));
    if (!resolvedLocations.has(locationKey)) {
      resolvedLocations.set(locationKey, resolveRouteTimeZone({
        departureLocation,
        fallbackTimeZoneData,
        routePlan,
      }, options));
    }
    return [id, (await resolvedLocations.get(locationKey)).ianaTimezone];
  })));
}
