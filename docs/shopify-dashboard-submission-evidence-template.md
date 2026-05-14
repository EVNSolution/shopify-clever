# Shopify Partner Dashboard Submission Evidence Template

_Last updated: 2026-05-14_

Use this template when completing EVNSolution/shopify-clever#6 and
EVNSolution/clever-change-control#211 (`chg-20260514-001`). Copy the completed
version into both issues before closing them. Do not include customer PII,
reviewer passwords, private app credentials, or screenshots that expose real
merchant/customer data.

## Submission identity

```text
Completed by: [AUTHORIZED PARTNER DASHBOARD ACCOUNT HOLDER]
Completion date: [YYYY-MM-DD]
Shopify app: clever
Partner Dashboard app id/name: [VALUE]
Target repo issue: EVNSolution/shopify-clever#6
Change-control issue: EVNSolution/clever-change-control#211
Change id: chg-20260514-001
Shopify app version release commit: 0d05a46295e499ffeb22d057b6b7e2ca789262de
Production web bundle commit: 16223b062079af5632b80d1bf08abd5bf775f0be
Production readiness evidence commit: a34bcdc36debe40c7241eca4d4eb770768498f96
Active Shopify app version: compliance-20260514-0d05a46
Active Shopify version ID: gid://shopify/Version/963177807873
Production readiness CI: https://github.com/EVNSolution/shopify-clever/actions/runs/25857865303
Production workflow evidence: https://github.com/EVNSolution/shopify-clever/actions/runs/25856190483
Detailed AI self-review PR CI: https://github.com/EVNSolution/shopify-clever/actions/runs/25857796867
```

## Final repository verification

Run immediately before dashboard submission and paste output summary:

```bash
npm run check:shopify-submission
shopify app config validate --json
shopify app versions list --json
```

Expected evidence:

```text
check:shopify-submission result: shopify-submission-readiness-ok, 104 checks
shopify app config validate result: valid=true, issues=[]
active Shopify app version: compliance-20260514-0d05a46 or newer
```

## Protected customer data request evidence

```text
Partner Dashboard protected customer data request submitted: [YES/NO]
Request status: [submitted/approved/needs changes]
Requested data categories: protected order/customer data, name, address, phone
Email requested: NO for current release
Reason email was not requested: Current Shopify order queries do not request email or customer profile objects.
Justification source: docs/shopify-protected-customer-data-field-map.md and docs/shopify-partner-dashboard-submission-packet.md
Dashboard evidence link or screenshot filename: [NON-PII FILE/LINK]
```

## Privacy policy publication evidence

```text
Privacy policy URL: [PUBLIC URL]
Legal company name inserted: [YES/NO]
Support/privacy email inserted: [YES/NO]
Emergency contact inserted: [YES/NO]
Retention period/deletion process inserted: [YES/NO]
Final legal/business approval recorded: [YES/NO]
Dashboard evidence link or screenshot filename: [NON-PII FILE/LINK]
```

## Listing copy evidence

```text
Listing copy source: docs/shopify-app-store-listing-draft.md
App name entered as: clever
Subtitle entered as: Plan local delivery routes from Shopify orders
Unsupported claims avoided: [YES/NO]
Paid pricing claims omitted unless Shopify Billing/App Pricing configured: [YES/NO]
Dashboard evidence link or screenshot filename: [NON-PII FILE/LINK]
```

## Pricing evidence

```text
Pricing selection: [free plan / Shopify Billing / Shopify App Pricing]
If paid: Shopify-approved billing/pricing configured: [YES/NO/NOT APPLICABLE]
Dashboard evidence link or screenshot filename: [NON-PII FILE/LINK]
```

## Media evidence

Use `docs/shopify-app-store-assets/screenshot-and-screencast-shotlist.md`.

```text
App icon uploaded: [YES/NO]
App icon source: docs/shopify-app-store-assets/clever-app-icon-1200.png
Screenshot set uploaded: [YES/NO]
Screenshot dimensions verified as 1600x900: [YES/NO]
Screencast uploaded: [YES/NO]
No customer PII visible in media: [YES/NO]
Dashboard evidence link or screenshot filename: [NON-PII FILE/LINK]
```

## Contact and reviewer evidence

```text
Support contact entered: [YES/NO]
API contact entered: [YES/NO]
Emergency developer contact entered: [YES/NO]
Review contact entered: [YES/NO]
Reviewer instructions entered from docs/shopify-partner-dashboard-submission-packet.md: [YES/NO]
Reviewer credentials required: [NO / YES, stored outside issue]
app-submissions@shopify.com allowlisted: [YES/NO]
noreply@shopify.com allowlisted: [YES/NO]
Dashboard evidence link or screenshot filename: [NON-PII FILE/LINK]
```

## Automated checks evidence

```text
Shopify App Store automated checks run: [YES/NO]
Automated checks result: [pass/fail]
Embedded app opened in Shopify Admin before checks: [YES/NO]
Orders/Routes/Drivers/Settings flow interacted with before checks: [YES/NO]
Browser console checked for production flow errors: [YES/NO]
Dashboard evidence link or screenshot filename: [NON-PII FILE/LINK]
```

## Final Submit for Review evidence

```text
Submit for Review pressed: [YES/NO]
Submission timestamp: [YYYY-MM-DD HH:MM TZ]
Resulting app review state: [submitted/reviewed/published/needs changes]
Shopify confirmation/reference: [VALUE]
Dashboard evidence link or screenshot filename: [NON-PII FILE/LINK]
```

## Closure checklist

- [ ] Paste this completed evidence template into EVNSolution/shopify-clever#6.
- [ ] Paste or link the same evidence from EVNSolution/clever-change-control#211.
- [ ] Confirm no secrets, credentials, customer PII, or private merchant data were posted.
- [ ] Close EVNSolution/shopify-clever#6 only after Submit for Review evidence is recorded.
- [ ] Close EVNSolution/clever-change-control#211 only after target issue #6 is closed or explicitly handed off.
