/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { withEmbeddedShopifyContext } from "./route-paths";
import {
  buildSettlementPayload,
  canEditRouteOptions,
  formatCashAmount,
  normalizeRouteOptions,
  normalizeCashAmount,
  getOfficeErrorMessage,
} from "./route-office-options";

const panelStyle = {
  border: "1px solid #d5d9df",
  borderRadius: 10,
  padding: 16,
  background: "#fff",
  display: "grid",
  gap: 12,
};
const fieldStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
};
const buttonStyle = {
  border: "1px solid #9ba2aa",
  borderRadius: 6,
  padding: "7px 12px",
  background: "#fff",
  cursor: "pointer",
};
const moneyStyle = {
  display: "grid",
  gap: 4,
  fontVariantNumeric: "tabular-nums",
};

function Errors({ errors = [] }) {
  return errors.length ? (
    <div role="alert" style={{ color: "#a32216" }}>
      {errors.map((error, index) => (
        <p key={index}>{getOfficeErrorMessage(error)}</p>
      ))}
    </div>
  ) : null;
}

export function RouteOptionsFields({ value, onChange, disabled = false }) {
  return (
    <fieldset
      disabled={disabled}
      style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 10 }}
    >
      <legend style={{ fontWeight: 600, marginBottom: 10 }}>
        Route options
      </legend>
      <label style={fieldStyle}>
        <input
          type="checkbox"
          checked={value.deliveryProof.photoRequired}
          onChange={(event) =>
            onChange({
              ...value,
              deliveryProof: {
                ...value.deliveryProof,
                photoRequired: event.target.checked,
              },
            })
          }
        />
        Require a delivery photo
      </label>
      <label style={fieldStyle}>
        <input
          type="checkbox"
          checked={value.deliveryProof.signatureRequired}
          onChange={(event) =>
            onChange({
              ...value,
              deliveryProof: {
                ...value.deliveryProof,
                signatureRequired: event.target.checked,
              },
            })
          }
        />
        Require the customer signature
      </label>
      <label style={fieldStyle}>
        <input
          type="checkbox"
          checked={value.tollPolicy === "AVOID_TOLLS"}
          onChange={(event) =>
            onChange({
              ...value,
              tollPolicy: event.target.checked ? "AVOID_TOLLS" : "ALLOW_TOLLS",
            })
          }
        />
        Avoid toll roads
      </label>
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
  async function save(event) {
    event.preventDefault();
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
    <section aria-label="Edit route options" style={panelStyle}>
      <form onSubmit={save} style={{ display: "grid", gap: 12 }}>
        <RouteOptionsFields
          value={draft}
          onChange={setDraft}
          disabled={busy || !editable}
        />
        <p style={{ margin: 0, color: "#59616b" }}>
          Save these options before assigning or dispatching the route. Saved
          options reach the driver when the route is dispatched.
        </p>
        {!editable ? (
          <p role="status">Options are locked after assignment or Dispatch.</p>
        ) : null}
        <Errors
          errors={[
            ...(result?.errors ?? []),
            ...(clientError ? [{ message: clientError }] : []),
          ]}
        />
        {savedRoute &&
        JSON.stringify(normalizeRouteOptions(savedRoute)) ===
          JSON.stringify(draft) &&
        !result?.errors?.length ? (
          <p role="status">Route options saved.</p>
        ) : null}
        <div style={fieldStyle}>
          <button
            type="submit"
            style={buttonStyle}
            disabled={busy || !editable}
          >
            {busy ? "Saving…" : "Save options"}
          </button>
          <button
            type="button"
            style={buttonStyle}
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
          <button type="button" style={buttonStyle} onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </section>
  );
}

export function CashAmounts({ completion, settlement }) {
  const currency = completion.currencyCode;
  const differs =
    completion.differenceAmount != null &&
    Number(completion.differenceAmount) !== 0;
  return (
    <div style={moneyStyle}>
      <span>
        Expected:{" "}
        {differs ? (
          <s>{formatCashAmount(completion.expectedAmount, currency)}</s>
        ) : (
          formatCashAmount(completion.expectedAmount, currency)
        )}
      </span>
      <strong>
        Received: {formatCashAmount(completion.actualAmount, currency)}
      </strong>
      <span>
        Difference: {formatCashAmount(completion.differenceAmount, currency)}
      </span>
      <span>
        Office confirmed:{" "}
        {settlement
          ? formatCashAmount(settlement.confirmedAmount, settlement.currency)
          : "Unconfirmed"}
      </span>
    </div>
  );
}

function CashReceipt({ receipt, stopLabel, action, onSaved }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const attempt = useRef(null);
  const seen = useRef(null);
  const [amount, setAmount] = useState(
    receipt.settlement?.confirmedAmount ??
      receipt.completion.actualAmount ??
      "",
  );
  const [reason, setReason] = useState("");
  const [clientError, setClientError] = useState(null);
  const preparingRef = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const busy = fetcher.state !== "idle" || preparing;
  useEffect(() => {
    if (fetcher.data?.saved && seen.current !== fetcher.data) {
      seen.current = fetcher.data;
      onSaved();
    }
  }, [fetcher.data, onSaved]);
  async function confirm(event) {
    event.preventDefault();
    if (busy || preparingRef.current) return;
    preparingRef.current = true;
    setPreparing(true);
    try {
      setClientError(null);
      const input = {
        receiptId: receipt.completion.id,
        expectedRevision: receipt.revision,
        confirmedAmount: amount,
        currency: receipt.completion.currencyCode,
        reason,
      };
      const key = JSON.stringify(input);
      if (attempt.current?.key !== key)
        attempt.current = { key, commandId: crypto.randomUUID() };
      const payload = buildSettlementPayload({
        ...input,
        commandId: attempt.current.commandId,
      });
      const form = new FormData();
      for (const [key, value] of Object.entries(payload))
        if (value !== null) form.set(key, String(value));
      form.set("shopifySessionToken", await shopify.idToken());
      fetcher.submit(form, { method: "post", action });
    } catch (error) {
      setClientError(error.message ?? "Could not confirm this receipt.");
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  }
  return (
    <article style={{ ...panelStyle, background: "#fafbfc" }}>
      <strong>
        {stopLabel} · {receipt.completion.payment?.methodTitle ?? "Cash"}
      </strong>
      <CashAmounts
        completion={receipt.completion}
        settlement={receipt.settlement}
      />
      <form onSubmit={confirm} style={{ display: "grid", gap: 10 }}>
        <label style={fieldStyle}>
          Office confirmed amount ({receipt.completion.currencyCode})
          <input
            aria-label={`Office confirmed amount for ${stopLabel}`}
            value={amount}
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            disabled={busy}
            required
            style={{ width: 110, padding: 6 }}
          />
        </label>
        <label style={fieldStyle}>
          Reason{" "}
          {receipt.revision > 0 ? "(required for a correction)" : "(optional)"}
          <input
            aria-label={`Settlement reason for ${stopLabel}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
            required={receipt.revision > 0}
            maxLength={1000}
            style={{ flex: 1, minWidth: 100, padding: 6 }}
          />
        </label>
        <Errors
          errors={[
            ...(fetcher.data?.errors ?? []),
            ...(clientError ? [{ message: clientError }] : []),
          ]}
        />
        <button
          style={{ ...buttonStyle, justifySelf: "start" }}
          type="submit"
          disabled={busy || !Number.isSafeInteger(receipt.revision)}
        >
          {busy
            ? "Saving…"
            : receipt.revision > 0
              ? "Record correction"
              : "Confirm Cash amount"}
        </button>
      </form>
      {receipt.history?.length ? (
        <details>
          <summary>Confirmation history ({receipt.history.length})</summary>
          <ol>
            {receipt.history.map((entry) => (
              <li key={entry.id}>
                {formatCashAmount(entry.confirmedAmount, entry.currency)} ·{" "}
                {entry.recordedAt} ·{" "}
                {typeof entry.actor === "string"
                  ? entry.actor
                  : (entry.actor?.displayName ?? entry.actor?.id ?? "Office")}
                {entry.reason ? ` · ${entry.reason}` : ""}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </article>
  );
}

export function RouteCashPanel({ routePlanId, stops = [] }) {
  const shopify = useAppBridge();
  const shopifyRef = useRef(shopify);
  shopifyRef.current = shopify;
  const [searchParams] = useSearchParams();
  const [receipts, setReceipts] = useState([]);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef(null);
  const action = withEmbeddedShopifyContext(
    `/app/routes/${encodeURIComponent(routePlanId)}/cash-settlements`,
    searchParams,
  );
  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
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
            "Could not load Cash receipts. Refresh and try again.",
        );
      }
      if (data.routePlanId !== routePlanId || !Array.isArray(data.receipts))
        throw new Error("Receipt route did not match. Refresh and try again.");
      setReceipts(data.receipts);
    } catch (error) {
      if (!controller.signal.aborted) setErrors([{ message: error.message }]);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [action, routePlanId]);
  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);
  return (
    <section aria-label="Cash receipts and settlement" style={panelStyle}>
      <div style={{ ...fieldStyle, justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>
          Cash receipts and settlement
        </h2>
        <button
          style={buttonStyle}
          type="button"
          disabled={busy}
          onClick={load}
        >
          {busy ? "Refreshing…" : "Refresh receipts"}
        </button>
      </div>
      <p style={{ margin: 0, color: "#59616b" }}>
        Driver receipts stay unchanged. Office confirmations and corrections are
        recorded separately.
      </p>
      <Errors errors={errors} />
      {receipts.length === 0 && !busy && !errors.length ? (
        <p>No Cash receipts recorded.</p>
      ) : null}
      {receipts.map((receipt) => {
        const stop = stops.find(
          (stop) =>
            stop.deliveryStopId === receipt.completion.deliveryStopId ||
            stop.id === receipt.completion.deliveryStopId,
        );
        const label =
          stop?.orderName ??
          stop?.order ??
          stop?.recipientName ??
          `Stop ${stops.indexOf(stop) + 1 || receipt.completion.deliveryStopId}`;
        return (
          <CashReceipt
            key={`${receipt.completion.id}:${receipt.revision}`}
            receipt={receipt}
            stopLabel={label}
            action={action}
            onSaved={load}
          />
        );
      })}
    </section>
  );
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
        const confirmedDiffers =
          row.confirmedCount === row.receiptCount &&
          row.confirmedCount > 0 &&
          normalizeCashAmount(row.confirmedAmount) !==
            normalizeCashAmount(row.actualAmount);
        return (
          <div key={row.currency} style={moneyStyle}>
            <span>
              Expected {formatCashAmount(row.expectedAmount, row.currency)}
            </span>
            <span>
              Received {formatCashAmount(row.actualAmount, row.currency)}
            </span>
            <strong>
              {row.confirmedCount === 0
                ? "Unconfirmed"
                : row.confirmedCount === row.receiptCount
                  ? "Confirmed"
                  : "Part confirmed"}{" "}
              ({row.confirmedCount}/{row.receiptCount})
              {row.confirmedCount
                ? `: ${formatCashAmount(row.confirmedAmount, row.currency)}`
                : ""}
            </strong>
            {receivedDiffers ? (
              <span style={{ color: "#8a4b08" }}>
                Received differs from expected
              </span>
            ) : null}
            {confirmedDiffers ? (
              <span style={{ color: "#8a4b08" }}>
                Confirmation differs from received
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
