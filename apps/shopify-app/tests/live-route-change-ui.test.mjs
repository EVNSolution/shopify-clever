import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function load(entry, name) {
  const bundle = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
  });
  const path = new URL(`../.${name}-test.mjs`, import.meta.url);
  await writeFile(path, bundle.outputFiles[0].text);
  try {
    return await import(path.href);
  } finally {
    await unlink(path);
  }
}
const ui = () => load("app/features/delivery/live-route-change-ui.jsx", "live-ui");
const hook = () => load("app/features/delivery/use-live-route-change.js", "live-hook");
const render = (component, props) => renderToStaticMarkup(createElement(component, props));

const baseLive = (text, overrides = {}) => ({
  enabled: true,
  ready: true,
  routeInProgress: true,
  text,
  busy: "",
  locked: false,
  localDirty: true,
  privateDirty: false,
  locationIssues: [],
  searchState: {},
  errorCode: "",
  errorMessage: "",
  state: { error: null, needsReview: false, pending: null, discardConfirm: false, fresh: null },
  valuesFor: () => ({ address1: "8 Road", address2: "", city: "Toronto", province: "ON", postalCode: "M5V", countryCode: "CA", latitude: "43.7", longitude: "-79.4" }),
  ...overrides,
});

test("English and Korean labels cover the same messages", async () => {
  const { liveLabels } = await hook();
  assert.deepEqual(Object.keys(liveLabels.ko).sort(), Object.keys(liveLabels.en).sort());
});

test("a conflict shows one banner with the code and a single review action", async () => {
  const [{ LiveChangeNotices }, { liveLabels }] = await Promise.all([ui(), hook()]);
  const text = liveLabels.en;
  const html = render(LiveChangeNotices, {
    onReview() {},
    live: baseLive(text, {
      errorCode: "REVISION_CONFLICT",
      errorMessage: text.conflict,
      state: { error: { code: "REVISION_CONFLICT" }, needsReview: true, pending: null, discardConfirm: false, fresh: null },
    }),
  });
  assert.ok(html.includes(text.conflict));
  assert.ok(html.includes("REVISION_CONFLICT"));
  assert.equal(html.split(text.reviewAction).length - 1, 1);
  assert.equal(html.includes(text.review), false);
});

test("unknown outcomes offer retry without repeating the transport error", async () => {
  const [{ LiveChangeNotices }, { liveLabels }] = await Promise.all([ui(), hook()]);
  const text = liveLabels.en;
  const html = render(LiveChangeNotices, {
    onReview() {},
    live: baseLive(text, {
      errorCode: "UPSTREAM_RESPONSE_UNAVAILABLE",
      errorMessage: "Transport error",
      state: { error: { code: "UPSTREAM_RESPONSE_UNAVAILABLE" }, needsReview: false, pending: { unknown: true }, discardConfirm: false, fresh: null },
    }),
  });
  assert.ok(html.includes(text.unknown));
  assert.ok(html.includes(text.retry));
  assert.equal(html.includes("Transport error"), false);
  const delivery = render(LiveChangeNotices, {
    onReview() {},
    live: baseLive(text, { state: { error: null, needsReview: false, pending: { unknown: false }, discardConfirm: false, fresh: null } }),
  });
  assert.ok(delivery.includes(text.retryDelivery));
});

test("nothing renders until the route is loaded; a stopped route explains preserved input", async () => {
  const [{ LiveChangeNotices }, { liveLabels }] = await Promise.all([ui(), hook()]);
  const text = liveLabels.en;
  assert.equal(render(LiveChangeNotices, { live: baseLive(text, { ready: false }), onReview() {} }), "");
  assert.equal(render(LiveChangeNotices, { live: baseLive(text, { enabled: false }), onReview() {} }), "");
  assert.ok(render(LiveChangeNotices, { live: baseLive(text, { routeInProgress: false }), onReview() {} }).includes(text.stopped));
  assert.equal(render(LiveChangeNotices, { live: baseLive(text, { routeInProgress: false, localDirty: false }), onReview() {} }), "");
});

test("the stop dialog requires confirmed coordinates and locks while busy", async () => {
  const [{ LiveStopEditDialog }, { liveLabels }] = await Promise.all([ui(), hook()]);
  const text = liveLabels.en;
  const stop = { deliveryStopId: "stop-8", order: "#SYN-008", recipient: "Synthetic recipient 8" };
  const unconfirmed = render(LiveStopEditDialog, { stop, onClose() {}, live: baseLive(text, { locationIssues: ["stop-8"] }) });
  assert.ok(unconfirmed.includes(text.unverified));
  assert.match(unconfirmed, /<button(?![^>]*disabled)[^>]*>Confirm checked coordinates<\/button>/);
  const noCoordinates = render(LiveStopEditDialog, {
    stop,
    onClose() {},
    live: baseLive(text, { locationIssues: ["stop-8"], valuesFor: () => ({ address1: "8 Road", address2: "", city: "", province: "", postalCode: "", countryCode: "", latitude: "", longitude: "" }) }),
  });
  assert.match(noCoordinates, /<button[^>]*disabled[^>]*>Confirm checked coordinates<\/button>/);
  assert.equal(unconfirmed.includes(text.verified), false);
  const confirmed = render(LiveStopEditDialog, { stop, onClose() {}, live: baseLive(text) });
  assert.ok(confirmed.includes(text.verified));
  assert.equal(confirmed.includes(text.unverified), false);
  const locked = render(LiveStopEditDialog, { stop, onClose() {}, live: baseLive(text, { locked: true }) });
  assert.equal((locked.match(/<input[^>]*disabled=""/g) ?? []).length, 8);
});

test("discard asks for confirmation before it removes every saved change", async () => {
  const [{ LiveDiscardDialog }, { liveLabels }] = await Promise.all([ui(), hook()]);
  const text = liveLabels.en;
  assert.equal(render(LiveDiscardDialog, { live: baseLive(text) }), "");
  const html = render(LiveDiscardDialog, {
    live: baseLive(text, { state: { error: null, needsReview: false, pending: null, discardConfirm: true, fresh: null } }),
  });
  assert.ok(html.includes(text.discardWarning));
  assert.ok(html.includes(text.confirmDiscard));
  assert.match(html, /another office user/);
});

test("Route Detail no longer renders a separate panel and drags only future stops", () => {
  const page = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
  const has = (pattern) => pattern.test(page);
  assert.equal(has(/LiveRouteChangeEditor|live-route-change-editor/), false, "the panel is still referenced");
  assert.equal(has(/Future delivery changes/), false, "panel copy is still present");
  assert.equal((page.match(/canDragTimelineStop\(routeRow, stop\)/g) ?? []).length >= 4, true, "both timelines must use the future-stop rule");
  assert.equal(has(/liveOrderKeepsFixedStops\(/), true, "dragging must keep fixed stops in place");
});
