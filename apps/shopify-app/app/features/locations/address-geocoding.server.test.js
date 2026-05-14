import test from "node:test";
import assert from "node:assert/strict";
import { geocodeAddress } from "./address-geocoding.server.js";

test("geocodes a departure address into latitude and longitude", async () => {
  const calls = [];
  const result = await geocodeAddress("123 Queen St W, Toronto, ON", {
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => [
          {
            lat: "43.6532",
            lon: "-79.3832",
          },
        ],
      };
    },
  });

  assert.deepEqual(result, {
    latitude: 43.6532,
    longitude: -79.3832,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /format=jsonv2/);
  assert.match(calls[0].url, /limit=1/);
  assert.match(calls[0].url, /q=123\+Queen\+St\+W%2C\+Toronto%2C\+ON/);
  assert.equal(calls[0].options.headers.Accept, "application/json");
  assert.match(calls[0].options.headers["User-Agent"], /clever/i);
});

test("returns null when the address is blank or no provider result exists", async () => {
  let callCount = 0;

  assert.equal(await geocodeAddress("   ", {
    fetchImpl: async () => {
      callCount += 1;
    },
  }), null);

  const result = await geocodeAddress("No result address", {
    fetchImpl: async () => {
      callCount += 1;
      return {
        ok: true,
        json: async () => [],
      };
    },
  });

  assert.equal(result, null);
  assert.equal(callCount, 1);
});

test("returns null instead of saving invalid provider coordinates", async () => {
  const result = await geocodeAddress("Bad coordinate address", {
    fetchImpl: async () => ({
      ok: true,
      json: async () => [
        {
          lat: "143.6532",
          lon: "-279.3832",
        },
      ],
    }),
  });

  assert.equal(result, null);
});

test("lets deployments override the geocoding endpoint and user agent", async () => {
  const calls = [];
  await geocodeAddress("77 Start St", {
    endpoint: "https://geocoder.example.test/search",
    userAgent: "Clever Test Geocoder",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => [
          {
            lat: "43.1",
            lon: "-79.2",
          },
        ],
      };
    },
  });

  assert.match(calls[0].url, /^https:\/\/geocoder\.example\.test\/search\?/);
  assert.equal(calls[0].options.headers["User-Agent"], "Clever Test Geocoder");
});
