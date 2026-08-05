import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

const root = process.cwd();
const settingsPageSource = readFileSync(
  join(root, "app/routes/app.settings.jsx"),
  "utf8",
);
const notificationsPageSource = readFileSync(
  join(root, "app/routes/app.settings_.notifications.jsx"),
  "utf8",
);
const notificationLogoUploadRouteSource = readFileSync(
  join(root, "app/routes/app.settings_.notifications_.logo.jsx"),
  "utf8",
);
const templateTokenEditorSource = readFileSync(
  join(root, "app/features/customer-notifications/template-token-editor.jsx"),
  "utf8",
);
const notificationPreviewSource = notificationsPageSource.slice(
  notificationsPageSource.indexOf("function NotificationPreview"),
  notificationsPageSource.indexOf("export function ErrorBoundary"),
);
const normalizeCustomerEmailSettingsSource = notificationsPageSource.slice(
  notificationsPageSource.indexOf("function normalizeCustomerEmailSettings"),
  notificationsPageSource.indexOf("function formText"),
);
const templateExampleModalSource = notificationsPageSource.slice(
  notificationsPageSource.indexOf("{templateExampleOpen ? ("),
  notificationsPageSource.indexOf("{templateEditorSignal ? ("),
);
const notificationBrandingSectionSource = notificationsPageSource.slice(
  notificationsPageSource.indexOf('<section aria-label="Notification branding"'),
  notificationsPageSource.indexOf('<section aria-label="Email templates"'),
);
const settingsLayoutSource = readFileSync(
  join(root, "app/features/settings/settings-layout.jsx"),
  "utf8",
);
const settingsDepartureMapSource = readFileSync(
  join(root, "app/features/settings/settings-departure-map.jsx"),
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
  assert.doesNotMatch(settingsPageSource, /fetchCustomerEmailSettings/);
  assert.doesNotMatch(settingsPageSource, /useSearchParams|searchParams\.get\("section"\)/);
});

test("Customer Notifications route uses the canonical BFF boundary", () => {
  assert.match(notificationsPageSource, /from "\.\.\/features\/customer-notifications\/customer-email\.server"/);
  assert.doesNotMatch(notificationsPageSource, /features\/delivery\/customer-email\.server/);
  assert.doesNotMatch(settingsPageSource, /fetchCustomerNotificationSettings|saveCustomerNotificationSettingsFromForm|saveCustomerEmailSettings/);
  assert.doesNotMatch(notificationsPageSource, /metafieldsSet[\s\S]*customerEmail/i);
  assert.doesNotMatch(notificationsPageSource, /customerEmail[\s\S]*currentAppInstallation/i);
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
  assert.match(settingsPageSource, /settingsSelectStyle/);
  assert.match(settingsLayoutSource, /export const settingsSelectStyle = \{[\s\S]*\.\.\.settingsInputStyle,[\s\S]*height: "36px"/);
  assert.match(settingsPageSource, /<select[\s\S]*name="language"[\s\S]*style=\{settingsSelectStyle\}[\s\S]*value=\{language\}/);
  assert.match(settingsPageSource, /SUPPORTED_LANGUAGES\.map\(\(option\) =>/);
  assert.match(settingsPageSource, /<option key=\{option\.code\} value=\{option\.code\}>/);
  assert.match(settingsPageSource, /\{option\.label\}/);
  assert.doesNotMatch(settingsPageSource, /aria-label="Settings sections"|ariaLabel="User variables"|ariaLabel="Runtime\/system values"/);
});

test("Settings tab lets operators preview geocoding and adjust the pin on a map", () => {
  assert.doesNotMatch(settingsPageSource, /export const links = \(\)/);
  assert.match(settingsDepartureMapSource, /const OPENFREEMAP_STYLE_URL = "\/vendor\/openfreemap-liberty\.json"/);
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
  assert.match(settingsPageSource, /import \{ SettingsDepartureMap \} from "\.\.\/features\/settings\/settings-departure-map"/);
  assert.match(settingsPageSource, /<SettingsDepartureMap/);
  assert.match(settingsDepartureMapSource, /import \{ MapPanel, MapToolbar, renderMapFitIcon, renderMapZoomInIcon, renderMapZoomOutIcon \} from "\.\.\/\.\.\/ui\/map-panel"/);
  assert.match(settingsDepartureMapSource, /ariaLabel="Departure location map"/);
  assert.match(settingsDepartureMapSource, /ariaLabel: "Fit highlighted map markers"/);
  assert.match(settingsDepartureMapSource, /renderMapZoomInIcon\(\)/);
  assert.match(settingsDepartureMapSource, /renderMapZoomOutIcon\(\)/);
  assert.doesNotMatch(settingsDepartureMapSource, /NavigationControl/);
  assert.match(settingsDepartureMapSource, /const handleFitHighlightedMapMarkers = useCallback\(\(\) => \{/);
  assert.match(settingsDepartureMapSource, /await import\("maplibre-gl"\)/);
  assert.match(settingsDepartureMapSource, /new maplibregl\.Marker\(\{\s*color: "#008060",\s*draggable: true,\s*\}\)/);
  assert.match(settingsDepartureMapSource, /markerRef\.current\.on\("dragend"/);
  assert.match(settingsDepartureMapSource, /onCoordinateChangeRef\.current\(\{/);
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
  assert.match(settingsLayoutSource, /export const settingsSaveStatusStyle = \{/);
  assert.match(settingsLayoutSource, /color: "#008060"/);
  assert.match(settingsLayoutSource, /fontSize: "14px"/);
  assert.match(settingsLayoutSource, /minHeight: "34px"/);
  assert.match(settingsPageSource, /const shouldShowSaveStatus = Boolean/);
  assert.match(settingsPageSource, /function formatSavedDepartureMessage\(name, copy\)/);
  assert.doesNotMatch(settingsPageSource, /Departure location "\$\{trimmedName\}" has been saved\./);
  assert.match(settingsPageSource, /const savedDepartureMessage = formatSavedDepartureMessage/);
  assert.match(settingsPageSource, /copy\("settings\.departureLocation\.savedWithName", \{ name: trimmedName \}\)/);
  assert.match(settingsPageSource, /copy\("settings\.departureLocation\.saved"\)/);
  assert.match(settingsPageSource, /shouldShowSaveStatus \? \(/);
  assert.match(settingsPageSource, /<p role="status" style=\{settingsSaveStatusStyle\}>\{savedDepartureMessage\}<\/p>/);
  assert.match(settingsLayoutSource, /export const settingsButtonGroupStyle = \{/);
  assert.match(settingsPageSource, /style=\{settingsButtonGroupStyle\}/);
  assert.doesNotMatch(settingsPageSource, />Saved\.<\/p>/);
  assert.doesNotMatch(settingsPageSource, /style=\{settingsMessageStyle\}>Saved\.<\/p>/);
});

test("Settings splits General and Customer Notifications into internal routes", () => {
  assert.match(settingsPageSource, /<SettingsLayout>/);
  assert.match(notificationsPageSource, /<SettingsLayout>/);
  assert.match(settingsLayoutSource, /href: "\/app\/settings"/);
  assert.match(settingsLayoutSource, /href: "\/app\/settings\/notifications"/);
  assert.match(settingsLayoutSource, /Customer Notifications/);
  assert.match(settingsLayoutSource, /aria-label="Settings sections"/);
  assert.match(settingsLayoutSource, /grid-template-columns: 160px minmax\(0, 760px\)/);
  assert.match(settingsLayoutSource, /@media \(max-width: 760px\)/);
  assert.match(settingsLayoutSource, /overflow-x: auto/);
  assert.doesNotMatch(settingsPageSource, /CustomerEmailSettings|saveCustomerEmailSettings|testCustomerEmail/);
});

test("Customer Notifications keeps sender, templates, explicit tests, and compact logo preview", () => {
  assert.match(notificationsPageSource, /fetchCustomerEmailSettings/);
  assert.match(notificationsPageSource, /saveCustomerEmailGlobal/);
  assert.match(notificationsPageSource, /saveCustomerEmailTemplate/);
  assert.match(notificationsPageSource, /sendCustomerEmailTest/);
  assert.match(notificationsPageSource, /branding: \{/);
  assert.match(notificationsPageSource, /senderEmail/);
  assert.match(notificationsPageSource, /senderName/);
  assert.match(notificationsPageSource, /settings\?\.senderEmail \?\? sender\.email/);
  assert.match(notificationsPageSource, /settings\?\.senderName \?\? sender\.name/);
  assert.match(notificationsPageSource, /Logo upload/);
  assert.match(notificationsPageSource, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(notificationsPageSource, /CUSTOMER_EMAIL_LOGO_MAX_BYTES = 3 \* 1024 \* 1024/);
  assert.match(notificationsPageSource, /Logo must be 3 MiB or smaller\./);
  assert.match(notificationsPageSource, /uploadCustomerEmailLogo/);
  assert.match(notificationsPageSource, /CUSTOMER_EMAIL_LOGO_UPLOAD_PATH/);
  assert.match(notificationsPageSource, /xhr\.open\("POST", CUSTOMER_EMAIL_LOGO_UPLOAD_PATH\)/);
  assert.match(notificationsPageSource, /xhr\.setRequestHeader\("Authorization", `Bearer \$\{sessionToken\}`\)/);
  assert.match(notificationsPageSource, /_intent", "uploadCustomerEmailLogo"/);
  assert.match(notificationsPageSource, /xhr\.upload\.onprogress/);
  assert.match(notificationsPageSource, /setLogoUploadStatus\(\{ kind: "success"/);
  assert.match(notificationsPageSource, /logoMode: "image"/);
  assert.match(notificationsPageSource, /Logo settings/);
  assert.match(notificationsPageSource, /Logo upload/);
  assert.match(notificationsPageSource, /formHttpsUrl\(formData\.get\("branding\.logoUrl"\)\)/);
  assert.match(notificationsPageSource, /logoMode/);
  assert.match(notificationsPageSource, /logoWidth/);
  assert.match(notificationsPageSource, /logoLinkUrl/);
  assert.match(notificationsPageSource, /businessName/);
  assert.match(notificationsPageSource, /contactEmail/);
  assert.match(notificationsPageSource, /websiteUrl/);
  assert.match(notificationsPageSource, /note/);
  assert.match(notificationsPageSource, /formData\.set\("subject", renderTemplatePreviewValue\(templateDraft\.subject\)\)/);
  assert.match(notificationsPageSource, /formData\.set\("body", renderTemplatePreviewValue\(templateDraft\.body\)\)/);
  assert.match(notificationsPageSource, /subject: formText\(formData\.get\("subject"\)\)/);
  assert.match(notificationsPageSource, /body: formText\(formData\.get\("body"\)\)/);
  assert.doesNotMatch(notificationsPageSource, /id="test-customer-email-subject"|label="Test subject"/);
  assert.doesNotMatch(notificationsPageSource, /id="test-customer-email-body"|label="Test body"/);
  assert.doesNotMatch(notificationsPageSource, /lastSyncedTestSignal|testSubject|testBody/);
  assert.doesNotMatch(notificationsPageSource, /BRANDING_COLOR_FIELDS/);
  assert.doesNotMatch(notificationsPageSource, /type="color"/);
  assert.doesNotMatch(notificationsPageSource, />Logo alt text</);
  assert.doesNotMatch(notificationsPageSource, />Preview text</);
  assert.doesNotMatch(notificationsPageSource, />Show powered by CLEVER</);
  assert.doesNotMatch(notificationsPageSource, />Footer text</);
  assert.doesNotMatch(notificationsPageSource, /primaryColor|poweredByEnabled|logoHref|logoAlt:/);
  assert.match(notificationsPageSource, /Live notification preview/);
  assert.match(notificationsPageSource, /Email templates/);
  assert.match(notificationsPageSource, /Send test/);
  assert.doesNotMatch(notificationsPageSource, /HTTPS logo URL/);
  assert.doesNotMatch(notificationsPageSource, /placeholder="https:\/\/cdn\.example\.com\/logo\.png"/);
});

test("Customer Notifications uses numeric optimistic-lock versions and a JSON resource upload route", () => {
  assert.match(notificationsPageSource, /expectedVersion: numberFromFormValue\(formData\.get\("expectedVersion"\)\)/);
  assert.match(notificationLogoUploadRouteSource, /export const action/);
  assert.match(notificationLogoUploadRouteSource, /authenticate\.admin\(request\)/);
  assert.match(notificationLogoUploadRouteSource, /return Response\.json\(result\)/);
});

test("Customer Notifications modal includes padding inside its scroll height", () => {
  assert.match(notificationsPageSource, /const notificationModalBodyStyle = \{[\s\S]*?boxSizing: "border-box"/);
  assert.match(notificationsPageSource, /const notificationModalStyle = \{[\s\S]*?gridTemplateRows: "auto minmax\(0, 1fr\)"/);
});

test("Customer Notifications keeps the template example behind preview and brand-only edit modes", () => {
  assert.match(notificationsPageSource, /function SettingsEditorModal/);
  assert.match(notificationsPageSource, /aria-modal="true"[\s\S]*role="dialog"/);
  assert.match(notificationsPageSource, />Template example<\/button>/);
  assert.match(notificationsPageSource, /ariaLabel="Template example"/);
  assert.match(notificationsPageSource, />Preview<\/button>/);
  assert.match(notificationsPageSource, />Edit<\/button>/);
  assert.match(notificationsPageSource, /templateExampleMode === "preview"/);
  assert.match(notificationsPageSource, /templateExampleMode === "edit"/);
  assert.match(templateExampleModalSource, /aria-label="Branding controls"/);
  assert.match(templateExampleModalSource, /<NotificationPreview activeTemplate=\{activeTemplate\} branding=\{branding\}/);
  assert.doesNotMatch(notificationBrandingSectionSource, /NotificationPreview/);
  assert.doesNotMatch(templateExampleModalSource, /templateDraft|>Subject<|>Body</);
  assert.match(notificationsPageSource, /aria-label=\{`Edit \$\{label\} template`\}/);
  assert.match(notificationsPageSource, /<TemplateTokenEditor/);
  assert.match(notificationsPageSource, />Apply changes<\/button>/);
  assert.match(notificationsPageSource, /"Save template"/);
  assert.doesNotMatch(notificationsPageSource, /onChange=\{\(event\) => updateTemplate/);
});

test("Customer Notifications uses one caret-aware token editor without duplicate test editing", () => {
  assert.match(notificationsPageSource, /import \{\s*TemplateTokenEditor,\s*\} from "\.\.\/features\/customer-notifications\/template-token-editor"/);
  assert.doesNotMatch(notificationsPageSource, /insertTemplateVariable|setSelectionRange|templateBodyRef/);
  assert.doesNotMatch(notificationsPageSource, /<textarea maxLength=\{10000\}[\s\S]*templateDraft\.body/);
  assert.doesNotMatch(notificationsPageSource, /<textarea aria-label="Test body"|<input aria-label="Test subject"/);
  assert.doesNotMatch(notificationsPageSource, /<label style=\{settingsLabelStyle\}>Subject<input/);
  assert.doesNotMatch(notificationsPageSource, /`\{\{\$\{variable\}\}\}`/);
  assert.doesNotMatch(notificationsPageSource, /id="test-customer-email-subject"|id="test-customer-email-body"/);
  assert.match(notificationsPageSource, /id=\{`template-\$\{templateEditorSignal\}-subject`\}/);
  assert.match(notificationsPageSource, /id=\{`template-\$\{templateEditorSignal\}-body`\}/);
  assert.match(templateTokenEditorSource, /parseTemplateDocument/);
  assert.match(templateTokenEditorSource, /serializeTemplateDocument/);
  assert.match(templateTokenEditorSource, /selectionRangeInsideEditor/);
  assert.match(templateTokenEditorSource, /range\.insertNode\(token\)/);
  assert.match(templateTokenEditorSource, /onPaste=\{handlePaste\}/);
  assert.match(templateTokenEditorSource, /role="textbox"/);
  assert.match(templateTokenEditorSource, /contentEditable=\{!disabled\}/);
  assert.match(templateTokenEditorSource, /setAttribute\("aria-label", "Unsupported template variable"\)/);
  assert.match(templateTokenEditorSource, /token\.textContent = "Unsupported variable"/);
  assert.doesNotMatch(templateTokenEditorSource, /aria-label=\{`Unsupported variable \$\{segment\.raw\}`\}|Unsupported: \{segment\.raw/);
  assert.match(templateTokenEditorSource, /deliveryWeekday: "Delivery weekday"/);
  assert.match(templateTokenEditorSource, /inventoryList: "Inventory list"/);
  assert.match(templateTokenEditorSource, />\s*Insert variable\s*/);
  assert.match(templateTokenEditorSource, /placeholder="Search variables"/);
  assert.doesNotMatch(templateTokenEditorSource, /display: "flex",\s*flexWrap: "wrap"/);
  assert.doesNotMatch(templateTokenEditorSource, /raw\/source|Source mode|Raw template/i);
});

test("Customer Notifications uses a fixed template table and contextual live preview", () => {
  assert.match(notificationsPageSource, /<table aria-label="Email templates"/);
  assert.match(notificationsPageSource, />Notification<\/th>/);
  assert.match(notificationsPageSource, />Subject<\/th>/);
  assert.match(notificationsPageSource, />Status<\/th>/);
  assert.match(notificationsPageSource, /aria-label="Email preview and test"/);
  assert.match(notificationsPageSource, /<NotificationPreview activeTemplate=\{templateDraft\}/);
  assert.match(notificationsPageSource, />Send this preview<\/strong>/);
  assert.match(notificationsPageSource, /Sends one test using the current draft and example data\./);
  assert.doesNotMatch(notificationsPageSource, /<section aria-label="Send a test notification"/);
  assert.match(notificationsPageSource, /gridTemplateColumns: "minmax\(0, 1\.05fr\) minmax\(340px, 0\.95fr\)"/);
  assert.match(notificationsPageSource, /@media \(max-width: 900px\)/);
});

test("Customer Notifications saves global and template changes through isolated partial BFF intents", () => {
  const templateSettingsReader = notificationsPageSource.slice(
    notificationsPageSource.indexOf("function readCustomerEmailTemplateSettings"),
    notificationsPageSource.indexOf("function normalizeCustomerEmailSettings"),
  );
  const globalSettingsReader = notificationsPageSource.slice(
    notificationsPageSource.indexOf("function readCustomerEmailGlobalSettings"),
    notificationsPageSource.indexOf("function readCustomerEmailTemplateSettings"),
  );

  assert.match(notificationsPageSource, /formData\.get\("_intent"\) === "saveCustomerEmailTemplate"/);
  assert.match(notificationsPageSource, /formData\.get\("_intent"\) === "saveCustomerEmailGlobal"/);
  assert.match(notificationsPageSource, /saveCustomerEmailGlobal\(request, readCustomerEmailGlobalSettings\(formData\)/);
  assert.match(notificationsPageSource, /saveCustomerEmailTemplate\(request, payload\.signal, payload\.customerEmailTemplate/);
  assert.match(notificationsPageSource, /formData\.set\("_intent", "saveCustomerEmailTemplate"\)/);
  assert.match(notificationsPageSource, /formData\.set\("_intent", nextIntent\)/);
  assert.match(notificationsPageSource, /formData\.set\("expectedVersion", settings\.globalVersion \?\? ""\)/);
  assert.match(notificationsPageSource, /formData\.set\("expectedVersion", settings\.templates\[templateEditorSignal\]\?\.version \?\? ""\)/);
  assert.match(globalSettingsReader, /expectedVersion: numberFromFormValue\(formData\.get\("expectedVersion"\)\)/);
  assert.match(globalSettingsReader, /businessName: formText\(formData\.get\("branding\.businessName"\)\)/);
  assert.match(globalSettingsReader, /address: formText\(formData\.get\("branding\.address"\)\)/);
  assert.match(globalSettingsReader, /phone: formText\(formData\.get\("branding\.phone"\)\)/);
  assert.match(globalSettingsReader, /contactEmail: formText\(formData\.get\("branding\.contactEmail"\)\)/);
  assert.match(globalSettingsReader, /websiteUrl: formHttpsUrl\(formData\.get\("branding\.websiteUrl"\)\)/);
  assert.match(globalSettingsReader, /note: formText\(formData\.get\("branding\.note"\)\)/);
  assert.match(templateSettingsReader, /expectedVersion: numberFromFormValue\(formData\.get\("expectedVersion"\)\)/);
  assert.match(templateSettingsReader, /body,/);
  assert.match(templateSettingsReader, /enabled,/);
  assert.match(templateSettingsReader, /subject,/);
  assert.match(templateSettingsReader, /hasUnsupportedTemplateSegments\(parseTemplateDocument\(subject\)\)/);
  assert.match(templateSettingsReader, /hasUnsupportedTemplateSegments\(parseTemplateDocument\(body\)\)/);
  assert.match(notificationsPageSource, /templateDraftUnsupported\.body \|\| templateDraftUnsupported\.subject/);
  assert.match(notificationsPageSource, /const setTemplateDraftSubjectUnsupported = useCallback\(\(hasUnsupported\) =>/);
  assert.match(notificationsPageSource, /const setTemplateDraftBodyUnsupported = useCallback\(\(hasUnsupported\) =>/);
  assert.match(notificationsPageSource, /current\.subject === hasUnsupported \? current : \{ \.\.\.current, subject: hasUnsupported \}/);
  assert.match(notificationsPageSource, /current\.body === hasUnsupported \? current : \{ \.\.\.current, body: hasUnsupported \}/);
  assert.match(notificationsPageSource, /onUnsupportedChange=\{setTemplateDraftSubjectUnsupported\}/);
  assert.match(notificationsPageSource, /onUnsupportedChange=\{setTemplateDraftBodyUnsupported\}/);
  assert.doesNotMatch(notificationsPageSource, /setTemplateDraftUnsupportedFlag\("subject"\)|setTemplateDraftUnsupportedFlag\("body"\)/);
  assert.doesNotMatch(templateSettingsReader, /Object\.fromEntries\(CUSTOMER_EMAIL_SIGNALS/);
  assert.doesNotMatch(notificationsPageSource, /currentCustomerEmailSettings|appendCurrentSettings|readCurrentCustomerEmailSettings|parseJsonObject/);
  assert.doesNotMatch(globalSettingsReader, /templates:|template\.\$\{signal\}|nearbyStopsThreshold|footerText/);
  assert.match(notificationsPageSource, /setTemplateEditorSignal\(null\)/);
  assert.match(notificationsPageSource, /intent !== "saveCustomerEmailTemplate"/);
  assert.match(notificationsPageSource, /fetcher\.state !== "idle"/);
  assert.match(notificationsPageSource, /fetcher\.data\.customerEmailTemplate/);
  assert.match(notificationsPageSource, /fetcher\.data\.globalVersion/);
});

test("Customer Notifications keeps Route Ops nearby threshold ownership out of this page", () => {
  assert.doesNotMatch(notificationsPageSource, /nearbyStopsThreshold|Nearby trigger stops/);
});

test("Customer Notifications normalizes structured common footer fields with legacy footerText as note only", () => {
  assert.match(normalizeCustomerEmailSettingsSource, /businessName: branding\.businessName \?\? ""/);
  assert.match(normalizeCustomerEmailSettingsSource, /address: branding\.address \?\? ""/);
  assert.match(normalizeCustomerEmailSettingsSource, /phone: branding\.phone \?\? ""/);
  assert.match(normalizeCustomerEmailSettingsSource, /contactEmail: branding\.contactEmail \?\? ""/);
  assert.match(normalizeCustomerEmailSettingsSource, /websiteUrl: branding\.websiteUrl \?\? ""/);
  assert.match(normalizeCustomerEmailSettingsSource, /note: branding\.note \?\? branding\.footerText \?\? ""/);
  assert.doesNotMatch(normalizeCustomerEmailSettingsSource, /footerText:/);
});

test("Customer Notifications preview renders an optional boxed structured common footer", () => {
  assert.match(notificationsPageSource, /const footerLogo = logo \? \(/);
  assert.match(notificationsPageSource, /justifySelf: "start"/);
  assert.match(notificationsPageSource, /objectFit: "contain"/);
  assert.match(notificationsPageSource, /maxHeight: "64px"/);
  assert.match(notificationsPageSource, /maxWidth: "160px"/);
  assert.match(notificationsPageSource, /fontSize: "24px"/);
  assert.match(notificationPreviewSource, /const footerItems = buildCommonFooterItems\(branding\)/);
  assert.match(notificationPreviewSource, /const hasCommonFooter = logo \|\| footerItems\.length > 0/);
  assert.match(notificationPreviewSource, /\{hasCommonFooter \? \(/);
  assert.match(notificationPreviewSource, /<hr aria-hidden="true" style=\{notificationPreviewDividerStyle\} \/>/);
  assert.match(notificationPreviewSource, /<div className="customer-email-preview__footer" style=\{notificationPreviewFooterBoxStyle\}>[\s\S]*\{footerLogo\}/);
  assert.match(notificationPreviewSource, /footerItems\.map/);
  assert.match(notificationsPageSource, /\["businessName", branding\.businessName\]/);
  assert.match(notificationsPageSource, /\["address", branding\.address\]/);
  assert.match(notificationsPageSource, /\["phone", branding\.phone\]/);
  assert.match(notificationsPageSource, /\["contactEmail", branding\.contactEmail\]/);
  assert.match(notificationsPageSource, /\["websiteUrl", branding\.websiteUrl\]/);
  assert.match(notificationsPageSource, /\["note", branding\.note\]/);
  assert.match(notificationsPageSource, /background: "#f3f4f6"/);
  assert.match(notificationsPageSource, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(notificationPreviewSource, /branding\.previewText/);
  assert.doesNotMatch(notificationPreviewSource, /branding\.accentColor/);
  assert.doesNotMatch(notificationPreviewSource, /branding\.logoAltText/);
  assert.doesNotMatch(notificationPreviewSource, /branding\.footerText/);
  assert.doesNotMatch(notificationsPageSource, /<strong[\s\S]*\{subject\}<\/strong>[\s\S]*<p[\s\S]*\{body\}<\/p>[\s\S]*<div[\s\S]*<img/);
});

test("Settings tab is a plain editable form without explainer cards", () => {
  assert.match(settingsPageSource, /import \{ PageShell \} from "\.\.\/ui\/page-shell"/);
  assert.doesNotMatch(settingsPageSource, /PageSection|PageGrid|ValueList|StatusPill|PageNote/);
  assert.doesNotMatch(settingsPageSource, /ariaLabel="User variables"|ariaLabel="Runtime\/system values"/);
  assert.doesNotMatch(settingsPageSource, /Settings sections|User variables|Runtime\/system values/);
  assert.doesNotMatch(settingsPageSource, /currentUserVariableItems|runtimeSystemValueItems|storeConnectionItems|apiConnectionItems/);
  assert.doesNotMatch(settingsPageSource, /planningDefaultItems|deliveryRuleItems|geocodingItems|syncWebhookItems|capacityItems|advancedItems/);
  assert.doesNotMatch(settingsPageSource, /앱 전체 기본값|Shopify 연결|서버 연결|라우팅 기본값|동기화 설정/);
  assert.doesNotMatch(settingsPageSource, /URL query|section=sync|section=api|section=planning/);
  assert.doesNotMatch(settingsPageSource, /These values|Runtime records|Calculated insight|Merchant-owned start point/);
});
