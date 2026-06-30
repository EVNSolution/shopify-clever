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


export function buildInventoryHistoryItems(inventory) {
  const orders = Array.isArray(inventory?.orders) ? inventory.orders : [];
  if (orders.length === 0) return [];

  const historyOrders = orders.map((order, index) => buildInventoryHistoryOrder(order, index));
  const itemTotal = historyOrders.reduce((total, order) => total + Math.abs(order.itemDelta), 0);

  return [{
    meta: `${orders.length} orders · ${itemTotal} items`,
    orders: historyOrders,
    title: formatInventoryHistoryTitle(inventory),
  }];
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


function buildInventoryHistoryOrder(order, index) {
  const items = getInventoryHistoryLineItems(order);
  const itemDelta = getNumber(order?.itemDelta ?? order?.quantityDelta) ?? items.reduce(
    (total, item) => total + getInventoryHistoryItemDelta(item),
    0,
  );

  return {
    customer: getInventoryHistoryCustomer(order),
    itemDelta,
    items: items.length > 0 ? items.map(formatInventoryHistoryLineItem) : ["No items"],
    order: getInventoryHistoryOrderName(order, index),
  };
}

function getInventoryHistoryLineItems(order) {
  if (Array.isArray(order?.items)) return order.items;

  const lineItems = order?.lineItems ?? order?.shopifyOrderSnapshot?.lineItems ?? order?.rawPayload?.lineItems;
  if (Array.isArray(lineItems)) return lineItems;
  if (Array.isArray(lineItems?.nodes)) return lineItems.nodes;
  if (Array.isArray(lineItems?.edges)) return lineItems.edges.map((edge) => edge?.node).filter(Boolean);
  return [];
}

function getInventoryHistoryOrderName(order, index) {
  const id = textOrNumber(order?.id);
  return textOrNumber(order?.name)
    ?? textOrNumber(order?.orderName)
    ?? textOrNumber(order?.shopifyOrderName)
    ?? textOrNumber(order?.orderNumber)
    ?? textOrNumber(order?.shopifyOrderNumber)
    ?? (id ? id.split("/").pop() : null)
    ?? `Order ${index + 1}`;
}

function getInventoryHistoryCustomer(order) {
  return textOrNumber(order?.customer)
    ?? textOrNumber(order?.customerName)
    ?? textOrNumber(order?.recipientName)
    ?? textOrNumber(order?.shippingAddress?.name)
    ?? textOrNumber(order?.deliveryAddress?.name)
    ?? "Unknown customer";
}

function formatInventoryHistoryLineItem(item) {
  const name = textOrNumber(item?.name) ?? textOrNumber(item?.title) ?? textOrNumber(item?.productTitle) ?? "Item";
  const options = formatInventoryOptions(item?.options) || textOrNumber(item?.variantTitle);
  const quantity = Math.abs(getInventoryHistoryItemDelta(item));
  return `${options ? `${name} (${options})` : name} ×${quantity}`;
}

function getInventoryHistoryItemDelta(item) {
  return getNumber(item?.quantityDelta ?? item?.quantity ?? item?.currentQuantity) ?? 1;
}

function formatInventoryHistoryTitle(inventory) {
  const time = formatInventoryHistoryTime(inventory?.createdAt ?? inventory?.created_at);
  return time ? `Initial snapshot · ${time}` : "Initial snapshot";
}

function formatInventoryHistoryTime(value) {
  const text = textOrNumber(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function getNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textOrNumber(value) {
  if (typeof value === "number") return String(value);
  return normalizeText(value);
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
