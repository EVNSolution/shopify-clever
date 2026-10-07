/** Address/coordinates are the only stop fields supported by the live-change API. */
export const LIVE_ADDRESS_FIELDS = [
  "address1",
  "address2",
  "city",
  "province",
  "postalCode",
  "countryCode",
];
const LOCATION_FIELDS = [...LIVE_ADDRESS_FIELDS, "latitude", "longitude"];
const addressIdentity = (stop) =>
  JSON.stringify(
    LIVE_ADDRESS_FIELDS.map((field) => String(stop[field] ?? "").trim()),
  );

export function createLiveEditor(baseline) {
  if (!baseline?.draft?.stops || !Array.isArray(baseline.editableFutureStopIds))
    throw new Error("INVALID_DRAFT");
  const eligible = new Set(baseline.editableFutureStopIds);
  return {
    baseline,
    edits: {},
    futureStopOrder: baseline.draft.stops
      .filter((stop) => eligible.has(stop.deliveryStopId))
      .map((stop) => stop.deliveryStopId),
  };
}

export function liveStopValues(editor, deliveryStopId) {
  const stop =
    editor.edits[deliveryStopId] ||
    editor.baseline.draft.stops.find(
      (row) => row.deliveryStopId === deliveryStopId,
    );
  return Object.fromEntries(
    LOCATION_FIELDS.map((field) => [
      field,
      stop?.[field] == null ? "" : String(stop[field]),
    ]),
  );
}

export function updateLiveStop(editor, deliveryStopId, field, value) {
  if (!editor.baseline.editableFutureStopIds.includes(deliveryStopId))
    throw new Error("STOP_NOT_FUTURE");
  if (!LOCATION_FIELDS.includes(field)) throw new Error("INVALID_FIELD");
  const previous = editor.edits[deliveryStopId];
  const touchedFields = [
    ...new Set([...(previous?.touchedFields || []), field]),
  ];
  const stop = {
    ...liveStopValues(editor, deliveryStopId),
    ...previous,
    [field]: value,
    touchedFields,
    locationVerified: false,
    verifiedAddressKey: null,
  };
  if (LIVE_ADDRESS_FIELDS.includes(field)) {
    stop.latitude = "";
    stop.longitude = "";
  }
  return { ...editor, edits: { ...editor.edits, [deliveryStopId]: stop } };
}

export function validLiveCoordinates(stop) {
  if (
    stop?.latitude == null ||
    stop?.longitude == null ||
    String(stop.latitude).trim() === "" ||
    String(stop.longitude).trim() === ""
  )
    return false;
  const latitude = Number(stop.latitude),
    longitude = Number(stop.longitude);
  return (
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

export function confirmLiveLocation(editor, deliveryStopId) {
  if (!editor.baseline.editableFutureStopIds.includes(deliveryStopId))
    throw new Error("STOP_NOT_FUTURE");
  const stop = {
    ...liveStopValues(editor, deliveryStopId),
    ...editor.edits[deliveryStopId],
  };
  if (!validLiveCoordinates(stop))
    throw new Error("STOP_LOCATION_NOT_ROUTEABLE");
  return {
    ...editor,
    edits: {
      ...editor.edits,
      [deliveryStopId]: {
        ...stop,
        locationVerified: true,
        verifiedAddressKey: addressIdentity(stop),
      },
    },
  };
}

export function reorderLiveFutureStops(editor, ids) {
  const eligible = editor.baseline.editableFutureStopIds;
  if (
    ids.length !== eligible.length ||
    new Set(ids).size !== eligible.length ||
    ids.some((id) => !eligible.includes(id))
  )
    throw new Error("INVALID_FUTURE_ORDER");
  return { ...editor, futureStopOrder: [...ids] };
}

export function hasLiveLocalEdits(editor) {
  if (!editor) return false;
  return (
    Object.keys(editor.edits).length > 0 ||
    JSON.stringify(editor.futureStopOrder) !==
      JSON.stringify(createLiveEditor(editor.baseline).futureStopOrder)
  );
}

export function getLiveLocationIssues(editor) {
  if (!editor) return [];
  return Object.entries(editor.edits)
    .filter(
      ([, edited]) =>
        !edited.locationVerified || !validLiveCoordinates(edited),
    )
    .map(([id]) => id);
}

export function buildLiveCommand(editor, action, commandId) {
  const baseline = editor.baseline;
  const guards = {
    commandId,
    expectedAssignmentGeneration: baseline.assignmentGeneration,
    expectedRouteVersionId: baseline.expectedRouteVersionId,
    expectedRevision: baseline.revision,
  };
  if (action === "discard") return guards;
  if (action === "dispatch") {
    if (hasLiveLocalEdits(editor)) throw new Error("SAVE_REQUIRED");
    if (!baseline.hasUnpublishedChanges) throw new Error("NO_PRIVATE_CHANGES");
    if (getLiveLocationIssues(editor).length)
      throw new Error("STOP_LOCATION_NOT_ROUTEABLE");
    return guards;
  }
  if (action !== "save") throw new Error("INVALID_ACTION");
  if (!hasLiveLocalEdits(editor)) throw new Error("NO_LOCAL_CHANGES");
  const stopOverrides = Object.entries(editor.edits).map(
    ([deliveryStopId, stop]) => {
      if (!baseline.editableFutureStopIds.includes(deliveryStopId))
        throw new Error("STOP_NOT_FUTURE");
      const coordinates = stop.locationVerified && validLiveCoordinates(stop);
      return {
        deliveryStopId,
        ...Object.fromEntries(
          LIVE_ADDRESS_FIELDS.map((field) => [
            field,
            String(stop[field] ?? "").trim() || null,
          ]),
        ),
        latitude: coordinates ? Number(stop.latitude) : null,
        longitude: coordinates ? Number(stop.longitude) : null,
      };
    },
  );
  const orderChanged =
    JSON.stringify(editor.futureStopOrder) !==
    JSON.stringify(createLiveEditor(baseline).futureStopOrder);
  return {
    ...guards,
    stopOverrides,
    ...(orderChanged ? { futureStopOrder: [...editor.futureStopOrder] } : {}),
  };
}

/** The serialized request is retained unchanged after response loss and delivery failure. */
export function createLiveCommandRequest(editor, action, commandId) {
  return Object.freeze({
    action,
    commandId,
    intent: `liveChange${action[0].toUpperCase()}${action.slice(1)}`,
    commandBody: JSON.stringify(buildLiveCommand(editor, action, commandId)),
  });
}

/** A fresh GET never rebases automatically. Call only after the office confirms review. */
export function rebaseLiveEditor(editor, fresh) {
  if (fresh.routePlanId !== editor.baseline.routePlanId)
    throw new Error("SCOPE_CHANGED");
  if (
    Object.keys(editor.edits).some(
      (id) => !fresh.editableFutureStopIds.includes(id),
    )
  )
    throw new Error("STOP_NOT_FUTURE");
  const next = createLiveEditor(fresh);
  const previousOrder = createLiveEditor(editor.baseline).futureStopOrder;
  const changedOrder =
    JSON.stringify(editor.futureStopOrder) !== JSON.stringify(previousOrder);
  const retained = editor.futureStopOrder.filter((id) =>
    fresh.editableFutureStopIds.includes(id),
  );
  const futureStopOrder = changedOrder
    ? [
        ...retained,
        ...next.futureStopOrder.filter((id) => !retained.includes(id)),
      ]
    : next.futureStopOrder;
  const edits = Object.fromEntries(
    Object.entries(editor.edits).map(([id, previous]) => {
      const oldValues = liveStopValues(createLiveEditor(editor.baseline), id);
      const touchedFields =
        previous.touchedFields ||
        LOCATION_FIELDS.filter(
          (field) => String(previous[field] ?? "") !== oldValues[field],
        );
      const merged = {
        ...liveStopValues(next, id),
        ...Object.fromEntries(
          touchedFields.map((field) => [field, previous[field]]),
        ),
        touchedFields,
      };
      const confirmed =
        previous.locationVerified &&
        validLiveCoordinates(merged) &&
        addressIdentity(merged) === previous.verifiedAddressKey;
      return [
        id,
        {
          ...merged,
          locationVerified: Boolean(confirmed),
          verifiedAddressKey: confirmed ? previous.verifiedAddressKey : null,
          ...(!confirmed ? { latitude: "", longitude: "" } : {}),
        },
      ];
    }),
  );
  return { ...next, edits, futureStopOrder };
}

export function isLiveResponseCurrent(request, current) {
  return (
    request.scopeKey === current.scopeKey &&
    request.routePlanId === current.routePlanId &&
    request.requestId === current.requestId &&
    request.epoch === current.epoch
  );
}

/** Every live read bypasses BFF/browser caches; tenant authority stays on the BFF. */
export function buildLiveBffRequest(location, context, token, command) {
  const current = new URL(location);
  const url = new URL(
    `/app/route-live-change/${encodeURIComponent(context.routePlanId)}`,
    current.origin,
  );
  for (const key of ["host", "shop", "embedded"]) {
    const value = current.searchParams.get(key);
    if (value) url.searchParams.set(key, value);
  }
  const options = {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  };
  if (command) {
    url.searchParams.delete("liveChange");
    const form = new FormData();
    form.set("intent", command.intent);
    form.set("command", command.commandBody);
    form.set("routePlanId", context.routePlanId);
    form.set("scopeKey", context.scopeKey);
    return { url, options: { ...options, method: "POST", body: form } };
  }
  url.searchParams.set("routePlanId", context.routePlanId);
  url.searchParams.set("scopeKey", context.scopeKey);
  return { url, options };
}

export async function readLiveBffResponse(response, scopeKey) {
  const authError = () => ({
    error: {
      code: response.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
      message: "Refresh route access.",
    },
    outcomeUnknown: false,
  });
  const authenticationFailed =
    response.status === 401 || response.status === 403;
  let result;
  try {
    result = await response.json();
  } catch (error) {
    if (authenticationFailed) return authError();
    throw error;
  }
  if (!result || typeof result !== "object") {
    if (authenticationFailed) return authError();
    throw new Error("INVALID_RESPONSE");
  }
  if (result.scopeKey && result.scopeKey !== scopeKey)
    return {
      error: { code: "SCOPE_CHANGED", message: "Authenticated scope changed." },
      outcomeUnknown: false,
    };
  if (!response.ok && !result.error)
    result.error =
      result.errors?.[0] ||
      (authenticationFailed
        ? authError().error
        : { code: `HTTP_${response.status}`, message: "Request failed." });
  if (!result.error && result.errors?.length) result.error = result.errors[0];
  if (authenticationFailed) result.outcomeUnknown = false;
  else if (response.status >= 500) result.outcomeUnknown = true;
  return result;
}

export function isLiveAccessError(error) {
  return [
    "UNAUTHORIZED",
    "FORBIDDEN",
    "ACCESS_REVOKED",
    "SCOPE_CHANGED",
  ].includes(error?.code);
}

/** An unauthorized receipt retry says nothing about whether the original command committed. */
export function livePendingAfterFailure(request, result, previousPending) {
  if (isLiveAccessError(result.error) && previousPending?.unknown)
    return previousPending;
  return result.outcomeUnknown === true ? { request, unknown: true } : null;
}

/** Retrying delivery does not abandon input typed after the publication succeeded. */
export function liveReceiptRefreshMode(action, retry, editor) {
  return retry && action === "dispatch" && hasLiveLocalEdits(editor)
    ? "review"
    : "after";
}
