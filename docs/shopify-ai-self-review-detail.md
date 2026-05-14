# Shopify AI Self-Review Detail

_Last audited: 2026-05-14_

## Source and scope

- Source of truth: https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements
- The source was fetched during the final approval audit and contained **100 local-codebase requirements** across **16 groups**.
- This document records the local-codebase portion only. Shopify still reviews live app behavior, Partner Dashboard fields, app listing content, media, pricing, and support/contact fields after submission.

## Summary

| Status | Count | Meaning |
| --- | ---: | --- |
| Likely passing | 27 | Code/config evidence supports the requirement for the current release. |
| Likely failing | 0 | No clear local-code violation found. |
| Needs review | 4 | Cannot be completed or fully verified from the repository alone. |
| Groups skipped | 10 | Category-specific groups without the triggering extension/configuration signal, or opt-in groups not requested. |

## Evaluated local-code requirements

| Requirement | Status | Local evidence / required follow-up |
| --- | --- | --- |
| 1.1.1 Use session tokens for authentication | Likely passing | Embedded admin routes use `authenticate.admin(request)`; client delivery actions use `useAppBridge().idToken()`; root renders App Bridge CDN and API-key meta. |
| 1.1.2 Use Shopify checkout | Likely passing | No offsite checkout, payment processing, or order-creation bypass code found; app reads Shopify orders for route planning only. |
| 1.1.3 Direct merchants to the Shopify Theme Store | Likely passing | No Theme API/Asset API/theme-download workflow; no theme app extension. |
| 1.1.4 Use only factual information | Needs review | Repository listing draft avoids unsupported claims, but final Partner Dashboard listing copy/media must be checked before submission. Evidence must be attached to EVNSolution/shopify-clever#6. |
| 1.1.6 Build single-merchant storefronts. Marketplaces should be sales channels | Likely passing | App is an embedded admin delivery-route planner for one merchant's orders; no marketplace/classifieds workflow. |
| 1.1.7 Always build Payment Gateway apps using the Payments API and after obtaining authorization | Likely passing | No payment extension or payment gateway scope. |
| 1.1.8 Build apps for Shopify POS only, not third-party systems | Likely passing | No POS extension/integration signal; app surfaces are Shopify Admin and delivery API. |
| 1.1.9 Obtain explicit buyer consent before adding charges | Likely passing | App does not add buyer charges or alter order totals. |
| 1.1.10 Maintain the cheapest shipping option as default | Likely passing | App does not create or modify checkout shipping rates. |
| 1.1.13 Duplicate only authorized product information | Likely passing | App reads order line item labels for delivery operations; no product copying/duplication workflow. |
| 1.1.14 Don't connect merchants to external agencies and developers | Likely passing | No agency/developer marketplace, referral, or brokering flow. |
| 1.1.15 Process refunds only through the original payment processor | Likely passing | No refund-processing code. |
| 1.1.16 Don't provide capital lending | Likely passing | No lending/financing workflow. |
| 1.2.1 Use Shopify App Pricing or the Shopify Billing API | Needs review | No off-platform billing found. If the app is paid, pricing must be configured through Shopify App Pricing or Billing API; otherwise select a free plan in Partner Dashboard. |
| 1.2.2 Implement Shopify App Pricing or the Shopify Billing API correctly | Needs review | No billing implementation exists in repo. Final dashboard pricing choice determines applicability. |
| 1.2.3 Allow pricing plan changes | Needs review | No in-app paid plans exist. If paid pricing is configured, plan-change behavior must be verified in Partner Dashboard/app billing setup. |
| 2.2.1 Use Shopify APIs | Likely passing | App uses Shopify React Router auth, Admin GraphQL order/location queries, and Shopify webhooks. |
| 2.2.3 Use the latest version of Shopify App Bridge | Likely passing | `apps/shopify-app/app/root.jsx` includes `https://cdn.shopify.com/shopifycloud/app-bridge.js` in the document head plus `shopify-api-key` meta. |
| 2.2.4 Use the GraphQL Admin API | Likely passing | Order/location reads use GraphQL modules; no REST Admin `.json` endpoint usage found in app code. |
| 2.2.6 Don't display promotions or advertisements in admin extensions | Likely passing | No admin UI extension configuration found. |
| 2.2.7 Only launch Max modal with merchant interaction | Likely passing | No Max modal/fullscreen launch code found. |
| 2.3.1 Initiate installation from a Shopify-owned surface | Likely passing | Auth flow uses Shopify React Router helpers; `/auth/login` no longer renders a manual shop-domain form. |
| 2.3.2 Authenticate immediately after install | Likely passing | Protected app route loaders/actions call `authenticate.admin(request)` before UI/data access. |
| 2.3.3 Redirect to the app UI after installation | Likely passing | App root redirects into `/app`; app shell renders embedded admin UI after authentication. |
| 2.3.4 Require OAuth authentication immediately after reinstall | Likely passing | Reinstall and callback routes use Shopify React Router authentication helpers. |
| 3.1.1 Use a valid TLS/SSL certificate | Likely passing | Production app URL is HTTPS: `https://clever-admin.3-39-216-177.sslip.io`; production smoke for `/auth/login` returned 200. |
| 3.2.1 Request read_all_orders access scope only if it provides necessary app functionality | Likely passing | `shopify.app.toml` scopes are only `read_orders,read_locations`; `read_all_orders` is not requested. |
| 3.2.2 Request write_payment_mandate scope only if it provides necessary app functionality | Likely passing | Scope is not requested. |
| 3.2.3 Request write_checkout_extensions_apis scope only if it provides necessary app functionality | Likely passing | Scope is not requested. |
| 3.2.4 Request read_advanced_dom_pixel_events scope only if it provides necessary app functionality | Likely passing | Scope is not requested. |
| 3.2.5 Request read_checkout_extensions_chat scope only when required | Likely passing | Scope is not requested. |

## Skipped groups

| Group | Requirement count | Reason skipped |
| --- | ---: | --- |
| 5.1 Online store | 3 | No `shopify.extension.toml` with `type = "theme"`; no theme app extension. |
| 5.2 Payment | 8 | No payment extension and no `write_payment_gateway` scope. |
| 5.3 Payment facilitator | 1 | Opt-in group; not requested and no payment facilitator signal. |
| 5.4 Purchase option | 16 | No subscription, payment mandate, or protected purchase-option scopes. |
| 5.5 Product sourcing | 3 | Opt-in group; not requested and no dropshipping/product-sourcing signal. |
| 5.6 Checkout customization | 6 | No checkout UI extension targets. |
| 5.7 Sales channel | 14 | No `channel_config` extension. |
| 5.8 Post purchase | 10 | No `checkout_post_purchase` extension. |
| 5.9 Mobile app builders | 2 | Opt-in group; not requested and no mobile app builder signal. |
| 5.10 Donation | 6 | Opt-in group; not requested and no donation app signal. |

Skipped requirement count: **69**. Evaluated requirement count: **31**. Total: **100**.

## Dashboard-only follow-up

Before closing EVNSolution/shopify-clever#6 or EVNSolution/clever-change-control#211, paste completed evidence from `docs/shopify-dashboard-submission-evidence-template.md` showing:

- factual listing copy/media entered;
- free plan/pricing or Shopify-approved billing configured;
- protected customer data request submitted for protected order data, name, address, and phone only;
- final privacy policy URL published and entered;
- automated checks passed;
- final **Submit for Review** completed.
