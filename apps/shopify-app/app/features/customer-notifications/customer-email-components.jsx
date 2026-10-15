/* eslint-disable react/prop-types */
import { useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { withEmbeddedShopifyContext } from "../delivery/route-paths";
import {
  settingsActionRowStyle,
  settingsButtonStyle,
  settingsErrorStyle,
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

const SWITCH_ON_COLOR = "#1a7f37";
const SWITCH_OFF_COLOR = "#c5280c";

/** On/off switch. Green when on, red when off. */
export function ToggleSwitch({ checked, disabled = false, label, onChange }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      style={{
        alignItems: "center",
        background: "transparent",
        border: 0,
        color: "#303030",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        font: "inherit",
        gap: "8px",
        opacity: disabled ? 0.58 : 1,
        padding: 0,
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        style={{
          background: checked ? SWITCH_ON_COLOR : SWITCH_OFF_COLOR,
          borderRadius: "999px",
          boxSizing: "border-box",
          display: "inline-block",
          height: "22px",
          position: "relative",
          transition: "background 120ms ease",
          width: "40px",
        }}
      >
        <span
          style={{
            background: "#ffffff",
            borderRadius: "50%",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.3)",
            height: "18px",
            left: checked ? "20px" : "2px",
            position: "absolute",
            top: "2px",
            transition: "left 120ms ease",
            width: "18px",
          }}
        />
      </span>
      <span style={{ color: checked ? SWITCH_ON_COLOR : SWITCH_OFF_COLOR, fontWeight: 650 }}>
        {checked ? "On" : "Off"}
      </span>
    </button>
  );
}

export const CUSTOMER_EMAIL_AUTOMATIC_CONFIRM_TEXT =
  "Automatic emails cover eligible route stops, including stops added after Dispatch. Use the Send notifications menu for Delivery scheduled.";

/**
 * The shop-wide automatic customer email switch. The same value appears in Customer notifications
 * settings and in Route options. Turning it on asks for confirmation; turning it off is immediate.
 */
export function CustomerEmailAutomaticSwitch({ enabled }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [searchParams] = useSearchParams();
  const [confirming, setConfirming] = useState(false);
  const [clientError, setClientError] = useState(null);
  const busy = fetcher.state !== "idle";
  const pendingIntent = busy ? fetcher.formData?.get("_intent") : null;
  const shownEnabled = pendingIntent
    ? pendingIntent === "activateCustomerEmailAutomatic"
    : enabled === true;
  const errors = [...(fetcher.data?.errors ?? []), ...(clientError ? [{ message: clientError }] : [])];

  const submit = async (intent) => {
    setConfirming(false);
    setClientError(null);
    try {
      const formData = new FormData();
      formData.set("_intent", intent);
      formData.set("shopifySessionToken", await shopify.idToken());
      fetcher.submit(formData, {
        action: withEmbeddedShopifyContext("/app/settings/notifications", searchParams),
        method: "post",
      });
    } catch {
      setClientError("Could not get the Shopify session. Reload and try again.");
    }
  };

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div style={{ alignItems: "center", display: "flex", gap: "12px", justifyContent: "space-between" }}>
        <div>
          <strong>Automatic customer emails</strong>
          <p style={settingsMessageStyle}>Store-wide. Applies to every route of this store.</p>
        </div>
        <ToggleSwitch
          checked={shownEnabled}
          disabled={busy || enabled === null || enabled === undefined}
          label="Automatic customer emails"
          onChange={(next) => (next ? setConfirming(true) : submit("deactivateCustomerEmailAutomatic"))}
        />
      </div>
      {confirming ? (
        <div role="alertdialog" aria-label="Turn on automatic customer emails" style={{ border: "1px solid #e3e3e3", borderRadius: "8px", display: "grid", gap: "8px", padding: "12px" }}>
          <p style={{ ...settingsMessageStyle, color: "#303030" }}>{CUSTOMER_EMAIL_AUTOMATIC_CONFIRM_TEXT}</p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button onClick={() => setConfirming(false)} style={settingsResetButtonStyle} type="button">Cancel</button>
            <button onClick={() => submit("activateCustomerEmailAutomatic")} style={settingsButtonStyle} type="button">Turn on</button>
          </div>
        </div>
      ) : null}
      {enabled === null || enabled === undefined ? <p style={settingsErrorStyle}>The automatic email setting could not be loaded.</p> : null}
      {errors.length > 0 ? <p role="alert" style={settingsErrorStyle}>{errors[0]?.message ?? "Could not change automatic customer emails."}</p> : null}
    </div>
  );
}
