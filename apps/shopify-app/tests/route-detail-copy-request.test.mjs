/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("actual Copy action forwards the same logical request key from the submitted form", async () => {
  const source = readFileSync("app/features/delivery/route-detail.server.js", "utf8");
  const start = source.indexOf("export const routeDetailAction = ");
  const end = source.indexOf("\nexport async function refreshRouteOrders", start);
  const calls = [];
  const text = (value) => typeof value === "string" && value.trim() ? value.trim() : undefined;
  const action = vm.runInNewContext(`(${source.slice(start + "export const routeDetailAction = ".length, end).trim().replace(/;$/, "")})`, {
    authenticate: { admin: async () => ({ admin: {}, session: { shop: "fixture.myshopify.com" } }) },
    cleanRoutePathParam: text, textOrUndefined: text, logRouteDetailPerformance() {},
    copyDeliveryRouteGroup: async (_request, sourceId, options) => { calls.push({ sourceId, ...options }); return { routeGroup: { id: options.requestId }, errors: [] }; },
  });
  const key = "8766c234-1bbe-4b19-919a-78007a56890d";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const form = new FormData();
    for (const [name, value] of Object.entries({ _intent: "copyRouteGroup", copyRequestId: key, copyMode: "REFERENCE", expectedUpdatedAt: "2026-10-06T12:00:00Z", shopifySessionToken: "fixture" })) form.set(name, value);
    assert.equal((await action({ params: { routeGroupId: "source-1" }, request: new Request("https://fixture.invalid", { method: "POST", body: form }) })).routeGroup.id, key);
  }
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].requestId, key);
  assert.equal(calls[0].sourceId, "source-1");
});
