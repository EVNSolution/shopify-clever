# Privacy Policy for Clever — Draft

> Do not publish this draft until every bracketed placeholder is replaced and the final text is approved by the business/legal owner.

_Last draft update: 2026-05-14_

Clever is operated by [LEGAL COMPANY NAME] ("we", "us", or "our"). Clever helps Shopify merchants plan local delivery routes from Shopify orders.

## Information we process

- Shopify store information needed to install and authenticate the app.
- Order and delivery information needed for route planning, including order identifiers, order names/numbers, delivery attributes, line item names/quantities, recipient name, shipping address, shipping phone number, shipping coordinates when available, fulfillment/payment status labels, and delivery dates or areas configured by the merchant.
- Merchant-entered delivery operations data, including departure/depot address and coordinates, route plans, stop sequences, driver display names, driver phone numbers, and driver assignment status.
- Technical data needed to operate and secure the app, including webhook payload metadata, logs, timestamps, and authentication/session records.

## How we use information

- To display Shopify orders that are ready for local delivery planning.
- To create, edit, and display route plans and route stops.
- To assign drivers and support delivery operations.
- To maintain app security, troubleshoot issues, verify Shopify webhooks, and comply with Shopify and legal obligations.

## Sharing and subprocessors

- We host the app and delivery server on Amazon Web Services infrastructure.
- We use Shopify APIs to authenticate merchants and read the minimum order/location data required for the app.
- Map tiles may be loaded from OpenFreeMap/OpenMapTiles/Overture Maps infrastructure in the merchant's browser.
- Departure-address geocoding uses the configured geocoding provider. The current default endpoint is OpenStreetMap Nominatim unless the merchant/operator configures a different provider.
- Route geometry may be calculated using the configured OSRM routing endpoint. The current default endpoint is the public OSRM demo server unless the operator configures a private OSRM endpoint.

## Retention

We retain order, route, driver, and operational records only as long as needed to provide delivery planning, support, security, accounting, and legal obligations. [INSERT EXACT RETENTION PERIOD AND DELETION PROCESS BEFORE PUBLICATION].

## Customer data rights and deletion

Shopify may send customer data access or deletion requests to Clever through Shopify compliance webhooks. We verify those webhooks and will complete required access or deletion actions within Shopify's required timeframe unless we are legally required to retain the data.

In the current production implementation, verified `customers/redact` webhooks delete matching locally stored Shopify order records by Shopify legacy order ID, and verified `shop/redact` webhooks delete the shop row in the delivery database, cascading shop-scoped delivery data. Verified `customers/data_request` webhooks are stored with a minimized payload for manual export/response to the store owner; the stored compliance payload omits customer email and phone from the webhook payload.

## Security

We use HTTPS for the production app, Shopify OAuth/session-token authentication, Shopify webhook HMAC verification, database access controls, and least-privilege Shopify API scopes. Access to protected customer data is limited to personnel and systems that need it to operate or support the app.

## Contact

For privacy requests or app support, contact [SUPPORT EMAIL]. For urgent technical issues, contact [EMERGENCY CONTACT EMAIL] or [EMERGENCY PHONE].

## Required business/legal confirmations before publication

- [ ] Legal company name.
- [ ] Support/privacy email.
- [ ] Emergency developer email and phone.
- [ ] Exact retention period for order/route/driver operational data.
- [ ] Whether production will keep using public Nominatim/OSRM endpoints or move to private/provider-contracted endpoints.
- [ ] Final legal review of privacy wording.
- [ ] Public URL where this policy will be hosted.
