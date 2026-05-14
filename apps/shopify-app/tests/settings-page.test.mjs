import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const settingsPageSource = readFileSync(
  join(root, "app/routes/app.settings.jsx"),
  "utf8",
);

test("Settings tab reads the Shopify departure location", () => {
  assert.match(settingsPageSource, /import \{ useCallback, useEffect, useRef, useState \} from "react"/);
  assert.match(settingsPageSource, /import \{ useActionData, useFetcher, useLoaderData, useRouteError, useRevalidator, useSubmit \} from "react-router"/);
  assert.match(settingsPageSource, /import \{ SUPPORTED_LANGUAGES, translate \} from "\.\.\/i18n\/i18n"/);
  assert.match(settingsPageSource, /fetchShopifyAppPreferences/);
  assert.match(settingsPageSource, /import \{ authenticate \} from "\.\.\/shopify\.server"/);
  assert.match(settingsPageSource, /fetchShopifyDepartureLocation/);
  assert.match(settingsPageSource, /export const loader = async \(\{ request \}\) =>/);
  assert.match(settingsPageSource, /authenticate\.admin\(request\)/);
  assert.match(settingsPageSource, /const \{ admin, session \} = await authenticate\.admin\(request\)/);
  assert.match(settingsPageSource, /const shopifyShopCacheKey = session\?\.shop/);
  assert.match(settingsPageSource, /Promise\.all\(\[/);
  assert.match(settingsPageSource, /fetchShopifyDepartureLocation\(admin, \{ cacheKey: shopifyShopCacheKey \}\)/);
  assert.match(settingsPageSource, /fetchShopifyAppPreferences\(admin\)/);
  assert.doesNotMatch(settingsPageSource, /useSearchParams|searchParams\.get\("section"\)/);
});

test("Settings tab saves language and departure location settings without adding a database migration", () => {
  assert.match(settingsPageSource, /saveShopifyDepartureLocation/);
  assert.match(settingsPageSource, /saveShopifyAppPreferences/);
  assert.match(settingsPageSource, /geocodeAddress/);
  assert.match(settingsPageSource, /export const action = async \(\{ request \}\) =>/);
  assert.match(settingsPageSource, /request\.formData\(\)/);
  assert.match(settingsPageSource, /formData\.get\("_intent"\) === "geocodeDeparture"/);
  assert.match(settingsPageSource, /language: formText\(formData\.get\("language"\)\)/);
  assert.match(settingsPageSource, /getSubmittedDepartureCoordinate\(formData\)/);
  assert.match(settingsPageSource, /submittedDepartureCoordinate \?\? await geocodeAddress\(departureAddress\)/);
  assert.match(settingsPageSource, /latitude: geocodedDepartureLocation\?\.latitude/);
  assert.match(settingsPageSource, /longitude: geocodedDepartureLocation\?\.longitude/);
  assert.match(settingsPageSource, /saveShopifyDepartureLocation\(admin, departureLocationInput\)/);
  assert.match(settingsPageSource, /saveShopifyAppPreferences\(admin, appPreferencesInput\)/);
  assert.match(settingsPageSource, /const actionData = useActionData\(\)/);
  assert.match(settingsPageSource, /<PageShell\s+title=\{copy\("settings\.title"\)\}/);
  assert.match(settingsPageSource, />\{copy\("settings\.general\.title"\)\}<\/legend>/);
  assert.match(settingsPageSource, />\{copy\("settings\.departureLocation\.title"\)\}<\/legend>/);
  assert.match(settingsPageSource, /method="post"/);
  assert.match(settingsPageSource, /name="language"/);
  assert.match(settingsPageSource, /name="departureName"/);
  assert.match(settingsPageSource, /name="departureAddress"/);
  assert.match(settingsPageSource, /name="departureLatitude"/);
  assert.match(settingsPageSource, /name="departureLongitude"/);
  assert.match(settingsPageSource, /name="departureCoordinateAddress"/);
  assert.match(settingsPageSource, /type="hidden"/);
  assert.match(settingsPageSource, />\{copy\("settings\.departureLocation\.latitude"\)\}<\/span>/);
  assert.match(settingsPageSource, />\{copy\("settings\.departureLocation\.longitude"\)\}<\/span>/);
  assert.match(settingsPageSource, /aria-label="Departure latitude"/);
  assert.match(settingsPageSource, /aria-label="Departure longitude"/);
  assert.match(settingsPageSource, /readOnly/);
  assert.match(settingsPageSource, /translate\(appPreferencesInput\.language, "settings\.departureLocation\.geocodeError"\)/);
  assert.match(settingsPageSource, /type="reset"/);
  assert.match(settingsPageSource, />\{copy\("settings\.actions\.reset"\)\}<\/button>/);
  assert.match(settingsPageSource, />\{copy\("settings\.actions\.save"\)\}<\/button>/);
  assert.doesNotMatch(settingsPageSource, /prisma|migration|dev\.sqlite/i);
});

test("Settings renders language as a General fieldset without card sections", () => {
  assert.match(settingsPageSource, /const activeLanguage =/);
  assert.match(settingsPageSource, /const \[language, setLanguage\] = useState\(activeLanguage\)/);
  assert.match(settingsPageSource, /const copy = useCallback\(\(key, params\) => translate\(language, key, params\)/);
  assert.match(settingsPageSource, /<fieldset style=\{settingsFieldsetStyle\}>[\s\S]*<legend style=\{settingsLegendStyle\}>\{copy\("settings\.general\.title"\)\}<\/legend>/);
  assert.match(settingsPageSource, /const settingsSelectStyle = \{[\s\S]*\.\.\.settingsInputStyle,[\s\S]*height: "36px"/);
  assert.match(settingsPageSource, /<select[\s\S]*name="language"[\s\S]*style=\{settingsSelectStyle\}[\s\S]*value=\{language\}/);
  assert.match(settingsPageSource, /SUPPORTED_LANGUAGES\.map\(\(option\) =>/);
  assert.match(settingsPageSource, /<option key=\{option\.code\} value=\{option\.code\}>/);
  assert.match(settingsPageSource, /\{option\.label\}/);
  assert.doesNotMatch(settingsPageSource, /aria-label="Settings sections"|ariaLabel="User variables"|ariaLabel="Runtime\/system values"/);
});

test("Settings tab lets operators preview geocoding and adjust the pin on a map", () => {
  assert.match(settingsPageSource, /export const links = \(\) => \[\{ rel: "stylesheet", href: "\/vendor\/maplibre-gl\.css" \}\]/);
  assert.match(settingsPageSource, /const OPENFREEMAP_STYLE_URL = "\/vendor\/openfreemap-liberty\.json"/);
  assert.match(settingsPageSource, /const geocodeFetcher = useFetcher\(\)/);
  assert.match(settingsPageSource, /const \[lastOperation, setLastOperation\] = useState\(null\)/);
  assert.match(settingsPageSource, /lastOperation === "geocode"/);
  assert.match(settingsPageSource, /lastOperation === "save"/);
  assert.match(settingsPageSource, /const saveSettings = useCallback\(\(event\) =>/);
  assert.match(settingsPageSource, /onSubmit=\{saveSettings\}/);
  assert.match(settingsPageSource, /geocodeFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(settingsPageSource, /setLastOperation\("geocode"\)/);
  assert.match(settingsPageSource, /onClick=\{checkAddressOnMap\}/);
  assert.match(settingsPageSource, /type="button"/);
  assert.match(settingsPageSource, />\{copy\("settings\.departureLocation\.checkAddress"\)\}<\/button>/);
  assert.match(settingsPageSource, /<SettingsDepartureMap/);
  assert.match(settingsPageSource, /aria-label="Departure location map"/);
  assert.match(settingsPageSource, /await import\("maplibre-gl"\)/);
  assert.match(settingsPageSource, /new maplibregl\.Marker\(\{\s*color: "#008060",\s*draggable: true,\s*\}\)/);
  assert.match(settingsPageSource, /markerRef\.current\.on\("dragend"/);
  assert.match(settingsPageSource, /onCoordinateChangeRef\.current\(\{/);
  assert.match(settingsPageSource, /setCoordinateAddress\(formText\(departureAddress\)\)/);
});

test("Settings save keeps a manually adjusted map pin instead of reverting to geocode", () => {
  assert.match(settingsPageSource, /import \{ useActionData, useFetcher, useLoaderData, useRouteError, useRevalidator, useSubmit \} from "react-router"/);
  assert.match(settingsPageSource, /const submitSettings = useSubmit\(\)/);
  assert.match(settingsPageSource, /const currentMapCoordinateRef = useRef/);
  assert.match(settingsPageSource, /currentMapCoordinateRef\.current = coordinate/);
  assert.match(settingsPageSource, /function appendDepartureCoordinate\(formData, coordinate\)/);
  assert.match(settingsPageSource, /formData\.set\("departureLatitude", String\(coordinate\.latitude\)\)/);
  assert.match(settingsPageSource, /formData\.set\("departureLongitude", String\(coordinate\.longitude\)\)/);
  assert.match(settingsPageSource, /event\.preventDefault\(\)/);
  assert.match(settingsPageSource, /submitSettings\(formData, \{ method: "post" \}\)/);
  assert.doesNotMatch(settingsPageSource, /function getSubmittedDepartureCoordinate\(formData, departureAddress\)/);
  assert.doesNotMatch(settingsPageSource, /coordinateAddress !== departureAddress/);
  assert.match(settingsPageSource, /setMapCoordinate\(null\)/);
});

test("Settings refreshes after a successful save and shows readonly marker coordinates", () => {
  assert.match(settingsPageSource, /const \{ revalidate \} = useRevalidator\(\)/);
  assert.match(settingsPageSource, /const saveSucceeded =/);
  assert.match(settingsPageSource, /lastOperation === "save"/);
  assert.match(settingsPageSource, /actionData\?\.departureLocation/);
  assert.match(settingsPageSource, /revalidate\(\)/);
  assert.doesNotMatch(settingsPageSource, /window\.location\.reload\(\)/);
  assert.match(settingsPageSource, /function formatCoordinateDisplay\(value\)/);
  assert.match(settingsPageSource, /formatCoordinateDisplay\(mapCoordinate\?\.latitude\)/);
  assert.match(settingsPageSource, /formatCoordinateDisplay\(mapCoordinate\?\.longitude\)/);
  assert.match(settingsPageSource, /style=\{settingsReadonlyInputStyle\}/);
});

test("Settings shows the save success alert at the bottom in green text", () => {
  assert.match(settingsPageSource, /const settingsSaveStatusStyle = \{/);
  assert.match(settingsPageSource, /color: "#008060"/);
  assert.match(settingsPageSource, /fontSize: "14px"/);
  assert.match(settingsPageSource, /minHeight: "34px"/);
  assert.match(settingsPageSource, /const shouldShowSaveStatus = Boolean/);
  assert.match(settingsPageSource, /function formatSavedDepartureMessage\(name, copy\)/);
  assert.doesNotMatch(settingsPageSource, /Departure location "\$\{trimmedName\}" has been saved\./);
  assert.match(settingsPageSource, /const savedDepartureMessage = formatSavedDepartureMessage/);
  assert.match(settingsPageSource, /copy\("settings\.departureLocation\.savedWithName", \{ name: trimmedName \}\)/);
  assert.match(settingsPageSource, /copy\("settings\.departureLocation\.saved"\)/);
  assert.match(settingsPageSource, /shouldShowSaveStatus \? \(/);
  assert.match(settingsPageSource, /<p role="status" style=\{settingsSaveStatusStyle\}>\{savedDepartureMessage\}<\/p>/);
  assert.match(settingsPageSource, /const settingsButtonGroupStyle = \{/);
  assert.match(settingsPageSource, /style=\{settingsButtonGroupStyle\}/);
  assert.doesNotMatch(settingsPageSource, />Saved\.<\/p>/);
  assert.doesNotMatch(settingsPageSource, /style=\{settingsMessageStyle\}>Saved\.<\/p>/);
});

test("Settings tab is a plain editable form without explainer cards", () => {
  assert.match(settingsPageSource, /import \{ PageShell \} from "\.\.\/ui\/page-shell"/);
  assert.doesNotMatch(settingsPageSource, /PageSection|PageGrid|ValueList|StatusPill|PageNote/);
  assert.doesNotMatch(settingsPageSource, /aria-label="Settings sections"|ariaLabel="User variables"|ariaLabel="Runtime\/system values"/);
  assert.doesNotMatch(settingsPageSource, /Settings sections|User variables|Runtime\/system values/);
  assert.doesNotMatch(settingsPageSource, /currentUserVariableItems|runtimeSystemValueItems|storeConnectionItems|apiConnectionItems/);
  assert.doesNotMatch(settingsPageSource, /planningDefaultItems|deliveryRuleItems|geocodingItems|syncWebhookItems|capacityItems|advancedItems/);
  assert.doesNotMatch(settingsPageSource, /앱 전체 기본값|Shopify 연결|서버 연결|라우팅 기본값|동기화 설정/);
  assert.doesNotMatch(settingsPageSource, /URL query|section=sync|section=api|section=planning/);
  assert.doesNotMatch(settingsPageSource, /These values|Runtime records|Calculated insight|Merchant-owned start point/);
});
