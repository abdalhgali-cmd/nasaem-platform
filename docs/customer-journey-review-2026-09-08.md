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


## Follow-up implementation — request recovery

- Contact, hotel and ferry forms now share a confirmation with the real returned reference, copy support (including manual-copy fallback), next steps, and a direct tracking link. Confirmation explains that tracking uses the original phone plus WhatsApp verification and that submission is not a confirmed booking/payment.
- Responses without a valid request ID never show success. HTML/proxy failures and interrupted requests preserve entered values and suggest checking tracking before retrying. Pending submissions are locked against repeated clicks and time out after 30 seconds.
- Hotel/ferry service catalog loading now handles missing services, HTTP errors and timeout, provides retry without remounting the form, and links to Contact. Validation and mobile phone input hints were improved; date constraints follow the customer's local date without a server/client timezone mismatch.
- Corrected the existing wizard confirmation, which previously said to track by request number even though tracking authenticates by phone.
- Added five response-boundary unit tests and five mobile browser regression cases. Wired the previously excluded p0-request-ux spec and the new service-requests spec into the existing platform3 CI project.

### Updated infrastructure evidence

Authenticated Vercel fetch returned HTTP 402, `DEPLOYMENT_DISABLED`, for the existing integration Preview. Deployment metadata still reports READY, which is build state, not proof that the app is accessible. No billing or infrastructure changes made.

A read-only OPTIONS request to the Staging contact-request endpoint returned 204 with credentials enabled and the exact integration Preview origin allowed. That origin's preflight passed; this does not certify login/session behavior or CORS for a new branch alias.

Local browser verification was attempted but the browser rejected localhost with `ERR_BLOCKED_BY_CLIENT`. No alternative browser/network path was used. Local unit tests, TypeScript, changed-file ESLint and production build passed; browser regression results require CI. Full live Staging, database isolation/persistence and approved legal content remain launch blockers.
