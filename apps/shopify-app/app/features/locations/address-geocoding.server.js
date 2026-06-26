const DEFAULT_GEOCODING_USER_AGENT = "clever-shopify-app";

export async function geocodeAddress(address, options = {}) {
  const query = textOrUndefined(address);
  if (!query) return null;

  const fetchImpl = options.fetchImpl ?? global.fetch;
  if (typeof fetchImpl !== "function") return null;

  try {
    const endpoint = textOrUndefined(options.endpoint) ?? textOrUndefined(process.env.GEOCODING_SEARCH_URL);
    if (!endpoint) return null;

    const url = createGeocodingUrl(query, endpoint);
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": getGeocodingUserAgent(options.userAgent),
      },
    });

    if (!response?.ok) return null;

    const results = await response.json();
    const firstResult = Array.isArray(results) ? results[0] : null;
    const latitude = numberOrUndefined(firstResult?.lat);
    const longitude = numberOrUndefined(firstResult?.lon);

    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return null;
    }

    return {
      latitude,
      longitude,
    };
  } catch {
    return null;
  }
}

function createGeocodingUrl(query, endpoint) {
  const url = new URL(endpoint);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);

  return url;
}

function getGeocodingUserAgent(userAgent) {
  return (
    textOrUndefined(userAgent) ??
    textOrUndefined(process.env.GEOCODING_USER_AGENT) ??
    DEFAULT_GEOCODING_USER_AGENT
  );
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

function isValidLatitude(latitude) {
  return latitude != null && latitude >= -90 && latitude <= 90;
}

function isValidLongitude(longitude) {
  return longitude != null && longitude >= -180 && longitude <= 180;
}
