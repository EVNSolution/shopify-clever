/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  clearShopifyDepartureLocationCache,
  SHOPIFY_DEPARTURE_LOCATION_QUERY,
  SAVE_DEPARTURE_LOCATION_MUTATION,
  fetchShopifyDepartureLocation,
  mapShopifyDepartureLocationResponse,
  saveShopifyDepartureLocation,
} from "./shopify-locations.server.js";

test("departure location query reads Shopify app settings and active Locations", () => {
  assert.match(SHOPIFY_DEPARTURE_LOCATION_QUERY, /query TomatonoRouteDepartureLocation/);
  assert.match(SHOPIFY_DEPARTURE_LOCATION_QUERY, /currentAppInstallation\s*\{/);
  assert.match(SHOPIFY_DEPARTURE_LOCATION_QUERY, /metafield\(namespace: "tomatono_route", key: "departure_location"\)/);
  assert.match(SHOPIFY_DEPARTURE_LOCATION_QUERY, /location\s*\{/);
  assert.match(SHOPIFY_DEPARTURE_LOCATION_QUERY, /locations\(first: 10/);
  assert.match(SHOPIFY_DEPARTURE_LOCATION_QUERY, /address\s*\{/);
  assert.match(SHOPIFY_DEPARTURE_LOCATION_QUERY, /formatted/);
  assert.match(SHOPIFY_DEPARTURE_LOCATION_QUERY, /latitude/);
  assert.match(SHOPIFY_DEPARTURE_LOCATION_QUERY, /longitude/);
});

test("uses the app settings departure location when it is saved", () => {
  const departureLocation = mapShopifyDepartureLocationResponse({
    data: {
      currentAppInstallation: {
        id: "gid://shopify/AppInstallation/1",
        metafield: {
          value: JSON.stringify({
            name: "Custom depot",
            address: "77 Route Start, Toronto, ON",
            latitude: 43.7,
            longitude: -79.4,
          }),
        },
      },
      location: {
        id: "gid://shopify/Location/1",
        name: "Tomatono HQ",
        isActive: true,
        address: {
          formatted: ["123 Tomato Rd"],
          latitude: 43.6426,
          longitude: -79.3871,
        },
      },
    },
  });

  assert.deepEqual(departureLocation, {
    id: "gid://shopify/AppInstallation/1:departure_location",
    name: "Custom depot",
    address: "77 Route Start, Toronto, ON",
    coordinates: [-79.4, 43.7],
    hasCoordinates: true,
    source: "App Settings",
    isActive: true,
  });
});

test("maps Shopify primary Location into a departure start point", () => {
  const departureLocation = mapShopifyDepartureLocationResponse({
    data: {
      location: {
        id: "gid://shopify/Location/1",
        name: "Tomatono HQ",
        isActive: true,
        address: {
          formatted: [
            "123 Tomato Rd",
            "Toronto ON M5V 2T6",
            "Canada",
          ],
          latitude: 43.6426,
          longitude: -79.3871,
        },
      },
    },
  });

  assert.deepEqual(departureLocation, {
    id: "gid://shopify/Location/1",
    name: "Tomatono HQ",
    address: "123 Tomato Rd, Toronto ON M5V 2T6, Canada",
    coordinates: [-79.3871, 43.6426],
    hasCoordinates: true,
    source: "Shopify Location",
    isActive: true,
  });
});

test("prefers an active Shopify Location with coordinates over a bare shop Location", () => {
  const departureLocation = mapShopifyDepartureLocationResponse({
    data: {
      location: {
        id: "gid://shopify/Location/empty",
        name: "Shop location",
        isActive: true,
        address: {
          formatted: ["United States"],
          latitude: null,
          longitude: null,
        },
      },
      locations: {
        nodes: [
          {
            id: "gid://shopify/Location/empty",
            name: "Shop location",
            isActive: true,
            address: {
              formatted: ["United States"],
              latitude: null,
              longitude: null,
            },
          },
          {
            id: "gid://shopify/Location/company",
            name: "My Custom Location",
            isActive: true,
            address: {
              formatted: ["123 Main St", "Toronto ON A1A 1A1", "Canada"],
              latitude: 43.682703,
              longitude: -79.2994195,
            },
          },
        ],
      },
    },
  });

  assert.deepEqual(departureLocation, {
    id: "gid://shopify/Location/company",
    name: "My Custom Location",
    address: "123 Main St, Toronto ON A1A 1A1, Canada",
    coordinates: [-79.2994195, 43.682703],
    hasCoordinates: true,
    source: "Shopify Location",
    isActive: true,
  });
});

test("keeps departure location visible even when Shopify has no coordinates", () => {
  const departureLocation = mapShopifyDepartureLocationResponse({
    data: {
      location: {
        id: "gid://shopify/Location/2",
        name: "Warehouse",
        isActive: true,
        address: {
          address1: "55 Seed Ave",
          city: "Markham",
          provinceCode: "ON",
          zip: "L3R 1A1",
          countryCode: "CA",
          latitude: null,
          longitude: null,
        },
      },
    },
  });

  assert.deepEqual(departureLocation, {
    id: "gid://shopify/Location/2",
    name: "Warehouse",
    address: "55 Seed Ave, Markham, ON, L3R 1A1, CA",
    coordinates: [undefined, undefined],
    hasCoordinates: false,
    source: "Shopify Location",
    isActive: true,
  });
});

test("returns a null departure location instead of breaking the page when Location access is blocked", async () => {
  const result = await fetchShopifyDepartureLocation({
    graphql: async () => {
      throw new Error("Access denied for location field. Required access: `read_locations` access scope.");
    },
  });

  assert.equal(result.departureLocation, null);
  assert.match(result.errors[0].message, /read_locations/);
});

test("caches Shopify departure location reads by shop cache key without sharing mutable results", async () => {
  const previousTtl = process.env.CLEVER_SHOPIFY_DEPARTURE_LOCATION_CACHE_TTL_MS;
  process.env.CLEVER_SHOPIFY_DEPARTURE_LOCATION_CACHE_TTL_MS = "5000";
  clearShopifyDepartureLocationCache();
  let calls = 0;
  const admin = {
    graphql: async () => {
      calls += 1;
      return {
        json: async () => ({
          data: {
            currentAppInstallation: {
              id: "gid://shopify/AppInstallation/1",
              metafield: null,
            },
            location: {
              id: "gid://shopify/Location/1",
              name: `Depot ${calls}`,
              isActive: true,
              address: {
                formatted: ["123 Tomato Rd"],
                latitude: 43.6426,
                longitude: -79.3871,
              },
            },
          },
        }),
      };
    },
  };

  try {
    const first = await fetchShopifyDepartureLocation(admin, { cacheKey: "shop-a" });
    first.departureLocation.name = "Mutated by caller";
    const second = await fetchShopifyDepartureLocation(admin, { cacheKey: "shop-a" });

    assert.equal(calls, 1);
    assert.equal(second.departureLocation.name, "Depot 1");
  } finally {
    if (previousTtl === undefined) {
      delete process.env.CLEVER_SHOPIFY_DEPARTURE_LOCATION_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_SHOPIFY_DEPARTURE_LOCATION_CACHE_TTL_MS = previousTtl;
    }
    clearShopifyDepartureLocationCache();
  }
});

test("invalidates cached Shopify departure location reads after settings save", async () => {
  const previousTtl = process.env.CLEVER_SHOPIFY_DEPARTURE_LOCATION_CACHE_TTL_MS;
  process.env.CLEVER_SHOPIFY_DEPARTURE_LOCATION_CACHE_TTL_MS = "5000";
  clearShopifyDepartureLocationCache();
  let fetchCalls = 0;
  const fetchAdmin = {
    graphql: async () => {
      fetchCalls += 1;
      return {
        json: async () => ({
          data: {
            currentAppInstallation: {
              id: "gid://shopify/AppInstallation/1",
              metafield: null,
            },
            location: {
              id: "gid://shopify/Location/1",
              name: `Depot ${fetchCalls}`,
              isActive: true,
              address: {
                formatted: ["123 Tomato Rd"],
                latitude: 43.6426,
                longitude: -79.3871,
              },
            },
          },
        }),
      };
    },
  };
  const saveAdmin = {
    graphql: async (query, options) => ({
      json: async () =>
        query.includes("currentAppInstallation")
          ? {
              data: {
                currentAppInstallation: {
                  id: "gid://shopify/AppInstallation/1",
                },
              },
            }
          : {
              data: {
                metafieldsSet: {
                  metafields: [
                    {
                      key: "departure_location",
                      namespace: "tomatono_route",
                      value: options.variables.metafields[0].value,
                    },
                  ],
                  userErrors: [],
                },
              },
            },
    }),
  };

  try {
    await fetchShopifyDepartureLocation(fetchAdmin, { cacheKey: "shop-a" });
    await fetchShopifyDepartureLocation(fetchAdmin, { cacheKey: "shop-a" });
    assert.equal(fetchCalls, 1);

    await saveShopifyDepartureLocation(saveAdmin, {
      name: "Depot",
      address: "11 Start St",
      latitude: 43.1,
      longitude: -79.2,
    });
    const afterSave = await fetchShopifyDepartureLocation(fetchAdmin, {
      cacheKey: "shop-a",
    });

    assert.equal(fetchCalls, 2);
    assert.equal(afterSave.departureLocation.name, "Depot 2");
  } finally {
    if (previousTtl === undefined) {
      delete process.env.CLEVER_SHOPIFY_DEPARTURE_LOCATION_CACHE_TTL_MS;
    } else {
      process.env.CLEVER_SHOPIFY_DEPARTURE_LOCATION_CACHE_TTL_MS = previousTtl;
    }
    clearShopifyDepartureLocationCache();
  }
});

test("saves departure location settings to an app-data metafield", async () => {
  const calls = [];
  const result = await saveShopifyDepartureLocation(
    {
      graphql: async (query, options) => {
        calls.push({ query, options });
        return {
          json: async () =>
            query.includes("currentAppInstallation")
              ? {
                  data: {
                    currentAppInstallation: {
                      id: "gid://shopify/AppInstallation/1",
                    },
                  },
                }
              : {
                  data: {
                    metafieldsSet: {
                      metafields: [
                        {
                          key: "departure_location",
                          namespace: "tomatono_route",
                          value: options.variables.metafields[0].value,
                        },
                      ],
                      userErrors: [],
                    },
                  },
                },
        };
      },
    },
    {
      name: "Depot",
      address: "11 Start St",
      latitude: "43.1",
      longitude: "-79.2",
    },
  );

  assert.match(SAVE_DEPARTURE_LOCATION_MUTATION, /metafieldsSet/);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].options.variables.metafields[0], {
    namespace: "tomatono_route",
    key: "departure_location",
    ownerId: "gid://shopify/AppInstallation/1",
    type: "json",
    value: JSON.stringify({
      name: "Depot",
      address: "11 Start St",
      latitude: 43.1,
      longitude: -79.2,
    }),
  });
  assert.equal(result.errors.length, 0);
  assert.equal(result.departureLocation.source, "App Settings");
});
