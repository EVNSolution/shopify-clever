/* eslint-disable react/prop-types */
import { useEffect, useRef } from "react";
import { LocationPreviewMap } from "../settings/settings-departure-map";
import {
  buildCustomStopAddress,
  isCustomStopAddressCheckReady,
  isStopTargetRouteValid,
  shouldShowStopTargetRoutePicker,
} from "./custom-stop-form";

const dialogStyle = {
  background: "#fff",
  border: "1px solid #e3e3e3",
  borderRadius: "12px",
  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.24)",
  boxSizing: "border-box",
  display: "grid",
  gap: "16px",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  maxHeight: "calc(100dvh - 48px)",
  maxWidth: "calc(100vw - 32px)",
  overflow: "hidden",
  padding: "20px",
  position: "relative",
  width: "720px",
  zIndex: 1,
};

const bodyStyle = {
  display: "grid",
  gap: "16px",
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  // Room for the focus ring of the first and last controls inside the scroll area.
  padding: "2px",
};

// Six columns so every row ends flush: 3+3, 6, 6, 2+2+2, 3+3.
const fieldGridStyle = {
  alignItems: "start",
  display: "grid",
  gap: "14px 12px",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
};

const fieldStyle = { display: "grid", gap: "6px", minWidth: 0 };
const labelStyle = { color: "#303030", fontSize: "13px", fontWeight: 650, lineHeight: "18px" };
const hintStyle = { color: "#616161", fontSize: "12px", lineHeight: "16px", margin: 0 };
const inputStyle = {
  background: "#fff",
  border: "1px solid #8a8a8a",
  borderRadius: "8px",
  boxSizing: "border-box",
  font: "inherit",
  fontSize: "14px",
  minHeight: "38px",
  padding: "8px 10px",
  width: "100%",
};
const errorStyle = { color: "#8e1f0b", fontSize: "12px", lineHeight: "16px", margin: 0 };
const actionsStyle = { display: "flex", gap: "8px", justifyContent: "flex-end" };
const buttonStyle = {
  background: "#fff",
  border: "1px solid #8a8a8a",
  borderRadius: "8px",
  cursor: "pointer",
  font: "inherit",
  fontSize: "14px",
  fontWeight: 650,
  minHeight: "36px",
  padding: "7px 14px",
  whiteSpace: "nowrap",
};
const primaryButtonStyle = { ...buttonStyle, background: "#303030", borderColor: "#303030", color: "#fff" };
const addressRowStyle = { alignItems: "start", display: "grid", gap: "8px", gridTemplateColumns: "minmax(0, 1fr) auto" };
const checkPanelStyle = {
  background: "#fafafa",
  border: "1px solid #e3e3e3",
  borderRadius: "10px",
  boxSizing: "border-box",
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.15fr)",
  padding: "12px",
};
const statusDotStyle = (color) => ({ background: color, borderRadius: "50%", display: "inline-block", height: "8px", marginRight: "6px", width: "8px" });

// Control layout: [field, label, required, grid column span, input type]
/** @type {Array<[string, string, boolean, number, string]>} */
const TEXT_FIELDS = [
  ["recipientName", "Name", false, 3, "text"],
  ["phone", "Phone", false, 3, "tel"],
  ["email", "Email", false, 6, "email"],
  ["address1", "Address", true, 6, "text"],
  ["address2", "Apartment, suite, etc.", false, 2, "text"],
  ["city", "City", false, 2, "text"],
  ["province", "Province", false, 2, "text"],
  ["postalCode", "Postal code", false, 3, "text"],
  ["countryCode", "Country code", true, 3, "text"],
];

/**
 * @param {{
 *   addressCheck?: {status: "idle"|"busy"|"ok"|"error", message?: string, data?: {matchedAddress: string, latitude: number, longitude: number}, stale?: boolean},
 *   busy: boolean,
 *   draft: Record<string, string>,
 *   fieldErrors?: Record<string, string>,
 *   isEdit?: boolean,
 *   onCancel: () => void,
 *   onChange: (field: string, value: string) => void,
 *   onCheckAddress?: () => void,
 *   onSubmit: () => void,
 *   onTargetRouteChange: (routePlanId: string) => void,
 *   targetRouteOptions?: Array<{disabled?: boolean, label: string, value: string}>,
 *   targetRoutePlanId?: string,
 * }} props
 */
export function CustomStopDialog({
  addressCheck = { status: "idle" },
  busy,
  draft,
  fieldErrors = {},
  isEdit = false,
  onCancel,
  onChange,
  onCheckAddress,
  onSubmit,
  onTargetRouteChange,
  targetRouteOptions = [],
  targetRoutePlanId = "",
}) {
  const title = isEdit ? "Edit custom stop" : "Add custom stop";
  const submitLabel = isEdit ? "Save changes" : "Add custom stop";
  const targetRouteValid = isStopTargetRouteValid(targetRouteOptions, targetRoutePlanId);
  const showTargetPicker = !isEdit && shouldShowStopTargetRoutePicker(targetRouteOptions);
  const checkReady = isCustomStopAddressCheckReady(draft);
  const checkBusy = addressCheck.status === "busy";
  const dialogRef = useRef(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    busyRef.current = busy;
    onCancelRef.current = onCancel;
  }, [busy, onCancel]);

  // Escape closes the dialog (DESIGN.md: dialogs close on Escape); focus starts on the first field.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) onCancelRef.current?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.querySelector("input")?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div aria-busy={busy} aria-label={title} aria-modal="true" ref={dialogRef} role="dialog" style={dialogStyle}>
      <div>
        <h2 style={{ fontSize: "18px", lineHeight: "24px", margin: 0 }}>{title}</h2>
        <p style={{ ...hintStyle, fontSize: "13px", lineHeight: "18px", marginTop: "4px" }}>
          Add a delivery location without creating a Shopify order. Saved only in CLEVER for this store.
        </p>
      </div>

      <div style={bodyStyle}>
        {showTargetPicker ? (
          <label style={fieldStyle}>
            <span style={labelStyle}>Add to</span>
            <select
              disabled={busy}
              onChange={(event) => onTargetRouteChange(event.currentTarget.value)}
              style={inputStyle}
              value={targetRoutePlanId}
            >
              {targetRouteOptions.map((option) => (
                <option disabled={option.disabled === true} key={option.value || "unassigned"} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}

        <div style={fieldGridStyle}>
          {TEXT_FIELDS.map(([field, label, required, span, type]) => {
            const inputId = `custom-stop-${field}`;
            const input = (
              <input
                aria-describedby={fieldErrors[field] ? `${inputId}-error` : undefined}
                aria-invalid={Boolean(fieldErrors[field])}
                autoComplete="off"
                disabled={busy}
                id={inputId}
                onChange={(event) => onChange(field, event.currentTarget.value)}
                placeholder={field === "countryCode" ? "CA" : undefined}
                style={field === "countryCode" ? { ...inputStyle, textTransform: "uppercase" } : inputStyle}
                type={type}
                value={draft[field] ?? ""}
              />
            );
            return (
              <div key={field} style={{ ...fieldStyle, gridColumn: `span ${span}` }}>
                <label htmlFor={inputId} style={labelStyle}>{label}{required ? " *" : ""}</label>
                {field === "address1" ? (
                  <div style={addressRowStyle}>
                    {input}
                    <button
                      disabled={busy || checkBusy || !checkReady || !onCheckAddress}
                      onClick={() => onCheckAddress?.()}
                      style={{
                        ...buttonStyle,
                        minHeight: "38px",
                        ...(busy || checkBusy || !checkReady ? { cursor: "not-allowed", opacity: 0.6 } : null),
                      }}
                      title={checkReady ? "Show where this address will be placed" : "Enter an address and a two-letter country code first"}
                      type="button"
                    >
                      {checkBusy ? "Checking…" : "Check address"}
                    </button>
                  </div>
                ) : input}
                {fieldErrors[field] ? <p id={`${inputId}-error`} role="alert" style={errorStyle}>{fieldErrors[field]}</p> : null}
                {field === "countryCode" && !fieldErrors[field] ? <p style={hintStyle}>Two letters, such as CA.</p> : null}
              </div>
            );
          })}
        </div>

        {addressCheck.status === "error" ? (
          <p role="alert" style={{ ...errorStyle, fontSize: "13px" }}>{addressCheck.message || "The address could not be found. Check the spelling, city, and country code."}</p>
        ) : null}

        {addressCheck.status === "ok" && addressCheck.data ? (
          <section aria-label="Address check result" style={checkPanelStyle}>
            <div style={{ alignContent: "start", display: "grid", gap: "10px", minWidth: 0 }}>
              <p style={{ ...labelStyle, margin: 0 }}>
                <span style={statusDotStyle(addressCheck.stale ? "#b98900" : "#008060")} />
                {addressCheck.stale ? "Address changed since this check" : "Location found on the map"}
              </p>
              <div>
                <p style={hintStyle}>Address you entered</p>
                <p style={{ fontSize: "14px", lineHeight: "20px", margin: "2px 0 0", overflowWrap: "anywhere" }}>
                  {buildCustomStopAddress(draft)}
                </p>
              </div>
              {addressCheck.data.matchedAddress ? (
                <div>
                  <p style={hintStyle}>Matched address</p>
                  <p style={{ fontSize: "14px", lineHeight: "20px", margin: "2px 0 0", overflowWrap: "anywhere" }}>
                    {addressCheck.data.matchedAddress}
                  </p>
                </div>
              ) : null}
              <p style={hintStyle}>
                {addressCheck.stale
                  ? "Check the address again before adding this stop."
                  : "The stop is placed at the marker when you add it. Compare the marker with the street and building names on the map."}
              </p>
              <p style={{ ...hintStyle, fontVariantNumeric: "tabular-nums" }}>
                {addressCheck.data.latitude.toFixed(5)}, {addressCheck.data.longitude.toFixed(5)}
              </p>
            </div>
            <LocationPreviewMap
              ariaLabel="Checked address on the map"
              coordinate={{ latitude: addressCheck.data.latitude, longitude: addressCheck.data.longitude }}
              height="220px"
              readOnly
            />
          </section>
        ) : null}
      </div>

      <div style={actionsStyle}>
        <button disabled={busy} onClick={onCancel} style={buttonStyle} type="button">Cancel</button>
        <button
          disabled={busy || !targetRouteValid}
          onClick={onSubmit}
          style={{ ...primaryButtonStyle, ...(busy || !targetRouteValid ? { cursor: "wait", opacity: 0.7 } : null) }}
          type="button"
        >
          {busy ? (
            <span style={{ alignItems: "center", display: "inline-flex", gap: "7px" }}>
              <s-spinner accessibilityLabel="Adding custom stop" size="base" />
              {isEdit ? "Saving…" : "Adding…"}
            </span>
          ) : submitLabel}
        </button>
      </div>
    </div>
  );
}
