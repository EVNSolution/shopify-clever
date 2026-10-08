/* eslint-disable react/prop-types */
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

const labels = {
  en: {
    title: "Future delivery changes",
    intro:
      "Edit future stops while the driver continues the current delivery. Save keeps a private draft. Dispatch publishes that draft.",
    published: "Published route",
    private: "Private draft",
    privateYes: "Saved changes are waiting for Dispatch.",
    privateNo: "No saved private changes.",
    local: "Unsaved office changes",
    revision: "Draft revision",
    assignment: "Driver assignment",
    fixed: "Current and completed stops stay fixed.",
    future: "Future delivery order",
    moveUp: "Move up",
    moveDown: "Move down",
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
    save: "Save private draft",
    dispatch: "Dispatch saved changes",
    discard: "Discard private edits",
    confirmDiscard: "Confirm discard",
    cancel: "Cancel",
    discardWarning:
      "Discard removes ALL saved private changes and unsaved office input for this route. The published route stays as it is.",
    refresh: "Refresh latest state",
    rebase: "Use latest state and keep my edits",
    review:
      "Review the latest draft and driver assignment before continuing. Your input is preserved.",
    fresh: "Latest draft revision",
    saveDone: "Private draft saved. The driver route has not changed.",
    dispatchDone:
      "Changes published. A push result does not confirm driver application.",
    discardDone: "Private changes discarded. You can edit future stops again.",
    readFailed:
      "Latest state could not be read. Refresh before starting another command.",
    unknown:
      "The command outcome is unknown. Retry the original command to find its result. New commands are blocked.",
    retry: "Retry original command",
    retryDelivery: "Retry publication delivery",
    retryNotice:
      "The publication succeeded. Geometry or notification needs another attempt.",
    loading: "Loading latest draft…",
    busy: "Working…",
    searchFailed:
      "Coordinates were not found. Check the address or enter coordinates manually.",
    changedDuringSearch:
      "The address changed. Find coordinates for the new address.",
    stopped:
      "This route is no longer in progress. New changes are blocked. Your input is preserved.",
    blocked:
      "The saved draft contains a stop that is no longer future. Discard the private edits, then edit the remaining future stops.",
    auth: "Route access changed. Your input is preserved. Refresh after restoring access.",
    conflict:
      "The route or draft changed. Your input is preserved. Refresh and explicitly review the latest state.",
    invalid: "Check the address and coordinates.",
    geometry: "Geometry",
    notification: "Notification",
    receipt: "Last command receipt",
    sideEffects:
      "Driver application requires the separate driver Apply action.",
    revert: "Revert unsaved input",
    revertDone:
      "Unsaved input reverted. The saved private draft stays as it is.",
    latestAddress: "Latest saved server address",
    localAddress: "Your pending address",
    latestOrder: "Latest saved future order",
    stop: "Stop",
    searchResult: "Found coordinates. Check the map and confirm the location.",
  },
  ko: {
    title: "미래 배송 변경",
    intro:
      "기사가 현재 배송을 처리하는 동안 미래 배송지를 편집합니다. Save는 비공개 초안을 저장합니다. Dispatch는 저장된 초안을 공개합니다.",
    published: "공개 경로",
    private: "비공개 초안",
    privateYes: "저장된 변경이 Dispatch를 기다립니다.",
    privateNo: "저장된 비공개 변경이 없습니다.",
    local: "저장하지 않은 사무실 변경",
    revision: "초안 revision",
    assignment: "기사 배정",
    fixed: "현재 배송지와 완료 배송지의 위치는 유지됩니다.",
    future: "미래 배송 순서",
    moveUp: "위로 이동",
    moveDown: "아래로 이동",
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
    save: "Save 비공개 초안",
    dispatch: "Dispatch 저장된 변경",
    discard: "비공개 변경 폐기",
    confirmDiscard: "폐기 확인",
    cancel: "취소",
    discardWarning:
      "폐기는 이 경로의 저장된 비공개 변경 전체와 저장하지 않은 입력을 없앱니다. 공개 경로는 유지됩니다.",
    refresh: "최신 상태 조회",
    rebase: "최신 상태로 내 입력 유지",
    review: "최신 초안과 기사 배정을 검토한 뒤 계속하세요. 입력은 보존됩니다.",
    fresh: "최신 초안 revision",
    saveDone: "비공개 초안을 저장했습니다. 기사 경로는 바뀌지 않았습니다.",
    dispatchDone:
      "변경을 공개했습니다. 푸시 결과는 기사 적용 완료를 의미하지 않습니다.",
    discardDone:
      "비공개 변경을 폐기했습니다. 미래 배송지를 다시 편집할 수 있습니다.",
    readFailed:
      "최신 상태를 읽지 못했습니다. 새 명령 전에 최신 상태를 조회하세요.",
    unknown:
      "명령 결과를 확인하지 못했습니다. 원래 명령을 재시도하여 결과를 확인하세요. 새 명령은 차단됩니다.",
    retry: "원래 명령 재시도",
    retryDelivery: "공개 전송 재시도",
    retryNotice:
      "공개는 성공했습니다. 경로 계산 또는 알림을 재시도해야 합니다.",
    loading: "최신 초안 조회 중…",
    busy: "처리 중…",
    searchFailed:
      "좌표를 찾지 못했습니다. 주소를 확인하거나 좌표를 직접 입력하세요.",
    changedDuringSearch: "주소가 바뀌었습니다. 새 주소로 좌표를 검색하세요.",
    stopped:
      "배송 중인 경로가 아닙니다. 새 변경은 차단됩니다. 입력은 보존됩니다.",
    blocked:
      "저장된 초안에 미래 배송지가 아닌 항목이 있습니다. 비공개 변경을 폐기한 뒤 남은 미래 배송지를 편집하세요.",
    auth: "경로 접근 권한이 바뀌었습니다. 입력은 보존됩니다. 권한 복구 후 최신 상태를 조회하세요.",
    conflict:
      "경로 또는 초안이 바뀌었습니다. 입력은 보존됩니다. 최신 상태를 조회하고 명시적으로 검토하세요.",
    invalid: "주소와 좌표를 확인하세요.",
    geometry: "경로 계산",
    notification: "알림",
    receipt: "마지막 명령 결과",
    sideEffects: "기사 적용에는 별도의 Apply 동작이 필요합니다.",
    revert: "저장하지 않은 입력 되돌리기",
    revertDone:
      "저장하지 않은 입력을 되돌렸습니다. 저장된 비공개 초안은 유지됩니다.",
    latestAddress: "서버에 저장된 최신 주소",
    localAddress: "보존한 입력 주소",
    latestOrder: "서버에 저장된 최신 미래 순서",
    stop: "배송지",
    searchResult: "좌표를 찾았습니다. 지도에서 위치를 확인하고 승인하세요.",
  },
};
const sectionStyle = {
  background: "#fff",
  border: "1px solid #d6d6d6",
  borderRadius: 12,
  padding: 18,
  display: "grid",
  gap: 14,
  scrollMarginTop: 24,
};
const rowStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};
const buttonStyle = {
  border: "1px solid #8a8a8a",
  borderRadius: 8,
  padding: "8px 12px",
  minHeight: 38,
  background: "#fff",
  font: "inherit",
  cursor: "pointer",
};
const inputStyle = {
  border: "1px solid #8a8a8a",
  borderRadius: 8,
  padding: "8px 10px",
  minHeight: 38,
  background: "#fff",
  boxSizing: "border-box",
  font: "inherit",
  width: "100%",
};
const noticeStyle = {
  border: "1px solid #b5d9f7",
  borderRadius: 8,
  background: "#eef7ff",
  padding: 12,
  margin: 0,
};
const errorStyle = {
  ...noticeStyle,
  borderColor: "#edb2a7",
  background: "#fff4f4",
  color: "#8e1f0b",
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

/** The parent enables this only for the authenticated KFood test runtime. */
export function LiveRouteChangeEditor({
  routePlanId,
  scopeKey,
  language = "en",
  routeInProgress = true,
  onMutation,
}) {
  const text = language === "ko" ? labels.ko : labels.en;
  const shopify = useAppBridge();
  const [storedState, setState] = useState(EMPTY);
  const state =
    storedState.contextKey === storageKey(scopeKey, routePlanId)
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
  }, [scopeKey, routePlanId]);

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
  async function prepareDiscard() {
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
  function revertUnsaved() {
    if (
      operationRef.current ||
      stateRef.current.pending?.unknown ||
      !routeInProgress
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
  function moveStop(id, offset) {
    const current = stateRef.current;
    if (operationRef.current || current.pending?.unknown || !routeInProgress)
      return;
    const order = [...current.editor.futureStopOrder];
    const index = order.indexOf(id),
      nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    putState({
      ...current,
      editor: reorderLiveFutureStops(current.editor, order),
      notice: "",
    });
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
      ["UNAUTHORIZED", "FORBIDDEN", "ACCESS_REVOKED", "SCOPE_CHANGED"].includes(
        errorCode(initial.error),
      ) ||
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
  const accessBlocked = [
    "UNAUTHORIZED",
    "FORBIDDEN",
    "ACCESS_REVOKED",
    "SCOPE_CHANGED",
  ].includes(code);
  const locked = Boolean(
    busy || state.pending?.unknown || !routeInProgress || accessBlocked,
  );
  const errorMessage = state.error
    ? code === "STOP_NOT_FUTURE"
      ? text.blocked
      : [
            "FORBIDDEN",
            "ACCESS_REVOKED",
            "UNAUTHORIZED",
            "SCOPE_CHANGED",
          ].includes(code)
        ? text.auth
        : CONFLICT_CODES.has(code)
          ? text.conflict
          : state.error.message
    : "";
  const privateDirty = Boolean(
    (state.fresh || editor?.baseline)?.hasUnpublishedChanges,
  );
  const stopById = new Map(
    editor?.baseline.draft.stops.map((stop) => [stop.deliveryStopId, stop]) ||
      [],
  );

  return (
    <section
      id="live-route-change-editor"
      aria-label={text.title}
      aria-busy={Boolean(busy)}
      style={sectionStyle}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 20 }}>{text.title}</h2>
        <p style={{ margin: "6px 0 0", color: "#616161" }}>{text.intro}</p>
      </div>
      {busy === "loading" ? <p role="status">{text.loading}</p> : null}
      {!routeInProgress ? (
        <p role="alert" style={errorStyle}>
          {text.stopped}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" style={errorStyle}>
          {errorMessage} <strong>{code}</strong>
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" style={noticeStyle}>
          {text[state.notice]}
        </p>
      ) : null}
      {state.pending?.unknown ? (
        <div role="alert" style={errorStyle}>
          <p>{text.unknown}</p>
          <button
            style={buttonStyle}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => runCommand(state.pending.request.action, true)}
          >
            {text.retry}
          </button>
        </div>
      ) : null}
      {state.pending && !state.pending.unknown ? (
        <div role="status" style={noticeStyle}>
          <p>{text.retryNotice}</p>
          <button
            style={buttonStyle}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => runCommand("dispatch", true)}
          >
            {text.retryDelivery}
          </button>
        </div>
      ) : null}
      <div style={rowStyle}>
        <button
          style={buttonStyle}
          type="button"
          disabled={Boolean(busy)}
          onClick={refresh}
        >
          {text.refresh}
        </button>
        {state.needsReview ? <span>{text.review}</span> : null}
      </div>
      {state.fresh ? (
        <div style={noticeStyle}>
          <p>
            {text.fresh}: <strong>{state.fresh.revision}</strong> ·{" "}
            {text.assignment}:{" "}
            <strong>{state.fresh.assignmentGeneration}</strong>
          </p>
          <p>
            {state.fresh.hasUnpublishedChanges
              ? text.privateYes
              : text.privateNo}
          </p>
          <p>
            {text.latestOrder}:{" "}
            {state.fresh.draft.stops
              .filter((stop) =>
                state.fresh.editableFutureStopIds.includes(stop.deliveryStopId),
              )
              .map(
                (stop) =>
                  `${stop.sequence}. ${stop.recipientName || stop.deliveryStopId}`,
              )
              .join(" → ")}
          </p>
          {Object.keys(editor?.edits || {}).map((id) => {
            const latestStop = state.fresh.draft.stops.find(
              (stop) => stop.deliveryStopId === id,
            );
            const localStop = editor.edits[id];
            return (
              <div
                key={id}
                style={{
                  borderTop: "1px solid #b5d9f7",
                  paddingTop: 8,
                  marginBottom: 8,
                }}
              >
                <strong>
                  {text.stop} {latestStop?.sequence ?? id}
                </strong>
                <p>
                  {text.latestAddress}:{" "}
                  {LIVE_ADDRESS_FIELDS.map((field) => latestStop?.[field])
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p>
                  {text.localAddress}:{" "}
                  {LIVE_ADDRESS_FIELDS.map((field) => localStop[field])
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            );
          })}
          <button
            style={buttonStyle}
            type="button"
            disabled={Boolean(
              busy ||
              state.pending?.unknown ||
              !routeInProgress ||
              (state.error?.code === "STOP_NOT_FUTURE" &&
                state.fresh.hasUnpublishedChanges),
            )}
            onClick={rebase}
          >
            {text.rebase}
          </button>
        </div>
      ) : null}
      {editor ? (
        <>
          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            <div style={noticeStyle}>
              <strong>{text.published}</strong>
              <p style={{ overflowWrap: "anywhere" }}>
                {editor.baseline.publishedVersionId || "—"}
              </p>
              <small>{text.sideEffects}</small>
            </div>
            <div
              style={{
                ...noticeStyle,
                background: privateDirty ? "#fff8e6" : "#f6f6f7",
                borderColor: privateDirty ? "#e6d49e" : "#d6d6d6",
              }}
            >
              <strong>{text.private}</strong>
              <p>{privateDirty ? text.privateYes : text.privateNo}</p>
              <small>
                {text.revision}: {editor.baseline.revision} · {text.assignment}:{" "}
                {editor.baseline.assignmentGeneration}
                {localDirty ? ` · ${text.local}` : ""}
              </small>
            </div>
          </div>
          <div style={rowStyle}>
            <button
              style={{ ...buttonStyle, background: "#303030", color: "#fff" }}
              type="button"
              disabled={locked || state.needsReview || !localDirty}
              onClick={() => runCommand("save")}
            >
              {busy === "save" ? text.busy : text.save}
            </button>
            <button
              style={buttonStyle}
              type="button"
              disabled={
                locked ||
                state.needsReview ||
                localDirty ||
                !privateDirty ||
                locationIssues.length > 0
              }
              onClick={() => runCommand("dispatch")}
            >
              {busy === "dispatch" ? text.busy : text.dispatch}
            </button>
            <button
              style={buttonStyle}
              type="button"
              disabled={locked || !privateDirty}
              onClick={prepareDiscard}
            >
              {text.discard}
            </button>
            <button
              style={buttonStyle}
              type="button"
              disabled={locked || !localDirty}
              onClick={revertUnsaved}
            >
              {text.revert}
            </button>
          </div>
          <div>
            <h3 style={{ margin: "0 0 6px" }}>{text.future}</h3>
            <p style={{ margin: 0, color: "#616161" }}>{text.fixed}</p>
          </div>
          {editor.futureStopOrder.map((id, index) => {
            const stop = stopById.get(id);
            const values = liveStopValues(editor, id);
            const coordinatesValid = validLiveCoordinates(values);
            const issue = locationIssues.includes(id);
            return (
              <details
                key={id}
                style={{
                  border: "1px solid #d6d6d6",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <summary style={{ fontWeight: 650 }}>
                  {index + 1}. {text.stop} {stop?.sequence ?? index + 1} ·{" "}
                  {stop?.recipientName || stop?.sourceOrderId || id} ·{" "}
                  {values.address1}
                  {issue ? ` · ${text.locationPending}` : ""}
                </summary>
                <div style={{ ...rowStyle, margin: "12px 0" }}>
                  <button
                    style={buttonStyle}
                    type="button"
                    disabled={locked || index === 0}
                    onClick={() => moveStop(id, -1)}
                    aria-label={`${text.moveUp}: ${text.stop} ${stop?.sequence}`}
                  >
                    {text.moveUp}
                  </button>
                  <button
                    style={buttonStyle}
                    type="button"
                    disabled={
                      locked || index === editor.futureStopOrder.length - 1
                    }
                    onClick={() => moveStop(id, 1)}
                    aria-label={`${text.moveDown}: ${text.stop} ${stop?.sequence}`}
                  >
                    {text.moveDown}
                  </button>
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  }}
                >
                  {[...LIVE_ADDRESS_FIELDS, "latitude", "longitude"].map(
                    (field) => (
                      <label key={field} style={{ display: "grid", gap: 5 }}>
                        <span>{text[field]}</span>
                        <input
                          style={inputStyle}
                          type="text"
                          inputMode={
                            ["latitude", "longitude"].includes(field)
                              ? "decimal"
                              : "text"
                          }
                          value={values[field]}
                          disabled={locked}
                          onChange={(event) =>
                            editStop(id, field, event.currentTarget.value)
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
                <div style={{ ...rowStyle, marginTop: 12 }}>
                  <button
                    style={buttonStyle}
                    type="button"
                    disabled={
                      locked || searchState[id]?.busy || !values.address1.trim()
                    }
                    onClick={() => searchCoordinates(id)}
                  >
                    {searchState[id]?.busy ? text.searching : text.search}
                  </button>
                  {coordinatesValid ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${values.latitude},${values.longitude}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {text.map}
                    </a>
                  ) : null}
                  <button
                    style={buttonStyle}
                    type="button"
                    disabled={locked || !coordinatesValid || !issue}
                    onClick={() => confirmLocation(id)}
                  >
                    {issue ? text.confirmLocation : text.verified}
                  </button>
                </div>
                {issue ? (
                  <p style={{ color: "#855800", marginBottom: 0 }}>
                    {text.unverified}
                  </p>
                ) : null}
                {searchState[id]?.error ? (
                  <p role="alert" style={{ color: "#8e1f0b" }}>
                    {searchState[id].error}
                  </p>
                ) : null}
                {searchState[id]?.message ? (
                  <p role="status">{searchState[id].message}</p>
                ) : null}
              </details>
            );
          })}
          {state.receipt?.action === "dispatch" ? (
            <div role="status" style={noticeStyle}>
              <strong>{text.receipt}</strong>
              <p style={{ overflowWrap: "anywhere" }}>
                {state.receipt.data.publicationVersionId}
              </p>
              <p>
                {text.geometry}: {state.receipt.data.geometry?.status || "—"} ·{" "}
                {text.notification}:{" "}
                {state.receipt.data.notification?.status || "—"}
              </p>
              <small>{text.sideEffects}</small>
            </div>
          ) : null}
          {state.discardConfirm ? (
            <div role="dialog" aria-label={text.discard} style={errorStyle}>
              <p>{text.discardWarning}</p>
              <div style={rowStyle}>
                <button
                  style={buttonStyle}
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    changeState((current) => ({
                      ...current,
                      discardConfirm: false,
                    }))
                  }
                >
                  {text.cancel}
                </button>
                <button
                  style={buttonStyle}
                  type="button"
                  disabled={locked || (state.needsReview && !state.fresh)}
                  onClick={() => runCommand("discard")}
                >
                  {text.confirmDiscard}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
