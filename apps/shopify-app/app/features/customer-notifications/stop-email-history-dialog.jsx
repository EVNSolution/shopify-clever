/* eslint-disable react/prop-types */
import { describeStopEmailHistoryEvent, groupStopEmailHistory } from "./stop-email-history";

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
const backdropStyle = { background: "transparent", border: 0, cursor: "default", inset: 0, padding: 0, position: "absolute" };
const dialogStyle = {
  background: "#ffffff",
  borderRadius: "12px",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.18)",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  maxHeight: "calc(100vh - 48px)",
  maxWidth: "calc(100vw - 32px)",
  overflow: "hidden",
  position: "relative",
  width: "520px",
};
const headerStyle = {
  alignItems: "center",
  borderBottom: "1px solid #e3e3e3",
  display: "flex",
  justifyContent: "space-between",
  padding: "14px 16px",
};
const titleStyle = { color: "#303030", fontSize: "15px", fontWeight: 750, margin: 0 };
const closeStyle = {
  background: "transparent",
  border: 0,
  borderRadius: "8px",
  color: "#616161",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "22px",
  height: "30px",
  lineHeight: 1,
  padding: 0,
  width: "30px",
};
const bodyStyle = { display: "grid", gap: "14px", overflowY: "auto", padding: "16px" };
const groupStyle = { display: "grid", gap: "4px" };
const groupTitleStyle = { color: "#303030", fontSize: "13px", fontWeight: 650 };
const eventStyle = { display: "grid", gap: "2px", gridTemplateColumns: "20px minmax(0, 1fr)" };
const detailStyle = { color: "#616161", fontSize: "12px", gridColumn: 2, overflowWrap: "anywhere" };
const errorStyle = { ...detailStyle, color: "#a21c12" };
const notSentStyle = { color: "#8a8a8a", fontSize: "12px" };
const footerStyle = { borderTop: "1px solid #e3e3e3", display: "flex", justifyContent: "flex-end", padding: "12px 16px" };
const buttonStyle = {
  background: "#ffffff",
  border: "1px solid #c9c9c9",
  borderRadius: "8px",
  color: "#303030",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 650,
  padding: "6px 14px",
};
const STATUS_MARKS = {
  FAILED: { color: "#a21c12", mark: "✕" },
  PENDING: { color: "#7a4b00", mark: "…" },
  SENT: { color: "#0c7a43", mark: "✓" },
  SKIPPED: { color: "#8a8a8a", mark: "–" },
};

/** Which customer emails one stop got and when, opened from the stop's actions menu. */
export function StopEmailHistoryDialog({ errors, history, loading, onClose, onRetry, orderLabel }) {
  const failed = !loading && Array.isArray(errors) && errors.length > 0;
  return (
    <div style={overlayStyle}>
      <button aria-label="Close notification history" onClick={onClose} style={backdropStyle} type="button" />
      <div aria-label="Notification history" aria-modal="true" role="dialog" style={dialogStyle}>
        <header style={headerStyle}>
          <h2 style={titleStyle}>{orderLabel ? `Notification history — Order ${orderLabel}` : "Notification history"}</h2>
          <button aria-label="Close notification history" onClick={onClose} style={closeStyle} type="button">×</button>
        </header>
        <div style={bodyStyle}>
          {loading ? <p style={notSentStyle}>Loading…</p> : null}
          {failed ? (
            <div style={groupStyle}>
              <p style={errorStyle}>Could not load the notification history.</p>
              <div><button onClick={onRetry} style={buttonStyle} type="button">Retry</button></div>
            </div>
          ) : null}
          {!loading && !failed ? groupStopEmailHistory(history?.events).map((group) => (
            <section aria-label={group.label} key={group.signal} style={groupStyle}>
              <div style={groupTitleStyle}>{group.label}</div>
              {group.events.length === 0 ? <div style={notSentStyle}>Not sent</div> : group.events.map((event, index) => {
                const described = describeStopEmailHistoryEvent(event, history?.timezone);
                const mark = STATUS_MARKS[event.status] ?? STATUS_MARKS.SKIPPED;
                return (
                  <div key={`${event.at}-${index}`} style={eventStyle}>
                    <span aria-hidden="true" style={{ color: mark.color, fontWeight: 700 }}>{mark.mark}</span>
                    <span style={{ color: "#303030", fontSize: "12px", fontWeight: 650 }}>{described.status}</span>
                    <span style={detailStyle}>{described.detail}</span>
                    {described.error ? <span style={errorStyle}>{described.error}</span> : null}
                  </div>
                );
              })}
            </section>
          )) : null}
        </div>
        <footer style={footerStyle}>
          <button onClick={onClose} style={buttonStyle} type="button">OK</button>
        </footer>
      </div>
    </div>
  );
}
