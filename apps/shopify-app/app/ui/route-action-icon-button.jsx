/* eslint-disable react/prop-types */
import { useId } from "react";

export function RouteActionIconButton({ icon, label, description, disabled, busy = false, danger = false, onClick }) {
  const tooltipId = useId();
  return (
    <span
      className="route-action-icon"
      // Allow keyboard users to read why the native button is disabled.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={disabled ? 0 : undefined}
      aria-label={disabled ? `${label} (unavailable)` : undefined}
      aria-describedby={disabled ? tooltipId : undefined}
    >
      <button
        aria-label={label}
        aria-describedby={tooltipId}
        aria-busy={busy || undefined}
        className={`route-action-icon__button${danger ? " route-action-icon__button--danger" : ""}`}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <s-icon type={icon} size="base" tone={danger && !disabled ? "critical" : "auto"} color={disabled ? "subdued" : "base"} aria-hidden="true" />
      </button>
      <span className="route-action-icon__tooltip" id={tooltipId} role="tooltip">
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </span>
    </span>
  );
}
