/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from "react";

import {
  hasUnsupportedTemplateSegments,
  insertTemplateToken,
  parseTemplateDocument,
  serializeTemplateDocument,
} from "./template-document.js";

export const CUSTOMER_NOTIFICATION_TOKEN_LABELS = {
  customerName: "Customer name",
  deliveryAddress: "Delivery address",
  deliveryDate: "Delivery date",
  deliveryWeekday: "Delivery weekday",
  eta: "ETA",
  inventoryList: "Inventory list",
  orderNumber: "Order number",
  routeName: "Route name",
  sequence: "Stop sequence",
  shopName: "Shop name",
};

export const CUSTOMER_NOTIFICATION_TOKEN_OPTIONS = Object.entries(CUSTOMER_NOTIFICATION_TOKEN_LABELS);

export function TemplateTokenEditor({
  compact = false,
  disabled = false,
  id,
  label,
  maxLength = 10000,
  onChange,
  onUnsupportedChange,
  value,
}) {
  const [document, setDocument] = useState(() => parseTemplateDocument(value));
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(null);
  const editorRef = useRef(null);

  useEffect(() => {
    setDocument(parseTemplateDocument(value));
  }, [value]);

  const hasUnsupported = useMemo(() => hasUnsupportedTemplateSegments(document), [document]);

  useEffect(() => {
    onUnsupportedChange?.(hasUnsupported);
  }, [hasUnsupported, onUnsupportedChange]);

  const commitDocument = (nextDocument) => {
    const serialized = serializeTemplateDocument(nextDocument).slice(0, maxLength);
    const reparsed = parseTemplateDocument(serialized);
    setDocument(reparsed);
    onChange?.(serialized);
  };

  const updateTextSegment = (index, nextValue) => {
    if (!document.segments[index]) {
      commitDocument({
        diagnostics: document.diagnostics,
        segments: nextValue
          ? [...document.segments, { type: "text", value: nextValue }]
          : document.segments,
      });
      return;
    }

    commitDocument({
      diagnostics: document.diagnostics,
      segments: document.segments.map((segment, segmentIndex) => (
        segmentIndex === index ? { type: "text", value: nextValue } : segment
      )),
    });
  };

  const insertToken = (tokenKey) => {
    const insertionIndex = selectedSegmentIndex == null
      ? document.segments.length
      : selectedSegmentIndex + 1;
    commitDocument(insertTemplateToken(document, tokenKey, insertionIndex));
    setSelectedSegmentIndex(insertionIndex);
  };

  const removeSelectedSegment = () => {
    if (selectedSegmentIndex == null) return;
    const segment = document.segments[selectedSegmentIndex];
    if (segment?.type === "text") return;

    commitDocument({
      diagnostics: document.diagnostics,
      segments: document.segments.filter((_, index) => index !== selectedSegmentIndex),
    });
    setSelectedSegmentIndex(null);
  };

  const handleKeyDown = (event) => {
    if ((event.key === "Backspace" || event.key === "Delete") && selectedSegmentIndex != null) {
      event.preventDefault();
      removeSelectedSegment();
    }
  };

  const handlePaste = (event) => {
    const pastedText = event.clipboardData?.getData("text/plain");
    if (!pastedText) return;

    event.preventDefault();
    const pastedDocument = parseTemplateDocument(pastedText);
    const insertionIndex = selectedSegmentIndex == null
      ? document.segments.length
      : selectedSegmentIndex + 1;
    commitDocument({
      diagnostics: [
        ...document.diagnostics,
        ...pastedDocument.diagnostics,
      ],
      segments: [
        ...document.segments.slice(0, insertionIndex),
        ...pastedDocument.segments,
        ...document.segments.slice(insertionIndex),
      ],
    });
  };

  return (
    <div style={templateEditorShellStyle}>
      <div style={templateEditorHeaderStyle}>
        <label htmlFor={id} style={templateEditorLabelStyle}>{label}</label>
        {hasUnsupported ? (
          <span role="alert" style={templateEditorErrorStyle}>Unsupported variable</span>
        ) : null}
      </div>
      <div
        aria-label={label}
        id={id}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        ref={editorRef}
        role="textbox"
        style={editorSurfaceStyle({ compact, disabled })}
        tabIndex={disabled ? -1 : 0}
      >
        {document.segments.length === 0 ? (
          <span
            contentEditable={!disabled}
            onBlur={(event) => updateTextSegment(0, event.currentTarget.textContent ?? "")}
            suppressContentEditableWarning
            style={templateTextSegmentStyle}
          />
        ) : null}
        {document.segments.map((segment, index) => {
          if (segment.type === "token") {
            return (
              <button
                aria-label={`Token ${CUSTOMER_NOTIFICATION_TOKEN_LABELS[segment.key] ?? segment.key}`}
                aria-pressed={selectedSegmentIndex === index}
                disabled={disabled}
                key={`${index}-${segment.key}`}
                onClick={() => setSelectedSegmentIndex(index)}
                style={selectedSegmentIndex === index ? templateTokenSelectedStyle : templateTokenStyle}
                type="button"
              >
                {CUSTOMER_NOTIFICATION_TOKEN_LABELS[segment.key] ?? segment.key}
              </button>
            );
          }

          if (segment.type === "unsupported") {
            return (
              <button
                aria-label="Unsupported template variable"
                aria-pressed={selectedSegmentIndex === index}
                disabled={disabled}
                key={`${index}-${segment.raw}`}
                onClick={() => setSelectedSegmentIndex(index)}
                style={selectedSegmentIndex === index ? templateUnsupportedSelectedStyle : templateUnsupportedStyle}
                type="button"
              >
                Unsupported variable
              </button>
            );
          }

          return (
            <span
              contentEditable={!disabled}
              key={`${index}-${segment.value}`}
              onBlur={(event) => updateTextSegment(index, event.currentTarget.textContent ?? "")}
              onFocus={() => setSelectedSegmentIndex(index)}
              suppressContentEditableWarning
              style={templateTextSegmentStyle}
            >
            {segment.value}
          </span>
          );
        })}
        {document.segments.length > 0 && document.segments.at(-1)?.type !== "text" ? (
          <span
            contentEditable={!disabled}
            onBlur={(event) => updateTextSegment(document.segments.length, event.currentTarget.textContent ?? "")}
            suppressContentEditableWarning
            style={templateTextSegmentStyle}
          />
        ) : null}
      </div>
      <div>
        <strong style={templateVariableTitleStyle}>Insert variable</strong>
        <div aria-label="Template variables" style={templateVariableListStyle}>
          {CUSTOMER_NOTIFICATION_TOKEN_OPTIONS.map(([tokenKey, tokenLabel]) => (
            <button
              disabled={disabled}
              key={tokenKey}
              onClick={() => insertToken(tokenKey)}
              style={templateVariableButtonStyle}
              type="button"
            >
              {tokenLabel}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const templateEditorShellStyle = {
  display: "grid",
  gap: "8px",
};

const templateEditorHeaderStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  justifyContent: "space-between",
};

const templateEditorLabelStyle = {
  color: "#303030",
  fontSize: "13px",
  fontWeight: 650,
};

const templateEditorSurfaceStyle = {
  alignItems: "center",
  background: "#ffffff",
  border: "1px solid #c9c9c9",
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#303030",
  display: "flex",
  flexWrap: "wrap",
  font: "inherit",
  gap: "6px",
  lineHeight: "20px",
  minHeight: "140px",
  padding: "8px",
  width: "100%",
};

const templateEditorDisabledStyle = {
  ...templateEditorSurfaceStyle,
  background: "#f7f7f7",
  color: "#616161",
};

function editorSurfaceStyle({ compact, disabled }) {
  return {
    ...(disabled ? templateEditorDisabledStyle : templateEditorSurfaceStyle),
    minHeight: compact ? "40px" : templateEditorSurfaceStyle.minHeight,
  };
}

const templateTextSegmentStyle = {
  minHeight: "24px",
  minWidth: "2ch",
  outline: "none",
  whiteSpace: "pre-wrap",
};

const templateTokenStyle = {
  background: "#eef4ff",
  border: "1px solid #b4d0ff",
  borderRadius: "999px",
  color: "#003a8c",
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
  fontWeight: 650,
  minHeight: "26px",
  padding: "3px 8px",
};

const templateTokenSelectedStyle = {
  ...templateTokenStyle,
  boxShadow: "0 0 0 2px #005bd3",
};

const templateUnsupportedStyle = {
  ...templateTokenStyle,
  background: "#fff1f0",
  borderColor: "#ffb3a7",
  color: "#8e1f0b",
};

const templateUnsupportedSelectedStyle = {
  ...templateUnsupportedStyle,
  boxShadow: "0 0 0 2px #d72c0d",
};

const templateEditorErrorStyle = {
  color: "#8e1f0b",
  fontSize: "13px",
  fontWeight: 650,
};

const templateVariableTitleStyle = {
  display: "block",
  fontSize: "13px",
  marginBottom: "8px",
};

const templateVariableListStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
};

const templateVariableButtonStyle = {
  ...templateTokenStyle,
  background: "#ffffff",
  borderColor: "#c9c9c9",
  color: "#303030",
};
