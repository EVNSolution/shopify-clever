import assert from "node:assert/strict";
import test from "node:test";

import { getOrderAreaSuggestion } from "../app/features/orders/order-area-suggestion.js";

function order(id, area, longitude, latitude) {
  return {
    coordinates: [longitude, latitude],
    deliveryArea: area,
    hasCoordinates: true,
    id,
  };
}

test("suggests the nearby consensus without changing the order", () => {
  const target = order("target", undefined, -79.3703798, 43.7672243);
  const suggestion = getOrderAreaSuggestion(target, [
    target,
    order("north-1", "North York", -79.384971, 43.7652619),
    order("north-2", "North York", -79.4074149, 43.7566415),
    order("north-3", "North York", -79.4074243, 43.756673),
    order("toronto", "Toronto", -79.4102193, 43.7605816),
    order("north-4", "North York", -79.4115241, 43.7651156),
  ]);

  assert.deepEqual(suggestion, {
    area: "North York",
    matchedOrders: 4,
    nearbyOrders: 5,
  });
  assert.equal(target.deliveryArea, undefined);
});

test("does not suggest an area when nearby orders disagree", () => {
  const target = order("target", undefined, -79.37, 43.76);

  assert.equal(
    getOrderAreaSuggestion(target, [
      target,
      order("north-1", "North York", -79.371, 43.761),
      order("north-2", "North York", -79.372, 43.762),
      order("downtown-1", "Downtown", -79.373, 43.763),
      order("downtown-2", "Downtown", -79.374, 43.764),
      order("downtown-3", "Downtown", -79.375, 43.765),
    ]),
    null,
  );
});

test("does not suggest an area without enough nearby evidence", () => {
  const target = order("target", undefined, -79.37, 43.76);

  assert.equal(
    getOrderAreaSuggestion(target, [
      target,
      order("north-1", "North York", -79.371, 43.761),
      order("north-2", "North York", -79.372, 43.762),
    ]),
    null,
  );
});

test("does not treat missing coordinates as zero coordinates", () => {
  assert.equal(
    getOrderAreaSuggestion(
      { coordinates: [null, null], id: "target" },
      [
        order("zero-1", "Unknown", 0.001, 0.001),
        order("zero-2", "Unknown", 0.002, 0.002),
        order("zero-3", "Unknown", 0.003, 0.003),
      ],
    ),
    null,
  );
});
