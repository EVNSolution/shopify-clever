// Synthetic, local-only contract model. It never reads credentials or calls providers.
import { randomUUID } from "node:crypto";

export const FIXTURE_IDS = Object.freeze({
  route: "60000000-0000-4000-8000-000000000001",
  child: "61000000-0000-4000-8000-000000000001",
  group: "50000000-0000-4000-8000-000000000001",
  ready: "60000000-0000-4000-8000-000000000002",
  stop: (index) => `70000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
});
const clone = (value) => structuredClone(value);
const addressFields = ["address1", "address2", "city", "province", "postalCode", "countryCode"];
const fail = (code, status = 409) => ({ status, body: { data: null, error: { code, message: `Synthetic ${code}` }, errors: [{ code, message: `Synthetic ${code}` }] } });
const snapshot = () => ({ schemaVersion: 1, initialRouteVersionId: FIXTURE_IDS.child, stops: Array.from({ length: 8 }, (_, offset) => {
  const index = offset + 1;
  return {
    routePlanStopId: `71000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    deliveryStopId: FIXTURE_IDS.stop(index), orderId: `72000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    sourceOrderId: `synthetic-order-${index}`, sequence: index, recipientName: `Synthetic recipient ${index}`, phone: null,
    address1: `${index} Synthetic Road`, address2: null, city: "Toronto", province: "ON", postalCode: "M5V 1A1", countryCode: "CA",
    instructions: null, latitude: String(43.65 + index / 10000), longitude: String(-79.38 - index / 10000),
    serviceMinutes: 5, timeWindowStart: null, timeWindowEnd: null,
  };
}) });

export function createLiveRouteFixture() {
  const log = [];
  const counters = { liveReads: 0, saves: 0, dispatches: 0, discards: 0, receiptReplays: 0, publications: 0, logicalNotifications: 0, searches: 0, blockedWrites: 0 };
  const receipts = new Map();
  let published = snapshot();
  let draft = clone(published);
  let revision = 0;
  let assignmentGeneration = "2";
  let publishedVersionId = null;
  let enrolled = false;
  let routeStatus = "IN_PROGRESS";
  let currentStopId = FIXTURE_IDS.stop(2);
  let denied = false;
  let scopeGeneration = 1;
  let enabled = true;
  let geometryFailure = false;
  let notificationFailure = false;
  let notificationAttempts = 0;
  const scopeKey = () => `synthetic-app:synthetic-shop:synthetic-session-${scopeGeneration}`;
  const record = (kind, details = {}) => { log.push({ sequence: log.length + 1, kind, ...clone(details) }); };
  const dirty = () => JSON.stringify(draft) !== JSON.stringify(published);
  const editable = () => published.stops.slice(published.stops.findIndex((stop) => stop.deliveryStopId === currentStopId) + 1).map((stop) => stop.deliveryStopId);
  const data = () => ({ routePlanId: FIXTURE_IDS.route, revision, assignmentGeneration, expectedRouteVersionId: FIXTURE_IDS.child,
    publishedVersionId, hasUnpublishedChanges: dirty(), editableFutureStopIds: editable(), draft: clone(draft) });
  const success = (result) => ({ status: 200, body: { data: clone(result), error: null, errors: [], scopeKey: scopeKey() } });
  const authorize = (requestScope) => denied ? fail("FORBIDDEN", 403) : requestScope !== scopeKey() ? fail("LIVE_CHANGE_SCOPE_CHANGED", 409) : !enabled ? fail("LIVE_CHANGE_DISABLED", 403) : routeStatus !== "IN_PROGRESS" ? fail("ROUTE_NOT_IN_PROGRESS") : null;
  const plan = (ready = false) => {
    const stops = clone(published.stops).map((stop) => {
      const position = published.stops.findIndex((candidate) => candidate.deliveryStopId === stop.deliveryStopId);
      const currentPosition = published.stops.findIndex((candidate) => candidate.deliveryStopId === currentStopId);
      const status = ready ? "PENDING" : position < currentPosition ? "DELIVERED" : position === currentPosition ? "ARRIVED" : "PENDING";
      return { ...stop, id: stop.routePlanStopId, routePlanId: ready ? FIXTURE_IDS.ready : FIXTURE_IDS.route,
        address: Object.fromEntries(addressFields.map((field) => [field, stop[field]])), status, deliveryStopStatus: status,
        orderName: `#SYN-${stop.sourceOrderId.split("-").at(-1).padStart(3, "0")}`, paymentStatus: "PAID", currencyCode: "CAD", itemCount: 1,
        lineItems: [{ quantity: 1, sku: `SYN-${stop.sequence}`, title: "Synthetic item" }], totalPriceAmount: "25.00",
        totalShippingPriceAmount: "5.00", totalShippingPriceCurrencyCode: "CAD", geocodeStatus: "RESOLVED" };
    });
    return {
      id: ready ? FIXTURE_IDS.ready : FIXTURE_IDS.route, name: ready ? "Synthetic READY regression" : "Synthetic KFood delivery",
      status: ready ? "READY" : routeStatus, stops, stopsCount: stops.length,
      createdAt: "2026-10-07T12:00:00.000Z", updatedAt: `2026-10-07T13:${String(counters.publications).padStart(2, "0")}:00.000Z`,
      deliveryDate: "2026-10-07", planDate: "2026-10-07", deliveryAreas: ["Synthetic area"],
      depot: { address: "Synthetic depot", name: "Synthetic depot", latitude: 43.65, longitude: -79.38 },
      driverId: "synthetic-driver", driver: { id: "synthetic-driver", displayName: "Synthetic driver" },
      routeMetrics: { distanceMeters: 25000, durationSeconds: 5400 }, itemSummary: { totalQuantity: 8 }, totalAmount: { amount: "200", currencyCode: "CAD" },
      routeGroupingChild: ready ? null : { id: FIXTURE_IDS.child, groupingId: FIXTURE_IDS.group, routePlanId: FIXTURE_IDS.route },
      routeEndMode: "RETURN_TO_DEPOT", scheduledStartAt: "2026-10-07T13:00:00.000Z", scheduledStartTimeZone: "America/Toronto",
    };
  };
  const group = () => ({ id: FIXTURE_IDS.group, name: "Synthetic KFood group", status: "IN_PROGRESS", displayStatus: "IN_PROGRESS",
    children: [{ id: FIXTURE_IDS.child, routeIdx: 1, routePlanId: FIXTURE_IDS.route, routePlan: plan() }],
    assignments: plan().stops, totalOrders: 8, planDate: "2026-10-07", updatedAt: plan().updatedAt });
  const detail = (pathRouteId, groupView = false) => {
    const routePlan = groupView ? null : plan(pathRouteId === FIXTURE_IDS.ready);
    return { routePlan, routeGroup: groupView || routePlan?.routeGroupingChild ? group() : null, stops: routePlan?.stops ?? [],
      childRouteDetails: [{ routePlan: plan(), stops: plan().stops }], routeMetrics: routePlan?.routeMetrics ?? null,
      currentDepartureLocation: { address: "Synthetic depot", hasCoordinates: true, coordinates: [-79.38, 43.65] },
      drivers: [], addOrderCandidates: [], errors: [], ianaTimezone: "America/Toronto", timezoneAbbreviation: "EDT", timezoneSource: "fixture",
      liveChangeEnabled: enabled, liveChangeScopeKey: scopeKey(), liveChangeRoutePlanId: routePlan?.id ?? null };
  };
  function command(intent, input, requestScope = scopeKey()) {
    record("command-request", { intent, commandId: input.commandId, body: input, requestScope });
    const deniedResult = authorize(requestScope);
    if (deniedResult) { counters.blockedWrites += 1; return deniedResult; }
    if (input.expectedAssignmentGeneration !== assignmentGeneration) return fail("ASSIGNMENT_CHANGED");
    if (input.expectedRouteVersionId !== FIXTURE_IDS.child) return fail("VERSION_CONFLICT");
    if (typeof input.commandId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.commandId)) return fail("INVALID_INPUT", 400);
    const serialized = JSON.stringify(input);
    const prior = receipts.get(input.commandId);
    if (prior) {
      if (prior.intent !== intent || prior.serialized !== serialized) return fail("IDEMPOTENCY_CONFLICT");
      counters.receiptReplays += 1;
      record("receipt-replay", { intent, commandId: input.commandId, originalRevision: prior.data.revision });
      return success(intent === "liveChangeDispatch" ? withDeliveryResult(prior.data) : prior.data);
    }
    if (input.expectedRevision !== revision) return fail("REVISION_CONFLICT");
    let result;
    if (intent === "liveChangeSave") {
      if (!Array.isArray(input.stopOverrides)) return fail("INVALID_INPUT", 400);
      counters.saves += 1;
      const next = clone(draft);
      const eligible = new Set(editable());
      for (const override of input.stopOverrides) {
        if (!eligible.has(override.deliveryStopId)) return fail("STOP_NOT_FUTURE");
        const stop = next.stops.find((candidate) => candidate.deliveryStopId === override.deliveryStopId);
        const changedAddress = addressFields.some((field) => override[field] !== undefined && override[field] !== stop[field]);
        Object.assign(stop, Object.fromEntries(addressFields.filter((field) => override[field] !== undefined).map((field) => [field, override[field]])));
        if ((override.latitude === undefined) !== (override.longitude === undefined)) return fail("INVALID_INPUT", 400);
        if (override.latitude !== undefined) {
          if ((override.latitude === null) !== (override.longitude === null)) return fail("INVALID_INPUT", 400);
          stop.latitude = override.latitude === null ? null : String(override.latitude);
          stop.longitude = override.longitude === null ? null : String(override.longitude);
        } else if (changedAddress) { stop.latitude = null; stop.longitude = null; }
      }
      if (input.futureStopOrder !== undefined) {
        const order = input.futureStopOrder;
        if (order.length !== eligible.size || new Set(order).size !== order.length || order.some((id) => !eligible.has(id))) return fail("INVALID_INPUT", 400);
        const byId = new Map(next.stops.map((stop) => [stop.deliveryStopId, stop]));
        let cursor = 0;
        next.stops = next.stops.map((stop) => eligible.has(stop.deliveryStopId) ? { ...byId.get(order[cursor++]), sequence: stop.sequence } : stop);
      }
      if (!enrolled) { enrolled = true; publishedVersionId = "90000000-0000-4000-8000-000000000000"; }
      if (JSON.stringify(next) !== JSON.stringify(draft)) { draft = next; revision += 1; }
      result = data();
    } else if (intent === "liveChangeDiscard") {
      counters.discards += 1;
      if (!enrolled) return fail("DRAFT_NOT_FOUND");
      if (dirty()) { draft = clone(published); revision += 1; }
      result = data();
    } else if (intent === "liveChangeDispatch") {
      counters.dispatches += 1;
      if (!enrolled) return fail("DRAFT_NOT_FOUND");
      const previousById = new Map(published.stops.map((stop) => [stop.deliveryStopId, stop]));
      const changedStops = draft.stops.filter((stop) => JSON.stringify(stop) !== JSON.stringify(previousById.get(stop.deliveryStopId)));
      if (changedStops.some((stop) => !editable().includes(stop.deliveryStopId))) return fail("STOP_NOT_FUTURE");
      if (changedStops.some((stop) => stop.latitude === null || stop.longitude === null)) return fail("STOP_LOCATION_NOT_ROUTEABLE");
      const changed = dirty();
      if (changed) { published = clone(draft); publishedVersionId = randomUUID(); counters.publications += 1; counters.logicalNotifications += 1; notificationAttempts = 0; }
      result = { routePlanId: FIXTURE_IDS.route, publicationVersionId: publishedVersionId, assignmentGeneration,
        sequence: counters.publications, publishedAt: "2026-10-07T13:05:00.000Z", appliedVersionId: null,
        pending: counters.publications > 0, snapshot: clone(published), revision, changed };
    } else { counters.blockedWrites += 1; return fail(dirty() ? "DRAFT_CONFLICT" : "FIXTURE_OPERATION_BLOCKED", 409); }
    receipts.set(input.commandId, { intent, serialized, data: clone(result) });
    record("command-committed", { intent, commandId: input.commandId, revision, publicationVersionId: publishedVersionId });
    return success(intent === "liveChangeDispatch" ? withDeliveryResult(result) : result);
  }
  function withDeliveryResult(result) {
    notificationAttempts += 1;
    return { ...clone(result), geometry: { status: geometryFailure ? "failed" : "fresh", errorCode: geometryFailure ? "SYNTHETIC_GEOMETRY_FAILED" : null },
      notification: { status: notificationFailure ? "FAILED" : "SENT", attemptCount: notificationAttempts, errorCode: notificationFailure ? "SYNTHETIC_PUSH_FAILED" : null } };
  }
  function control(action, value) {
    record("control", { action, value });
    if (action === "driver-current") currentStopId = FIXTURE_IDS.stop(Number(value ?? 7));
    if (action === "admin-edit") {
      const stop = draft.stops.find((candidate) => candidate.deliveryStopId === FIXTURE_IDS.stop(8));
      stop.address2 = `Synthetic other office revision ${revision + 1}`; revision += 1; enrolled = true;
      publishedVersionId ??= "90000000-0000-4000-8000-000000000000";
    }
    if (action === "assignment") { assignmentGeneration = String(Number(assignmentGeneration) + 1); draft = clone(published); revision = 0; enrolled = false; publishedVersionId = null; }
    if (action === "forbidden") denied = Boolean(value);
    if (action === "scope") scopeGeneration += 1;
    if (action === "enabled") enabled = Boolean(value);
    if (action === "delivery-failure") { geometryFailure = Boolean(value); notificationFailure = Boolean(value); }
    if (action === "terminal") routeStatus = String(value ?? "INCOMPLETE");
  }
  return { record, scopeKey, plan, group, detail, command, control,
    loseCommittedResponse(intent, result) {
      if (result.status !== 200) return result;
      record("response-lost-after-commit", { intent, transport: "deterministic-http-503", revision, publishedVersionId });
      const message = "Synthetic command committed, but its response is unavailable. Retry the original command.";
      return { status: 503, body: { data: null, error: { code: "UPSTREAM_RESPONSE_UNAVAILABLE", message },
        errors: [{ code: "UPSTREAM_RESPONSE_UNAVAILABLE", message }], outcomeUnknown: true, scopeKey: scopeKey() } };
    },
    read(requestScope = scopeKey()) { counters.liveReads += 1; record("live-read", { requestScope, revision }); return authorize(requestScope) ?? success(data()); },
    geocode(input, requestScope = scopeKey(), failed = false) {
      counters.searches += 1; record("geocode", { requestId: input.requestId, deliveryStopId: input.deliveryStopId, address: input.address });
      return authorize(requestScope) ?? (failed ? fail("GEOCODE_FAILED", 503) : success({ ...clone(input), latitude: 43.71, longitude: -79.41 }));
    },
    state() { return { syntheticOnly: true, ids: { route: FIXTURE_IDS.route, child: FIXTURE_IDS.child, group: FIXTURE_IDS.group },
      scopeKey: scopeKey(), enabled, denied, revision, assignmentGeneration, routeStatus, currentStopId, hasUnpublishedChanges: dirty(),
      publishedVersionId, published: clone(published), draft: clone(draft), editableFutureStopIds: editable(),
      counters: clone(counters), receipts: [...receipts].map(([commandId, receipt]) => ({ commandId, intent: receipt.intent, body: JSON.parse(receipt.serialized), revision: receipt.data.revision })), log: clone(log) }; },
  };
}
