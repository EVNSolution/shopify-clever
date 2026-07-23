import test from "node:test";
import assert from "node:assert/strict";
import {
  inferDeliveryDateForOrder,
  formatDeliveryScopeLabel,
  inferDeliveryDateFromLineItems,
  inferDeliveryDateFromOrderCycle,
  normalizeDeliveryCycle,
} from "./delivery-labels.js";

test("formats delivery labels with the actual date and weekday", () => {
  assert.equal(
    formatDeliveryScopeLabel({ deliveryDate: "2026-05-08" }),
    "Fri 05/08",
  );
});

test("formats explicit route time windows only when provided", () => {
  assert.equal(
    formatDeliveryScopeLabel({
      deliveryDate: "2026-05-08",
      timeWindowEnd: "21:00",
      timeWindowStart: "17:00",
    }),
    "Fri 05/08 · 5–9pm",
  );
});

test("does not fall back to a bare weekday without a date", () => {
  assert.equal(
    formatDeliveryScopeLabel({ fallbackDeliveryDay: "Friday" }),
    undefined,
  );
});

test("infers the concrete delivery date from a Shopify line item range and delivery day", () => {
  assert.equal(
    inferDeliveryDateFromLineItems({
      deliveryDay: "Friday",
      lineItems: {
        nodes: [
          {
            title: "토마토노 밀키트 세트 5/7-5/9",
          },
        ],
      },
      orderCreatedAt: "2026-05-01T15:30:00.000Z",
    }),
    "2026-05-08",
  );
});


test("infers delivery dates from the CLEVER Tuesday-to-Monday order cycle", () => {
  assert.equal(
    inferDeliveryDateFromOrderCycle({
      deliveryDay: "Friday",
      orderCreatedAt: "2026-05-01T15:30:00.000Z",
    }),
    "2026-05-08",
  );

  assert.equal(
    inferDeliveryDateFromOrderCycle({
      deliveryDay: "Thursday",
      orderCreatedAt: "2026-05-04T23:30:00.000Z",
    }),
    "2026-05-07",
  );

  assert.equal(
    inferDeliveryDateFromOrderCycle({
      deliveryDay: "Saturday",
      orderCreatedAt: "2026-05-05T15:30:00.000Z",
    }),
    "2026-05-16",
  );
});

test("honors a configured delivery cycle cutoff time", () => {
  assert.equal(
    inferDeliveryDateFromOrderCycle({
      deliveryCycle: { cutoffTime: "12:00", cutoffWeekday: "MONDAY" },
      deliveryDay: "Thursday",
      orderCreatedAt: "2026-05-04T17:30:00.000Z",
    }),
    "2026-05-14",
  );
});

test("keeps orders placed through 16:59 in the current K-food delivery cycle", () => {
  assert.equal(
    inferDeliveryDateFromOrderCycle({
      deliveryCycle: {
        cutoffTime: "17:00",
        cutoffWeekday: "TUESDAY",
        timeZone: "America/Toronto",
      },
      deliveryDay: "Friday",
      orderCreatedAt: "2026-05-05T20:59:00.000Z",
    }),
    "2026-05-08",
  );
});

test("starts the next K-food delivery cycle at exactly 17:00", () => {
  assert.equal(
    inferDeliveryDateFromOrderCycle({
      deliveryCycle: {
        cutoffTime: "17:00",
        cutoffWeekday: "TUESDAY",
        timeZone: "America/Toronto",
      },
      deliveryDay: "Friday",
      orderCreatedAt: "2026-05-05T21:00:00.000Z",
    }),
    "2026-05-15",
  );
});

test("normalizes invalid delivery cycle settings to the current default", () => {
  assert.deepEqual(
    normalizeDeliveryCycle({ cutoffTime: "99:99", cutoffWeekday: "NOPE" }),
    { cutoffTime: "23:59", cutoffWeekday: "MONDAY", timeZone: "America/Toronto" },
  );
});

test("uses the order cycle when Shopify line items do not include a date range", () => {
  assert.equal(
    inferDeliveryDateForOrder({
      deliveryDay: "Friday",
      lineItems: {
        nodes: [{ title: "CLEVER weekly menu" }],
      },
      orderCreatedAt: "2026-05-01T15:30:00.000Z",
    }),
    "2026-05-08",
  );
});

test("uses the product date range before an explicit delivery date", () => {
  assert.equal(
    inferDeliveryDateForOrder({
      deliveryDate: "2026-05-18",
      deliveryDay: "Friday",
      lineItems: {
        nodes: [{ title: "CLEVER 2026.05.21-05.23" }],
      },
      orderCreatedAt: "2026-05-01T15:30:00.000Z",
    }),
    "2026-05-22",
  );
});
