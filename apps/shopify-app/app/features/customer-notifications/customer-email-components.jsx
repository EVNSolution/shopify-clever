/* eslint-disable react/prop-types */
import {
  settingsActionRowStyle,
  settingsCoordinateGridStyle,
  settingsDisabledButtonStyle,
  settingsInputStyle,
  settingsLabelStyle,
  settingsMessageStyle,
  settingsResetButtonStyle,
  settingsSaveStatusStyle,
  settingsSectionCardStyle,
} from "../settings/settings-layout";

export function CustomerEmailSenderSettings({ replyTo, senderName, onReplyToChange, onSenderNameChange }) {
  return (
    <section aria-label="Notification sender" style={settingsSectionCardStyle}>
      <strong>Customer-facing identity</strong>
      <p style={settingsMessageStyle}>The sending address and delivery provider are managed by CLEVER. Saving here changes the customer-facing name, reply-to address, and branding only.</p>
      <div style={settingsCoordinateGridStyle}>
        <label style={settingsLabelStyle}>Sender name<input onChange={(event) => onSenderNameChange(event.target.value)} style={settingsInputStyle} value={senderName} /></label>
      </div>
      <label style={settingsLabelStyle}>Reply-to email<input onChange={(event) => onReplyToChange(event.target.value)} style={settingsInputStyle} type="email" value={replyTo} /></label>
    </section>
  );
}

export function CustomerEmailTestSendPanel({
  attemptId,
  busy,
  confirmed,
  errors = [],
  onConfirmedChange,
  onRecipientChange,
  onSend,
  recipient,
  testBusy,
  unsupported,
}) {
  const disabled = busy || !confirmed || !recipient || unsupported;

  return (
    <div aria-label="Send email preview test" style={notificationTestPanelStyle}>
      <div>
        <strong>Send this preview</strong>
        <p style={settingsMessageStyle}>Sends one test using the current draft and example data.</p>
      </div>
      <label style={settingsLabelStyle}>
        Recipient email
        <input aria-label="Test recipient email" onChange={(event) => onRecipientChange(event.target.value)} placeholder="name@example.com" style={settingsInputStyle} type="email" value={recipient} />
      </label>
      <label style={notificationTestConfirmStyle}>
        <input checked={confirmed} onChange={(event) => onConfirmedChange(event.target.checked)} type="checkbox" />
        Confirm one test email to this address
      </label>
      <div style={settingsActionRowStyle}>
        <span>{!busy && errors.length === 0 && attemptId ? <span style={settingsSaveStatusStyle}>Test accepted · {attemptId.slice(0, 8)}</span> : null}</span>
        <button disabled={disabled} onClick={onSend} style={disabled ? settingsDisabledButtonStyle : settingsResetButtonStyle} type="button">{testBusy ? "Sending..." : "Send test"}</button>
      </div>
    </div>
  );
}

export function CustomerEmailSendResultPanel({ busy, canRetry, failedRecipientCount, onRetry, summary }) {
  if (!summary) return null;

  return (
    <div aria-label="Customer email send result" role="status" style={sendResultPanelStyle}>
      <span style={{ color: "#008060" }}>{summary.counts.accepted} provider accepted</span>
      <span>{summary.counts.failed} failed · {summary.counts.skipped} skipped · {summary.counts.duplicate} duplicate · {summary.counts.unknown} outcome unknown</span>
      {summary.counts.accepted > 0 ? <span style={warningTextStyle}>Provider acceptance is not final delivery confirmation.</span> : null}
      {summary.duplicateRequest ? <span style={warningTextStyle}>This request was already processed. No new send was started.</span> : null}
      {!summary.originalOutcomeAvailable ? <span style={warningTextStyle}>The original delivery outcome is unavailable in this response.</span> : null}
      {summary.details.map((detail) => <span key={`${detail.label}-${detail.reason}`} style={warningTextStyle}>{detail.label}: {detail.reason}</span>)}
      <span style={historyHintStyle}>Click Preview recipients again to refresh provider delivery or bounce status from send history.</span>
      {failedRecipientCount > 0 ? (
        <>
          <span style={warningTextStyle}>{failedRecipientCount} failed recipient(s) can be retried with a new command.</span>
          <button disabled={!canRetry || busy} onClick={onRetry} style={actionButtonStyle} type="button">Retry failed only</button>
        </>
      ) : null}
    </div>
  );
}

const notificationTestPanelStyle = {
  background: "#ffffff",
  border: "1px solid #e3e3e3",
  borderRadius: "8px",
  display: "grid",
  gap: "10px",
  padding: "12px",
};

const notificationTestConfirmStyle = {
  alignItems: "start",
  display: "flex",
  fontSize: "12px",
  gap: "7px",
  lineHeight: "18px",
};

const sendResultPanelStyle = {
  background: "#f7f7f7",
  border: "1px solid #e3e3e3",
  borderRadius: "8px",
  color: "#616161",
  display: "grid",
  fontSize: "12px",
  gap: "4px",
  lineHeight: 1.35,
  padding: "8px",
};

const warningTextStyle = {
  color: "#b42318",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.35,
};

const historyHintStyle = {
  color: "#4b5563",
  fontSize: "12px",
  lineHeight: 1.35,
};

const actionButtonStyle = {
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
