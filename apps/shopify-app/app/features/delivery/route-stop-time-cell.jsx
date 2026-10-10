/* eslint-disable react/prop-types */
import { STOP_TIME_MAX_MINUTES, readStopTimeMinutes } from "./route-helpers";

// One stable callback so the field takes focus when the editor opens and not on every render.
const focusField = (node) => node?.focus();

const ICON_PATHS = {
  cancel: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  save: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
};

function StopTimeIcon({ name }) {
  return (
    <svg aria-hidden="true" focusable="false" height="14" viewBox="0 0 24 24" width="14">
      <path d={ICON_PATHS[name]} fill="currentColor" />
    </svg>
  );
}

// The page owns the draft. `draft` is null while the cell only shows the label.
// `orderLabel` names the order (or driver) in the accessible labels; `stopId` lets the page hand keyboard focus back to the pencil.
// `subject` names the time in the accessible labels. `allowEmpty` lets an empty field be saved, for a time that can be removed.
export function StopTimeCell({ allowEmpty = false, busy, canEdit, draft, label, onCancel, onChange, onEdit, onSave, orderLabel, stopId, subject = "stop time" }) {
  if (!canEdit) return <span className="stop-time-cell">{label}</span>;
  const forOrder = (text) => (orderLabel ? `${text} for ${orderLabel}` : text);
  const capitalSubject = subject.charAt(0).toUpperCase() + subject.slice(1);

  if (draft === null) {
    return (
      <span className="stop-time-cell">
        {label}
        <button aria-label={forOrder(`Edit ${subject}`)} className="stop-time-cell__edit" data-stop-time-edit={stopId} onClick={onEdit} title={`Edit ${subject}`} type="button">
          <StopTimeIcon name="edit" />
        </button>
      </span>
    );
  }

  const valid = (allowEmpty && draft === "") || readStopTimeMinutes(draft) !== null;
  const save = () => {
    if (valid && !busy) onSave();
  };
  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      onCancel();
    }
  };

  return (
    <span className="stop-time-cell">
      <input
        aria-invalid={!valid}
        aria-label={forOrder(`${capitalSubject} in minutes`)}
        className="stop-time-cell__input"
        inputMode="numeric"
        max={STOP_TIME_MAX_MINUTES}
        min={0}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={busy}
        ref={focusField}
        step={1}
        title={`Whole minutes, 0 to ${STOP_TIME_MAX_MINUTES}${allowEmpty ? "; leave empty to remove it" : ""}`}
        type="number"
        value={draft}
      />
      <button aria-label={`Save ${subject}`} className="stop-time-cell__action" disabled={busy || !valid} onClick={save} title="Save" type="button">
        <StopTimeIcon name="save" />
      </button>
      <button aria-label="Cancel" className="stop-time-cell__action" onClick={onCancel} title="Cancel" type="button">
        <StopTimeIcon name="cancel" />
      </button>
    </span>
  );
}
