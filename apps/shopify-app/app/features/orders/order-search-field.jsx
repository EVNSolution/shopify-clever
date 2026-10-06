/* eslint-disable react/prop-types */
import { useRef } from "react";

export function OrderSearchField({ value, busy, onChange, onSubmit, onClear }) {
  const inputRef = useRef(null);

  return (
    <form
      className="order-search-field"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        ref={inputRef}
        className="order-search-field__input"
        type="search"
        aria-label="Search orders"
        aria-busy={busy}
        placeholder="Search order number"
        value={value}
        onChange={onChange}
      />
      <span className="order-search-field__status" role="status" aria-live="polite">
        {busy ? <span className="order-search-field__spinner" aria-hidden="true" /> : null}
        <span className="order-search-field__status-text">{busy ? "Searching orders" : ""}</span>
      </span>
      <span className="order-search-field__clear-slot">
        {value ? (
          <button
            className="order-search-field__clear"
            type="button"
            aria-label="Clear order search"
            onClick={() => {
              onClear();
              inputRef.current?.focus();
            }}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </span>
    </form>
  );
}
