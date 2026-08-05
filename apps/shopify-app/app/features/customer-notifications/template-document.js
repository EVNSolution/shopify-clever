export const CUSTOMER_NOTIFICATION_VARIABLES = [
  "customerName",
  "orderNumber",
  "deliveryDate",
  "deliveryWeekday",
  "deliveryAddress",
  "eta",
  "routeName",
  "sequence",
  "shopName",
  "inventoryList",
];

const VARIABLE_SET = new Set(CUSTOMER_NOTIFICATION_VARIABLES);
const LEGACY_ALIASES = new Map([["storeName", "shopName"]]);
const TOKEN_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/gu;

export function parseTemplateDocument(source) {
  const text = typeof source === "string" ? source : "";
  const segments = [];
  const diagnostics = [];
  let cursor = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    appendTextSegment(segments, text.slice(cursor, index));

    const originalKey = match[1].trim();
    const canonicalKey = LEGACY_ALIASES.get(originalKey) ?? originalKey;
    if (VARIABLE_SET.has(canonicalKey)) {
      segments.push({ key: canonicalKey, type: "token" });
    } else {
      const raw = match[0];
      segments.push({ raw, type: "unsupported" });
      diagnostics.push({
        code: "UNSUPPORTED_TEMPLATE_VARIABLE",
        key: originalKey,
        raw,
      });
    }

    cursor = index + match[0].length;
  }

  appendTextSegment(segments, text.slice(cursor));
  return { diagnostics, segments };
}

export function serializeTemplateDocument(document) {
  return normalizeSegments(document?.segments).map((segment) => {
    if (segment.type === "token") return `{{${segment.key}}}`;
    if (segment.type === "unsupported") return segment.raw;
    return segment.value;
  }).join("");
}

export function insertTemplateToken(document, tokenKey, index) {
  if (!VARIABLE_SET.has(tokenKey)) {
    throw new Error(`Unsupported customer notification variable: ${tokenKey}`);
  }

  const segments = normalizeSegments(document?.segments);
  const insertionIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(index, segments.length))
    : segments.length;

  return {
    diagnostics: document?.diagnostics ?? [],
    segments: [
      ...segments.slice(0, insertionIndex),
      { key: tokenKey, type: "token" },
      ...segments.slice(insertionIndex),
    ],
  };
}

export function hasUnsupportedTemplateSegments(document) {
  return normalizeSegments(document?.segments).some((segment) => segment.type === "unsupported");
}

function appendTextSegment(segments, value) {
  if (!value) return;
  const previous = segments.at(-1);
  if (previous?.type === "text") {
    previous.value += value;
    return;
  }
  segments.push({ type: "text", value });
}

function normalizeSegments(segments) {
  return Array.isArray(segments) ? segments : [];
}
