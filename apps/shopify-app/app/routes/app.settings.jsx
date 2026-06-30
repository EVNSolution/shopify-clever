import { useCallback, useEffect, useRef, useState } from "react";
import { useActionData, useFetcher, useLoaderData, useRouteError, useRevalidator, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { geocodeAddress } from "../features/locations/address-geocoding.server";
import {
  fetchShopifyDepartureLocation,
  saveShopifyDepartureLocation,
} from "../features/locations/shopify-locations.server";
import {
  fetchShopifyAppPreferences,
  saveShopifyAppPreferences,
} from "../features/settings/app-preferences.server";
import { SettingsDepartureMap } from "../features/settings/settings-departure-map";
import { SUPPORTED_LANGUAGES, translate } from "../i18n/i18n";
import { authenticate } from "../shopify.server";
import { PageShell } from "../ui/page-shell";

export const links = () => [{ rel: "stylesheet", href: "/vendor/maplibre-gl.css" }];

const settingsPageStyle = {
  display: "grid",
  gap: "12px",
  maxWidth: "760px",
  width: "100%",
};

const settingsFormStyle = {
  display: "grid",
  gap: "12px",
};

const settingsFieldsetStyle = {
  border: 0,
  display: "grid",
  gap: "10px",
  margin: 0,
  padding: 0,
};

const settingsLegendStyle = {
  color: "#202223",
  fontSize: "15px",
  fontWeight: 700,
  lineHeight: "20px",
  marginBottom: "2px",
  padding: 0,
};

const settingsLabelStyle = {
  color: "#303030",
  display: "grid",
  fontSize: "13px",
  fontWeight: 650,
  gap: "4px",
};

const settingsCoordinateGridStyle = {
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const settingsInputStyle = {
  background: "#ffffff",
  border: "1px solid #c9c9c9",
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#303030",
  font: "inherit",
  minHeight: "36px",
  padding: "7px 10px",
  width: "100%",
};

const settingsSelectStyle = {
  ...settingsInputStyle,
  height: "36px",
  lineHeight: "20px",
};

const settingsReadonlyInputStyle = {
  ...settingsInputStyle,
  background: "#f7f7f7",
  color: "#616161",
};

const settingsMapControlRowStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
};

const settingsActionRowStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  justifyContent: "space-between",
  minHeight: "34px",
};

const settingsButtonGroupStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
};

const settingsSaveStatusStyle = {
  alignItems: "center",
  color: "#008060",
  display: "inline-flex",
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: "20px",
  margin: 0,
  minHeight: "34px",
};

const settingsButtonStyle = {
  background: "#303030",
  border: "1px solid #303030",
  borderRadius: "8px",
  color: "#ffffff",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 650,
  minHeight: "34px",
  padding: "6px 12px",
};

const settingsResetButtonStyle = {
  ...settingsButtonStyle,
  background: "#ffffff",
  borderColor: "#c9c9c9",
  color: "#303030",
};

const settingsDisabledButtonStyle = {
  ...settingsResetButtonStyle,
  cursor: "not-allowed",
  opacity: 0.58,
};

const settingsMessageStyle = {
  color: "#616161",
  fontSize: "13px",
  lineHeight: "18px",
  margin: 0,
};

const settingsErrorStyle = {
  ...settingsMessageStyle,
  color: "#8e1f0b",
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopifyShopCacheKey = session?.shop;
  const [departureResult, preferencesResult] = await Promise.all([
    fetchShopifyDepartureLocation(admin, { cacheKey: shopifyShopCacheKey }),
    fetchShopifyAppPreferences(admin),
  ]);

  return {
    departureLocation: departureResult.departureLocation,
    appPreferences: preferencesResult.appPreferences,
    errors: [
      ...(departureResult.errors ?? []),
      ...(preferencesResult.errors ?? []),
    ],
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const departureAddress = formText(formData.get("departureAddress"));
  const appPreferencesInput = {
    language: formText(formData.get("language")),
  };

  if (formData.get("_intent") === "geocodeDeparture") {
    const geocodedDepartureLocation = await geocodeAddress(departureAddress);

    if (departureAddress && geocodedDepartureLocation) {
      return {
        geocodedAddress: departureAddress,
        geocodedLocation: geocodedDepartureLocation,
        errors: [],
      };
    }

    return {
      geocodedAddress: departureAddress,
      geocodedLocation: null,
      errors: [{ message: translate(appPreferencesInput.language, "settings.departureLocation.geocodeError") }],
    };
  }

  const submittedDepartureCoordinate = getSubmittedDepartureCoordinate(formData);
  const geocodedDepartureLocation = submittedDepartureCoordinate ?? await geocodeAddress(departureAddress);

  if (departureAddress && !geocodedDepartureLocation) {
    return {
      departureLocation: null,
      appPreferences: appPreferencesInput,
      errors: [{ message: translate(appPreferencesInput.language, "settings.departureLocation.geocodeError") }],
    };
  }

  const departureLocationInput = {
    name: formText(formData.get("departureName")),
    address: departureAddress,
    latitude: geocodedDepartureLocation?.latitude,
    longitude: geocodedDepartureLocation?.longitude,
  };

  const [departureResult, preferencesResult] = await Promise.all([
    saveShopifyDepartureLocation(admin, departureLocationInput),
    saveShopifyAppPreferences(admin, appPreferencesInput),
  ]);

  return {
    departureLocation: departureResult.departureLocation,
    appPreferences: preferencesResult.appPreferences,
    errors: [
      ...(departureResult.errors ?? []),
      ...(preferencesResult.errors ?? []),
    ],
  };
};

function getSubmittedDepartureCoordinate(formData) {
  const latitude = numberFromFormValue(formData.get("departureLatitude"));
  const longitude = numberFromFormValue(formData.get("departureLongitude"));

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;

  return {
    latitude,
    longitude,
  };
}

function appendDepartureCoordinate(formData, coordinate) {
  if (!coordinate) {
    formData.delete("departureLatitude");
    formData.delete("departureLongitude");
    return;
  }

  formData.set("departureLatitude", String(coordinate.latitude));
  formData.set("departureLongitude", String(coordinate.longitude));
}

function createCoordinateFromDepartureLocation(departureLocation) {
  return createCoordinateFromValues(
    departureLocation?.coordinates?.[1],
    departureLocation?.coordinates?.[0],
  );
}

function createCoordinateFromValues(latitude, longitude) {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;

  return {
    latitude,
    longitude,
  };
}

function formatCoordinateDisplay(value) {
  if (value == null || value === "") return "";

  const number = Number(value);
  if (!Number.isFinite(number)) return "";

  return number.toFixed(6);
}

function formText(value) {
  if (value == null) return "";

  return String(value).trim();
}

function formatSavedDepartureMessage(name, copy) {
  const trimmedName = formText(name);

  return trimmedName
    ? copy("settings.departureLocation.savedWithName", { name: trimmedName })
    : copy("settings.departureLocation.saved");
}

function numberFromFormValue(value) {
  if (value == null || value === "") return undefined;
  const number = Number(value);

  return Number.isFinite(number) ? number : undefined;
}

function isValidLatitude(latitude) {
  return latitude != null && latitude >= -90 && latitude <= 90;
}

function isValidLongitude(longitude) {
  return longitude != null && longitude >= -180 && longitude <= 180;
}

export default function SettingsPage() {
  const { departureLocation, appPreferences, errors } = useLoaderData();
  const actionData = useActionData();
  const geocodeFetcher = useFetcher();
  const submitSettings = useSubmit();
  const { revalidate } = useRevalidator();
  const activeLanguage = actionData?.appPreferences?.language ?? appPreferences?.language ?? "en";
  const activeDepartureLocation = actionData?.departureLocation ?? departureLocation;
  const activeDepartureAddress = activeDepartureLocation?.address ?? "";
  const activeDepartureLatitude = activeDepartureLocation?.coordinates?.[1];
  const activeDepartureLongitude = activeDepartureLocation?.coordinates?.[0];
  const activeDepartureName = activeDepartureLocation?.name ?? "";
  const initialMapCoordinate = createCoordinateFromDepartureLocation(activeDepartureLocation);
  const [language, setLanguage] = useState(activeLanguage);
  const [departureName, setDepartureName] = useState(activeDepartureLocation?.name ?? "");
  const [departureAddress, setDepartureAddress] = useState(activeDepartureLocation?.address ?? "");
  const currentMapCoordinateRef = useRef(initialMapCoordinate);
  const [mapCoordinate, setMapCoordinate] = useState(initialMapCoordinate);
  const [coordinateAddress, setCoordinateAddress] = useState(
    initialMapCoordinate
      ? activeDepartureLocation?.address ?? ""
      : "",
  );
  const [lastOperation, setLastOperation] = useState(null);
  const activeErrors = [
    ...(errors ?? []),
    ...(lastOperation === "geocode" ? [] : actionData?.errors ?? []),
    ...(lastOperation === "geocode" ? geocodeFetcher.data?.errors ?? [] : []),
  ];
  const saveSucceeded = Boolean(
    lastOperation === "save" &&
    actionData?.departureLocation &&
    (actionData.errors ?? []).length === 0,
  );
  const shouldShowSaveStatus = Boolean(
    actionData &&
    lastOperation === "save" &&
    activeErrors.length === 0,
  );
  const copy = useCallback((key, params) => translate(language, key, params), [language]);
  const savedDepartureMessage = formatSavedDepartureMessage(
    actionData?.departureLocation?.name ?? activeDepartureName,
    copy,
  );

  useEffect(() => {
    const activeCoordinate = createCoordinateFromValues(
      activeDepartureLatitude,
      activeDepartureLongitude,
    );
    setLanguage(activeLanguage);
    setDepartureName(activeDepartureName);
    setDepartureAddress(activeDepartureAddress);
    currentMapCoordinateRef.current = activeCoordinate;
    setMapCoordinate(activeCoordinate);
    setCoordinateAddress(activeCoordinate ? activeDepartureAddress : "");
  }, [activeDepartureAddress, activeDepartureLatitude, activeDepartureLongitude, activeDepartureName, activeLanguage]);

  useEffect(() => {
    if (!geocodeFetcher.data?.geocodedLocation) return;

    currentMapCoordinateRef.current = geocodeFetcher.data.geocodedLocation;
    setMapCoordinate(geocodeFetcher.data.geocodedLocation);
    setCoordinateAddress(geocodeFetcher.data.geocodedAddress ?? "");
  }, [geocodeFetcher.data]);

  useEffect(() => {
    if (!saveSucceeded) return;

    revalidate();
  }, [revalidate, saveSucceeded]);

  const handleMapCoordinateChange = useCallback((coordinate) => {
    currentMapCoordinateRef.current = coordinate;
    setMapCoordinate(coordinate);
    setCoordinateAddress(formText(departureAddress));
  }, [departureAddress]);

  const checkAddressOnMap = useCallback(() => {
    const formData = new FormData();
    setLastOperation("geocode");
    formData.set("_intent", "geocodeDeparture");
    formData.set("language", language);
    formData.set("departureAddress", departureAddress);
    geocodeFetcher.submit(formData, { method: "post" });
  }, [departureAddress, geocodeFetcher, language]);

  const resetSettingsForm = useCallback((event) => {
    event.preventDefault();
    const activeCoordinate = createCoordinateFromDepartureLocation(activeDepartureLocation);
    setLastOperation(null);
    setLanguage(activeLanguage);
    setDepartureName(activeDepartureLocation?.name ?? "");
    setDepartureAddress(activeDepartureLocation?.address ?? "");
    currentMapCoordinateRef.current = activeCoordinate;
    setMapCoordinate(activeCoordinate);
    setCoordinateAddress(activeCoordinate ? activeDepartureLocation?.address ?? "" : "");
  }, [activeDepartureLocation, activeLanguage]);

  const saveSettings = useCallback((event) => {
    event.preventDefault();
    const formData = new FormData();
    setLastOperation("save");
    formData.set("language", language);
    formData.set("departureName", departureName);
    formData.set("departureAddress", departureAddress);
    appendDepartureCoordinate(formData, currentMapCoordinateRef.current);
    submitSettings(formData, { method: "post" });
  }, [departureAddress, departureName, language, submitSettings]);

  const isCheckingAddress = geocodeFetcher.state !== "idle";

  return (
    <PageShell title={copy("settings.title")}>
      <div style={settingsPageStyle}>
        {activeErrors.length > 0 ? (
          <p role="alert" style={settingsErrorStyle}>{activeErrors[0]?.message ?? copy("settings.errors.unableToSave")}</p>
        ) : null}
        <form
          method="post"
          onReset={resetSettingsForm}
          onSubmit={saveSettings}
          style={settingsFormStyle}
        >
          <fieldset style={settingsFieldsetStyle}>
            <legend style={settingsLegendStyle}>{copy("settings.general.title")}</legend>
            <label style={settingsLabelStyle}>
              {copy("settings.general.language")}
              <select
                name="language"
                onChange={(event) => {
                  setLastOperation(null);
                  setLanguage(event.currentTarget.value);
                }}
                style={settingsSelectStyle}
                value={language}
              >
                {SUPPORTED_LANGUAGES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset style={settingsFieldsetStyle}>
            <legend style={settingsLegendStyle}>{copy("settings.departureLocation.title")}</legend>
            <label style={settingsLabelStyle}>
              {copy("settings.departureLocation.name")}
              <input
                name="departureName"
                onChange={(event) => {
                  setLastOperation(null);
                  setDepartureName(event.currentTarget.value);
                }}
                placeholder={copy("settings.departureLocation.name")}
                style={settingsInputStyle}
                value={departureName}
              />
            </label>
            <label style={settingsLabelStyle}>
              {copy("settings.departureLocation.address")}
              <input
                name="departureAddress"
                onChange={(event) => {
                  const nextAddress = event.currentTarget.value;
                  setLastOperation(null);
                  setDepartureAddress(nextAddress);
                  if (formText(nextAddress) !== coordinateAddress) {
                    currentMapCoordinateRef.current = null;
                    setMapCoordinate(null);
                    setCoordinateAddress("");
                  }
                }}
                placeholder={copy("settings.departureLocation.address")}
                style={settingsInputStyle}
                value={departureAddress}
              />
            </label>
            <div style={settingsCoordinateGridStyle}>
              <label style={settingsLabelStyle}>
                <span>{copy("settings.departureLocation.latitude")}</span>
                <input
                  aria-label="Departure latitude"
                  readOnly
                  style={settingsReadonlyInputStyle}
                  value={formatCoordinateDisplay(mapCoordinate?.latitude)}
                />
              </label>
              <label style={settingsLabelStyle}>
                <span>{copy("settings.departureLocation.longitude")}</span>
                <input
                  aria-label="Departure longitude"
                  readOnly
                  style={settingsReadonlyInputStyle}
                  value={formatCoordinateDisplay(mapCoordinate?.longitude)}
                />
              </label>
            </div>
            <input
              name="departureLatitude"
              onChange={() => {}}
              type="hidden"
              value={mapCoordinate?.latitude ?? ""}
            />
            <input
              name="departureLongitude"
              onChange={() => {}}
              type="hidden"
              value={mapCoordinate?.longitude ?? ""}
            />
            <input
              name="departureCoordinateAddress"
              onChange={() => {}}
              type="hidden"
              value={coordinateAddress}
            />
          </fieldset>

          <div style={settingsMapControlRowStyle}>
            <button
              disabled={isCheckingAddress}
              onClick={checkAddressOnMap}
              style={isCheckingAddress ? settingsDisabledButtonStyle : settingsResetButtonStyle}
              type="button"
            >{copy("settings.departureLocation.checkAddress")}</button>
          </div>
          <SettingsDepartureMap
            coordinate={mapCoordinate}
            onCoordinateChange={handleMapCoordinateChange}
          />

          <div style={settingsActionRowStyle}>
            {shouldShowSaveStatus ? (
              <p role="status" style={settingsSaveStatusStyle}>{savedDepartureMessage}</p>
            ) : <span />}
            <div style={settingsButtonGroupStyle}>
              <button type="reset" style={settingsResetButtonStyle}>{copy("settings.actions.reset")}</button>
              <button type="submit" style={settingsButtonStyle}>{copy("settings.actions.save")}</button>
            </div>
          </div>
        </form>
      </div>
    </PageShell>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
