import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const source = readFileSync(join(root, "app/routes/app.drivers-vehicles.jsx"), "utf8");

test("Drivers tab has a checkbox selection column wired to bulk delete", () => {
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
  assert.match(pageActionsBlock, /Invite driver[\s\S]*Delete selected/);
  assert.match(source, /<td colSpan=\{8\}/);
});

test("Drivers table uses compact support columns and separates joined date", () => {
  assert.match(source, /<col style=\{\{ width: "40px" \}\} \/>/);
  assert.match(source, /<col style=\{\{ width: "14\.4%" \}\} \/>/);
  assert.doesNotMatch(source, /<col style=\{\{ width: "18%" \}\} \/>/);
  assert.match(source, /<col style=\{\{ width: "96px" \}\} \/>/);
  assert.match(source, /<col style=\{\{ width: "154px" \}\} \/>/);
  assert.match(source, /<col style=\{\{ width: "110px" \}\} \/>/);
  assert.match(source, /<th style=\{tableHeaderCellStyle\}>Joined<\/th>/);
  assert.match(source, /<td style=\{tableCellStyle\}>\{driver\.joinedAt\}<\/td>/);
  assert.match(source, /joinedAt: formatDriverTimestamp\(driver\.createdAt\) \?\? "—"/);
  assert.doesNotMatch(source, /<span style=\{\{ color: "#616161", fontSize: "12px" \}\}>\{driver\.lastSeenAt\}<\/span>/);
});

test("Drivers assigned route is informational text, not a clickable route link", () => {
  assert.match(source, /const assignedRouteTextStyle = \{/);
  assert.match(source, /assignedRoute: \{ label: "Unassigned" \}/);
  assert.match(source, /<span style=\{assignedRouteTextStyle\}>\{driver\.assignedRoute\.label\}<\/span>/);
  assert.doesNotMatch(source, /driver\.assignedRoute\.href/);
  assert.doesNotMatch(source, /<a href=\{driver\.assignedRoute\.href\}/);
  assert.doesNotMatch(source, /const routeLinkStyle = \{/);
});

test("Drivers tab separates operational status from app access state", () => {
  assert.match(source, /isInvitePending: false/);
  assert.match(source, /isInvitePending: true/);
  assert.match(source, /const invitePending = authStatusValue === "INVITE_PENDING" \|\| statusValue === "PENDING"/);
  assert.match(source, /status: formatOperationalDriverStatus\(driver\.status, \{ invitePending \}\)/);
  assert.match(source, /authStatus: invitePending \? "Invite pending" : appLinked \? "App linked" : "Not linked"/);
  assert.match(source, /isInvitePending: invitePending/);
  assert.match(source, /isAppLinked: appLinked/);
  assert.match(source, /function canShowDriverInviteActions\(driver\)/);
  assert.match(source, /driver\?\.isInvitePending === true/);
  assert.match(source, /normalizeSearchText\(driver\?\.authStatus\) === "invite pending"/);
  assert.match(source, /function canShowDriverReloginAction\(driver\)/);
  assert.match(source, /driver\?\.isAppLinked === true && driver\?\.isInvitePending !== true/);
  assert.doesNotMatch(source, /status:\s*invitePending \? "Pending"/);
  assert.match(source, /function formatOperationalDriverStatus\(value, \{ invitePending \} = \{\}\)/);
  assert.match(source, /if \(invitePending\) return "Active"/);
  assert.match(source, /visibleDrivers\.filter\(\(driver\) => normalizeSearchText\(driver\.status\) === "active"\)\.length/);
  assert.doesNotMatch(source, /visibleDrivers\.filter\(\(driver\) => driver\.status !== "Inactive"\)\.length/);
  assert.doesNotMatch(source, /normalizeSearchText\(driver\?\.status\) === "pending"/);
  assert.match(source, /<td style=\{appAccessCellStyle\}>/);
  assert.match(source, /<span style=\{appAccessInlineStyle\}>/);
  assert.match(source, /canShowDriverReloginAction\(driver\) \? \(/);
  assert.match(source, /재로그인/);
  assert.match(source, /canShowDriverInviteActions\(driver\) \? \(/);
  assert.match(source, /driver\.inviteCode \? \(/);
  assert.match(source, /inviteCodeRemaining: formatInviteCodeRemaining\(driver\.inviteCodeExpiresAt\)/);
  assert.match(source, /function formatInviteCodeRemaining\(value\)/);
  assert.match(source, /남은 시간 \$\{driver\.inviteCodeRemaining\}/);
  assert.match(source, /<span style=\{inviteCodeValueStyle\}>코드 \{driver\.inviteCode\}<\/span>/);
  assert.match(source, /<span style=\{inviteCodeRemainingStyle\}>\{driver\.inviteCodeRemaining\}<\/span>/);
  assert.match(source, /style=\{compactInviteButtonStyle\}/);
  assert.match(source, /인증코드 생성/);
  assert.match(source, /재생성/);
  assert.match(source, /복사/);
  assert.doesNotMatch(source, /marginTop: "4px"/);
});
