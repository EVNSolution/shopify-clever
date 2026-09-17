/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import { saveRouteStopOrder } from "../app/features/delivery/route-stop-order.server.js";
import {
  publishDeliveryRoutePlan,
  updateDeliveryRoutePlanStops,
} from "../app/features/delivery/route-plans.server.js";

test("standalone reorder Save reaches PATCH before the explicit Dispatch publish", async () => {
  const previousBaseUrl = process.env.CLEVER_DELIVERY_API_URL;
  process.env.CLEVER_DELIVERY_API_URL = "https://delivery.example";
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ body: options.body ? JSON.parse(options.body) : null, method: options.method, url });
    if (url.endsWith("/publish")) {
      return Response.json({
        data: {
          dispatch: {
            notificationStatus: "SENT",
            publishedAt: "2026-09-17T13:00:00.000Z",
            routePlanId: "route-1",
          },
          routePlan: { id: "route-1", status: "IN_PROGRESS" },
        },
        error: null,
      });
    }
    return Response.json({
      data: {
        routePlan: { id: "route-1", status: "IN_PROGRESS" },
        stops: [
          { deliveryStopId: "stop-2", sequence: 1 },
          { deliveryStopId: "stop-1", sequence: 2 },
        ],
      },
      error: null,
    });
  };
  const request = new Request("https://app.example/app/routes/route-1");
  const stops = JSON.stringify([
    { deliveryStopId: "stop-2", shopifyOrderGid: "gid://shopify/Order/2", sequence: 1 },
    { deliveryStopId: "stop-1", shopifyOrderGid: "gid://shopify/Order/1", sequence: 2 },
  ]);

  try {
    const saveResult = await saveRouteStopOrder(request, "route-1", stops, {
      fetch,
      sessionToken: "session-token",
      updateStops: updateDeliveryRoutePlanStops,
    });
    const dispatchResult = await publishDeliveryRoutePlan(request, "route-1", {
      fetch,
      sessionToken: "session-token",
    });

    assert.deepEqual(saveResult.stops.map((stop) => stop.deliveryStopId), ["stop-2", "stop-1"]);
    assert.equal(dispatchResult.dispatch.routePlanId, "route-1");
    assert.deepEqual(calls.map(({ method, url }) => [method, url]), [
      ["PATCH", "https://delivery.example/admin/route-plans/route-1/stops"],
      ["POST", "https://delivery.example/admin/route-plans/route-1/publish"],
    ]);
    assert.deepEqual(calls[0].body.stops.map((stop) => stop.deliveryStopId), ["stop-2", "stop-1"]);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.CLEVER_DELIVERY_API_URL;
    else process.env.CLEVER_DELIVERY_API_URL = previousBaseUrl;
  }
});
