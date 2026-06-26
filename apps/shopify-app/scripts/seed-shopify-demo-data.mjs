#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const project = JSON.parse(readFileSync(join(root, ".shopify/project.json"), "utf8"));
const firstProject = Object.values(project)[0] ?? {};
const store = process.env.SHOPIFY_STORE ?? firstProject.dev_store_url;
const runId = process.env.CLEVER_SEED_RUN_ID ?? new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

if (!store) {
  throw new Error("No Shopify store found. Set SHOPIFY_STORE=<store>.myshopify.com.");
}

const seedTag = `clever-seed-${runId}`;
const baseTags = ["clever-route-demo", seedTag];
const seedNow = new Date(process.env.CLEVER_SEED_NOW ?? Date.now());
const deliveryBatch = getDeliveryBatchForSeed(seedNow);

const areas = [
  {
    label: "Thornhill",
    deliveryArea: "Thornhill",
    deliveryDay: "Thursday",
    firstName: "Claire",
    lastName: "Jeon",
    addressStops: [
      { address1: "112 Kirk Dr", city: "Thornhill", provinceCode: "ON", zip: "L3T 3L2", lat: 43.8221, lng: -79.4157 },
      { address1: "7755 Bayview Ave", city: "Thornhill", provinceCode: "ON", zip: "L3T 4P1", lat: 43.8196, lng: -79.4004 },
      { address1: "1 Promenade Cir", city: "Thornhill", provinceCode: "ON", zip: "L4J 4P8", lat: 43.8075, lng: -79.4527 },
    ],
  },
  {
    label: "Markham",
    deliveryArea: "Markham",
    deliveryDay: "Friday",
    firstName: "Daniel",
    lastName: "Kim",
    addressStops: [
      { address1: "101 Town Centre Blvd", city: "Markham", provinceCode: "ON", zip: "L3R 9W3", lat: 43.8561, lng: -79.337 },
      { address1: "169 Enterprise Blvd", city: "Markham", provinceCode: "ON", zip: "L6G 0E7", lat: 43.8498, lng: -79.3256 },
      { address1: "179 Main St Unionville", city: "Markham", provinceCode: "ON", zip: "L3R 2G8", lat: 43.8674, lng: -79.3127 },
    ],
  },
  {
    label: "Richmond Hill",
    deliveryArea: "Richmond Hill",
    deliveryDay: "Thursday",
    firstName: "Hannah",
    lastName: "Lee",
    addressStops: [
      { address1: "225 East Beaver Creek Rd", city: "Richmond Hill", provinceCode: "ON", zip: "L4B 3P4", lat: 43.8419, lng: -79.3828 },
      { address1: "9350 Yonge St", city: "Richmond Hill", provinceCode: "ON", zip: "L4C 5G2", lat: 43.8552, lng: -79.433 },
      { address1: "10268 Yonge St", city: "Richmond Hill", provinceCode: "ON", zip: "L4C 3B7", lat: 43.8787, lng: -79.4383 },
    ],
  },
  {
    label: "Vaughan",
    deliveryArea: "Vaughan",
    deliveryDay: "Thursday",
    firstName: "Ethan",
    lastName: "Park",
    addressStops: [
      { address1: "1 Bass Pro Mills Dr", city: "Vaughan", provinceCode: "ON", zip: "L4K 5W4", lat: 43.8257, lng: -79.5396 },
      { address1: "200 Apple Mill Rd", city: "Vaughan", provinceCode: "ON", zip: "L4K 5Z5", lat: 43.7892, lng: -79.5326 },
      { address1: "10060 Keele St", city: "Vaughan", provinceCode: "ON", zip: "L6A 1G3", lat: 43.8618, lng: -79.5132 },
    ],
  },
  {
    label: "North York",
    deliveryArea: "North York",
    deliveryDay: "Thursday",
    firstName: "Sophia",
    lastName: "Choi",
    addressStops: [
      { address1: "5100 Yonge St", city: "North York", provinceCode: "ON", zip: "M2N 5V7", lat: 43.7685, lng: -79.4137 },
      { address1: "1800 Sheppard Ave E", city: "North York", provinceCode: "ON", zip: "M2J 5A7", lat: 43.7786, lng: -79.345 },
      { address1: "3401 Dufferin St", city: "North York", provinceCode: "ON", zip: "M6A 2T9", lat: 43.7251, lng: -79.4515 },
    ],
  },
  {
    label: "Scarborough",
    deliveryArea: "Scarborough",
    deliveryDay: "Friday",
    firstName: "Ryan",
    lastName: "Jung",
    addressStops: [
      { address1: "300 Borough Dr", city: "Scarborough", provinceCode: "ON", zip: "M1P 4P5", lat: 43.7764, lng: -79.2571 },
      { address1: "200 Town Centre Ct", city: "Scarborough", provinceCode: "ON", zip: "M1P 4Y7", lat: 43.7751, lng: -79.2578 },
      { address1: "1280 Markham Rd", city: "Scarborough", provinceCode: "ON", zip: "M1H 3B4", lat: 43.7813, lng: -79.2323 },
    ],
  },
  {
    label: "Toronto Downtown",
    deliveryArea: "Downtown",
    deliveryDay: "Saturday",
    firstName: "Grace",
    lastName: "Han",
    addressStops: [
      { address1: "100 Queen St W", city: "Toronto", provinceCode: "ON", zip: "M5H 2N2", lat: 43.6535, lng: -79.3839 },
      { address1: "401 Bay St", city: "Toronto", provinceCode: "ON", zip: "M5H 2Y4", lat: 43.6528, lng: -79.3815 },
      { address1: "55 Mill St", city: "Toronto", provinceCode: "ON", zip: "M5A 3C4", lat: 43.6503, lng: -79.3596 },
    ],
  },
  {
    label: "Mississauga",
    deliveryArea: "Mississauga",
    deliveryDay: "Saturday",
    firstName: "Noah",
    lastName: "Yoon",
    addressStops: [
      { address1: "300 City Centre Dr", city: "Mississauga", provinceCode: "ON", zip: "L5B 3C1", lat: 43.589, lng: -79.6441 },
      { address1: "1224 Dundas St E", city: "Mississauga", provinceCode: "ON", zip: "L4Y 4A2", lat: 43.6026, lng: -79.5944 },
      { address1: "2200 Eglinton Ave W", city: "Mississauga", provinceCode: "ON", zip: "L5M 2N1", lat: 43.5582, lng: -79.7045 },
    ],
  },
  {
    label: "Etobicoke",
    deliveryArea: "Etobicoke",
    deliveryDay: "Saturday",
    firstName: "Olivia",
    lastName: "Shin",
    addressStops: [
      { address1: "399 The West Mall", city: "Etobicoke", provinceCode: "ON", zip: "M9C 2Y2", lat: 43.6441, lng: -79.5663 },
      { address1: "25 The West Mall", city: "Etobicoke", provinceCode: "ON", zip: "M9C 1B8", lat: 43.612, lng: -79.5576 },
      { address1: "500 Rexdale Blvd", city: "Etobicoke", provinceCode: "ON", zip: "M9W 6K5", lat: 43.7206, lng: -79.5942 },
    ],
  },
  {
    label: "Oakville",
    deliveryArea: "Oakville",
    deliveryDay: "Saturday",
    firstName: "Liam",
    lastName: "Oh",
    addressStops: [
      { address1: "1225 Trafalgar Rd", city: "Oakville", provinceCode: "ON", zip: "L6H 0H3", lat: 43.4675, lng: -79.6877 },
      { address1: "240 Leighland Ave", city: "Oakville", provinceCode: "ON", zip: "L6H 3H6", lat: 43.462, lng: -79.6866 },
      { address1: "321 Cornwall Rd", city: "Oakville", provinceCode: "ON", zip: "L6J 7Z5", lat: 43.456, lng: -79.6824 },
    ],
  },
];

const products = Array.from({ length: 20 }, (_, index) => {
  const number = index + 1;
  const categories = ["Fresh Box", "Juice", "Salad", "Sauce", "Snack"];
  const category = categories[index % categories.length];
  return {
    title: `CLEVER ${category} ${String(number).padStart(2, "0")} ${deliveryBatch.label} ${runId}`,
    descriptionHtml: `<p>CLEVER Route seed product ${number}. Delivery batch ${deliveryBatch.label}.</p>`,
    productType: "CLEVER Route Demo",
    vendor: "CLEVER Demo",
    status: "ACTIVE",
    tags: [...baseTags, "route-seed-product", category],
  };
});

const customers = areas.map((area, index) => {
  const number = index + 1;
  const primaryAddress = area.addressStops[0];
  return {
    email: `clever.seed+${runId}-${number}@example.com`,
    firstName: area.firstName,
    lastName: area.lastName,
    tags: [...baseTags, "route-seed-customer", area.label],
    addresses: [
      {
        firstName: area.firstName,
        lastName: area.lastName,
        address1: primaryAddress.address1,
        city: primaryAddress.city,
        zip: primaryAddress.zip,
        provinceCode: primaryAddress.provinceCode,
        countryCode: "CA",
      },
    ],
    seedArea: area,
  };
});

function stripAnsi(text) {
  return text.replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function getDeliveryBatchForSeed(date) {
  const localDate = getTorontoDate(date);
  const daysSinceTuesday = (localDate.getUTCDay() - 2 + 7) % 7;
  const cycleStartTuesday = addDays(localDate, -daysSinceTuesday);
  const batchStartThursday = addDays(cycleStartTuesday, 9);
  const batchEndSaturday = addDays(batchStartThursday, 2);

  return {
    startDate: formatIsoDate(batchStartThursday),
    endDate: formatIsoDate(batchEndSaturday),
    label: formatDeliveryBatchRange({
      start: batchStartThursday,
      end: batchEndSaturday,
    }),
  };
}

function getTorontoDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Toronto",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return new Date(Date.UTC(values.year, values.month - 1, values.day));
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function formatDeliveryBatchRange(batch) {
  const startMonth = padDatePart(batch.start.getUTCMonth() + 1);
  const startDay = padDatePart(batch.start.getUTCDate());
  const endMonth = padDatePart(batch.end.getUTCMonth() + 1);
  const endDay = padDatePart(batch.end.getUTCDate());

  return `${batch.start.getUTCFullYear()}.${startMonth}.${startDay}-${endMonth}.${endDay}`;
}

function formatIsoDate(date) {
  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
    padDatePart(date.getUTCDate()),
  ].join("-");
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function parseJsonOutput(output) {
  const clean = stripAnsi(output);
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not parse Shopify CLI JSON output:\n${clean}`);
  }

  return JSON.parse(clean.slice(start, end + 1));
}

function execute(query, variables) {
  const args = [
    "store",
    "execute",
    "--store",
    store,
    "--json",
    "--allow-mutations",
    "--query",
    query,
    "--variables",
    JSON.stringify(variables),
  ];
  const result = spawnSync("shopify", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });

  if (result.status !== 0) {
    throw new Error(`Shopify CLI failed with exit ${result.status}:\n${result.stdout}\n${result.stderr}`);
  }

  return parseJsonOutput(result.stdout);
}

function assertNoUserErrors(payload, mutationName) {
  for (const [alias, value] of Object.entries(payload)) {
    const userErrors = value?.userErrors ?? [];
    if (userErrors.length > 0) {
      throw new Error(`${mutationName}.${alias} returned userErrors: ${JSON.stringify(userErrors)}`);
    }
  }
}

function makeVariables(prefix, values) {
  return Object.fromEntries(values.map((value, index) => [`${prefix}${index + 1}`, value]));
}

function createProducts() {
  const variableDefs = products.map((_, i) => `$product${i + 1}: ProductCreateInput!`).join(", ");
  const fields = products
    .map(
      (_, i) => `p${i + 1}: productCreate(product: $product${i + 1}) {
        product { id title variants(first: 1) { nodes { id title } } }
        userErrors { field message }
      }`,
    )
    .join("\n");
  const data = execute(`mutation SeedCleverProducts(${variableDefs}) { ${fields} }`, makeVariables("product", products));
  assertNoUserErrors(data, "productCreate");
  return Object.values(data).map((entry) => {
    const variant = entry.product.variants.nodes[0];
    return { id: entry.product.id, title: entry.product.title, variantId: variant.id };
  });
}

function updateProductPrices(createdProducts) {
  const variableDefs = createdProducts
    .map((_, i) => `$productId${i + 1}: ID!, $variants${i + 1}: [ProductVariantsBulkInput!]!`)
    .join(", ");
  const fields = createdProducts
    .map(
      (_, i) => `v${i + 1}: productVariantsBulkUpdate(productId: $productId${i + 1}, variants: $variants${i + 1}) {
        productVariants { id price }
        userErrors { field message }
      }`,
    )
    .join("\n");
  const variables = {};
  createdProducts.forEach((product, index) => {
    const number = index + 1;
    variables[`productId${number}`] = product.id;
    variables[`variants${number}`] = [
      {
        id: product.variantId,
        price: (18 + index * 1.5).toFixed(2),
      },
    ];
  });
  const data = execute(`mutation SeedCleverProductPrices(${variableDefs}) { ${fields} }`, variables);
  assertNoUserErrors(data, "productVariantsBulkUpdate");
}

function createCustomers() {
  const inputs = customers.map(({ seedArea: _seedArea, ...input }) => input);
  const variableDefs = inputs.map((_, i) => `$customer${i + 1}: CustomerInput!`).join(", ");
  const fields = inputs
    .map(
      (_, i) => `c${i + 1}: customerCreate(input: $customer${i + 1}) {
        customer { id firstName lastName }
        userErrors { field message }
      }`,
    )
    .join("\n");
  const data = execute(`mutation SeedCleverCustomers(${variableDefs}) { ${fields} }`, makeVariables("customer", inputs));
  assertNoUserErrors(data, "customerCreate");
  return Object.values(data).map((entry, index) => ({
    id: entry.customer.id,
    firstName: customers[index].firstName,
    lastName: customers[index].lastName,
    email: customers[index].email,
    area: customers[index].seedArea,
  }));
}

function addressStopForOrder(area, orderIndex) {
  return area.addressStops[orderIndex % area.addressStops.length];
}

function coordinateForOrder(area, orderIndex) {
  const addressStop = addressStopForOrder(area, orderIndex);
  return {
    lat: addressStop.lat,
    lng: addressStop.lng,
  };
}

function buildDraftOrderInputs(createdProducts, createdCustomers) {
  return Array.from({ length: 30 }, (_, index) => {
    const customer = createdCustomers[index % createdCustomers.length];
    const area = customer.area;
    const addressStop = addressStopForOrder(area, index);
    const coordinates = coordinateForOrder(area, index);
    const productA = createdProducts[index % createdProducts.length];
    const productB = createdProducts[(index * 3 + 5) % createdProducts.length];
    const orderNumber = index + 1;

    const address = {
      firstName: customer.firstName,
      lastName: customer.lastName,
      address1: addressStop.address1,
      city: addressStop.city,
      zip: addressStop.zip,
      provinceCode: addressStop.provinceCode,
      countryCode: "CA",
    };

    return {
      email: customer.email,
      note: `CLEVER Route seed order ${orderNumber} / ${runId}`,
      tags: [...baseTags, "route-seed-order", area.label],
      purchasingEntity: { customerId: customer.id },
      shippingAddress: address,
      billingAddress: address,
      shippingLine: {
        title: "CLEVER local delivery",
        price: "5.00",
      },
      lineItems: [
        { variantId: productA.variantId, quantity: (index % 3) + 1 },
        { variantId: productB.variantId, quantity: ((index + 1) % 2) + 1 },
      ],
      customAttributes: [
        { key: "clever_lat", value: String(coordinates.lat) },
        { key: "clever_lng", value: String(coordinates.lng) },
        { key: "Delivery Area", value: area.deliveryArea },
        { key: "Delivery Day", value: area.deliveryDay },
        { key: "Note (Customer)", value: orderNumber % 4 === 1 ? "12시 전으로 배송할것" : "" },
        { key: "clever_seed_run", value: runId },
        { key: "clever_area", value: area.label },
      ],
    };
  });
}

function createDraftOrders(orderInputs) {
  const variableDefs = orderInputs.map((_, i) => `$order${i + 1}: DraftOrderInput!`).join(", ");
  const fields = orderInputs
    .map(
      (_, i) => `o${i + 1}: draftOrderCreate(input: $order${i + 1}) {
        draftOrder { id name }
        userErrors { field message }
      }`,
    )
    .join("\n");
  const data = execute(`mutation SeedCleverDraftOrders(${variableDefs}) { ${fields} }`, makeVariables("order", orderInputs));
  assertNoUserErrors(data, "draftOrderCreate");
  return Object.values(data).map((entry) => ({ id: entry.draftOrder.id, name: entry.draftOrder.name }));
}

function completeDraftOrders(draftOrders) {
  return draftOrders.map((draftOrder) => {
    const data = execute(
      `mutation CompleteCleverDraftOrder($draft: ID!) {
        complete: draftOrderComplete(id: $draft, paymentPending: true) {
          draftOrder { id order { id name } }
          userErrors { field message }
        }
      }`,
      { draft: draftOrder.id },
    );
    const result = data.complete;
    const order = result?.draftOrder?.order;
    const userErrors = result?.userErrors ?? [];

    if (!order) {
      throw new Error(`draftOrderComplete.${draftOrder.id} returned userErrors: ${JSON.stringify(userErrors)}`);
    }

    return order;
  });
}

console.log(`Seeding Shopify store ${store}`);
console.log(`Run ID: ${runId}`);
console.log(`Delivery batch: ${deliveryBatch.label}`);

const createdProducts = createProducts();
console.log(`Created products: ${createdProducts.length}`);

updateProductPrices(createdProducts);
console.log(`Updated product prices: ${createdProducts.length}`);

const createdCustomers = createCustomers();
console.log(`Created customers: ${createdCustomers.length}`);

const draftOrders = createDraftOrders(buildDraftOrderInputs(createdProducts, createdCustomers));
console.log(`Created draft orders: ${draftOrders.length}`);

const completedOrders = completeDraftOrders(draftOrders);
console.log(`Completed orders: ${completedOrders.length}`);

console.log(JSON.stringify({
  store,
  runId,
  tag: seedTag,
  products: createdProducts.length,
  customers: createdCustomers.length,
  orders: completedOrders.length,
  sampleOrders: completedOrders.slice(0, 5),
}, null, 2));
