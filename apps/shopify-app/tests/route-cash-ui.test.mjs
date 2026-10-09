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

test("the Payment cell shows received Cash, strikes a different expected amount and states confirmation", async () => {
  const { CashCell } = await loadComponents();
  const render = (receipts) => renderToStaticMarkup(createElement(CashCell, { receipts }));
  assert.equal(render(undefined), "");
  assert.equal(render([]), "");
  const unconfirmed = render([receipt("stop-1")]);
  assert.match(unconfirmed, /<s>CAD\s122\.25<\/s>/);
  assert.match(unconfirmed, /<strong>CAD\s122\.00<\/strong>/);
  assert.match(unconfirmed, />Unconfirmed</);
  const same = render([receipt("stop-2", { completion: { expectedAmount: "20.00", actualAmount: "20.00", differenceAmount: "0.00" } })]);
  assert.equal(has(same, /<s>/), false);
  const confirmed = render([receipt("stop-1", { receipt: { revision: 1, settlement: { confirmedAmount: "123.00", currency: "CAD" } } })]);
  assert.match(confirmed, />Confirmed CAD\s123\.00</);
  assert.equal(has(confirmed, />Unconfirmed</), false);
});

test("the office popup needs a title and names it", async () => {
  const { OfficeDialog } = await loadComponents();
  const html = renderToStaticMarkup(createElement(OfficeDialog, { title: "Cash receipt", onClose() {} }, createElement("p", null, "Body")));
  assert.match(html, /<h2[^>]*>Cash receipt<\/h2>/);
  assert.match(html, /role="dialog"/);
});

test("Route Detail has no Cash panel: Cash lives in the Payment cell, the row menu and one popup", () => {
  const components = read("../app/features/delivery/route-office-components.jsx");
  assert.equal(has(components, /RouteCashPanel|Refresh receipts|No Cash receipts recorded|Cash receipts and settlement/), false, "the panel is still in the components");
  assert.equal(has(components, /export function CashReceiptDialog/), true);
  const page = read("../app/routes/app.routes.$routeId.jsx");
  assert.equal(has(page, /RouteCashPanel/), false, "Route Detail still renders the panel");
  assert.equal(has(page, /<CashCell receipts=\{cashByStopId\.get\(row\.deliveryStopId\)\} \/>/), true, "Payment cell does not show Cash");
  assert.equal(has(page, /handleOpenCashReceipt\(activeChildStopActionsRow\)[\s\S]*Cash receipt/), true, "row menu has no Cash receipt item");
  assert.equal(has(page, /<CashReceiptDialog/), true, "Cash popup is not rendered");
  assert.equal(has(page, /\.\.\.cash\.errors/), true, "receipt load errors are not shown");
  assert.equal(has(page, /enabled: kfoodOfficeEnabled && !isRouteGroupDetail && Boolean\(effectiveRoutePlan\?\.id\)/), true, "receipts must load only for a KFood route");
});

test("Edit stop looks disabled when a stop cannot be edited and says why while a route is in progress", () => {
  const page = read("../app/routes/app.routes.$routeId.jsx");
  assert.equal(has(page, /!activeChildStopActionsRow\.deliveryStopId \|\| !canEditStopRow\(activeChildStopActionsRow\) \? \{ cursor: "not-allowed", opacity: 0\.55 \}/), true);
  assert.equal(has(page, /Only future stops can be edited while the route is in progress\./), true);
});
