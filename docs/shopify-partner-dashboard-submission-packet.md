# Shopify Partner Dashboard Submission Packet

_Last updated: 2026-05-14_

This packet is the copy/paste working document for the authorized Partner Dashboard account holder. It converts the remaining manual Shopify App Store review tasks into concrete dashboard entries.

## Current release to submit after dashboard fields are complete

- App: `clever`
- Production admin URL: `https://clever-admin.3-39-216-177.sslip.io`
- Production delivery API URL: `https://clever-delivery.3-39-216-177.sslip.io`
- Active Shopify app version: `approval-20260514-174cfcc`
- Version ID: `gid://shopify/Version/963140550657`
- Source commit: `174cfccd49f75487c96b7866fb49c0842c6a0303`
- CI evidence: https://github.com/EVNSolution/shopify-clever/actions/runs/25851300153

## Source requirements checked

- Shopify AI Toolkit: https://shopify.dev/docs/apps/build/ai-toolkit
- App Store best practices: https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices
- Submit app for review: https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review
- Protected customer data: https://shopify.dev/docs/apps/launch/protected-customer-data
- Privacy law compliance: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance

Key points from the latest checked Shopify docs:

- The AI Toolkit supports installing all agent skills with `npx skills add Shopify/shopify-ai-toolkit`.
- The App Store review page requires mandatory fields, automated checks, URLs, compliance webhooks, icon, API contact details, listing, and protected-customer-data choices before submission.
- Public apps with customer data including name, address, phone, or email are Level 2 protected-customer-data apps and must request protected customer data and specific fields in Partner Dashboard.
- Every App Store app must subscribe to `customers/data_request`, `customers/redact`, and `shop/redact` compliance webhook topics before publishing.
- Shopify review email should be monitored and `app-submissions@shopify.com` plus `noreply@shopify.com` should be allowlisted.

## 1. Distribution method

Dashboard action:

- Select **Public app / Shopify App Store** distribution.
- Keep the app in draft until all fields below are complete and automated checks pass.

## 2. Protected customer data request

Dashboard action:

- Select that the app requires protected customer data.
- Request **Level 2** protected customer data because delivery routing uses protected order shipping fields.
- Request only these fields for the current released app:
  - Protected customer data / order data
  - Name
  - Address
  - Phone
- Do **not** request email for the current release unless the product scope changes. Evidence: the Shopify order GraphQL queries in `apps/shopify-app/app/features/orders/shopify-orders.server.js` and `apps/delivery-api/src/modules/shopify/order-sync.query.ts` request order `phone` and `shippingAddress { name phone address1 address2 city province provinceCode zip countryCodeV2 latitude longitude }`, but do not request `email`.

Paste-ready justification:

```text
Clever is a local-delivery route planning app for merchants. It reads recent Shopify orders and uses the shipping recipient name, shipping address, shipping phone number, delivery attributes, and delivery coordinates to let the merchant group orders into delivery routes, sequence stops, view the route on a map, assign a driver, and prepare delivery operations.

Name is required so merchants and drivers can identify each delivery recipient on route stop lists. Address is required to geocode and sequence delivery stops. Phone is required so merchants or assigned drivers can contact the recipient about delivery exceptions when needed. The app does not request customer profile access, read_customers, read_all_orders, payment data, or customer email in the current release.

The requested fields are the minimum required to provide route planning, driver dispatch, recipient contact for delivery exceptions, and stop sequencing. Data is used only for the merchant's delivery operations and is not sold or used for advertising.
```

## 3. Privacy policy draft inputs

Use this as the basis for a published privacy policy page. Replace bracketed placeholders before publication.

```text
Privacy Policy for Clever

Last updated: [DATE]

Clever is operated by [LEGAL COMPANY NAME] ("we", "us", or "our"). Clever helps Shopify merchants plan local delivery routes from Shopify orders.

Information we process
- Shopify store information needed to install and authenticate the app.
- Order and delivery information needed for route planning, including order identifiers, order names/numbers, delivery attributes, line item names/quantities, recipient name, shipping address, shipping phone number, shipping coordinates when available, fulfillment/payment status labels, and delivery dates or areas configured by the merchant.
- Merchant-entered delivery operations data, including departure/depot address and coordinates, route plans, stop sequences, driver display names, driver phone numbers, and driver assignment status.
- Technical data needed to operate and secure the app, including webhook payload metadata, logs, timestamps, and authentication/session records.

How we use information
- To display Shopify orders that are ready for local delivery planning.
- To create, edit, and display route plans and route stops.
- To assign drivers and support delivery operations.
- To maintain app security, troubleshoot issues, verify Shopify webhooks, and comply with Shopify and legal obligations.

Sharing and subprocessors
- We host the app and delivery server on Amazon Web Services infrastructure.
- We use Shopify APIs to authenticate merchants and read the minimum order/location data required for the app.
- Map tiles may be loaded from OpenFreeMap/OpenMapTiles/Overture Maps infrastructure in the merchant's browser.
- Departure-address geocoding uses the configured geocoding provider. The current default endpoint is OpenStreetMap Nominatim unless the merchant/operator configures a different provider.
- Route geometry may be calculated using the configured OSRM routing endpoint. The current default endpoint is the public OSRM demo server unless the operator configures a private OSRM endpoint.

Retention
We retain order, route, driver, and operational records only as long as needed to provide delivery planning, support, security, accounting, and legal obligations. [INSERT EXACT RETENTION PERIOD AND DELETION PROCESS BEFORE PUBLICATION].

Customer data rights and deletion
Shopify may send customer data access or deletion requests to Clever through Shopify compliance webhooks. We verify those webhooks and will complete required access or deletion actions within Shopify's required timeframe unless we are legally required to retain the data.

Security
We use HTTPS for the production app, Shopify OAuth/session-token authentication, Shopify webhook HMAC verification, database access controls, and least-privilege Shopify API scopes. Access to protected customer data is limited to personnel and systems that need it to operate or support the app.

Contact
For privacy requests or app support, contact [SUPPORT EMAIL]. For urgent technical issues, contact [EMERGENCY CONTACT EMAIL] or [EMERGENCY PHONE].
```

Required business/legal confirmations before publishing:

- [ ] Legal company name.
- [ ] Support/privacy email.
- [ ] Emergency developer email and phone.
- [ ] Exact retention period for order/route/driver operational data.
- [ ] Whether production will keep using public Nominatim/OSRM endpoints or move to private/provider-contracted endpoints.
- [ ] Final legal review of privacy wording.

## 4. App listing copy draft

Use factual, conservative wording. Avoid performance guarantees, unsupported automation claims, or comparisons to other apps.

### App name

```text
clever
```

### App card subtitle

```text
Plan local delivery routes from Shopify orders
```

### Short introduction

```text
Clever helps merchants turn Shopify orders into local delivery route plans. Select eligible orders, add them to a route plan, review stops on a map, adjust stop sequence, and assign a driver from one embedded Shopify Admin app.
```

### Feature bullets

```text
- Sync recent Shopify orders into a delivery planning table and map.
- Select orders and create route drafts by delivery date and area.
- View route lines, numbered stops, and route-stop tables on a map.
- Edit stop sequence and add or remove same-date orders from a route draft.
- Save pending driver phone numbers and assign a driver to a route.
- Configure a departure location for route planning.
```

### Suggested categories / search terms

Use only if they match available Partner Dashboard options:

```text
local delivery
route planning
delivery routes
order fulfillment
driver dispatch
```

### Pricing recommendation for this release

```text
Use a free plan for the current release unless Shopify Billing/App Pricing is configured before submission. Do not describe paid pricing until billing is implemented through Shopify-approved billing/pricing flows.
```

## 5. Reviewer testing instructions

Paste-ready reviewer notes:

```text
This app is embedded in Shopify Admin and is intended for local delivery planning.

Suggested test flow:
1. Install the app on a development store with orders that include shipping addresses, shipping recipient names, phone numbers, and delivery attributes such as Delivery Day and Delivery Area.
2. Open Apps > clever in Shopify Admin.
3. Go to Orders. Verify orders appear in the table and map. If protected customer data access is not yet approved on the review store, the app will show a protected-data access message instead of order rows.
4. Select several orders and click Add to plan. The selected pins should change color while staying the same size and should show centered sequence numbers.
5. Create a route draft from the selected planned orders.
6. Go to Routes and open the created route detail page.
7. Verify the route line, departure marker, numbered stop markers, blue snapped stop points, and stop sequence table appear.
8. Click Edit to adjust the route stop sequence or add/remove same-date orders, then save.
9. In the Driver control, enter or select a pending driver phone number and click Save driver.
10. Go to Settings, configure a departure location, preview geocoding on the map, and save.

Production URLs:
- Admin app URL: https://clever-admin.3-39-216-177.sslip.io
- Delivery API health: https://clever-delivery.3-39-216-177.sslip.io/healthz

Current released version:
- approval-20260514-174cfcc
```

Reviewer assets to attach or prepare:

- [ ] Short screencast covering Orders sync, Add to plan, route creation, route detail markers/stops, driver assignment, and departure-location settings.
- [ ] Test store with representative orders containing delivery dates/areas and shipping coordinates or geocodable shipping addresses.
- [ ] If required, temporary reviewer credentials/instructions that do not expose private production merchant data.

## 6. Automated checks runbook

Before pressing final Submit:

1. Confirm `shopify.app.toml` active version is `approval-20260514-174cfcc` or newer.
2. Run the Shopify App Store review page automated checks.
3. Open the embedded app in Shopify Admin and interact with Orders, Routes, Drivers, and Settings so automated checks can observe App Bridge/session-token behavior.
4. Confirm the app does not show browser console errors in the tested production flow.
5. Confirm the production admin page still includes:
   - `https://cdn.shopify.com/shopifycloud/app-bridge.js`
   - `<meta name="shopify-api-key" ...>`
6. Confirm compliance webhooks are configured for:
   - `customers/data_request`
   - `customers/redact`
   - `shop/redact`

## 7. Items that remain impossible to complete from the repository alone

- [ ] Protected customer data form submission in Partner Dashboard.
- [ ] Published privacy policy URL.
- [ ] App icon upload.
- [ ] Final support/API/emergency contact fields.
- [ ] Pricing selection in Partner Dashboard.
- [ ] Screencast upload.
- [ ] App Store review page automated checks.
- [ ] Final Submit for Review.
