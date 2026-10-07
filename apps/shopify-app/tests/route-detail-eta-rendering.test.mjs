import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = readFileSync(new URL("../app/routes/app.routes.$routeId.jsx", import.meta.url), "utf8");
const start = source.indexOf("function renderChildRouteEta(row)");
const end = source.indexOf("\nfunction formatRouteEndpointTimestamp", start);
const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const renderEta = new Function("React", "ROUTE_EMPTY_LABEL", `${compiled}; return renderChildRouteEta;`)(React, "–");

function render(row) {
  const html = renderToStaticMarkup(renderEta(row));
  return { html, text: html.replace(/<[^>]*>/g, "") };
}

test("ETA copies only numeric times while accessible labels describe planned and actual times", () => {
  const { html, text } = render({
    etaLabel: "Planned ETA", expectedArrival: "11:43", actualArrival: "11:46", hasActualArrival: true,
  });
  assert.equal(text, "11:4311:46");
  assert.match(html, /<del>/);
  assert.match(html, /aria-label="Planned ETA: 11:43; Actual arrival: 11:46"/);
});

test("an observed arrival without an estimate shows only the actual time", () => {
  const { html, text } = render({
    etaLabel: "Planned ETA", expectedArrival: "–", actualArrival: "11:46", hasActualArrival: true,
  });
  assert.equal(text, "11:46");
  assert.doesNotMatch(html, /<del>|Planned ETA/);
  assert.match(html, /aria-label="Actual arrival: 11:46"/);
  assert.match(html, /title="Actual arrival: 11:46"/);
});

test("a scheduled endpoint with no actual time remains a single unstruck estimate", () => {
  const { html, text } = render({ etaLabel: "Planned arrival", expectedArrival: "12:51", hasActualArrival: false });
  assert.equal(text, "12:51");
  assert.doesNotMatch(html, /<del>|Actual arrival/);
});

test("a stop with neither planned nor actual time retains one unavailable marker", () => {
  assert.equal(render({ expectedArrival: "–", hasActualArrival: false }).text, "–");
});
