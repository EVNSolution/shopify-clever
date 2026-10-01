const ROUTE_GROUP_COPY_MODES = new Set(["REFERENCE", "VIRTUAL"]);

export function createRouteGroupCopyDialogState() {
  return {
    error: null,
    isOpen: false,
    isSubmitting: false,
    mode: null,
    requestId: null,
  };
}

export function openRouteGroupCopyDialog() {
  return {
    ...createRouteGroupCopyDialogState(),
    isOpen: true,
  };
}

export function selectRouteGroupCopyMode(state, mode) {
  if (state?.isSubmitting || !ROUTE_GROUP_COPY_MODES.has(mode)) return state;
  return { ...state, error: null, mode, requestId: mode === state.mode ? state.requestId : null };
}

export function beginRouteGroupCopySubmit(state, requestId) {
  if (!state?.isOpen || state.isSubmitting || !ROUTE_GROUP_COPY_MODES.has(state.mode)) {
    return { accepted: false, state };
  }
  return {
    accepted: true,
    state: { ...state, error: null, isSubmitting: true, requestId: state.requestId ?? requestId ?? globalThis.crypto.randomUUID() },
  };
}

export function failRouteGroupCopySubmit(state, error) {
  return {
    ...state,
    error: error || "Route group을 복사하지 못했습니다.",
    isOpen: true,
    isSubmitting: false,
  };
}

export function succeedRouteGroupCopySubmit() {
  return createRouteGroupCopyDialogState();
}

export function cancelRouteGroupCopyDialog(state) {
  return state?.isSubmitting ? state : createRouteGroupCopyDialogState();
}
