/* eslint-disable react/prop-types */
import { StopTimeIcon } from "./route-stop-time-cell";

// One stable callback so the field takes focus when the editor opens and not on every render.
const focusField = (node) => node?.focus();

// A text edited in place, with the pencil and the save and cancel buttons of the Stop time cell (same CSS classes).
// The page owns the draft. `draft` is null while the cell only shows the label.
// `editLabel`, `inputLabel` and `saveLabel` are the accessible names. `itemId` lets the page hand keyboard focus back to the pencil.
export function InlineTextCell({ busy, draft, editLabel, inputLabel, itemId, label, maxLength, onCancel, onChange, onEdit, onSave, saveLabel }) {
  if (draft === null) {
    return (
      <span className="stop-time-cell inline-text-cell">
        <span className="inline-text-cell__label" title={label}>{label}</span>
        <button aria-label={editLabel} className="stop-time-cell__edit" data-inline-text-edit={itemId} onClick={onEdit} title={editLabel} type="button">
          <StopTimeIcon name="edit" />
        </button>
      </span>
    );
  }

  // The page trims before it saves, so spaces around the text do not count.
  const text = draft.trim();
  const valid = text !== "" && text.length <= (maxLength ?? Infinity);
  const save = () => {
    if (valid && !busy) onSave();
  };
  const handleKeyDown = (event) => {
    // While an input method (Korean, Japanese) composes a syllable, Enter and Escape belong to it.
    // Safari reports the key that ends a composition after it ended, with key code 229.
    if (event.nativeEvent?.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      onCancel();
    }
  };

  return (
    <span className="stop-time-cell inline-text-cell">
      <input
        aria-invalid={!valid}
        aria-label={inputLabel}
        className="stop-time-cell__input inline-text-cell__input"
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={busy}
        ref={focusField}
        required
        type="text"
        value={draft}
      />
      <button aria-label={saveLabel} className="stop-time-cell__action" disabled={busy || !valid} onClick={save} title="Save" type="button">
        <StopTimeIcon name="save" />
      </button>
      <button aria-label="Cancel" className="stop-time-cell__action" onClick={onCancel} title="Cancel" type="button">
        <StopTimeIcon name="cancel" />
      </button>
    </span>
  );
}

// Keyboard focus goes back to the pencil of the item whose editor just closed.
// A save can finish after the person went on to another field, so focus only moves when nothing else has it.
export function focusInlineTextPencil(itemId) {
  window.requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    [...document.querySelectorAll("[data-inline-text-edit]")]
      .find((node) => node.dataset.inlineTextEdit === itemId)?.focus();
  });
}
