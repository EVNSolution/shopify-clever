/* eslint-disable react/prop-types */

const dialogStyle = {
  background: "#fff",
  border: "1px solid #d6d6d6",
  borderRadius: "12px",
  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.24)",
  boxSizing: "border-box",
  display: "grid",
  gap: "14px",
  maxHeight: "calc(100vh - 48px)",
  maxWidth: "calc(100vw - 48px)",
  overflow: "auto",
  padding: "18px",
  position: "relative",
  width: "760px",
  zIndex: 1,
};

const fieldGridStyle = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const fieldStyle = { display: "grid", gap: "5px" };
const fullWidthFieldStyle = { ...fieldStyle, gridColumn: "1 / -1" };
const labelStyle = { color: "#303030", fontSize: "13px", fontWeight: 650 };
const inputStyle = {
  background: "#fff",
  border: "1px solid #8a8a8a",
  borderRadius: "8px",
  boxSizing: "border-box",
  font: "inherit",
  minHeight: "38px",
  padding: "8px 10px",
  width: "100%",
};
const errorStyle = { color: "#8e1f0b", fontSize: "12px", margin: 0 };
const infoStyle = {
  background: "#eef7ff",
  border: "1px solid #b5d9f7",
  borderRadius: "9px",
  color: "#17466f",
  fontSize: "13px",
  lineHeight: 1.45,
  padding: "10px 12px",
};
const actionsStyle = { display: "flex", gap: "8px", justifyContent: "flex-end" };
const buttonStyle = {
  background: "#fff",
  border: "1px solid #8a8a8a",
  borderRadius: "8px",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 650,
  minHeight: "36px",
  padding: "7px 13px",
};
const primaryButtonStyle = { ...buttonStyle, background: "#303030", borderColor: "#303030", color: "#fff" };
/** @type {Array<[string, string, boolean]>} */
const TEXT_FIELDS = [
  ["recipientName", "Name", false],
  ["phone", "Phone", false],
  ["email", "Email", false],
  ["address1", "Address", true],
  ["address2", "Apartment, suite, etc.", false],
  ["city", "City", false],
  ["province", "Province", false],
  ["postalCode", "Postal code", false],
  ["countryCode", "Country code", false],
];

/**
 * @param {{
 *   busy: boolean,
 *   draft: Record<string, string>,
 *   fieldErrors?: Record<string, string>,
 *   isEdit?: boolean,
 *   onCancel: () => void,
 *   onChange: (field: string, value: string) => void,
 *   onSubmit: () => void,
 *   onTargetRouteChange: (routePlanId: string) => void,
 *   targetRouteOptions?: Array<{label: string, value: string}>,
 *   targetRoutePlanId?: string,
 * }} props
 */
export function CustomStopDialog({
  busy,
  draft,
  fieldErrors = {},
  isEdit = false,
  onCancel,
  onChange,
  onSubmit,
  onTargetRouteChange,
  targetRouteOptions = [],
  targetRoutePlanId = "",
}) {
  const title = isEdit ? "Edit custom stop" : "Add custom stop";
  const submitLabel = isEdit ? "Save changes" : "Add custom stop";
  return (
    <div aria-label={title} aria-busy={busy} aria-modal="true" role="dialog" style={dialogStyle}>
      <div>
        <h2 style={{ fontSize: "20px", margin: 0 }}>{title}</h2>
        <p style={{ color: "#616161", margin: "4px 0 0" }}>
          Add a delivery location without creating a Shopify order.
        </p>
      </div>

      <div role="note" style={infoStyle}>
        Saved only in CLEVER for this store. No Shopify order is created or changed.
      </div>

      {targetRouteOptions.length > 0 ? (
        <label style={fieldStyle}>
          <span style={labelStyle}>Add to</span>
          <select
            disabled={busy || isEdit}
            onChange={(event) => onTargetRouteChange(event.currentTarget.value)}
            style={inputStyle}
            value={targetRoutePlanId}
          >
            {targetRouteOptions.map((option) => (
              <option key={option.value || "unassigned"} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : null}

      <div style={fieldGridStyle}>
        {TEXT_FIELDS.map(([field, label, required]) => (
          <label key={field} style={["address1", "address2"].includes(field) ? fullWidthFieldStyle : fieldStyle}>
            <span style={labelStyle}>{label}{required ? " *" : ""}</span>
            <input
              aria-invalid={Boolean(fieldErrors[field])}
              disabled={busy}
              onChange={(event) => onChange(field, event.currentTarget.value)}
              style={inputStyle}
              type={field === "email" ? "email" : "text"}
              value={draft[field] ?? ""}
            />
            {fieldErrors[field] ? <p role="alert" style={errorStyle}>{fieldErrors[field]}</p> : null}
          </label>
        ))}
      </div>

      <div style={actionsStyle}>
        <button disabled={busy} onClick={onCancel} style={buttonStyle} type="button">Cancel</button>
        <button
          disabled={busy}
          onClick={onSubmit}
          style={{ ...primaryButtonStyle, ...(busy ? { cursor: "wait", opacity: 0.7 } : null) }}
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
