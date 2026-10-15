/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import {
  describeStopEmailHistoryEvent,
  formatStopEmailHistoryTime,
  groupStopEmailHistory,
} from "../app/features/customer-notifications/stop-email-history.js";
import { fetchStopCustomerEmailHistory } from "../app/features/customer-notifications/customer-email.server.js";

const sent = { at: "2026-10-14T13:30:00.000Z", errorMessage: null, providerStatus: "hard_bounce", recipientEmail: "a@example.com", signal: "DELIVERY_SCHEDULED", source: "MANUAL", status: "SENT" };
const failed = { at: "2026-10-15T14:00:00.000Z", errorMessage: "Provider refused", providerStatus: null, recipientEmail: "a@example.com", signal: "OUT_FOR_DELIVERY", source: "AUTOMATIC", status: "FAILED" };

test("history groups every email in route order and keeps each send", () => {
  const groups = groupStopEmailHistory([sent, { ...sent, at: "2026-10-13T13:30:00.000Z" }, failed]);
  assert.deepEqual(groups.map((group) => [group.label, group.events.length]), [
    ["Delivery scheduled", 2],
    ["Out for delivery", 1],
    ["Driver is nearby", 0],
    ["Delivered", 0],
    ["Missed delivery", 0],
  ]);
  assert.deepEqual(groupStopEmailHistory(undefined).map((group) => group.events.length), [0, 0, 0, 0, 0]);
});

test("history times use the route timezone and the email date style", () => {
  assert.equal(formatStopEmailHistoryTime(sent.at, "America/Toronto"), "Wed, Oct 14, 9:30 AM EDT");
  assert.equal(formatStopEmailHistoryTime("not a date", "America/Toronto"), "Unknown time");
  assert.match(formatStopEmailHistoryTime(sent.at, "Not/AZone"), /Oct 14/);
  assert.deepEqual(describeStopEmailHistoryEvent(sent, "America/Toronto"), {
    detail: "Wed, Oct 14, 9:30 AM EDT — a@example.com — Manual — Hard bounce",
    error: null,
    status: "Sent",
  });
  assert.deepEqual(describeStopEmailHistoryEvent(failed, "America/Toronto"), {
    detail: "Thu, Oct 15, 10:00 AM EDT — a@example.com — Automatic",
    error: "Provider refused",
    status: "Failed",
  });
});

test("history dialog shows sent rows, Not sent rows, and a retry on load errors", () => {
  const source = readFileSync(new URL("../app/features/customer-notifications/stop-email-history-dialog.jsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", "require", "React", compiled)(module.exports, module, (name) => {
    if (name === "./stop-email-history") return { describeStopEmailHistoryEvent, groupStopEmailHistory };
    throw new Error(`unexpected import ${name}`);
  }, React);
  const { StopEmailHistoryDialog } = module.exports;
  const render = (props) => renderToStaticMarkup(React.createElement(StopEmailHistoryDialog, { onClose() {}, onRetry() {}, ...props }));

  const html = render({ errors: [], history: { events: [sent], timezone: "America/Toronto" }, loading: false, orderLabel: "#2336" });
  assert.match(html, /Notification history — Order #2336/);
  assert.match(html, /Delivery scheduled.*Sent.*Wed, Oct 14, 9:30 AM EDT — a@example.com — Manual/);
  assert.equal((html.match(/Not sent/g) ?? []).length, 4);
  assert.match(render({ errors: [{ message: "down" }], history: null, loading: false }), /Could not load the notification history.*Retry/);
  assert.match(render({ errors: [], history: null, loading: true }), /Loading…/);
});

test("history request reads the stop endpoint and refuses missing IDs", async () => {
  const previous = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  try {
    const calls = [];
    const history = { events: [sent], timezone: "America/Toronto" };
    const result = await fetchStopCustomerEmailHistory(new Request("https://app.test/app/routes/route-1"), "route 1", "stop/1", {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({ data: history, error: null }), { headers: { "content-type": "application/json" }, status: 200 });
      },
      sessionToken: "session-token",
    });
    assert.equal(calls[0].url, "https://delivery.example/admin/route-plans/route%201/stops/stop%2F1/customer-email/history");
    assert.equal(calls[0].options.method, "GET");
    assert.deepEqual(result, { errors: [], history });
    const missing = await fetchStopCustomerEmailHistory(new Request("https://app.test"), "route-1", "", { fetch: () => assert.fail("no request") });
    assert.equal(missing.history, null);
    assert.equal(missing.errors.length, 1);
  } finally {
    if (previous === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previous;
  }
});

test("each stop's actions menu opens its notification history without reloading the route", () => {
  const page = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  const action = readFileSync(new URL("../app/features/delivery/route-detail.server.js", import.meta.url), "utf8");
  assert.match(page, /onClick=\{\(\) => handleOpenStopEmailHistory\(activeChildStopActionsRow\)\}[\s\S]*?View notification history/);
  assert.match(page, /formData\.set\("routePlanId", row\.routePlanId \?\? effectiveRoutePlan\?\.id \?\? ""\)/);
  assert.match(page, /intent === "previewCustomerEmail" \|\| intent === "loadStopEmailHistory"\) return false/);
  assert.match(action, /intent === "loadStopEmailHistory"[\s\S]*fetchStopCustomerEmailHistory\(/);
});
