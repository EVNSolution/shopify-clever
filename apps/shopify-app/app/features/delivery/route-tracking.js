const MAX_RECENT_TRACKING_POSITIONS = 1_000;
const FALLBACK_RECONNECT_DELAY_MS = 3_000;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textOrNull(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function normalizeRouteExecutionStatus(status) {
  const value = textOrNull(status)?.toUpperCase().replace(/[\s-]+/g, "_");
  if (value === "IN_PROGRESS" || value === "COMPLETED" || value === "CANCELLED") return value;
  return "READY";
}

function normalizeTrackingPosition(position) {
  const latitude = numberOrNull(position?.latitude);
  const longitude = numberOrNull(position?.longitude);
  if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return {
    schemaVersion: textOrNull(position?.schemaVersion) ?? "route_tracking.v1",
    routePlanId: textOrNull(position?.routePlanId),
    eventId: textOrNull(position?.eventId),
    driverId: textOrNull(position?.driverId),
    latitude,
    longitude,
    occurredAt: textOrNull(position?.occurredAt),
    receivedAt: textOrNull(position?.receivedAt),
  };
}

function normalizeTrackingProgressEvent(event) {
  const eventType = textOrNull(event?.eventType);
  if (!eventType) return null;
  return {
    schemaVersion: textOrNull(event?.schemaVersion) ?? "route_tracking.v1",
    routePlanId: textOrNull(event?.routePlanId),
    eventId: textOrNull(event?.eventId),
    driverId: textOrNull(event?.driverId),
    deliveryStopId: textOrNull(event?.deliveryStopId),
    eventType,
    occurredAt: textOrNull(event?.occurredAt),
    receivedAt: textOrNull(event?.receivedAt),
  };
}

function getProgressStage(eventType) {
  if (eventType === "ROUTE_COMPLETED") return "COMPLETED";
  if (eventType === "ROUTE_PAUSED") return "PAUSED";
  if (eventType === "STOP_ARRIVED") return "AT_STOP";
  if (eventType) return "DRIVING";
  return "READY";
}

function normalizeTrackingProgress(progress) {
  const latestEvent = normalizeTrackingProgressEvent(progress?.latestEvent);
  return {
    completedStopIds: [...new Set(Array.isArray(progress?.completedStopIds) ? progress.completedStopIds.map(textOrNull).filter(Boolean) : [])],
    currentStage: textOrNull(progress?.currentStage) ?? getProgressStage(latestEvent?.eventType),
    currentStopId: textOrNull(progress?.currentStopId),
    failedStopIds: [...new Set(Array.isArray(progress?.failedStopIds) ? progress.failedStopIds.map(textOrNull).filter(Boolean) : [])],
    latestEvent,
  };
}

function getPositionTimestamp(position) {
  const timestamp = Date.parse(position?.occurredAt ?? position?.receivedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeRouteTrackingSnapshot(snapshot) {
  const recentPositions = (Array.isArray(snapshot?.recentPositions) ? snapshot.recentPositions : [])
    .map(normalizeTrackingPosition)
    .filter(Boolean)
    .sort((left, right) => getPositionTimestamp(left) - getPositionTimestamp(right))
    .slice(-MAX_RECENT_TRACKING_POSITIONS);
  const latestPosition = normalizeTrackingPosition(snapshot?.latestPosition) ?? recentPositions.at(-1) ?? null;

  return {
    schemaVersion: textOrNull(snapshot?.schemaVersion) ?? "route_tracking.v1",
    routePlanId: textOrNull(snapshot?.routePlanId),
    policy: snapshot?.policy && typeof snapshot.policy === "object" ? { ...snapshot.policy } : null,
    progress: normalizeTrackingProgress(snapshot?.progress),
    status: textOrNull(snapshot?.status) ?? (latestPosition ? "LIVE" : "NO_DATA"),
    serverTime: textOrNull(snapshot?.serverTime),
    latestPosition,
    recentPositions,
  };
}

function mergeRouteTrackingProgress(snapshot, event) {
  const normalizedSnapshot = normalizeRouteTrackingSnapshot(snapshot);
  const normalizedEvent = normalizeTrackingProgressEvent(event);
  if (!normalizedEvent) return normalizedSnapshot;

  const previousProgress = normalizedSnapshot.progress;
  const completedStopIds = new Set(previousProgress.completedStopIds);
  const failedStopIds = new Set(previousProgress.failedStopIds);
  if (normalizedEvent.deliveryStopId && normalizedEvent.eventType === "STOP_DELIVERED") {
    completedStopIds.add(normalizedEvent.deliveryStopId);
    failedStopIds.delete(normalizedEvent.deliveryStopId);
  }
  if (normalizedEvent.deliveryStopId && normalizedEvent.eventType === "STOP_FAILED") {
    failedStopIds.add(normalizedEvent.deliveryStopId);
    completedStopIds.delete(normalizedEvent.deliveryStopId);
  }

  const isLatestEvent = getPositionTimestamp(normalizedEvent) >= getPositionTimestamp(previousProgress.latestEvent);
  return {
    ...normalizedSnapshot,
    routePlanId: normalizedSnapshot.routePlanId ?? normalizedEvent.routePlanId,
    progress: {
      completedStopIds: [...completedStopIds],
      currentStage: isLatestEvent ? getProgressStage(normalizedEvent.eventType) : previousProgress.currentStage,
      currentStopId: isLatestEvent && normalizedEvent.eventType === "STOP_ARRIVED"
        ? normalizedEvent.deliveryStopId
        : isLatestEvent ? null : previousProgress.currentStopId,
      failedStopIds: [...failedStopIds],
      latestEvent: isLatestEvent ? normalizedEvent : previousProgress.latestEvent,
    },
  };
}

function mergeRouteTrackingPosition(snapshot, position) {
  const normalizedSnapshot = normalizeRouteTrackingSnapshot(snapshot);
  const normalizedPosition = normalizeTrackingPosition(position);
  if (!normalizedPosition) return normalizedSnapshot;

  const recentPositions = normalizedSnapshot.recentPositions.filter((recentPosition) => (
    normalizedPosition.eventId == null || recentPosition.eventId !== normalizedPosition.eventId
  ));
  recentPositions.push(normalizedPosition);
  recentPositions.sort((left, right) => getPositionTimestamp(left) - getPositionTimestamp(right));

  const latestPosition = getPositionTimestamp(normalizedPosition) >= getPositionTimestamp(normalizedSnapshot.latestPosition)
    ? normalizedPosition
    : normalizedSnapshot.latestPosition;

  return {
    ...normalizedSnapshot,
    routePlanId: normalizedSnapshot.routePlanId ?? normalizedPosition.routePlanId,
    status: "LIVE",
    latestPosition,
    recentPositions: recentPositions.slice(-MAX_RECENT_TRACKING_POSITIONS),
  };
}

function parseSseFrame(frame) {
  let event = "message";
  let eventId = null;
  const dataLines = [];

  for (const line of frame.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const separatorIndex = line.indexOf(":");
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    let value = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value || "message";
    if (field === "id") eventId = value || null;
    if (field === "data") dataLines.push(value);
  }

  if (dataLines.length === 0) return null;
  const rawData = dataLines.join("\n");
  let data = rawData;
  try {
    data = JSON.parse(rawData);
  } catch {
    // Non-JSON SSE data remains usable for diagnostics and forward compatibility.
  }

  return { event, eventId, data };
}

function consumeRouteTrackingSseChunk(buffer, chunk) {
  const normalized = `${buffer ?? ""}${chunk ?? ""}`.replace(/\r\n?/g, "\n");
  const frames = normalized.split("\n\n");
  const remainder = frames.pop() ?? "";

  return {
    events: frames.map(parseSseFrame).filter(Boolean),
    remainder,
  };
}

function getRouteTrackingReconnectDelayMs(snapshot) {
  const configuredDelay = numberOrNull(snapshot?.policy?.streamRetryMs);
  return configuredDelay != null && configuredDelay >= 250
    ? configuredDelay
    : FALLBACK_RECONNECT_DELAY_MS;
}

function getRouteTrackingFreshness(snapshot, now = Date.now()) {
  const latestPosition = snapshot?.latestPosition;
  if (!latestPosition) {
    return { key: "NO_DATA", label: "Waiting for location", ageMs: null };
  }

  const occurredAt = Date.parse(latestPosition.occurredAt ?? latestPosition.receivedAt ?? "");
  if (!Number.isFinite(occurredAt)) {
    return { key: "UNKNOWN", label: "Unknown", ageMs: null };
  }

  const ageMs = Math.max(0, now - occurredAt);
  const liveThresholdMs = numberOrNull(snapshot?.policy?.liveThresholdMs);
  const delayedThresholdMs = numberOrNull(snapshot?.policy?.delayedThresholdMs);
  if (liveThresholdMs == null || delayedThresholdMs == null) {
    const key = textOrNull(snapshot?.status) ?? "UNKNOWN";
    return { key, label: key.replaceAll("_", " ").toLowerCase(), ageMs };
  }
  if (ageMs <= liveThresholdMs) return { key: "LIVE", label: "Live", ageMs };
  if (ageMs <= delayedThresholdMs) return { key: "DELAYED", label: "Delayed", ageMs };
  return { key: "OFFLINE", label: "Offline", ageMs };
}

function getRouteExecutionStatusFromTrackingEvent(currentStatus, event) {
  const status = normalizeRouteExecutionStatus(currentStatus);
  const eventType = textOrNull(event?.eventType);
  if (eventType === "ROUTE_STARTED") return "IN_PROGRESS";
  if (eventType === "ROUTE_PAUSED") return "READY";
  if (eventType === "ROUTE_COMPLETED") return "COMPLETED";
  return status;
}

function getRouteTrackingPresentation(routeStatus, snapshot, now = Date.now()) {
  const executionStatus = normalizeRouteExecutionStatus(routeStatus);
  const hasHistory = Boolean(snapshot?.latestPosition) || (snapshot?.recentPositions?.length ?? 0) > 0;
  if (executionStatus === "IN_PROGRESS") {
    return {
      connectionLabel: null,
      driverStage: snapshot?.progress?.currentStage ?? "DRIVING",
      mode: "live",
      trackingLabel: getRouteTrackingFreshness(snapshot, now).label,
    };
  }
  if (executionStatus === "COMPLETED") {
    return {
      connectionLabel: "closed",
      driverStage: "COMPLETED",
      mode: "history",
      trackingLabel: "Completed",
    };
  }
  if (executionStatus === "CANCELLED") {
    return {
      connectionLabel: "closed",
      driverStage: "READY",
      mode: hasHistory ? "history" : "inactive",
      trackingLabel: "Cancelled",
    };
  }
  return hasHistory
    ? {
        connectionLabel: "closed",
        driverStage: "READY",
        mode: "history",
        trackingLabel: "Tracking stopped",
      }
    : {
        connectionLabel: "inactive",
        driverStage: "READY",
        mode: "inactive",
        trackingLabel: "Not started",
      };
}

export {
  consumeRouteTrackingSseChunk,
  getRouteExecutionStatusFromTrackingEvent,
  getRouteTrackingFreshness,
  getRouteTrackingPresentation,
  getRouteTrackingReconnectDelayMs,
  mergeRouteTrackingProgress,
  mergeRouteTrackingPosition,
  normalizeRouteExecutionStatus,
  normalizeRouteTrackingSnapshot,
};
