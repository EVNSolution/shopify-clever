const FALLBACK_RECONNECT_DELAY_MS = 3_000;
const FALLBACK_STREAM_INACTIVITY_MS = 45_000;
const EARTH_RADIUS_METERS = 6_371_000;

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
    .sort((left, right) => getPositionTimestamp(left) - getPositionTimestamp(right));
  const latestPosition = normalizeTrackingPosition(snapshot?.latestPosition) ?? recentPositions.at(-1) ?? null;
  const recordedPath = normalizeRecordedPath(snapshot?.recordedPath, latestPosition);

  return {
    schemaVersion: textOrNull(snapshot?.schemaVersion) ?? "route_tracking.v1",
    routePlanId: textOrNull(snapshot?.routePlanId),
    policy: snapshot?.policy && typeof snapshot.policy === "object" ? { ...snapshot.policy } : null,
    progress: normalizeTrackingProgress(snapshot?.progress),
    recordedPath,
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

  const recordedPath = normalizedSnapshot.recordedPath ?? normalizedSnapshot.recentPositions.reduce(
    (path, recentPosition) => mergeRecordedPathPosition(path, recentPosition, normalizedSnapshot.policy),
    null,
  );

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
    recordedPath: mergeRecordedPathPosition(recordedPath, normalizedPosition, normalizedSnapshot.policy),
    recentPositions,
  };
}

function mergeRouteTrackingSnapshot(currentSnapshot, serverSnapshot) {
  const incomingSnapshot = normalizeRouteTrackingSnapshot(serverSnapshot);
  if (!currentSnapshot) return incomingSnapshot;

  const current = normalizeRouteTrackingSnapshot(currentSnapshot);
  if (
    current.routePlanId
    && incomingSnapshot.routePlanId
    && current.routePlanId !== incomingSnapshot.routePlanId
  ) {
    return incomingSnapshot;
  }

  const currentHistorySize = getRouteTrackingHistorySize(current);
  const incomingHistorySize = getRouteTrackingHistorySize(incomingSnapshot);
  const historyBase = incomingHistorySize === currentHistorySize
    ? current.recordedPath && !incomingSnapshot.recordedPath
      ? current
      : incomingSnapshot
    : incomingHistorySize > currentHistorySize ? incomingSnapshot : current;
  const mergedBase = normalizeRouteTrackingSnapshot({
    ...historyBase,
    policy: incomingSnapshot.policy ?? current.policy,
    progress: incomingSnapshot.progress,
    routePlanId: incomingSnapshot.routePlanId ?? current.routePlanId,
    schemaVersion: incomingSnapshot.schemaVersion,
    serverTime: incomingSnapshot.serverTime ?? current.serverTime,
    status: incomingSnapshot.status,
  });
  const baseLatestTimestamp = getRouteTrackingLatestTimestamp(mergedBase);
  const positionsByKey = new Map();
  for (const position of [...getRouteTrackingSnapshotPositions(current), ...getRouteTrackingSnapshotPositions(incomingSnapshot)]) {
    if (getPositionTimestamp(position) <= baseLatestTimestamp) continue;
    positionsByKey.set(getRouteTrackingPositionKey(position), position);
  }
  const newerPositions = [...positionsByKey.values()].sort((left, right) => (
    getPositionTimestamp(left) - getPositionTimestamp(right)
    || (left.eventId ?? "").localeCompare(right.eventId ?? "")
  ));
  const mergedSnapshot = newerPositions.reduce(
    (snapshot, position) => mergeRouteTrackingPosition(snapshot, position),
    mergedBase,
  );
  const currentProgressEvent = current.progress.latestEvent;
  if (
    currentProgressEvent
    && getPositionTimestamp(currentProgressEvent) > getPositionTimestamp(mergedSnapshot.progress.latestEvent)
  ) {
    return mergeRouteTrackingProgress(mergedSnapshot, currentProgressEvent);
  }
  return mergedSnapshot;
}

function getRouteTrackingHistorySize(snapshot) {
  return snapshot.recordedPath?.sourcePointCount
    ?? Math.max(snapshot.recentPositions.length, snapshot.latestPosition ? 1 : 0);
}

function getRouteTrackingLatestTimestamp(snapshot) {
  const recordedPathTimestamp = Date.parse(snapshot.recordedPath?.lastOccurredAt ?? "");
  return Math.max(
    getPositionTimestamp(snapshot.latestPosition),
    Number.isFinite(recordedPathTimestamp) ? recordedPathTimestamp : 0,
  );
}

function getRouteTrackingSnapshotPositions(snapshot) {
  const positions = [...snapshot.recentPositions];
  if (snapshot.latestPosition) positions.push(snapshot.latestPosition);
  return positions;
}

function getRouteTrackingPositionKey(position) {
  return position.eventId
    ?? `${position.occurredAt ?? position.receivedAt ?? ""}:${position.latitude}:${position.longitude}`;
}

function normalizeRecordedPath(recordedPath, latestPosition) {
  if (!recordedPath || typeof recordedPath !== "object") return null;
  const geometryCoordinates = recordedPath.geometry?.type === "LineString" && Array.isArray(recordedPath.geometry.coordinates)
    ? recordedPath.geometry.coordinates.map(normalizeCoordinatePair).filter(Boolean)
    : [];
  const samples = (Array.isArray(recordedPath.samples) ? recordedPath.samples : [])
    .map(normalizeRecordedPathSample)
    .filter(Boolean);
  const coordinates = geometryCoordinates.length === 0 && samples.length === 1 && latestPosition
    ? [[latestPosition.longitude, latestPosition.latitude]]
    : geometryCoordinates;
  const usableLength = Math.min(coordinates.length, samples.length);
  if (usableLength === 0) return null;

  return {
    firstOccurredAt: textOrNull(recordedPath.firstOccurredAt) ?? samples[0]?.occurredAt ?? null,
    geometry: {
      coordinates: coordinates.slice(0, usableLength),
      type: "LineString",
    },
    geometryPointCount: usableLength,
    lastOccurredAt: textOrNull(recordedPath.lastOccurredAt) ?? samples[usableLength - 1]?.occurredAt ?? null,
    lastReceivedAt: textOrNull(recordedPath.lastReceivedAt) ?? samples[usableLength - 1]?.receivedAt ?? null,
    samples: samples.slice(0, usableLength),
    schemaVersion: textOrNull(recordedPath.schemaVersion) ?? "route_tracking_geometry.v1",
    sourcePointCount: Math.max(numberOrNull(recordedPath.sourcePointCount) ?? usableLength, usableLength),
  };
}

function normalizeRecordedPathSample(sample) {
  const eventId = textOrNull(sample?.eventId);
  const occurredAt = textOrNull(sample?.occurredAt);
  const receivedAt = textOrNull(sample?.receivedAt);
  if (!eventId || !occurredAt || !receivedAt) return null;
  return {
    driverId: textOrNull(sample?.driverId),
    eventId,
    occurredAt,
    receivedAt,
  };
}

function normalizeCoordinatePair(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
  const longitude = numberOrNull(coordinate[0]);
  const latitude = numberOrNull(coordinate[1]);
  if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return [longitude, latitude];
}

function mergeRecordedPathPosition(recordedPath, position, policy) {
  const current = recordedPath ?? {
    firstOccurredAt: position.occurredAt ?? position.receivedAt,
    geometry: { coordinates: [], type: "LineString" },
    geometryPointCount: 0,
    lastOccurredAt: null,
    lastReceivedAt: null,
    samples: [],
    schemaVersion: "route_tracking_geometry.v1",
    sourcePointCount: 0,
  };
  if (current.samples.some((sample) => sample.eventId === position.eventId)) return current;
  const coordinate = [position.longitude, position.latitude];
  const sample = {
    driverId: position.driverId,
    eventId: position.eventId,
    occurredAt: position.occurredAt ?? position.receivedAt,
    receivedAt: position.receivedAt ?? position.occurredAt,
  };
  const latestSample = current.samples.at(-1);
  if (latestSample && getPositionTimestamp(sample) < getPositionTimestamp(latestSample)) {
    const orderedPoints = current.samples
      .map((existingSample, index) => ({
        coordinate: current.geometry.coordinates[index],
        sample: existingSample,
      }))
      .filter((point) => point.coordinate)
      .concat({ coordinate, sample })
      .sort((left, right) => (
        getPositionTimestamp(left.sample) - getPositionTimestamp(right.sample)
        || left.sample.eventId.localeCompare(right.sample.eventId)
      ));
    const rebuilt = orderedPoints.reduce((path, point) => {
      appendCompressedTrackingPoint(path.coordinates, path.samples, point.coordinate, point.sample, policy);
      return path;
    }, { coordinates: [], samples: [] });
    return buildMergedRecordedPath(current, rebuilt.coordinates, rebuilt.samples, current.sourcePointCount + 1);
  }

  const coordinates = [...current.geometry.coordinates];
  const samples = [...current.samples];
  appendCompressedTrackingPoint(coordinates, samples, coordinate, sample, policy);
  return buildMergedRecordedPath(current, coordinates, samples, current.sourcePointCount + 1);
}

function appendCompressedTrackingPoint(coordinates, samples, coordinate, sample, policy) {
  const previousSample = samples.at(-1);
  const gapThresholdMs = numberOrNull(policy?.delayedThresholdMs) ?? 180_000;
  const simplificationToleranceMeters = numberOrNull(policy?.geometrySimplificationToleranceMeters) ?? 5;
  const hasGap = previousSample
    && getPositionTimestamp(sample) - getPositionTimestamp(previousSample) > gapThresholdMs;
  const canReplaceTail = !hasGap
    && coordinates.length >= 2
    && distancePointToSegmentMeters(coordinates.at(-1), coordinates.at(-2), coordinate) <= simplificationToleranceMeters;

  if (canReplaceTail) {
    coordinates[coordinates.length - 1] = coordinate;
    samples[samples.length - 1] = sample;
  } else {
    coordinates.push(coordinate);
    samples.push(sample);
  }
}

function buildMergedRecordedPath(current, coordinates, samples, sourcePointCount) {
  const first = samples[0];
  const last = samples.at(-1);
  return {
    ...current,
    firstOccurredAt: first?.occurredAt ?? current.firstOccurredAt,
    geometry: { coordinates, type: "LineString" },
    geometryPointCount: coordinates.length,
    lastOccurredAt: last?.occurredAt ?? current.lastOccurredAt,
    lastReceivedAt: last?.receivedAt ?? current.lastReceivedAt,
    samples,
    sourcePointCount,
  };
}

function getRouteTrackingPathPoints(snapshot) {
  const normalized = normalizeRouteTrackingSnapshot(snapshot);
  if (normalized.recordedPath) {
    return normalized.recordedPath.geometry.coordinates.map((coordinate, index) => {
      const sample = normalized.recordedPath.samples[index];
      return {
        coordinates: coordinate,
        driverId: sample?.driverId ?? null,
        eventId: sample?.eventId ?? null,
        occurredAt: sample?.occurredAt ?? null,
        receivedAt: sample?.receivedAt ?? null,
      };
    });
  }
  return normalized.recentPositions.map((position) => ({
    coordinates: [position.longitude, position.latitude],
    driverId: position.driverId,
    eventId: position.eventId,
    occurredAt: position.occurredAt,
    receivedAt: position.receivedAt,
  }));
}

function getRouteTrackingPathSummary(snapshot) {
  const normalized = normalizeRouteTrackingSnapshot(snapshot);
  const points = getRouteTrackingPathPoints(normalized);
  const gapThresholdMs = numberOrNull(normalized.policy?.delayedThresholdMs) ?? 180_000;
  const gapCount = points.reduce((count, point, index) => {
    const previous = points[index - 1];
    if (!previous) return count;
    return getPositionTimestamp(point) - getPositionTimestamp(previous) > gapThresholdMs ? count + 1 : count;
  }, 0);
  return {
    firstOccurredAt: normalized.recordedPath?.firstOccurredAt ?? points[0]?.occurredAt ?? null,
    gapCount,
    geometryPointCount: normalized.recordedPath?.geometryPointCount ?? points.length,
    lastOccurredAt: normalized.recordedPath?.lastOccurredAt ?? points.at(-1)?.occurredAt ?? null,
    sourcePointCount: normalized.recordedPath?.sourcePointCount ?? points.length,
  };
}

function distancePointToSegmentMeters(point, segmentStart, segmentEnd) {
  const referenceLatitude = toRadians((point[1] + segmentStart[1] + segmentEnd[1]) / 3);
  const project = ([longitude, latitude]) => [
    EARTH_RADIUS_METERS * toRadians(longitude) * Math.cos(referenceLatitude),
    EARTH_RADIUS_METERS * toRadians(latitude),
  ];
  const projectedPoint = project(point);
  const projectedStart = project(segmentStart);
  const projectedEnd = project(segmentEnd);
  const deltaX = projectedEnd[0] - projectedStart[0];
  const deltaY = projectedEnd[1] - projectedStart[1];
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return Math.hypot(projectedPoint[0] - projectedStart[0], projectedPoint[1] - projectedStart[1]);
  const ratio = Math.max(0, Math.min(1, (
    (projectedPoint[0] - projectedStart[0]) * deltaX
    + (projectedPoint[1] - projectedStart[1]) * deltaY
  ) / lengthSquared));
  return Math.hypot(
    projectedPoint[0] - (projectedStart[0] + ratio * deltaX),
    projectedPoint[1] - (projectedStart[1] + ratio * deltaY),
  );
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
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

function getRouteTrackingStreamInactivityMs(snapshot) {
  const heartbeatMs = numberOrNull(snapshot?.policy?.heartbeatMs);
  return heartbeatMs != null && heartbeatMs >= 1_000
    ? Math.max(FALLBACK_STREAM_INACTIVITY_MS, heartbeatMs * 3)
    : FALLBACK_STREAM_INACTIVITY_MS;
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

function doesTrackingEventRefreshEta(event) {
  const eventType = textOrNull(event?.eventType);
  return eventType === "ROUTE_STARTED" || eventType === "STOP_ARRIVED";
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
  doesTrackingEventRefreshEta,
  getRouteExecutionStatusFromTrackingEvent,
  getRouteTrackingPathPoints,
  getRouteTrackingPathSummary,
  getRouteTrackingFreshness,
  getRouteTrackingPresentation,
  getRouteTrackingReconnectDelayMs,
  getRouteTrackingStreamInactivityMs,
  mergeRouteTrackingProgress,
  mergeRouteTrackingPosition,
  mergeRouteTrackingSnapshot,
  normalizeRouteExecutionStatus,
  normalizeRouteTrackingSnapshot,
};
