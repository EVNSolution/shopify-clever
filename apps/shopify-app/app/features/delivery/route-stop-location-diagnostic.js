const COUNTRY_BOUNDS = {
  CA: { maxLatitude: 83.2, maxLongitude: -52.5, minLatitude: 41.6, minLongitude: -141 },
  KR: { maxLatitude: 39.5, maxLongitude: 132, minLatitude: 33, minLongitude: 124 },
};

const PROVINCE_BOUNDS = {
  ON: { maxLatitude: 56.9, maxLongitude: -74.3, minLatitude: 41.5, minLongitude: -95.2 },
};

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCountryCode(value) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized || null;
}

function normalizeProvince(value) {
  const normalized = typeof value === "string"
    ? value.trim().toUpperCase().replaceAll(/[^A-Z]/gu, "")
    : "";
  if (normalized === "ONTARIO") return "ON";
  return normalized || null;
}

function isInsideBounds(latitude, longitude, bounds) {
  return latitude >= bounds.minLatitude && latitude <= bounds.maxLatitude &&
    longitude >= bounds.minLongitude && longitude <= bounds.maxLongitude;
}

function normalizeServerDiagnostic(diagnostic) {
  if (!diagnostic || !Array.isArray(diagnostic.issues)) return null;
  const severity = diagnostic.severity === "CRITICAL"
    ? "CRITICAL"
    : diagnostic.severity === "WARNING"
      ? "WARNING"
      : "NONE";
  return {
    issues: diagnostic.issues.filter((issue) => typeof issue === "string"),
    routeable: diagnostic.routeable === true,
    severity,
  };
}

export function normalizeRouteStopLocationDiagnostic(stop) {
  const serverDiagnostic = normalizeServerDiagnostic(stop?.locationDiagnostic);
  if (serverDiagnostic) return serverDiagnostic;

  const issues = [];
  const countryCode = normalizeCountryCode(stop?.countryCode ?? stop?.address?.countryCode);
  const province = normalizeProvince(stop?.province ?? stop?.address?.province);
  const latitude = numberOrNull(stop?.latitude ?? stop?.coordinates?.latitude ?? (Array.isArray(stop?.coordinates) ? stop.coordinates[1] : null));
  const longitude = numberOrNull(stop?.longitude ?? stop?.coordinates?.longitude ?? (Array.isArray(stop?.coordinates) ? stop.coordinates[0] : null));
  const hasLatitude = latitude !== null;
  const hasLongitude = longitude !== null;

  if (countryCode !== null && !/^[A-Z]{2}$/u.test(countryCode)) issues.push("COUNTRY_CODE_INVALID");

  if (!hasLatitude && !hasLongitude) {
    issues.push("COORDINATES_MISSING");
  } else if (!hasLatitude || !hasLongitude) {
    issues.push("COORDINATES_PARTIAL");
  } else if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    issues.push("COORDINATES_OUT_OF_RANGE");
  } else if (latitude === 0 && longitude === 0) {
    issues.push("COORDINATES_ZERO");
  } else {
    const countryBounds = countryCode ? COUNTRY_BOUNDS[countryCode] : null;
    if (countryBounds && !isInsideBounds(latitude, longitude, countryBounds)) {
      issues.push("COORDINATES_OUTSIDE_COUNTRY");
    }
    const provinceBounds = province ? PROVINCE_BOUNDS[province] : null;
    if (provinceBounds && !isInsideBounds(latitude, longitude, provinceBounds)) {
      issues.push("COORDINATES_OUTSIDE_PROVINCE");
    }
  }

  if (String(stop?.geocodeStatus ?? "").toUpperCase() === "RESOLVED" && issues.length > 0) {
    issues.push("GEOCODE_STATUS_INCONSISTENT");
  }

  return issues.length === 0
    ? { issues, routeable: true, severity: "NONE" }
    : { issues, routeable: false, severity: "CRITICAL" };
}

export function getRouteStopLocationMessage(diagnostic) {
  const issues = new Set(diagnostic?.issues ?? []);
  if (issues.has("COORDINATES_ZERO") || issues.has("COORDINATES_OUT_OF_RANGE") || issues.has("COUNTRY_CODE_INVALID")) {
    return "Coordinates are invalid and must be corrected.";
  }
  if (issues.has("COORDINATES_OUTSIDE_COUNTRY") || issues.has("COORDINATES_OUTSIDE_PROVINCE")) {
    return "Coordinates do not match the stop's address region.";
  }
  if (issues.has("COORDINATES_MISSING") || issues.has("COORDINATES_PARTIAL")) {
    return "Coordinates are missing and must be confirmed.";
  }
  return diagnostic?.severity === "WARNING" ? "Location needs review." : "Location must be corrected.";
}

export function summarizeRouteStopLocationDiagnostics(stops) {
  return (Array.isArray(stops) ? stops : []).reduce((summary, stop) => {
    const diagnostic = normalizeRouteStopLocationDiagnostic(stop);
    if (diagnostic.severity === "CRITICAL") {
      summary.affectedCount += 1;
      summary.criticalCount += 1;
    } else if (diagnostic.severity === "WARNING") {
      summary.affectedCount += 1;
      summary.warningCount += 1;
    }
    return summary;
  }, { affectedCount: 0, criticalCount: 0, warningCount: 0 });
}
