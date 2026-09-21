const FALLBACK_RECONNECT_DELAY_MS = 3_000;
const FALLBACK_STREAM_INACTIVITY_MS = 45_000;
const EARTH_RADIUS_METERS = 6_371_000;
const RAW_FALLBACK_MIN_MOVEMENT_METERS = 12;
const RAW_FALLBACK_MAX_SPEED_METERS_PER_SECOND = 55;
const RAW_FALLBACK_MAX_ACCURACY_METERS = 100;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textOrNull(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function nonNegativeNumberOrNull(value) {
  if (value == null) return null;
  const number = numberOrNull(value);
  return number != null && number >= 0 ? number : null;
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
    accuracyMeters: nonNegativeNumberOrNull(position?.accuracyMeters),
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

function normalizeTrackingStopArrival(arrival) {
  const deliveryStopId = textOrNull(arrival?.deliveryStopId);
  const driverId = textOrNull(arrival?.driverId);
  const eventId = textOrNull(arrival?.eventId);
  const occurredAt = textOrNull(arrival?.occurredAt);
  const routePlanId = textOrNull(arrival?.routePlanId);
  if (!deliveryStopId || !driverId || !eventId || !occurredAt || !routePlanId) return null;

  const latitude = arrival?.latitude == null ? null : numberOrNull(arrival.latitude);
  const longitude = arrival?.longitude == null ? null : numberOrNull(arrival.longitude);
  const hasCoordinate = latitude != null
    && longitude != null
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
  const rawStopSequence = arrival?.stopSequence == null ? null : numberOrNull(arrival.stopSequence);
  const stopSequence = Number.isInteger(rawStopSequence) && rawStopSequence > 0 ? rawStopSequence : null;
  const rawPositionAgeMs = arrival?.positionAgeMs == null ? null : numberOrNull(arrival.positionAgeMs);
  const positionSource = textOrNull(arrival?.positionSource);

  return {
    deliveryStopId,
    driverId,
    eventId,
    latitude: hasCoordinate ? latitude : null,
    longitude: hasCoordinate ? longitude : null,
    occurredAt,
    positionAgeMs: rawPositionAgeMs != null && rawPositionAgeMs >= 0 ? rawPositionAgeMs : null,
    positionSource: hasCoordinate && positionSource === "event"
      ? "event"
      : hasCoordinate ? "nearest_location" : "unavailable",
    receivedAt: textOrNull(arrival?.receivedAt),
    routePlanId,
    schemaVersion: textOrNull(arrival?.schemaVersion) ?? "route_tracking_arrival.v1",
    stopSequence,
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

function normalizeExecutionEvidenceEvent(event) {
  if (!event || typeof event !== "object") return null;
  return {
    eventId: textOrNull(event.eventId),
    latitude: event.latitude == null ? null : numberOrNull(event.latitude),
    longitude: event.longitude == null ? null : numberOrNull(event.longitude),
    occurredAt: textOrNull(event.occurredAt),
    receivedAt: textOrNull(event.receivedAt),
  };
}

function normalizeRouteExecutionEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") return null;
  const returnStatus = textOrNull(evidence.returnToDepot?.status)?.toUpperCase();
  const returnSource = textOrNull(evidence.returnToDepot?.source)?.toUpperCase();
  const returnToDepot = evidence.returnToDepot && typeof evidence.returnToDepot === "object"
    ? {
        distanceToDepotMeters: evidence.returnToDepot.distanceToDepotMeters == null
          ? null
          : numberOrNull(evidence.returnToDepot.distanceToDepotMeters),
        evidenceEventId: textOrNull(evidence.returnToDepot.evidenceEventId),
        observedAt: textOrNull(evidence.returnToDepot.observedAt),
        source: ["LOCATION_UPDATED", "ROUTE_COMPLETED", "NONE"].includes(returnSource) ? returnSource : "NONE",
        status: ["CONFIRMED", "UNCONFIRMED", "UNAVAILABLE", "NOT_REQUIRED"].includes(returnStatus)
          ? returnStatus
          : "UNAVAILABLE",
        thresholdMeters: evidence.returnToDepot.thresholdMeters == null
          ? null
          : numberOrNull(evidence.returnToDepot.thresholdMeters),
      }
    : null;
  return {
    completion: normalizeExecutionEvidenceEvent(evidence.completion),
    firstPosition: normalizeTrackingPosition(evidence.firstPosition),
    lastPosition: normalizeTrackingPosition(evidence.lastPosition),
    returnToDepot,
    routeEndMode: textOrNull(evidence.routeEndMode),
    schemaVersion: textOrNull(evidence.schemaVersion),
    start: normalizeExecutionEvidenceEvent(evidence.start),
    timeSemantics: textOrNull(evidence.timeSemantics),
  };
}

function getPositionTimestamp(position) {
  const timestamp = Date.parse(position?.occurredAt ?? position?.receivedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isRouteTrackingPayloadForRoute(payload, routePlanId) {
  const expectedRoutePlanId = textOrNull(routePlanId);
  const payloadRoutePlanId = textOrNull(payload?.routePlanId);
  return !expectedRoutePlanId || !payloadRoutePlanId || expectedRoutePlanId === payloadRoutePlanId;
}

function normalizeRouteTrackingSnapshot(snapshot) {
  const recentPositions = (Array.isArray(snapshot?.recentPositions) ? snapshot.recentPositions : [])
    .map(normalizeTrackingPosition)
    .filter(Boolean)
    .sort((left, right) => getPositionTimestamp(left) - getPositionTimestamp(right));
  const explicitLatestPosition = normalizeTrackingPosition(snapshot?.latestPosition);
  const latestRecentPosition = recentPositions.at(-1) ?? null;
  const latestPosition = explicitLatestPosition && latestRecentPosition
    ? getPositionTimestamp(latestRecentPosition) > getPositionTimestamp(explicitLatestPosition)
      ? latestRecentPosition
      : explicitLatestPosition
    : explicitLatestPosition ?? latestRecentPosition;
  const recordedPath = normalizeRecordedPath(snapshot?.recordedPath, latestPosition);
  const stopArrivals = (Array.isArray(snapshot?.stopArrivals) ? snapshot.stopArrivals : [])
    .map(normalizeTrackingStopArrival)
    .filter(Boolean)
    .sort((left, right) => getPositionTimestamp(left) - getPositionTimestamp(right));

  return {
    executionEvidence: normalizeRouteExecutionEvidence(snapshot?.executionEvidence),
    schemaVersion: textOrNull(snapshot?.schemaVersion) ?? "route_tracking.v1",
    routePlanId: textOrNull(snapshot?.routePlanId),
    policy: snapshot?.policy && typeof snapshot.policy === "object" ? { ...snapshot.policy } : null,
    progress: normalizeTrackingProgress(snapshot?.progress),
    recordedPath,
    roadMatchedPath: normalizeRoadMatchedPath(snapshot?.roadMatchedPath),
    status: textOrNull(snapshot?.status) ?? (latestPosition ? "LIVE" : "NO_DATA"),
    stopArrivals,
    serverTime: textOrNull(snapshot?.serverTime),
    latestPosition,
    recentPositions,
  };
}

function mergeRouteTrackingProgress(snapshot, event) {
  const normalizedSnapshot = normalizeRouteTrackingSnapshot(snapshot);
  const normalizedEvent = normalizeTrackingProgressEvent(event);
  if (!normalizedEvent || !isRouteTrackingPayloadForRoute(normalizedEvent, normalizedSnapshot.routePlanId)) {
    return normalizedSnapshot;
  }

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
  const stopArrivals = [...normalizedSnapshot.stopArrivals];
  if (
    normalizedEvent.eventType === "STOP_ARRIVED"
    && !stopArrivals.some((arrival) => arrival.eventId === normalizedEvent.eventId)
  ) {
    const provisionalArrival = buildProvisionalStopArrival(normalizedSnapshot, normalizedEvent);
    if (provisionalArrival) stopArrivals.push(provisionalArrival);
  }
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
    stopArrivals,
  };
}

function buildProvisionalStopArrival(snapshot, event) {
  if (!event.deliveryStopId || !event.driverId || !event.eventId || !event.occurredAt || !event.routePlanId) return null;
  const eventTimestamp = getPositionTimestamp(event);
  const nearestPoint = getRouteTrackingPathPoints(snapshot).reduce((nearest, point) => {
    if (point.driverId !== event.driverId) return nearest;
    const pointTimestamp = getPositionTimestamp(point);
    if (!pointTimestamp) return nearest;
    const ageMs = Math.abs(eventTimestamp - pointTimestamp);
    return nearest === null || ageMs < nearest.ageMs ? { ageMs, point } : nearest;
  }, null);
  const thresholdMs = numberOrNull(snapshot.policy?.delayedThresholdMs) ?? 180_000;
  const canUseNearestPoint = nearestPoint !== null && nearestPoint.ageMs <= thresholdMs;
  return normalizeTrackingStopArrival({
    deliveryStopId: event.deliveryStopId,
    driverId: event.driverId,
    eventId: event.eventId,
    latitude: canUseNearestPoint ? nearestPoint.point.coordinates[1] : null,
    longitude: canUseNearestPoint ? nearestPoint.point.coordinates[0] : null,
    occurredAt: event.occurredAt,
    positionAgeMs: nearestPoint?.ageMs ?? null,
    positionSource: canUseNearestPoint ? "nearest_location" : "unavailable",
    receivedAt: event.receivedAt,
    routePlanId: event.routePlanId,
    schemaVersion: "route_tracking_arrival.v1",
    stopSequence: null,
  });
}

function mergeRouteTrackingPosition(snapshot, position) {
  const normalizedSnapshot = normalizeRouteTrackingSnapshot(snapshot);
  const normalizedPosition = normalizeTrackingPosition(position);
  if (!normalizedPosition || !isRouteTrackingPayloadForRoute(normalizedPosition, normalizedSnapshot.routePlanId)) {
    return normalizedSnapshot;
  }

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
    executionEvidence: incomingSnapshot.executionEvidence ?? current.executionEvidence,
    policy: incomingSnapshot.policy ?? current.policy,
    progress: mergeTrackingProgressSnapshot(current.progress, incomingSnapshot.progress),
    roadMatchedPath: getNewestRoadMatchedPath(current.roadMatchedPath, incomingSnapshot.roadMatchedPath),
    routePlanId: incomingSnapshot.routePlanId ?? current.routePlanId,
    schemaVersion: incomingSnapshot.schemaVersion,
    serverTime: incomingSnapshot.serverTime ?? current.serverTime,
    status: incomingSnapshot.status,
    stopArrivals: mergeTrackingStopArrivals(current.stopArrivals, incomingSnapshot.stopArrivals),
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

function mergeTrackingProgressSnapshot(currentProgress, incomingProgress) {
  const currentLatestEvent = currentProgress?.latestEvent ?? null;
  const incomingLatestEvent = incomingProgress?.latestEvent ?? null;
  const currentLatestTimestamp = getPositionTimestamp(currentLatestEvent);
  const incomingLatestTimestamp = getPositionTimestamp(incomingLatestEvent);
  const latestEvent = incomingLatestEvent && incomingLatestTimestamp >= currentLatestTimestamp
    ? incomingLatestEvent
    : currentLatestEvent;
  const completedStopIds = new Set(currentProgress?.completedStopIds ?? []);
  const failedStopIds = new Set(currentProgress?.failedStopIds ?? []);

  for (const deliveryStopId of incomingProgress?.completedStopIds ?? []) {
    completedStopIds.add(deliveryStopId);
    failedStopIds.delete(deliveryStopId);
  }
  for (const deliveryStopId of incomingProgress?.failedStopIds ?? []) {
    failedStopIds.add(deliveryStopId);
    completedStopIds.delete(deliveryStopId);
  }

  if (latestEvent?.deliveryStopId && latestEvent.eventType === "STOP_DELIVERED") {
    completedStopIds.add(latestEvent.deliveryStopId);
    failedStopIds.delete(latestEvent.deliveryStopId);
  }
  if (latestEvent?.deliveryStopId && latestEvent.eventType === "STOP_FAILED") {
    failedStopIds.add(latestEvent.deliveryStopId);
    completedStopIds.delete(latestEvent.deliveryStopId);
  }

  return {
    completedStopIds: [...completedStopIds],
    currentStage: latestEvent
      ? getProgressStage(latestEvent.eventType)
      : incomingProgress?.currentStage ?? currentProgress?.currentStage ?? "READY",
    currentStopId: latestEvent
      ? latestEvent.eventType === "STOP_ARRIVED" ? latestEvent.deliveryStopId : null
      : incomingProgress?.currentStopId ?? currentProgress?.currentStopId ?? null,
    failedStopIds: [...failedStopIds],
    latestEvent,
  };
}

function mergeTrackingStopArrivals(currentArrivals, incomingArrivals) {
  const arrivalsByEventId = new Map();
  for (const arrival of currentArrivals) arrivalsByEventId.set(arrival.eventId, arrival);
  for (const arrival of incomingArrivals) arrivalsByEventId.set(arrival.eventId, arrival);
  return [...arrivalsByEventId.values()].sort((left, right) => (
    getPositionTimestamp(left) - getPositionTimestamp(right)
    || left.eventId.localeCompare(right.eventId)
  ));
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
    accuracyMeters: nonNegativeNumberOrNull(sample?.accuracyMeters),
    driverId: textOrNull(sample?.driverId),
    eventId,
    gapBefore: typeof sample?.gapBefore === "boolean" ? sample.gapBefore : null,
    occurredAt,
    receivedAt,
    sourceIndex: sample?.sourceIndex != null
      && Number.isInteger(numberOrNull(sample.sourceIndex))
      && numberOrNull(sample.sourceIndex) >= 0
      ? numberOrNull(sample.sourceIndex)
      : null,
  };
}

function normalizeCoordinatePair(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
  const longitude = numberOrNull(coordinate[0]);
  const latitude = numberOrNull(coordinate[1]);
  if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return [longitude, latitude];
}

function normalizeMultiLineGeometry(geometry) {
  const rawLines = geometry?.type === "MultiLineString"
    ? geometry.coordinates
    : geometry?.type === "LineString"
      ? [geometry.coordinates]
      : [];
  const coordinates = (Array.isArray(rawLines) ? rawLines : [])
    .map((line) => (Array.isArray(line) ? line.map(normalizeCoordinatePair).filter(Boolean) : []))
    .filter((line) => line.length >= 2);
  return coordinates.length > 0 ? { coordinates, type: "MultiLineString" } : null;
}

function normalizeRoadMatchedPath(roadMatchedPath) {
  if (!roadMatchedPath || typeof roadMatchedPath !== "object") return null;

  const inferredGeometry = normalizeMultiLineGeometry(roadMatchedPath.inferredGeometry);
  const matchedGeometry = normalizeMultiLineGeometry(roadMatchedPath.matchedGeometry);
  const uncertainGeometry = normalizeMultiLineGeometry(roadMatchedPath.uncertainGeometry);
  const qualityVersion = textOrNull(roadMatchedPath.qualityVersion);
  const lastMatchedLatitude = numberOrNull(roadMatchedPath.lastMatchedPosition?.latitude);
  const lastMatchedLongitude = numberOrNull(roadMatchedPath.lastMatchedPosition?.longitude);
  const lastMatchedPosition = lastMatchedLatitude != null
    && lastMatchedLongitude != null
    && lastMatchedLatitude >= -90
    && lastMatchedLatitude <= 90
    && lastMatchedLongitude >= -180
    && lastMatchedLongitude <= 180
    ? {
        latitude: lastMatchedLatitude,
        longitude: lastMatchedLongitude,
        occurredAt: textOrNull(roadMatchedPath.lastMatchedPosition?.occurredAt),
      }
    : null;
  if (!inferredGeometry
    && !matchedGeometry
    && !uncertainGeometry
    && !lastMatchedPosition
    && qualityVersion !== "gps_quality.v4") return null;

  return {
    coverage: textOrNull(roadMatchedPath.coverage),
    inferredGeometry,
    inferredRanges: normalizeRoadMatchRanges(roadMatchedPath.inferredRanges),
    inputPointCount: Math.max(0, numberOrNull(roadMatchedPath.inputPointCount) ?? 0),
    lastInputOccurredAt: textOrNull(roadMatchedPath.lastInputOccurredAt),
    lastMatchedPosition,
    matchedGeometry,
    matchedPointCount: Math.max(0, numberOrNull(roadMatchedPath.matchedPointCount) ?? 0),
    matchedRanges: normalizeRoadMatchRanges(roadMatchedPath.matchedRanges),
    qualityVersion,
    schemaVersion: textOrNull(roadMatchedPath.schemaVersion) ?? "route_tracking_road_match.v1",
    uncertainRanges: normalizeRoadMatchRanges(roadMatchedPath.uncertainRanges),
    uncertainGeometry,
    unmatchedRanges: normalizeRoadMatchRanges(roadMatchedPath.unmatchedRanges),
    watermark: textOrNull(roadMatchedPath.watermark),
  };
}

function normalizeRoadMatchRanges(ranges) {
  return (Array.isArray(ranges) ? ranges : []).flatMap((range) => {
    const startSourceIndex = range?.startSourceIndex == null ? null : numberOrNull(range.startSourceIndex);
    const endSourceIndex = range?.endSourceIndex == null ? null : numberOrNull(range.endSourceIndex);
    const interpolationLevel = typeof range?.interpolationLevel === "number"
      && Number.isInteger(range.interpolationLevel)
      && range.interpolationLevel >= 0
      && range.interpolationLevel <= 2
      ? range.interpolationLevel
      : null;
    if (!Number.isInteger(startSourceIndex) || !Number.isInteger(endSourceIndex) || startSourceIndex < 0 || endSourceIndex < startSourceIndex) {
      return [];
    }
    return [{
      endEventId: textOrNull(range?.endEventId),
      endOccurredAt: textOrNull(range?.endOccurredAt),
      endSourceIndex,
      ...(interpolationLevel != null ? { interpolationLevel } : {}),
      reason: textOrNull(range?.reason),
      startEventId: textOrNull(range?.startEventId),
      startOccurredAt: textOrNull(range?.startOccurredAt),
      startSourceIndex,
    }];
  });
}

function getNewestRoadMatchedPath(currentPath, incomingPath) {
  if (!currentPath) return incomingPath;
  if (!incomingPath) return currentPath;
  const currentTimestamp = Date.parse(currentPath.lastInputOccurredAt ?? "");
  const incomingTimestamp = Date.parse(incomingPath.lastInputOccurredAt ?? "");
  if (Number.isFinite(currentTimestamp) && Number.isFinite(incomingTimestamp)) {
    return incomingTimestamp >= currentTimestamp ? incomingPath : currentPath;
  }
  return incomingPath.inputPointCount >= currentPath.inputPointCount ? incomingPath : currentPath;
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
    accuracyMeters: position.accuracyMeters,
    driverId: position.driverId,
    eventId: position.eventId,
    gapBefore: false,
    occurredAt: position.occurredAt ?? position.receivedAt,
    receivedAt: position.receivedAt ?? position.occurredAt,
    sourceIndex: current.sourcePointCount,
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
  sample.gapBefore = Boolean(hasGap || sample.gapBefore);
  const previousCoordinate = coordinates.at(-1);
  const anchorCoordinate = coordinates.at(-2);
  const turnAngleDegrees = anchorCoordinate && previousCoordinate
    ? getTurnAngleDegrees(anchorCoordinate, previousCoordinate, coordinate)
    : 0;
  const canReplaceTail = !hasGap
    && previousSample?.gapBefore !== true
    && coordinates.length >= 2
    && turnAngleDegrees <= 15
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
        accuracyMeters: sample?.accuracyMeters ?? null,
        driverId: sample?.driverId ?? null,
        eventId: sample?.eventId ?? null,
        gapBefore: sample?.gapBefore ?? null,
        occurredAt: sample?.occurredAt ?? null,
        receivedAt: sample?.receivedAt ?? null,
        sourceIndex: sample?.sourceIndex ?? null,
      };
    });
  }
  return normalized.recentPositions.map((position) => ({
    coordinates: [position.longitude, position.latitude],
    accuracyMeters: position.accuracyMeters,
    driverId: position.driverId,
    eventId: position.eventId,
    gapBefore: false,
    occurredAt: position.occurredAt,
    receivedAt: position.receivedAt,
    sourceIndex: null,
  }));
}

function getRouteTrackingLineFeatures(snapshot) {
  const normalized = normalizeRouteTrackingSnapshot(snapshot);
  const roadMatchedPath = normalized.roadMatchedPath;
  const recordedCoverage = getRecordedTrackingCoverageFeatures(normalized);
  if (!roadMatchedPath) return recordedCoverage;
  const usesInterpolationLevels = roadMatchedPath.qualityVersion === "gps_quality.v4";

  const features = [];
  if (roadMatchedPath.matchedGeometry) {
    for (const coordinates of roadMatchedPath.matchedGeometry.coordinates) {
      features.push(createTrackingLineFeature(coordinates, "trackingTrail"));
    }
  }
  if (!usesInterpolationLevels && roadMatchedPath.uncertainGeometry) {
    for (const coordinates of roadMatchedPath.uncertainGeometry.coordinates) {
      features.push(createTrackingLineFeature(coordinates, "trackingConnector"));
    }
  }
  if (roadMatchedPath.inferredGeometry) {
    for (const coordinates of roadMatchedPath.inferredGeometry.coordinates) {
      features.push(createTrackingLineFeature(coordinates, "trackingConnector", { trackingSource: "inferred" }));
    }
  }
  if (usesInterpolationLevels) return features;
  const uncoveredRanges = subtractCoveredRoadMatchRanges(
    roadMatchedPath.unmatchedRanges,
    roadMatchedPath.inferredRanges,
  );
  if (uncoveredRanges.length > 0) {
    features.push(...getRecordedTrackingCoverageFeatures(
      normalized,
      uncoveredRanges.filter(isRenderableUnmatchedRange),
    ));
  } else if (!roadMatchedPath.qualityVersion) {
    features.push(...getRecordedTrackingCoverageFeatures(normalized, getLegacyUncoveredPointRanges(normalized, roadMatchedPath)));
  }

  if (!roadMatchedPath.matchedGeometry) return features.length > 0 ? features : recordedCoverage;
  if (!roadMatchedPath.qualityVersion) return features;

  const latestInferredLine = (roadMatchedPath.inferredGeometry?.coordinates ?? []).flatMap((coordinates, index) => {
    const timestamp = Date.parse(roadMatchedPath.inferredRanges[index]?.endOccurredAt ?? "");
    return Number.isFinite(timestamp) ? [{ coordinates: coordinates.at(-1), timestamp }] : [];
  }).sort((left, right) => left.timestamp - right.timestamp).at(-1);
  const lastMatchedTimestamp = Date.parse(roadMatchedPath.lastMatchedPosition?.occurredAt ?? "");
  const lastInputTimestamp = Date.parse(roadMatchedPath.lastInputOccurredAt ?? "");
  const inferredTailSeed = latestInferredLine
    && Number.isFinite(lastMatchedTimestamp)
    && latestInferredLine.timestamp > lastMatchedTimestamp
    ? latestInferredLine
    : null;
  const tailStartTimestamp = inferredTailSeed?.timestamp ?? (Number.isFinite(lastMatchedTimestamp)
    ? lastMatchedTimestamp
    : lastInputTimestamp);
  const gapThresholdMs = numberOrNull(normalized.policy?.delayedThresholdMs) ?? 180_000;
  const maxAccuracyMeters = nonNegativeNumberOrNull(normalized.policy?.maxMatchAccuracyMeters)
    ?? RAW_FALLBACK_MAX_ACCURACY_METERS;
  const tailPoints = getRouteTrackingPathPoints(normalized)
    .map((point) => ({ ...point, timestamp: getPositionTimestamp(point) }))
    .filter((point) => point.timestamp > (Number.isFinite(tailStartTimestamp) ? tailStartTimestamp : Number.POSITIVE_INFINITY));
  const seed = inferredTailSeed ?? (roadMatchedPath.lastMatchedPosition
    ? {
        coordinates: [roadMatchedPath.lastMatchedPosition.longitude, roadMatchedPath.lastMatchedPosition.latitude],
        timestamp: Number.isFinite(tailStartTimestamp)
          ? tailStartTimestamp
          : getPositionTimestamp(roadMatchedPath.lastMatchedPosition),
      }
    : null);
  const tailSegments = [];
  let currentSegment = seed ? [seed] : [];
  for (const point of tailPoints) {
    if (point.accuracyMeters != null && point.accuracyMeters > maxAccuracyMeters) {
      if (currentSegment.length >= 2) tailSegments.push(currentSegment);
      currentSegment = [];
      continue;
    }
    const previousPoint = currentSegment.at(-1);
    const elapsedMs = previousPoint ? point.timestamp - previousPoint.timestamp : null;
    const distanceMeters = previousPoint
      ? distanceBetweenCoordinatesMeters(previousPoint.coordinates, point.coordinates)
      : 0;
    const isImplausibleJump = elapsedMs != null
      && elapsedMs > 0
      && distanceMeters / (elapsedMs / 1000) > RAW_FALLBACK_MAX_SPEED_METERS_PER_SECOND;
    if (previousPoint && (point.gapBefore === true || elapsedMs > gapThresholdMs || isImplausibleJump)) {
      if (currentSegment.length >= 2) tailSegments.push(currentSegment);
      currentSegment = [point];
      continue;
    }
    if (!currentSegment.at(-1) || !areCoordinatesEqual(currentSegment.at(-1).coordinates, point.coordinates)) {
      currentSegment.push(point);
    }
  }
  if (currentSegment.length >= 2) tailSegments.push(currentSegment);

  for (const segment of tailSegments) {
    const coordinates = segment.map((point) => point.coordinates);
    if (coordinates.length < 2 || areCoordinatesEqual(coordinates[0], coordinates.at(-1))) continue;
    features.push({
      type: "Feature",
      geometry: { coordinates, type: "LineString" },
      properties: { trackingType: "trackingConnector" },
    });
  }
  return features;
}

function isRenderableUnmatchedRange(range) {
  return range.reason == null || ["NO_MATCH", "OUT_OF_COVERAGE", "WINDOW_BOUNDARY"].includes(range.reason);
}

function getRouteTrackingFitCoordinates(snapshot) {
  const normalized = normalizeRouteTrackingSnapshot(snapshot);
  const lineCoordinates = getRouteTrackingLineFeatures(normalized).flatMap((feature) => (
    feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates.flat()
      : feature.geometry.coordinates
  ));
  const arrivalCoordinates = normalized.stopArrivals.flatMap((arrival) => (
    arrival.positionSource !== "unavailable" && arrival.latitude != null && arrival.longitude != null
      ? [[arrival.longitude, arrival.latitude]]
      : []
  ));
  const visibleCoordinates = [...lineCoordinates, ...arrivalCoordinates];
  if (visibleCoordinates.length > 0) return visibleCoordinates;

  const pathPoints = getRouteTrackingPathPoints(normalized);
  return pathPoints.length <= 1 && normalized.latestPosition
    ? [[normalized.latestPosition.longitude, normalized.latestPosition.latitude]]
    : [];
}

function getRecordedTrackingCoverageFeatures(snapshot, ranges = null) {
  const allPoints = getRouteTrackingPathPoints(snapshot)
    .map((point) => ({ ...point, timestamp: getPositionTimestamp(point) }));
  const pointGroups = Array.isArray(ranges)
    ? ranges.map((range) => allPoints.filter((point, pointIndex) => (
        range.startPointIndex != null
          ? pointIndex >= range.startPointIndex && pointIndex <= range.endPointIndex
          : point.sourceIndex != null
            && point.sourceIndex >= range.startSourceIndex
            && point.sourceIndex <= range.endSourceIndex
      )))
    : [allPoints];
  return pointGroups.flatMap((points) => buildRecordedTrackingSegments(points, snapshot));
}

function getLegacyUncoveredPointRanges(snapshot, roadMatchedPath) {
  const points = getRouteTrackingPathPoints(snapshot);
  if (points.length < 2) return [];
  const lines = [
    ...(roadMatchedPath.matchedGeometry?.coordinates ?? []),
    ...(roadMatchedPath.uncertainGeometry?.coordinates ?? []),
  ];
  if (lines.length === 0) return [{ startPointIndex: 0, endPointIndex: points.length - 1 }];
  const coveredRanges = lines.map((line) => {
    const startPointIndex = findNearestTrackingPointIndex(points, line[0]);
    const endPointIndex = findNearestTrackingPointIndex(points, line.at(-1));
    return {
      startPointIndex: Math.min(startPointIndex, endPointIndex),
      endPointIndex: Math.max(startPointIndex, endPointIndex),
    };
  }).sort((left, right) => left.startPointIndex - right.startPointIndex);
  const uncoveredRanges = [];
  let nextPointIndex = 0;
  for (const range of coveredRanges) {
    if (range.startPointIndex > nextPointIndex) {
      uncoveredRanges.push({ startPointIndex: nextPointIndex, endPointIndex: range.startPointIndex });
    }
    nextPointIndex = Math.max(nextPointIndex, range.endPointIndex);
  }
  if (nextPointIndex < points.length - 1) {
    uncoveredRanges.push({ startPointIndex: nextPointIndex, endPointIndex: points.length - 1 });
  }
  return uncoveredRanges;
}

function findNearestTrackingPointIndex(points, coordinate) {
  return points.reduce((nearest, point, index) => {
    const distanceMeters = distanceBetweenCoordinatesMeters(point.coordinates, coordinate);
    return distanceMeters < nearest.distanceMeters ? { distanceMeters, index } : nearest;
  }, { distanceMeters: Number.POSITIVE_INFINITY, index: 0 }).index;
}

function buildRecordedTrackingSegments(points, snapshot) {
  const segments = [];
  let currentSegment = [];
  let previousObservedPoint = null;
  const gapThresholdMs = numberOrNull(snapshot?.policy?.delayedThresholdMs) ?? 180_000;
  const maxAccuracyMeters = nonNegativeNumberOrNull(snapshot?.policy?.maxMatchAccuracyMeters)
    ?? RAW_FALLBACK_MAX_ACCURACY_METERS;
  for (const point of points) {
    if (point.accuracyMeters != null && point.accuracyMeters > maxAccuracyMeters) {
      if (currentSegment.length >= 2) segments.push(currentSegment);
      currentSegment = [];
      previousObservedPoint = null;
      continue;
    }
    const previousRenderedPoint = currentSegment.at(-1);
    if (!previousObservedPoint) {
      currentSegment = [point];
      previousObservedPoint = point;
      continue;
    }

    const elapsedMs = point.timestamp - previousObservedPoint.timestamp;
    const distanceMeters = distanceBetweenCoordinatesMeters(previousObservedPoint.coordinates, point.coordinates);
    const isImplausibleJump = elapsedMs > 0
      && distanceMeters / (elapsedMs / 1000) > RAW_FALLBACK_MAX_SPEED_METERS_PER_SECOND;
    if (point.gapBefore === true || elapsedMs > gapThresholdMs || isImplausibleJump) {
      if (currentSegment.length >= 2) segments.push(currentSegment);
      currentSegment = [point];
      previousObservedPoint = point;
      continue;
    }
    previousObservedPoint = point;
    if (previousRenderedPoint && distanceBetweenCoordinatesMeters(previousRenderedPoint.coordinates, point.coordinates) < RAW_FALLBACK_MIN_MOVEMENT_METERS) continue;
    currentSegment.push(point);
  }
  if (currentSegment.length >= 2) segments.push(currentSegment);

  return segments
    .map((segment) => segment.map((point) => point.coordinates))
    .filter((coordinates) => coordinates.length >= 2 && !areCoordinatesEqual(coordinates[0], coordinates.at(-1)))
    .map((coordinates) => createTrackingLineFeature(coordinates, "trackingConnector"));
}

function createTrackingLineFeature(coordinates, trackingType, properties = {}) {
  return {
    type: "Feature",
    geometry: { coordinates, type: "LineString" },
    properties: { trackingType, ...properties },
  };
}

function subtractCoveredRoadMatchRanges(ranges, coveredRanges) {
  return ranges.flatMap((range) => coveredRanges.reduce((pieces, coveredRange) => pieces.flatMap((piece) => {
    if (coveredRange.endSourceIndex < piece.startSourceIndex || coveredRange.startSourceIndex > piece.endSourceIndex) {
      return [piece];
    }
    const remaining = [];
    if (coveredRange.startSourceIndex > piece.startSourceIndex) {
      remaining.push({ ...piece, endSourceIndex: coveredRange.startSourceIndex - 1 });
    }
    if (coveredRange.endSourceIndex < piece.endSourceIndex) {
      remaining.push({ ...piece, startSourceIndex: coveredRange.endSourceIndex + 1 });
    }
    return remaining;
  }), [range]));
}

function areCoordinatesEqual(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && Math.abs(left[0] - right[0]) < 0.0000001
    && Math.abs(left[1] - right[1]) < 0.0000001;
}

function distanceBetweenCoordinatesMeters(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return Number.POSITIVE_INFINITY;
  const leftLatitude = toRadians(left[1]);
  const rightLatitude = toRadians(right[1]);
  const latitudeDelta = rightLatitude - leftLatitude;
  const longitudeDelta = toRadians(right[0] - left[0]);
  const halfChord = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(halfChord)));
}

function getRouteTrackingPathSummary(snapshot) {
  const normalized = normalizeRouteTrackingSnapshot(snapshot);
  const points = getRouteTrackingPathPoints(normalized);
  const gapThresholdMs = numberOrNull(normalized.policy?.delayedThresholdMs) ?? 180_000;
  const gapCount = points.reduce((count, point, index) => {
    const previous = points[index - 1];
    if (!previous) return count;
    if (point.gapBefore === true) return count + 1;
    if (point.gapBefore === false) return count;
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

function selectRouteTrackingWindow(snapshot, options = {}) {
  if (!snapshot || options.allRecords === true) return snapshot;
  const date = textOrNull(options.date);
  const timeZone = textOrNull(options.timeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !timeZone) return snapshot;

  const normalized = normalizeRouteTrackingSnapshot(snapshot);
  const points = getRouteTrackingPathPoints(normalized);
  const selectedIndexes = points.flatMap((point, index) => (
    getDateKeyInTimeZone(getPositionTimestamp(point), timeZone) === date ? [index] : []
  ));
  const selectedPoints = selectedIndexes.map((index) => points[index]);
  const selectedSamples = selectedIndexes.map((index) => normalized.recordedPath?.samples[index]).filter(Boolean);
  const selectedCoordinates = selectedPoints.map((point) => point.coordinates);
  const firstSourceIndex = selectedSamples.find((sample) => sample.sourceIndex != null)?.sourceIndex;
  const lastSourceIndex = selectedSamples.findLast((sample) => sample.sourceIndex != null)?.sourceIndex;
  const selectedSourcePointCount = firstSourceIndex != null && lastSourceIndex != null
    ? Math.max(selectedSamples.length, lastSourceIndex - firstSourceIndex + 1)
    : selectedSamples.length;
  const selectedLatestPoint = selectedPoints.at(-1) ?? null;
  const latestPosition = selectedLatestPoint
    ? normalizeTrackingPosition({
        ...selectedLatestPoint,
        latitude: selectedLatestPoint.coordinates[1],
        longitude: selectedLatestPoint.coordinates[0],
        routePlanId: normalized.routePlanId,
      })
    : null;
  const recordedPath = selectedCoordinates.length > 0
    ? {
        ...normalized.recordedPath,
        firstOccurredAt: selectedSamples[0]?.occurredAt ?? null,
        geometry: { coordinates: selectedCoordinates, type: "LineString" },
        geometryPointCount: selectedCoordinates.length,
        lastOccurredAt: selectedSamples.at(-1)?.occurredAt ?? null,
        lastReceivedAt: selectedSamples.at(-1)?.receivedAt ?? null,
        samples: selectedSamples,
        sourcePointCount: selectedSourcePointCount,
      }
    : null;

  return {
    ...normalized,
    latestPosition,
    recentPositions: normalized.recentPositions.filter((position) => (
      getDateKeyInTimeZone(getPositionTimestamp(position), timeZone) === date
    )),
    recordedPath,
    roadMatchedPath: selectRoadMatchedPathWindow(
      normalized.roadMatchedPath,
      date,
      timeZone,
      firstSourceIndex,
      lastSourceIndex,
    ),
    stopArrivals: normalized.stopArrivals.filter((arrival) => (
      getDateKeyInTimeZone(getPositionTimestamp(arrival), timeZone) === date
    )),
  };
}

function selectRoadMatchedPathWindow(roadMatchedPath, date, timeZone, firstSourceIndex, lastSourceIndex) {
  if (!roadMatchedPath?.qualityVersion) return null;
  const safelyRenderedRanges = [...roadMatchedPath.matchedRanges, ...roadMatchedPath.uncertainRanges];
  const selectGeometry = (geometry, ranges) => {
    if (!geometry || ranges.length !== geometry.coordinates.length) return null;
    const coordinates = geometry.coordinates.filter((_, index) => isRoadMatchRangeInsideDate(ranges[index], date, timeZone));
    return coordinates.length > 0 ? { coordinates, type: "MultiLineString" } : null;
  };
  const inferredRanges = roadMatchedPath.inferredRanges.filter((range) => isRoadMatchRangeInsideDate(range, date, timeZone));
  const matchedRanges = roadMatchedPath.matchedRanges.filter((range) => isRoadMatchRangeInsideDate(range, date, timeZone));
  const uncertainRanges = roadMatchedPath.uncertainRanges.filter((range) => isRoadMatchRangeInsideDate(range, date, timeZone));
  const clipRangeToSelectedSources = (range, reason = range.reason) => ({
    ...range,
    reason,
    startSourceIndex: firstSourceIndex == null ? range.startSourceIndex : Math.max(range.startSourceIndex, firstSourceIndex),
    endSourceIndex: lastSourceIndex == null ? range.endSourceIndex : Math.min(range.endSourceIndex, lastSourceIndex),
  });
  const unmatchedRanges = subtractCoveredRoadMatchRanges(
    roadMatchedPath.unmatchedRanges,
    roadMatchedPath.inferredRanges,
  ).flatMap((range) => {
    if (!doesRoadMatchRangeIncludeDate(range, date, timeZone)) return [];
    return [clipRangeToSelectedSources(range)];
  }).concat(
    safelyRenderedRanges
      .filter((range) => doesRoadMatchRangeCrossDate(range, date, timeZone))
      .map((range) => clipRangeToSelectedSources(range, "WINDOW_BOUNDARY")),
  ).filter((range) => range.endSourceIndex >= range.startSourceIndex);
  const selectedRanges = [...matchedRanges, ...uncertainRanges, ...inferredRanges, ...unmatchedRanges];
  const lastSelectedRange = selectedRanges.sort((left, right) => left.endSourceIndex - right.endSourceIndex).at(-1);
  return {
    ...roadMatchedPath,
    inferredGeometry: selectGeometry(roadMatchedPath.inferredGeometry, roadMatchedPath.inferredRanges),
    inferredRanges,
    lastInputOccurredAt: lastSelectedRange?.endOccurredAt ?? null,
    lastMatchedPosition: getDateKeyInTimeZone(roadMatchedPath.lastMatchedPosition?.occurredAt, timeZone) === date
      ? roadMatchedPath.lastMatchedPosition
      : null,
    matchedGeometry: selectGeometry(roadMatchedPath.matchedGeometry, roadMatchedPath.matchedRanges),
    matchedRanges,
    uncertainGeometry: selectGeometry(roadMatchedPath.uncertainGeometry, roadMatchedPath.uncertainRanges),
    uncertainRanges,
    unmatchedRanges,
  };
}

function isRoadMatchRangeInsideDate(range, date, timeZone) {
  return getDateKeyInTimeZone(Date.parse(range?.startOccurredAt ?? ""), timeZone) === date
    && getDateKeyInTimeZone(Date.parse(range?.endOccurredAt ?? ""), timeZone) === date;
}

function doesRoadMatchRangeIncludeDate(range, date, timeZone) {
  const startDate = getDateKeyInTimeZone(range?.startOccurredAt, timeZone);
  const endDate = getDateKeyInTimeZone(range?.endOccurredAt, timeZone);
  return Boolean(startDate && endDate && startDate <= date && endDate >= date);
}

function doesRoadMatchRangeCrossDate(range, date, timeZone) {
  return doesRoadMatchRangeIncludeDate(range, date, timeZone)
    && !isRoadMatchRangeInsideDate(range, date, timeZone);
}

function getTurnAngleDegrees(anchor, vertex, next) {
  const referenceLatitude = toRadians(vertex[1]);
  const projectDelta = (from, to) => [
    (to[0] - from[0]) * Math.cos(referenceLatitude),
    to[1] - from[1],
  ];
  const incoming = projectDelta(anchor, vertex);
  const outgoing = projectDelta(vertex, next);
  const incomingLength = Math.hypot(...incoming);
  const outgoingLength = Math.hypot(...outgoing);
  if (incomingLength === 0 || outgoingLength === 0) return 0;
  const cosine = Math.max(-1, Math.min(1, (
    incoming[0] * outgoing[0] + incoming[1] * outgoing[1]
  ) / (incomingLength * outgoingLength)));
  return Math.acos(cosine) * 180 / Math.PI;
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

function getRouteTrackingCompletionTime(snapshot) {
  const evidenceCompletion = snapshot?.executionEvidence?.completion;
  const evidenceCompletionTime = Date.parse(evidenceCompletion?.occurredAt ?? evidenceCompletion?.receivedAt ?? "");
  if (Number.isFinite(evidenceCompletionTime)) return evidenceCompletionTime;
  const latestEvent = snapshot?.progress?.latestEvent;
  if (textOrNull(latestEvent?.eventType)?.toUpperCase() !== "ROUTE_COMPLETED") return null;

  const completionTime = Date.parse(latestEvent.occurredAt ?? latestEvent.receivedAt ?? "");
  return Number.isFinite(completionTime) ? completionTime : null;
}

function formatRouteTrackingCompletionLabel(value, ianaTimezone) {
  const date = Number.isFinite(value) ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime()) || !textOrNull(ianaTimezone)) return "종료 시각 확인 불가";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone: ianaTimezone,
      year: "numeric",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}.${values.month}.${values.day} ${values.hour}:${values.minute} 종료`;
  } catch {
    return "종료 시각 확인 불가";
  }
}

function getDateKeyInTimeZone(value, ianaTimezone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || !textOrNull(ianaTimezone)) return null;

  try {
    const parts = new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "2-digit",
      timeZone: ianaTimezone,
      year: "numeric",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

function shouldShowRouteTrackingFreshness({ completionTime, deliveryDate, executionStatus, ianaTimezone, now = Date.now() }) {
  if (normalizeRouteExecutionStatus(executionStatus) !== "COMPLETED" || Number.isFinite(completionTime)) return true;

  const routeDeliveryDate = textOrNull(deliveryDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(routeDeliveryDate ?? "")) return true;

  const today = getDateKeyInTimeZone(now, ianaTimezone);
  return !today || routeDeliveryDate >= today;
}

function doesTrackingEventRefreshEta(event) {
  const eventType = textOrNull(event?.eventType);
  return eventType === "ROUTE_STARTED" || eventType === "STOP_ARRIVED";
}

function shouldRevalidateTrackingEta(event, hasRouteAllocationDraft) {
  return !hasRouteAllocationDraft && doesTrackingEventRefreshEta(event);
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
  shouldRevalidateTrackingEta,
  getRouteExecutionStatusFromTrackingEvent,
  formatRouteTrackingCompletionLabel,
  getRouteTrackingCompletionTime,
  getRouteTrackingLineFeatures,
  getRouteTrackingPathPoints,
  getRouteTrackingPathSummary,
  getRouteTrackingFreshness,
  getRouteTrackingFitCoordinates,
  getRouteTrackingPresentation,
  getRouteTrackingReconnectDelayMs,
  getRouteTrackingStreamInactivityMs,
  isRouteTrackingPayloadForRoute,
  mergeRouteTrackingProgress,
  mergeRouteTrackingPosition,
  mergeRouteTrackingSnapshot,
  normalizeRouteExecutionStatus,
  normalizeRouteTrackingSnapshot,
  selectRouteTrackingWindow,
  shouldShowRouteTrackingFreshness,
};
