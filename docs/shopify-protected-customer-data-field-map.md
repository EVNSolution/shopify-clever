# Shopify Protected Customer Data Field Map

_Last updated: 2026-05-14_

This field map supports the Partner Dashboard protected customer data request for the current `clever` release.

## Dashboard request recommendation

Request **Level 2 protected customer data** with only these protected fields:

- Protected customer/order data
- Name
- Address
- Phone

Do **not** request customer email for the current release unless the Shopify Admin GraphQL queries change.

## Shopify access scopes

Current app scopes in `apps/shopify-app/shopify.app.toml`:

```toml
scopes = "read_orders,read_locations"
```

No `read_customers`, `read_all_orders`, payment, checkout, or customer profile scopes are requested.

## Active Shopify Admin GraphQL fields

### Embedded app order query

Source: `apps/shopify-app/app/features/orders/shopify-orders.server.js`

| Shopify field | Protected category | Product use |
| --- | --- | --- |
| `orders` / `id` / `legacyResourceId` / `name` | Order data | Identify and de-duplicate orders in route planning. |
| `phone` | Phone | Fallback recipient contact for delivery exceptions. |
| `shippingAddress.name` | Name | Show recipient on route stop lists. |
| `shippingAddress.address1/address2/city/province/provinceCode/zip/countryCodeV2` | Address | Display, geocode, map, and sequence route stops. |
| `shippingAddress.phone` | Phone | Recipient contact for delivery exceptions. |
| `shippingAddress.latitude/longitude` | Address/location | Place map pins and route-stop coordinates. |
| `customAttributes` | Order data | Read delivery date/area attributes configured by the merchant. |
| `lineItems.title/name/variantTitle/quantity/sku` | Order data | Help merchants identify delivery items per stop. |
| `displayFinancialStatus`, `displayFulfillmentStatus`, `currentTotalPriceSet` | Order data | Show operational order status/amount labels in planning tables. |
| `createdAt`, `updatedAt`, `processedAt`, `cancelledAt`, `note` | Order data | Filter/sort/sync operational order records. |

### Delivery API background sync query

Source: `clever-route-server/apps/delivery-api/src/modules/shopify/order-sync.query.ts`

The delivery API sync query mirrors the embedded app fields for updated orders and uses the same protected field categories: order data, name, address/location, and phone.

## Explicit exclusions for current release

The current Shopify Admin GraphQL queries intentionally do **not** request:

- `email`
- `customer { ... }`
- customer profile fields
- `read_customers`
- `read_all_orders`
- payment data

Implementation note: internal canonical order models and tests still contain an `email` property for legacy/manual/test rows. This does not mean the current Shopify Admin GraphQL queries request customer email. If a future release adds `email` to a Shopify query, update this map, the Partner Dashboard protected-data request, and the privacy policy before release.
