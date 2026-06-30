const UNKNOWN_DATE = "—";

export function buildInventoryProductMatrix(orders) {
  const products = [];
  const productIndex = new Map();
  const rowIndex = new Map();

  for (const order of Array.isArray(orders) ? orders : []) {
    const date = normalizeInventoryDate(order?.deliveryDate ?? order?.orderDateLocal ?? order?.processedAt ?? order?.createdAt);
    let row = rowIndex.get(date);
    if (!row) {
      row = { date, label: formatInventoryDateLabel(date), quantities: {}, total: 0 };
      rowIndex.set(date, row);
    }

    for (const item of Array.isArray(order?.items) ? order.items : []) {
      const quantity = Number(item?.quantity) || 0;
      if (quantity === 0) continue;

      const product = getInventoryProduct(item);
      if (!productIndex.has(product.key)) {
        productIndex.set(product.key, products.length);
        products.push(product);
      }

      row.quantities[product.key] = (row.quantities[product.key] ?? 0) + quantity;
      row.total += quantity;
    }
  }

  const rows = [...rowIndex.values()].sort(compareInventoryDateRows);
  const productTotals = Object.fromEntries(products.map((product) => [product.key, 0]));
  for (const row of rows) {
    for (const product of products) productTotals[product.key] += row.quantities[product.key] ?? 0;
  }

  return {
    products,
    productTotals,
    rows,
    totalQuantity: rows.reduce((total, row) => total + row.total, 0),
  };
}

export function isRealInventorySku(value) {
  const sku = normalizeText(value);
  if (!sku) return false;
  const lower = sku.toLowerCase();
  return !/^(?:products?|roducts?)[/:]/.test(lower) && !/^gid:\/\/shopify\/product\//.test(lower);
}

export function formatInventoryOptions(options) {
  const parts = Array.isArray(options)
    ? options.flatMap((option) => {
        const key = normalizeText(option?.key);
        const value = normalizeText(option?.value);
        return key && value ? [`${key}: ${value}`] : [];
      })
    : [];
  return parts.join(", ");
}

function getInventoryProduct(item) {
  const realSku = isRealInventorySku(item?.sku) ? normalizeText(item.sku) : null;
  const name = normalizeText(item?.name) ?? "Item";
  const options = formatInventoryOptions(item?.options);
  const displayName = formatInventoryDisplayName(name);
  const fallbackKey = `${name.toLowerCase()}|${options.toLowerCase()}`;
  return {
    key: realSku ? `sku:${realSku.toLowerCase()}` : `item:${fallbackKey}`,
    label: options && !realSku ? `${name} (${options})` : name,
    displayLabel: options && !realSku ? `${displayName} (${options})` : displayName,
    sku: realSku,
  };
}

function formatInventoryDisplayName(value) {
  const koreanFeat = value.match(/[\p{Script=Hangul}0-9\s]+feat\.\s*[\p{Script=Hangul}0-9\s]+/u);
  if (koreanFeat && hasHangul(koreanFeat[0])) return cleanDisplayName(koreanFeat[0]);
  if (/\bfeat\./i.test(value)) return value;

  const parts = value.split(/\s*(?:\/|\||·|•|–|—)\s*/).map(cleanDisplayName).filter(Boolean);
  const koreanParts = parts.filter(hasHangul);
  if (parts.length > 1 && koreanParts.length) return koreanParts.join(" ");

  const korean = value.match(/[\p{Script=Hangul}\s]+/gu)?.map(cleanDisplayName).filter(Boolean);
  if (korean?.length) return korean.join(" ");

  const english = value.match(/[A-Za-z][A-Za-z0-9&'’.,\-\s]*/g)?.map(cleanDisplayName).filter(Boolean);
  return english?.length ? english.join(" ") : value;
}

function normalizeInventoryDate(value) {
  const text = normalizeText(value);
  if (!text) return UNKNOWN_DATE;
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
}

function formatInventoryDateLabel(value) {
  if (value === UNKNOWN_DATE) return "No date";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit", weekday: "short" }).format(date);
}

function compareInventoryDateRows(left, right) {
  if (left.date === UNKNOWN_DATE) return 1;
  if (right.date === UNKNOWN_DATE) return -1;
  return left.date.localeCompare(right.date);
}

function normalizeText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function hasHangul(value) {
  return /\p{Script=Hangul}/u.test(value);
}

function cleanDisplayName(value) {
  return value.replace(/\s+/g, " ").trim().replace(/^[,./·•-]+|[,./·•-]+$/g, "");
}
