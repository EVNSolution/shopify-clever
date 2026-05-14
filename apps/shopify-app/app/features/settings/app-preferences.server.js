import { DEFAULT_LANGUAGE, normalizeLanguage } from "../../i18n/i18n.js";

export const SHOPIFY_APP_PREFERENCES_QUERY = `#graphql
  query TomatonoRouteAppPreferences {
    currentAppInstallation {
      id
      metafield(namespace: "tomatono_route", key: "app_preferences") {
        value
      }
    }
  }
`;

export const CURRENT_APP_INSTALLATION_QUERY = `#graphql
  query TomatonoRouteCurrentAppInstallationForPreferences {
    currentAppInstallation {
      id
    }
  }
`;

export const SAVE_APP_PREFERENCES_MUTATION = `#graphql
  mutation TomatonoRouteSaveAppPreferences($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        namespace
        key
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export async function fetchShopifyAppPreferences(admin) {
  try {
    const response = await admin.graphql(SHOPIFY_APP_PREFERENCES_QUERY);
    const payload = await response.json();

    return {
      appPreferences: mapShopifyAppPreferencesResponse(payload),
      errors: normalizeGraphqlErrors(payload.errors),
    };
  } catch (error) {
    return {
      appPreferences: normalizeAppPreferences(),
      errors: [{ message: getErrorMessage(error) }],
    };
  }
}

export async function saveShopifyAppPreferences(admin, input) {
  try {
    const appPreferencesInput = normalizeAppPreferences(input);
    const ownerId = await fetchCurrentAppInstallationId(admin);

    if (!ownerId) {
      return {
        appPreferences: normalizeAppPreferences(),
        errors: [{ message: "Shopify AppInstallation을 찾지 못했습니다." }],
      };
    }

    const response = await admin.graphql(SAVE_APP_PREFERENCES_MUTATION, {
      variables: {
        metafields: [
          {
            namespace: "tomatono_route",
            key: "app_preferences",
            ownerId,
            type: "json",
            value: JSON.stringify(appPreferencesInput),
          },
        ],
      },
    });
    const payload = await response.json();
    const userErrors = payload?.data?.metafieldsSet?.userErrors ?? [];

    return {
      appPreferences: appPreferencesInput,
      errors: normalizeGraphqlErrors(userErrors),
    };
  } catch (error) {
    return {
      appPreferences: normalizeAppPreferences(input),
      errors: [{ message: getErrorMessage(error) }],
    };
  }
}

export function mapShopifyAppPreferencesResponse(payload) {
  const value = payload?.data?.currentAppInstallation?.metafield?.value;
  if (!value) return normalizeAppPreferences();

  try {
    return normalizeAppPreferences(JSON.parse(value));
  } catch {
    return normalizeAppPreferences();
  }
}

export function normalizeAppPreferences(input = {}) {
  return {
    language: normalizeLanguage(input?.language ?? DEFAULT_LANGUAGE),
  };
}

async function fetchCurrentAppInstallationId(admin) {
  const response = await admin.graphql(CURRENT_APP_INSTALLATION_QUERY);
  const payload = await response.json();

  return payload?.data?.currentAppInstallation?.id;
}

function normalizeGraphqlErrors(errors) {
  if (!Array.isArray(errors)) return [];

  return errors.map((error) => ({
    message: getErrorMessage(error),
  }));
}

function getErrorMessage(error) {
  if (typeof error === "string") return error;
  return error?.message ?? "Unknown Shopify settings error.";
}
