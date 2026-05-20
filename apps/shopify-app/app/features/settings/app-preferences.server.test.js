import test from "node:test";
import assert from "node:assert/strict";
import {
  SHOPIFY_APP_PREFERENCES_QUERY,
  SAVE_APP_PREFERENCES_MUTATION,
  fetchShopifyAppPreferences,
  mapShopifyAppPreferencesResponse,
  saveShopifyAppPreferences,
} from "./app-preferences.server.js";

test("app preferences query reads the language setting metafield", () => {
  assert.match(SHOPIFY_APP_PREFERENCES_QUERY, /query CleverRouteAppPreferences/);
  assert.match(SHOPIFY_APP_PREFERENCES_QUERY, /currentAppInstallation\s*\{/);
  assert.match(SHOPIFY_APP_PREFERENCES_QUERY, /metafield\(namespace: "clever_route", key: "app_preferences"\)/);
});

test("maps saved app language preferences with English fallback", () => {
  assert.deepEqual(
    mapShopifyAppPreferencesResponse({
      data: {
        currentAppInstallation: {
          metafield: {
            value: JSON.stringify({ language: "ko" }),
          },
        },
      },
    }),
    { language: "ko" },
  );

  assert.deepEqual(
    mapShopifyAppPreferencesResponse({
      data: {
        currentAppInstallation: {
          metafield: {
            value: JSON.stringify({ language: "fr" }),
          },
        },
      },
    }),
    { language: "en" },
  );
});

test("fetches app preferences without breaking the app when Shopify blocks the metafield", async () => {
  const result = await fetchShopifyAppPreferences({
    graphql: async () => {
      throw new Error("Access denied for currentAppInstallation field.");
    },
  });

  assert.deepEqual(result.appPreferences, { language: "en" });
  assert.match(result.errors[0].message, /currentAppInstallation/);
});

test("saves app language preferences to an app-data metafield", async () => {
  const calls = [];
  const result = await saveShopifyAppPreferences(
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
                          key: "app_preferences",
                          namespace: "clever_route",
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
    { language: "ko" },
  );

  assert.match(SAVE_APP_PREFERENCES_MUTATION, /metafieldsSet/);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].options.variables.metafields[0], {
    namespace: "clever_route",
    key: "app_preferences",
    ownerId: "gid://shopify/AppInstallation/1",
    type: "json",
    value: JSON.stringify({ language: "ko" }),
  });
  assert.deepEqual(result.appPreferences, { language: "ko" });
  assert.equal(result.errors.length, 0);
});
