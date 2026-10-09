/* eslint-disable react/prop-types */

// Stateless pieces of the stop selection and the row drag handle in the Route Detail table.
// The page owns which stops are selected, which bar menu is open and the drag itself.

export function getStopSelection(rows, selectedKeys) {
  const keys = new Set(Array.isArray(selectedKeys) ? selectedKeys : []);
  const allRows = Array.isArray(rows) ? rows : [];
  const selectedRows = allRows.filter((row) => keys.has(row.rowKey));
  return {
    allSelected: allRows.length > 0 && selectedRows.length === allRows.length,
    rows: selectedRows,
    someSelected: selectedRows.length > 0,
  };
}

// `indeterminate` is a DOM property only, so a ref callback sets it.
const setIndeterminate = (indeterminate) => (node) => {
  if (node) node.indeterminate = indeterminate;
};

export function StopSelectCheckbox({ checked, label, onChange }) {
  return (
    <input
      aria-label={label}
      checked={checked}
      className="stop-select-checkbox"
      onChange={(event) => onChange(event.target.checked)}
      type="checkbox"
    />
  );
}

export function StopSelectAllCheckbox({ allSelected, disabled, onChange, someSelected }) {
  return (
    <input
      aria-label="Select all stops"
      checked={allSelected}
      className="stop-select-checkbox"
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      ref={setIndeterminate(someSelected && !allSelected)}
      type="checkbox"
    />
  );
}

const GRIP_DOTS = [3, 8, 13].flatMap((cy) => [3, 7].map((cx) => [cx, cy]));

/**
 * The grip at the start of a stop row. It is the only part of the row that starts a drag.
 * A stop that cannot be dragged gets an empty space of the same size, so the checkboxes stay in line.
 */
export function StopDragHandle({ draggable, label, onDragEnd, onDragStart }) {
  if (!draggable) return <span aria-hidden="true" className="stop-drag-handle stop-drag-handle--idle" />;
  return (
    <span aria-label={label} className="stop-drag-handle" draggable onDragEnd={onDragEnd} onDragStart={onDragStart} role="img" title="Drag to reorder">
      <svg aria-hidden="true" focusable="false" height="16" viewBox="0 0 10 16" width="10">
        {GRIP_DOTS.map(([cx, cy]) => <circle cx={cx} cy={cy} fill="currentColor" key={`${cx}-${cy}`} r="1.4" />)}
      </svg>
    </span>
  );
}

function Chevron() {
  return (
    <svg aria-hidden="true" focusable="false" height="12" viewBox="0 0 20 20" width="12">
      <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

const reasonWhenDisabled = (enabled, title) => (enabled ? undefined : title);

/**
 * The bar that takes the place of the header row while stops are selected.
 * `menu` is "send", "mark" or null; a button that is disabled says why in its title.
 */
export function StopSelectionBar({
  allSelected,
  canEdit,
  canMark,
  canRemove,
  count,
  editTitle,
  markOptions,
  markTitle,
  menu,
  onClear,
  onEdit,
  onMark,
  onMenuChange,
  onRemove,
  onSend,
  removeTitle,
  sendTargets,
  sendTitle,
}) {
  const canSend = sendTargets.length > 0;
  const sendChoosesTarget = sendTargets.length > 1;
  const toggle = (name) => onMenuChange(menu === name ? null : name);

  return (
    <div
      aria-label="Selected stops"
      className="stop-selection-bar"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || menu === null) return;
        event.preventDefault();
        onMenuChange(null);
      }}
      role="toolbar"
    >
      <span className="stop-selection-bar__lead">
        <input
          aria-label="Clear stop selection"
          checked={allSelected}
          className="stop-select-checkbox"
          onChange={onClear}
          ref={setIndeterminate(!allSelected)}
          type="checkbox"
        />
        <span aria-live="polite" className="stop-selection-bar__count">{count} selected</span>
      </span>
      <span className="stop-selection-bar__actions">
        {count === 1 ? (
          <button className="stop-selection-bar__button" disabled={!canEdit} onClick={onEdit} title={reasonWhenDisabled(canEdit, editTitle)} type="button">Edit stop</button>
        ) : null}
        <button className="stop-selection-bar__button" disabled={!canRemove} onClick={onRemove} title={reasonWhenDisabled(canRemove, removeTitle)} type="button">
          {count === 1 ? "Remove stop" : "Remove stops"}
        </button>
        <span className="stop-selection-bar__menu-anchor">
          <button
            aria-expanded={sendChoosesTarget ? menu === "send" : undefined}
            aria-haspopup={sendChoosesTarget ? "menu" : undefined}
            className="stop-selection-bar__button"
            disabled={!canSend}
            onClick={() => (sendChoosesTarget ? toggle("send") : onSend(sendTargets[0]))}
            title={reasonWhenDisabled(canSend, sendTitle)}
            type="button"
          >Send to route</button>
          {menu === "send" && sendChoosesTarget ? (
            <div aria-label="Route targets" className="stop-selection-bar__menu" role="menu">
              {sendTargets.map((target) => (
                <button key={target.id} onClick={() => onSend(target)} role="menuitem" type="button">{target.title}</button>
              ))}
            </div>
          ) : null}
        </span>
        <span className="stop-selection-bar__menu-anchor">
          <button
            aria-expanded={menu === "mark"}
            aria-haspopup="menu"
            className="stop-selection-bar__button"
            disabled={!canMark}
            onClick={() => toggle("mark")}
            title={reasonWhenDisabled(canMark, markTitle)}
            type="button"
          >Mark as<Chevron /></button>
          {menu === "mark" ? (
            <div aria-label="Mark selected stops as" className="stop-selection-bar__menu" role="menu">
              {markOptions.map((option) => (
                <button disabled={option.disabled} key={option.status} onClick={() => onMark(option.status)} role="menuitem" type="button">{option.label}</button>
              ))}
            </div>
          ) : null}
        </span>
      </span>
    </div>
  );
}
