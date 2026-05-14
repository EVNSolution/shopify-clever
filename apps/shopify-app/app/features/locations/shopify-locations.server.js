export const SHOPIFY_DEPARTURE_LOCATION_QUERY = `#graphql
  query TomatonoRouteDepartureLocation {
    currentAppInstallation {
      id
      metafield(namespace: "tomatono_route", key: "departure_location") {
        value
      }
    }
    location {
      id
      name
      isActive
      address {
        address1
        address2
        city
        provinceCode
        zip
        countryCode
        formatted
        latitude
        longitude
      }
    }
    locations(first: 10, sortKey: NAME) {
      nodes {
        id
        name
        isActive
        address {
          address1
          address2
          city
          provinceCode
          zip
          countryCode
          formatted
          latitude
          longitude
        }
      }
    }
  }
`;

export const CURRENT_APP_INSTALLATION_QUERY = `#graphql
  query TomatonoRouteCurrentAppInstallation {
    currentAppInstallation {
      id
    }
  }
`;

export const SAVE_DEPARTURE_LOCATION_MUTATION = `#graphql
  mutation TomatonoRouteSaveDepartureLocation($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        namespace
        key
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const DEFAULT_DEPARTURE_LOCATION_CACHE_TTL_MS = 30_000;
const departureLocationCache = new Map();

export function clearShopifyDepartureLocationCache() {
  departureLocationCache.clear();
}

export async function fetchShopifyDepartureLocation(admin, options = {}) {
  const cacheKey = normalizeDepartureLocationCacheKey(options.cacheKey);
  const cacheTtlMs = getDepartureLocationCacheTtlMs();

  if (!cacheKey || cacheTtlMs <= 0) {
    return loadShopifyDepartureLocation(admin);
  }

  const now = Date.now();
  const cached = readDepartureLocationCache(cacheKey, now);
  if (cached) return cached;

  const cacheEntry = {
    expiresAt: now + cacheTtlMs,
    promise: loadShopifyDepartureLocation(admin).then((result) => {
      if ((result.errors ?? []).length > 0) {
        departureLocationCache.delete(cacheKey);
      }

      return result;
    }),
  };
  departureLocationCache.set(cacheKey, cacheEntry);

  return cloneDepartureLocationResult(await cacheEntry.promise);
}

async function loadShopifyDepartureLocation(admin) {
  try {
    const response = await admin.graphql(SHOPIFY_DEPARTURE_LOCATION_QUERY);
    const payload = await response.json();

    return {
      departureLocation: mapShopifyDepartureLocationResponse(payload),
      errors: normalizeGraphqlErrors(payload.errors),
    };
  } catch (error) {
    return {
      departureLocation: null,
      errors: [
        {
          message: getErrorMessage(error),
        },
      ],
    };
  }
}

export async function saveShopifyDepartureLocation(admin, input) {
  try {
    const departureLocationInput = normalizeDepartureLocationInput(input);
    const ownerId = await fetchCurrentAppInstallationId(admin);

    if (!ownerId) {
      return {
        departureLocation: null,
        errors: [{ message: "Shopify AppInstallation을 찾지 못했습니다." }],
      };
    }

    const response = await admin.graphql(SAVE_DEPARTURE_LOCATION_MUTATION, {
      variables: {
        metafields: [
          {
            namespace: "tomatono_route",
            key: "departure_location",
            ownerId,
            type: "json",
            value: JSON.stringify(departureLocationInput),
          },
        ],
      },
    });
    const payload = await response.json();
    const userErrors = payload?.data?.metafieldsSet?.userErrors ?? [];
    const errors = normalizeGraphqlErrors(userErrors);

    if (errors.length === 0) {
      clearShopifyDepartureLocationCache();
    }

    return {
      departureLocation: mapSavedDepartureLocation(
        ownerId,
        departureLocationInput,
      ),
      errors,
    };
  } catch (error) {
    return {
      departureLocation: null,
      errors: [
        {
          message: getErrorMessage(error),
        },
      ],
    };
  }
}

function readDepartureLocationCache(cacheKey, now) {
  const cached = departureLocationCache.get(cacheKey);

  if (!cached) return null;
  if (cached.expiresAt <= now) {
    departureLocationCache.delete(cacheKey);
    return null;
  }

  return cached.promise.then(cloneDepartureLocationResult);
}

function getDepartureLocationCacheTtlMs() {
  const configuredTtl = Number(
    process.env.CLEVER_SHOPIFY_DEPARTURE_LOCATION_CACHE_TTL_MS,
  );

  if (process.env.CLEVER_SHOPIFY_DEPARTURE_LOCATION_CACHE_TTL_MS != null) {
    return Number.isFinite(configuredTtl) && configuredTtl >= 0
      ? configuredTtl
      : DEFAULT_DEPARTURE_LOCATION_CACHE_TTL_MS;
  }

  return DEFAULT_DEPARTURE_LOCATION_CACHE_TTL_MS;
}

function normalizeDepartureLocationCacheKey(cacheKey) {
  return textOrUndefined(cacheKey);
}

function cloneDepartureLocationResult(result) {
  if (typeof structuredClone === "function") {
    return structuredClone(result);
  }

  return JSON.parse(JSON.stringify(result));
}

export function mapShopifyDepartureLocationResponse(payload) {
  const savedDepartureLocation = mapSavedDepartureLocationFromMetafield(
    payload?.data?.currentAppInstallation,
  );

  if (savedDepartureLocation) {
    return savedDepartureLocation;
  }

  const location = selectDepartureLocation(payload?.data);
  if (!location?.id) return null;

  return mapShopifyLocation(location);
}

function selectDepartureLocation(data) {
  const primaryLocation = data?.location;
  const locations = Array.isArray(data?.locations?.nodes)
    ? data.locations.nodes
    : [];
  const candidates = [primaryLocation, ...locations].filter((location) => location?.id);
  const activeCandidates = candidates.filter((location) => location.isActive !== false);

  return (
    activeCandidates.find((location) => locationHasCoordinates(location)) ??
    candidates.find((location) => locationHasCoordinates(location)) ??
    activeCandidates[0] ??
    candidates[0] ??
    null
  );
}

function locationHasCoordinates(location) {
  const address = location?.address ?? {};
  return (
    numberOrUndefined(address.latitude) != null &&
    numberOrUndefined(address.longitude) != null
  );
}

function mapShopifyLocation(location) {
  const address = location.address ?? {};
  const latitude = numberOrUndefined(address.latitude);
  const longitude = numberOrUndefined(address.longitude);

  return {
    id: location.id,
    name: textOrUndefined(location.name) ?? "Shopify Location",
    address: formatLocationAddress(address),
    coordinates: [longitude, latitude],
    hasCoordinates: latitude != null && longitude != null,
    source: "Shopify Location",
    isActive: Boolean(location.isActive),
  };
}

function mapSavedDepartureLocationFromMetafield(currentAppInstallation) {
  const value = currentAppInstallation?.metafield?.value;
  if (!value) return null;

  try {
    return mapSavedDepartureLocation(
      `${currentAppInstallation.id}:departure_location`,
      JSON.parse(value),
    );
  } catch {
    return null;
  }
}

function mapSavedDepartureLocation(id, input) {
  const departureLocationInput = normalizeDepartureLocationInput(input);
  const latitude = numberOrUndefined(departureLocationInput.latitude);
  const longitude = numberOrUndefined(departureLocationInput.longitude);

  return {
    id,
    name: departureLocationInput.name,
    address: departureLocationInput.address,
    coordinates: [longitude, latitude],
    hasCoordinates: latitude != null && longitude != null,
    source: "App Settings",
    isActive: true,
  };
}

function normalizeDepartureLocationInput(input) {
  const name = textOrUndefined(getInputValue(input, "name")) ?? "Departure";
  const address =
    textOrUndefined(getInputValue(input, "address")) ?? "No location address";
  const latitude = numberOrUndefined(getInputValue(input, "latitude"));
  const longitude = numberOrUndefined(getInputValue(input, "longitude"));

  return {
    name,
    address,
    latitude,
    longitude,
  };
}

function getInputValue(input, key) {
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    return input.get(key) ?? input.get(`departure${capitalize(key)}`);
  }

  return input?.[key] ?? input?.[`departure${capitalize(key)}`];
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

async function fetchCurrentAppInstallationId(admin) {
  const response = await admin.graphql(CURRENT_APP_INSTALLATION_QUERY);
  const payload = await response.json();

  return payload?.data?.currentAppInstallation?.id;
}

function formatLocationAddress(address) {
  const formatted = Array.isArray(address?.formatted)
    ? address.formatted.map(textOrUndefined).filter(Boolean)
    : [];

  if (formatted.length > 0) {
    return formatted.join(", ");
  }

  const parts = [
    address?.address1,
    address?.address2,
    address?.city,
    address?.provinceCode,
    address?.zip,
    address?.countryCode,
  ]
    .map(textOrUndefined)
    .filter(Boolean);

  return parts.length ? parts.join(", ") : "No location address";
}

function textOrUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function numberOrUndefined(value) {
  if (value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeGraphqlErrors(errors) {
  if (!Array.isArray(errors)) return [];

  return errors.map((error) => ({
    message: getErrorMessage(error),
  }));
}

function getErrorMessage(error) {
  const message = [
    error?.message,
    error?.body?.errors?.message,
    ...(Array.isArray(error?.body?.errors?.graphQLErrors)
      ? error.body.errors.graphQLErrors.map((graphQLError) => graphQLError?.message)
      : []),
    ...(Array.isArray(error?.body?.errors)
      ? error.body.errors.map((graphqlError) => graphqlError?.message)
      : []),
  ]
    .filter(Boolean)
    .join("\n");

  return message || "Shopify Location을 읽지 못했습니다.";
}
