/* eslint-env node */
import assert from "node:assert/strict";
import test from "node:test";

import {
  getRouteTimeZoneLocation,
  resolveRouteTimeZone,
} from "../app/features/delivery/route-timezone.server.js";

test("route timezone follows the route depot marker before the saved departure location", async () => {
  const routePlan = {
    depot: {
      address: "10 Noryangjin-ro, Dongjak-gu, Seoul",
      latitude: 37.5124328,
      longitude: 126.9269873,
    },
  };
  const departureLocation = {
    address: "Toronto, Ontario",
    coordinates: [-79.3832, 43.6532],
  };

  assert.deepEqual(getRouteTimeZoneLocation(routePlan, departureLocation), {
    address: "10 Noryangjin-ro, Dongjak-gu, Seoul",
    coordinates: { latitude: 37.5124328, longitude: 126.9269873 },
  });

  const result = await resolveRouteTimeZone({
    departureLocation,
    fallbackTimeZoneData: { ianaTimezone: "America/Toronto" },
    routePlan,
  });

  assert.equal(result.ianaTimezone, "Asia/Seoul");
  assert.equal(result.timezoneSource, "coordinates");
});

test("route timezone geocodes the address only when coordinates are unavailable", async () => {
  const calls = [];
  const result = await resolveRouteTimeZone(
    {
      departureLocation: { address: "Toronto, Ontario", coordinates: [undefined, undefined] },
      fallbackTimeZoneData: { ianaTimezone: "UTC" },
      routePlan: null,
    },
    {
      geocodeAddress: async (address) => {
        calls.push(address);
        return { latitude: 43.6532, longitude: -79.3832 };
      },
    },
  );

  assert.deepEqual(calls, ["Toronto, Ontario"]);
  assert.equal(result.ianaTimezone, "America/Toronto");
  assert.equal(result.timezoneSource, "address");
});

test("route timezone preserves the shop setting as the final fallback", async () => {
  const result = await resolveRouteTimeZone(
    {
      departureLocation: null,
      fallbackTimeZoneData: {
        errors: [],
        ianaTimezone: "America/Vancouver",
        timezoneAbbreviation: "PT",
      },
      routePlan: null,
    },
  );

  assert.equal(result.ianaTimezone, "America/Vancouver");
  assert.equal(result.timezoneSource, "fallback");
});
