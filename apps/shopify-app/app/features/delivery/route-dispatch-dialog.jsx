/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { OfficeDialog } from "./route-office-components";
import {
  DISPATCH_EMAIL_TEMPLATES,
  getDispatchDialogSteps,
  getDispatchEmailResultNotices,
  getDispatchEmailRows,
  getInitialDispatchEmailSelection,
} from "./route-dispatch";

const buttonStyle = {
  background: "#fff",
  border: "1px solid #c9c9c9",
  borderRadius: 8,
  color: "#303030",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 650,
  minHeight: 36,
  padding: "7px 13px",
};
const primaryButtonStyle = { ...buttonStyle, background: "#303030", borderColor: "#303030", color: "#fff" };
const disabledStyle = { cursor: "not-allowed", opacity: 0.55 };
const noteStyle = { color: "#616161", fontSize: 13, margin: 0 };
const panelStyle = { border: "1px solid #e3e3e3", borderRadius: 8, minWidth: 0 };
const rowStyle = {
  alignItems: "center",
  borderTop: "1px solid #e3e3e3",
  display: "grid",
  fontSize: 13,
  gap: 8,
  gridTemplateColumns: "auto 32px minmax(0, 1fr)",
  padding: "8px 10px",
};

/**
 * Dispatch popup. Step 1 confirms the driver. Step 2 (only when the shop automatic switch is on)
 * chooses which customers get which customer emails, then Dispatch saves that selection first.
 * `onDispatch(selection)` gets null when there is no email step.
 */
export function RouteDispatchDialog({
  automaticEnabled,
  busy,
  driverName,
  enabledSignals = [],
  onClose,
  onDispatch,
  result,
  routePlanId,
  stops,
}) {
  const steps = getDispatchDialogSteps(automaticEnabled);
  const rows = useMemo(() => getDispatchEmailRows(stops), [stops]);
  const [step, setStep] = useState("confirm");
  const [selection, setSelection] = useState(() => getInitialDispatchEmailSelection(rows, enabledSignals));
  const [submittedSelection, setSubmittedSelection] = useState(null);

  if (step === "result") {
    const notices = result ? getDispatchEmailResultNotices(result, routePlanId, submittedSelection) : [];
    return (
      <OfficeDialog title="Dispatch result" onClose={onClose}>
        {result ? (
          <ul style={{ display: "grid", gap: 6, margin: 0, paddingLeft: 18 }}>
            {notices.map((notice) => (
              <li key={notice.message} role={notice.isError ? "alert" : "status"} style={{ color: notice.isError ? "#a32216" : "#303030", fontSize: 14 }}>
                {notice.message}
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" style={noteStyle}>Saving the email selection and dispatching…</p>
        )}
      </OfficeDialog>
    );
  }

  if (step === "confirm") {
    const hasEmailStep = steps.includes("email");
    return (
      <OfficeDialog
        title={`Dispatch this route to ${driverName}?`}
        onClose={onClose}
        actions={(
          <>
            <button type="button" style={buttonStyle} onClick={onClose}>Cancel</button>
            <button
              type="button"
              style={{ ...primaryButtonStyle, ...(busy ? disabledStyle : null) }}
              disabled={busy}
              onClick={() => (hasEmailStep ? setStep("email") : onDispatch(null))}
            >
              {hasEmailStep ? "Next" : "Dispatch"}
            </button>
          </>
        )}
      >
        <p style={noteStyle}>The driver gets the route in the driver app. This does not start the route.</p>
        {automaticEnabled === null || automaticEnabled === undefined ? (
          <p role="status" style={noteStyle}>Customer email settings could not be loaded. No customer email is selected or sent.</p>
        ) : null}
      </OfficeDialog>
    );
  }

  const selectedStops = new Set(selection.deliveryStopIds);
  const eligibleRows = rows.filter((row) => row.eligible);
  const allSelected = eligibleRows.length > 0 && eligibleRows.every((row) => selectedStops.has(row.deliveryStopId));
  const toggleSignal = (signal, on) => setSelection((current) => ({
    ...current,
    signals: DISPATCH_EMAIL_TEMPLATES.map((template) => template.signal)
      .filter((candidate) => (candidate === signal ? on : current.signals.includes(candidate))),
  }));
  const toggleStop = (deliveryStopId, on) => setSelection((current) => ({
    ...current,
    deliveryStopIds: on
      ? [...new Set([...current.deliveryStopIds, deliveryStopId])]
      : current.deliveryStopIds.filter((id) => id !== deliveryStopId),
  }));
  const dispatch = () => {
    setSubmittedSelection(selection);
    setStep("result");
    onDispatch(selection);
  };

  return (
    <OfficeDialog
      title="Customer emails for this route"
      onClose={onClose}
      width={960}
      actions={(
        <>
          <button type="button" style={{ ...buttonStyle, marginRight: "auto" }} onClick={() => setStep("confirm")}>Back</button>
          <button type="button" style={buttonStyle} onClick={onClose}>Cancel</button>
          <button
            type="button"
            style={{ ...primaryButtonStyle, ...(busy ? disabledStyle : null) }}
            disabled={busy}
            onClick={dispatch}
          >
            Dispatch and save email selection
          </button>
        </>
      )}
    >
      <fieldset style={{ ...panelStyle, display: "grid", gap: 6, margin: 0, padding: "10px 12px" }}>
        <legend style={{ fontSize: 14, fontWeight: 650 }}>Templates</legend>
        {DISPATCH_EMAIL_TEMPLATES.map((template) => {
          const templateEnabled = enabledSignals.includes(template.signal);
          return (
            <label key={template.signal} style={{ alignItems: "center", display: "flex", fontSize: 13, gap: 8, opacity: templateEnabled ? 1 : 0.55 }}>
              <input
                type="checkbox"
                checked={selection.signals.includes(template.signal)}
                disabled={!templateEnabled}
                onChange={(event) => toggleSignal(template.signal, event.target.checked)}
              />
              <strong>{template.label}</strong>
              <span style={{ color: "#616161" }}>{templateEnabled ? template.timing : "Template is turned off in Customer notifications"}</span>
            </label>
          );
        })}
      </fieldset>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))" }}>
        <DispatchEmailRecipients
          allSelected={allSelected}
          onSelectAll={(on) => setSelection((current) => ({ ...current, deliveryStopIds: on ? eligibleRows.map((row) => row.deliveryStopId) : [] }))}
          onToggle={toggleStop}
          rows={rows}
          selectedStops={selectedStops}
        />
        <DispatchEmailPreview rows={rows} selection={selection} />
      </div>
      <p style={noteStyle}>
        {selection.deliveryStopIds.length} of {eligibleRows.length} customers selected.
        {selection.signals.includes("DELIVERY_SCHEDULED") && selection.deliveryStopIds.length > 0
          ? " Delivery scheduled is sent to them right after Dispatch."
          : " Nothing is sent at Dispatch."}
      </p>
    </OfficeDialog>
  );
}

function DispatchEmailRecipients({ allSelected, onSelectAll, onToggle, rows, selectedStops }) {
  return (
    <div style={{ ...panelStyle, maxHeight: 360, overflowY: "auto" }}>
      <label style={{ ...rowStyle, borderTop: 0, fontWeight: 650 }}>
        <input type="checkbox" checked={allSelected} onChange={(event) => onSelectAll(event.target.checked)} aria-label="Select all customers" />
        <span>#</span>
        <span>Select all</span>
      </label>
      {rows.length === 0 ? <p style={{ ...noteStyle, padding: "8px 10px" }}>This route has no order stops.</p> : null}
      {rows.map((row) => (
        <label key={row.deliveryStopId} style={{ ...rowStyle, ...(row.eligible ? null : { color: "#8a8a8a" }) }}>
          <input
            type="checkbox"
            checked={row.eligible && selectedStops.has(row.deliveryStopId)}
            disabled={!row.eligible}
            onChange={(event) => onToggle(row.deliveryStopId, event.target.checked)}
          />
          <span>{row.stop ?? "—"}</span>
          <span style={{ display: "grid", minWidth: 0 }}>
            <span>{row.customerName}{row.order ? ` · ${row.order}` : ""}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.eligible ? row.email : `No valid email${row.email ? ` (${row.email})` : ""}`}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

// Preview of one selected template for the first selected stop, from the existing route preview endpoint.
function DispatchEmailPreview({ rows, selection }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [previewSignal, setPreviewSignal] = useState(null);
  const signal = selection.signals.includes(previewSignal) ? previewSignal : selection.signals[0] ?? null;
  const deliveryStopId = rows.find((row) => row.eligible && selection.deliveryStopIds.includes(row.deliveryStopId))?.deliveryStopId ?? null;
  const fetcherSubmit = fetcher.submit;

  useEffect(() => {
    if (!signal || !deliveryStopId) return undefined;
    let cancelled = false;
    shopify.idToken().then((token) => {
      if (cancelled) return;
      const formData = new FormData();
      formData.set("_intent", "previewCustomerEmail");
      formData.set("shopifySessionToken", token);
      formData.set("signal", signal);
      formData.set("deliveryStopIds", JSON.stringify([deliveryStopId]));
      fetcherSubmit(formData, { method: "post" });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [deliveryStopId, fetcherSubmit, shopify, signal]);

  const preview = fetcher.data?.preview ?? null;
  const recipient = (preview?.recipients ?? []).find((candidate) => candidate?.deliveryStopId === deliveryStopId) ?? null;
  const rendered = recipient?.rendered ?? preview?.example?.rendered ?? null;
  const loading = fetcher.state !== "idle";
  const errorMessage = fetcher.data?.errors?.[0]?.message;

  return (
    <div style={{ ...panelStyle, display: "grid", gap: 8, padding: 10 }}>
      <label style={{ alignItems: "center", display: "flex", fontSize: 13, gap: 8 }}>
        <strong>Preview</strong>
        <select value={signal ?? ""} onChange={(event) => setPreviewSignal(event.target.value)} disabled={selection.signals.length === 0}>
          {selection.signals.length === 0 ? <option value="">No template selected</option> : null}
          {DISPATCH_EMAIL_TEMPLATES.filter((template) => selection.signals.includes(template.signal)).map((template) => (
            <option key={template.signal} value={template.signal}>{template.label}</option>
          ))}
        </select>
      </label>
      {!signal || !deliveryStopId ? (
        <p style={noteStyle}>Select a template and a customer to see the email.</p>
      ) : loading ? (
        <p role="status" style={noteStyle}>Loading preview…</p>
      ) : errorMessage ? (
        <p role="alert" style={{ ...noteStyle, color: "#a32216" }}>{errorMessage}</p>
      ) : rendered ? (
        <>
          {!recipient ? <p style={noteStyle}>Example with sample values. This stop does not match this template yet.</p> : null}
          <strong style={{ fontSize: 14 }}>{rendered.subject || "No subject"}</strong>
          <pre style={{ border: "1px solid #e3e3e3", borderRadius: 6, fontSize: 12, lineHeight: 1.45, margin: 0, maxHeight: 280, overflowY: "auto", padding: 8, whiteSpace: "pre-wrap" }}>
            {rendered.body || "No body"}
          </pre>
        </>
      ) : (
        <p style={noteStyle}>No preview is available for this customer.</p>
      )}
    </div>
  );
}
