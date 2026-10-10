import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const source = readFileSync(join(root, "app/routes/app.drivers-vehicles.jsx"), "utf8");
const driversPageDataSource = readFileSync(join(root, "app/features/drivers/drivers-page-data.js"), "utf8");

test("Drivers tab has a checkbox selection column wired to bulk delete", () => {
  assert.match(source, /from "\.\.\/features\/drivers\/drivers-page-data"/);
  assert.match(source, /deleteDeliveryDriver/);
  assert.match(source, /const driverDeleteFetcher = useFetcher\(\)/);
  assert.match(source, /const \[checkedDriverIds, setCheckedDriverIds\] = useState\(\[\]\)/);
  assert.match(source, /const \[deletedDriverIds, setDeletedDriverIds\] = useState\(\[\]\)/);
  assert.match(source, /function parseDriverIds\(value\)/);
  assert.match(source, /intent === "deleteDriver"/);
  assert.match(source, /deleteDeliveryDriver\(request, driverId, \{ sessionToken: shopifySessionToken \}\)/);
  assert.match(source, /formData\.set\("driverIds", JSON\.stringify\(checkedDriverIds\)\)/);
  assert.match(source, /driverDeleteFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(source, /aria-label="Select all visible drivers"/);
  assert.match(source, /aria-label=\{`Select \$\{driver\.displayName\} for deletion`\}/);
  assert.match(source, /checked=\{checkedDriverIdSet\.has\(driver\.id\)\}/);
  assert.match(source, /onChange=\{\(\) => toggleDriverCheck\(driver\.id\)\}/);
  assert.match(source, />\s*Delete selected\s*<\/button>/);
  const [, pageActionsBlock = ""] = source.match(/<div style=\{pageActionsStyle\}>([\s\S]*?)<\/div>/) ?? [];
  assert.match(pageActionsBlock, /Invite driver[\s\S]*Download app[\s\S]*Delete selected/);
  assert.match(pageActionsBlock, /onClick=\{openDownloadModal\}/);
  assert.doesNotMatch(pageActionsBlock, /href=|target="_blank"/);
  assert.match(source, /<td colSpan=\{8\}/);
  assert.doesNotMatch(source, /<td colSpan=\{9\}/);
});

test("Drivers download action opens a QR modal without navigating the admin page", () => {
  assert.match(source, /const \[downloadOpen, setDownloadOpen\] = useState\(false\)/);
  assert.match(source, /function openDownloadModal\(\)/);
  assert.match(source, /const useGooglePlay = process\.env\.CLEVER_APP_ID === "clever-route-kfood"/);
  assert.match(source, /fetchDriverAppReleaseNotice\(\{ useGooglePlay \}\)/);
  assert.match(source, /driverDownloadLink: getDriverDownloadLink\(undefined, \{ useGooglePlay \}\)/);
  assert.match(source, /aria-label="Download driver app" style=\{downloadModalStyle\}/);
  assert.match(source, /src=\{useGooglePlay \? "\/icons\/clever-routes-play-qr\.svg" : "\/icons\/driver-download-qr\.svg"\}/);
  assert.match(source, /useGooglePlay \? "QR code for CLEVER Routes on Google Play" : "QR code for the driver app download page"/);
  assert.match(source, /useGooglePlay \? "Scan to open CLEVER Routes on Google Play\." : "Scan this QR code with the phone that will run the driver app\."/);
  assert.match(source, /Available through Google Play open testing\./);
  assert.match(source, /href="https:\/\/play\.google\.com\/apps\/testing\/com\.evnsolution\.clever\.routes"/);
  assert.match(source, />Join open testing<\/a>/);
  assert.match(source, />Copy download link<\/button>/);
  assert.match(source, /\{useGooglePlay \? "Open Google Play" : "Open download page"\}/);
  assert.match(source, /href=\{driverAppDownloadUrl\}/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noreferrer"/);
  const qrAssetPath = join(root, "public/icons/clever-routes-play-qr.svg");
  assert.equal(existsSync(qrAssetPath), true);
  const qrAsset = readFileSync(qrAssetPath, "utf8");
  assert.match(qrAsset, /https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.evnsolution\.clever\.routes/);
  assert.doesNotMatch(qrAsset, /com\.evnsolution\.clever\.driver/);
  assert.doesNotMatch(qrAsset, /clever-route\.cleversystem\.ai\/routes-app/);
  assert.doesNotMatch(qrAsset, /drive\.(?:google|usercontent)\.com/);
});

test("Drivers actions use the app compact button height", () => {
  const [, primaryButtonBlock = ""] = source.match(/const primaryButtonStyle = \{([\s\S]*?)\n\};/) ?? [];

  assert.match(primaryButtonBlock, /alignItems: "center"/);
  assert.match(primaryButtonBlock, /boxSizing: "border-box"/);
  assert.match(primaryButtonBlock, /display: "inline-flex"/);
  assert.match(primaryButtonBlock, /lineHeight: 1\.2/);
  assert.match(primaryButtonBlock, /minHeight: "30px"/);
  assert.match(primaryButtonBlock, /padding: "4px 12px"/);
});

test("Drivers table fits its frame: eight columns, no fixed pixel list above 700 px, and a Driver column that takes what is left", () => {
  const [, colgroupBlock = ""] = source.match(/<colgroup>([\s\S]*?)<\/colgroup>/) ?? [];
  const [, tableHeadBlock = ""] = source.match(/<thead>([\s\S]*?)<\/thead>/) ?? [];
  const [, tableStyleBlock = ""] = source.match(/const tableStyle = \{([\s\S]*?)\n\};/) ?? [];
  const [, surfaceStyleBlock = ""] = source.match(/const driverTableSurfaceStyle = \{([\s\S]*?)\n\};/) ?? [];
  const columns = [...colgroupBlock.matchAll(/<col\b([^>]*?)\/>/g)].map(([, attributes]) => {
    const [, value, unit] = attributes.match(/width: "([\d.]+)(px|%)"/) ?? [];
    return value === undefined ? null : { unit, value: Number(value) };
  });
  // The surface around the table carries the minimum, so that its border still encloses the table.
  const minWidth = Number(surfaceStyleBlock.match(/minWidth: "(\d+)px"/)?.[1]);

  // checkbox, Driver, Phone, Status, Joined, Assigned route, Average Stop time, Recent events
  assert.equal(columns.length, 8);
  assert.equal((tableHeadBlock.match(/<th\b/g) ?? []).length, 8);
  assert.match(tableStyleBlock, /tableLayout: "fixed"/);
  assert.match(tableStyleBlock, /width: "100%"/);

  const fixedPixels = columns.filter((column) => column?.unit === "px").reduce((sum, column) => sum + column.value, 0);
  const percent = columns.filter((column) => column?.unit === "%").reduce((sum, column) => sum + column.value, 0);
  assert.ok(fixedPixels <= 700, `the fixed pixel columns add up to ${fixedPixels}px`);
  assert.ok(percent < 100, `the percentage columns add up to ${percent}%, so nothing is left for the Driver column`);
  assert.equal(columns[1], null, "the Driver column has no width of its own, so the columns beside it cannot squeeze it");

  // The table stops shrinking at minWidth. An 860 px frame is a 834 px table (page padding and border), so it must not scroll there.
  assert.ok(Number.isFinite(minWidth), "the table surface has a pixel minWidth");
  assert.doesNotMatch(tableStyleBlock, /minWidth/);
  assert.ok(minWidth <= 834, `minWidth ${minWidth}px would scroll sideways in an 860 px frame`);
  const widthAtMinimum = columns.map((column) => {
    if (column === null) return minWidth - fixedPixels - (percent / 100) * minWidth;
    return column.unit === "px" ? column.value : (column.value / 100) * minWidth;
  });
  assert.ok(widthAtMinimum[1] >= 100, `the Driver column is ${widthAtMinimum[1]}px at the narrowest table`);
  for (const [index, width] of widthAtMinimum.entries()) {
    assert.ok(width >= (index === 0 ? 40 : 70), `column ${index + 1} is only ${width}px at the narrowest table`);
  }

  assert.match(source, /<th style=\{tableHeaderCellStyle\}>Driver<\/th>/);
  assert.match(source, /<th style=\{tableHeaderCellStyle\}>Joined<\/th>/);
  assert.match(source, /<td style=\{tableCellStyle\}>\{driver\.joinedAt\}<\/td>/);
  assert.match(source, /joinedAt: formatDriverTimestamp\(driver\.createdAt, storeTimeZone\) \?\? "—"/);
  assert.doesNotMatch(source, /<span style=\{\{ color: "#616161", fontSize: "12px" \}\}>\{driver\.lastSeenAt\}<\/span>/);
});

test("Drivers phone cell lets the invite actions wrap instead of hiding them in a shorter column", () => {
  const [, accessInlineBlock = ""] = source.match(/const appAccessInlineStyle = \{([\s\S]*?)\n\};/) ?? [];

  assert.match(accessInlineBlock, /flexWrap: "wrap"/);
  assert.match(source, /<td style=\{appAccessCellStyle\}>\s*<span style=\{appAccessInlineStyle\}>\s*<span>\{driver\.phone\}<\/span>/);
});

test("Drivers name is edited in place with the hover pencil, not through a pencil column and a dialog", () => {
  // The save path on the server stays as it was.
  assert.match(source, /updateDeliveryDriverName/);
  assert.match(source, /const driverUpdateFetcher = useFetcher\(\)/);
  assert.match(source, /intent === "updateDriverName"/);
  assert.match(source, /if \(!driverId \|\| !displayName \|\| displayName\.length > 80\) \{\s*return \{ driver: null, errors: \[\{ message: "1~80자의 배송원 이름을 입력해주세요\." \}\] \};/);
  assert.match(source, /updateDeliveryDriverName\(request, driverId, \{ displayName \}, \{ sessionToken: shopifySessionToken \}\)/);

  // The pencil column and the dialog are gone, with their state and styles.
  for (const removed of [
    /editHeaderCellStyle/,
    /editCellStyle/,
    /editButtonStyle/,
    /openDriverNameEditor/,
    /closeDriverNameEditor/,
    /editingDriverName/,
    /\beditingDriver\b/,
    /driverNameInputStyle/,
    /fieldLabelStyle/,
    /pendingDriverNameId/,
    /driver-display-name/,
    /aria-label="Edit driver name"/,
    /aria-label="Close edit driver"/,
    /<s-icon type="edit"/,
    /<strong>\{driver\.displayName\}<\/strong>/,
  ]) {
    assert.doesNotMatch(source, removed);
  }

  // The name cell is the inline text cell inside a td that shows the pencil on hover, like the Average Stop time cell.
  assert.match(source, /import \{ InlineTextCell, focusInlineTextPencil \} from "\.\.\/features\/delivery\/inline-text-cell"/);
  assert.match(source, /<th style=\{tableHeaderCellStyle\}>Driver<\/th>\s*<th style=\{tableHeaderCellStyle\}>Phone<\/th>/);
  assert.match(source, /<td className="stop-time-td" style=\{driverNameCellStyle\}>\s*<InlineTextCell/);
  assert.match(source, /const driverNameCellStyle = \{\s*\.\.\.tableCellStyle,\s*fontWeight: 700,\s*position: "relative",\s*\};/);
  assert.match(source, /editLabel=\{`Edit \$\{driver\.displayName\} name`\}/);
  assert.match(source, /inputLabel="Driver name"/);
  assert.match(source, /saveLabel="Save driver name"/);
  assert.match(source, /label=\{driver\.displayName\}/);
  assert.match(source, /maxLength=\{80\}/);
  assert.match(source, /itemId=\{driver\.id\}/);
});

test("Drivers name save sends one field through the existing update fetcher and keeps the editor open on an error", () => {
  const [, saveBlock = ""] = source.match(/const saveDriverName = async \(driver\) => \{([\s\S]*?)\n {2}\};/) ?? [];

  // The name is trimmed on save and an empty or over-long one never leaves the page.
  assert.match(saveBlock, /const displayName = nameDraft\?\.driverId === driver\.id \? nameDraft\.value\.trim\(\) : "";/);
  assert.match(saveBlock, /if \(!displayName \|\| displayName\.length > 80 \|\| driverUpdateFetcher\.state !== "idle"\) return;/);
  assert.match(saveBlock, /formData\.set\("_intent", "updateDriverName"\)/);
  assert.match(saveBlock, /formData\.set\("driverId", driver\.id\)/);
  assert.match(saveBlock, /formData\.set\("displayName", displayName\)/);
  assert.match(saveBlock, /formData\.set\("shopifySessionToken", sessionToken\)/);
  assert.match(saveBlock, /driverUpdateFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(saveBlock, /setNameSessionError\("Shopify session token을 가져오지 못했습니다\./);

  // The editor closes only after a different answer arrived without errors; the baseline is the answer of the previous save.
  assert.match(saveBlock, /nameSaveBaseline\.current = driverUpdateFetcher\.data \?\? null;\s*setPendingNameDriverId\(driver\.id\);/);
  assert.match(source, /if \(!pendingNameDriverId \|\| driverUpdateFetcher\.state !== "idle"\) return;\s*if \(!driverUpdateFetcher\.data \|\| driverUpdateFetcher\.data === nameSaveBaseline\.current\) return;/);
  // Another name may be open by then, so only the draft of the saved driver is closed.
  assert.match(source, /if \(updateErrors\.length > 0 \|\| !driverUpdateFetcher\.data\.driver\) return;\s*(?:\/\/[^\n]*\n\s*)?setNameDraft\(\(draft\) => \(draft\?\.driverId === pendingNameDriverId \? null : draft\)\);\s*focusInlineTextPencil\(pendingNameDriverId\);/);

  // The cell takes its draft and busy flag from the page; Cancel hands focus back to the pencil.
  assert.match(source, /draft=\{nameDraft\?\.driverId === driver\.id \? nameDraft\.value : null\}/);
  assert.match(source, /onChange=\{\(value\) => setNameDraft\(\{ driverId: driver\.id, value \}\)\}/);
  assert.match(source, /onSave=\{\(\) => saveDriverName\(driver\)\}/);
  assert.match(source, /onCancel=\{\(\) => \{\s*setNameDraft\(null\);\s*focusInlineTextPencil\(driver\.id\);\s*\}\}/);
  assert.match(source, /const nameSessionErrors = nameSessionError \? \[\{ message: nameSessionError \}\] : \[\];/);
  assert.match(source, /const visibleErrors = \[\.\.\.errors, \.\.\.driverDeleteErrors, \.\.\.driverUpdateErrors, \.\.\.averageSessionErrors, \.\.\.nameSessionErrors\];/);
});

test("Drivers name cell keeps a name on one line with an ellipsis and the full name as its title", () => {
  const css = readFileSync(join(root, "app/styles/global.css"), "utf8");
  const [, labelRule = ""] = css.match(/\.inline-text-cell__label \{([^}]*)\}/) ?? [];
  const [, inputRule = ""] = css.match(/\.inline-text-cell__input \{([^}]*)\}/) ?? [];

  assert.match(labelRule, /min-width: 0;/);
  assert.match(labelRule, /overflow: hidden;/);
  assert.match(labelRule, /text-overflow: ellipsis;/);
  assert.match(labelRule, /white-space: nowrap;/);
  assert.match(inputRule, /min-width: 0;/);
  assert.match(inputRule, /text-align: left;/);
  // The sticky header needs the page scroll, so the table is not wrapped in a scrolling box.
  assert.match(source, /const tableWrapStyle = \{[^}]*overflow: "visible"/);
});

test("Drivers assigned route is informational text, not a clickable route link", () => {
  assert.match(source, /const assignedRouteTextStyle = \{/);
  assert.match(driversPageDataSource, /assignedRoute: \{ label: "Unassigned" \}/);
  assert.match(source, /<span style=\{assignedRouteTextStyle\}>\{driver\.assignedRoute\.label\}<\/span>/);
  assert.doesNotMatch(source, /driver\.assignedRoute\.href/);
  assert.doesNotMatch(source, /<a href=\{driver\.assignedRoute\.href\}/);
  assert.doesNotMatch(source, /const routeLinkStyle = \{/);
});

test("Drivers tab keeps app access state internal and places invite actions beside the phone", () => {
  assert.match(driversPageDataSource, /isInvitePending: false/);
  assert.match(driversPageDataSource, /isInvitePending: true/);
  assert.match(source, /const invitePending = authStatusValue === "INVITE_PENDING" \|\| statusValue === "PENDING"/);
  assert.match(source, /status: formatOperationalDriverStatus\(driver\.status, \{ invitePending \}\)/);
  assert.doesNotMatch(source, /authStatus: invitePending \? "Invite pending" : appLinked \? "App linked" : "Not linked"/);
  assert.match(source, /isInvitePending: invitePending/);
  assert.match(source, /isAppLinked: appLinked/);
  assert.match(source, /function canShowDriverInviteActions\(driver\)/);
  assert.equal(source.includes(["CLEVER_DRIVER", "DOWNLOAD_URL"].join("_")), false);
  assert.match(source, /driverDownloadLink: getDriverDownloadLink\(undefined, \{ useGooglePlay \}\)/);
  assert.doesNotMatch(source, /https:\/\/clever\.delivery\/driver\/download/);
  assert.match(source, /driver\?\.isInvitePending === true/);
  assert.doesNotMatch(source, /normalizeSearchText\(driver\?\.authStatus\) === "invite pending"/);
  assert.match(source, /function canShowDriverReloginAction\(driver\)/);
  assert.match(source, /driver\?\.isAppLinked === true && driver\?\.isInvitePending !== true/);
  assert.doesNotMatch(source, /status:\s*invitePending \? "Pending"/);
  assert.match(source, /function formatOperationalDriverStatus\(value, \{ invitePending \} = \{\}\)/);
  assert.match(source, /if \(invitePending\) return "Active"/);
  assert.match(source, /visibleDrivers\.filter\(\(driver\) => normalizeSearchText\(driver\.status\) === "active"\)\.length/);
  assert.doesNotMatch(source, /visibleDrivers\.filter\(\(driver\) => driver\.status !== "Inactive"\)\.length/);
  assert.doesNotMatch(source, /normalizeSearchText\(driver\?\.status\) === "pending"/);
  assert.doesNotMatch(source, />App access<\/th>/);
  assert.doesNotMatch(source, /\{driver\.authStatus\}/);
  assert.doesNotMatch(source, /"Invite pending"|"App linked"|"Not linked"/);
  assert.match(source, /<td style=\{appAccessCellStyle\}>\s*<span style=\{appAccessInlineStyle\}>\s*<span>\{driver\.phone\}<\/span>/);
  assert.match(source, /<span style=\{appAccessInlineStyle\}>/);
  assert.match(source, /canShowDriverReloginAction\(driver\) \? \(/);
  assert.match(source, /재로그인/);
  assert.match(source, /canShowDriverInviteActions\(driver\) \? \(/);
  assert.match(source, /driver\.inviteCode \? \(/);
  assert.match(source, /<span style=\{inviteCodeValueStyle\}>코드 \{driver\.inviteCode\}<\/span>/);
  assert.doesNotMatch(source, /inviteCodeRemaining|formatInviteCodeRemaining|inviteCodeRemainingStyle|남은 시간/);
  assert.doesNotMatch(source, /copyDriverInviteMessage/);
  assert.match(source, /style=\{compactInviteButtonStyle\}/);
  assert.match(source, /인증코드 생성/);
  assert.match(source, /재생성/);
  assert.doesNotMatch(source, /marginTop: "4px"/);
});

test("Drivers table has an Average Stop time column edited in place with the Stop time cell", () => {
  assert.match(source, /import \{ StopTimeCell \} from "\.\.\/features\/delivery\/route-stop-time-cell"/);
  assert.match(source, /updateDeliveryDriverAverageStopTime/);
  assert.match(source, /<th style=\{tableHeaderCellStyle\}>Assigned route<\/th>\s*<th style=\{tableHeaderCellStyle\}>Average Stop time<\/th>\s*<th style=\{tableHeaderCellStyle\}>Recent events<\/th>/);
  assert.match(source, /<td className="stop-time-td" style=\{averageStopTimeCellStyle\}>/);
  assert.match(source, /const averageStopTimeCellStyle = \{\s*\.\.\.tableCellStyle,\s*position: "relative",\s*\};/);
  assert.match(source, /<StopTimeCell\s+allowEmpty/);
  assert.match(source, /label=\{formatAverageStopTime\(driver\.averageServiceMinutes\)\}/);
  assert.match(source, /subject="average stop time"/);
  assert.match(source, /orderLabel=\{driver\.displayName\}/);
  assert.match(source, /averageServiceMinutes: Number\.isInteger\(driver\.averageServiceMinutes\) \? driver\.averageServiceMinutes : null/);
  assert.match(source, /return Number\.isInteger\(minutes\) \? `\$\{minutes\} min` : "—"/);
});

test("Drivers average Stop time save sends one field through the existing update fetcher and keeps the editor open on an error", () => {
  assert.match(source, /intent === "updateDriverAverageStopTime"/);
  assert.match(source, /minutesText === "" \? null : readStopTimeMinutes\(minutesText\)/);
  assert.match(source, /updateDeliveryDriverAverageStopTime\(\s*request,\s*driverId,\s*\{ averageServiceMinutes \},/);
  assert.match(source, /formData\.set\("_intent", "updateDriverAverageStopTime"\)/);
  assert.match(source, /formData\.set\("averageServiceMinutes", averageDraft\.value\.trim\(\)\)/);
  assert.match(source, /driverUpdateFetcher\.submit\(formData, \{ method: "post" \}\)/);
  assert.match(source, /busy=\{driverUpdateFetcher\.state !== "idle"\}/);
  assert.match(source, /if \(updateErrors\.length > 0 \|\| !driverUpdateFetcher\.data\.driver\) return;\s*setAverageDraft\(null\);/);
  // The fetcher still holds the answer of the previous save, so a save is finished when a different answer arrives.
  assert.match(source, /averageSaveBaseline\.current = driverUpdateFetcher\.data \?\? null;\s*setPendingAverageDriverId\(driver\.id\);/);
  assert.match(source, /if \(!pendingAverageDriverId \|\| driverUpdateFetcher\.state !== "idle"\) return;\s*if \(!driverUpdateFetcher\.data \|\| driverUpdateFetcher\.data === averageSaveBaseline\.current\) return;/);
});
