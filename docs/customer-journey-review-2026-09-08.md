# Customer journey review — 8 September 2026

Reviewed candidate: `ba1ab4cb9d1e91513b1ea596f230b270c7fb9782`, PR #59, open and Draft. This review does not certify launch readiness.

## Current blocker

The PR-linked Vercel Preview displayed **This deployment is temporarily paused** in the browser. The cause was not established. End-to-end Staging tests and visual verification could not run against this deployment. Restore the Preview through the project owner's existing Vercel account; investigate the reported pause before making any billing change.

## Implemented in this branch

- Replace the homepage search form with up to six direct service choices, populated only from the active public catalog. Prioritize Umrah, Egypt security approval, flights, family visits, ferries, and hotels. Preserve the shared service URL resolver and the complete catalog below.
- The removed homepage form previously collected dates/guests before navigation. For example, HotelRequestClient initializes its own defaults and does not consume those query parameters. Starting on the actual service page avoids asking the customer to enter that information twice.
- Use agency-wide introductory copy; preserve administrator-controlled hero content and CTA settings.
- Point default start buttons to the service catalog instead of Contact. Close the mobile sheet when choosing that CTA, including on same-page anchor navigation.
- Show tracking directly in the mobile header and service picker.
- Provide customer-facing contact guidance when service data is unavailable, replacing internal admin instructions. No claim that the agency has stopped providing services.

## Remaining work, in order

| Priority | Finding / requirement | Completion evidence |
| --- | --- | --- |
| P0 | Preview paused | Preview loads and is paired with the isolated Staging API; no Production API fallback |
| P0 | Earlier CORS/hydration issues are not verified as resolved here | Browser loads without hydration errors; credentialed requests from actual Preview succeed |
| P0 | Privacy and terms routes still render LegalPlaceholder | Owner-approved content describing actual data handling and service terms is published; related disclosure text updated consistently |
| P0 | Full Staging journey remains unverified | Test request → tracking → upload → staff review → customer update → deliverable download |
| P0 | Isolation and persistence remain unverified | Customer A cannot read B; employee/provider RBAC confirmed; upload survives restart; backup/restore and rollback evidence recorded |
| P1 | Homepage remains long with service/product sections repeated | Review mobile screenshots and navigation at 320/375/768/1024px; decide which promotional sections to condense while preserving useful service links |
| P1 | Service-page consistency | Each service clearly states required documents, currency, price basis, expected processing time where supported, next step, and availability caveat; use configured data, not invented prices or promises |
| P1 | Submission recovery | Verify preserved input on failure, disabled duplicate submit, actionable errors, confirmation with reference number and working tracking link |
| P1 | Trust content | Verify agency contact/address, office images, and genuine customer testimonials; avoid unverified claims |

## Validation scope

TypeScript, ESLint for all four changed TSX components, and the Next.js production build passed (53 pages generated). Build used the default local API setting, with no live backend; this validates compilation and fallback rendering only. No database, authentication, upload, infrastructure, billing, or Production settings changed. A successful compile does not replace visual or Staging workflow verification. Keep this PR and #59 in Draft until the relevant evidence is available.
