import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const has = (source, pattern) => pattern.test(source);

async function loadComponents() {
  const bundle = await build({
    entryPoints: ["app/features/delivery/route-office-components.jsx"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
  });
  const path = new URL("../.route-cash-ui-test.mjs", import.meta.url);
  await writeFile(path, bundle.outputFiles[0].text);
  try {
    return await import(path.href);
  } finally {
    await unlink(path);
  }
}

const receipt = (stopId, overrides = {}) => ({
  completion: {
    id: `receipt-${stopId}`,
    deliveryStopId: stopId,
    currencyCode: "CAD",
    expectedAmount: "122.25",
    actualAmount: "122.00",
    differenceAmount: "-0.25",
    ...overrides.completion,
  },
  revision: 0,
  settlement: null,
  history: [],
  ...overrides.receipt,
});

test("receipts are grouped by delivery stop and every receipt of a stop is kept", async () => {
  const { cashReceiptsByStopId } = await loadComponents();
  const first = receipt("stop-1");
  const second = receipt("stop-1", { completion: { id: "receipt-stop-1-b" } });
  const other = receipt("stop-2");
  const byStop = cashReceiptsByStopId([first, other, second]);
  assert.deepEqual(byStop.get("stop-1"), [first, second]);
  assert.deepEqual(byStop.get("stop-2"), [other]);
  assert.equal(byStop.get("stop-3"), undefined);
  assert.equal(cashReceiptsByStopId().size, 0);
});

test("the office popup needs a title and names it", async () => {
  const { OfficeDialog } = await loadComponents();
  const html = renderToStaticMarkup(createElement(OfficeDialog, { title: "Cash receipt", onClose() {} }, createElement("p", null, "Body")));
  assert.match(html, /<h2[^>]*>Cash receipt<\/h2>/);
  assert.match(html, /role="dialog"/);
});

test("Route Detail has no Cash panel, popup or confirmation: received Cash only shows in the Amount column", () => {
  const components = read("../app/features/delivery/route-office-components.jsx");
  assert.equal(has(components, /RouteCashPanel|Refresh receipts|No Cash receipts recorded|Cash receipts and settlement/), false, "the panel is still in the components");
  assert.equal(has(components, /CashReceiptDialog|CashAmounts|Confirm Cash amount|buildSettlementPayload/), false, "the confirmation UI is still in the components");
  const page = read("../app/routes/app.routes.$routeId.jsx");
  assert.equal(has(page, /RouteCashPanel|CashReceiptDialog|handleOpenCashReceipt|cashDialogStopId|Cash receipt|Confirm Cash/), false, "Route Detail still has the receipt popup or confirmation");
  assert.equal(has(page, /renderChildRouteAmount\(row, cashByStopId\.get\(row\.deliveryStopId\)\)/), true, "Amount cell does not show Cash");
  assert.equal(has(page, /<td style=\{childRouteOrderCellStyle\}>\{row\.payment\}<\/td>/), true, "Payment cell is not plain");
  assert.equal(has(page, /\.\.\.cash\.errors/), true, "receipt load errors are not shown");
  assert.equal(has(page, /enabled: kfoodOfficeEnabled && !isRouteGroupDetail && Boolean\(effectiveRoutePlan\?\.id\)/), true, "receipts must load only for a KFood route");
});

test("the Routes list Cash column shows expected and received amounts only", async () => {
  const { RouteCashSummary } = await loadComponents();
  const html = renderToStaticMarkup(createElement(RouteCashSummary, {
    summary: [{ currency: "CAD", expectedAmount: "122.25", actualAmount: "122.00", confirmedAmount: "122.00", receiptCount: 2, confirmedCount: 1 }],
  }));
  assert.match(html, /Expected CAD\s122\.25/);
  assert.match(html, /Received CAD\s122\.00/);
  assert.match(html, /Received differs from expected/);
  assert.equal(has(html, /onfirm/), false, "the summary still talks about confirmation");
  assert.equal(renderToStaticMarkup(createElement(RouteCashSummary, { summary: [] })), "<span>—</span>");
  assert.match(read("../app/routes/app.routes.jsx"), />Cash<\/th>/);
  assert.equal(has(read("../app/routes/app.routes.jsx"), /Cash \/ settlement/), false);
});

test("nothing in the app confirms a Cash receipt: the BFF route only reads receipts", () => {
  const bff = read("../app/routes/app.routes.$routeId.cash-settlements.jsx");
  assert.equal(has(bff, /export async function loader/), true, "the Amount column needs the receipts read");
  assert.equal(has(bff, /export async function action|confirmRouteCashSettlement|buildSettlementPayload/), false, "the BFF route still confirms receipts");
  assert.equal(has(read("../app/features/delivery/route-office-options.server.js"), /confirmRouteCashSettlement/), false);
  assert.equal(has(read("../app/features/delivery/route-office-options.js"), /buildSettlementPayload/), false);
});

test("Edit stop looks disabled when a stop cannot be edited and says why while a route is in progress", () => {
  const page = read("../app/routes/app.routes.$routeId.jsx");
  assert.equal(has(page, /!activeChildStopActionsRow\.deliveryStopId \|\| !canEditStopRow\(activeChildStopActionsRow\) \? \{ cursor: "not-allowed", opacity: 0\.55 \}/), true);
  assert.equal(has(page, /Only future stops can be edited while the route is in progress\./), true);
});
