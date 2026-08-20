const ROUTE_GROUP_COPY_MODES = new Set(["REFERENCE", "VIRTUAL"]);

export function createRouteGroupCopyDialogState() {
  return {
    error: null,
    isOpen: false,
    isSubmitting: false,
    mode: null,
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
  return { ...state, error: null, mode };
}

export function beginRouteGroupCopySubmit(state) {
  if (!state?.isOpen || state.isSubmitting || !ROUTE_GROUP_COPY_MODES.has(state.mode)) {
    return { accepted: false, state };
  }
  return {
    accepted: true,
    state: { ...state, error: null, isSubmitting: true },
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
