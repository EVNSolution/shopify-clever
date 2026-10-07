import { createHash } from "node:crypto";

import { geocodeAddress } from "../locations/address-geocoding.server.js";
import {
  deliveryApiRequest,
  fetchDeliveryRoutePlanDetail,
  invalidateDeliveryRouteResponseCache,
} from "./route-plans.server.js";

const KFOOD_APP_ID = "clever-route-kfood";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ADDRESS_FIELDS = ["address1", "address2", "city", "province", "postalCode", "countryCode"];
const COMMAND_FIELDS = ["commandId", "expectedAssignmentGeneration", "expectedRouteVersionId", "expectedRevision"];
const COMMANDS = {
  liveChangeSave: { method: "PATCH", suffix: "" },
  liveChangeDispatch: { method: "POST", suffix: "/dispatch" },
  liveChangeDiscard: { method: "POST", suffix: "/discard" },
};

export function getKfoodLiveChangeContext(session, env = process.env) {
  const appId = env.CLEVER_APP_ID?.trim() ?? "clever";
  const liveChangeScopeKey = createHash("sha256")
    .update(JSON.stringify([appId, session?.shop ?? "", session?.id ?? ""]))
    .digest("hex");
  return {
    liveChangeEnabled: env.CLEVER_KFOOD_LIVE_CHANGE_ENABLED === "true" && appId === KFOOD_APP_ID,
    liveChangeScopeKey,
  };
}

function liveError(code, message, status = 400, data = null) {
  const error = { code, message, status };
  return { data, error, errors: [error] };
}

function validateScope(options) {
  const context = getKfoodLiveChangeContext(options.session);
  if (!context.liveChangeEnabled) {
    return liveError("LIVE_CHANGE_DISABLED", "KFood 배송 중 변경 기능이 비활성 상태입니다.", 403);
  }
  if (!options.session?.shop) {
    return liveError("UNAUTHORIZED", "Shopify 인증 상태를 다시 확인해주세요.", 401);
  }
  if (options.scopeKey && options.scopeKey !== context.liveChangeScopeKey) {
    return liveError("SCOPE_CHANGED", "앱 또는 Shopify 인증 범위가 변경되었습니다. 입력을 보존하고 페이지를 다시 열어주세요.", 409);
  }
  return null;
}

function toEnvelope(result, options) {
  const errors = result.errors ?? [];
  return {
    data: result.data ?? null,
    error: errors[0] ?? null,
    errors,
    scopeKey: getKfoodLiveChangeContext(options.session).liveChangeScopeKey,
  };
}

function liveRequestOptions(options) {
  return {
    fetch: options.fetch,
    cache: "no-store",
    cacheTtlMs: 0,
    cacheKey: options.session?.shop,
    skipCacheInvalidation: true,
  };
}

async function resolveLiveRoute(request, routeId, options) {
  const scopedError = validateScope(options);
  if (scopedError) return { error: scopedError };
  if (!UUID.test(routeId ?? "")) {
    return { error: liveError("BAD_REQUEST", "유효한 Route ID가 필요합니다.") };
  }
  const detail = await fetchDeliveryRoutePlanDetail(request, routeId, liveRequestOptions(options));
  if (detail.errors?.length) return { error: toEnvelope(detail, options) };
  const routePlanId = detail.routePlan?.id;
  if (!UUID.test(routePlanId ?? "")) {
    return { error: liveError("NOT_FOUND", "실제 Route를 찾지 못했습니다.", 404) };
  }
  if (options.routePlanId && options.routePlanId !== routePlanId) {
    return { error: liveError("VERSION_CONFLICT", "화면의 Route와 현재 Route가 다릅니다. 입력을 보존하고 최신 상태를 확인해주세요.", 409) };
  }
  const groupingId = detail.routePlan?.routeGroupingChild?.groupingId;
  if (options.routeGroupId && groupingId !== options.routeGroupId) {
    return { error: liveError("VERSION_CONFLICT", "Route group의 현재 Route가 변경되었습니다.", 409) };
  }
  return { routePlanId };
}

function validDraft(data, routePlanId) {
  return data?.routePlanId === routePlanId && Number.isInteger(data.revision) && data.revision >= 0
    && typeof data.assignmentGeneration === "string" && UUID.test(data.expectedRouteVersionId ?? "")
    && Array.isArray(data.editableFutureStopIds) && Array.isArray(data.draft?.stops);
}

export async function fetchKfoodLiveChange(request, routeId, options = {}) {
  const resolved = await resolveLiveRoute(request, routeId, options);
  if (resolved.error) return resolved.error;
  const result = await deliveryApiRequest(request, `/admin/route-plans/${resolved.routePlanId}/live-change`, {
    ...liveRequestOptions(options), method: "GET",
  });
  if (!result.errors.length && !validDraft(result.data, resolved.routePlanId)) {
    return liveError("LIVE_CHANGE_RESPONSE_INVALID", "배송 중 변경 상태 응답을 확인하지 못했습니다.", 502);
  }
  return toEnvelope(result, options);
}

function readCommand(intent, raw) {
  if (typeof raw !== "string" || raw.length > 256_000) return null;
  try {
    const command = JSON.parse(raw);
    const fields = intent === "liveChangeSave" ? [...COMMAND_FIELDS, "stopOverrides", "futureStopOrder"] : COMMAND_FIELDS;
    if (!command || typeof command !== "object" || Array.isArray(command)
      || Object.keys(command).some((field) => !fields.includes(field))) return null;
    if (!UUID.test(command.commandId ?? "") || !UUID.test(command.expectedRouteVersionId ?? "")
      || typeof command.expectedAssignmentGeneration !== "string" || !/^(0|[1-9]\d*)$/u.test(command.expectedAssignmentGeneration)
      || !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) return null;
    if (intent === "liveChangeSave") {
      if (!Array.isArray(command.stopOverrides)) return null;
      const overrideFields = ["deliveryStopId", ...ADDRESS_FIELDS, "latitude", "longitude"];
      if ((command.stopOverrides ?? []).some((stop) => !stop || typeof stop !== "object" || Array.isArray(stop)
        || !UUID.test(stop.deliveryStopId ?? "") || Object.keys(stop).some((field) => !overrideFields.includes(field)))) return null;
      if (command.futureStopOrder !== undefined && (!Array.isArray(command.futureStopOrder)
        || command.futureStopOrder.some((id) => typeof id !== "string" || !UUID.test(id)))) return null;
    }
    return command;
  } catch {
    return null;
  }
}

export async function runKfoodLiveChangeCommand(request, routeId, intent, raw, options = {}) {
  const scopedError = validateScope(options);
  if (scopedError) return scopedError;
  if (!Object.hasOwn(COMMANDS, intent) || !readCommand(intent, raw)) {
    return liveError("BAD_REQUEST", "변경 명령과 revision을 확인해주세요.");
  }
  const resolved = await resolveLiveRoute(request, routeId, options);
  if (resolved.error) return resolved.error;
  const { method, suffix } = COMMANDS[intent];
  const result = await deliveryApiRequest(request, `/admin/route-plans/${resolved.routePlanId}/live-change${suffix}`, {
    ...liveRequestOptions(options), body: raw, method,
  });
  const outcomeUnknown = result.errors.some((error) => error.status === 0 || error.status >= 500)
    || (!result.errors.length && (intent === "liveChangeDispatch"
      ? result.data?.routePlanId !== resolved.routePlanId || !UUID.test(result.data?.publicationVersionId ?? "") || !Number.isInteger(result.data?.revision)
      : !validDraft(result.data, resolved.routePlanId)));
  // Invalidate the authenticated shop's route caches even when the write reply is lost.
  // Other shops retain their own cached responses.
  invalidateDeliveryRouteResponseCache(request, { cacheKey: options.session.shop });
  if (outcomeUnknown && !result.errors.length) {
    const failure = liveError("LIVE_CHANGE_OUTCOME_UNKNOWN", "명령 결과를 확인하지 못했습니다. 원래 명령으로 재시도한 뒤 최신 상태를 확인해주세요.", 502);
    return { ...failure, outcomeUnknown: true, scopeKey: getKfoodLiveChangeContext(options.session).liveChangeScopeKey };
  }
  return { ...toEnvelope(result, options), ...(outcomeUnknown ? { outcomeUnknown: true } : {}) };
}

export async function geocodeKfoodLiveChange(request, routeId, raw, options = {}) {
  const scopedError = validateScope(options);
  if (scopedError) return scopedError;
  let input;
  try { input = JSON.parse(raw); } catch { /* Invalid input is returned below. */ }
  if (!input || typeof input.requestId !== "string" || !input.requestId || input.requestId.length > 128
    || !UUID.test(input.deliveryStopId ?? "") || !input.address || typeof input.address !== "object" || Array.isArray(input.address)
    || Object.keys(input.address).some((field) => !ADDRESS_FIELDS.includes(field))
    || Object.values(input.address).some((value) => value !== null && typeof value !== "string")) {
    return liveError("BAD_REQUEST", "주소 확인 요청과 배송지 ID를 확인해주세요.");
  }
  const identity = { requestId: input.requestId, deliveryStopId: input.deliveryStopId, address: input.address };
  const resolved = await resolveLiveRoute(request, routeId, options);
  if (resolved.error) return { ...resolved.error, data: identity };
  const query = ADDRESS_FIELDS.map((field) => input.address[field]?.trim()).filter(Boolean).join(", ");
  if (!query) return liveError("BAD_REQUEST", "확인할 주소를 입력해주세요.", 400, identity);
  const coordinates = await (options.geocodeAddress ?? geocodeAddress)(query);
  if (!coordinates) return liveError("GEOCODE_NOT_FOUND", "주소의 좌표를 찾지 못했습니다. 주소를 확인하거나 지도 좌표를 직접 입력해주세요.", 422, identity);
  return toEnvelope({ data: { ...identity, ...coordinates }, errors: [] }, options);
}

export function liveChangeJsonResponse(result) {
  const status = Number.isInteger(result.error?.status) && result.error.status >= 400 ? result.error.status : result.error ? 400 : 200;
  return Response.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function handleKfoodLiveChangeAction(request, routeId, intent, formData, options = {}) {
  const guardedOptions = {
    ...options,
    scopeKey: formData.get("scopeKey"),
    routePlanId: formData.get("routePlanId"),
  };
  const result = intent === "liveChangeGeocode"
    ? await geocodeKfoodLiveChange(request, routeId, formData.get("command"), guardedOptions)
    : await runKfoodLiveChangeCommand(request, routeId, intent, formData.get("command"), guardedOptions);
  return liveChangeJsonResponse(result);
}
