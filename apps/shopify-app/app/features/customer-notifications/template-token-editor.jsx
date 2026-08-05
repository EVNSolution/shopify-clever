/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from "react";

import {
  hasUnsupportedTemplateSegments,
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
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const [variableMenuOpen, setVariableMenuOpen] = useState(false);
  const [variableQuery, setVariableQuery] = useState("");
  const parsedDocument = useMemo(() => parseTemplateDocument(value), [value]);
  const hasUnsupported = hasUnsupportedTemplateSegments(parsedDocument);
  const filteredVariables = CUSTOMER_NOTIFICATION_TOKEN_OPTIONS.filter(([, tokenLabel]) => (
    tokenLabel.toLowerCase().includes(variableQuery.trim().toLowerCase())
  ));

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = serializeTemplateDocument(parsedDocument);
    if (serializeEditorDocument(editor) === nextValue || editor === editor.ownerDocument.activeElement) return;
    renderTemplateDocument(editor, parsedDocument);
  }, [parsedDocument]);

  useEffect(() => {
    onUnsupportedChange?.(hasUnsupported);
  }, [hasUnsupported, onUnsupportedChange]);

  const commitEditorValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const serialized = serializeEditorDocument(editor).slice(0, maxLength);
    onChange?.(serialized);
  };

  const rememberSelection = () => {
    const editor = editorRef.current;
    const selection = editor?.ownerDocument.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
  };

  const insertToken = (tokenKey) => {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    editor.focus();

    const selection = editor.ownerDocument.getSelection();
    const range = selectionRangeInsideEditor(editor, savedRangeRef.current)
      ?? selectionRangeInsideEditor(editor, selection?.rangeCount ? selection.getRangeAt(0) : null)
      ?? rangeAtEditorEnd(editor);
    const token = createTokenElement(editor.ownerDocument, tokenKey);
    range.deleteContents();
    range.insertNode(token);
    range.setStartAfter(token);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = range.cloneRange();
    setVariableMenuOpen(false);
    setVariableQuery("");
    commitEditorValue();
  };

  const handlePaste = (event) => {
    const pastedText = event.clipboardData?.getData("text/plain");
    if (!pastedText) return;
    event.preventDefault();

    const selection = editorRef.current?.ownerDocument.getSelection();
    if (!selection?.rangeCount || !editorRef.current) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) return;

    const fragment = createTemplateFragment(editorRef.current.ownerDocument, parseTemplateDocument(pastedText));
    const lastNode = fragment.lastChild;
    range.deleteContents();
    range.insertNode(fragment);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    commitEditorValue();
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
        aria-multiline={!compact}
        contentEditable={!disabled}
        id={id}
        onBlur={() => {
          rememberSelection();
          commitEditorValue();
        }}
        onInput={commitEditorValue}
        onKeyDown={(event) => {
          if (compact && event.key === "Enter") event.preventDefault();
        }}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onPaste={handlePaste}
        ref={editorRef}
        role="textbox"
        spellCheck="true"
        style={editorSurfaceStyle({ compact, disabled })}
        suppressContentEditableWarning
        tabIndex={disabled ? -1 : 0}
      />
      <div style={templateVariableControlStyle}>
        <button
          aria-expanded={variableMenuOpen}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={() => {
            rememberSelection();
            setVariableMenuOpen((open) => !open);
          }}
          style={templateVariableTriggerStyle}
          type="button"
        >
          <span aria-hidden="true" style={templateVariableTriggerIconStyle}>＋</span>
          Insert variable
          <span aria-hidden="true">⌄</span>
        </button>
        {variableMenuOpen ? (
          <div style={templateVariablePopoverStyle}>
            <label style={templateVariableSearchLabelStyle}>
              <span>Find a variable</span>
              <input
                onChange={(event) => setVariableQuery(event.target.value)}
                placeholder="Search variables"
                style={templateVariableSearchStyle}
                value={variableQuery}
              />
            </label>
            <div aria-label="Template variables" role="listbox" style={templateVariableMenuStyle}>
              {filteredVariables.map(([tokenKey, tokenLabel]) => (
                <button
                  aria-selected="false"
                  key={tokenKey}
                  onClick={() => insertToken(tokenKey)}
                  role="option"
                  style={templateVariableOptionStyle}
                  type="button"
                >
                  <span>{tokenLabel}</span>
                  <span aria-hidden="true" style={templateVariableOptionPlusStyle}>＋</span>
                </button>
              ))}
              {filteredVariables.length === 0 ? <span style={templateVariableEmptyStyle}>No matching variables</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function renderTemplateDocument(editor, templateDocument) {
  editor.replaceChildren(createTemplateFragment(editor.ownerDocument, templateDocument));
}

function createTemplateFragment(ownerDocument, templateDocument) {
  const fragment = ownerDocument.createDocumentFragment();
  for (const segment of templateDocument.segments) {
    if (segment.type === "token") {
      fragment.append(createTokenElement(ownerDocument, segment.key));
    } else if (segment.type === "unsupported") {
      fragment.append(createUnsupportedElement(ownerDocument, segment.raw));
    } else {
      fragment.append(ownerDocument.createTextNode(segment.value));
    }
  }
  return fragment;
}

function createTokenElement(ownerDocument, tokenKey) {
  const token = ownerDocument.createElement("span");
  token.contentEditable = "false";
  token.dataset.templateToken = tokenKey;
  token.setAttribute("aria-label", `Variable: ${CUSTOMER_NOTIFICATION_TOKEN_LABELS[tokenKey] ?? tokenKey}`);
  token.style.cssText = TEMPLATE_TOKEN_CSS_TEXT;
  token.textContent = CUSTOMER_NOTIFICATION_TOKEN_LABELS[tokenKey] ?? tokenKey;
  return token;
}

function createUnsupportedElement(ownerDocument, raw) {
  const token = ownerDocument.createElement("span");
  token.contentEditable = "false";
  token.dataset.unsupportedTemplateToken = raw;
  token.setAttribute("aria-label", "Unsupported template variable");
  token.style.cssText = TEMPLATE_UNSUPPORTED_TOKEN_CSS_TEXT;
  token.textContent = "Unsupported variable";
  return token;
}

function serializeEditorDocument(editor) {
  return [...editor.childNodes].map(serializeEditorNode).join("").replaceAll("\u200B", "");
}

function serializeEditorNode(node) {
  if (node.nodeType === node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== node.ELEMENT_NODE) return "";
  if (node.dataset?.templateToken) return serializeTemplateDocument({ segments: [{ key: node.dataset.templateToken, type: "token" }] });
  if (node.dataset?.unsupportedTemplateToken) return node.dataset.unsupportedTemplateToken;
  if (node.tagName === "BR") return "\n";

  const text = [...node.childNodes].map(serializeEditorNode).join("");
  return /^(DIV|P)$/u.test(node.tagName) ? `${text}\n` : text;
}

function selectionRangeInsideEditor(editor, range) {
  if (!range || !editor.contains(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

function rangeAtEditorEnd(editor) {
  const range = editor.ownerDocument.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  return range;
}

const TEMPLATE_TOKEN_CSS_TEXT = [
  "background:#eef4ff",
  "border:1px solid #b4d0ff",
  "border-radius:6px",
  "box-decoration-break:clone",
  "color:#003a8c",
  "display:inline-block",
  "font-size:12px",
  "font-weight:650",
  "line-height:20px",
  "margin:1px 2px",
  "padding:1px 7px",
  "user-select:all",
  "vertical-align:baseline",
].join(";");

const TEMPLATE_UNSUPPORTED_TOKEN_CSS_TEXT = `${TEMPLATE_TOKEN_CSS_TEXT};background:#fff1f0;border-color:#ffb3a7;color:#8e1f0b`;

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
  background: "#ffffff",
  border: "1px solid #8a8a8a",
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#303030",
  font: "inherit",
  lineHeight: "24px",
  minHeight: "180px",
  overflowWrap: "anywhere",
  padding: "10px 12px",
  whiteSpace: "pre-wrap",
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
    minHeight: compact ? "42px" : templateEditorSurfaceStyle.minHeight,
    padding: compact ? "8px 10px" : templateEditorSurfaceStyle.padding,
  };
}

const templateEditorErrorStyle = {
  color: "#8e1f0b",
  fontSize: "13px",
  fontWeight: 650,
};

const templateVariableControlStyle = {
  justifySelf: "start",
  position: "relative",
};

const templateVariableTriggerStyle = {
  alignItems: "center",
  appearance: "none",
  background: "#ffffff",
  border: "1px solid #c9c9c9",
  borderRadius: "8px",
  color: "#303030",
  cursor: "pointer",
  display: "inline-flex",
  font: "inherit",
  fontSize: "13px",
  fontWeight: 650,
  gap: "7px",
  minHeight: "34px",
  padding: "6px 10px",
};

const templateVariableTriggerIconStyle = {
  color: "#005bd3",
  fontSize: "16px",
  lineHeight: 1,
};

const templateVariablePopoverStyle = {
  background: "#ffffff",
  border: "1px solid #d0d0d0",
  borderRadius: "10px",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.16)",
  display: "grid",
  gap: "8px",
  left: 0,
  marginTop: "6px",
  maxWidth: "320px",
  padding: "10px",
  position: "absolute",
  top: "100%",
  width: "min(320px, calc(100vw - 48px))",
  zIndex: 5,
};

const templateVariableSearchLabelStyle = {
  display: "grid",
  fontSize: "12px",
  fontWeight: 650,
  gap: "5px",
};

const templateVariableSearchStyle = {
  border: "1px solid #8a8a8a",
  borderRadius: "7px",
  boxSizing: "border-box",
  font: "inherit",
  minHeight: "34px",
  padding: "6px 9px",
  width: "100%",
};

const templateVariableMenuStyle = {
  display: "grid",
  maxHeight: "260px",
  overflowY: "auto",
};

const templateVariableOptionStyle = {
  alignItems: "center",
  appearance: "none",
  background: "transparent",
  border: 0,
  borderRadius: "7px",
  color: "#303030",
  cursor: "pointer",
  display: "flex",
  font: "inherit",
  fontSize: "13px",
  justifyContent: "space-between",
  minHeight: "36px",
  padding: "7px 8px",
  textAlign: "left",
};

const templateVariableOptionPlusStyle = {
  color: "#005bd3",
  fontWeight: 700,
};

const templateVariableEmptyStyle = {
  color: "#616161",
  fontSize: "13px",
  padding: "10px 8px",
};
