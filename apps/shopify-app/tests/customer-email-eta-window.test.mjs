/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import { saveCustomerEmailGlobal } from "../app/features/customer-notifications/customer-email.server.js";
import {
  formatPreviewEtaWindow,
  normalizeEtaWindow,
  readEtaWindowFormValues,
} from "../app/features/customer-notifications/eta-window.js";
import { translate } from "../app/i18n/i18n.js";

process.env.CLEVER_DELIVERY_API_URL = "https://delivery.test";
process.env.CLEVER_APP_ID = "clever-route-dev";

test("preview window follows the chosen direction around the 2:30 PM example ETA", () => {
  assert.equal(formatPreviewEtaWindow({ direction: "AROUND", minutes: 30 }), "Aug 5, 2026, 2:00 PM AEST - Aug 5, 2026, 3:00 PM AEST");
  assert.equal(formatPreviewEtaWindow({ direction: "BEFORE", minutes: 45 }), "Aug 5, 2026, 1:45 PM AEST - Aug 5, 2026, 2:30 PM AEST");
  assert.equal(formatPreviewEtaWindow({ direction: "AFTER", minutes: 60 }), "Aug 5, 2026, 2:30 PM AEST - Aug 5, 2026, 3:30 PM AEST");
});

test("loaded settings without etaWindow fall back to the server default AROUND 30", () => {
  assert.deepEqual(normalizeEtaWindow(undefined), { direction: "AROUND", minutes: 30 });
  assert.deepEqual(normalizeEtaWindow({ direction: "AFTER", minutes: 90 }), { direction: "AFTER", minutes: 90 });
});

test("out-of-range minutes are sent as typed so the server 400 is shown", () => {
  assert.deepEqual(readEtaWindowFormValues("BEFORE", "1"), { direction: "BEFORE", minutes: 1 });
  assert.deepEqual(readEtaWindowFormValues("AROUND", ""), { direction: "AROUND", minutes: null });
});

test("global save sends etaWindow and returns the server 400 message", async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ init, url });
    return {
      json: async () => ({ data: null, error: { code: "VALIDATION_ERROR", message: "etaWindow.minutes must be between 5 and 240." } }),
      ok: false,
      status: 400,
    };
  };
  const result = await saveCustomerEmailGlobal(new Request("https://admin.shopify.test/app/settings"), {
    etaWindow: { direction: "BEFORE", minutes: 1 },
    senderName: "CLEVER",
  }, { fetch, sessionToken: "token" });

  assert.equal(calls[0].url, "https://delivery.test/admin/customer-email/settings/global");
  assert.deepEqual(JSON.parse(calls[0].init.body).etaWindow, { direction: "BEFORE", minutes: 1 });
  assert.match(result.errors[0].message, /etaWindow\.minutes/u);
});

test("direction labels exist in English and Korean", () => {
  for (const direction of ["AROUND", "BEFORE", "AFTER"]) {
    const key = `notifications.etaWindow.direction.${direction}`;
    assert.notEqual(translate("en", key), key);
    assert.notEqual(translate("ko", key), translate("en", key));
  }
});
