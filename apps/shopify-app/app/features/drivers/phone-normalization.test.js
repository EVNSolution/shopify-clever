import assert from "node:assert/strict";
import test from "node:test";

import {
  formatInvitePhoneInput,
  formatSavedDriverPhone,
  getDriverDownloadLink,
  normalizeInvitePhone,
} from "./phone-normalization.js";

test("normalizes Korean driver invite numbers from local 010 input", () => {
  assert.equal(normalizeInvitePhone("+82", "010-1234-5678"), "+821012345678");
  assert.equal(normalizeInvitePhone("+82", "010 1234 5678"), "+821012345678");
  assert.equal(normalizeInvitePhone("+82", "10 1234 5678"), "+821012345678");
});

test("normalizes pasted international driver invite numbers", () => {
  assert.equal(normalizeInvitePhone("+82", "+82 010 1234 5678"), "+821012345678");
  assert.equal(normalizeInvitePhone("+82", "0082 10 1234 5678"), "+821012345678");
  assert.equal(normalizeInvitePhone("+1", "+1 (416) 555-0108"), "+14165550108");
});

test("normalizes North American local driver invite numbers", () => {
  assert.equal(normalizeInvitePhone("+1", "416 555 0108"), "+14165550108");
  assert.equal(normalizeInvitePhone("+1", "1 416 555 0108"), "+14165550108");
});

test("formats Korean invite input with one visible country code and local 010 grouping", () => {
  assert.equal(formatInvitePhoneInput("+82", "01089216198"), "+82 010 8921 6198");
  assert.equal(formatInvitePhoneInput("+82", "+82 01089216198"), "+82 010 8921 6198");
  assert.equal(formatInvitePhoneInput("+82", "+821089216198"), "+82 010 8921 6198");
  assert.equal(normalizeInvitePhone("+82", formatInvitePhoneInput("+82", "+82 01089216198")), "+821089216198");
});

test("formats North American invite input with one visible country code", () => {
  assert.equal(formatInvitePhoneInput("+1", "4165550108"), "+1 416 555 0108");
  assert.equal(formatInvitePhoneInput("+1", "+1 (416) 555-0108"), "+1 416 555 0108");
});

test("keeps saved driver phone numbers as compact normalized table values", () => {
  assert.equal(formatSavedDriverPhone("+82 010 8921 6198"), "+821089216198");
  assert.equal(formatSavedDriverPhone("+821042222393"), "+821042222393");
  assert.equal(formatSavedDriverPhone("+1 416 555 0108"), "+14165550108");
});

test("keeps driver download links free of invite phone data", () => {
  assert.equal(
    getDriverDownloadLink("https://driver-download.example.test/app", "+82", "010-1234-5678"),
    "https://driver-download.example.test/app",
  );
});
