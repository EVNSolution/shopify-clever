import { useEffect, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  LIVE_ADDRESS_FIELDS,
  createLiveEditor,
  liveStopValues,
  updateLiveStop,
  confirmLiveLocation,
  validLiveCoordinates,
  reorderLiveFutureStops,
  hasLiveLocalEdits,
  getLiveLocationIssues,
  createLiveCommandRequest,
  rebaseLiveEditor,
  isLiveResponseCurrent,
  buildLiveBffRequest,
  readLiveBffResponse,
  livePendingAfterFailure,
  isLiveAccessError,
  liveReceiptRefreshMode,
} from "./live-route-change";

export const liveLabels = {
  en: {
    stop: "Stop",
    editTitle: "Edit stop",
    editNote:
      "While the route is in progress, only the address of a future stop can change. Changes stay unsaved until you press Save.",
    done: "Done",
    address1: "Address",
    address2: "Apartment / suite",
    city: "City",
    province: "Province",
    postalCode: "Postal code",
    countryCode: "Country code",
    latitude: "Latitude",
    longitude: "Longitude",
    search: "Find coordinates",
    searching: "Finding coordinates…",
    map: "Check location on map",
    confirmLocation: "Confirm checked coordinates",
    verified: "Coordinates confirmed",
    locationPending: "Location not confirmed",
    unverified:
      "Location needs confirmation. You can Save the address. Dispatch requires confirmed coordinates.",
    discardWarning:
      "Discard removes ALL saved changes and unsaved input for this route, including changes saved by another office user. The published route stays as it is.",
    confirmDiscard: "Confirm discard",
    cancel: "Cancel",
    review:
      "Review the latest saved state before continuing. Your input is preserved.",
    reviewAction: "Review latest",
    privateYes: "Saved changes are waiting for Dispatch.",
    privateNo: "No saved private changes.",
    latestAddress: "Latest saved address",
    localAddress: "Your pending address",
    latestOrder: "Latest saved order of future stops",
    rebase: "Use latest state and keep my edits",
    saveDone: "Changes saved. The driver route has not changed.",
    dispatchDone:
      "Changes published. The driver still has to apply them. A push result does not confirm that.",
    discardDone: "Saved changes discarded. You can edit future stops again.",
    revertDone: "Unsaved changes reverted. Saved changes stay as they are.",
    readFailed:
      "Latest state could not be read. Refresh before starting another command.",
    unknown:
      "The command outcome is unknown. Retry the original command to find its result. New commands are blocked.",
    retry: "Retry original command",
    retryDelivery: "Retry publication delivery",
    retryNotice:
      "The publication succeeded. Geometry or notification needs another attempt.",
    searchFailed:
      "Coordinates were not found. Check the address or enter coordinates manually.",
    stopped:
      "This route is no longer in progress. New changes are blocked. Your input is preserved.",
    blocked:
      "The saved draft contains a stop that is no longer future. Discard the saved changes, then edit the remaining future stops.",
    auth: "Route access changed. Your input is preserved. Refresh after restoring access.",
    conflict:
      "The route or draft changed. Your input is preserved. Review the latest state before continuing.",
    invalid: "Check the address and coordinates.",
    searchResult: "Found coordinates. Check the map and confirm the location.",
  },
  ko: {
    stop: "배송지",
    editTitle: "배송지 편집",
    editNote:
      "배송 중에는 미래 배송지의 주소만 바꿀 수 있습니다. Save를 누르기 전까지 변경은 저장되지 않습니다.",
    done: "완료",
    address1: "주소",
    address2: "상세 주소",
    city: "도시",
    province: "주 / 지역",
    postalCode: "우편번호",
    countryCode: "국가 코드",
    latitude: "위도",
    longitude: "경도",
    search: "좌표 검색",
    searching: "좌표 검색 중…",
    map: "지도에서 위치 확인",
    confirmLocation: "확인한 좌표 승인",
    verified: "좌표 확인 완료",
    locationPending: "위치 미확인",
    unverified:
      "위치 확인이 필요합니다. 주소만 Save할 수 있습니다. Dispatch에는 확인한 좌표가 필요합니다.",
    discardWarning:
      "Discard는 이 경로의 저장된 변경 전체와 저장하지 않은 입력을 없앱니다. 다른 사무실 사용자가 저장한 변경도 포함됩니다. 공개 경로는 유지됩니다.",
    confirmDiscard: "Discard 확인",
    cancel: "취소",
    review: "계속하기 전에 최신 저장 상태를 검토하세요. 입력은 보존됩니다.",
    reviewAction: "최신 상태 검토",
    privateYes: "저장된 변경이 Dispatch를 기다립니다.",
    privateNo: "저장된 변경이 없습니다.",
    latestAddress: "저장된 최신 주소",
    localAddress: "보존한 입력 주소",
    latestOrder: "저장된 최신 미래 배송지 순서",
    rebase: "최신 상태로 내 입력 유지",
    saveDone: "변경을 저장했습니다. 기사 경로는 바뀌지 않았습니다.",
    dispatchDone:
      "변경을 공개했습니다. 기사가 적용해야 반영됩니다. 푸시 결과는 적용 완료를 의미하지 않습니다.",
    discardDone: "저장된 변경을 폐기했습니다. 미래 배송지를 다시 편집할 수 있습니다.",
    revertDone: "저장하지 않은 변경을 되돌렸습니다. 저장된 변경은 유지됩니다.",
    readFailed:
      "최신 상태를 읽지 못했습니다. 새 명령 전에 최신 상태를 조회하세요.",
    unknown:
      "명령 결과를 확인하지 못했습니다. 원래 명령을 재시도하여 결과를 확인하세요. 새 명령은 차단됩니다.",
    retry: "원래 명령 재시도",
    retryDelivery: "공개 전송 재시도",
    retryNotice:
      "공개는 성공했습니다. 경로 계산 또는 알림을 재시도해야 합니다.",
    searchFailed:
      "좌표를 찾지 못했습니다. 주소를 확인하거나 좌표를 직접 입력하세요.",
    stopped:
      "배송 중인 경로가 아닙니다. 새 변경은 차단됩니다. 입력은 보존됩니다.",
    blocked:
      "저장된 초안에 미래 배송지가 아닌 항목이 있습니다. 저장된 변경을 폐기한 뒤 남은 미래 배송지를 편집하세요.",
    auth: "경로 접근 권한이 바뀌었습니다. 입력은 보존됩니다. 권한 복구 후 최신 상태를 조회하세요.",
    conflict:
      "경로 또는 초안이 바뀌었습니다. 입력은 보존됩니다. 계속하기 전에 최신 상태를 검토하세요.",
    invalid: "주소와 좌표를 확인하세요.",
    searchResult: "좌표를 찾았습니다. 지도에서 위치를 확인하고 승인하세요.",
  },
};
const EMPTY = {
  editor: null,
  fresh: null,
  needsReview: false,
  pending: null,
  receipt: null,
  error: null,
  notice: "",
  discardConfirm: false,
};
const CONFLICT_CODES = new Set([
  "REVISION_CONFLICT",
  "ASSIGNMENT_CHANGED",
  "VERSION_CONFLICT",
  "STOP_NOT_FUTURE",
  "ROUTE_NOT_IN_PROGRESS",
  "DRAFT_CONFLICT",
  "SCOPE_CHANGED",
  "FORBIDDEN",
  "ACCESS_REVOKED",
  "UNAUTHORIZED",
  "NOT_FOUND",
]);
const ACCESS_CODES = ["UNAUTHORIZED", "FORBIDDEN", "ACCESS_REVOKED", "SCOPE_CHANGED"];
const storageKey = (scopeKey, routePlanId) =>
  `clever-live-change:${encodeURIComponent(scopeKey)}:${encodeURIComponent(routePlanId)}`;
function readStored(scopeKey, routePlanId) {
  try {
    const stored = JSON.parse(
      sessionStorage.getItem(storageKey(scopeKey, routePlanId)) || "null",
    );
    if (!stored?.editor || stored.editor.baseline?.routePlanId !== routePlanId)
      return EMPTY;
    return {
      ...EMPTY,
      ...stored,
      needsReview: true,
      fresh: null,
      discardConfirm: false,
      notice: "",
      receipt: null,
    };
  } catch {
    return EMPTY;
  }
}
function persistState(scopeKey, routePlanId, state) {
  try {
    const key = storageKey(scopeKey, routePlanId);
    if (hasLiveLocalEdits(state.editor) || state.pending || state.needsReview)
      sessionStorage.setItem(key, JSON.stringify(state));
    else sessionStorage.removeItem(key);
  } catch {
    /* Storage availability must not block editing. */
  }
}
function errorCode(error) {
  return error?.code || "REQUEST_FAILED";
}
function dispatchNeedsRetry(data) {
  return (
    ["failed", "unavailable"].includes(data?.geometry?.status) ||
    ["FAILED", "PENDING", "SENDING"].includes(data?.notification?.status)
  );
}

/**
 * State machine for future-stop changes on a KFood route in progress. The parent enables it only for the
 * authenticated KFood runtime. It owns the saved private draft plus unsaved office input; the page decides
 * how to show them. Every command keeps its idempotent body, so a lost reply is retried unchanged.
 */
export function useLiveRouteChange({
  enabled = false,
  routePlanId,
  scopeKey,
  language = "en",
  routeInProgress = true,
  onMutation,
}) {
  const text = language === "ko" ? liveLabels.ko : liveLabels.en;
  const shopify = useAppBridge();
  const [storedState, setState] = useState(EMPTY);
  const state =
    enabled && storedState.contextKey === storageKey(scopeKey, routePlanId)
      ? storedState
      : EMPTY;
  const [busy, setBusy] = useState("");
  const [searchState, setSearchState] = useState({});
  const stateRef = useRef(state);
  const contextRef = useRef({ scopeKey, routePlanId, epoch: 0 });
  const scopeEpochRef = useRef(0);
  const operationRef = useRef(false);
  const readSequenceRef = useRef(0);
  const searchSequenceRef = useRef({});
  const shopifyRef = useRef(shopify);
  const onMutationRef = useRef(onMutation);
  const mountedRef = useRef(false);
  stateRef.current = storedState;
  contextRef.current = { scopeKey, routePlanId, epoch: scopeEpochRef.current };
  shopifyRef.current = shopify;
  onMutationRef.current = onMutation;

  function putState(next) {
    const scoped = {
      ...next,
      contextKey: storageKey(
        contextRef.current.scopeKey,
        contextRef.current.routePlanId,
      ),
    };
    stateRef.current = scoped;
    setState(scoped);
    persistState(
      contextRef.current.scopeKey,
      contextRef.current.routePlanId,
      scoped,
    );
  }
  function changeState(updater) {
    putState(updater(stateRef.current));
  }
  function sameContext(context) {
    return (
      mountedRef.current &&
      context.scopeKey === contextRef.current.scopeKey &&
      context.routePlanId === contextRef.current.routePlanId &&
      context.epoch === contextRef.current.epoch
    );
  }
  async function request(context, intent, commandBody) {
    const token = await shopifyRef.current.idToken();
    if (!sameContext(context)) throw new Error("STALE_RESPONSE");
    const { url, options } = buildLiveBffRequest(
      window.location.href,
      context,
      token,
      intent ? { intent, commandBody } : undefined,
    );
    const response = await fetch(url, options);
    const result = await readLiveBffResponse(response, context.scopeKey);
    if (!sameContext(context)) throw new Error("STALE_RESPONSE");
    return result;
  }
  async function loadLatest(mode = "review", context = contextRef.current) {
    const requestId = ++readSequenceRef.current;
    const identity = { ...context, requestId };
    try {
      const result = await request(context);
      if (
        !isLiveResponseCurrent(identity, {
          ...contextRef.current,
          requestId: readSequenceRef.current,
        }) ||
        !mountedRef.current
      )
        return false;
      if (result.error || result.data?.routePlanId !== context.routePlanId)
        throw Object.assign(
          new Error(result.error?.message || "Route identity changed."),
          { code: errorCode(result.error) },
        );
      const current = stateRef.current;
      const preserve =
        mode === "review" ||
        (mode === "initial" &&
          (hasLiveLocalEdits(current.editor) ||
            current.pending ||
            current.needsReview));
      putState({
        ...current,
        ...(preserve && current.editor
          ? {
              fresh: result.data,
              needsReview: true,
              error:
                current.pending?.unknown && isLiveAccessError(current.error)
                  ? null
                  : current.error,
            }
          : {
              editor: createLiveEditor(result.data),
              fresh: null,
              needsReview: false,
              error: null,
            }),
        discardConfirm: false,
      });
      return true;
    } catch (error) {
      if (
        !sameContext(context) ||
        !isLiveResponseCurrent(identity, {
          ...contextRef.current,
          requestId: readSequenceRef.current,
        }) ||
        error.message === "STALE_RESPONSE"
      )
        return false;
      changeState((current) => ({
        ...current,
        needsReview: true,
        fresh: null,
        error: { code: error.code || "READ_FAILED", message: text.readFailed },
      }));
      return false;
    }
  }

  useEffect(() => {
    if (!enabled) return undefined;
    mountedRef.current = true;
    operationRef.current = true;
    scopeEpochRef.current += 1;
    const context = { scopeKey, routePlanId, epoch: scopeEpochRef.current };
    contextRef.current = context;
    readSequenceRef.current += 1;
    searchSequenceRef.current = {};
    setSearchState({});
    const restored = {
      ...readStored(scopeKey, routePlanId),
      contextKey: storageKey(scopeKey, routePlanId),
    };
    stateRef.current = restored;
    setState(restored);
    setBusy("loading");
    loadLatest("initial", context).finally(() => {
      if (sameContext(context)) {
        operationRef.current = false;
        setBusy("");
      }
    });
    return () => {
      mountedRef.current = false;
      persistState(context.scopeKey, context.routePlanId, stateRef.current);
    };
    // Scope changes start a separate, authenticated editor. Existing input stays in its scoped session entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scopeKey, routePlanId]);

  async function refresh() {
    if (operationRef.current) return;
    operationRef.current = true;
    setBusy("loading");
    const context = contextRef.current;
    await loadLatest("review", context);
    if (sameContext(context)) {
      operationRef.current = false;
      setBusy("");
    }
  }
  async function requestDiscard() {
    if (
      operationRef.current ||
      stateRef.current.pending?.unknown ||
      !routeInProgress
    )
      return;
    operationRef.current = true;
    setBusy("loading");
    const context = contextRef.current;
    const refreshed = await loadLatest("review", context);
    if (sameContext(context)) {
      operationRef.current = false;
      setBusy("");
      if (refreshed)
        changeState((current) => ({ ...current, discardConfirm: true }));
    }
  }
  function cancelDiscard() {
    changeState((current) => ({ ...current, discardConfirm: false }));
  }
  function revert() {
    if (
      operationRef.current ||
      stateRef.current.pending?.unknown ||
      !routeInProgress ||
      !stateRef.current.editor
    )
      return;
    changeState((current) => ({
      ...current,
      editor: createLiveEditor(current.editor.baseline),
      notice: "revertDone",
    }));
  }
  function rebase() {
    const current = stateRef.current;
    if (
      !current.fresh ||
      current.pending?.unknown ||
      operationRef.current ||
      (current.error?.code === "STOP_NOT_FUTURE" &&
        current.fresh.hasUnpublishedChanges)
    )
      return;
    try {
      putState({
        ...current,
        editor: rebaseLiveEditor(current.editor, current.fresh),
        fresh: null,
        needsReview: false,
        error: null,
        notice: "",
        discardConfirm: false,
      });
    } catch (error) {
      changeState((previous) => ({
        ...previous,
        error: { code: error.message, message: text.blocked },
      }));
    }
  }
  function editStop(id, field, value) {
    if (
      operationRef.current ||
      stateRef.current.pending?.unknown ||
      !routeInProgress
    )
      return;
    searchSequenceRef.current[id] = (searchSequenceRef.current[id] || 0) + 1;
    setSearchState((previous) => ({ ...previous, [id]: null }));
    changeState((current) => ({
      ...current,
      editor: updateLiveStop(current.editor, id, field, value),
      notice: "",
    }));
  }
  /** Applies a full future-stop order. Returns false when it cannot be applied. */
  function setFutureOrder(ids) {
    const current = stateRef.current;
    if (
      operationRef.current ||
      current.pending?.unknown ||
      !routeInProgress ||
      !current.editor
    )
      return false;
    try {
      putState({
        ...current,
        editor: reorderLiveFutureStops(current.editor, ids),
        notice: "",
      });
      return true;
    } catch {
      return false;
    }
  }
  async function searchCoordinates(id) {
    if (
      operationRef.current ||
      stateRef.current.pending?.unknown ||
      !routeInProgress
    )
      return;
    const context = contextRef.current;
    const sequence = (searchSequenceRef.current[id] || 0) + 1;
    searchSequenceRef.current[id] = sequence;
    const values = liveStopValues(stateRef.current.editor, id);
    const address = Object.fromEntries(
      LIVE_ADDRESS_FIELDS.map((field) => [field, values[field]]),
    );
    const addressKey = JSON.stringify(address);
    const requestId = crypto.randomUUID();
    setSearchState((previous) => ({ ...previous, [id]: { busy: true } }));
    try {
      const result = await request(
        context,
        "liveChangeGeocode",
        JSON.stringify({ requestId, deliveryStopId: id, address }),
      );
      if (!sameContext(context) || searchSequenceRef.current[id] !== sequence)
        return;
      const latest = liveStopValues(stateRef.current.editor, id);
      if (
        JSON.stringify(
          Object.fromEntries(
            LIVE_ADDRESS_FIELDS.map((field) => [field, latest[field]]),
          ),
        ) !== addressKey
      )
        return;
      if (
        result.error ||
        result.data?.requestId !== requestId ||
        result.data?.deliveryStopId !== id ||
        JSON.stringify(result.data.address) !== addressKey ||
        !validLiveCoordinates(result.data)
      )
        throw new Error(text.searchFailed);
      changeState((current) => ({
        ...current,
        editor: updateLiveStop(
          updateLiveStop(
            current.editor,
            id,
            "latitude",
            String(result.data.latitude),
          ),
          id,
          "longitude",
          String(result.data.longitude),
        ),
      }));
      setSearchState((previous) => ({
        ...previous,
        [id]: { message: text.searchResult },
      }));
    } catch (error) {
      if (sameContext(context) && searchSequenceRef.current[id] === sequence)
        setSearchState((previous) => ({
          ...previous,
          [id]: { error: text.searchFailed },
        }));
    }
  }
  function confirmLocation(id) {
    if (
      operationRef.current ||
      stateRef.current.pending?.unknown ||
      !routeInProgress
    )
      return;
    try {
      changeState((current) => ({
        ...current,
        editor: confirmLiveLocation(current.editor, id),
        notice: "",
      }));
    } catch {
      setSearchState((previous) => ({
        ...previous,
        [id]: { error: text.invalid },
      }));
    }
  }

  async function runCommand(action, retry = false) {
    const initial = stateRef.current;
    if (
      operationRef.current ||
      ACCESS_CODES.includes(errorCode(initial.error)) ||
      (!retry && (!routeInProgress || initial.pending?.unknown))
    )
      return;
    if (!retry && action !== "discard" && initial.needsReview) return;
    if (!retry && action === "discard" && initial.needsReview && !initial.fresh)
      return;
    let command;
    try {
      const editor =
        action === "discard" && initial.fresh
          ? createLiveEditor(initial.fresh)
          : initial.editor;
      command = retry
        ? initial.pending.request
        : createLiveCommandRequest(editor, action, crypto.randomUUID());
    } catch (error) {
      changeState((current) => ({
        ...current,
        error: { code: error.message, message: text.invalid },
      }));
      return;
    }
    operationRef.current = true; // Synchronous lock stops a second click before React commits state.
    const context = contextRef.current;
    readSequenceRef.current += 1;
    searchSequenceRef.current = {};
    setBusy(command.action);
    changeState((current) => ({
      ...current,
      pending: { request: command, unknown: true },
      discardConfirm: false,
      error: null,
      notice: "",
    }));
    try {
      const result = await request(
        context,
        command.intent,
        command.commandBody,
      );
      if (!sameContext(context)) return;
      if (result.error) {
        const code = errorCode(result.error);
        const pending = livePendingAfterFailure(
          command,
          result,
          retry ? initial.pending : null,
        );
        changeState((current) => ({
          ...current,
          pending,
          error: result.error,
          needsReview:
            isLiveAccessError(result.error) ||
            (!pending?.unknown &&
              (CONFLICT_CODES.has(code) || code === "IDEMPOTENCY_CONFLICT")),
          fresh: null,
        }));
        return;
      }
      const sideEffects =
        command.action === "dispatch" && dispatchNeedsRetry(result.data);
      changeState((current) => ({
        ...current,
        pending: sideEffects ? { request: command, unknown: false } : null,
        receipt: { action: command.action, data: result.data },
        notice: `${command.action}Done`,
        error: null,
      }));
      onMutationRef.current?.();
      const fresh = await loadLatest(
        liveReceiptRefreshMode(command.action, retry, initial.editor),
        context,
      );
      if (!fresh && sameContext(context))
        changeState((current) => ({ ...current, needsReview: true }));
    } catch (error) {
      if (!sameContext(context) || error.message === "STALE_RESPONSE") return;
      changeState((current) => ({
        ...current,
        pending: { request: command, unknown: true },
        error: { code: "OUTCOME_UNKNOWN", message: text.unknown },
      }));
    } finally {
      if (sameContext(context)) {
        operationRef.current = false;
        setBusy("");
      }
    }
  }

  const editor = state.editor;
  const localDirty = hasLiveLocalEdits(editor);
  const locationIssues = getLiveLocationIssues(editor);
  const code = errorCode(state.error);
  const accessBlocked = ACCESS_CODES.includes(code);
  const locked = Boolean(
    busy || state.pending?.unknown || !routeInProgress || accessBlocked,
  );
  const errorMessage = state.error
    ? code === "STOP_NOT_FUTURE"
      ? text.blocked
      : accessBlocked
        ? text.auth
        : CONFLICT_CODES.has(code)
          ? text.conflict
          : state.error.message
    : "";
  const privateDirty = Boolean(
    (state.fresh || editor?.baseline)?.hasUnpublishedChanges,
  );
  const ready = Boolean(editor);

  return {
    enabled,
    ready,
    routeInProgress,
    busy,
    state,
    text,
    editor,
    errorCode: code,
    errorMessage,
    noticeText: state.notice ? text[state.notice] : "",
    localDirty,
    privateDirty,
    locationIssues,
    locked,
    searchState,
    futureStopIds: editor?.baseline.editableFutureStopIds ?? [],
    canSave: ready && !locked && !state.needsReview && localDirty,
    canDispatch:
      ready &&
      !locked &&
      !state.needsReview &&
      !localDirty &&
      privateDirty &&
      locationIssues.length === 0,
    canDiscard: ready && !locked && privateDirty,
    canRevert: ready && !locked && localDirty,
    valuesFor: (id) => liveStopValues(editor, id),
    setFutureOrder,
    editStop,
    searchCoordinates,
    confirmLocation,
    save: () => runCommand("save"),
    dispatch: () => runCommand("dispatch"),
    retryPending: () => runCommand(stateRef.current.pending?.request.action, true),
    retryDelivery: () => runCommand("dispatch", true),
    requestDiscard,
    confirmDiscard: () => runCommand("discard"),
    cancelDiscard,
    revert,
    refresh,
    rebase,
  };
}
