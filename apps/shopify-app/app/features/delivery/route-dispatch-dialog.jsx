/* eslint-disable react/prop-types */
import { OfficeDialog } from "./route-office-components";

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

/**
 * Dispatch popup: confirms the driver. Customer email is not chosen here. Delivery scheduled is sent with
 * Send Notification; the other templates go out on their own when they are turned on in Customer notifications.
 */
export function RouteDispatchDialog({ busy, driverName, onClose, onDispatch }) {
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
            onClick={onDispatch}
          >
            Dispatch
          </button>
        </>
      )}
    >
      <p style={noteStyle}>The driver gets the route in the driver app. This does not start the route.</p>
      <p style={noteStyle}>Use the Send notifications menu after Dispatch to send the Delivery scheduled email.</p>
    </OfficeDialog>
  );
}
