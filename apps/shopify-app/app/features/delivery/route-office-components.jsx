/* eslint-disable react/prop-types */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { withEmbeddedShopifyContext } from "./route-paths";
import {
  canEditRouteOptions,
  formatCashAmount,
  normalizeRouteOptions,
  normalizeCashAmount,
  getOfficeErrorMessage,
} from "./route-office-options";

const moneyStyle = {
  display: "grid",
  gap: 4,
  fontVariantNumeric: "tabular-nums",
};
const overlayStyle = {
  alignItems: "center",
  background: "rgba(0, 0, 0, 0.34)",
  boxSizing: "border-box",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  padding: 16,
  position: "fixed",
  zIndex: 2147483647,
};
const dialogStyle = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.24)",
  boxSizing: "border-box",
  display: "grid",
  gap: 14,
  maxHeight: "100%",
  maxWidth: "100%",
  outline: "none",
  overflowY: "auto",
  padding: 18,
  width: 480,
};
const optionListStyle = {
  border: "1px solid #e3e3e3",
  borderRadius: 8,
  display: "grid",
  margin: 0,
  minWidth: 0,
  overflow: "hidden",
  padding: 0,
};
const optionRowStyle = {
  alignItems: "center",
  cursor: "pointer",
  display: "flex",
  fontSize: 14,
  gap: 10,
  minHeight: 44,
  padding: "0 14px",
};
const noteStyle = { color: "#616161", fontSize: 13, margin: 0 };
const actionsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "flex-end",
};
const dialogButtonStyle = {
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
const primaryButtonStyle = {
  ...dialogButtonStyle,
  background: "#303030",
  borderColor: "#303030",
  color: "#fff",
};
const disabledStyle = { cursor: "not-allowed", opacity: 0.55 };

function Errors({ errors = [], compact = false }) {
  return errors.length ? (
    <div role="alert" style={{ color: "#a32216" }}>
      {errors.map((error, index) => (
        <p
          key={index}
          style={compact ? { fontSize: 14, margin: 0 } : undefined}
        >
          {getOfficeErrorMessage(error)}
        </p>
      ))}
    </div>
  ) : null;
}

/** Popup shell for the office controls. Pass `actions` to replace the default Done button. */
export function OfficeDialog({ title, onClose, children, actions }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog?.focus({ preventScroll: true });
    // Document-level: a button that disables itself while saving drops focus to <body>.
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    const keepFocusInside = (event) => {
      if (!dialog?.contains(event.target)) dialog?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("focusin", keepFocusInside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("focusin", keepFocusInside);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div
      role="presentation"
      style={overlayStyle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={dialogStyle}
      >
        <h2 id={titleId} style={{ fontSize: 20, margin: 0 }}>
          {title}
        </h2>
        {children}
        <div style={actionsStyle}>
          {actions ?? (
            <button type="button" style={primaryButtonStyle} onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// One row per option. A new option is one more entry here.
const ROUTE_OPTIONS = [
  {
    label: "Require a delivery photo",
    checked: (value) => value.deliveryProof.photoRequired,
    apply: (value, on) => ({
      ...value,
      deliveryProof: { ...value.deliveryProof, photoRequired: on },
    }),
  },
  {
    label: "Require the customer signature",
    checked: (value) => value.deliveryProof.signatureRequired,
    apply: (value, on) => ({
      ...value,
      deliveryProof: { ...value.deliveryProof, signatureRequired: on },
    }),
  },
  {
    label: "Avoid toll roads",
    checked: (value) => value.tollPolicy === "AVOID_TOLLS",
    apply: (value, on) => ({
      ...value,
      tollPolicy: on ? "AVOID_TOLLS" : "ALLOW_TOLLS",
    }),
  },
];

export function RouteOptionsFields({ value, onChange, disabled = false }) {
  return (
    <fieldset
      disabled={disabled}
      aria-label="Route options"
      style={optionListStyle}
    >
      {ROUTE_OPTIONS.map(({ label, checked, apply }, index) => (
        <label
          key={label}
          style={{
            ...optionRowStyle,
            ...(index ? { borderTop: "1px solid #e3e3e3" } : null),
            ...(disabled ? { cursor: "default", opacity: 0.6 } : null),
          }}
        >
          <input
            type="checkbox"
            checked={checked(value)}
            onChange={(event) => onChange(apply(value, event.target.checked))}
            style={{ height: 16, margin: 0, width: 16 }}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function RouteOptionsEditor({ routePlan, onClose }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [searchParams] = useSearchParams();
  const [baseRoute, setBaseRoute] = useState(routePlan);
  const [ignoredResult, setIgnoredResult] = useState(null);
  const result = fetcher.data === ignoredResult ? null : fetcher.data;
  const [draft, setDraft] = useState(() => normalizeRouteOptions(routePlan));
  const [clientError, setClientError] = useState(null);
  const savedRoute =
    result?.routePlan?.id === routePlan.id ? result.routePlan : null;
  useEffect(() => {
    if (savedRoute) setBaseRoute(savedRoute);
  }, [savedRoute]);
  const route = baseRoute;
  const preparingRef = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const busy = fetcher.state !== "idle" || preparing;
  const editable = canEditRouteOptions(route) && canEditRouteOptions(routePlan);
  const action = withEmbeddedShopifyContext(
    `/app/routes/${encodeURIComponent(routePlan.id)}/options`,
    searchParams,
  );
  async function save() {
    if (!editable || busy || preparingRef.current) return;
    preparingRef.current = true;
    setPreparing(true);
    try {
      setClientError(null);
      const form = new FormData();
      form.set("shopifySessionToken", await shopify.idToken());
      form.set("expectedUpdatedAt", route.updatedAt);
      form.set("photoRequired", String(draft.deliveryProof.photoRequired));
      form.set(
        "signatureRequired",
        String(draft.deliveryProof.signatureRequired),
      );
      form.set("tollPolicy", draft.tollPolicy);
      fetcher.submit(form, { method: "post", action });
    } catch {
      setClientError(
        "Could not get the Shopify session. Reload and try again.",
      );
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  }
  return (
    <OfficeDialog
      title="Route options"
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            style={{
              ...dialogButtonStyle,
              marginRight: "auto",
              ...(busy ? disabledStyle : null),
            }}
            disabled={busy}
            onClick={() => {
              setBaseRoute(routePlan);
              setDraft(normalizeRouteOptions(routePlan));
              setIgnoredResult(fetcher.data);
              setClientError(null);
            }}
          >
            Reload saved options
          </button>
          <button type="button" style={dialogButtonStyle} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            style={{
              ...primaryButtonStyle,
              ...(busy || !editable ? disabledStyle : null),
            }}
            disabled={busy || !editable}
            onClick={save}
          >
            {busy ? "Saving…" : "Save options"}
          </button>
        </>
      }
    >
      <RouteOptionsFields
        value={draft}
        onChange={setDraft}
        disabled={busy || !editable}
      />
      <p style={noteStyle}>
        Save these options before assigning or dispatching the route. Saved
        options reach the driver when the route is dispatched.
      </p>
      {!editable ? (
        <p role="status" style={noteStyle}>
          Options are locked after assignment or Dispatch.
        </p>
      ) : null}
      <Errors
        compact
        errors={[
          ...(result?.errors ?? []),
          ...(clientError ? [{ message: clientError }] : []),
        ]}
      />
      {savedRoute &&
      JSON.stringify(normalizeRouteOptions(savedRoute)) ===
        JSON.stringify(draft) &&
      !result?.errors?.length ? (
        <p role="status" style={noteStyle}>
          Route options saved.
        </p>
      ) : null}
    </OfficeDialog>
  );
}

/** Receipts grouped by delivery stop. */
export function cashReceiptsByStopId(receipts = []) {
  const byStop = new Map();
  for (const receipt of receipts) {
    const stopId = receipt.completion.deliveryStopId;
    byStop.set(stopId, [...(byStop.get(stopId) ?? []), receipt]);
  }
  return byStop;
}

/** Receipts of one route. They reload when `reloadKey` changes. */
export function useRouteCashReceipts(routePlanId, { enabled = true, reloadKey = "" } = {}) {
  const shopify = useAppBridge();
  const shopifyRef = useRef(shopify);
  shopifyRef.current = shopify;
  const [searchParams] = useSearchParams();
  const [receipts, setReceipts] = useState([]);
  const [errors, setErrors] = useState([]);
  const controllerRef = useRef(null);
  const action = withEmbeddedShopifyContext(
    `/app/routes/${encodeURIComponent(routePlanId)}/cash-settlements`,
    searchParams,
  );
  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setErrors([]);
    try {
      const token = await shopifyRef.current.idToken();
      if (controller.signal.aborted) return;
      const response = await fetch(action, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || data.errors?.length) {
        if (response.status === 401 || response.status === 403) setReceipts([]);
        throw new Error(
          data.errors?.[0]?.message ??
            "Could not load Cash receipts. Reload the page and try again.",
        );
      }
      if (data.routePlanId !== routePlanId || !Array.isArray(data.receipts))
        throw new Error(
          "Receipt route did not match. Reload the page and try again.",
        );
      setReceipts(data.receipts);
    } catch (error) {
      if (!controller.signal.aborted) setErrors([{ message: error.message }]);
    }
  }, [action, routePlanId]);
  useEffect(() => {
    if (!enabled) {
      setReceipts((current) => (current.length ? [] : current));
      return undefined;
    }
    load();
    return () => controllerRef.current?.abort();
  }, [enabled, load, reloadKey]);
  return { receipts, errors };
}

export function RouteCashSummary({ summary = [] }) {
  if (!summary.length) return <span>—</span>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {summary.map((row) => {
        const receivedDiffers =
          row.expectedAmount != null &&
          normalizeCashAmount(row.expectedAmount) !==
            normalizeCashAmount(row.actualAmount);
        return (
          <div key={row.currency} style={moneyStyle}>
            <span>
              Expected {formatCashAmount(row.expectedAmount, row.currency)}
            </span>
            <span>
              Received {formatCashAmount(row.actualAmount, row.currency)}
            </span>
            {receivedDiffers ? (
              <span style={{ color: "#8a4b08" }}>
                Received differs from expected
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
