import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { createMemoryRouter } from "react-router";

import {
  routeGroupChildPath,
  withEmbeddedShopifyContext,
} from "../app/features/delivery/route-paths.js";

const embeddedSearch = new URLSearchParams({
  embedded: "1",
  hmac: "signed-request",
  host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUva2Zvb2Q",
  id_token: "short-lived-jwt",
  locale: "ko",
  session: "short-lived-session",
  shop: "k-food-company.myshopify.com",
  timestamp: "1789050000",
});

test("group child navigation preserves stable embedded context without copying credentials", () => {
  const destination = withEmbeddedShopifyContext(
    routeGroupChildPath("group/2026", "route #13"),
    embeddedSearch,
  );
  const url = new URL(destination, "https://clever-kfood-app.cleversystem.ai");

  assert.equal(url.pathname, "/app/routes/groups/group%2F2026/routes/route%20%2313");
  assert.equal(url.searchParams.get("shop"), "k-food-company.myshopify.com");
  assert.equal(url.searchParams.get("host"), "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUva2Zvb2Q");
  assert.equal(url.searchParams.get("embedded"), "1");
  assert.equal(url.searchParams.has("id_token"), false);
  assert.equal(url.searchParams.has("session"), false);
  assert.equal(url.searchParams.has("hmac"), false);
  assert.equal(url.searchParams.has("timestamp"), false);
  assert.equal(url.searchParams.has("locale"), false);
});

test("embedded context helper retains destination query and fragment", () => {
  const destination = withEmbeddedShopifyContext(
    "/app/orders/inventory?id=inventory-1#details",
    embeddedSearch,
  );
  const url = new URL(destination, "https://clever-kfood-app.cleversystem.ai");

  assert.equal(url.searchParams.get("id"), "inventory-1");
  assert.equal(url.searchParams.get("shop"), "k-food-company.myshopify.com");
  assert.equal(url.hash, "#details");
});

test("embedded context helper removes credentials already present in a destination", () => {
  const destination = withEmbeddedShopifyContext(
    "/app/routes?routeGroupId=group-1&id_token=old&session=old&hmac=old&timestamp=1",
    embeddedSearch,
  );
  const url = new URL(destination, "https://clever-kfood-app.cleversystem.ai");

  assert.equal(url.searchParams.get("routeGroupId"), "group-1");
  assert.equal(url.searchParams.has("id_token"), false);
  assert.equal(url.searchParams.has("session"), false);
  assert.equal(url.searchParams.has("hmac"), false);
  assert.equal(url.searchParams.has("timestamp"), false);
});

test("group to child router navigation keeps stable context in the child loader request", async () => {
  let childRequest;
  const router = createMemoryRouter(
    [
      {
        path: "/app/routes/groups/:routeGroupId/routes/:routePlanId",
        loader: ({ params, request }) => {
          childRequest = { params, url: new URL(request.url) };
          return null;
        },
      },
      { path: "*", element: null },
    ],
    { initialEntries: [`/app/routes?${embeddedSearch}`] },
  );

  await router.navigate(withEmbeddedShopifyContext("/app/routes/groups/group-1", router.state.location.search));
  await router.navigate(withEmbeddedShopifyContext(
    routeGroupChildPath("group-1", "route-13"),
    router.state.location.search,
  ));

  assert.equal(childRequest.params.routeGroupId, "group-1");
  assert.equal(childRequest.params.routePlanId, "route-13");
  assert.equal(childRequest.url.searchParams.get("shop"), "k-food-company.myshopify.com");
  assert.equal(childRequest.url.searchParams.get("host"), "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUva2Zvb2Q");
  assert.equal(childRequest.url.searchParams.get("embedded"), "1");
  assert.equal(childRequest.url.searchParams.has("id_token"), false);
});

test("route navigation call sites use the embedded context helper", () => {
  const sources = [
    "app/routes/app.jsx",
    "app/routes/app.routes.jsx",
    "app/routes/app.routes.$routeId.jsx",
    "app/features/orders/orders-page.jsx",
  ].map((filePath) => readFileSync(join(process.cwd(), filePath), "utf8"));

  for (const source of sources) {
    assert.match(source, /withEmbeddedShopifyContext/);
  }

  assert.match(sources[2], /requestRouteNavigation/);
  assert.match(sources[2], /routeGroupChildPath\(routeGroupId, routePlanId\)/);
});
