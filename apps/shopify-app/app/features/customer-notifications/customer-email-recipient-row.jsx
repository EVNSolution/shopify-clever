/* eslint-disable react/prop-types */
const rowStyle = {
  alignItems: "start",
  background: "#ffffff",
  border: 0,
  borderBottom: "1px solid #eeeeee",
  color: "#303030",
  display: "grid",
  fontFamily: "inherit",
  fontSize: "12px",
  gap: "8px",
  gridTemplateColumns: "24px minmax(0, 1fr)",
  minHeight: "52px",
  padding: "8px",
  textAlign: "left",
};
const rowActiveStyle = { background: "#f5f8ff", boxShadow: "inset 3px 0 0 #0b84d8" };
const rowDisabledStyle = { color: "#8a8a8a" };
const mainStyle = { display: "grid", gap: "2px", minWidth: 0 };
const nameStyle = { color: "#303030", fontSize: "13px", fontWeight: 650 };
const metaStyle = { color: "#616161", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const pillRowStyle = { display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "2px" };
const pillStyle = { borderRadius: "999px", fontSize: "11px", fontWeight: 650, lineHeight: 1.5, padding: "1px 8px", whiteSpace: "nowrap" };
const amberPillStyle = { ...pillStyle, background: "#fff4d6", color: "#7a4b00" };
const redPillStyle = { ...pillStyle, background: "#fde8e7", color: "#a21c12" };

/**
 * One recipient in the Send Notification list. Warnings are short chips on a single row instead of
 * stacked red lines; the send history line shows only when the recipient was already mailed.
 */
export function CustomerEmailRecipientRow({
  active,
  diagnosticsLabel,
  historyLabel,
  onActivate,
  onToggle,
  orderLabel,
  priorSend,
  recipientLabel,
  selectable,
  selected,
  uncertainOutcome,
}) {
  const showChips = Boolean(diagnosticsLabel) || priorSend || uncertainOutcome || !selectable;
  return (
    <label
      onFocus={onActivate}
      onMouseEnter={onActivate}
      style={{ ...rowStyle, ...(active ? rowActiveStyle : null), ...(!selectable ? rowDisabledStyle : null) }}
    >
      <input checked={selected} disabled={!selectable} onChange={(event) => onToggle(event.target.checked)} type="checkbox" />
      <span style={mainStyle}>
        <strong style={nameStyle}>{orderLabel}</strong>
        <span style={metaStyle}>{recipientLabel}</span>
        {showChips ? (
          <span style={pillRowStyle}>
            {diagnosticsLabel ? <span style={amberPillStyle}>{diagnosticsLabel.replace("Missing: ", "Missing ")}</span> : null}
            {uncertainOutcome ? (
              <span style={redPillStyle}>Pending or unknown delivery outcome; cannot resend</span>
            ) : priorSend ? (
              <span style={amberPillStyle}>Already sent · resend needs confirmation</span>
            ) : null}
            {!selectable && !uncertainOutcome ? <span style={redPillStyle}>Cannot select this recipient</span> : null}
          </span>
        ) : null}
        {priorSend ? <span style={metaStyle}>{historyLabel}</span> : null}
      </span>
    </label>
  );
}
