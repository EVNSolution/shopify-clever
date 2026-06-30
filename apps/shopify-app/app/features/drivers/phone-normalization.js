function getDialDigits(countryDialCode) {
  return String(countryDialCode ?? "").replace(/\D/g, "");
}

function getInputDigits(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

function stripNationalTrunkPrefix(dialDigits, nationalDigits) {
  if (dialDigits === "1") return nationalDigits;

  return nationalDigits.replace(/^0+/, "");
}

function splitPhoneDigits(countryDialCode, phone) {
  const dialDigits = getDialDigits(countryDialCode);
  if (!dialDigits) return { dialDigits: "", nationalDigits: "" };

  const inputDigits = getInputDigits(phone);
  if (!inputDigits) return { dialDigits, nationalDigits: "" };

  let nationalDigits = inputDigits;
  if (nationalDigits.startsWith(`00${dialDigits}`)) {
    nationalDigits = nationalDigits.slice(dialDigits.length + 2);
  } else if (nationalDigits.startsWith(dialDigits)) {
    nationalDigits = nationalDigits.slice(dialDigits.length);
  } else if (dialDigits === "1" && nationalDigits.length === 11 && nationalDigits.startsWith("1")) {
    nationalDigits = nationalDigits.slice(1);
  }

  return { dialDigits, nationalDigits };
}

function groupDigits(digits, groups) {
  const parts = [];
  let cursor = 0;

  for (const groupSize of groups) {
    if (cursor >= digits.length) break;
    parts.push(digits.slice(cursor, cursor + groupSize));
    cursor += groupSize;
  }

  if (cursor < digits.length) parts.push(digits.slice(cursor));

  return parts.filter(Boolean).join(" ");
}

function formatKoreanNationalDigits(nationalDigits) {
  const localDigits = nationalDigits.startsWith("0") ? nationalDigits : `0${nationalDigits}`;
  if (localDigits.length <= 3) return localDigits;
  if (localDigits.length <= 7) return groupDigits(localDigits, [3, 4]);

  return groupDigits(localDigits, [3, 4, 4]);
}

function formatNorthAmericanNationalDigits(nationalDigits) {
  if (nationalDigits.length <= 3) return nationalDigits;
  if (nationalDigits.length <= 6) return groupDigits(nationalDigits, [3, 3]);

  return groupDigits(nationalDigits, [3, 3, 4]);
}

function formatGenericNationalDigits(nationalDigits) {
  if (nationalDigits.length <= 4) return nationalDigits;
  if (nationalDigits.length <= 7) return groupDigits(nationalDigits, [3, 4]);

  return groupDigits(nationalDigits, [3, 4, 4]);
}

export function normalizeInvitePhone(countryDialCode, phone) {
  const { dialDigits, nationalDigits: rawNationalDigits } = splitPhoneDigits(countryDialCode, phone);
  if (!dialDigits) return "";

  const nationalDigits = stripNationalTrunkPrefix(dialDigits, rawNationalDigits);
  if (!nationalDigits) return "";

  return `+${dialDigits}${nationalDigits}`;
}

export function formatInvitePhoneInput(countryDialCode, phone) {
  const { dialDigits, nationalDigits } = splitPhoneDigits(countryDialCode, phone);
  if (!dialDigits) return String(phone ?? "");
  if (!nationalDigits) return "";

  const localDigits = dialDigits === "82"
    ? formatKoreanNationalDigits(nationalDigits)
    : dialDigits === "1"
      ? formatNorthAmericanNationalDigits(nationalDigits)
      : formatGenericNationalDigits(nationalDigits);

  return `+${dialDigits} ${localDigits}`.trim();
}

export function formatSavedDriverPhone(phone) {
  const rawPhone = String(phone ?? "").trim();
  if (!rawPhone) return "";

  if (/^\+?\s*82\b|^0082\b/.test(rawPhone)) {
    return normalizeInvitePhone("+82", rawPhone);
  }

  if (/^\+?\s*1\b|^001\b/.test(rawPhone)) {
    return normalizeInvitePhone("+1", rawPhone);
  }

  const digits = getInputDigits(rawPhone);
  if (!digits) return rawPhone;

  return rawPhone.startsWith("+") ? `+${digits}` : rawPhone;
}

const DRIVER_RELEASE_FOLDER_URL = "https://drive.google.com/drive/folders/15Am4CFvcp2szOuuKpGnWgJEB22H96rwZ";
const DEFAULT_DRIVER_DOWNLOAD_URL = "https://drive.google.com/file/d/1sqfU_D40iMenCGWQ6F3dZYb875i1jbe2/view?usp=sharing";
const LEGACY_DRIVER_DOWNLOAD_URLS = new Set([
  "https://clever.delivery/driver/download",
  DRIVER_RELEASE_FOLDER_URL,
]);

export function getDriverDownloadLink(downloadLink) {
  const normalizedLink = String(downloadLink ?? "").trim();
  return !normalizedLink || LEGACY_DRIVER_DOWNLOAD_URLS.has(normalizedLink)
    ? DEFAULT_DRIVER_DOWNLOAD_URL
    : normalizedLink;
}
