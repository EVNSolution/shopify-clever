/* eslint-disable react/prop-types */
import { useEffect, useRef } from "react";
import { LIVE_ADDRESS_FIELDS, validLiveCoordinates } from "./live-route-change";

// Compact dialog look shared with the other Route Detail dialogs.
const overlayStyle = {
  alignItems: "center",
  background: "rgba(0, 0, 0, 0.18)",
  boxSizing: "border-box",
  display: "grid",
  inset: 0,
  justifyItems: "center",
  padding: "24px",
  position: "fixed",
  zIndex: 2147483647,
};
const backdropStyle = {
  background: "transparent",
  border: 0,
  cursor: "default",
  inset: 0,
  padding: 0,
  position: "absolute",
};
const dialogStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "12px",
  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.24)",
  boxSizing: "border-box",
  display: "grid",
  gap: "12px",
  gridAutoRows: "max-content",
  maxHeight: "calc(100dvh - 48px)",
  maxWidth: "calc(100vw - 48px)",
  outline: "none",
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "16px",
  position: "relative",
  width: "440px",
  zIndex: 1,
};
const titleStyle = { color: "#303030", fontSize: "15px", fontWeight: 750, margin: 0 };
const fieldStyle = { display: "grid", gap: "4px" };
const labelStyle = { color: "#616161", fontSize: "12px", fontWeight: 650 };
const inputStyle = {
  border: "1px solid #d0d0d0",
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#303030",
  fontFamily: "inherit",
  fontSize: "13px",
  lineHeight: 1.2,
  minHeight: "32px",
  padding: "4px 8px",
  width: "100%",
};
const buttonStyle = {
  background: "#ffffff",
  borderColor: "#c9c9c9",
  borderRadius: "8px",
  borderStyle: "solid",
  borderWidth: "1px",
  color: "#303030",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 650,
  minHeight: "26px",
  padding: "3px 10px",
  whiteSpace: "nowrap",
};
const primaryButtonStyle = { ...buttonStyle, background: "#303030", borderColor: "#303030", color: "#ffffff" };
const disabledStyle = { cursor: "not-allowed", opacity: 0.55 };
const rowStyle = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: "6px" };
const actionsStyle = { ...rowStyle, justifyContent: "flex-end" };
const noteStyle = {
  background: "#f7f7f7",
  border: "1px solid #e3e3e3",
  borderRadius: "8px",
  color: "#616161",
  fontSize: "12px",
  lineHeight: 1.35,
  margin: 0,
  padding: "8px",
};
const bannerStyle = {
  alignItems: "center",
  background: "#eef7ff",
  border: "1px solid #b5d9f7",
  borderRadius: "10px",
  color: "#17466f",
  display: "flex",
  flexWrap: "wrap",
  fontSize: "13px",
  gap: "8px",
  lineHeight: 1.4,
  padding: "10px 12px",
};
const errorBannerStyle = {
  ...bannerStyle,
  background: "#fff4f4",
  borderColor: "#ffd6d6",
  color: "#8e1f0b",
};
const codeStyle = { fontSize: "11px", opacity: 0.7 };
// The unknown-outcome banner below already says this; do not show the transport error twice.
const OUTCOME_UNKNOWN_CODES = ["OUTCOME_UNKNOWN", "LIVE_CHANGE_OUTCOME_UNKNOWN", "UPSTREAM_RESPONSE_UNAVAILABLE"];
const withDisabled = (style, disabled) => (disabled ? { ...style, ...disabledStyle } : style);
const addressText = (source) =>
  LIVE_ADDRESS_FIELDS.map((field) => source?.[field])
    .filter(Boolean)
    .join(", ");

/** Modal frame: Escape closes, focus stays inside, and focus returns to the opener on close. */
function DialogFrame({ label, onClose, children }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog?.focus({ preventScroll: true });
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    // Another dialog on top keeps its own focus; two frames must not pull focus back and forth.
    const keepFocusInside = (event) => {
      if (!dialog?.contains(event.target) && !event.target?.closest?.('[role="dialog"]'))
        dialog?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("focusin", keepFocusInside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("focusin", keepFocusInside);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div style={overlayStyle}>
      <button aria-label={`Close ${label}`} onClick={onClose} style={backdropStyle} type="button" />
      <div ref={dialogRef} aria-label={label} aria-modal="true" role="dialog" tabIndex={-1} style={dialogStyle}>
        {children}
      </div>
    </div>
  );
}

/** Address and coordinates of one future stop. Edits stay unsaved until the page's Save. */
export function LiveStopEditDialog({ live, stop, onClose }) {
  const { text } = live;
  const id = stop.deliveryStopId;
  const values = live.valuesFor(id);
  const coordinatesValid = validLiveCoordinates(values);
  const issue = live.locationIssues.includes(id);
  const search = live.searchState[id];
  return (
    <DialogFrame label={text.editTitle} onClose={onClose}>
      <h2 style={titleStyle}>{text.editTitle}</h2>
      <div style={noteStyle}>
        <strong>{stop.order}</strong> · {stop.recipient}
        <br />
        {text.editNote}
      </div>
      <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {[...LIVE_ADDRESS_FIELDS, "latitude", "longitude"].map((field) => (
          <div key={field} style={{ ...fieldStyle, ...(field === "address1" ? { gridColumn: "1 / -1" } : null) }}>
            <label htmlFor={`live-stop-${field}`} style={labelStyle}>{text[field]}</label>
            <input
              disabled={live.locked}
              id={`live-stop-${field}`}
              inputMode={["latitude", "longitude"].includes(field) ? "decimal" : "text"}
              onChange={(event) => live.editStop(id, field, event.currentTarget.value)}
              style={inputStyle}
              type="text"
              value={values[field]}
            />
          </div>
        ))}
      </div>
      <div style={rowStyle}>
        <button
          disabled={live.locked || search?.busy || !values.address1.trim()}
          onClick={() => live.searchCoordinates(id)}
          style={withDisabled(buttonStyle, live.locked || search?.busy || !values.address1.trim())}
          type="button"
        >
          {search?.busy ? text.searching : text.search}
        </button>
        {coordinatesValid ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${values.latitude},${values.longitude}`)}`}
            rel="noreferrer"
            style={{ color: "#005bd3", fontSize: "13px", fontWeight: 650 }}
            target="_blank"
          >
            {text.map}
          </a>
        ) : null}
        <button
          disabled={live.locked || !coordinatesValid || !issue}
          onClick={() => live.confirmLocation(id)}
          style={withDisabled(buttonStyle, live.locked || !coordinatesValid || !issue)}
          type="button"
        >
          {issue ? text.confirmLocation : text.verified}
        </button>
      </div>
      {issue ? <p style={{ ...noteStyle, color: "#855800" }}>{text.unverified}</p> : null}
      {search?.error ? <p role="alert" style={{ ...noteStyle, color: "#8e1f0b" }}>{search.error}</p> : null}
      {search?.message ? <p role="status" style={noteStyle}>{search.message}</p> : null}
      <div style={actionsStyle}>
        <button onClick={onClose} style={primaryButtonStyle} type="button">{text.done}</button>
      </div>
    </DialogFrame>
  );
}

/** The latest saved state beside the office input. Nothing changes until the office confirms. */
export function LiveReviewDialog({ live, onClose }) {
  const { text, state } = live;
  const { fresh, editor } = state;
  if (!fresh) return null;
  const latestById = new Map(fresh.draft.stops.map((stop) => [stop.deliveryStopId, stop]));
  const blocked = Boolean(
    live.busy ||
      state.pending?.unknown ||
      !live.routeInProgress ||
      (state.error?.code === "STOP_NOT_FUTURE" && fresh.hasUnpublishedChanges),
  );
  return (
    <DialogFrame label={text.reviewAction} onClose={onClose}>
      <h2 style={titleStyle}>{text.reviewAction}</h2>
      <p style={noteStyle}>{text.review}</p>
      <div style={{ ...noteStyle, display: "grid", gap: "6px" }}>
        <span>{fresh.hasUnpublishedChanges ? text.privateYes : text.privateNo}</span>
        <span>
          {text.latestOrder}:{" "}
          {fresh.draft.stops
            .filter((stop) => fresh.editableFutureStopIds.includes(stop.deliveryStopId))
            .map((stop) => `${stop.sequence}. ${stop.recipientName || stop.deliveryStopId}`)
            .join(" → ")}
        </span>
        {Object.entries(editor?.edits ?? {}).map(([id, local]) => (
          <span key={id}>
            <strong>
              {text.stop} {latestById.get(id)?.sequence ?? id}
            </strong>
            <br />
            {text.latestAddress}: {addressText(latestById.get(id))}
            <br />
            {text.localAddress}: {addressText(local)}
          </span>
        ))}
      </div>
      <div style={actionsStyle}>
        <button onClick={onClose} style={buttonStyle} type="button">{text.cancel}</button>
        <button
          disabled={blocked}
          onClick={live.rebase}
          style={withDisabled(primaryButtonStyle, blocked)}
          type="button"
        >
          {text.rebase}
        </button>
      </div>
    </DialogFrame>
  );
}

export function LiveDiscardDialog({ live }) {
  const { text, state } = live;
  if (!state.discardConfirm) return null;
  const blocked = live.locked || (state.needsReview && !state.fresh);
  return (
    <DialogFrame label="Discard saved changes" onClose={live.cancelDiscard}>
      <h2 style={titleStyle}>Discard</h2>
      <p style={{ ...noteStyle, color: "#8e1f0b" }}>{text.discardWarning}</p>
      <div style={actionsStyle}>
        <button disabled={live.locked} onClick={live.cancelDiscard} style={withDisabled(buttonStyle, live.locked)} type="button">
          {text.cancel}
        </button>
        <button disabled={blocked} onClick={live.confirmDiscard} style={withDisabled(primaryButtonStyle, blocked)} type="button">
          {text.confirmDiscard}
        </button>
      </div>
    </DialogFrame>
  );
}

/** Problems and retries that need the office's attention. Normal progress uses the page's toast. */
export function LiveChangeNotices({ live, onReview }) {
  if (!live.enabled || !live.ready) return null;
  const { text, state } = live;
  const preserved = live.localDirty || live.privateDirty;
  const showReview = state.needsReview && live.routeInProgress;
  const reviewButton = showReview ? (
    <button disabled={Boolean(live.busy)} onClick={onReview} style={withDisabled(buttonStyle, Boolean(live.busy))} type="button">
      {text.reviewAction}
    </button>
  ) : null;
  return (
    <>
      {!live.routeInProgress && preserved ? (
        <div role="alert" style={errorBannerStyle}>{text.stopped}</div>
      ) : null}
      {state.error && !(state.pending?.unknown && OUTCOME_UNKNOWN_CODES.includes(live.errorCode)) ? (
        <div role="alert" style={errorBannerStyle}>
          <span>{live.errorMessage}</span>
          <span style={codeStyle}>{live.errorCode}</span>
          {reviewButton}
        </div>
      ) : showReview ? (
        <div role="status" style={bannerStyle}>
          <span>{text.review}</span>
          {reviewButton}
        </div>
      ) : null}
      {state.pending?.unknown ? (
        <div role="alert" style={errorBannerStyle}>
          <span>{text.unknown}</span>
          <button disabled={Boolean(live.busy)} onClick={live.retryPending} style={withDisabled(buttonStyle, Boolean(live.busy))} type="button">
            {text.retry}
          </button>
        </div>
      ) : null}
      {state.pending && !state.pending.unknown ? (
        <div role="status" style={bannerStyle}>
          <span>{text.retryNotice}</span>
          <button disabled={Boolean(live.busy)} onClick={live.retryDelivery} style={withDisabled(buttonStyle, Boolean(live.busy))} type="button">
            {text.retryDelivery}
          </button>
        </div>
      ) : null}
    </>
  );
}
