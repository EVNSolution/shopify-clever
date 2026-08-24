function countOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function pill(key, label, tone, ariaLabel = label) {
  return { ariaLabel, key, label, tone };
}

function normalizeLifecycle(status) {
  const value = String(status ?? "UNKNOWN").trim().toUpperCase().replace(/[\s-]+/g, "_");
  const values = {
    CANCELLED: ["Route cancelled", "critical"],
    COMPLETED: ["Route completed", "success"],
    DRAFT: ["Route draft", "neutral"],
    IN_PROGRESS: ["Route in progress", "info"],
    READY: ["Route ready", "info"],
  };
  const [label, tone] = values[value] ?? ["Route unknown", "neutral"];
  return pill("lifecycle", label, tone, `Route lifecycle: ${label.slice(6)}`);
}

function mapGps(physicalPosition) {
  if (!physicalPosition) {
    return [
      pill("gps-freshness", "GPS unknown", "neutral", "GPS freshness: unknown"),
      pill("gps-position", "GPS position unknown", "neutral"),
    ];
  }

  const freshness = String(physicalPosition.freshness ?? "UNKNOWN").toUpperCase();
  const freshnessValues = {
    AGING: ["GPS aging", "warning"],
    FRESH: ["GPS fresh", "success"],
    STALE: ["GPS stale", "critical"],
    UNKNOWN: ["GPS unknown", "neutral"],
  };
  const [freshnessLabel, freshnessTone] = freshnessValues[freshness] ?? freshnessValues.UNKNOWN;
  const freshnessPill = pill("gps-freshness", freshnessLabel, freshnessTone, `GPS freshness: ${freshnessLabel.slice(4)}`);

  if (physicalPosition.reliableForProximity !== true) {
    return [freshnessPill, pill("gps-position", "GPS position uncertain", "warning", "GPS position: low confidence")];
  }

  const stopSequence = countOrNull(physicalPosition.nearestStopSequence);
  if (physicalPosition.withinProximityThreshold === true && stopSequence !== null) {
    return [freshnessPill, pill("gps-position", `GPS Stop ${stopSequence} nearby`, "info", `GPS position: near Stop ${stopSequence}`)];
  }
  if (physicalPosition.withinProximityThreshold === false) {
    return [freshnessPill, pill("gps-position", "GPS not near stop", "warning")];
  }
  return [freshnessPill, pill("gps-position", "GPS position unknown", "neutral")];
}

function mapDevice(deviceProgress) {
  const completed = countOrNull(deviceProgress?.completedStopCount);
  const total = countOrNull(deviceProgress?.totalStopCount);
  if (completed === null || total === null) return pill("device", "Device unknown", "neutral", "Device progress: unknown");
  return pill("device", `Device ${completed}/${total}`, deviceProgress.locallyFinished ? "success" : "info", `Device progress: ${completed} of ${total}`);
}

function mapServer(serverProgress) {
  const resolved = countOrNull(serverProgress?.resolvedStopCount);
  const total = countOrNull(serverProgress?.totalStopCount);
  if (resolved === null || total === null) return pill("server", "Server unknown", "neutral", "Server progress: unknown");
  return pill("server", `Server ${resolved}/${total}`, resolved >= total && total > 0 ? "success" : "info", `Server progress: ${resolved} of ${total}`);
}

function mapSync(syncHealth) {
  const state = String(syncHealth?.state ?? "UNKNOWN").toUpperCase();
  const values = {
    BLOCKED: ["Sync blocked", "critical"],
    DELAYED: ["Sync delayed", "warning"],
    HEALTHY: ["Sync healthy", "success"],
    UNKNOWN: ["Sync unknown", "neutral"],
  };
  const [label, tone] = values[state] ?? values.UNKNOWN;
  return pill("sync", label, tone, `Sync state: ${label.slice(5)}`);
}

function mapGap(deviceProgress, serverProgress, syncHealth) {
  const device = countOrNull(deviceProgress?.completedStopCount);
  const server = countOrNull(serverProgress?.resolvedStopCount);
  if (device === null || server === null) return pill("gap", "Gap unknown", "neutral", "Device to server gap: unknown");
  if (device > server) {
    const gap = device - server;
    return pill("gap", `Device ahead ${gap} stops`, "warning", `Progress gap: device ahead by ${gap} stops`);
  }
  if (server > device) {
    const gap = server - device;
    return pill("gap", `Server ahead ${gap} stops`, "warning", `Progress gap: server ahead by ${gap} stops`);
  }
  if (String(syncHealth?.state ?? "UNKNOWN").toUpperCase() === "BLOCKED") {
    return pill("gap", "Gap blocked", "critical", "Progress counts match, but sync is blocked");
  }
  return pill("gap", "Gap none", "success", "Device and server progress counts match");
}

function mapAlert(operationalState, lifecycle, serverProgress, positionMismatch) {
  const hasAlertEvidence = Array.isArray(operationalState?.activeAlerts);
  const activeAlerts = hasAlertEvidence
    ? operationalState.activeAlerts.filter((alert) => !alert?.resolvedAt)
    : [];
  const hasCritical = activeAlerts.some((alert) => String(alert?.severity).toUpperCase() === "CRITICAL");
  if (hasCritical) return pill("alert", "Alert critical", "critical", "Active operational alert: critical");
  if (activeAlerts.length > 0) return pill("alert", "Alert warning", "warning", "Active operational alert: warning");
  if (positionMismatch) {
    return pill(
      "alert",
      "Alert warning",
      "warning",
      `Operational alert: current position is ahead with at least ${positionMismatch.earlierUnresolvedCount} earlier stop results unresolved`,
    );
  }

  const resolved = countOrNull(serverProgress?.resolvedStopCount);
  const total = countOrNull(serverProgress?.totalStopCount);
  if (lifecycle.label === "Route completed" && resolved !== null && total !== null && resolved < total) {
    return pill("alert", "Alert unresolved results", "critical", `Operational alert: route completed with ${total - resolved} unresolved stop results`);
  }
  return hasAlertEvidence
    ? pill("alert", "Alert none", "success", "Active operational alerts: none")
    : pill("alert", "Alert unknown", "neutral", "Active operational alerts: unknown");
}

function normalizePositionMismatch(positionMismatch) {
  if (!positionMismatch) return null;
  const nearestStopSequence = countOrNull(positionMismatch.nearestStopSequence);
  const resolvedStopCount = countOrNull(positionMismatch.resolvedStopCount);
  const totalStopCount = countOrNull(positionMismatch.totalStopCount);
  const earlierUnresolvedCount = countOrNull(positionMismatch.earlierUnresolvedCount);
  if (nearestStopSequence === null
    || nearestStopSequence < 1
    || resolvedStopCount === null
    || totalStopCount === null
    || totalStopCount < 1
    || earlierUnresolvedCount === null
    || earlierUnresolvedCount < 1) {
    return null;
  }

  return { earlierUnresolvedCount, nearestStopSequence, resolvedStopCount, totalStopCount };
}

function mapCurrentPositionAlert(positionMismatch, { alert, gap, gpsFreshness, gpsPosition, server, sync }) {
  if (!positionMismatch) return null;

  const { earlierUnresolvedCount, nearestStopSequence, resolvedStopCount, totalStopCount } = positionMismatch;

  return {
    message: `GPS is near Stop ${nearestStopSequence}. The server confirms ${resolvedStopCount} of ${totalStopCount} stop results. At least ${earlierUnresolvedCount} earlier planned stop${earlierUnresolvedCount === 1 ? "" : "s"} still ${earlierUnresolvedCount === 1 ? "has" : "have"} no result. GPS proximity does not confirm delivery.`,
    pills: [alert, gpsFreshness, gpsPosition, server, gap, sync],
    title: "Current position is ahead of server results",
    tone: "warning",
  };
}

export function mapRouteOperationalState({ operationalState = null, positionMismatch = null, routeStatus = null } = {}) {
  const lifecycle = normalizeLifecycle(operationalState?.routeStatus ?? routeStatus);
  const [gpsFreshness, gpsPosition] = mapGps(operationalState?.physicalPosition);
  const device = mapDevice(operationalState?.deviceProgress);
  const server = mapServer(operationalState?.serverProgress);
  const sync = mapSync(operationalState?.syncHealth);
  const gap = mapGap(
    operationalState?.deviceProgress,
    operationalState?.serverProgress,
    operationalState?.syncHealth,
  );
  const normalizedPositionMismatch = normalizePositionMismatch(positionMismatch);
  const alert = mapAlert(operationalState, lifecycle, operationalState?.serverProgress, normalizedPositionMismatch);
  const currentPositionAlert = mapCurrentPositionAlert(normalizedPositionMismatch, {
    alert,
    gap,
    gpsFreshness,
    gpsPosition,
    server,
    sync,
  });
  return {
    alert,
    currentPositionAlert,
    device,
    gap,
    gpsFreshness,
    gpsPosition,
    lifecycle,
    pills: [lifecycle, gpsFreshness, gpsPosition, device, server, sync, gap, alert],
    server,
    sync,
  };
}

const SETTINGS_HEALTH_LABELS = [
  ["webhookIngest", "Webhook ingest"],
  ["webhookConsumer", "Webhook consumer"],
  ["emailSender", "Email sender"],
  ["emailOutbox", "Email outbox"],
  ["syncDetector", "Sync detector"],
  ["trackingStream", "Tracking stream"],
  ["alertStream", "Alert stream"],
  ["externalLogSink", "External log sink"],
  ["shopifyToken", "Shopify token"],
];

function classifyHealthStatus(status) {
  if (["healthy", "ok", "active", "connected"].includes(status)) {
    return ["healthy", "success"];
  }
  if (status === "checking") {
    return ["checking", "info"];
  }
  if (["failed", "error", "blocked", "unavailable"].includes(status)) {
    return [status, "critical"];
  }
  if (["delayed", "stale", "degraded"].includes(status)) {
    return [status, "warning"];
  }
  return ["unknown", "neutral"];
}

export function mapSettingsOperationalHealth(health = {}) {
  return SETTINGS_HEALTH_LABELS.map(([key, label]) => {
    const rawStatus = key === "shopifyToken" ? health[key]?.status : health[key]?.status ?? health[key];
    const status = String(rawStatus ?? "unknown").toLowerCase();
    const state = classifyHealthStatus(status);
    return pill(key, `${label} ${state[0]}`, state[1], `${label} health: ${state[0]}`);
  });
}
