import assert from "node:assert/strict";
import test from "node:test";

import { deliveryApiRequest } from "../app/features/delivery/route-plans.server.js";

async function withDeliveryApiUrl(run) {
  const previousUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";

  try {
    await run();
  } finally {
    if (previousUrl === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previousUrl;
  }
}

test("Delivery requests prefer the current Authorization header over submitted and URL tokens", async () => {
  await withDeliveryApiUrl(async () => {
    let authorization;
    const result = await deliveryApiRequest(
      new Request("https://app.example/app/routes?id_token=url-token", {
        headers: { authorization: "Bearer current-header-token" },
      }),
      "/admin/route-plans",
      {
        fetch: async (_url, options) => {
          authorization = options.headers.authorization;
          return Response.json({ data: { routePlans: [] }, error: null });
        },
        sessionToken: "submitted-token",
      },
    );

    assert.equal(authorization, "Bearer current-header-token");
    assert.deepEqual(result.errors, []);
  });
});

test("Delivery 401 responses request one App Bridge invalid-session retry", async () => {
  await withDeliveryApiUrl(async () => {
    let requests = 0;
    const fetchUnauthorized = async () => {
      requests += 1;
      return Response.json(
        { data: null, error: { code: "UNAUTHORIZED", message: "Invalid Shopify session token" } },
        { status: 401 },
      );
    };

    await assert.rejects(
      deliveryApiRequest(
        new Request("https://app.example/app/routes", {
          headers: { authorization: "Bearer expired-token" },
        }),
        "/admin/route-plans",
        {
          fetch: fetchUnauthorized,
        },
      ),
      (error) => {
        assert.ok(error instanceof Response);
        assert.equal(error.status, 401);
        assert.equal(error.statusText, "Unauthorized");
        assert.equal(error.headers.get("X-Shopify-Retry-Invalid-Session-Request"), "1");
        return true;
      },
    );

    await assert.rejects(
      deliveryApiRequest(
        new Request("https://app.example/app/routes", {
          headers: { authorization: "Bearer expired-token" },
        }),
        "/admin/route-plans",
        { fetch: fetchUnauthorized },
      ),
      (error) => error instanceof Response && error.status === 401,
    );
    assert.equal(requests, 2, "401 responses must not remain in the GET cache");
  });
});

test("Delivery non-auth failures remain normalized service errors", async () => {
  await withDeliveryApiUrl(async () => {
    const result = await deliveryApiRequest(
      new Request("https://app.example/app/routes", {
        headers: { authorization: "Bearer current-token" },
      }),
      "/admin/route-plans",
      {
        fetch: async () => Response.json(
          { data: null, error: { code: "FORBIDDEN", message: "Access denied" } },
          { status: 403 },
        ),
      },
    );

    assert.equal(result.errors[0].code, "FORBIDDEN");
    assert.equal(result.errors[0].message, "Access denied");
    assert.equal(result.errors[0].status, 403);
  });
});
