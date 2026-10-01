#!/usr/bin/env node
/* eslint-env node */

import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromApp = createRequire(path.join(appRoot, "package.json"));
const { build } = requireFromApp("esbuild");
const portIndex = process.argv.indexOf("--port");
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 4179);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid port: ${port}`);
}

const source = String.raw`
  import React, { useEffect, useMemo, useState } from "react";
  import { createRoot } from "react-dom/client";
  import { OrderFilterBar } from "./app/features/orders/order-filter-bar.jsx";
  import { normalizeV2Filters, V2_OPTIONS } from "./app/features/orders/order-filters-v2.js";

  const initialFilters = normalizeV2Filters({
    scheduledDateFrom: "2026-10-02",
    scheduledDateTo: "2026-10-04",
    areas: ["Toronto", "North York"],
    paymentStatuses: ["PENDING"],
    serviceTypes: ["DELIVERY"],
    search: "Friday delivery",
  });
  const groups = ["serviceTypes", "deliveryProgress", "fulfillmentStatuses", "paymentStatuses"];
  const makeFacets = (version) => Object.fromEntries([
    ...groups.map((key) => [key, V2_OPTIONS[key].map(([value], index) => ({
      value,
      count: Math.max(0, 16 - index * 3 - version * 2),
    }))]),
    ["areas", [
      { value: "Toronto", count: version ? 3 : 14 },
      { value: "North York", count: version ? 8 : 7 },
      { value: "Scarborough", count: version ? 0 : 4 },
      { value: "Etobicoke", count: version ? 6 : 2 },
      { value: "__MISSING__", count: version ? 1 : 5 },
    ]],
  ]);

  const rect = (node) => {
    if (!node) return null;
    const value = node.getBoundingClientRect();
    return ["top", "left", "bottom", "right", "width", "height"].reduce((result, key) => {
      result[key] = Number(value[key].toFixed(1));
      return result;
    }, {});
  };

  function Diagnostics() {
    const [trace, setTrace] = useState([]);
    useEffect(() => {
      const samples = [];
      const pendingEvents = [];
      let frame = 0;
      let lastSignature = "";
      const describe = (node) => node?.getAttribute?.("aria-label") || node?.textContent?.trim().slice(0, 50) || node?.tagName || null;
      const onScroll = (event) => pendingEvents.push("scroll:" + (event.target === document ? "document" : describe(event.target)));
      const onFocus = (event) => pendingEvents.push("focusin:" + describe(event.target));
      const publishScenario = () => setTrace([...samples]);
      window.__orderFilterDiagnostics = {
        samples,
        clear() { samples.length = 0; setTrace([]); },
        latest() { return samples.at(-1) || null; },
      };
      document.addEventListener("scroll", onScroll, true);
      document.addEventListener("focusin", onFocus, true);
      window.addEventListener("fixture-scenario", publishScenario);
      const sample = (now) => {
        const toolbar = document.querySelector('[data-filter-toolbar]');
        const dialog = document.querySelector('[role="dialog"]');
        const focused = document.activeElement;
        const dialogLabel = dialog?.getAttribute("aria-label");
        const trigger = dialogLabel
          ? [...document.querySelectorAll("button[aria-label]")].find((node) =>
              node.getAttribute("aria-label")?.startsWith(dialogLabel + ":"),
            ) || document.querySelector('s-button[commandfor="orders-v2-add-filter"]')
          : document.querySelector('s-button[commandfor="orders-v2-add-filter"]');
        const computed = dialog ? getComputedStyle(dialog) : null;
        const value = {
          t: Math.round(now),
          events: pendingEvents.splice(0),
          scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
          toolbar: toolbar ? { left: toolbar.scrollLeft, top: toolbar.scrollTop, bounds: rect(toolbar) } : null,
          trigger: rect(trigger),
          dialog: dialog ? {
            label: dialog.getAttribute("aria-label"),
            bounds: rect(dialog),
            style: { position: computed.position, top: computed.top, left: computed.left, transform: computed.transform },
            scrollHeight: dialog.scrollHeight,
            clientHeight: dialog.clientHeight,
          } : null,
          focused: focused ? focused.getAttribute("aria-label") || focused.textContent?.trim().slice(0, 50) || focused.tagName : null,
        };
        const signature = JSON.stringify(value, (key, item) => key === "t" ? undefined : item);
        if (signature !== lastSignature) {
          samples.push(value);
          if (samples.length > 100) samples.shift();
          setTrace([...samples]);
          lastSignature = signature;
        }
        frame = requestAnimationFrame(sample);
      };
      frame = requestAnimationFrame(sample);
      return () => {
        cancelAnimationFrame(frame);
        document.removeEventListener("scroll", onScroll, true);
        document.removeEventListener("focusin", onFocus, true);
        window.removeEventListener("fixture-scenario", publishScenario);
      };
    }, []);
    return <pre className="diagnostics">{JSON.stringify({
      scenario: window.__orderFilterScenario || null,
      samples: trace.slice(-12),
    }, null, 2)}</pre>;
  }

  function Fixture() {
    const [filters, setFilters] = useState(initialFilters);
    const [facetVersion, setFacetVersion] = useState(0);
    const [regression, setRegression] = useState(null);
    const facets = useMemo(() => makeFacets(facetVersion), [facetVersion]);
    const toolbar = () => document.querySelector('[data-filter-toolbar]');
    const position = (block) => document.getElementById("filter-card")?.scrollIntoView({ block, behavior: "instant" });
    const deepActiveElement = () => {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return active;
    };
    const focusSnapshot = () => ({
      host: document.activeElement?.tagName || null,
      hostLabel: document.activeElement?.getAttribute?.("aria-label") || document.activeElement?.textContent?.trim().slice(0, 50) || null,
      leaf: deepActiveElement()?.tagName || null,
      leafLabel: deepActiveElement()?.getAttribute?.("aria-label") || deepActiveElement()?.textContent?.trim().slice(0, 50) || null,
    });
    const hasFocusWithin = (node) => Boolean(node && (
      document.activeElement === node ||
      node.contains?.(document.activeElement) ||
      node.shadowRoot?.contains(deepActiveElement()) ||
      node.matches?.(":focus-within")
    ));
    const scenarioSnapshot = () => {
      const trigger = document.querySelector('[aria-label^="Delivery date:"]');
      return {
        window: { x: window.scrollX, y: window.scrollY, width: window.innerWidth, height: window.innerHeight },
        toolbar: { left: toolbar()?.scrollLeft, top: toolbar()?.scrollTop, bounds: rect(toolbar()) },
        trigger: rect(trigger),
        dialog: rect(document.querySelector('[role="dialog"]')),
        focus: focusSnapshot(),
      };
    };
    const publishScenarioAfterFrame = () => requestAnimationFrame(() => {
      window.__orderFilterScenario.after = scenarioSnapshot();
      window.dispatchEvent(new Event("fixture-scenario"));
    });
    const openDelivery = (block) => {
      position(block);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const trigger = document.querySelector('[aria-label^="Delivery date:"]');
        window.__orderFilterScenario = {
          name: "open-delivery-" + block,
          before: scenarioSnapshot(),
        };
        trigger?.click();
        publishScenarioAfterFrame();
      }));
    };
    const closeWithoutScrolling = () => {
      window.__orderFilterScenario = { name: "close-without-scrolling", before: scenarioSnapshot() };
      document.querySelector('[aria-label="Close filter"]')?.click();
      publishScenarioAfterFrame();
    };
    const finishEditor = (action) => {
      window.__orderFilterScenario = { name: action, before: scenarioSnapshot() };
      if (action === "Escape") {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } else {
        [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent === action)?.click();
      }
      publishScenarioAfterFrame();
    };
    const runRegression = async () => {
      const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const results = [];
      const clickButton = (root, label) => {
        const button = [...root.querySelectorAll("button")].find((node) => node.textContent === label);
        if (!button) throw new Error("Missing scenario button: " + label);
        button.click();
      };
      setRegression({ running: true });
      try {
        for (const action of ["open", "close", "Escape", "No date", "Clear filter", "Clear all"]) {
          document.querySelector('[aria-label="Close filter"]')?.click();
          setFilters(initialFilters);
          await settle();
          window.scrollTo(0, 0);
          toolbar().scrollLeft = 0;
          await settle();
          const trigger = document.querySelector('[aria-label^="Delivery date:"]');
          if (action !== "open") { trigger.click(); await settle(); window.scrollTo(0, 0); await settle(); }
          const before = scenarioSnapshot();
          if (action === "open") trigger.click();
          else if (action === "close") document.querySelector('[aria-label="Close filter"]').click();
          else if (action === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          else clickButton(action === "Clear all" ? toolbar() : document.querySelector('[role="dialog"]'), action);
          await settle();
          const after = scenarioSnapshot();
          const dialog = document.querySelector('[role="dialog"]');
          const addFilter = document.querySelector('s-button[commandfor="orders-v2-add-filter"]');
          const expectedFocus = action === "open"
            ? "dialog"
            : ["Clear filter", "Clear all"].includes(action) ? "add-filter" : "date-trigger";
          const scrollPass = before.window.y === after.window.y && before.window.x === after.window.x
            && before.toolbar.left === after.toolbar.left && before.toolbar.top === after.toolbar.top;
          const focusPass = expectedFocus === "dialog"
            ? hasFocusWithin(dialog)
            : expectedFocus === "add-filter" ? hasFocusWithin(addFilter) : hasFocusWithin(trigger);
          results.push({ action, pass: scrollPass && focusPass, scrollPass, focusPass, expectedFocus, before, after });
        }
        setFilters(initialFilters);
        await settle();
        const chips = [...toolbar().children].filter((node) => node.tagName === "SPAN");
        results.push({ action: "nonoverlapping trigger wrappers", pass: chips.length === 6 && chips.every((node) =>
          node.getBoundingClientRect().width >= (node.querySelector("button")?.getBoundingClientRect().width || 28)),
          widths: chips.map((node) => rect(node).width) });
        setRegression({ pass: results.every((result) => result.pass), results });
      } catch (error) { setRegression({ pass: false, error: error.message, results }); }
    };
    return <main>
      <nav className="scenario-controls" aria-label="Fixture scenarios" onPointerDown={(event) => event.stopPropagation()}>
        <strong>Scenarios</strong>
        <button onClick={() => position("start")}>Toolbar near top</button>
        <button onClick={() => position("center")}>Toolbar middle</button>
        <button onClick={() => position("end")}>Toolbar near bottom</button>
        <button onClick={() => openDelivery("start")}>Open delivery date at top</button>
        <button onClick={() => openDelivery("center")}>Open delivery date in middle</button>
        <button onClick={() => openDelivery("end")}>Open delivery date at bottom</button>
        <button onClick={closeWithoutScrolling}>Close editor without scrolling</button>
        <button onClick={() => finishEditor("Escape")}>Escape editor without scrolling</button>
        <button onClick={() => finishEditor("No date")}>Apply no date without scrolling</button>
        <button onClick={() => finishEditor("Clear filter")}>Clear editor without scrolling</button>
        <button onClick={() => { const node = toolbar(); if (node) node.scrollLeft = 0; }}>Toolbar left</button>
        <button onClick={() => { const node = toolbar(); if (node) node.scrollLeft = node.scrollWidth; }}>Toolbar right</button>
        <button onClick={() => setFacetVersion((value) => 1 - value)}>Change facets while open</button>
        <button onClick={() => setFilters(initialFilters)}>Reset filters</button>
        <button onClick={runRegression}>Run focus regression</button>
      </nav>
      <pre className="regression" aria-label="Focus regression results">{JSON.stringify(regression)}</pre>
      <section className="spacer"><p>Inner document top spacer</p></section>
      <section id="filter-card" className="card">
        <h1>Actual Orders filter toolbar</h1>
        <p>Open an applied chip to test the edit dialog. Use Add filter to test the Polaris menu.</p>
        <Diagnostics />
        <div data-filter-toolbar className="order-controls">
          <OrderFilterBar filters={filters} facets={facets} language="en" today="2026-10-02"
            onChange={setFilters} onClear={() => setFilters(normalizeV2Filters({}))}
            buttonStyle={{ border: "1px solid #d6d6d6", borderRadius: 8, background: "white", cursor: "pointer", flex: "0 0 auto", padding: "3px 10px" }} />
          <div className="trailing">
            <span>Orders: 37 / 212</span><span>Selected: 3</span>
            <button>Select all filtered</button><button>Clear selection</button><button>Add to map</button>
          </div>
        </div>
        <p className="facet-version">Synthetic facet set: {facetVersion ? "B" : "A"}</p>
      </section>
      <section className="spacer bottom"><p>Inner document bottom spacer</p></section>
    </main>;
  }
  createRoot(document.getElementById("root")).render(<Fixture />);
`;

const bundle = (await build({
  stdin: { contents: source, loader: "jsx", resolveDir: appRoot, sourcefile: "orders-filter-browser-fixture.jsx" },
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  jsx: "automatic",
  sourcemap: "inline",
  write: false,
})).outputFiles[0].text;

const embeddedHtml = String.raw`<!doctype html><html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Orders filter embedded fixture</title>
  <script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f6f6f7;color:#303030;font:14px Inter,system-ui,sans-serif}button{font:inherit}
    .regression{position:fixed;bottom:0;right:0;width:280px;max-height:110px;overflow:auto;white-space:pre-wrap;z-index:2000;background:white;font:10px monospace;pointer-events:none}
    .scenario-controls{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:#fff;border-bottom:1px solid #ddd}.scenario-controls button,.trailing button{border:1px solid #d6d6d6;border-radius:8px;background:#fff;padding:4px 8px}
    .spacer{height:620px;display:grid;place-items:center;background:linear-gradient(#f6f6f7,#eceef0);color:#666}.spacer.bottom{height:850px}
    .card{width:min(1100px,calc(100% - 24px));margin:40px auto;padding:18px;background:#fff;border:1px solid #ccc;border-radius:12px}.card h1{margin:0 0 6px}.card p{margin:6px 0 12px}
    .diagnostics{position:fixed;right:8px;bottom:8px;z-index:30;width:min(440px,calc(100vw - 16px));height:220px;overflow:auto;white-space:pre-wrap;background:#eef8f1ee;color:#174c2b;border:1px solid #9bc7a8;border-radius:8px;padding:8px;font:11px ui-monospace,monospace;pointer-events:none}
    .order-controls{align-items:center;display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;padding:6px 10px 8px;border:1px dashed #888;margin-top:12px}
    .trailing{align-items:center;display:flex;flex:0 0 auto;gap:6px;margin-left:auto}.trailing span{font-size:12px;font-weight:650;white-space:nowrap}.facet-version{font:12px ui-monospace,monospace}
  </style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;

const outerHtml = String.raw`<!doctype html><html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Orders filter browser fixture</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#e8eaed;color:#303030;font:14px Inter,system-ui,sans-serif}.outer-controls{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;gap:6px;padding:10px;background:#fff;border-bottom:1px solid #ccc}.outer-controls button{border:1px solid #aaa;border-radius:8px;background:#fff;padding:5px 9px}.outer-spacer{height:760px;display:grid;place-items:center;color:#666}.frame-card{margin:40px auto;width:calc(100% - 32px);padding:16px;background:#fff;border-radius:12px}iframe{display:block;width:100%;height:560px;margin:auto;border:2px solid #777;border-radius:8px;background:#fff}
  </style></head><body>
  <nav class="outer-controls"><strong>Outer frame</strong>
    <button data-h="360">Height 360</button><button data-h="560">Height 560</button><button data-h="760">Height 760</button>
    <button data-w="636">Width 636</button><button data-w="1000">Width 1000</button><button data-w="100%">Width 100%</button>
    <button data-pos="start">Frame near top</button><button data-pos="center">Frame middle</button><button data-pos="end">Frame near bottom</button>
  </nav>
  <section class="outer-spacer">Outer page top spacer</section>
  <section id="frame-card" class="frame-card"><iframe title="Orders filter embedded fixture" src="/embedded"></iframe></section>
  <section class="outer-spacer">Outer page bottom spacer</section>
  <script>
    const frame=document.querySelector('iframe');
    document.querySelectorAll('[data-h]').forEach((button)=>button.onclick=()=>frame.style.height=button.dataset.h+'px');
    document.querySelectorAll('[data-w]').forEach((button)=>button.onclick=()=>frame.style.width=button.dataset.w==='100%'?'100%':button.dataset.w+'px');
    document.querySelectorAll('[data-pos]').forEach((button)=>button.onclick=()=>document.getElementById('frame-card').scrollIntoView({block:button.dataset.pos,behavior:'instant'}));
  </script>
  </body></html>`;

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url || "/", `http://${request.headers.host}`).pathname;
  const send = (status, type, body) => { response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" }); response.end(body); };
  if (pathname === "/fixture.js") return send(200, "text/javascript; charset=utf-8", bundle);
  if (pathname === "/embedded") return send(200, "text/html; charset=utf-8", embeddedHtml);
  if (pathname === "/health") return send(200, "application/json; charset=utf-8", JSON.stringify({ ok: true }));
  if (pathname === "/") return send(200, "text/html; charset=utf-8", outerHtml);
  return send(404, "text/plain; charset=utf-8", "Not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Orders filter fixture: http://127.0.0.1:${port}/`);
  console.log(`Health check: http://127.0.0.1:${port}/health`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
